import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class OrderDeliveryStatus(str, enum.Enum):
    delivering = "delivering"
    signed = "signed"


class OrderDeliveryEventType(str, enum.Enum):
    assigned = "assigned"
    reassigned = "reassigned"
    exception = "exception"
    signed = "signed"


class OrderDeliveryExceptionType(str, enum.Enum):
    customer_absent = "customer_absent"
    customer_refused = "customer_refused"
    invalid_contact = "invalid_contact"
    other = "other"


class OrderDelivery(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "order_deliveries"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_order_deliveries_order_id"),
        CheckConstraint(
            "status <> 'signed' OR ("
            "signer_name IS NOT NULL AND signed_at IS NOT NULL "
            "AND signed_by_id IS NOT NULL AND signed_by_name IS NOT NULL)",
            name="ck_order_deliveries_signed_fields",
        ),
        CheckConstraint(
            "status <> 'delivering' OR ("
            "signer_name IS NULL AND proof_image_urls IS NULL "
            "AND sign_remark IS NULL AND signed_at IS NULL "
            "AND signed_by_id IS NULL AND signed_by_name IS NULL)",
            name="ck_order_deliveries_delivering_fields",
        ),
        CheckConstraint(
            "proof_image_urls IS NULL "
            "OR json_typeof(proof_image_urls) = 'array'",
            name="ck_order_deliveries_proof_image_urls_array",
        ),
        Index(
            "ix_order_deliveries_delivery_employee_status",
            "delivery_employee_id",
            "status",
        ),
        Index("ix_order_deliveries_status_signed_at", "status", "signed_at"),
    )

    order_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orders.id"), nullable=False
    )
    delivery_employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employees.id"), nullable=False
    )
    delivery_employee_name: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[OrderDeliveryStatus] = mapped_column(
        Enum(OrderDeliveryStatus, name="order_delivery_status", native_enum=True),
        default=OrderDeliveryStatus.delivering,
        server_default=OrderDeliveryStatus.delivering.value,
        nullable=False,
    )
    recipient_name: Mapped[str] = mapped_column(String(100), nullable=False)
    recipient_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    delivery_address: Mapped[str] = mapped_column(String(500), nullable=False)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    assigned_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employees.id"), nullable=False
    )
    assigned_by_name: Mapped[str] = mapped_column(String(100), nullable=False)
    signer_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    proof_image_urls: Mapped[Optional[list[str]]] = mapped_column(JSON, nullable=True)
    sign_remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    signed_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("employees.id"), nullable=True
    )
    signed_by_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    order: Mapped["Order"] = relationship(back_populates="delivery")
    events: Mapped[list["OrderDeliveryEvent"]] = relationship(
        back_populates="delivery"
    )


class OrderDeliveryEvent(UUIDMixin, Base):
    __tablename__ = "order_delivery_events"
    __table_args__ = (
        Index(
            "ix_order_delivery_events_delivery_created_at",
            "delivery_id",
            "created_at",
        ),
        Index(
            "ix_order_delivery_events_event_type_delivery_created_at",
            "event_type",
            "delivery_id",
            "created_at",
        ),
    )

    delivery_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_deliveries.id"), nullable=False
    )
    event_type: Mapped[OrderDeliveryEventType] = mapped_column(
        Enum(
            OrderDeliveryEventType,
            name="order_delivery_event_type",
            native_enum=True,
        ),
        nullable=False,
    )
    from_employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("employees.id"), nullable=True
    )
    from_employee_name: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    to_employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("employees.id"), nullable=True
    )
    to_employee_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    exception_type: Mapped[Optional[OrderDeliveryExceptionType]] = mapped_column(
        Enum(
            OrderDeliveryExceptionType,
            name="order_delivery_exception_type",
            native_enum=True,
        ),
        nullable=True,
    )
    remark: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    operator_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employees.id"), nullable=False
    )
    operator_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    delivery: Mapped["OrderDelivery"] = relationship(back_populates="events")
