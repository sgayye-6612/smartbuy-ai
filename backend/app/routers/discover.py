"""Personalised recommendations and checkout handoff."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..integrations.adapters import get_adapter
from ..models import Comparison, Listing, Product, SearchHistory, User
from ..security import get_optional_user
from ..services.filters import CATEGORY_LABELS, ListingFilter
from ..services.queries import average_prices, group_by_product, listings_for, product_out

router = APIRouter(prefix="/api", tags=["Discover & Checkout"])


@router.get("/recommendations")
def recommendations(delivery: str | None = None, user: User | None = Depends(get_optional_user),
                    db: Session = Depends(get_db)):
    flt = ListingFilter(user, delivery)
    products = list(db.scalars(select(Product)))
    by_pid = group_by_product(listings_for(db, [p.id for p in products], flt))
    avg = average_prices(db)

    scored = []
    for p in products:
        ls = [l for l in by_pid.get(p.id, []) if l.in_stock]
        if not ls or p.id not in avg:
            continue
        low = min(ls, key=lambda l: l.price)
        drop_pct = (avg[p.id] - low.price) / avg[p.id] * 100
        item = product_out(p, ls) | {"deal_pct": round(drop_pct, 1),
                                     "best_is_favorite": flt.is_favorite(low)}
        scored.append(item)
    scored.sort(key=lambda x: -x["deal_pct"])

    # Which categories does this user care about? (saved preferences + what they search/compare)
    interest: dict[str, int] = {}
    if user:
        for pref in user.platform_prefs:
            interest[pref.category] = interest.get(pref.category, 0) + 2
        for c in db.scalars(select(Comparison).where(Comparison.user_id == user.id).limit(50)):
            interest[c.product.category] = interest.get(c.product.category, 0) + 3

    for_you = []
    for cat, _ in sorted(interest.items(), key=lambda kv: -kv[1]):
        picks = [s for s in scored if s["category"] == cat][:2]
        for pick in picks:
            reason = (f"Best price is on your preferred platform ({pick['lowest_platform']})" if pick["best_is_favorite"]
                      else f"{pick['deal_pct']:.0f}% below its 30-day average" if pick["deal_pct"] > 0
                      else f"Popular in {CATEGORY_LABELS.get(cat, cat)}")
            for_you.append(pick | {"reason": reason})
    recent = []
    if user:
        recent = [h.query for h in db.scalars(select(SearchHistory).where(SearchHistory.user_id == user.id)
                                              .order_by(SearchHistory.id.desc()).limit(6))]
    return {
        "for_you": for_you[:8],
        "top_deals": [s for s in scored if s["deal_pct"] > 0][:8],
        "recent_searches": list(dict.fromkeys(recent)),
        "personalised": bool(interest),
    }


class CheckoutIn(BaseModel):
    listing_id: int


@router.post("/checkout")
def checkout(body: CheckoutIn, db: Session = Depends(get_db)):
    """Option A (direct purchase) runs only if the platform's adapter has an authorised
    integration. Otherwise Option B: hand the user off to the platform. Never fakes an order."""
    listing = db.scalar(select(Listing).options(joinedload(Listing.platform), joinedload(Listing.product))
                        .where(Listing.id == body.listing_id))
    if not listing:
        raise HTTPException(404, "Listing not found")
    p = listing.product
    query = " ".join(x for x in [p.brand, p.name, p.variant or ""] if x)
    handoff = get_adapter(listing.platform).checkout(query)
    return {"mode": handoff.mode, "url": handoff.url, "platform": handoff.platform,
            "link_precision": handoff.link_precision, "message": handoff.message, "order_placed": False}
