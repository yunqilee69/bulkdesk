from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.customer import MemberPriceCreate, MemberPriceUpdate
from app.schemas.product import (
    CostPriceChangeRequest,
    MemberPriceBatchItem,
    MemberPriceRequest,
    ProductCreate,
    SalePriceChangeRequest,
)
from app.services.order_service import _effective_order_price


def test_standard_price_must_be_positive():
    with pytest.raises(ValidationError):
        ProductCreate(
            name="测试商品",
            barcode="ZERO-STANDARD",
            category_id="00000000-0000-0000-0000-000000000001",
            unit="件",
            standard_price=0,
            cost_price=0,
        )


@pytest.mark.parametrize(
    "schema",
    [MemberPriceBatchItem, MemberPriceCreate, MemberPriceUpdate, MemberPriceRequest],
)
def test_member_price_must_be_positive(schema):
    payload = {"price": 0}
    if schema in (MemberPriceBatchItem, MemberPriceCreate):
        payload["level_id"] = "00000000-0000-0000-0000-000000000001"
    if schema is MemberPriceCreate:
        payload["product_id"] = "00000000-0000-0000-0000-000000000001"

    with pytest.raises(ValidationError):
        schema(**payload)


def test_cost_price_can_be_zero():
    assert CostPriceChangeRequest(price=0).price == 0


def test_effective_order_price_falls_back_only_for_missing_member_price():
    assert _effective_order_price(None, Decimal("100")) == Decimal("100")
    assert _effective_order_price(Decimal("80"), Decimal("100")) == Decimal("80")
    assert _effective_order_price(Decimal("0"), Decimal("100")) == Decimal("0")
