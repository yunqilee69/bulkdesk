from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.product import BrandStatus, CategoryStatus, PriceType, ProductStatus


class BrandCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    logo_url: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = Field(None, max_length=255)
    sort_order: int = 0
    status: BrandStatus = BrandStatus.active


class BrandUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    logo_url: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = Field(None, max_length=255)
    sort_order: Optional[int] = None
    status: Optional[BrandStatus] = None


class BrandOut(BrandCreate):
    id: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, value): return str(value)


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    status: CategoryStatus = CategoryStatus.active


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    status: Optional[CategoryStatus] = None


class CategoryOut(CategoryCreate):
    id: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, value): return str(value)


class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    short_name: Optional[str] = Field(None, max_length=100)
    barcode: str = Field(..., min_length=1, max_length=50)
    category_id: str
    brand_id: Optional[str] = None
    specification: Optional[str] = Field(None, max_length=200)
    unit: str = Field(..., min_length=1, max_length=20)
    standard_price: float = Field(..., ge=0)
    cost_price: float = Field(..., ge=0)
    price_reason: str = Field(..., min_length=1, max_length=255)
    image_urls: Optional[list[str]] = None
    description: Optional[str] = None
    status: ProductStatus = ProductStatus.active


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    short_name: Optional[str] = Field(None, max_length=100)
    barcode: Optional[str] = Field(None, min_length=1, max_length=50)
    category_id: Optional[str] = None
    brand_id: Optional[str] = None
    specification: Optional[str] = Field(None, max_length=200)
    unit: Optional[str] = Field(None, min_length=1, max_length=20)
    image_urls: Optional[list[str]] = None
    description: Optional[str] = None
    status: Optional[ProductStatus] = None


class ProductOut(BaseModel):
    id: str
    name: str
    short_name: Optional[str]
    barcode: str
    category_id: str
    category_name: Optional[str] = None
    brand_id: Optional[str]
    brand_name: Optional[str] = None
    specification: Optional[str]
    unit: str
    standard_price: float
    cost_price: float
    image_urls: Optional[list[str]]
    description: Optional[str]
    status: ProductStatus
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

    @field_validator("id", "category_id", "brand_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value): return str(value) if value is not None else None


class PriceChangeRequest(BaseModel):
    price: float = Field(..., ge=0)
    reason: str = Field(..., min_length=1, max_length=255)


class MemberPriceRequest(PriceChangeRequest):
    pass


class PriceChangeLogOut(BaseModel):
    id: str
    product_id: str
    product_name: Optional[str] = None
    barcode: Optional[str] = None
    price_type: PriceType
    level_id: Optional[str] = None
    level_name: Optional[str] = None
    old_value: Optional[float]
    new_value: float
    reason: str
    operator_name: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}

    @field_validator("id", "product_id", "level_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value): return str(value) if value is not None else None
