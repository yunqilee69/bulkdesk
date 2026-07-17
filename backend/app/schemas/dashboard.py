from datetime import datetime
from typing import List, Optional

from app.schemas.common import ApiSchema

class OrderTrendItem(ApiSchema):
    date: str
    order_count: int
    order_amount: float


class CustomerRankingItem(ApiSchema):
    customer_id: str
    customer_name: str
    total_amount: float
    order_count: int


class InventoryAlertItem(ApiSchema):
    id: str
    product_id: str
    product_info: str
    quantity: int
    locked: int
    warning_quantity: int
    product_image_url: Optional[str] = None
    warehouse_count: int = 0

    model_config = {"from_attributes": True}

    @classmethod
    def uuid_to_str(cls, v):
        return str(v) if v is not None else None


class ProductSaleItem(ApiSchema):
    product_id: str
    barcode: str
    product_name: str
    total_quantity: int
    total_amount: float


class DashboardStats(ApiSchema):
    customer_total: int
    product_total: int
    order_total: int
    employee_total: int
    order_trend: List[OrderTrendItem]
    customer_ranking: List[CustomerRankingItem]
    inventory_alerts: List[InventoryAlertItem]
    product_sales: List[ProductSaleItem]
