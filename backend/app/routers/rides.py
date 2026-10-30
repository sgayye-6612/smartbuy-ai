"""Travel & transport: compare Uber, Ola and Rapido for any address in India."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Platform, SearchHistory, User
from ..security import get_optional_user
from ..services import geo, rides
from ..services.filters import ListingFilter

router = APIRouter(prefix="/api/rides", tags=["Rides"])


class PlaceIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    lat: float
    lng: float
    city: str | None = None
    state: str | None = None
    label: str | None = None


class RideIn(BaseModel):
    # Either a place picked from suggestions (exact coordinates) or plain text we look up
    pickup: PlaceIn | str
    drop: PlaceIn | str


def resolve(value: PlaceIn | str, near: dict | None = None) -> dict:
    if isinstance(value, PlaceIn):
        return value.model_dump()
    results = geo.search(value, (near["lat"], near["lng"]) if near else None, limit=1)
    if not results:
        raise HTTPException(422, f"Couldn't find “{value}”. Try a fuller address or pick from the suggestions.")
    return results[0]


@router.get("/places")
def places(q: str = Query(min_length=2, max_length=200), lat: float | None = None, lng: float | None = None):
    """Address autocomplete across India. Pass lat/lng to prefer nearby results."""
    near = (lat, lng) if lat is not None and lng is not None else None
    return {"results": geo.search(q, near)}


@router.get("/reverse")
def reverse(lat: float, lng: float):
    if not geo.in_india(lat, lng):
        raise HTTPException(422, "Ride comparison is available for locations in India.")
    return geo.reverse(lat, lng)


@router.get("/locations")
def locations():
    """Popular sample places (shown as quick picks; any address works)."""
    return {"locations": [{"name": n, "city": c, "lat": la, "lng": lo} for n, c, la, lo in geo.FALLBACK_PLACES]}


@router.post("/estimate")
def estimate(body: RideIn, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    pickup = resolve(body.pickup)
    drop = resolve(body.drop, near=pickup)
    for p in (pickup, drop):
        if not geo.in_india(p["lat"], p["lng"]):
            raise HTTPException(422, "Ride comparison is available for locations in India.")
    straight = geo.haversine_km(pickup["lat"], pickup["lng"], drop["lat"], drop["lng"])
    if straight < 0.2:
        raise HTTPException(422, "Pickup and drop are the same place.")
    if straight > rides.MAX_CITY_RIDE_KM:
        raise HTTPException(422, "That's an outstation trip. City rides cover up to about 150 km.")

    flt = ListingFilter(user)
    chosen = flt.platforms_for("rides")
    platforms = [p for p in db.scalars(select(Platform).where(Platform.delivery_type == "ride"))
                 if chosen is None or p.id in chosen]
    if user:
        db.add(SearchHistory(user_id=user.id, query=f"Ride: {pickup['name']} → {drop['name']}"))
        db.commit()
    return rides.estimate(platforms, pickup, drop, flt.favorite.get("rides"))
