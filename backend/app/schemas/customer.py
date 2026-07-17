from datetime import datetime
from typing import List, Optional

from pydantic import Field, field_validator

from app.schemas.common import ApiSchema

class CustomerCreate(ApiSchema):
    name: str = Field(..., min_length=1, max_length=100)
    contact_name: str = Field(..., min_length=1, max_length=50)
    contact_phone: str = Field(..., min_length=1, max_length=20)
    level_id: str
    address: Optional[str] = None
    remark: Optional[str] = None
    image_urls: Optional[List[str]] = None


class CustomerUpdate(ApiSchema):
    name: Optional[str] = Field(None, max_length=100)
    contact_name: Optional[str] = Field(None, max_length=50)
    contact_phone: Optional[str] = None
    level_id: Optional[str] = None
    address: Optional[str] = None
    remark: Optional[str] = None
    image_urls: Optional[List[str]] = None


class CustomerOut(ApiSchema):
    id: str
    name: str
    contact_name: str
    contact_phone: str
    level_id: str
    level_name: Optional[str] = None
    address: Optional[str]
    remark: Optional[str]
    image_urls: Optional[List[str]]
    total_spent: float = 0
    order_count: int = 0
    last_order_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", "level_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)


class CustomerLevelCreate(ApiSchema):
    name: str = Field(..., min_length=1, max_length=50)
    min_spent: float = Field(0, ge=0)
    sort_order: int = Field(0)
    is_default: bool = Field(False)


class CustomerLevelUpdate(ApiSchema):
    name: Optional[str] = Field(None, max_length=50)
    min_spent: Optional[float] = Field(None, ge=0)
    sort_order: Optional[int] = None
    is_default: Optional[bool] = None


class CustomerLevelOut(ApiSchema):
    id: str
    name: str
    min_spent: float
    sort_order: int
    is_default: bool
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)


class MemberPriceCreate(ApiSchema):
    product_id: str
    level_id: str
    price: float = Field(..., ge=0)


class MemberPriceUpdate(ApiSchema):
    price: float = Field(..., ge=0)


class MemberPriceOut(ApiSchema):
    id: str
    product_id: str
    level_id: str
    product_name: Optional[str] = None
    barcode: Optional[str] = None
    level_name: Optional[str] = None
    price: float
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", "product_id", "level_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)
