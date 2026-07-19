import enum
import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class MovementType(str, enum.Enum):
    stock_in = "stock_in"
    stock_out = "stock_out"
    transfer_in = "transfer_in"
    transfer_out = "transfer_out"
    stocktake_adjustment = "stocktake_adjustment"
    order_deduction = "order_deduction"
    order_return = "order_return"
    customer_return_in = "customer_return_in"
    customer_return_void_out = "customer_return_void_out"


class SupplierStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"


class Supplier(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "suppliers"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_person: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[SupplierStatus] = mapped_column(
        Enum(SupplierStatus, name="supplier_status", native_enum=True),
        default=SupplierStatus.active,
        nullable=False,
    )

    inventories: Mapped[list["Inventory"]] = relationship(back_populates="supplier")


class WarehouseStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"


class Warehouse(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "warehouses"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_default: Mapped[bool] = mapped_column(default=False, nullable=False)
    contact_person: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    status: Mapped[WarehouseStatus] = mapped_column(
        Enum(WarehouseStatus, name="warehouse_status", native_enum=True),
        default=WarehouseStatus.active,
        nullable=False,
    )

    inventories: Mapped[list["Inventory"]] = relationship(back_populates="warehouse")


class Inventory(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "inventory"
    __table_args__ = (
        UniqueConstraint(
            "product_id", "warehouse_id", name="uq_inventory_product_warehouse"
        ),
    )

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id"), nullable=False
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("warehouses.id"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(default=0, nullable=False)
    locked: Mapped[int] = mapped_column(default=0, nullable=False)
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("suppliers.id"), nullable=True
    )
    production_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    warehouse: Mapped["Warehouse"] = relationship(back_populates="inventories")
    supplier: Mapped[Optional["Supplier"]] = relationship(back_populates="inventories")


class InventoryMovement(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "inventory_movements"

    order_no: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    movement_type: Mapped[MovementType] = mapped_column(
        Enum(MovementType, name="movement_type", native_enum=True),
        nullable=False,
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("warehouses.id"), nullable=False
    )
    from_warehouse_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("warehouses.id"), nullable=True
    )
    to_warehouse_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("warehouses.id"), nullable=True
    )
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("suppliers.id"), nullable=True
    )
    operator: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    items: Mapped[list["InventoryMovementItem"]] = relationship(back_populates="movement", cascade="all, delete-orphan")


class InventoryMovementItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "inventory_movement_items"

    movement_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("inventory_movements.id"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id"), nullable=False
    )
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    barcode: Mapped[str] = mapped_column(String(50), nullable=False)
    brand_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    quantity: Mapped[int] = mapped_column(nullable=False)
    before_quantity: Mapped[int] = mapped_column(default=0, nullable=False)
    after_quantity: Mapped[int] = mapped_column(default=0, nullable=False)
    cost_price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    subtotal: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)

    movement: Mapped["InventoryMovement"] = relationship(back_populates="items")
