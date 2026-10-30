"""Module 8: wishlist, price alerts, price refresh."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Alert, Product, User, WishlistItem
from ..schemas import WishlistIn
from ..security import get_current_user
from ..services.prices import refresh_prices
from ..services.queries import listings_for, product_out

router = APIRouter(prefix="/api", tags=["Wishlist & Alerts"])


@router.get("/wishlist")
def get_wishlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = list(db.scalars(select(WishlistItem).where(WishlistItem.user_id == user.id).order_by(WishlistItem.id.desc())))
    listings = listings_for(db, [i.product_id for i in items])
    by_pid: dict[int, list] = {}
    for l in listings:
        by_pid.setdefault(l.product_id, []).append(l)
    out = []
    for i in items:
        p = product_out(i.product, by_pid.get(i.product_id, []))
        out.append({"id": i.id, "target_price": i.target_price, "product": p,
                    "target_reached": bool(i.target_price and p["lowest_price"] and p["lowest_price"] <= i.target_price)})
    return out


@router.post("/wishlist", status_code=201)
def add_to_wishlist(body: WishlistIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(Product, body.product_id):
        raise HTTPException(404, "Product not found")
    item = db.scalar(select(WishlistItem).where(WishlistItem.user_id == user.id,
                                                WishlistItem.product_id == body.product_id))
    if item:
        item.target_price = body.target_price
    else:
        item = WishlistItem(user_id=user.id, product_id=body.product_id, target_price=body.target_price)
        db.add(item)
    db.commit()
    return {"id": item.id, "target_price": item.target_price}


@router.delete("/wishlist/{item_id}", status_code=204)
def remove_from_wishlist(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(WishlistItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Wishlist item not found")
    db.delete(item)
    db.commit()


@router.get("/alerts")
def get_alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Alert).where(Alert.user_id == user.id).order_by(Alert.id.desc()).limit(50))
    return [{"id": a.id, "product_id": a.product_id, "message": a.message, "is_read": a.is_read,
             "created_at": a.created_at.isoformat()} for a in rows]


@router.post("/alerts/{alert_id}/read")
def mark_read(alert_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if not alert or alert.user_id != user.id:
        raise HTTPException(404, "Alert not found")
    alert.is_read = True
    db.commit()
    return {"ok": True}


@router.post("/prices/refresh")
def refresh(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Simulates a price update across all sample listings and creates alerts.
    In production this would run on a schedule (e.g. Celery beat or a cron job)."""
    return refresh_prices(db)
