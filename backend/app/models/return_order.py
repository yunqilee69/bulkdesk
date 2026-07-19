import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class ReturnOrderStatus(str, enum.Enum):
    completed = "completed"
    voided = "voided"


class ReturnProductCondition(str, enum.Enum):
    normal = "normal"
    expired = "expired"
    damaged = "damaged"
    other = "other"


class ReturnOrder(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "return_orders"
    __table_args__ = (
        Index("ix_return_orders_customer_created_at", "customer_id", "created_at"),
        Index("ix_return_orders_status_created_at", "status", "created_at"),
    )

    return_no: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[ReturnOrderStatus] = mapped_column(
        Enum(ReturnOrderStatus, name="return_order_status", native_enum=True),
        default=ReturnOrderStatus.completed,
        nullable=False,
    )
    operator: Mapped[str] = mapped_column(String(100), nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    customer_spent_before: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    customer_spent_after: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    spend_deduction_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    voided_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    voided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    void_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    void_customer_spent_before: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    void_customer_spent_after: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)

    items: Mapped[list["ReturnOrderItem"]] = relationship(
        back_populates="return_order", cascade="all, delete-orphan"
    )


class ReturnOrderItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "return_order_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_return_order_item_quantity"),
        CheckConstraint("unit_price > 0", name="ck_return_order_item_unit_price"),
        CheckConstraint(
            "(should_stock_in AND warehouse_id IS NOT NULL) OR "
            "(NOT should_stock_in AND warehouse_id IS NULL)",
            name="ck_return_order_item_stock_in_warehouse",
        ),
    )

    return_order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("return_orders.id"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("products.id"), nullable=False)
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    barcode: Mapped[str] = mapped_column(String(50), nullable=False)
    quantity: Mapped[int] = mapped_column(nullable=False)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    subtotal: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    condition: Mapped[ReturnProductCondition] = mapped_column(
        Enum(ReturnProductCondition, name="return_product_condition", native_enum=True),
        nullable=False,
    )
    return_reason: Mapped[str] = mapped_column(String(255), nullable=False)
    remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    should_stock_in: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    warehouse_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("warehouses.id"), nullable=True
    )

    return_order: Mapped["ReturnOrder"] = relationship(back_populates="items")
