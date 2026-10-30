"""Saved addresses (Home / Work / Other) for deliveries and ride pickups."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Address, User
from ..security import get_current_user
from ..services import geo

router = APIRouter(prefix="/api/addresses", tags=["Addresses"])

MAX_ADDRESSES = 10
LABELS = {"home", "work", "other"}


class AddressIn(BaseModel):
    label: str = "home"
    nickname: str | None = Field(default=None, max_length=40)
    receiver_name: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=15)
    house: str = Field(min_length=1, max_length=160)
    area: str = Field(min_length=2, max_length=240)
    landmark: str | None = Field(default=None, max_length=160)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    pincode: str | None = None
    lat: float
    lng: float
    is_default: bool = False

    @field_validator("label")
    @classmethod
    def check_label(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in LABELS:
            raise ValueError("label must be home, work or other")
        return v

    @field_validator("pincode")
    @classmethod
    def check_pincode(cls, v: str | None) -> str | None:
        if v in (None, ""):
            return None
        v = v.replace(" ", "")
        if not (v.isdigit() and len(v) == 6 and v[0] != "0"):
            raise ValueError("Enter a valid 6-digit pincode")
        return v

    @field_validator("phone")
    @classmethod
    def check_phone(cls, v: str | None) -> str | None:
        if v in (None, ""):
            return None
        digits = "".join(c for c in v if c.isdigit())
        if digits.startswith("91") and len(digits) == 12:
            digits = digits[2:]
        if len(digits) != 10 or digits[0] not in "6789":
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return digits


def address_out(a: Address) -> dict:
    title = a.nickname if a.label == "other" and a.nickname else a.label.capitalize()
    short = ", ".join(x for x in [a.area.split(",")[0], a.city] if x)
    landmark = None
    if a.landmark:
        landmark = a.landmark if a.landmark.lower().startswith(("near ", "opp", "behind", "beside", "next to")) else f"near {a.landmark}"
    parts: list[str] = []
    for x in [a.house, a.area, landmark, a.city, a.state, a.pincode]:
        # skip empty parts and ones already written (map search results often include the city)
        if x and not any(x.lower() in p.lower() for p in parts):
            parts.append(x)
    full = ", ".join(parts)
    return {
        "id": a.id, "label": a.label, "nickname": a.nickname, "title": title,
        "receiver_name": a.receiver_name, "phone": a.phone,
        "house": a.house, "area": a.area, "landmark": a.landmark, "city": a.city, "state": a.state, "pincode": a.pincode,
        "lat": a.lat, "lng": a.lng, "is_default": a.is_default,
        "short": short, "full": full,
        # Ready to use as a ride pickup / drop
        "place": {"name": f"{title}: {a.area.split(',')[0]}", "label": full, "lat": a.lat, "lng": a.lng,
                  "city": a.city, "state": a.state},
    }


def _mine(db: Session, user: User) -> list[Address]:
    return list(db.scalars(select(Address).where(Address.user_id == user.id)
                           .order_by(Address.is_default.desc(), Address.id)))


def _get(db: Session, user: User, address_id: int) -> Address:
    a = db.get(Address, address_id)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Address not found")
    return a


def _make_default(db: Session, user: User, a: Address) -> None:
    for other in _mine(db, user):
        other.is_default = other.id == a.id


@router.get("")
def list_addresses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [address_out(a) for a in _mine(db, user)]


@router.post("", status_code=201)
def add_address(body: AddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = _mine(db, user)
    if len(existing) >= MAX_ADDRESSES:
        raise HTTPException(400, f"You can save up to {MAX_ADDRESSES} addresses")
    if not geo.in_india(body.lat, body.lng):
        raise HTTPException(422, "Addresses must be in India")
    a = Address(user_id=user.id, **body.model_dump())
    db.add(a)
    db.flush()
    if body.is_default or not existing:  # first address becomes the default
        _make_default(db, user, a)
    db.commit()
    return address_out(a)


@router.put("/{address_id}")
def update_address(address_id: int, body: AddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _get(db, user, address_id)
    if not geo.in_india(body.lat, body.lng):
        raise HTTPException(422, "Addresses must be in India")
    was_default = a.is_default
    for field, value in body.model_dump().items():
        setattr(a, field, value)
    a.is_default = was_default
    if body.is_default:
        _make_default(db, user, a)
    db.commit()
    return address_out(a)


@router.post("/{address_id}/default")
def set_default(address_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _get(db, user, address_id)
    _make_default(db, user, a)
    db.commit()
    return address_out(a)


@router.delete("/{address_id}", status_code=204)
def delete_address(address_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _get(db, user, address_id)
    was_default = a.is_default
    db.delete(a)
    db.flush()
    if was_default:  # promote the next one
        rest = _mine(db, user)
        if rest:
            _make_default(db, user, rest[0])
    db.commit()
