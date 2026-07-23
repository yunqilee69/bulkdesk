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
    Integer,
    String,
    UniqueConstraint,
    desc,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class OrderDraftStatus(str, enum.Enum):
    editing = "editing"
    submitted = "submitted"
    abandoned = "abandoned"


class OrderDraftEventType(str, enum.Enum):
    created = "created"
    saved = "saved"
    taken_over = "taken_over"
    abandoned = "abandoned"
    submitted = "submitted"
    submit_failed = "submit_failed"


class OrderDraft(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "order_drafts"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_order_drafts_version_positive"),
        Index(
            "uq_order_drafts_editing_owner_customer",
            "owner_employee_id",
            "customer_id",
            unique=True,
            postgresql_where=text("status = 'editing'"),
        ),
        Index(
            "ix_order_drafts_owner_status_updated_at",
            "owner_employee_id",
            "status",
            desc("updated_at"),
        ),
        Index(
            "ix_order_drafts_customer_status_updated_at",
            "customer_id",
            "status",
            desc("updated_at"),
        ),
    )

    customer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("customers.id"), nullable=False
    )
    owner_employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employees.id"), nullable=False
    )
    status: Mapped[OrderDraftStatus] = mapped_column(
        Enum(OrderDraftStatus, name="order_draft_status", native_enum=True),
        default=OrderDraftStatus.editing,
        server_default=OrderDraftStatus.editing.value,
        nullable=False,
    )
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    version: Mapped[int] = mapped_column(
        Integer, default=1, server_default=text("1"), nullable=False
    )
    submitted_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("orders.id"), nullable=True
    )
    abandoned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    items: Mapped[list["OrderDraftItem"]] = relationship(
        back_populates="draft", cascade="all, delete-orphan"
    )
    events: Mapped[list["OrderDraftEvent"]] = relationship(
        back_populates="draft", cascade="all, delete-orphan"
    )
    submissions: Mapped[list["OrderDraftSubmission"]] = relationship(
        back_populates="draft", cascade="all, delete-orphan"
    )


class OrderDraftItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "order_draft_items"
    __table_args__ = (
        UniqueConstraint(
            "draft_id",
            "product_id",
            name="uq_order_draft_items_draft_product",
        ),
        CheckConstraint(
            "quantity > 0", name="ck_order_draft_items_quantity_positive"
        ),
        Index("ix_order_draft_items_draft_id", "draft_id"),
    )

    draft_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_drafts.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    draft: Mapped[OrderDraft] = relationship(back_populates="items")


class OrderDraftEvent(UUIDMixin, Base):
    __tablename__ = "order_draft_events"
    __table_args__ = (
        CheckConstraint(
            "version > 0", name="ck_order_draft_events_version_positive"
        ),
        Index("ix_order_draft_events_draft_created_at", "draft_id", desc("created_at")),
    )

    draft_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_drafts.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[OrderDraftEventType] = mapped_column(
        Enum(OrderDraftEventType, name="order_draft_event_type", native_enum=True),
        nullable=False,
    )
    actor_employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employees.id"), nullable=False
    )
    actor_employee_name: Mapped[str] = mapped_column(String(100), nullable=False)
    previous_owner_employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("employees.id"), nullable=True
    )
    previous_owner_employee_name: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    new_owner_employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("employees.id"), nullable=True
    )
    new_owner_employee_name: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=text("now()"), nullable=False
    )

    draft: Mapped[OrderDraft] = relationship(back_populates="events")


class OrderDraftSubmission(UUIDMixin, Base):
    __tablename__ = "order_draft_submissions"
    __table_args__ = (
        UniqueConstraint(
            "draft_id",
            "idempotency_key",
            name="uq_order_draft_submissions_draft_idempotency",
        ),
        Index("ix_order_draft_submissions_order_id", "order_id"),
    )

    draft_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("order_drafts.id", ondelete="CASCADE"), nullable=False
    )
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False)
    order_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("orders.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=text("now()"), nullable=False
    )

    draft: Mapped[OrderDraft] = relationship(back_populates="submissions")
