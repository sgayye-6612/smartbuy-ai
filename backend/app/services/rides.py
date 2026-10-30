"""Ride fare comparison (Uber, Ola, Rapido) for any address in India.

Distance and drive time come from real road routing (OSRM on OpenStreetMap),
adjusted for Indian city traffic. There is no public fare API for these
platforms, so FARES are simulated from typical rate structures: base fare +
per km + per minute, minimum fare, time-of-day surge, a lower rate card
outside metros, and an airport pickup/drop fee for cabs.

Results are always labelled as estimates. Booking happens on the platform:
Uber via its official universal deep link (exact pickup and drop filled in),
Ola and Rapido by opening their site/app.
"""
import hashlib
import random
from datetime import datetime, timedelta, timezone

from ..integrations.adapters import get_adapter
from ..models import Platform
from . import geo

# platform slug -> [(vehicle class, product name, base, per_km, per_min, min_fare, seats)]
FARES = {
    "uber": [
        ("bike", "Uber Moto", 20, 6.0, 0.5, 30, 1), ("auto", "Uber Auto", 25, 11.0, 1.0, 40, 3),
        ("cab", "Uber Go", 50, 14.0, 1.5, 90, 4), ("premium", "Uber Premier", 70, 17.0, 2.0, 120, 4),
        ("xl", "Uber XL", 90, 22.0, 2.5, 160, 6),
    ],
    "ola": [
        ("bike", "Ola Bike", 20, 6.5, 0.5, 30, 1), ("auto", "Ola Auto", 25, 12.0, 1.0, 40, 3),
        ("cab", "Ola Mini", 45, 13.5, 1.5, 85, 4), ("premium", "Ola Prime Sedan", 65, 16.0, 2.0, 110, 4),
        ("xl", "Ola Prime SUV", 90, 21.0, 2.5, 160, 6),
    ],
    "rapido": [
        ("bike", "Rapido Bike", 15, 5.5, 0.5, 25, 1), ("auto", "Rapido Auto", 25, 10.5, 1.0, 35, 3),
        ("cab", "Rapido Cab Economy", 45, 13.0, 1.25, 80, 4),
    ],
}
CLASS_LABELS = {"bike": "Bike", "auto": "Auto", "cab": "Cab", "premium": "Premium", "xl": "XL / SUV"}
CLASS_ICONS = {"bike": "🏍️", "auto": "🛺", "cab": "🚗", "premium": "🚘", "xl": "🚙"}

METROS = {"mumbai", "new delhi", "delhi", "bengaluru", "bangalore", "hyderabad", "chennai", "kolkata", "pune",
          "gurugram", "gurgaon", "noida", "navi mumbai", "thane", "ghaziabad"}
MAX_KM = {"bike": 40, "auto": 35}         # bikes and autos don't take long trips
MAX_CITY_RIDE_KM = 150                    # beyond this it's an outstation trip
AIRPORT_FEE = {"cab": 80, "premium": 100, "xl": 120}


def _rng(*parts) -> random.Random:
    seed = int(hashlib.md5("|".join(map(str, parts)).encode()).hexdigest()[:8], 16)
    return random.Random(seed)


def _is_metro(*places: dict) -> bool:
    return any((p.get("city") or "").strip().lower() in METROS for p in places)


def _is_airport(*places: dict) -> bool:
    return any("airport" in f"{p.get('name', '')} {p.get('label', '')}".lower() for p in places)


def estimate(platforms: list[Platform], pickup: dict, drop: dict, favorite_id: int | None = None,
             now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    ist = now + timedelta(hours=5, minutes=30)
    hour_key = now.strftime("%Y%m%d%H")
    peak = ist.hour in (8, 9, 10, 17, 18, 19, 20, 21)

    r = geo.route(pickup, drop)
    distance = r["distance_km"]
    # Free-flow drive time -> realistic Indian city time
    traffic = 1.6 if peak else 1.25
    duration = max(4, round(r["drive_mins"] * traffic))
    metro = _is_metro(pickup, drop)
    city_factor = 1.0 if metro else 0.88
    airport = _is_airport(pickup, drop)

    options = []
    for p in platforms:
        adapter = get_adapter(p)
        link, precision = adapter.ride_link(pickup, drop)
        surge = round(_rng(p.slug, hour_key, metro).uniform(1.0, 1.35 if peak else 1.12), 2)
        for vclass, product, base, per_km, per_min, min_fare, seats in FARES.get(p.slug, []):
            rr = _rng(p.slug, product, pickup["lat"], pickup["lng"], drop["lat"], drop["lng"], hour_key)
            v_duration = round(duration * (0.85 if vclass == "bike" else 1.0))
            fare = max(min_fare, base + per_km * distance + per_min * v_duration) * surge * city_factor
            if airport:
                fare += AIRPORT_FEE.get(vclass, 0)
            too_far = distance > MAX_KM.get(vclass, 10_000)
            available = (not too_far) and rr.random() > (0.08 if metro else 0.2)
            options.append({
                "platform": {"id": p.id, "name": p.name, "slug": p.slug, "reliability": p.reliability},
                "vehicle_class": vclass, "vehicle_label": CLASS_LABELS[vclass], "icon": CLASS_ICONS[vclass],
                "product": product, "seats": seats,
                "fare_low": round(fare * 0.95), "fare_high": round(fare * 1.08), "fare_estimate": round(fare),
                "surge": surge,
                "pickup_eta_mins": rr.randint(2, 8) if metro else rr.randint(4, 14),
                "trip_mins": v_duration,
                "available": available,
                "unavailable_reason": ("Not available for trips this long" if too_far
                                       else None if available else "No drivers nearby right now"),
                "is_favorite": p.id == favorite_id,
                "booking": {"url": link, "precision": precision, "verb": adapter.checkout_verb,
                            "note": ("Opens with your exact pickup and drop filled in." if precision == "exact"
                                     else f"Opens {p.name}. Enter your pickup and destination there.")},
                "data_source": "estimated",
            })

    available = [o for o in options if o["available"]]
    for o in options:
        o["score"] = 0
    if available:
        cheapest_fare = min(o["fare_estimate"] for o in available)
        fastest = min(o["pickup_eta_mins"] for o in available)
        for o in available:
            o["score"] = round(100 * (0.6 * cheapest_fare / o["fare_estimate"] + 0.25 * fastest / o["pickup_eta_mins"]
                                      + 0.15 * o["platform"]["reliability"]), 1)

    groups = []
    for vclass, label in CLASS_LABELS.items():
        items = sorted([o for o in options if o["vehicle_class"] == vclass], key=lambda o: (not o["available"], o["fare_estimate"]))
        if not items:
            continue
        avail = [o for o in items if o["available"]]
        groups.append({
            "vehicle_class": vclass, "label": label, "icon": CLASS_ICONS[vclass], "options": items,
            "cheapest": avail[0]["product"] if avail else None,
            "fastest_pickup": min(avail, key=lambda o: o["pickup_eta_mins"])["product"] if avail else None,
        })

    notes = ["Fares are simulated estimates based on typical rate structures. The app shows the final fare before you book."]
    if airport:
        notes.append("Includes a typical airport pickup/drop fee for cabs.")
    if r["source"] != "osrm":
        notes.append("Map routing was unavailable, so distance is a straight-line estimate.")

    return {
        "pickup": pickup, "drop": drop, "city": pickup.get("city") or drop.get("city"),
        "distance_km": distance, "duration_mins": duration, "peak_hours": peak, "metro": metro,
        "route": r["geometry"], "route_source": r["source"],
        "groups": groups,
        "cheapest": min(available, key=lambda o: o["fare_estimate"], default=None),
        "best": max(available, key=lambda o: o["score"], default=None),
        "note": " ".join(notes),
    }
