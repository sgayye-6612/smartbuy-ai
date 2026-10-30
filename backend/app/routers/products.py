"""Modules 3, 4 and 5: search, AI product matching, price comparison, price history."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Comparison, Product, SearchHistory, User
from ..schemas import MatchIn
from ..security import get_optional_user
from ..services import matching
from ..services.filters import ListingFilter
from ..services.queries import compare_product, deal_verdict, group_by_product, listings_for, price_stats, product_out

router = APIRouter(prefix="/api", tags=["Products & Comparison"])


@router.get("/products")
def list_products(category: str | None = None, delivery: str | None = Query(None, description="instant | standard | any"),
                  user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    stmt = select(Product).order_by(Product.category, Product.subcategory, Product.brand)
    if category:  # one or more, comma separated: "electronics,fashion"
        stmt = stmt.where(Product.category.in_(category.split(",")))
    products = list(db.scalars(stmt))
    by_pid = group_by_product(listings_for(db, [p.id for p in products], ListingFilter(user, delivery)))
    # Only show products available with the current delivery / platform filters
    return [product_out(p, by_pid[p.id]) for p in products if by_pid.get(p.id)]


@router.get("/products/search")
def search_products(
    q: str = Query(min_length=1, max_length=300),
    category: str | None = None,
    max_price: float | None = None,
    delivery: str | None = Query(None, description="instant | standard | any"),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Search by name, brand, model, barcode or a natural-language sentence like
    'Minimalist 2% salicylic acid face wash 100 ml below ₹300'."""
    budget = max_price or matching.parse_budget(q)
    stmt = select(Product)
    if category:
        stmt = stmt.where(Product.category.in_(category.split(",")))
    products = list(db.scalars(stmt))
    exact, alternatives = matching.search(q, products)

    flt = ListingFilter(user, delivery)
    ids = [r.product.id for r in exact + alternatives]
    by_pid = group_by_product(listings_for(db, ids, flt))

    def out(r):
        data = product_out(r.product, by_pid.get(r.product.id, []))
        data.update(match_score=r.score, match_reason=r.reason)
        return data

    def ok(r):
        low = out(r)["lowest_price"]
        return budget is None or (low is not None and low <= budget)

    if user:
        db.add(SearchHistory(user_id=user.id, query=q))
        db.commit()

    return {
        "query": q,
        "parsed": {"size": matching.parse_size(q), "max_price": budget},
        "exact_matches": [out(r) for r in exact if ok(r)],
        "alternatives": [out(r) for r in alternatives if ok(r)],
        "filtered_to_your_platforms": bool(flt.by_category),
        "delivery_preference": flt.delivery,
    }


@router.get("/products/barcode/{code}")
def by_barcode(code: str, db: Session = Depends(get_db)):
    p = db.scalar(select(Product).where(Product.barcode == code))
    if not p:
        raise HTTPException(404, "No product with this barcode in the catalog")
    return product_out(p)


@router.post("/products/match")
def match_listing_title(body: MatchIn, db: Session = Depends(get_db)):
    """Demo of AI product matching: give any raw listing title, get the catalog product it refers to."""
    products = list(db.scalars(select(Product)))
    result = matching.match_title(body.title, products)
    if not result:
        return {"matched": False, "message": "No similar product found"}
    return {"matched": True, "exact": result.exact, "confidence": result.score, "reason": result.reason,
            "product": product_out(result.product)}


@router.get("/products/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db)):
    p = db.get(Product, product_id)
    if not p:
        raise HTTPException(404, "Product not found")
    return product_out(p, listings_for(db, [p.id]))


@router.get("/products/{product_id}/history")
def product_history(product_id: int, days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    if not db.get(Product, product_id):
        raise HTTPException(404, "Product not found")
    return price_stats(db, product_id, days)


@router.get("/compare/{product_id}")
def compare(
    product_id: int,
    quantity: int = Query(1, ge=1, le=50),
    delivery: str | None = Query(None, description="instant | standard | any"),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(404, "Product not found")
    result = compare_product(db, product, ListingFilter(user, delivery), quantity)
    stats = price_stats(db, product_id)
    result["history"] = stats
    if result["best"]:
        result["deal"] = deal_verdict(result["best"]["price"], stats)
        if user:
            highest = max(o["final_price"] for o in result["offers"] if o["in_stock"])
            db.add(Comparison(user_id=user.id, product_id=product_id, best_platform_id=result["best"]["platform"]["id"],
                              best_total=result["best"]["final_price"], highest_total=highest))
            db.commit()
    return result
