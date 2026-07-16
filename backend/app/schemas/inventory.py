from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.inventory import MovementType, SupplierStatus, WarehouseStatus


class WarehouseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    address: Optional[str] = None
    remark: Optional[str] = None
    contact_person: Optional[str] = Field(None, max_length=100)
    contact_phone: Optional[str] = Field(None, max_length=20)
    is_default: bool = False
    status: Optional[WarehouseStatus] = WarehouseStatus.active


class WarehouseUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    address: Optional[str] = None
    remark: Optional[str] = None
    contact_person: Optional[str] = Field(None, max_length=100)
    contact_phone: Optional[str] = Field(None, max_length=20)
    is_default: Optional[bool] = None
    status: Optional[WarehouseStatus] = None


class WarehouseOut(BaseModel):
    id: str
    name: str
    address: Optional[str]
    remark: Optional[str]
    contact_person: Optional[str]
    contact_phone: Optional[str]
    is_default: bool
    status: WarehouseStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)


class InventoryOut(BaseModel):
    id: str
    product_id: str
    warehouse_id: str
    quantity: int
    locked: int
    warning_quantity: int = 0
    supplier_id: Optional[str] = None
    production_date: Optional[str] = None
    expiry_date: Optional[str] = None
    location: Optional[str] = None
    available_quantity: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", "product_id", "warehouse_id", "supplier_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v) if v is not None else None


class StockInRequest(BaseModel):
    product_id: str
    warehouse_id: str
    quantity: int = Field(..., gt=0)
    remark: Optional[str] = None


class BatchStockInItem(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)
    cost_price: Optional[float] = Field(None, ge=0)


class BatchStockInRequest(BaseModel):
    warehouse_id: str
    supplier_id: Optional[str] = None
    items: List[BatchStockInItem] = Field(..., min_length=1)
    remark: Optional[str] = None


class StockOutRequest(BaseModel):
    product_id: str
    warehouse_id: str
    quantity: int = Field(..., gt=0)
    remark: Optional[str] = None


class BatchStockOutItem(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)


class BatchStockOutRequest(BaseModel):
    warehouse_id: str
    items: List[BatchStockOutItem] = Field(..., min_length=1)
    remark: Optional[str] = None


class TransferRequest(BaseModel):
    product_id: str
    from_warehouse_id: str
    to_warehouse_id: str
    quantity: int = Field(..., gt=0)
    remark: Optional[str] = None


class BatchTransferItem(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)


class BatchTransferRequest(BaseModel):
    from_warehouse_id: str
    to_warehouse_id: str
    items: List[BatchTransferItem] = Field(..., min_length=1)
    remark: Optional[str] = None


class StocktakeRequest(BaseModel):
    product_id: str
    warehouse_id: str
    actual_quantity: int = Field(..., ge=0)
    remark: Optional[str] = None


class BatchStocktakeItem(BaseModel):
    product_id: str
    actual_quantity: int = Field(..., ge=0)


class BatchStocktakeRequest(BaseModel):
    warehouse_id: str
    items: List[BatchStocktakeItem] = Field(..., min_length=1)
    remark: Optional[str] = None


class InventoryListItemOut(BaseModel):
    id: str
    product_id: str
    product_info: Optional[str] = None
    warehouse_id: str
    warehouse_name: Optional[str] = None
    quantity: int
    locked: int
    warning_quantity: int = 0
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    production_date: Optional[str] = None
    expiry_date: Optional[str] = None
    location: Optional[str] = None
    available_quantity: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", "product_id", "warehouse_id", "supplier_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v) if v is not None else None


class InventoryMovementItemOut(BaseModel):
    id: str
    movement_id: str
    product_id: str
    product_name: str
    barcode: str
    brand_name: Optional[str]
    quantity: int
    before_quantity: int = 0
    after_quantity: int = 0
    cost_price: Optional[float] = None
    subtotal: Optional[float] = None

    model_config = {"from_attributes": True}

    @field_validator("id", "movement_id", "product_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)


class InventoryMovementOut(BaseModel):
    id: str
    order_no: str
    movement_type: MovementType
    warehouse_id: str
    warehouse_name: Optional[str] = None
    from_warehouse_id: Optional[str] = None
    from_warehouse_name: Optional[str] = None
    to_warehouse_id: Optional[str] = None
    to_warehouse_name: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    operator: Optional[str] = None
    remark: Optional[str]
    items: List[InventoryMovementItemOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", "warehouse_id", "from_warehouse_id", "to_warehouse_id", "supplier_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v) if v is not None else None


class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    contact_person: Optional[str] = Field(None, max_length=100)
    contact_phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=255)
    remark: Optional[str] = Field(None, max_length=255)
    status: SupplierStatus = SupplierStatus.active


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    contact_person: Optional[str] = Field(None, max_length=100)
    contact_phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=255)
    remark: Optional[str] = Field(None, max_length=255)
    status: Optional[SupplierStatus] = None


class SupplierOut(BaseModel):
    id: str
    name: str
    contact_person: Optional[str]
    contact_phone: Optional[str]
    address: Optional[str]
    remark: Optional[str]
    status: SupplierStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)
