"""Unit tests for the matching engine (no database needed)."""
from app.models import Product
from app.services.matching import match_title, parse_budget, parse_size, search


def P(id, brand, name, size=None, unit=None, variant=None, category="beauty"):
    return Product(id=id, brand=brand, name=name, size_value=size, size_unit=unit, variant=variant, category=category)


CATALOG = [
    P(1, "Cetaphil", "Gentle Skin Cleanser", 125, "ml"),
    P(2, "Cetaphil", "Gentle Skin Cleanser", 250, "ml"),
    P(3, "Minimalist", "Salicylic Acid and LHA 2% Face Wash", 100, "ml"),
    P(4, "Maybelline", "Fit Me Matte Poreless Foundation", 30, "ml", "Shade 128"),
    P(5, "Maybelline", "Fit Me Matte Poreless Foundation", 30, "ml", "Shade 220"),
    P(6, "Aashirvaad", "Shudh Chakki Atta", 5000, "g", category="groceries"),
]


def test_parse_size_units():
    assert parse_size("Fortune oil 1 L") == (1000, "ml")
    assert parse_size("Atta 5kg") == (5000, "g")
    assert parse_size("Maggi pack of 12") == (12, "pcs")
    assert parse_size("face wash (100 ml)") == (100, "ml")
    assert parse_size("2% salicylic acid") is None


def test_parse_budget():
    assert parse_budget("face wash under ₹300") == 300
    assert parse_budget("below Rs. 1,500") == 1500
    assert parse_budget("just a face wash") is None


def test_exact_size_match_across_title_styles():
    r = match_title("CETAPHIL Gentle Skin Cleanser 125ml", CATALOG)
    assert r.product.id == 1 and r.exact
    r = match_title("Gentle Skin Cleanser by Cetaphil | 250 ml", CATALOG)
    assert r.product.id == 2 and r.exact


def test_different_size_is_not_exact():
    r = match_title("Cetaphil Gentle Skin Cleanser 500 ml", CATALOG)
    assert r is not None and not r.exact
    assert "different size" in r.reason


def test_variant_must_match():
    r = match_title("Maybelline Fit Me Matte Poreless Foundation Shade 220 30ml", CATALOG)
    assert r.product.id == 5 and r.exact


def test_synonyms_cleanser_vs_face_wash():
    r = match_title("Minimalist 2% Salicylic Acid + LHA Cleanser 100ml", CATALOG)
    assert r.product.id == 3 and r.exact


def test_search_separates_alternatives():
    exact, alternatives = search("cetaphil gentle cleanser 125 ml", CATALOG)
    assert [r.product.id for r in exact] == [1]
    assert 2 in [r.product.id for r in alternatives]


def test_spec_example_query():
    exact, _ = search("Find Minimalist 2% Salicylic Acid Face Wash, 100 ml, below ₹300", CATALOG)
    assert exact and exact[0].product.id == 3
