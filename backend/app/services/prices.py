"""Price refresh + price-drop alerts.

With sample data, "refreshing" simulates small market price movements so the
alerts and price-history features can be demonstrated. When a real data feed
is connected, replace `_new_price` with the fetched price.
"""
import random

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Alert, Listing, PriceHistory, WishlistItem, utcnow


def _new_price(listing: Listing, rng: random.Random) -> float:
    change = rng.uniform(-0.08, 0.05)
    price = listing.price * (1 + change)
    price = max(listing.mrp * 0.5, min(listing.mrp, price))
    return round(price)


def refresh_prices(db: Session, seed: int | None = None) -> dict:
    rng = random.Random(seed)
    listings = list(db.scalars(select(Listing)))
    old_lowest: dict[int, float] = {}
    for l in listings:
        if l.in_stock:
            old_lowest[l.product_id] = min(l.price, old_lowest.get(l.product_id, l.price))

    now = utcnow()
    for l in listings:
        l.price = _new_price(l, rng)
        l.updated_at = now
        db.add(PriceHistory(listing_id=l.id, price=l.price, recorded_at=now))

    new_lowest: dict[int, float] = {}
    for l in listings:
        if l.in_stock:
            new_lowest[l.product_id] = min(l.price, new_lowest.get(l.product_id, l.price))

    alerts = 0
    for w in db.scalars(select(WishlistItem)):
        new, old = new_lowest.get(w.product_id), old_lowest.get(w.product_id)
        if new is None:
            continue
        name = f"{w.product.brand} {w.product.name}"
        message = None
        if w.target_price and new <= w.target_price:
            message = f"{name} is now ₹{new:.0f}, at or below your target of ₹{w.target_price:.0f}."
        elif old and new <= old * 0.95:
            message = f"{name} dropped from ₹{old:.0f} to ₹{new:.0f}."
        if message:
            db.add(Alert(user_id=w.user_id, product_id=w.product_id, message=message))
            alerts += 1

    db.commit()
    return {"listings_updated": len(listings), "alerts_created": alerts}
