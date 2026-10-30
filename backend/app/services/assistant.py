"""AI shopping assistant.

Step 1: turn the user's message into structured requirements
        (intent, product query, budget, family size).
        - If ANTHROPIC_API_KEY is set, an LLM does this.
        - Otherwise a rule-based parser does it, so the app works offline.
Step 2: run the normal search / comparison / basket engines with those
        requirements. The LLM never invents prices; all numbers come from
        the comparison engine.
"""
import json
import logging
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import ANTHROPIC_API_KEY, LLM_MODEL
from ..models import Platform, Product, User
from . import geo, matching, rides
from .basket import optimize
from .filters import ListingFilter
from .queries import compare_product, deal_verdict, listings_for, price_stats, product_out

log = logging.getLogger(__name__)

FILLER = re.compile(
    r"\b(find|show|get|give|me|a|an|the|some|cheapest|cheap|best|reliable|good|please|"
    r"compare|across|my|selected|applications|apps|platforms|which|platform|offers|total|price|"
    r"is|current|deal|this|for|i|want|need|buy|looking|can|you)\b",
    re.IGNORECASE,
)

# Staples used for "groceries for a family of N under ₹X"
STAPLES = ["atta", "dal", "oil", "milk", "salt", "sugar", "rice", "tea", "butter", "noodles", "detergent", "toothpaste"]


WORD_NUMBERS = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6",
                "seven": "7", "eight": "8", "nine": "9", "ten": "10"}


def format_eta(mins: int) -> str:
    if mins < 60:
        return f"{mins} min"
    if mins < 24 * 60:
        return f"{round(mins / 60)} hr"
    days = round(mins / (24 * 60))
    return f"{days} day" + ("s" if days > 1 else "")


def rule_based_parse(text: str) -> dict:
    lower = text.lower()
    for word, digit in WORD_NUMBERS.items():
        lower = re.sub(rf"\b{word}\b", digit, lower)
    budget = matching.parse_budget(text)
    family = re.search(r"family\s+of\s+(\d+)|(\d+)\s+(?:people|members|persons)", lower)
    family_size = int(next(g for g in family.groups() if g)) if family else None

    ride = re.search(r"\bfrom\s+(.+?)\s+to\s+(.+?)(?:[?.!]|$)", text, re.IGNORECASE)
    if ride and re.search(r"\b(ride|cab|taxi|auto|bike|uber|ola|rapido|go|travel|trip|reach)\b", lower):
        return {"intent": "ride", "query": "", "pickup": ride.group(1).strip(), "drop": ride.group(2).strip(),
                "max_price": None, "family_size": None, "parser": "rules"}

    if family_size or re.search(r"\b(groceries|grocery list|monthly ration|basket)\b", lower):
        intent = "basket"
    elif re.search(r"\b(good deal|worth it|is .* deal|right time)\b", lower):
        intent = "deal_check"
    elif "compare" in lower or "which platform" in lower:
        intent = "compare"
    else:
        intent = "search"

    query = matching.strip_budget(text)
    query = FILLER.sub(" ", query)
    query = re.sub(r"[?.,!]", " ", query)
    query = re.sub(r"\s+", " ", query).strip()
    return {"intent": intent, "query": query, "max_price": budget, "family_size": family_size, "parser": "rules"}


def llm_parse(text: str) -> dict | None:
    if not ANTHROPIC_API_KEY:
        return None
    try:
        import anthropic  # optional dependency

        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        msg = client.messages.create(
            model=LLM_MODEL,
            max_tokens=300,
            system=(
                "You convert Indian shopping requests into JSON with keys: "
                "intent (one of search, compare, deal_check, basket, ride), "
                "query (product or dish words only, keep brand, size and variant), "
                "max_price (number in rupees or null), family_size (number or null), "
                "pickup and drop (place names, only for ride, else null). "
                "Reply with JSON only."
            ),
            messages=[{"role": "user", "content": text}],
        )
        raw = msg.content[0].text.strip()
        raw = raw[raw.find("{"): raw.rfind("}") + 1]
        data = json.loads(raw)
        data["parser"] = "llm"
        return data
    except Exception as exc:  # network errors, bad JSON, missing package...
        log.warning("LLM parse failed, falling back to rules: %s", exc)
        return None


def parse_request(text: str) -> dict:
    return llm_parse(text) or rule_based_parse(text)


def _within_budget(results, product_prices: dict[int, float | None], budget: float | None):
    if budget is None:
        return results
    return [r for r in results if (product_prices.get(r.product.id) or 1e12) <= budget]


def answer(db: Session, user: User | None, message: str) -> dict:
    parsed = parse_request(message)
    flt = ListingFilter(user)
    response: dict = {"parsed": parsed, "products": [], "comparison": None, "basket": None, "deal": None, "rides": None}

    if parsed["intent"] == "ride":
        return _ride_answer(db, parsed, flt, response)

    products = list(db.scalars(select(Product)))
    if parsed["intent"] == "basket":
        return _basket_answer(db, parsed, products, flt, response)

    exact, alternatives = matching.search(parsed["query"] or message, products)
    ids = [r.product.id for r in exact + alternatives]
    listings = listings_for(db, ids, flt)
    lowest: dict[int, float | None] = {}
    for l in listings:
        if l.in_stock:
            lowest[l.product_id] = min(l.price, lowest.get(l.product_id) or l.price)

    exact = _within_budget(exact, lowest, parsed.get("max_price"))
    alternatives = _within_budget(alternatives, lowest, parsed.get("max_price"))
    matches = exact or alternatives
    response["products"] = [
        {**product_out(r.product), "lowest_price": lowest.get(r.product.id), "exact": r.exact} for r in matches[:6]
    ]

    if not matches:
        budget = parsed.get("max_price")
        response["reply"] = (
            f"I couldn't find anything matching \"{parsed['query']}\""
            + (f" under ₹{budget:.0f}" if budget else "")
            + " on your selected platforms. Try a broader search or add more platforms."
        )
        return response

    top = matches[0].product
    comparison = compare_product(db, top, flt)
    response["comparison"] = comparison
    best = comparison["best"]
    if not best:
        response["reply"] = f"{product_out(top)['display_name']} is out of stock on your selected platforms right now."
        return response

    lines = [
        f"Best option for {product_out(top)['display_name']}: **{best['platform']['name']}** "
        f"at ₹{best['final_price']:.0f} final price ({format_eta(best['delivery_mins'])} delivery)."
    ]
    if comparison.get("favorite_note"):
        lines.append(comparison["favorite_note"])
    lines += [f"• {r}" for r in comparison["reasons"]]
    if comparison["savings"] > 0:
        lines.append(f"You save up to ₹{comparison['savings']:.0f} versus the most expensive option.")

    if parsed["intent"] == "deal_check":
        deal = deal_verdict(best["price"], price_stats(db, top.id))
        response["deal"] = deal
        lines.append(f"Deal check: {deal['message']}")
    if len(matches) > 1:
        lines.append(f"I also found {len(matches) - 1} other matching product(s) below.")
    response["reply"] = "\n".join(lines)
    return response


def _ride_answer(db, parsed, flt, response) -> dict:
    found_pickup = geo.search(parsed.get("pickup") or "", limit=1)
    pickup = found_pickup[0] if found_pickup else None
    found_drop = geo.search(parsed.get("drop") or "", (pickup["lat"], pickup["lng"]) if pickup else None, limit=1)
    drop = found_drop[0] if found_drop else None
    if not pickup or not drop:
        response["reply"] = "I couldn't find one of those places. Try a fuller address, or use the Rides tab to pick from suggestions."
        return response
    chosen = flt.platforms_for("rides")
    platforms = [p for p in db.scalars(select(Platform).where(Platform.delivery_type == "ride"))
                 if chosen is None or p.id in chosen]
    result = rides.estimate(platforms, pickup, drop, flt.favorite.get("rides"))
    response["rides"] = result
    c, b = result["cheapest"], result["best"]
    if not c:
        response["reply"] = "No rides are available right now on your selected apps."
        return response
    lines = [f"{pickup['label']} → {drop['label']}: about {result['distance_km']} km by road, ~{result['duration_mins']} min.",
             f"Cheapest: **{c['product']}** at ~₹{c['fare_estimate']} (pickup in {c['pickup_eta_mins']} min)."]
    if b and b is not c:
        lines.append(f"Best overall: **{b['product']}** at ~₹{b['fare_estimate']}, pickup in {b['pickup_eta_mins']} min.")
    lines.append("Fares are estimates. The app shows the final fare before you book.")
    response["reply"] = "\n".join(lines)
    return response


def _basket_answer(db, parsed, products, flt, response) -> dict:
    budget = parsed.get("max_price")
    family = parsed.get("family_size") or 2
    groceries = [p for p in products if p.category == "groceries"]
    listings = listings_for(db, [p.id for p in groceries], flt)
    lowest: dict[int, float] = {}
    for l in listings:
        if l.in_stock:
            lowest[l.product_id] = min(l.price, lowest.get(l.product_id, l.price))

    chosen: list[tuple[int, int]] = []
    running = 0.0
    for staple in STAPLES:
        candidates = [p for p in groceries if p.id in lowest and staple in matching.normalize(p.name + " " + p.brand)]
        if not candidates:
            continue
        # Prefer the smaller pack for small families, bigger for 4+
        candidates.sort(key=lambda p: (p.size_value or 0), reverse=family >= 4)
        qty = max(1, family // 2) if staple in {"milk", "noodles"} else 1
        for p in candidates:  # fall back to a smaller pack if the bigger one doesn't fit
            cost = lowest[p.id] * qty
            if budget and running + cost > budget * 0.9:  # leave ~10% room for fees
                continue
            chosen.append((p.id, qty))
            running += cost
            break

    if not chosen:
        response["reply"] = "I couldn't build a grocery basket within that budget on your selected platforms."
        return response

    result = optimize(chosen, [l for l in listings if l.product_id in {pid for pid, _ in chosen}])
    response["basket"] = {
        "items": [{**product_out(next(p for p in groceries if p.id == pid)), "quantity": q} for pid, q in chosen],
        "optimization": result,
    }
    rec = result["recommendation"]
    total = rec["plan"]["total"]
    reply = [f"Here's a staples basket for a family of {family}: {len(chosen)} items, ₹{total:.0f} total including fees."]
    if budget:
        reply.append(f"That's ₹{budget - total:.0f} under your ₹{budget:.0f} budget." if total <= budget
                     else f"That's ₹{total - budget:.0f} over budget. Remove an item to fit.")
    reply.append(rec["message"])
    reply.append("Add these to your basket to adjust quantities.")
    response["reply"] = "\n".join(reply)
    return response
