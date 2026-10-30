"""Map service parsing, using recorded-style Photon and OSRM responses (no network)."""
import pytest

from app.services import geo

PHOTON = {"type": "FeatureCollection", "features": [
    {"type": "Feature", "geometry": {"type": "Point", "coordinates": [72.8656, 19.0896]},
     "properties": {"name": "Chhatrapati Shivaji Maharaj International Airport", "city": "Mumbai", "state": "Maharashtra",
                    "countrycode": "IN", "osm_key": "aeroway", "osm_value": "aerodrome", "type": "other"}},
    {"type": "Feature", "geometry": {"type": "Point", "coordinates": [72.8296, 19.1364]},
     "properties": {"name": "Andheri West", "district": "Andheri", "city": "Mumbai", "state": "Maharashtra", "postcode": "400058", "countrycode": "IN"}},
    {"type": "Feature", "geometry": {"type": "Point", "coordinates": [-0.4543, 51.47]},
     "properties": {"name": "Heathrow Airport", "city": "London", "countrycode": "GB"}},
]}
OSRM = {"code": "Ok", "routes": [{"distance": 8423.7, "duration": 1260.4,
                                  "geometry": {"type": "LineString", "coordinates": [[72.8296, 19.1364], [72.85, 19.11], [72.8656, 19.0896]]}}]}


@pytest.fixture
def online(monkeypatch):
    calls = []

    def fake_get_json(url, params):
        calls.append((url, params))
        return OSRM if "/route/" in url else PHOTON

    monkeypatch.setattr(geo, "OFFLINE", False)
    monkeypatch.setattr(geo, "_get_json", fake_get_json)
    geo._search_cached.cache_clear()
    geo._route_cached.cache_clear()
    return calls


def test_search_parses_photon_and_keeps_india_only(online):
    results = geo.search("airport mumbai")
    assert [r["name"] for r in results] == ["Chhatrapati Shivaji Maharaj International Airport", "Andheri West"]
    assert results[0]["lat"] == 19.0896 and results[0]["lng"] == 72.8656
    assert results[0]["label"].endswith("Mumbai, Maharashtra")
    assert results[1]["postcode"] == "400058"
    url, params = online[0]
    assert url.endswith("/api") and params["bbox"] == "68.1,6.5,97.5,35.7"


def test_search_passes_location_bias(online):
    geo.search("andheri", near=(19.07, 72.87))
    _, params = online[0]
    assert params["lat"] == 19.07 and params["lon"] == 72.87


def test_route_uses_osrm_lon_lat_order(online):
    r = geo.route({"lat": 19.1364, "lng": 72.8296}, {"lat": 19.0896, "lng": 72.8656})
    assert r == {"distance_km": 8.4, "drive_mins": 21, "geometry": [[19.1364, 72.8296], [19.11, 72.85], [19.0896, 72.8656]], "source": "osrm"}
    assert "/route/v1/driving/72.8296,19.1364;72.8656,19.0896" in online[0][0]


def test_falls_back_when_service_is_down(monkeypatch):
    def boom(url, params):
        raise ConnectionError("down")

    monkeypatch.setattr(geo, "OFFLINE", False)
    monkeypatch.setattr(geo, "_get_json", boom)
    geo._search_cached.cache_clear()
    geo._route_cached.cache_clear()
    assert geo.search("koramangala")[0]["city"] == "Bengaluru"
    r = geo.route({"lat": 12.9352, "lng": 77.6245}, {"lat": 13.1986, "lng": 77.7066})
    assert r["source"] == "estimate" and r["distance_km"] > 25


def test_reverse_offline_gives_nearby_name():
    p = geo.reverse(17.4440, 78.3780)
    assert "HITEC City" in p["name"] and p["label"] == "Near HITEC City, Hyderabad"
