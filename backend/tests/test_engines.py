"""Unit tests for the comparison and basket engines using hand-made data."""
from types import SimpleNamespace as NS

from app.services.basket import optimize
from app.services.comparison import build_offer, fees_for_subtotal, rank_offers


def plat(id, name, delivery=40, free_above=None, fee=0, rel=0.9, coupon=0, cmax=None, cmin=0):
    return NS(id=id, name=name, slug=name.lower(), delivery_type="standard", delivery_fee=delivery, free_delivery_above=free_above,
              platform_fee=fee, reliability=rel, coupon_code="X" if coupon else None, coupon_percent=coupon,
              coupon_max=cmax, coupon_min_order=cmin)


def listing(id, product_id, platform, price, mins=60, stock=True):
    return NS(id=id, product_id=product_id, platform_id=platform.id, platform=platform, price=price, mrp=price * 1.2,
              title=f"item {product_id}", in_stock=stock, delivery_mins=mins, seller_rating=4.5, url="#",
              data_source="sample", updated_at=None)


def test_fees_free_delivery_and_coupon():
    p = plat(1, "A", delivery=30, free_above=200, fee=5, coupon=10, cmax=25, cmin=100)
    assert fees_for_subtotal(p, 150)["total"] == 150 + 30 + 5 - 15
    assert fees_for_subtotal(p, 300)["total"] == 300 + 0 + 5 - 25  # coupon capped at 25


def test_cheapest_sticker_price_is_not_always_best():
    a = plat(1, "A", delivery=99)            # cheap item, expensive delivery
    b = plat(2, "B", delivery=0)
    offers = [build_offer(listing(1, 1, a, 100)), build_offer(listing(2, 1, b, 150))]
    result = rank_offers(offers)
    assert result["cheapest"]["platform"]["name"] == "B"  # 150 < 199 final
    assert result["best"]["platform"]["name"] == "B"


def test_out_of_stock_never_recommended():
    a, b = plat(1, "A", delivery=0), plat(2, "B", delivery=0)
    result = rank_offers([build_offer(listing(1, 1, a, 10, stock=False)), build_offer(listing(2, 1, b, 500))])
    assert result["best"]["platform"]["name"] == "B"


def test_basket_prefers_single_when_fees_outweigh_savings():
    a, b = plat(1, "A", delivery=50), plat(2, "B", delivery=50)
    ls = [listing(1, 1, a, 100), listing(2, 2, a, 100), listing(3, 1, b, 95), listing(4, 2, b, 110)]
    r = optimize([(1, 1), (2, 1)], ls)
    assert r["recommendation"]["type"] == "single"


def test_basket_splits_when_it_saves_money():
    a, b = plat(1, "A", delivery=10), plat(2, "B", delivery=10)
    ls = [listing(1, 1, a, 100), listing(2, 2, a, 500), listing(3, 1, b, 400), listing(4, 2, b, 120)]
    r = optimize([(1, 1), (2, 1)], ls)
    assert r["recommendation"]["type"] == "split"
    assert r["best_split"]["total"] == 100 + 10 + 120 + 10
    assert r["savings_vs_single"] > 0


def test_basket_split_when_no_single_platform_has_everything():
    a, b = plat(1, "A"), plat(2, "B")
    r = optimize([(1, 1), (2, 1)], [listing(1, 1, a, 100), listing(2, 2, b, 100)])
    assert r["best_single"] is None and r["recommendation"]["type"] == "split"
