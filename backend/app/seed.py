"""Sample data so the whole app works without any real platform APIs.

Everything here is clearly labelled data_source="sample". Restaurant names are fictional. Prices, fees,
barcodes and delivery times are realistic-looking ESTIMATES for demo
purposes only, not live data from these platforms.

Run directly to reset:  python -m app.seed --reset
"""
import random
import sys
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine
from .integrations.adapters import get_adapter
from .models import Listing, Platform, PriceHistory, Product, utcnow

PLATFORMS = [
    # name, slug, categories, delivery_type, base_url, delivery_fee, free_above, platform_fee, mins, reliability, coupon
    ("Blinkit", "blinkit", "groceries,electronics,beauty", "instant", "https://blinkit.com/s/?q=", 30, 199, 4, 12, 0.92, ("BLINK10", 10, 50, 299)),
    ("Zepto", "zepto", "groceries,electronics,beauty", "instant", "https://www.zeptonow.com/search?query=", 25, 249, 5, 10, 0.90, None),
    ("Swiggy Instamart", "instamart", "groceries,electronics,beauty", "instant", "https://www.swiggy.com/instamart/search?query=", 35, 299, 6, 15, 0.91, ("INSTA50", 8, 50, 399)),
    ("BigBasket", "bigbasket", "groceries", "standard", "https://www.bigbasket.com/ps/?q=", 40, 600, 0, 240, 0.93, ("BBSAVE", 5, 100, 500)),
    ("Amazon Fresh", "amazon-fresh", "groceries", "standard", "https://www.amazon.in/s?i=nowstore&k=", 29, 499, 0, 180, 0.94, None),
    ("Amazon", "amazon", "shopping,electronics,fashion,beauty", "standard", "https://www.amazon.in/s?k=", 40, 499, 0, 1440, 0.95, None),
    ("Flipkart", "flipkart", "shopping,electronics,fashion", "standard", "https://www.flipkart.com/search?q=", 40, 499, 3, 1800, 0.93, ("FK5", 5, 75, 399)),
    ("Croma", "croma", "electronics", "standard", "https://www.croma.com/searchB?q=", 0, None, 0, 2880, 0.92, ("CROMA500", 5, 500, 2000)),
    ("Meesho", "meesho", "shopping,fashion", "standard", "https://www.meesho.com/search?q=", 0, None, 0, 4320, 0.80, None),
    ("Myntra", "myntra", "fashion,beauty", "standard", "https://www.myntra.com/", 79, 799, 0, 2880, 0.90, ("MYNTRA200", 10, 200, 999)),
    ("Ajio", "ajio", "fashion", "standard", "https://www.ajio.com/search/?text=", 99, 999, 0, 3600, 0.88, ("AJIO15", 15, 300, 1499)),
    ("Nykaa", "nykaa", "beauty", "standard", "https://www.nykaa.com/search/result/?q=", 70, 499, 0, 2160, 0.94, ("NYKAA10", 10, 100, 599)),
    ("Tira", "tira", "beauty", "standard", "https://www.tirabeauty.com/search?q=", 50, 499, 0, 2880, 0.92, None),
    ("Purplle", "purplle", "beauty", "standard", "https://www.purplle.com/search?q=", 49, 399, 0, 2880, 0.88, ("PURP15", 15, 120, 499)),
    ("Swiggy", "swiggy", "food", "food", "https://www.swiggy.com/search?query=", 39, None, 10, 35, 0.92, ("TRYSWIGGY", 20, 100, 249)),
    ("Zomato", "zomato", "food", "food", "https://www.zomato.com/", 35, None, 12, 33, 0.92, ("ZOMSAVE", 15, 120, 299)),
    ("Uber", "uber", "rides", "ride", "https://m.uber.com/", 0, None, 0, 5, 0.94, None),
    ("Ola", "ola", "rides", "ride", "https://www.olacabs.com/", 0, None, 0, 6, 0.88, None),
    ("Rapido", "rapido", "rides", "ride", "https://www.rapido.bike/", 0, None, 0, 4, 0.86, None),
]

G = ["blinkit", "zepto", "instamart", "bigbasket", "amazon-fresh"]
GI = ["blinkit", "zepto", "instamart"]          # fresh produce: mostly quick-commerce
B = ["nykaa", "purplle", "tira", "amazon"]
E = ["amazon", "flipkart", "croma"]
F = ["myntra", "ajio", "amazon", "flipkart"]
INSTANT = ["blinkit", "zepto", "instamart"]  # quick-commerce apps also stock popular electronics & beauty items
S = ["amazon", "flipkart"]
FOOD = ["swiggy", "zomato"]

# brand, name, variant, size_value, size_unit, category, subcategory, emoji, mrp, platforms, description
# Restaurant names are fictional. For food, "Veg"/"Non-veg" in the description sets the veg flag.
PRODUCTS = [
    # ---------- Groceries ----------
    ("Fresh", "Bananas Robusta", None, 6, "pcs", "groceries", "fruits-veg", "🍌", 60, G, None),
    ("Fresh", "Onion", None, 1000, "g", "groceries", "fruits-veg", "🧅", 45, G, None),
    ("Fresh", "Tomato Hybrid", None, 500, "g", "groceries", "fruits-veg", "🍅", 30, GI + ["bigbasket"], None),
    ("Fresh", "Shimla Apple", None, 4, "pcs", "groceries", "fruits-veg", "🍎", 160, G, None),
    ("Fresh", "Potato", None, 1000, "g", "groceries", "fruits-veg", "🥔", 40, G, None),
    ("Aashirvaad", "Shudh Chakki Atta", None, 5000, "g", "groceries", "staples", "🌾", 320, G, None),
    ("Aashirvaad", "Shudh Chakki Atta", None, 10000, "g", "groceries", "staples", "🌾", 610, G, None),
    ("India Gate", "Basmati Rice Classic", None, 5000, "g", "groceries", "staples", "🍚", 899, G, None),
    ("Tata Sampann", "Unpolished Toor Dal", None, 1000, "g", "groceries", "staples", "🫘", 210, G, None),
    ("Madhur", "Pure and Hygienic Sugar", None, 1000, "g", "groceries", "staples", "🍬", 60, G, None),
    ("Fortune", "Sunlite Refined Sunflower Oil", None, 1000, "ml", "groceries", "oil-masala", "🛢️", 175, G, None),
    ("Tata", "Salt Vacuum Evaporated Iodised", None, 1000, "g", "groceries", "oil-masala", "🧂", 28, G[:4], None),
    ("Everest", "Garam Masala", None, 100, "g", "groceries", "oil-masala", "🌶️", 92, G, None),
    ("Amul", "Pure Ghee", None, 1000, "ml", "groceries", "oil-masala", "🫙", 650, G, None),
    ("Amul", "Pasteurised Butter", None, 500, "g", "groceries", "dairy", "🧈", 285, G, None),
    ("Amul", "Pasteurised Butter", None, 100, "g", "groceries", "dairy", "🧈", 60, G[:4], None),
    ("Amul", "Taaza Toned Milk", None, 1000, "ml", "groceries", "dairy", "🥛", 56, G[:3], None),
    ("Amul", "Fresh Malai Paneer", None, 200, "g", "groceries", "dairy", "🧀", 95, G, None),
    ("Britannia", "100% Whole Wheat Bread", None, 450, "g", "groceries", "dairy", "🍞", 55, G, None),
    ("Fresh", "Farm Eggs", None, 6, "pcs", "groceries", "dairy", "🥚", 54, G, None),
    ("Maggi", "2-Minute Masala Noodles", None, 12, "pcs", "groceries", "snacks", "🍜", 168, G, None),
    ("Lay's", "India's Magic Masala Chips", None, 52, "g", "groceries", "snacks", "🥔", 20, G, None),
    ("Haldiram's", "Aloo Bhujia", None, 400, "g", "groceries", "snacks", "🥨", 110, G, None),
    ("Tata Tea", "Premium Tea", None, 500, "g", "groceries", "beverages", "🍵", 290, G, None),
    ("Nescafe", "Classic Instant Coffee", None, 100, "g", "groceries", "beverages", "☕", 370, G, None),
    ("Coca-Cola", "Soft Drink", None, 750, "ml", "groceries", "beverages", "🥤", 40, G, None),
    ("Surf Excel", "Easy Wash Detergent Powder", None, 1000, "g", "groceries", "household", "🧺", 140, G, None),
    ("Vim", "Lemon Dishwash Gel", None, 500, "ml", "groceries", "household", "🧽", 115, G, None),
    ("Harpic", "Power Plus Toilet Cleaner", None, 1000, "ml", "groceries", "household", "🧴", 199, G, None),
    ("Colgate", "Strong Teeth Toothpaste", None, 200, "g", "groceries", "personal-care", "🪥", 120, G, None),
    ("Dettol", "Original Liquid Handwash", None, 200, "ml", "groceries", "personal-care", "🧼", 99, G, None),
    # ---------- Beauty ----------
    ("Minimalist", "Salicylic Acid and LHA 2% Face Wash", None, 100, "ml", "beauty", "skincare", "🧴", 299, B + INSTANT, None),
    ("Minimalist", "Salicylic Acid 2% Face Serum", None, 30, "ml", "beauty", "skincare", "💧", 545, B, None),
    ("Cetaphil", "Gentle Skin Cleanser", None, 125, "ml", "beauty", "skincare", "🧴", 499, B + INSTANT, None),
    ("Cetaphil", "Gentle Skin Cleanser", None, 250, "ml", "beauty", "skincare", "🧴", 899, B, None),
    ("Plum", "Green Tea Pore Cleansing Face Wash", None, 100, "ml", "beauty", "skincare", "🍃", 345, B + INSTANT, None),
    ("Lakme", "Sun Expert SPF 50 PA+++ Sunscreen Lotion", None, 50, "ml", "beauty", "suncare", "☀️", 299, B + INSTANT, None),
    ("Lakme", "Sun Expert SPF 50 PA+++ Sunscreen Lotion", None, 100, "ml", "beauty", "suncare", "☀️", 499, B, None),
    ("Re'equil", "Ultra Matte Dry Touch Sunscreen SPF 50", None, 50, "g", "beauty", "suncare", "☀️", 695, B, None),
    ("Dove", "Intense Repair Shampoo", None, 340, "ml", "beauty", "haircare", "🫧", 380, B + INSTANT, None),
    ("Dove", "Intense Repair Shampoo", None, 650, "ml", "beauty", "haircare", "🫧", 699, B, None),
    ("Mamaearth", "Onion Hair Oil", None, 150, "ml", "beauty", "haircare", "🧴", 449, B + INSTANT, None),
    ("Maybelline", "Fit Me Matte Poreless Foundation", "Shade 128", 30, "ml", "beauty", "makeup", "💄", 649, B + ["myntra"], None),
    ("Maybelline", "Fit Me Matte Poreless Foundation", "Shade 220", 30, "ml", "beauty", "makeup", "💄", 649, B + ["myntra"], None),
    ("Lakme", "9to5 Primer + Matte Lipstick", "Red Coat", None, None, "beauty", "makeup", "💋", 599, B + ["myntra"], None),
    # ---------- Tech ----------
    ("boAt", "Airdopes 141 Wireless Earbuds", "Bold Black", None, None, "electronics", "audio", "🎧", 4490, E + INSTANT, None),
    ("JBL", "Flip 6 Portable Bluetooth Speaker", "Blue", None, None, "electronics", "audio", "🔊", 11999, E, None),
    ("Noise", "ColorFit Pro 5 Smartwatch", "Jet Black", None, None, "electronics", "wearables", "⌚", 6999, E + ["blinkit"], None),
    ("Samsung", "25W USB Type-C Fast Charger Adapter", "White", None, None, "electronics", "mobile-accessories", "🔌", 1699, E + INSTANT, None),
    ("Xiaomi", "Power Bank 20000mAh 33W", "Black", None, None, "electronics", "mobile-accessories", "🔋", 2999, E + INSTANT, None),
    ("Logitech", "M331 Silent Plus Wireless Mouse", "Black", None, None, "electronics", "computer-accessories", "🖱️", 1495, E + INSTANT, None),
    ("SanDisk", "Ultra Dual Drive USB Type-C Pendrive 128GB", None, None, None, "electronics", "computer-accessories", "💾", 1999, E + INSTANT, None),
    # ---------- Fashion ----------
    ("Levi's", "511 Slim Fit Jeans", "Size 32", None, None, "fashion", "men", "👖", 3299, F, None),
    ("Allen Solly", "Men's Regular Fit Polo T-Shirt", "Size M", None, None, "fashion", "men", "👕", 1299, F + ["meesho"], None),
    ("Libas", "Women's Printed Cotton Kurta", "Size M", None, None, "fashion", "women", "👘", 1999, F + ["meesho"], None),
    ("Only", "Women's High-Rise Wide Leg Jeans", "Size 28", None, None, "fashion", "women", "👖", 2799, F, None),
    ("Puma", "Smash v2 Unisex Sneakers", "UK 8", None, None, "fashion", "footwear", "👟", 3999, F, None),
    ("Puma", "Smash v2 Unisex Sneakers", "UK 9", None, None, "fashion", "footwear", "👟", 3999, F, None),
    ("Fastrack", "Analog Watch for Men", "Black Dial", None, None, "fashion", "accessories", "⌚", 1995, F, None),
    ("Wildcraft", "Unisex Laptop Backpack 35L", "Navy", None, None, "fashion", "accessories", "🎒", 2499, F + ["meesho"], None),
    # ---------- Home & everyday ----------
    ("Milton", "Thermosteel Flip Lid Flask", None, 1000, "ml", "shopping", "kitchen", "🫗", 1060, S + ["meesho"], None),
    ("Prestige", "Popular Aluminium Pressure Cooker", None, 3000, "ml", "shopping", "kitchen", "🍳", 1950, S, None),
    ("Cello", "Opalware Dinner Set 18 Pieces", None, None, None, "shopping", "kitchen", "🍽️", 2499, S + ["meesho"], None),
    ("Philips", "9W LED Bulb", None, 2, "pcs", "shopping", "home-essentials", "💡", 260, S + ["blinkit"], None),
    ("Solimo", "Cotton Double Bedsheet with 2 Pillow Covers", None, None, None, "shopping", "home-essentials", "🛏️", 1299, S + ["meesho"], None),
    # ---------- Food (fictional restaurants) ----------
    ("Spice Route Kitchen", "Chicken Dum Biryani", None, None, None, "food", "biryani", "🍛", 349, FOOD, "Serves 1 · Non-veg · Hyderabadi style"),
    ("Spice Route Kitchen", "Veg Dum Biryani", None, None, None, "food", "biryani", "🍚", 269, FOOD, "Serves 1 · Veg · Hyderabadi style"),
    ("Nawab's Kitchen", "Mutton Biryani", None, None, None, "food", "biryani", "🍛", 449, FOOD, "Serves 1 · Non-veg"),
    ("Spice Route Kitchen", "Paneer Butter Masala", None, None, None, "food", "north-indian", "🍲", 289, FOOD, "Serves 1 · Veg · North Indian"),
    ("Tandoor Tales", "Chicken Tikka", None, None, None, "food", "north-indian", "🍢", 319, FOOD, "Non-veg · 6 pieces"),
    ("Tandoor Tales", "Dal Makhani", None, None, None, "food", "north-indian", "🥘", 229, FOOD, "Veg · Serves 1"),
    ("Tandoor Tales", "Butter Naan", None, 2, "pcs", "food", "north-indian", "🫓", 90, FOOD, "Veg"),
    ("Dosa Junction", "Masala Dosa", None, None, None, "food", "south-indian", "🥞", 129, FOOD, "Veg · South Indian"),
    ("Dosa Junction", "Idli Vada Combo", None, None, None, "food", "south-indian", "🍥", 99, FOOD, "Veg · 2 idli + 1 vada"),
    ("Slice Society", "Margherita Pizza", "Medium", None, None, "food", "pizza", "🍕", 299, FOOD, "Veg · 8 inch"),
    ("Slice Society", "Margherita Pizza", "Large", None, None, "food", "pizza", "🍕", 499, FOOD, "Veg · 12 inch"),
    ("Slice Society", "Chicken Pepperoni Pizza", "Medium", None, None, "food", "pizza", "🍕", 399, FOOD, "Non-veg · 8 inch"),
    ("Burger Barn", "Classic Veg Burger", None, None, None, "food", "burgers", "🍔", 149, FOOD, "Veg"),
    ("Burger Barn", "Crispy Chicken Burger", None, None, None, "food", "burgers", "🍔", 189, FOOD, "Non-veg"),
    ("Momo Mania", "Chicken Steamed Momos", None, 8, "pcs", "food", "chinese", "🥟", 179, FOOD, "Non-veg · with chutney"),
    ("Momo Mania", "Veg Hakka Noodles", None, None, None, "food", "chinese", "🍜", 159, FOOD, "Veg"),
    ("Green Bowl Co.", "Quinoa Salad Bowl", None, None, None, "food", "healthy", "🥗", 279, FOOD, "Veg · High protein"),
    ("Green Bowl Co.", "Grilled Chicken Bowl", None, None, None, "food", "healthy", "🥙", 329, FOOD, "Non-veg · High protein"),
    ("Bowl & Brew", "Cold Coffee", None, 350, "ml", "food", "desserts-drinks", "🧋", 159, FOOD, "Veg"),
    ("Bowl & Brew", "Chocolate Brownie", None, None, None, "food", "desserts-drinks", "🍫", 129, FOOD, "Veg"),
]

# Each platform writes titles differently; this is what the matcher has to handle.
TITLE_STYLES = [
    lambda b, n, v, s: f"{b} {n}{' ' + v if v else ''}{', ' + s if s else ''}",
    lambda b, n, v, s: f"{b} {n} ({s})" if s else f"{b} {n} - {v or 'Standard'}",
    lambda b, n, v, s: f"{n} by {b}{' | ' + v if v else ''}{' | ' + s if s else ''}",
    lambda b, n, v, s: f"{b.upper()} {n}{' ' + s.replace(' ', '') if s else ''}{' ' + v if v else ''}",
]


def _size_label(value, unit) -> str:
    if value is None:
        return ""
    if unit == "ml":
        return f"{value / 1000:g} L" if value >= 1000 else f"{value:g} ml"
    if unit == "g":
        return f"{value / 1000:g} kg" if value >= 1000 else f"{value:g} g"
    return f"Pack of {value:g}"


def seed(db: Session, history_days: int = 30) -> None:
    rng = random.Random(42)
    platforms: dict[str, Platform] = {}
    for name, slug, cats, dtype, url, fee, free, pfee, mins, rel, coupon in PLATFORMS:
        p = Platform(name=name, slug=slug, categories=cats, delivery_type=dtype, base_url=url, delivery_fee=fee,
                     free_delivery_above=free, platform_fee=pfee, avg_delivery_mins=mins, reliability=rel)
        if coupon:
            p.coupon_code, p.coupon_percent, p.coupon_max, p.coupon_min_order = coupon
        db.add(p)
        platforms[slug] = p
    db.flush()

    now = utcnow()
    for i, (brand, name, variant, size_v, size_u, cat, sub, emoji, mrp, slugs, desc) in enumerate(PRODUCTS):
        veg = ("non-veg" not in desc.lower()) if cat == "food" and desc else None
        product = Product(brand=brand, name=name, variant=variant, size_value=size_v, size_unit=size_u,
                          category=cat, subcategory=sub, veg=veg, emoji=emoji, description=desc,
                          barcode=f"89{rng.randint(10**10, 10**11 - 1)}{i % 10}")
        db.add(product)
        db.flush()
        size = _size_label(size_v, size_u)
        for j, slug in enumerate(slugs):
            plat = platforms[slug]
            discount = rng.choice([0, 0.03, 0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25])
            current = round(mrp * (1 - discount))
            if cat == "food":
                title = f"{name}{' (' + variant + ')' if variant else ''} - {brand}"
                discount = rng.choice([0, 0, 0.05, 0.1, 0.15])
                current = round(mrp * rng.uniform(0.98, 1.08) * (1 - discount))  # menus differ slightly per app
            else:
                title = TITLE_STYLES[(i + j) % len(TITLE_STYLES)](brand, name, variant, size)
            query = f"{brand} {name} {variant or ''} {size}".split()
            url, _ = get_adapter(plat).product_link(" ".join(query))
            listing = Listing(
                product=product, platform=plat, title=title, mrp=max(mrp, current), price=current,
                in_stock=rng.random() > 0.08,
                delivery_mins=max(8, int(plat.avg_delivery_mins * rng.uniform(0.8, 1.3))),
                seller_rating=round(rng.uniform(3.8, 4.8), 1),
                url=url,
                data_source="sample", updated_at=now,
            )
            db.add(listing)
            db.flush()
            # Random-walk price history, walked backwards so it ends smoothly at today's price
            price = current
            db.add(PriceHistory(listing_id=listing.id, price=current, recorded_at=now))
            for d in range(1, history_days + 1):
                price = round(max(mrp * 0.6, min(mrp, price * rng.uniform(0.96, 1.04))))
                db.add(PriceHistory(listing_id=listing.id, price=price, recorded_at=now - timedelta(days=d)))
    db.commit()


def seed_if_empty(db: Session) -> bool:
    if db.scalar(select(Platform.id).limit(1)) is not None:
        return False
    seed(db)
    return True


if __name__ == "__main__":
    if "--reset" in sys.argv:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        print("Seeded sample data." if seed_if_empty(session) else "Data already present (use --reset).")
