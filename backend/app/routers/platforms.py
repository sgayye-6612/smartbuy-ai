"""Module 2: platform selection, saved separately for each category."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..integrations.adapters import get_adapter
from ..models import Platform, User, UserPlatform
from ..security import get_current_user
from ..services.filters import CATEGORIES, CATEGORY_LABELS, DELIVERY_OPTIONS

router = APIRouter(prefix="/api", tags=["Platforms & Preferences"])

CATEGORY_ICONS = {"groceries": "🥬", "shopping": "🏠", "electronics": "🎧", "fashion": "👟",
                  "beauty": "💄", "food": "🍜", "rides": "🚕"}


def platform_out(p: Platform) -> dict:
    adapter = get_adapter(p)
    return {
        "id": p.id, "name": p.name, "slug": p.slug, "categories": p.categories.split(","),
        "delivery_type": p.delivery_type,
        "delivery_fee": p.delivery_fee, "free_delivery_above": p.free_delivery_above,
        "platform_fee": p.platform_fee, "avg_delivery_mins": p.avg_delivery_mins, "reliability": p.reliability,
        "coupon": ({"code": p.coupon_code, "percent": p.coupon_percent, "max": p.coupon_max,
                    "min_order": p.coupon_min_order} if p.coupon_percent else None),
        "integration": adapter.info(),
    }


@router.get("/platforms")
def list_platforms(db: Session = Depends(get_db)):
    platforms = list(db.scalars(select(Platform).order_by(Platform.name)))
    groups = [{"category": c, "label": CATEGORY_LABELS[c], "icon": CATEGORY_ICONS[c],
               "platforms": [platform_out(p) for p in platforms if c in p.categories.split(",")]}
              for c in CATEGORIES]
    return {"groups": groups, "data_note": "Fees, delivery times and fares are sample estimates."}


class CategoryPref(BaseModel):
    platform_ids: list[int] = []
    favorite_id: int | None = None


class PreferencesIn(BaseModel):
    delivery_preference: str = Field(default="any")
    categories: dict[str, CategoryPref] = {}


def prefs_out(user: User) -> dict:
    cats: dict[str, dict] = {c: {"platform_ids": [], "favorite_id": None} for c in CATEGORIES}
    for p in user.platform_prefs:
        entry = cats.setdefault(p.category, {"platform_ids": [], "favorite_id": None})
        entry["platform_ids"].append(p.platform_id)
        if p.is_favorite:
            entry["favorite_id"] = p.platform_id
    return {"delivery_preference": user.delivery_preference, "categories": cats}


@router.get("/preferences")
def get_preferences(user: User = Depends(get_current_user)):
    return prefs_out(user)


@router.put("/preferences")
def set_preferences(body: PreferencesIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.delivery_preference not in DELIVERY_OPTIONS:
        raise HTTPException(400, "delivery_preference must be instant, standard or any")
    platforms = {p.id: p for p in db.scalars(select(Platform))}
    new_prefs: list[UserPlatform] = []
    for cat, pref in body.categories.items():
        if cat not in CATEGORIES:
            raise HTTPException(400, f"Unknown category: {cat}")
        ids = set(pref.platform_ids)
        if pref.favorite_id is not None:
            ids.add(pref.favorite_id)
        for pid in ids:
            if pid not in platforms or cat not in platforms[pid].categories.split(","):
                raise HTTPException(400, f"Platform {pid} is not available for {cat}")
            new_prefs.append(UserPlatform(user_id=user.id, category=cat, platform_id=pid,
                                          is_favorite=(pid == pref.favorite_id)))
    user.platform_prefs = new_prefs
    user.delivery_preference = body.delivery_preference
    db.commit()
    db.refresh(user)
    return prefs_out(user)


@router.get("/integrations")
def integrations(db: Session = Depends(get_db)):
    """Transparency: how each platform is connected and whether direct checkout is possible."""
    return [get_adapter(p).info() | {"categories": p.categories.split(",")}
            for p in db.scalars(select(Platform).order_by(Platform.name))]
