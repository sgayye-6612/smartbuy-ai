"""Price comparison engine.

Works out the real amount you'd pay on each platform (price + delivery +
platform fee - coupon) and recommends the best OVERALL option, not just the
lowest sticker price.
"""
from ..models import Listing, Platform

# How much each factor matters in the recommendation (adds up to 1.0)
WEIGHT_PRICE = 0.6
WEIGHT_SPEED = 0.2
WEIGHT_RELIABILITY = 0.2


def fees_for_subtotal(platform: Platform, subtotal: float) -> dict:
    """Delivery fee, platform fee and coupon for an order of `subtotal` on `platform`."""
    free = platform.free_delivery_above is not None and subtotal >= platform.free_delivery_above
    delivery = 0.0 if free else platform.delivery_fee
    coupon = 0.0
    if platform.coupon_percent and subtotal >= platform.coupon_min_order:
        coupon = subtotal * platform.coupon_percent / 100
        if platform.coupon_max is not None:
            coupon = min(coupon, platform.coupon_max)
    total = subtotal + delivery + platform.platform_fee - coupon
    return {
        "delivery_fee": round(delivery, 2),
        "platform_fee": round(platform.platform_fee, 2),
        "coupon_discount": round(coupon, 2),
        "coupon_code": platform.coupon_code if coupon else None,
        "total": round(total, 2),
    }


def build_offer(listing: Listing, quantity: int = 1) -> dict:
    p = listing.platform
    subtotal = listing.price * quantity
    fees = fees_for_subtotal(p, subtotal)
    return {
        "listing_id": listing.id,
        "platform": {"id": p.id, "name": p.name, "slug": p.slug, "reliability": p.reliability},
        "title": listing.title,
        "mrp": listing.mrp,
        "price": listing.price,
        "discount_percent": round((1 - listing.price / listing.mrp) * 100) if listing.mrp else 0,
        "quantity": quantity,
        "subtotal": round(subtotal, 2),
        **fees,
        "final_price": fees["total"],
        "delivery_mins": listing.delivery_mins,
        "delivery_type": p.delivery_type,
        "in_stock": listing.in_stock,
        "seller_rating": listing.seller_rating,
        "url": listing.url,
        "data_source": listing.data_source,
        "updated_at": listing.updated_at.isoformat() if listing.updated_at else None,
    }


def rank_offers(offers: list[dict]) -> dict:
    """Score in-stock offers and pick best overall + cheapest."""
    available = [o for o in offers if o["in_stock"]]
    if not available:
        for o in offers:
            o["score"] = 0
        return {"offers": offers, "best": None, "cheapest": None, "savings": 0, "reasons": []}

    min_price = min(o["final_price"] for o in available)
    min_mins = min(o["delivery_mins"] for o in available) or 1
    for o in offers:
        if not o["in_stock"]:
            o["score"] = 0
            continue
        price_score = min_price / o["final_price"]
        speed_score = min_mins / max(o["delivery_mins"], 1)
        rel = o["platform"]["reliability"] * min(o["seller_rating"] / 5, 1)
        o["score"] = round(
            100 * (WEIGHT_PRICE * price_score + WEIGHT_SPEED * speed_score + WEIGHT_RELIABILITY * rel), 1
        )

    offers.sort(key=lambda o: (-o["score"], o["final_price"]))
    best = offers[0]
    cheapest = min(available, key=lambda o: o["final_price"])
    highest = max(o["final_price"] for o in available)

    reasons = []
    if best is cheapest:
        reasons.append("Lowest final price after fees and coupons")
    else:
        diff = best["final_price"] - cheapest["final_price"]
        reasons.append(
            f"Only ₹{diff:.0f} more than the cheapest ({cheapest['platform']['name']}), "
            "but scores better on delivery speed and reliability"
        )
    if best["delivery_mins"] == min_mins:
        reasons.append("Fastest delivery")
    if best["coupon_discount"]:
        reasons.append(f"Coupon {best['coupon_code']} saves ₹{best['coupon_discount']:.0f}")
    if best["delivery_fee"] == 0:
        reasons.append("Free delivery")

    return {
        "offers": offers,
        "best": best,
        "cheapest": cheapest,
        "savings": round(highest - best["final_price"], 2),
        "reasons": reasons,
    }
