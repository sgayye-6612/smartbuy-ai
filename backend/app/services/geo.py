"""Real addresses and road routes, using free OpenStreetMap services.

* Photon (photon.komoot.io): address search built for search-as-you-type,
  plus reverse geocoding ("use my location").
* OSRM (router.project-osrm.org): real road distance, drive time and the
  route line for the map.

Both are public demo servers meant for light use. For production you would
self-host them or use a paid provider. Their URLs are configurable in .env.

If a service is unreachable, everything falls back to a small built-in list
of places and a straight-line estimate, so the app never breaks.
"""
import logging
import math
import os
import re
from functools import lru_cache

import httpx

log = logging.getLogger(__name__)

PHOTON_URL = os.getenv("PHOTON_URL", "https://photon.komoot.io").rstrip("/")
OSRM_URL = os.getenv("OSRM_URL", "https://router.project-osrm.org").rstrip("/")
OFFLINE = os.getenv("GEO_OFFLINE", "").lower() in ("1", "true", "yes")
USER_AGENT = "SmartBuyAI/3.0 (portfolio project)"
TIMEOUT = 5.0

# India bounding box (min lon, min lat, max lon, max lat). Ride apps here operate in India only.
INDIA_BBOX = (68.1, 6.5, 97.5, 35.7)

# Offline fallback places (used only when the map service can't be reached)
FALLBACK_PLACES = [
    ("HITEC City", "Hyderabad", 17.4435, 78.3772), ("Gachibowli", "Hyderabad", 17.4401, 78.3489),
    ("Madhapur", "Hyderabad", 17.4483, 78.3915), ("Kondapur", "Hyderabad", 17.4698, 78.3578),
    ("Miyapur", "Hyderabad", 17.4968, 78.3614), ("Kukatpally", "Hyderabad", 17.4849, 78.4138),
    ("Moosapet", "Hyderabad", 17.4600, 78.4250), ("Jubilee Hills", "Hyderabad", 17.4326, 78.4071),
    ("Banjara Hills", "Hyderabad", 17.4156, 78.4347), ("Ameerpet", "Hyderabad", 17.4375, 78.4483),
    ("Begumpet", "Hyderabad", 17.4447, 78.4664), ("Secunderabad Railway Station", "Hyderabad", 17.4337, 78.5016),
    ("Charminar", "Hyderabad", 17.3616, 78.4747), ("Dilsukhnagar", "Hyderabad", 17.3688, 78.5247),
    ("Uppal", "Hyderabad", 17.4058, 78.5591), ("Rajiv Gandhi International Airport", "Hyderabad", 17.2403, 78.4294),
    ("Andheri West", "Mumbai", 19.1364, 72.8296), ("Bandra West", "Mumbai", 19.0596, 72.8295),
    ("Chhatrapati Shivaji Maharaj Terminus", "Mumbai", 18.9398, 72.8355),
    ("Chhatrapati Shivaji Maharaj International Airport", "Mumbai", 19.0896, 72.8656),
    ("Koramangala", "Bengaluru", 12.9352, 77.6245), ("MG Road", "Bengaluru", 12.9756, 77.6050),
    ("Whitefield", "Bengaluru", 12.9698, 77.7500), ("Kempegowda International Airport", "Bengaluru", 13.1986, 77.7066),
    ("Connaught Place", "New Delhi", 28.6315, 77.2167), ("Indira Gandhi International Airport", "New Delhi", 28.5562, 77.1000),
    ("Cyber City", "Gurugram", 28.4950, 77.0890),
]


def _place(name: str, lat: float, lng: float, city: str | None = None, state: str | None = None,
           label: str | None = None, source: str = "osm", postcode: str | None = None) -> dict:
    return {"name": name, "label": label or ", ".join(dict.fromkeys(x for x in [name, city, state] if x)),
            "lat": round(lat, 6), "lng": round(lng, 6), "city": city, "state": state, "postcode": postcode,
            "source": source}


def in_india(lat: float, lng: float) -> bool:
    return INDIA_BBOX[1] <= lat <= INDIA_BBOX[3] and INDIA_BBOX[0] <= lng <= INDIA_BBOX[2]


def _get_json(url: str, params: dict) -> dict:
    """Single place where HTTP happens (tests replace this)."""
    with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}) as client:
        r = client.get(url, params=params)
        r.raise_for_status()
        return r.json()


def _from_photon(feature: dict) -> dict | None:
    p = feature.get("properties", {})
    coords = feature.get("geometry", {}).get("coordinates") or []
    if len(coords) < 2 or (p.get("countrycode") or "IN").upper() != "IN":
        return None
    lng, lat = coords[0], coords[1]
    street = " ".join(x for x in [p.get("housenumber"), p.get("street")] if x)
    name = p.get("name") or street or p.get("district") or p.get("city")
    if not name:
        return None
    city = p.get("city") or p.get("county") or p.get("district")
    parts = [name, street if street and street != name else None, p.get("locality"),
             p.get("district") if p.get("district") not in (name, city) else None, city, p.get("state")]
    label = ", ".join(dict.fromkeys(x for x in parts if x))
    postcode = (p.get("postcode") or "").replace(" ", "")[:6] or None
    return _place(name, lat, lng, city, p.get("state"), label, postcode=postcode)


def _fallback_search(q: str, limit: int) -> list[dict]:
    t = re.sub(r"[^\w\s]", " ", q.lower())
    t = re.sub(r"\s+", " ", t).strip()
    out = []
    for name, city, lat, lng in FALLBACK_PLACES:
        hay = f"{name} {city}".lower()
        if t in hay or all(w in hay for w in t.split()) or (t == "airport" and "airport" in hay):
            out.append(_place(name, lat, lng, city, None, f"{name}, {city}", source="offline"))
    return out[:limit]


@lru_cache(maxsize=512)
def _search_cached(q: str, bias: tuple[float, float] | None, limit: int) -> tuple[dict, ...]:
    params: dict = {"q": q, "limit": limit + 4, "lang": "en", "bbox": ",".join(map(str, INDIA_BBOX))}
    if bias:
        params["lat"], params["lon"] = bias
    data = _get_json(f"{PHOTON_URL}/api", params)
    places, seen = [], set()
    for f in data.get("features", []):
        p = _from_photon(f)
        if p and p["label"] not in seen:
            seen.add(p["label"])
            places.append(p)
    return tuple(places[:limit])


def search(q: str, near: tuple[float, float] | None = None, limit: int = 6) -> list[dict]:
    """Any address / landmark / area in India. `near` biases results to the user's area."""
    q = q.strip()
    if len(q) < 2:
        return []
    if not OFFLINE:
        try:
            bias = (round(near[0], 2), round(near[1], 2)) if near else None
            results = list(_search_cached(q.lower(), bias, limit))
            if results:
                return results
        except Exception as exc:  # network error, timeout, bad response
            log.warning("Place search unavailable, using offline list: %s", exc)
    return _fallback_search(q, limit)


def reverse(lat: float, lng: float) -> dict:
    """Turn GPS coordinates into a readable place ("use my current location")."""
    if not OFFLINE:
        try:
            data = _get_json(f"{PHOTON_URL}/reverse", {"lat": lat, "lon": lng, "lang": "en", "limit": 1})
            for f in data.get("features", []):
                p = _from_photon(f)
                if p:
                    p.update(lat=round(lat, 6), lng=round(lng, 6))
                    return p
        except Exception as exc:
            log.warning("Reverse geocoding unavailable: %s", exc)
    nearest = min(FALLBACK_PLACES, key=lambda x: haversine_km(lat, lng, x[2], x[3]))
    if haversine_km(lat, lng, nearest[2], nearest[3]) < 3:
        return _place(f"Near {nearest[0]}", lat, lng, nearest[1], None, source="offline")
    return _place("Current location", lat, lng, None, None, f"{lat:.4f}, {lng:.4f}", source="gps")


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat, dlng = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


@lru_cache(maxsize=512)
def _route_cached(a: tuple[float, float], b: tuple[float, float]) -> dict:
    coords = f"{a[1]},{a[0]};{b[1]},{b[0]}"  # OSRM wants lon,lat
    data = _get_json(f"{OSRM_URL}/route/v1/driving/{coords}", {"overview": "simplified", "geometries": "geojson"})
    if data.get("code") != "Ok" or not data.get("routes"):
        raise ValueError(f"No route: {data.get('code')}")
    r = data["routes"][0]
    line = [[round(lat, 5), round(lng, 5)] for lng, lat in r["geometry"]["coordinates"]]
    return {"distance_km": round(r["distance"] / 1000, 1), "drive_mins": max(1, round(r["duration"] / 60)),
            "geometry": line, "source": "osrm"}


def route(pickup: dict, drop: dict) -> dict:
    """Road distance + drive time (free-flow, before traffic) + route line."""
    a, b = (round(pickup["lat"], 5), round(pickup["lng"], 5)), (round(drop["lat"], 5), round(drop["lng"], 5))
    if not OFFLINE:
        try:
            return dict(_route_cached(a, b))
        except Exception as exc:
            log.warning("Routing unavailable, using straight-line estimate: %s", exc)
    km = haversine_km(*a, *b) * 1.35
    return {"distance_km": round(km, 1), "drive_mins": max(3, round(km / 32 * 60)),
            "geometry": [list(a), list(b)], "source": "estimate"}
