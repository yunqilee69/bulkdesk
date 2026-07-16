import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class OrderStatus(str, enum.Enum):
    placed = "placed"
    shipped = "shipped"
    paid = "paid"
    completed = "completed"
    cancelled = "cancelled"


class Order(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "orders"

    order_no: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id"), nullable=False
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("warehouses.id"), nullable=False
    )
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status", native_enum=True),
        default=OrderStatus.placed,
        nullable=False,
    )
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    shipped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    customer: Mapped["Customer"] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order")


class OrderItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "order_items"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id"), nullable=False
    )
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    barcode: Mapped[str] = mapped_column(String(50), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)

    order: Mapped["Order"] = relationship(back_populates="items")


class OrderStatusLog(UUIDMixin, Base):
    __tablename__ = "order_status_logs"

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id"), nullable=False
    )
    from_status: Mapped[Optional[OrderStatus]] = mapped_column(
        Enum(OrderStatus, name="order_from_status", native_enum=True),
        nullable=True,
    )
    to_status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_to_status", native_enum=True),
        nullable=False,
    )
    operator: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
