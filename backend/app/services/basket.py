"""Smart basket optimisation.

Question: buy everything on one platform, or split across platforms?
Splitting can lower item prices but adds extra delivery/platform fees.

Approach: try every combination (subset) of candidate platforms. Inside each
subset, buy each item where it is cheapest, then add each platform's fees.
With at most 12 candidate platforms that is <= 4,095 subsets, which is fast.

Food is special: Swiggy/Zomato orders are placed per restaurant, so dishes
from two restaurants on the same app become two orders, each with its own fees.
"""
from itertools import combinations

from ..models import Listing, Platform
from .comparison import fees_for_subtotal

MAX_PLATFORMS = 12


def _restaurant(l: Listing) -> str | None:
    product = getattr(l, "product", None)
    return product.brand if product is not None and product.category == "food" else None


def _orders_for(platform: Platform, lines: list[tuple[Listing, int]]) -> list[dict]:
    """One order per platform, or one per restaurant for food apps."""
    groups: dict[str | None, list[tuple[Listing, int]]] = {}
    for l, q in lines:
        groups.setdefault(_restaurant(l), []).append((l, q))
    return [_order_cost(platform, g, restaurant) for restaurant, g in groups.items()]


def _order_cost(platform: Platform, lines: list[tuple[Listing, int]], restaurant: str | None = None) -> dict:
    subtotal = sum(l.price * q for l, q in lines)
    fees = fees_for_subtotal(platform, subtotal)
    return {
        "platform": {"id": platform.id, "name": platform.name, "slug": platform.slug},
        "restaurant": restaurant,
        "checkout_verb": "Order on" if restaurant else "Buy on",
        "items": [
            {
                "product_id": l.product_id,
                "title": l.title,
                "price": l.price,
                "quantity": q,
                "line_total": round(l.price * q, 2),
                "url": l.url,
            }
            for l, q in lines
        ],
        "subtotal": round(subtotal, 2),
        **fees,
    }


def _plan(orders: list[dict]) -> dict:
    return {
        "orders": orders,
        "items_total": round(sum(o["subtotal"] for o in orders), 2),
        "fees_total": round(sum(o["delivery_fee"] + o["platform_fee"] for o in orders), 2),
        "coupons_total": round(sum(o["coupon_discount"] for o in orders), 2),
        "total": round(sum(o["total"] for o in orders), 2),
        "platform_count": len(orders),
    }


def optimize(items: list[tuple[int, int]], listings: list[Listing]) -> dict:
    """items: [(product_id, quantity)]. listings: all in-stock listings for those products."""
    by_product: dict[int, list[Listing]] = {}
    for l in listings:
        if l.in_stock:
            by_product.setdefault(l.product_id, []).append(l)

    missing = [pid for pid, _ in items if pid not in by_product]
    items = [(pid, q) for pid, q in items if pid in by_product]
    if not items:
        return {"single_platform_options": [], "best_single": None, "best_split": None,
                "recommendation": None, "savings_vs_single": 0, "missing_product_ids": missing}

    platforms: dict[int, Platform] = {}
    counts: dict[int, int] = {}
    for pid, _ in items:
        for l in by_product[pid]:
            platforms[l.platform_id] = l.platform
            counts[l.platform_id] = counts.get(l.platform_id, 0) + 1

    # 1) Everything from a single platform
    singles = []
    for plat_id, plat in platforms.items():
        lines = []
        for pid, q in items:
            l = next((x for x in by_product[pid] if x.platform_id == plat_id), None)
            if l is None:
                break
            lines.append((l, q))
        else:
            singles.append(_plan(_orders_for(plat, lines)))
    singles.sort(key=lambda p: p["total"])

    # 2) Best split across platforms
    candidates = sorted(platforms, key=lambda pid: -counts[pid])[:MAX_PLATFORMS]
    best_split = None
    for size in range(1, len(candidates) + 1):
        for subset in combinations(candidates, size):
            chosen: dict[int, list[tuple[Listing, int]]] = {}
            ok = True
            for pid, q in items:
                options = [l for l in by_product[pid] if l.platform_id in subset]
                if not options:
                    ok = False
                    break
                cheapest = min(options, key=lambda l: l.price)
                chosen.setdefault(cheapest.platform_id, []).append((cheapest, q))
            if not ok:
                continue
            plan = _plan([o for plat_id, lines in chosen.items() for o in _orders_for(platforms[plat_id], lines)])
            if best_split is None or plan["total"] < best_split["total"]:
                best_split = plan

    best_single = singles[0] if singles else None
    if best_single and (best_split is None or best_split["total"] >= best_single["total"] - 0.01):
        recommendation = {"type": "single", "plan": best_single,
                          "message": f"Buy everything from {best_single['orders'][0]['platform']['name']}. "
                                     "Splitting the order would not save money once delivery fees are added."}
        savings = 0.0
    else:
        savings = round(best_single["total"] - best_split["total"], 2) if best_single else 0.0
        names = ", ".join(dict.fromkeys(o["platform"]["name"] for o in best_split["orders"]))
        msg = f"Split the order across {names}."
        if best_single:
            msg += f" This saves ₹{savings:.0f} compared to the best single platform, even after extra fees."
        else:
            msg += " No single platform stocks every item."
        recommendation = {"type": "split", "plan": best_split, "message": msg}

    return {
        "single_platform_options": singles,
        "best_single": best_single,
        "best_split": best_split,
        "recommendation": recommendation,
        "savings_vs_single": savings,
        "missing_product_ids": missing,
    }
