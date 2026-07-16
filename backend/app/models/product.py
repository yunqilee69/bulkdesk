import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class CategoryStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"


class ProductStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"


class PriceType(str, enum.Enum):
    standard_price = "standard_price"
    cost_price = "cost_price"
    member_price = "member_price"


class Category(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "categories"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    status: Mapped[CategoryStatus] = mapped_column(
        Enum(CategoryStatus, name="category_status", native_enum=True),
        default=CategoryStatus.active,
        nullable=False,
    )



class BrandStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"


class Brand(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "brands"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    status: Mapped[BrandStatus] = mapped_column(
        Enum(BrandStatus, name="brand_status", native_enum=True),
        default=BrandStatus.active,
        nullable=False,
    )


class Product(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "products"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    short_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    barcode: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id"), nullable=False
    )
    brand_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("brands.id"), nullable=True
    )
    specification: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    standard_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    cost_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_urls: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    status: Mapped[ProductStatus] = mapped_column(
        Enum(ProductStatus, name="product_status", native_enum=True),
        default=ProductStatus.active,
        nullable=False,
    )



class PriceChangeLog(UUIDMixin, Base):
    __tablename__ = "price_change_logs"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id"), nullable=False
    )
    price_type: Mapped[PriceType] = mapped_column(
        Enum(PriceType, name="price_type", native_enum=False),
        nullable=False,
    )
    level_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("customer_levels.id"), nullable=True
    )
    old_value: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    new_value: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    operator_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("employees.id"), nullable=True
    )
    operator_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
