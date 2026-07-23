from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.models.order_draft import OrderDraftEventType, OrderDraftStatus
from app.schemas.common import ApiSchema


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


class OrderDraftCreateRequest(ApiSchema):
    customer_id: UUID
    remark: Optional[str] = Field(None, max_length=255)

    @field_validator("remark", mode="before")
    @classmethod
    def trim_remark(cls, value: object) -> object:
        return _trim_optional(value)


class OrderDraftItemInput(ApiSchema):
    product_id: str = Field(..., min_length=1)
    quantity: int = Field(..., gt=0)
    remark: Optional[str] = Field(None, max_length=255)

    @field_validator("product_id", mode="before")
    @classmethod
    def trim_product_id(cls, value: object) -> object:
        return _trim_required(value)

    @field_validator("remark", mode="before")
    @classmethod
    def trim_remark(cls, value: object) -> object:
        return _trim_optional(value)


class OrderDraftSaveRequest(ApiSchema):
    version: int = Field(..., gt=0)
    items: list[OrderDraftItemInput] = Field(default_factory=list)
    remark: Optional[str] = Field(None, max_length=255)

    @field_validator("remark", mode="before")
    @classmethod
    def trim_remark(cls, value: object) -> object:
        return _trim_optional(value)

    @model_validator(mode="after")
    def reject_duplicate_products(self):
        product_ids = [item.product_id for item in self.items]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("同一商品不能重复添加")
        return self


class OrderDraftTakeoverRequest(ApiSchema):
    version: int = Field(..., gt=0)


class OrderDraftAbandonRequest(ApiSchema):
    version: int = Field(..., gt=0)


class OrderDraftSubmitRequest(ApiSchema):
    version: int = Field(..., gt=0)


class OrderDraftItemOut(ApiSchema):
    id: str
    draft_id: str
    product_id: str
    quantity: int
    remark: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", "draft_id", "product_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> str:
        return str(value)


class OrderDraftEventOut(ApiSchema):
    id: str
    draft_id: str
    event_type: OrderDraftEventType
    actor_employee_id: str
    actor_employee_name: str
    previous_owner_employee_id: Optional[str] = None
    previous_owner_employee_name: Optional[str] = None
    new_owner_employee_id: Optional[str] = None
    new_owner_employee_name: Optional[str] = None
    version: int
    remark: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator(
        "id",
        "draft_id",
        "actor_employee_id",
        "previous_owner_employee_id",
        "new_owner_employee_id",
        mode="before",
    )
    @classmethod
    def uuid_to_str(cls, value: object) -> Optional[str]:
        return str(value) if value is not None else None


class OrderDraftSubmissionOut(ApiSchema):
    id: str
    draft_id: str
    idempotency_key: str
    order_id: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", "draft_id", "order_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> Optional[str]:
        return str(value) if value is not None else None


class OrderDraftOut(ApiSchema):
    id: str
    customer_id: str
    owner_employee_id: str
    status: OrderDraftStatus
    remark: Optional[str] = None
    version: int
    submitted_order_id: Optional[str] = None
    abandoned_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    items: list[OrderDraftItemOut] = Field(default_factory=list)
    events: list[OrderDraftEventOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}

    @field_validator(
        "id", "customer_id", "owner_employee_id", "submitted_order_id", mode="before"
    )
    @classmethod
    def uuid_to_str(cls, value: object) -> Optional[str]:
        return str(value) if value is not None else None


class OrderDraftConflictOut(ApiSchema):
    draft_id: str
    expected_version: int
    actual_version: int
    message: str = "草稿已被其他操作更新，请刷新后重试"

    @field_validator("draft_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> str:
        return str(value)


class OrderDraftTakeoverOut(ApiSchema):
    draft: OrderDraftOut
    previous_owner_employee_id: str
    previous_owner_employee_name: str

    @field_validator("previous_owner_employee_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> str:
        return str(value)


class OrderDraftSubmitOut(ApiSchema):
    draft: OrderDraftOut
    order_id: str
    submission_id: str

    @field_validator("order_id", "submission_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> str:
        return str(value)
