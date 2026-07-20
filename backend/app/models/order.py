import enum
import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.order_delivery import OrderDelivery


class OrderStatus(str, enum.Enum):
    placed = "placed"
    shipping = "shipping"
    stocked_out = "stocked_out"
    delivered_unpaid = "delivered_unpaid"
    completed = "completed"
    cancelled = "cancelled"


class OrderInventoryAllocationStatus(str, enum.Enum):
    reserved = "reserved"
    shipped = "shipped"
    released = "released"
    returned = "returned"


class Order(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            "paid_amount IS NULL OR (paid_amount > 0 AND paid_amount <= total_amount)",
            name="ck_orders_paid_amount_range",
        ),
        CheckConstraint(
            "payment_proof_image_urls IS NULL "
            "OR json_typeof(payment_proof_image_urls) = 'array'",
            name="ck_orders_payment_proof_image_urls_array",
        ),
    )

    order_no: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id"), nullable=False
    )
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status", native_enum=True),
        default=OrderStatus.placed,
        nullable=False,
    )
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    shipping_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    shipping_started_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    stock_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    stock_out_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    delivered_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    paid_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    paid_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 2), nullable=True)
    payment_proof_image_urls: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cancel_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    customer: Mapped["Customer"] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order")
    inventory_allocations: Mapped[list["OrderInventoryAllocation"]] = relationship(
        back_populates="order"
    )
    delivery: Mapped[Optional["OrderDelivery"]] = relationship(
        back_populates="order", uselist=False
    )


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
    inventory_allocations: Mapped[list["OrderInventoryAllocation"]] = relationship(
        back_populates="order_item"
    )


class OrderInventoryAllocation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "order_inventory_allocations"
    __table_args__ = (
        UniqueConstraint(
            "order_item_id",
            "warehouse_id",
            name="uq_order_inventory_allocation_item_warehouse",
        ),
        CheckConstraint("quantity > 0", name="ck_order_inventory_allocation_quantity"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id"), nullable=False
    )
    order_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_items.id"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id"), nullable=False
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("warehouses.id"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[OrderInventoryAllocationStatus] = mapped_column(
        Enum(
            OrderInventoryAllocationStatus,
            name="order_inventory_allocation_status",
            native_enum=True,
        ),
        default=OrderInventoryAllocationStatus.reserved,
        nullable=False,
    )

    order: Mapped["Order"] = relationship(back_populates="inventory_allocations")
    order_item: Mapped["OrderItem"] = relationship(
        back_populates="inventory_allocations"
    )


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
