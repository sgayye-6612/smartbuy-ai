"""Module 9: savings dashboard."""
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Alert, BasketItem, Comparison, SearchHistory, User, WishlistItem
from ..security import get_current_user
from ..services.queries import product_out

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    comparisons = list(db.scalars(
        select(Comparison).where(Comparison.user_id == user.id).order_by(Comparison.id.desc())
    ))
    total_savings = sum(max(c.highest_total - c.best_total, 0) for c in comparisons)

    def count(model):
        return db.scalar(select(func.count()).select_from(model).where(model.user_id == user.id)) or 0

    by_platform: dict[str, int] = {}
    for c in comparisons:
        if c.best_platform:
            by_platform[c.best_platform.name] = by_platform.get(c.best_platform.name, 0) + 1

    return {
        "total_estimated_savings": round(total_savings, 2),
        "comparisons_count": len(comparisons),
        "wishlist_count": count(WishlistItem),
        "basket_count": count(BasketItem),
        "unread_alerts": db.scalar(select(func.count()).select_from(Alert)
                                   .where(Alert.user_id == user.id, Alert.is_read.is_(False))) or 0,
        "searches_count": count(SearchHistory),
        "best_platform_wins": sorted(({"platform": k, "wins": v} for k, v in by_platform.items()),
                                     key=lambda x: -x["wins"]),
        "recent_comparisons": [
            {"id": c.id, "product": product_out(c.product),
             "best_platform": c.best_platform.name if c.best_platform else None,
             "best_total": c.best_total, "saved": round(c.highest_total - c.best_total, 2),
             "created_at": c.created_at.isoformat()}
            for c in comparisons[:8]
        ],
    }
