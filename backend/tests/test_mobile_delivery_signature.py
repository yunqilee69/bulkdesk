from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models.order_delivery import OrderDelivery
from app.schemas.order_delivery import (
    OrderDeliveryArchiveOut,
    OrderDeliveryDetailOut,
    OrderDeliverySignRequest,
)


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "migrations"
    / "incremental"
    / "2026-07-22_配送签名凭证.sql"
)


def test_delivery_signature_migration_contract():
    assert MIGRATION_PATH.is_file(), f"missing migration: {MIGRATION_PATH}"

    normalized_sql = " ".join(MIGRATION_PATH.read_text(encoding="utf-8").split()).lower()

    assert normalized_sql == (
        "begin; alter table order_deliveries add column if not exists "
        "signature_image_url character varying(1000); comment on column "
        "order_deliveries.signature_image_url is "
        "'客户手写签名png的公开url；历史web签收记录允许为空'; commit;"
    )


def test_delivery_signature_model_and_schema_contract():
    assert "signature_image_url" in OrderDelivery.__table__.columns
    assert "signature_image_url" in OrderDeliverySignRequest.model_fields
    assert "signature_image_url" in OrderDeliveryDetailOut.model_fields
    assert "signature_image_url" in OrderDeliveryArchiveOut.model_fields


def test_mobile_signature_requires_non_empty_url_when_supplied():
    with pytest.raises(ValidationError):
        OrderDeliverySignRequest(signer_name="李四", signature_image_url="   ")

    request = OrderDeliverySignRequest(
        signer_name="李四",
        signature_image_url="  https://example.test/signature.png  ",
    )
    assert request.signature_image_url == "https://example.test/signature.png"
