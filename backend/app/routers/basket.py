"""Module 7: smart basket."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import BasketItem, Product, User
from ..schemas import BasketAddIn, BasketUpdateIn
from ..security import get_current_user
from ..services.basket import optimize
from ..services.filters import ListingFilter
from ..services.queries import listings_for, product_out

router = APIRouter(prefix="/api/basket", tags=["Smart Basket"])


def _items(db: Session, user: User) -> list[BasketItem]:
    return list(db.scalars(select(BasketItem).where(BasketItem.user_id == user.id).order_by(BasketItem.id)))


@router.get("")
def get_basket(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [{"id": i.id, "quantity": i.quantity, "product": product_out(i.product)} for i in _items(db, user)]


@router.post("", status_code=201)
def add_item(body: BasketAddIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(Product, body.product_id):
        raise HTTPException(404, "Product not found")
    item = db.scalar(select(BasketItem).where(BasketItem.user_id == user.id, BasketItem.product_id == body.product_id))
    if item:
        item.quantity = min(50, item.quantity + body.quantity)
    else:
        item = BasketItem(user_id=user.id, product_id=body.product_id, quantity=body.quantity)
        db.add(item)
    db.commit()
    return {"id": item.id, "quantity": item.quantity}


@router.patch("/{item_id}")
def update_item(item_id: int, body: BasketUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(BasketItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Basket item not found")
    item.quantity = body.quantity
    db.commit()
    return {"id": item.id, "quantity": item.quantity}


@router.delete("/{item_id}", status_code=204)
def remove_item(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.get(BasketItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(404, "Basket item not found")
    db.delete(item)
    db.commit()


@router.delete("", status_code=204)
def clear_basket(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    for item in _items(db, user):
        db.delete(item)
    db.commit()


@router.get("/optimize")
def optimize_basket(delivery: str | None = Query(None, description="instant | standard | any"),
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = _items(db, user)
    if not items:
        return {"message": "Your basket is empty", "recommendation": None}
    listings = listings_for(db, [i.product_id for i in items], ListingFilter(user, delivery))
    result = optimize([(i.product_id, i.quantity) for i in items], listings)
    names = {i.product_id: product_out(i.product)["display_name"] for i in items}
    result["missing_products"] = [names[pid] for pid in result.pop("missing_product_ids")]
    return result
