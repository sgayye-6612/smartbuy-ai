"""End-to-end API tests against a seeded SQLite database."""


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_register_login_and_me(client, auth_headers):
    assert client.post("/api/auth/register",
                       json={"email": "test@example.com", "name": "X", "password": "secret123"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "test@example.com", "password": "wrong"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "TEST@example.com", "password": "secret123"})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers=auth_headers).json()["email"] == "test@example.com"
    assert client.get("/api/auth/me").status_code == 401


def _platform_ids(client, category):
    groups = client.get("/api/platforms").json()["groups"]
    return {p["slug"]: p["id"] for g in groups if g["category"] == category for p in g["platforms"]}


def test_platforms_grouped_and_per_category_preferences(client, auth_headers):
    groups = client.get("/api/platforms").json()["groups"]
    assert {g["category"] for g in groups} == {"groceries", "food", "rides", "electronics", "fashion", "beauty", "shopping"}
    elec, groc = _platform_ids(client, "electronics"), _platform_ids(client, "groceries")
    assert "amazon" in elec and "amazon" not in groc  # Amazon for electronics is separate from groceries
    body = {"delivery_preference": "any", "categories": {
        "electronics": {"platform_ids": [elec["amazon"], elec["croma"]], "favorite_id": elec["amazon"]},
        "groceries": {"platform_ids": [groc["zepto"], groc["blinkit"]], "favorite_id": groc["zepto"]},
    }}
    r = client.put("/api/preferences", json=body, headers=auth_headers).json()
    assert r["categories"]["electronics"]["favorite_id"] == elec["amazon"]
    assert set(r["categories"]["groceries"]["platform_ids"]) == {groc["zepto"], groc["blinkit"]}
    # Amazon is not a grocery platform here, so it can't be chosen for groceries
    bad = {"categories": {"groceries": {"platform_ids": [elec["amazon"]]}}}
    assert client.put("/api/preferences", json=bad, headers=auth_headers).status_code == 400
    # Grocery comparison only uses the chosen grocery apps, and flags the favourite
    pid = client.get("/api/products/search", params={"q": "amul butter 500 g"}).json()["exact_matches"][0]["id"]
    cmp = client.get(f"/api/compare/{pid}", headers=auth_headers).json()
    assert {o["platform"]["slug"] for o in cmp["offers"]} <= {"zepto", "blinkit"}
    assert any(o["is_favorite"] for o in cmp["offers"] if o["platform"]["slug"] == "zepto")
    client.put("/api/preferences", json={"delivery_preference": "any", "categories": {}}, headers=auth_headers)


def test_delivery_preference_filter(client):
    pid = client.get("/api/products/search", params={"q": "aashirvaad atta 5 kg"}).json()["exact_matches"][0]["id"]
    instant = client.get(f"/api/compare/{pid}", params={"delivery": "instant"}).json()
    standard = client.get(f"/api/compare/{pid}", params={"delivery": "standard"}).json()
    assert instant["offers"] and all(o["delivery_type"] == "instant" for o in instant["offers"])
    assert standard["offers"] and all(o["delivery_type"] == "standard" for o in standard["offers"])
    assert instant["hidden_by_filters"] > 0


def test_browse_respects_delivery(client):
    instant = client.get("/api/products", params={"category": "groceries", "delivery": "instant"}).json()
    assert instant and all(p["lowest_platform"] in {"Blinkit", "Zepto", "Swiggy Instamart"} for p in instant)
    # Croma only does standard delivery, so it never appears under "instant"
    elec = client.get("/api/products", params={"category": "electronics", "delivery": "instant"}).json()
    assert all(p["lowest_platform"] != "Croma" for p in elec)


def test_instant_electronics_and_beauty_exist(client):
    for cat in ("electronics", "beauty"):
        items = client.get("/api/products", params={"category": cat, "delivery": "instant"}).json()
        assert len(items) >= 4, cat
        assert all(p["lowest_platform"] in {"Blinkit", "Zepto", "Swiggy Instamart"} for p in items)


def test_mixed_food_and_grocery_basket(client):
    r = client.post("/api/auth/register", json={"email": "food@example.com", "name": "F", "password": "secret123"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    food = client.get("/api/products", params={"category": "food"}).json()
    biryani = next(p for p in food if p["name"] == "Chicken Dum Biryani")
    paneer = next(p for p in food if p["name"] == "Paneer Butter Masala")      # same restaurant
    dosa = next(p for p in food if p["name"] == "Masala Dosa")                  # different restaurant
    atta = client.get("/api/products/search", params={"q": "aashirvaad atta 5 kg"}).json()["exact_matches"][0]
    for pid in (biryani["id"], paneer["id"], dosa["id"], atta["id"]):
        assert client.post("/api/basket", json={"product_id": pid, "quantity": 1}, headers=h).status_code == 201
    plan = client.get("/api/basket/optimize", headers=h).json()["recommendation"]["plan"]
    food_orders = [o for o in plan["orders"] if o["restaurant"]]
    assert {o["restaurant"] for o in food_orders} == {"Spice Route Kitchen", "Dosa Junction"}
    assert all(o["checkout_verb"] == "Order on" for o in food_orders)
    assert any(o["restaurant"] is None and o["checkout_verb"] == "Buy on" for o in plan["orders"])
    # each restaurant's dishes stay together in one order per app
    for o in food_orders:
        assert len({it["product_id"] for it in o["items"]}) >= 1


def test_sections_subcategories_and_veg(client):
    shop = client.get("/api/products", params={"category": "electronics,fashion,beauty,shopping"}).json()
    assert {p["category"] for p in shop} == {"electronics", "fashion", "beauty", "shopping"}
    assert all(p["subcategory"] for p in shop)
    groceries = client.get("/api/products", params={"category": "groceries"}).json()
    assert {"fruits-veg", "staples", "dairy", "snacks", "beverages", "household"} <= {p["subcategory"] for p in groceries}
    food = client.get("/api/products", params={"category": "food"}).json()
    biryani = [p for p in food if p["subcategory"] == "biryani"]
    assert any(p["veg"] for p in biryani) and any(p["veg"] is False for p in biryani)
    assert all(p["veg"] is None for p in groceries)


def test_food_comparison(client):
    data = client.get("/api/products/search", params={"q": "chicken biryani"}).json()
    top = data["exact_matches"][0]
    assert top["category"] == "food"
    cmp = client.get(f"/api/compare/{top['id']}").json()
    assert {o["platform"]["slug"] for o in cmp["offers"]} <= {"swiggy", "zomato"}
    assert all(o["checkout"]["verb"] == "Order on" for o in cmp["offers"])
    assert all("platform_fee" in o and "final_price" in o for o in cmp["offers"])


def test_rides_any_city(client):
    # free text is looked up (offline list in tests), picked suggestions carry exact coordinates
    r = client.post("/api/rides/estimate", json={"pickup": "HITEC City", "drop": "Rajiv Gandhi International Airport"}).json()
    assert r["distance_km"] > 20 and r["metro"] is True and len(r["route"]) >= 2
    slugs = {o["platform"]["slug"] for g in r["groups"] for o in g["options"]}
    assert slugs == {"uber", "ola", "rapido"}
    uber = next(o for g in r["groups"] for o in g["options"] if o["platform"]["slug"] == "uber")
    assert uber["booking"]["url"].startswith("https://m.uber.com/ul/") and uber["booking"]["precision"] == "exact"
    assert "Includes a typical airport" in r["note"]
    # Exact coordinates from a picked suggestion, in another city
    pick = {"name": "Koramangala", "lat": 12.9352, "lng": 77.6245, "city": "Bengaluru"}
    dropp = {"name": "MG Road", "lat": 12.9756, "lng": 77.6050, "city": "Bengaluru"}
    r2 = client.post("/api/rides/estimate", json={"pickup": pick, "drop": dropp}).json()
    assert 4 < r2["distance_km"] < 10 and r2["cheapest"]
    # Places search + reverse
    assert client.get("/api/rides/places", params={"q": "andheri"}).json()["results"][0]["city"] == "Mumbai"
    assert client.get("/api/rides/reverse", params={"lat": 17.444, "lng": 78.378}).status_code == 200
    # Outside India / too far / unknown
    assert client.get("/api/rides/reverse", params={"lat": 51.5, "lng": -0.12}).status_code == 422
    far = client.post("/api/rides/estimate", json={"pickup": "HITEC City", "drop": "Connaught Place"})
    assert far.status_code == 422 and "outstation" in far.json()["detail"]
    assert client.post("/api/rides/estimate", json={"pickup": "Mars base", "drop": "airport"}).status_code == 422


def test_long_ride_disables_bikes_and_autos(client):
    a = {"name": "Miyapur", "lat": 17.4968, "lng": 78.3614, "city": "Hyderabad"}
    b = {"name": "Rajiv Gandhi International Airport", "lat": 17.2403, "lng": 78.4294, "city": "Hyderabad"}
    r = client.post("/api/rides/estimate", json={"pickup": a, "drop": b}).json()
    opts = [o for g in r["groups"] for o in g["options"]]
    if r["distance_km"] > 40:
        assert all(not o["available"] for o in opts if o["vehicle_class"] == "bike")


def test_checkout_is_honest_handoff(client):
    pid = client.get("/api/products/search", params={"q": "jbl flip 6"}).json()["exact_matches"][0]["id"]
    offer = client.get(f"/api/compare/{pid}").json()["offers"][0]
    r = client.post("/api/checkout", json={"listing_id": offer["listing_id"]}).json()
    assert r["mode"] == "redirect" and r["order_placed"] is False and r["url"].startswith("https://")
    integrations = client.get("/api/integrations").json()
    assert all(i["direct_checkout"] is False for i in integrations)


def test_recommendations(client, auth_headers):
    r = client.get("/api/recommendations", headers=auth_headers).json()
    assert r["top_deals"] and all(d["deal_pct"] > 0 for d in r["top_deals"])


def test_search_spec_example(client):
    r = client.get("/api/products/search", params={"q": "Minimalist 2% Salicylic Acid Face Wash 100 ml below ₹300"})
    data = r.json()
    assert data["parsed"]["max_price"] == 300
    assert data["exact_matches"][0]["brand"] == "Minimalist"
    assert data["exact_matches"][0]["lowest_price"] <= 300


def test_search_size_variants_separated(client):
    data = client.get("/api/products/search", params={"q": "Cetaphil Gentle Skin Cleanser 125 ml"}).json()
    assert [p["size"] for p in data["exact_matches"]] == ["125 ml"]
    assert "250 ml" in [p["size"] for p in data["alternatives"]]


def test_match_endpoint(client):
    r = client.post("/api/products/match", json={"title": "LAKME Sun Expert SPF 50 PA+++ Sunscreen Lotion 100ml"}).json()
    assert r["matched"] and r["exact"] and r["product"]["size"] == "100 ml"


def test_compare_records_savings(client, auth_headers):
    pid = client.get("/api/products/search", params={"q": "Cetaphil cleanser 250 ml"}).json()["exact_matches"][0]["id"]
    r = client.get(f"/api/compare/{pid}", headers=auth_headers).json()
    assert r["best"] is not None and r["offers"]
    assert all(o["data_source"] == "sample" for o in r["offers"])
    finals = [o["final_price"] for o in r["offers"] if o["in_stock"]]
    assert r["cheapest"]["final_price"] == min(finals)
    assert r["deal"]["verdict"] in {"great", "good", "fair", "wait"}
    dash = client.get("/api/dashboard", headers=auth_headers).json()
    assert dash["comparisons_count"] >= 1


def test_basket_flow(client, auth_headers):
    products = client.get("/api/products", params={"category": "groceries"}).json()
    for p in products[:4]:
        assert client.post("/api/basket", json={"product_id": p["id"], "quantity": 2}, headers=auth_headers).status_code == 201
    basket = client.get("/api/basket", headers=auth_headers).json()
    assert len(basket) == 4
    opt = client.get("/api/basket/optimize", headers=auth_headers).json()
    assert opt["recommendation"]["type"] in {"single", "split"}
    if opt["best_single"]:
        assert opt["recommendation"]["plan"]["total"] <= opt["best_single"]["total"]
    item_id = basket[0]["id"]
    assert client.patch(f"/api/basket/{item_id}", json={"quantity": 3}, headers=auth_headers).json()["quantity"] == 3
    assert client.delete(f"/api/basket/{item_id}", headers=auth_headers).status_code == 204


def test_assistant_search_and_basket(client, auth_headers):
    r = client.post("/api/assistant", json={"message": "Find a face wash under ₹300"}, headers=auth_headers).json()
    assert r["parsed"]["max_price"] == 300 and r["products"]
    assert all(p["lowest_price"] <= 300 for p in r["products"])
    r = client.post("/api/assistant", json={"message": "Find groceries for a family of four under ₹1,500"}).json()
    assert r["parsed"]["intent"] == "basket" and r["basket"]["items"]
    r = client.post("/api/assistant", json={"message": "Is the current price of Amul butter 500g a good deal?"}).json()
    assert r["deal"] is not None
    r = client.post("/api/assistant", json={"message": "Book a cab from Gachibowli to Charminar"}).json()
    assert r["parsed"]["intent"] == "ride" and r["rides"]["cheapest"]


def test_wishlist_alerts_and_refresh(client, auth_headers):
    pid = client.get("/api/products").json()[0]["id"]
    assert client.post("/api/wishlist", json={"product_id": pid, "target_price": 99999}, headers=auth_headers).status_code == 201
    wl = client.get("/api/wishlist", headers=auth_headers).json()
    assert wl[0]["target_reached"]
    r = client.post("/api/prices/refresh", headers=auth_headers).json()
    assert r["alerts_created"] >= 1
    alerts = client.get("/api/alerts", headers=auth_headers).json()
    assert alerts and client.post(f"/api/alerts/{alerts[0]['id']}/read", headers=auth_headers).json()["ok"]
    hist = client.get(f"/api/products/{pid}/history").json()
    assert len(hist["series"]) >= 30


def test_addresses(client):
    r = client.post("/api/auth/register", json={"email": "addr@example.com", "name": "A", "password": "secret123"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    home = {"label": "home", "house": "Flat 302, Sai Residency", "area": "Moosapet, Kukatpally", "landmark": "Metro station",
            "city": "Hyderabad", "state": "Telangana", "pincode": "500018", "lat": 17.46, "lng": 78.425,
            "receiver_name": "Reddy", "phone": "+91 98765 43210"}
    a = client.post("/api/addresses", json=home, headers=h)
    assert a.status_code == 201 and a.json()["is_default"] and a.json()["phone"] == "9876543210"
    assert a.json()["place"]["lat"] == 17.46 and "Flat 302" in a.json()["full"]
    assert a.json()["full"] == "Flat 302, Sai Residency, Moosapet, Kukatpally, near Metro station, Hyderabad, Telangana, 500018"
    dup = client.post("/api/addresses", json=home | {"label": "other", "nickname": "Gym", "area": "Madhapur, Hyderabad",
                                                     "landmark": "Opp. Inorbit Mall"}, headers=h).json()
    assert dup["full"].count("Hyderabad") == 1 and "near Opp" not in dup["full"] and dup["title"] == "Gym"
    client.delete(f"/api/addresses/{dup['id']}", headers=h)
    work = home | {"label": "work", "house": "Tower B", "area": "HITEC City", "lat": 17.4435, "lng": 78.3772}
    w = client.post("/api/addresses", json=work, headers=h).json()
    assert w["is_default"] is False
    client.post(f"/api/addresses/{w['id']}/default", headers=h)
    lst = client.get("/api/addresses", headers=h).json()
    assert [x["label"] for x in lst] == ["work", "home"] and lst[0]["is_default"]
    # validation
    assert client.post("/api/addresses", json=home | {"pincode": "12345"}, headers=h).status_code == 422
    assert client.post("/api/addresses", json=home | {"phone": "12345"}, headers=h).status_code == 422
    assert client.post("/api/addresses", json=home | {"lat": 51.5, "lng": -0.1}, headers=h).status_code == 422
    # deleting the default promotes another
    assert client.delete(f"/api/addresses/{w['id']}", headers=h).status_code == 204
    lst = client.get("/api/addresses", headers=h).json()
    assert len(lst) == 1 and lst[0]["is_default"]
    # other users can't touch it
    assert client.delete(f"/api/addresses/{lst[0]['id']}").status_code == 401
    # saved address works as a ride pickup
    ride = client.post("/api/rides/estimate", json={"pickup": lst[0]["place"], "drop": "HITEC City"}).json()
    assert ride["distance_km"] > 1
