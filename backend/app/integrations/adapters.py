"""Integration adapters: one per platform.

Every platform goes through an adapter, so the rest of the app never needs to
know whether data is live or sample, or how checkout works on that platform.

Rules this project follows:
  * Only official APIs / authorised integrations. No scraping, no bypassing
    platform terms or security.
  * Where no live integration is configured, the adapter serves clearly
    labelled SAMPLE data.
  * SmartBuy never claims an order was placed. Unless an adapter supports
    direct checkout through an authorised integration, the user is handed off
    to the platform to finish there.

To go live on a platform later: implement `fetch_offers` / `place_order` in its
adapter using the official API, set `mode = "live"`, and the UI updates itself.
"""
from dataclasses import dataclass
from urllib.parse import quote_plus, urlencode


@dataclass
class CheckoutHandoff:
    mode: str            # "direct" | "redirect"
    url: str
    platform: str
    message: str
    link_precision: str  # "exact" (product/booking page) | "search" (platform search results) | "home"


class PlatformAdapter:
    slug = ""
    name = ""
    mode = "sample"                     # "live" when an authorised integration is configured
    supports_direct_checkout = False
    checkout_verb = "Buy on"
    official_route = "No public API for price comparison. Using sample data."

    def __init__(self, base_url: str = ""):
        self.base_url = base_url

    # ---------- links ----------
    def product_link(self, query: str) -> tuple[str, str]:
        """Best link to this product on the platform -> (url, precision)."""
        return self.base_url + quote_plus(query), "search"

    # ---------- checkout ----------
    def checkout(self, query: str) -> CheckoutHandoff:
        if self.supports_direct_checkout:  # pragma: no cover - no live integrations yet
            raise NotImplementedError("Implement place_order() with the official API")
        url, precision = self.product_link(query)
        where = {"exact": "the product page", "search": "search results for this item"}.get(precision, f"{self.name}, where you can search for it")
        return CheckoutHandoff(
            mode="redirect",
            url=url,
            platform=self.name,
            link_precision=precision,
            message=f"{self.checkout_verb} {self.name}: we'll open {where}. "
                    f"You'll finish checkout on {self.name}. SmartBuy doesn't place orders.",
        )

    def info(self) -> dict:
        return {
            "slug": self.slug,
            "name": self.name,
            "mode": self.mode,
            "direct_checkout": self.supports_direct_checkout,
            "checkout_verb": self.checkout_verb,
            "official_route": self.official_route,
        }


# ---------- Shopping ----------
class AmazonAdapter(PlatformAdapter):
    slug, name = "amazon", "Amazon"
    official_route = ("Amazon Product Advertising API 5.0 (needs an approved Amazon Associates account). "
                      "Not configured, so showing sample data.")


class AmazonFreshAdapter(AmazonAdapter):
    slug, name = "amazon-fresh", "Amazon Fresh"


class FlipkartAdapter(PlatformAdapter):
    slug, name = "flipkart", "Flipkart"
    official_route = "Flipkart Affiliate API (needs an approved affiliate account). Not configured, so showing sample data."


class GroceryAdapter(PlatformAdapter):
    official_route = "No public consumer API. Would need a partner integration. Showing sample data."


class BlinkitAdapter(GroceryAdapter):
    slug, name = "blinkit", "Blinkit"


class ZeptoAdapter(GroceryAdapter):
    slug, name = "zepto", "Zepto"


class InstamartAdapter(GroceryAdapter):
    slug, name = "instamart", "Swiggy Instamart"


class BigBasketAdapter(GroceryAdapter):
    slug, name = "bigbasket", "BigBasket"


class GenericShopAdapter(PlatformAdapter):
    official_route = "Affiliate feeds may be available via affiliate networks. Not configured, so showing sample data."


class CromaAdapter(GenericShopAdapter):
    slug, name = "croma", "Croma"


class MyntraAdapter(GenericShopAdapter):
    slug, name = "myntra", "Myntra"


class AjioAdapter(GenericShopAdapter):
    slug, name = "ajio", "Ajio"


class MeeshoAdapter(GenericShopAdapter):
    slug, name = "meesho", "Meesho"


class NykaaAdapter(GenericShopAdapter):
    slug, name = "nykaa", "Nykaa"


class PurplleAdapter(GenericShopAdapter):
    slug, name = "purplle", "Purplle"


class TiraAdapter(GenericShopAdapter):
    slug, name = "tira", "Tira"


# ---------- Food ----------
class FoodAdapter(PlatformAdapter):
    checkout_verb = "Order on"
    official_route = "No public ordering API for consumers. Showing sample menus and prices."


class SwiggyAdapter(FoodAdapter):
    slug, name = "swiggy", "Swiggy"


class ZomatoAdapter(FoodAdapter):
    slug, name = "zomato", "Zomato"

    def product_link(self, query: str) -> tuple[str, str]:
        return self.base_url, "home"  # no public search URL, so open Zomato and search there


# ---------- Rides ----------
class RideAdapter(PlatformAdapter):
    checkout_verb = "Book on"
    official_route = "No public fare API. Fares are simulated estimates."

    def ride_link(self, pickup: dict, drop: dict) -> tuple[str, str]:
        return self.base_url, "home"


class UberAdapter(RideAdapter):
    slug, name = "uber", "Uber"
    official_route = ("Uber's official universal deep link pre-fills pickup and drop. "
                      "Fares are simulated (Uber's price-estimate API needs partner access).")

    def ride_link(self, pickup: dict, drop: dict) -> tuple[str, str]:
        params = {
            "action": "setPickup",
            "pickup[latitude]": pickup["lat"], "pickup[longitude]": pickup["lng"], "pickup[nickname]": pickup["name"],
            "dropoff[latitude]": drop["lat"], "dropoff[longitude]": drop["lng"], "dropoff[nickname]": drop["name"],
        }
        return "https://m.uber.com/ul/?" + urlencode(params), "exact"


class OlaAdapter(RideAdapter):
    slug, name = "ola", "Ola"


class RapidoAdapter(RideAdapter):
    slug, name = "rapido", "Rapido"


_ADAPTERS = {cls.slug: cls for cls in [
    AmazonAdapter, AmazonFreshAdapter, FlipkartAdapter, BlinkitAdapter, ZeptoAdapter, InstamartAdapter,
    BigBasketAdapter, CromaAdapter, MyntraAdapter, AjioAdapter, MeeshoAdapter, NykaaAdapter, PurplleAdapter,
    TiraAdapter, SwiggyAdapter, ZomatoAdapter, UberAdapter, OlaAdapter, RapidoAdapter,
]}


def get_adapter(platform) -> PlatformAdapter:
    cls = _ADAPTERS.get(platform.slug, PlatformAdapter)
    adapter = cls(platform.base_url)
    if not adapter.name:
        adapter.name = platform.name
    return adapter
