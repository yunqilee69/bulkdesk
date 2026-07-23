from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.models.order import OrderStatus
from app.models.order_delivery import (
    OrderDeliveryEventType,
    OrderDeliveryExceptionType,
    OrderDeliveryStatus,
)
from app.schemas.common import ApiSchema, PaginatedResponse


def _trim_required(value: object) -> object:
    if not isinstance(value, str):
        return value
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("字段不能为空")
    return trimmed


def _trim_optional(value: object) -> object:
    if not isinstance(value, str):
        return value
    trimmed = value.strip()
    return trimmed or None


def _normalize_proof_image_urls(value: Optional[list[str]]) -> list[str]:
    return value or []


class OrderDeliveryEmployeeOptionOut(ApiSchema):
    id: str
    name: str

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, value):
        return str(value)


class OrderDeliveryEventOut(ApiSchema):
    id: str
    delivery_id: str
    event_type: OrderDeliveryEventType
    from_employee_id: Optional[str] = None
    from_employee_name: Optional[str] = None
    to_employee_id: Optional[str] = None
    to_employee_name: Optional[str] = None
    exception_type: Optional[OrderDeliveryExceptionType] = None
    remark: Optional[str] = None
    operator_id: str
    operator_name: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator(
        "id",
        "delivery_id",
        "from_employee_id",
        "to_employee_id",
        "operator_id",
        mode="before",
    )
    @classmethod
    def uuid_to_str(cls, value):
        return str(value) if value is not None else None


class OrderDeliveryItemSummaryOut(ApiSchema):
    product_id: str
    product_name: str
    barcode: str
    quantity: int

    model_config = {"from_attributes": True}

    @field_validator("product_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value):
        return str(value)


class OrderDeliverySummaryOut(ApiSchema):
    id: str
    status: OrderDeliveryStatus
    delivery_employee_id: str
    delivery_employee_name: str
    recipient_name: str
    recipient_phone: str
    delivery_address: str
    assigned_at: datetime
    signer_name: Optional[str] = None
    signed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_validator("id", "delivery_employee_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value):
        return str(value)


class OrderDeliveryDetailOut(OrderDeliverySummaryOut):
    order_id: str
    order_no: str
    customer_id: str
    customer_name: str
    total_amount: float
    order_status: OrderStatus
    product_quantity: int
    assigned_by_id: str
    assigned_by_name: str
    proof_image_urls: list[str] = Field(default_factory=list)
    signature_image_url: Optional[str] = None
    sign_remark: Optional[str] = None
    signed_by_id: Optional[str] = None
    signed_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    events: list[OrderDeliveryEventOut] = Field(default_factory=list)
    items: list[OrderDeliveryItemSummaryOut] = Field(default_factory=list)

    @field_validator("proof_image_urls", mode="before")
    @classmethod
    def normalize_proof_image_urls(cls, value: Optional[list[str]]) -> list[str]:
        return _normalize_proof_image_urls(value)

    @field_validator(
        "order_id",
        "customer_id",
        "assigned_by_id",
        "signed_by_id",
        mode="before",
    )
    @classmethod
    def related_uuid_to_str(cls, value):
        return str(value) if value is not None else None


class OrderDeliveryLatestExceptionOut(ApiSchema):
    exception_type: OrderDeliveryExceptionType
    remark: Optional[str] = None
    occurred_at: datetime


class OrderDeliveryCurrentOut(OrderDeliverySummaryOut):
    order_id: str
    order_no: str
    customer_id: str
    customer_name: str
    total_amount: float
    product_quantity: int
    has_exception: bool = False
    latest_exception: Optional[OrderDeliveryLatestExceptionOut] = None

    @field_validator("order_id", "customer_id", mode="before")
    @classmethod
    def related_uuid_to_str(cls, value):
        return str(value)


class OrderDeliveryCurrentGroupOut(ApiSchema):
    delivery_employee_id: str
    delivery_employee_name: str
    order_count: int
    customer_count: int
    product_quantity: int
    total_amount: float
    exception_order_count: int
    deliveries: list[OrderDeliveryCurrentOut] = Field(default_factory=list)

    @field_validator("delivery_employee_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value):
        return str(value)


class OrderDeliveryArchiveOut(OrderDeliverySummaryOut):
    order_id: str
    order_no: str
    customer_id: str
    customer_name: str
    total_amount: float
    product_quantity: int
    proof_image_urls: list[str] = Field(default_factory=list)
    signature_image_url: Optional[str] = None
    sign_remark: Optional[str] = None

    @field_validator("proof_image_urls", mode="before")
    @classmethod
    def normalize_proof_image_urls(cls, value: Optional[list[str]]) -> list[str]:
        return _normalize_proof_image_urls(value)

    @field_validator("order_id", "customer_id", mode="before")
    @classmethod
    def related_uuid_to_str(cls, value):
        return str(value)


class OrderDeliveryArchivePageOut(PaginatedResponse[OrderDeliveryArchiveOut]):
    pass


class OrderDeliveryReassignRequest(ApiSchema):
    delivery_employee_id: UUID
    reason: Optional[str] = Field(None, max_length=500)

    @field_validator("delivery_employee_id", mode="before")
    @classmethod
    def trim_employee_id(cls, value: object) -> object:
        return _trim_required(value)

    @field_validator("reason", mode="before")
    @classmethod
    def trim_reason(cls, value: object) -> object:
        return _trim_optional(value)


class OrderDeliveryExceptionRequest(ApiSchema):
    exception_type: OrderDeliveryExceptionType
    remark: Optional[str] = Field(None, max_length=500)

    @field_validator("remark", mode="before")
    @classmethod
    def trim_remark(cls, value: object) -> object:
        return _trim_optional(value)

    @model_validator(mode="after")
    def require_other_remark(self):
        if self.exception_type == OrderDeliveryExceptionType.other and not self.remark:
            raise ValueError("其他异常必须填写说明")
        return self


class OrderDeliverySignRequest(ApiSchema):
    signer_name: str = Field(..., min_length=1, max_length=100)
    proof_image_urls: list[str] = Field(default_factory=list)
    signature_image_url: Optional[str] = Field(None, max_length=1000)
    remark: Optional[str] = Field(None, max_length=500)
    collect_payment: bool = False
    paid_amount: Optional[Decimal] = Field(None, gt=Decimal("0"))
    payment_proof_image_urls: list[str] = Field(default_factory=list)

    @field_validator("signer_name", mode="before")
    @classmethod
    def trim_signer_name(cls, value: object) -> object:
        return _trim_required(value)

    @field_validator("remark", mode="before")
    @classmethod
    def trim_remark(cls, value: object) -> object:
        return _trim_optional(value)

    @field_validator("signature_image_url", mode="before")
    @classmethod
    def trim_signature_image_url(cls, value: object) -> object:
        if value is None:
            return None
        return _trim_required(value)

    @field_validator("payment_proof_image_urls", mode="before")
    @classmethod
    def normalize_payment_proofs(cls, value: object) -> object:
        if value is None:
            return []
        normalized = []
        for item in value:
            if not isinstance(item, str):
                raise ValueError("付款凭证必须为图片URL")
            stripped = item.strip()
            if not stripped:
                raise ValueError("付款凭证不能为空")
            normalized.append(stripped)
        return normalized

    @model_validator(mode="after")
    def require_payment_fields_when_collecting(self):
        if self.collect_payment:
            if self.paid_amount is None:
                raise ValueError("实收金额不能为空")
            if not self.payment_proof_image_urls:
                raise ValueError("付款凭证不能为空")
        elif self.paid_amount is not None or self.payment_proof_image_urls:
            raise ValueError("同时收款时才能提交收款信息")
        return self
