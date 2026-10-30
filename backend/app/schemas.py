"""Request bodies (what the frontend sends). Validated automatically by FastAPI."""
from pydantic import BaseModel, Field, field_validator


class RegisterIn(BaseModel):
    email: str = Field(max_length=255)
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=6, max_length=128)
    city: str | None = None

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Enter a valid email address")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    city: str | None = Field(default=None, max_length=120)
    pincode: str | None = Field(default=None, max_length=10)
    delivery_preference: str | None = Field(default=None, pattern="^(instant|standard|any)$")


class PlatformSelectionIn(BaseModel):
    platform_ids: list[int]


class MatchIn(BaseModel):
    title: str = Field(min_length=2, max_length=300)


class BasketAddIn(BaseModel):
    product_id: int
    quantity: int = Field(default=1, ge=1, le=50)


class BasketUpdateIn(BaseModel):
    quantity: int = Field(ge=1, le=50)


class AssistantIn(BaseModel):
    message: str = Field(min_length=2, max_length=500)


class WishlistIn(BaseModel):
    product_id: int
    target_price: float | None = Field(default=None, gt=0)
