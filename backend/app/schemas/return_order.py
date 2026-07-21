from datetime import datetime
from typing import List, Optional

from pydantic import Field, field_validator, model_validator

from app.models.return_order import ReturnOrderStatus, ReturnProductCondition
from app.schemas.common import ApiSchema


class ReturnOrderItemCreate(ApiSchema):
    source_order_item_id: str
    quantity: int = Field(..., gt=0)
    condition: ReturnProductCondition = ReturnProductCondition.normal
    return_reason: str = Field(..., min_length=1, max_length=255)
    remark: Optional[str] = None
    should_stock_in: bool = False
    warehouse_id: Optional[str] = None

    @field_validator("return_reason")
    @classmethod
    def strip_return_reason(cls, value: str) -> str:
        reason = value.strip()
        if not reason:
            raise ValueError("退货原因不能为空")
        return reason

    @model_validator(mode="after")
    def validate_stock_in_warehouse(self):
        if self.should_stock_in and not self.warehouse_id:
            raise ValueError("入库商品必须选择入库仓库")
        if not self.should_stock_in and self.warehouse_id:
            raise ValueError("不入库商品不得保留仓库")
        return self


class ReturnOrderCreate(ApiSchema):
    handling_delivery_id: str
    items: List[ReturnOrderItemCreate] = Field(..., min_length=1)
    remark: Optional[str] = None

    @model_validator(mode="after")
    def reject_duplicate_source_items(self):
        source_order_item_ids = [item.source_order_item_id for item in self.items]
        if len(source_order_item_ids) != len(set(source_order_item_ids)):
            raise ValueError("同一来源订单明细不能重复添加")
        return self


class ReturnableOrderItemOut(ApiSchema):
    source_order_item_id: str
    order_id: str
    order_no: str
    product_id: str
    product_name: str
    barcode: str
    unit_price: float
    sold_quantity: int
    returned_quantity: int
    returnable_quantity: int

    @field_validator("source_order_item_id", "order_id", "product_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value):
        return str(value)


class ReturnOrderVoidRequest(ApiSchema):
    void_reason: str = Field(..., min_length=1, max_length=255)

    @field_validator("void_reason")
    @classmethod
    def strip_void_reason(cls, value: str) -> str:
        reason = value.strip()
        if not reason:
            raise ValueError("作废原因不能为空")
        return reason


class ReturnOrderItemOut(ApiSchema):
    id: str
    return_order_id: str
    source_order_item_id: str
    product_id: str
    product_name: str
    barcode: str
    quantity: int
    unit_price: float
    subtotal: float
    condition: ReturnProductCondition
    return_reason: str
    remark: Optional[str]
    should_stock_in: bool
    warehouse_id: Optional[str]
    warehouse_name: Optional[str] = None

    model_config = {"from_attributes": True}

    @field_validator(
        "id",
        "return_order_id",
        "source_order_item_id",
        "product_id",
        "warehouse_id",
        mode="before",
    )
    @classmethod
    def uuid_to_str(cls, value):
        return str(value) if value is not None else None


class ReturnOrderOut(ApiSchema):
    id: str
    return_no: str
    customer_id: str
    handling_delivery_id: str
    customer_name: Optional[str] = None
    total_amount: float
    status: ReturnOrderStatus
    operator: str
    completed_at: datetime
    remark: Optional[str]
    customer_spent_before: float
    customer_spent_after: float
    spend_deduction_amount: float
    voided_by: Optional[str]
    voided_at: Optional[datetime]
    void_reason: Optional[str]
    void_customer_spent_before: Optional[float]
    void_customer_spent_after: Optional[float]
    created_at: datetime
    updated_at: datetime
    items: List[ReturnOrderItemOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}

    @field_validator("id", "customer_id", "handling_delivery_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value):
        return str(value)
