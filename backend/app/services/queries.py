"""Shared database helpers used by several routers."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from ..integrations.adapters import get_adapter
from ..models import Listing, PriceHistory, Product
from .comparison import build_offer, rank_offers
from .filters import ListingFilter
from .matching import format_size


def listings_for(db: Session, product_ids: list[int], flt: ListingFilter | None = None) -> list[Listing]:
    if not product_ids:
        return []
    stmt = (
        select(Listing)
        .options(joinedload(Listing.platform), joinedload(Listing.product))
        .where(Listing.product_id.in_(product_ids))
    )
    rows = list(db.scalars(stmt).unique())
    return [l for l in rows if flt is None or flt(l)]


def group_by_product(listings: list[Listing]) -> dict[int, list[Listing]]:
    out: dict[int, list[Listing]] = {}
    for l in listings:
        out.setdefault(l.product_id, []).append(l)
    return out


def product_out(p: Product, listings: list[Listing] | None = None) -> dict:
    size = format_size(p)
    data = {
        "id": p.id,
        "brand": p.brand,
        "name": p.name,
        "variant": p.variant,
        "size": size,
        "size_value": p.size_value,
        "size_unit": p.size_unit,
        "category": p.category,
        "subcategory": p.subcategory,
        "veg": p.veg,
        "barcode": p.barcode,
        "emoji": p.emoji,
        "description": p.description,
        "display_name": (f"{p.name}{' (' + p.variant + ')' if p.variant else ''} · {p.brand}" if p.category == "food"
                         else " ".join(x for x in [p.brand, p.name, p.variant or "", size] if x)),
    }
    if listings is not None:
        in_stock = [l for l in listings if l.in_stock]
        best = min(in_stock, key=lambda l: l.price, default=None)
        data["lowest_price"] = best.price if best else None
        data["lowest_platform"] = best.platform.name if best else None
        data["mrp"] = max((l.mrp for l in listings), default=None)
        data["platform_count"] = len({l.platform_id for l in listings})
        data["fastest_mins"] = min((l.delivery_mins for l in in_stock), default=None)
    return data


def compare_product(db: Session, product: Product, flt: ListingFilter, quantity: int = 1) -> dict:
    every = listings_for(db, [product.id])
    allowed = [l for l in every if flt(l)]
    offers = []
    for l in allowed:
        o = build_offer(l, quantity)
        adapter = get_adapter(l.platform)
        o["is_favorite"] = flt.is_favorite(l)
        o["checkout"] = {"verb": adapter.checkout_verb, "direct": adapter.supports_direct_checkout, "mode": adapter.mode}
        offers.append(o)
    result = rank_offers(offers)
    result["product"] = product_out(product, allowed)
    result["compared_platforms"] = len(offers)
    result["hidden_by_filters"] = len(every) - len(allowed)
    result["delivery_preference"] = flt.delivery

    fav = next((o for o in offers if o["is_favorite"] and o["in_stock"]), None)
    note = None
    if fav and result["best"]:
        diff = fav["final_price"] - result["best"]["final_price"]
        if fav is result["best"]:
            note = f"Your preferred platform, {fav['platform']['name']}, is also the best deal here."
        elif diff > 0:
            note = (f"Your preferred {fav['platform']['name']} is ₹{diff:.0f} more. "
                    f"{result['best']['platform']['name']} is the better deal this time.")
        else:
            note = f"{fav['platform']['name']} (your preferred) matches the best price."
    result["favorite_note"] = note
    return result


def price_stats(db: Session, product_id: int, days: int = 30) -> dict:
    """Daily lowest price across platforms, plus average/min over the period."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(
        select(PriceHistory.price, PriceHistory.recorded_at)
        .join(Listing, Listing.id == PriceHistory.listing_id)
        .where(Listing.product_id == product_id, PriceHistory.recorded_at >= since)
    ).all()
    daily: dict[str, float] = {}
    for price, at in rows:
        day = at.date().isoformat()
        daily[day] = min(price, daily.get(day, price))
    series = [{"date": d, "lowest_price": round(v, 2)} for d, v in sorted(daily.items())]
    prices = [s["lowest_price"] for s in series]
    return {
        "series": series,
        "average": round(sum(prices) / len(prices), 2) if prices else None,
        "lowest": min(prices) if prices else None,
        "highest": max(prices) if prices else None,
    }


def average_prices(db: Session, days: int = 30) -> dict[int, float]:
    """30-day average listed price per product (one query, used for deal scores)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = db.execute(
        select(Listing.product_id, func.avg(PriceHistory.price))
        .join(PriceHistory, PriceHistory.listing_id == Listing.id)
        .where(PriceHistory.recorded_at >= since)
        .group_by(Listing.product_id)
    ).all()
    return {pid: float(avg) for pid, avg in rows}


def deal_verdict(current: float, stats: dict) -> dict:
    avg, low = stats["average"], stats["lowest"]
    if avg is None:
        return {"verdict": "unknown", "message": "Not enough price history yet."}
    diff_pct = round((avg - current) / avg * 100, 1)
    if current <= low * 1.01:
        verdict, msg = "great", "Lowest price in the last 30 days."
    elif diff_pct >= 3:
        verdict, msg = "good", f"{diff_pct}% below the 30-day average."
    elif diff_pct > -3:
        verdict, msg = "fair", "About the usual price for this product."
    else:
        verdict, msg = "wait", f"{abs(diff_pct)}% above the 30-day average. Consider a price alert."
    return {"verdict": verdict, "message": msg, "average_30d": avg, "lowest_30d": low, "current": current}
