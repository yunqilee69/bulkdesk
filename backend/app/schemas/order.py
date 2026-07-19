from datetime import datetime
from typing import List, Optional

from pydantic import Field, field_validator, model_validator

from app.models.order import OrderInventoryAllocationStatus, OrderStatus
from app.schemas.common import ApiSchema


class OrderItemCreate(ApiSchema):
    product_id: str
    quantity: int = Field(..., gt=0)


class OrderCreate(ApiSchema):
    customer_id: str
    items: List[OrderItemCreate] = Field(..., min_length=1)
    remark: Optional[str] = None

    @model_validator(mode="after")
    def reject_duplicate_products(self):
        product_ids = [item.product_id for item in self.items]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("同一商品不能重复添加")
        return self


class OrderShipmentAllocation(ApiSchema):
    order_item_id: str
    warehouse_id: str
    quantity: int = Field(..., gt=0)


class OrderShipRequest(ApiSchema):
    allocations: List[OrderShipmentAllocation] = Field(..., min_length=1)

    @model_validator(mode="after")
    def reject_duplicate_allocations(self):
        keys = [
            (allocation.order_item_id, allocation.warehouse_id)
            for allocation in self.allocations
        ]
        if len(keys) != len(set(keys)):
            raise ValueError("订单商品和仓库不能重复")
        return self


class OrderInventoryAllocationOut(ApiSchema):
    id: str
    order_id: str
    order_item_id: str
    product_id: str
    warehouse_id: str
    warehouse_name: Optional[str] = None
    quantity: int
    status: OrderInventoryAllocationStatus

    model_config = {"from_attributes": True}

    @field_validator(
        "id", "order_id", "order_item_id", "product_id", "warehouse_id", mode="before"
    )
    @classmethod
    def uuid_to_str(cls, value):
        return str(value)


class OrderShippingWarehouseOptionOut(ApiSchema):
    warehouse_id: str
    warehouse_name: str
    available_quantity: int

    @field_validator("warehouse_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value):
        return str(value)


class OrderShippingItemOptionsOut(ApiSchema):
    order_item_id: str
    product_id: str
    warehouses: List[OrderShippingWarehouseOptionOut]

    @field_validator("order_item_id", "product_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value):
        return str(value)


class OrderShippingOptionsOut(ApiSchema):
    items: List[OrderShippingItemOptionsOut]


class OrderItemOut(ApiSchema):
    id: str
    order_id: str
    product_id: str
    product_name: str
    barcode: str
    quantity: int
    unit_price: float
    subtotal: float
    allocations: List[OrderInventoryAllocationOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}

    @field_validator("id", "order_id", "product_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)


class OrderStatusLogOut(ApiSchema):
    id: str
    order_id: str
    from_status: Optional[OrderStatus]
    to_status: OrderStatus
    operator: Optional[str]
    remark: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", "order_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)


class OrderOut(ApiSchema):
    id: str
    order_no: str
    customer_id: str
    customer_name: Optional[str] = None
    total_amount: float
    status: OrderStatus
    remark: Optional[str]
    shipping_started_at: Optional[datetime]
    shipping_started_by: Optional[str]
    stock_out_at: Optional[datetime]
    stock_out_by: Optional[str]
    delivered_at: Optional[datetime]
    delivered_by: Optional[str]
    paid_at: Optional[datetime]
    paid_by: Optional[str]
    cancelled_at: Optional[datetime]
    cancelled_by: Optional[str]
    cancel_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: List[OrderItemOut] = []
    status_logs: List[OrderStatusLogOut] = []

    model_config = {"from_attributes": True}

    @field_validator("id", "customer_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)


class OrderActionRequest(ApiSchema):
    cancel_reason: str = Field(..., min_length=1, max_length=255)

    @field_validator("cancel_reason")
    @classmethod
    def reject_blank_reason(cls, value: str) -> str:
        reason = value.strip()
        if not reason:
            raise ValueError("取消原因不能为空")
        return reason
