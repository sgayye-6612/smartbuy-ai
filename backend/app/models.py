"""Database tables.

If you know Entity Framework: each class here is like an entity class,
and SQLAlchemy creates/maps the table for it.
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    delivery_preference: Mapped[str] = mapped_column(String(10), default="any")  # instant | standard | any
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    platform_prefs: Mapped[list["UserPlatform"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class UserPlatform(Base):
    """Which platforms a user compares, SEPARATELY for each category.
    e.g. Amazon for electronics but Zepto (not Amazon) for groceries."""

    __tablename__ = "user_platforms"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    category: Mapped[str] = mapped_column(String(40), primary_key=True)
    platform_id: Mapped[int] = mapped_column(ForeignKey("platforms.id", ondelete="CASCADE"), primary_key=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)


class AppMeta(Base):
    """Small key/value table, used to track the database schema version."""

    __tablename__ = "app_meta"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[str] = mapped_column(String(200))


class Platform(Base):
    __tablename__ = "platforms"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    categories: Mapped[str] = mapped_column(String(160))  # comma separated, e.g. "shopping,beauty"
    delivery_type: Mapped[str] = mapped_column(String(20), default="standard")  # instant | standard | food | ride
    base_url: Mapped[str] = mapped_column(String(255))
    delivery_fee: Mapped[float] = mapped_column(Float, default=0)
    free_delivery_above: Mapped[float | None] = mapped_column(Float, nullable=True)
    platform_fee: Mapped[float] = mapped_column(Float, default=0)
    avg_delivery_mins: Mapped[int] = mapped_column(Integer, default=60)
    reliability: Mapped[float] = mapped_column(Float, default=0.9)  # 0..1
    coupon_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    coupon_percent: Mapped[float] = mapped_column(Float, default=0)
    coupon_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    coupon_min_order: Mapped[float] = mapped_column(Float, default=0)


class Product(Base):
    """One real-world product, e.g. 'Cetaphil Gentle Skin Cleanser 125 ml'."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    brand: Mapped[str] = mapped_column(String(80), index=True)
    name: Mapped[str] = mapped_column(String(200))
    variant: Mapped[str | None] = mapped_column(String(80), nullable=True)
    size_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    size_unit: Mapped[str | None] = mapped_column(String(10), nullable=True)  # ml, g, pcs
    category: Mapped[str] = mapped_column(String(40), index=True)
    subcategory: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    veg: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # food only
    barcode: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    emoji: Mapped[str] = mapped_column(String(8), default="🛍️")
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)

    listings: Mapped[list["Listing"]] = relationship(back_populates="product", cascade="all, delete-orphan")


class Listing(Base):
    """A product as sold on one platform (its own title, price, stock)."""

    __tablename__ = "listings"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    platform_id: Mapped[int] = mapped_column(ForeignKey("platforms.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    mrp: Mapped[float] = mapped_column(Float)
    price: Mapped[float] = mapped_column(Float)
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    delivery_mins: Mapped[int] = mapped_column(Integer, default=60)
    seller_rating: Mapped[float] = mapped_column(Float, default=4.2)
    url: Mapped[str] = mapped_column(String(500))
    data_source: Mapped[str] = mapped_column(String(20), default="sample")  # live | cached | sample | estimated
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product: Mapped[Product] = relationship(back_populates="listings")
    platform: Mapped[Platform] = relationship()


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"), index=True)
    price: Mapped[float] = mapped_column(Float)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Address(Base):
    """Saved delivery / pickup addresses (Home, Work, Other), like in food and grocery apps."""

    __tablename__ = "addresses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(20), default="home")  # home | work | other
    nickname: Mapped[str | None] = mapped_column(String(40), nullable=True)  # for "other", e.g. "Mom's place"
    receiver_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(15), nullable=True)
    house: Mapped[str] = mapped_column(String(160))          # flat / house no., building
    area: Mapped[str] = mapped_column(String(240))           # street, area (from the map search)
    landmark: Mapped[str | None] = mapped_column(String(160), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    state: Mapped[str | None] = mapped_column(String(80), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(6), nullable=True)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WishlistItem(Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    target_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product: Mapped[Product] = relationship()


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    message: Mapped[str] = mapped_column(String(300))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class BasketItem(Base):
    __tablename__ = "basket_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    quantity: Mapped[int] = mapped_column(Integer, default=1)

    product: Mapped[Product] = relationship()


class Comparison(Base):
    """Every comparison a user runs, used for the savings dashboard."""

    __tablename__ = "comparisons"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    best_platform_id: Mapped[int | None] = mapped_column(ForeignKey("platforms.id"), nullable=True)
    best_total: Mapped[float] = mapped_column(Float)
    highest_total: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    product: Mapped[Product] = relationship()
    best_platform: Mapped[Platform | None] = relationship()


class SearchHistory(Base):
    __tablename__ = "search_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    query: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
