import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    JSON,
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


class CustomerLevelName(str, enum.Enum):
    normal = "normal"
    silver = "silver"
    gold = "gold"
    platinum = "platinum"


class Customer(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "customers"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(50), nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    level_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customer_levels.id"), nullable=False
    )
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_urls: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    total_spent: Mapped[float] = mapped_column(
        Numeric(12, 2), nullable=False, default=0
    )
    order_count: Mapped[int] = mapped_column(nullable=False, default=0)
    last_order_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    level: Mapped["CustomerLevel"] = relationship(back_populates="customers")


class CustomerLevel(UUIDMixin, Base):
    __tablename__ = "customer_levels"

    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    min_spent: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    sort_order: Mapped[int] = mapped_column(default=0, nullable=False)
    is_default: Mapped[bool] = mapped_column(default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    customers: Mapped[list["Customer"]] = relationship(back_populates="level")


class MemberPrice(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "member_prices"
    __table_args__ = (
        UniqueConstraint("product_id", "level_id", name="uq_member_price_product_level"),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id"), nullable=False
    )
    level_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customer_levels.id"), nullable=False
    )
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)


class LevelChangeLog(UUIDMixin, Base):
    __tablename__ = "level_change_logs"

    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id"), nullable=False
    )
    from_level_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("customer_levels.id"), nullable=True
    )
    to_level_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customer_levels.id"), nullable=False
    )
    reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
