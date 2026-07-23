import enum
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import field_validator

from app.models.product import ProductStatus
from app.schemas.common import ApiSchema


class MobileDashboardActionOut(ApiSchema):
    key: str
    title: str
    path: str


class MobileDashboardOut(ApiSchema):
    actions: list[MobileDashboardActionOut]
    summary: dict[str, int | float | str]
    alerts: list[str]


class MobileCustomerSummaryOut(ApiSchema):
    id: str
    name: str
    contact_name: str
    contact_phone: str
    level_name: Optional[str] = None
    address: Optional[str] = None
    total_spent: float
    order_count: int
    last_order_at: Optional[datetime] = None
    open_order_count: int = 0
    delivering_order_count: int = 0

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> str:
        return str(value)


class MobileWarehouseStockOut(ApiSchema):
    warehouse_id: str
    warehouse_name: str
    quantity: int
    locked: int
    available_quantity: int

    @field_validator("warehouse_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> str:
        return str(value)


class MobileProductBarcodeOut(ApiSchema):
    id: str
    name: str
    short_name: Optional[str] = None
    barcode: str
    unit: str
    standard_price: float
    status: ProductStatus
    warehouses: list[MobileWarehouseStockOut]

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> str:
        return str(value)

    @field_validator("standard_price", mode="before")
    @classmethod
    def decimal_to_float(cls, value: object) -> float:
        if isinstance(value, Decimal):
            return float(value)
        return value


class MobileProductCategoryOut(ApiSchema):
    id: str
    name: str

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> str:
        return str(value)


class MobileProductPriceSource(str, enum.Enum):
    standard = "standard"
    member = "member"


class MobileProductListItemOut(ApiSchema):
    id: str
    name: str
    short_name: Optional[str] = None
    barcode: str
    category_id: str
    category_name: Optional[str] = None
    brand_id: Optional[str] = None
    brand_name: Optional[str] = None
    unit: str
    image_url: Optional[str] = None
    standard_price: float
    display_price: float
    price_source: MobileProductPriceSource = MobileProductPriceSource.standard
    status: ProductStatus
    available_quantity: int = 0

    @field_validator("id", "category_id", "brand_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> Optional[str]:
        return str(value) if value is not None else None

    @field_validator("standard_price", "display_price", mode="before")
    @classmethod
    def decimal_to_float(cls, value: object) -> float:
        if isinstance(value, Decimal):
            return float(value)
        return value
