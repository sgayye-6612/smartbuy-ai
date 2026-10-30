"""Product normalisation, search and exact-match validation.

The key rule from the spec: different sizes or variants are NOT exact matches.
They are returned separately as alternatives.

This uses lightweight text similarity (token overlap + difflib) so it runs
anywhere with no model download. `semantic_score` is the single place to swap
in Sentence Transformers embeddings later.
"""
import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from ..models import Product

# Words that describe the same thing differently on different platforms
SYNONYMS = {
    r"\bface\s*wash\b": "facewash",
    r"\bcleanser\b": "facewash",
    r"\bsun\s*screen\b": "sunscreen",
    r"\bsunblock\b": "sunscreen",
    r"\bear\s*buds\b": "earbuds",
    r"\btws\b": "earbuds",
    r"\b(head|ear)phones?\b": "earbuds",
    r"\bpen\s*drive\b": "pendrive",
    r"\bflash\s*drive\b": "pendrive",
    r"\bwheat\s*flour\b": "atta",
    r"\bchakki\s*atta\b": "atta",
    r"\bdetergent\s*powder\b": "detergent",
    r"\btoothpaste\b": "toothpaste",
}

STOPWORDS = {
    "the", "a", "an", "and", "for", "with", "of", "in", "new", "buy", "online", "best",
    "pack", "combo", "free", "offer", "original", "genuine", "india", "find", "me",
    "show", "cheapest", "cheap", "reliable", "good", "please", "price", "compare",
    "this", "my", "selected", "applications", "apps", "across", "on", "i", "want", "need",
}

_UNIT_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(ml|millilitres?|milliliters?|ltrs?|litres?|liters?|l|kgs?|kilograms?|g|gms?|grams?|pcs|pieces|pc|n)\b",
    re.IGNORECASE,
)
_PACK_RE = re.compile(r"pack\s*of\s*(\d+)", re.IGNORECASE)
_BUDGET_RE = re.compile(
    r"(?:under|below|less\s+than|within|upto|up\s+to|max|<)\s*(?:₹|rs\.?|inr)?\s*([\d,]+)", re.IGNORECASE
)
_BARCODE_RE = re.compile(r"^\d{8,14}$")


def parse_size(text: str) -> tuple[float, str] | None:
    """'1 L' -> (1000, 'ml'), '5kg' -> (5000, 'g'), 'pack of 12' -> (12, 'pcs')."""
    pack = _PACK_RE.search(text)
    if pack:
        return float(pack.group(1)), "pcs"
    m = _UNIT_RE.search(text)
    if not m:
        return None
    value, unit = float(m.group(1)), m.group(2).lower()
    if unit.startswith(("l", "lt")) and not unit.startswith("ml"):
        return value * 1000, "ml"
    if unit.startswith("ml") or unit.startswith("milli"):
        return value, "ml"
    if unit.startswith("k"):
        return value * 1000, "g"
    if unit.startswith("g"):
        return value, "g"
    return value, "pcs"


def parse_budget(text: str) -> float | None:
    m = _BUDGET_RE.search(text)
    return float(m.group(1).replace(",", "")) if m else None


def strip_budget(text: str) -> str:
    return _BUDGET_RE.sub(" ", text)


def normalize(text: str) -> str:
    text = text.lower().replace("&", " and ").replace("+", " ")
    text = _PACK_RE.sub(" ", text)
    text = _UNIT_RE.sub(" ", text)
    for pattern, replacement in SYNONYMS.items():
        text = re.sub(pattern, replacement, text)
    text = re.sub(r"[^a-z0-9% ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokens(text: str) -> set[str]:
    return {t for t in normalize(text).split() if t not in STOPWORDS and (len(t) > 1 or t.isdigit()) or t.endswith("%")}


def product_text(p: Product) -> str:
    return " ".join(x for x in [p.brand, p.name, p.variant or ""] if x)


def semantic_score(a: str, b: str) -> float:
    """0..1 similarity. Swap for embedding cosine similarity to upgrade."""
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    overlap = len(ta & tb) / len(ta | tb)
    coverage = len(ta & tb) / len(ta)  # how much of the query is explained
    seq = SequenceMatcher(None, normalize(a), normalize(b)).ratio()
    return round(0.4 * coverage + 0.35 * overlap + 0.25 * seq, 4)


def same_size(p: Product, size: tuple[float, str] | None) -> bool:
    if size is None or p.size_value is None:
        return True
    return p.size_unit == size[1] and abs(p.size_value - size[0]) < 0.01


def format_size(p: Product) -> str:
    if p.size_value is None:
        return ""
    v, u = p.size_value, p.size_unit
    if u == "ml" and v >= 1000:
        return f"{v / 1000:g} L"
    if u == "g" and v >= 1000:
        return f"{v / 1000:g} kg"
    if u == "pcs":
        return f"Pack of {v:g}"
    return f"{v:g} {u}"


@dataclass
class MatchResult:
    product: Product
    score: float
    exact: bool
    reason: str


def match_title(title: str, products: list[Product]) -> MatchResult | None:
    """Decide which catalog product a raw platform listing title refers to."""
    size = parse_size(title)
    title_tokens = tokens(title)
    best: MatchResult | None = None
    for p in products:
        score = semantic_score(product_text(p), title)
        brand_ok = tokens(p.brand) <= title_tokens
        if not brand_ok:
            score *= 0.5
        size_ok = same_size(p, size)
        variant_ok = not p.variant or tokens(p.variant) <= title_tokens
        exact = brand_ok and size_ok and variant_ok and score >= 0.45
        if size is not None and p.size_value is not None and not size_ok:
            score *= 0.85  # still similar, but a different size
        reasons = []
        reasons.append("brand matches" if brand_ok else "brand differs")
        if size is not None and p.size_value is not None:
            reasons.append("same size" if size_ok else f"different size (catalog: {format_size(p)})")
        if p.variant:
            reasons.append("same variant" if variant_ok else f"different variant (catalog: {p.variant})")
        result = MatchResult(p, round(score, 3), exact, ", ".join(reasons))
        if best is None or (result.exact, result.score) > (best.exact, best.score):
            best = result
    if best and best.score < 0.25:
        return None
    return best


def search(query: str, products: list[Product]) -> tuple[list[MatchResult], list[MatchResult]]:
    """Return (exact_matches, alternatives) for a free-text query."""
    q = strip_budget(query).strip()
    if _BARCODE_RE.match(q):
        exact = [MatchResult(p, 1.0, True, "barcode match") for p in products if p.barcode == q]
        return exact, []

    size = parse_size(q)
    q_tokens = tokens(q)
    # Words that only appear in variants (sizes, shades...). If the query uses them, variants must match.
    variant_vocab = set().union(*(tokens(p.variant) for p in products if p.variant)) if products else set()
    asks_variant = bool(q_tokens & variant_vocab)
    scored: list[MatchResult] = []
    for p in products:
        text = product_text(p) + " " + p.category
        score = semantic_score(q, text)
        brand_mentioned = bool(tokens(p.brand) & q_tokens)
        if brand_mentioned:
            score += 0.1
        if score < 0.3:
            continue
        size_ok = same_size(p, size)
        variant_ok = not p.variant or not asks_variant or not (tokens(p.variant) - q_tokens)
        exact = size_ok and variant_ok and score >= 0.45
        if exact:
            reason = "matches your search"
        elif not size_ok and brand_mentioned:
            reason = f"same product, different size: {format_size(p)}"
        elif not variant_ok:
            reason = f"different variant: {p.variant}"
        else:
            reason = "similar product"
        scored.append(MatchResult(p, round(min(score, 1.0), 3), exact, reason))

    scored.sort(key=lambda r: r.score, reverse=True)
    if scored and size is None:
        # Without a requested size, the top-scoring group counts as exact
        top = scored[0].score
        for r in scored:
            r.exact = r.score >= max(0.45, top - 0.12)
    exact = [r for r in scored if r.exact]
    alternatives = [r for r in scored if not r.exact][:8]
    return exact, alternatives
