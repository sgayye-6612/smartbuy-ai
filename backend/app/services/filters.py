"""Decides which platform listings a user sees.

* Platform choices are PER CATEGORY: choosing Amazon for electronics does not
  include Amazon in grocery comparisons.
* A category with no saved choice compares every platform for it.
* Delivery preference (instant / standard / any) applies to physical goods.
  Food and rides have their own delivery models, so it doesn't apply there.
"""
from ..models import Listing, User

CATEGORIES = ["groceries", "food", "rides", "electronics", "fashion", "beauty", "shopping"]
CATEGORY_LABELS = {
    "groceries": "Groceries", "food": "Food", "rides": "Rides", "electronics": "Tech",
    "fashion": "Fashion", "beauty": "Beauty", "shopping": "Home",
}
DELIVERY_OPTIONS = {"instant", "standard", "any"}


class ListingFilter:
    def __init__(self, user: User | None = None, delivery: str | None = None):
        self.by_category: dict[str, set[int]] = {}
        self.favorite: dict[str, int] = {}
        if user:
            for pref in user.platform_prefs:
                self.by_category.setdefault(pref.category, set()).add(pref.platform_id)
                if pref.is_favorite:
                    self.favorite[pref.category] = pref.platform_id
        default = user.delivery_preference if user else "any"
        self.delivery = delivery if delivery in DELIVERY_OPTIONS else default

    def platforms_for(self, category: str) -> set[int] | None:
        return self.by_category.get(category)

    def allows(self, listing: Listing) -> bool:
        chosen = self.by_category.get(listing.product.category)
        if chosen and listing.platform_id not in chosen:
            return False
        dtype = listing.platform.delivery_type
        if self.delivery in ("instant", "standard") and dtype in ("instant", "standard") and dtype != self.delivery:
            return False
        return True

    def is_favorite(self, listing: Listing) -> bool:
        return self.favorite.get(listing.product.category) == listing.platform_id

    def __call__(self, listing: Listing) -> bool:
        return self.allows(listing)
