import uuid
import json
import inspect
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException, Request
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.models.customer import Customer, CustomerLevel, MemberPrice
from app.main import app
from app.models.inventory import (
    Inventory,
    InventoryMovement,
    MovementType,
    Warehouse,
    WarehouseStatus,
)
from app.models.employee import (
    Employee,
    EmployeeRole,
    EmployeeRoleAssignment,
    EmployeeStatus,
)
from app.models.order import (
    Order,
    OrderInventoryAllocation,
    OrderInventoryAllocationStatus,
    OrderItem,
    OrderStatus,
    OrderStatusLog,
)
from app.models import order as order_models
from app.models.product import PriceChangeLog, PriceType, Product, ProductStatus
from app.schemas.dashboard import DashboardStats
from app.schemas.inventory import (
    InventoryListItemOut,
    StockInRequest,
    TransferRequest,
    WarehouseCreate,
)
from app.schemas.customer import CustomerLevelCreate
from app.schemas.order import (
    OrderActionRequest,
    OrderCreate,
    OrderCompleteRequest,
    OrderItemCreate,
    OrderOut,
    OrderShipmentAllocation,
    OrderShipRequest,
    OrderStockOutRequest,
)
from app.schemas import order as order_schemas
from app.schemas.product import (
    MemberPriceBatchItem,
    MemberPriceBatchUpdate,
    PriceChangeLogOut,
    PriceChangeRequest,
    ProductCreate,
    ProductUpdate,
    ProductWarningQuantityUpdate,
)
from app.services import dashboard_service, employee_service, inventory_service, order_service, product_service
from app.api.v1 import upload as upload_api
from app.api.v1 import product as product_api


def _normalize_sql_fragment(value: str) -> str:
    normalized = " ".join(value.split()).lower()
    return (
        normalized.replace("( ", "(")
        .replace(" )", ")")
        .replace("[ ", "[")
        .replace(" ]", "]")
    )


def _extract_create_table_block(sql: str, table_name: str) -> str:
    match = re.search(
        rf"CREATE TABLE IF NOT EXISTS {table_name}\s*\((.*?)\n\);",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    assert match is not None, f"missing CREATE TABLE block for {table_name}"
    return _normalize_sql_fragment(match.group(1))


def test_order_delivery_migration_sql_contract():
    from app.models.order_delivery import OrderDelivery, OrderDeliveryEvent

    migration_path = (
        Path(__file__).parents[1]
        / "migrations"
        / "incremental"
        / "2026-07-19_新增订单配送管理.sql"
    )
    sql = migration_path.read_text(encoding="utf-8")
    normalized_sql = _normalize_sql_fragment(sql)

    assert normalized_sql.startswith("begin;")
    assert normalized_sql.endswith("commit;")
    enum_contracts = {
        "order_delivery_status": "('delivering', 'signed')",
        "order_delivery_event_type": (
            "('assigned', 'reassigned', 'exception', 'signed')"
        ),
        "order_delivery_exception_type": (
            "('customer_absent', 'customer_refused', 'invalid_contact', 'other')"
        ),
    }
    for enum_name, enum_values in enum_contracts.items():
        enum_guard = (
            f"do $$ begin create type {enum_name} as enum {enum_values}; "
            "exception when duplicate_object then null; end $$;"
        )
        assert enum_guard in normalized_sql

    assert normalized_sql.count("when duplicate_object then null;") == 3
    assert "create table if not exists order_deliveries (" in normalized_sql
    assert "create table if not exists order_delivery_events (" in normalized_sql
    assert normalized_sql.count("create index if not exists ") == 4
    assert "default gen_random_uuid()" not in normalized_sql
    assert "default uuid_generate_v4()" not in normalized_sql

    mutation_scan_sql = re.sub(r"'(?:''|[^'])*'", "''", sql)
    assert re.search(
        r"\b(drop|alter|insert|update|delete|truncate)\b",
        mutation_scan_sql,
        flags=re.IGNORECASE,
    ) is None

    delivery_table_sql = _extract_create_table_block(sql, "order_deliveries")
    event_table_sql = _extract_create_table_block(sql, "order_delivery_events")

    delivery_columns = (
        "id uuid primary key",
        "order_id uuid not null references orders(id)",
        "delivery_employee_id uuid not null references employees(id)",
        "delivery_employee_name character varying(100) not null",
        "status order_delivery_status not null default 'delivering'",
        "recipient_name character varying(100) not null",
        "recipient_phone character varying(20) not null",
        "delivery_address character varying(500) not null",
        "assigned_at timestamp without time zone not null default now()",
        "assigned_by_id uuid not null references employees(id)",
        "assigned_by_name character varying(100) not null",
        "signer_name character varying(100)",
        "proof_image_urls json",
        "sign_remark text",
        "signed_at timestamp without time zone",
        "signed_by_id uuid references employees(id)",
        "signed_by_name character varying(100)",
        "created_at timestamp without time zone not null default now()",
        "updated_at timestamp without time zone not null default now()",
    )
    for column_contract in delivery_columns:
        assert column_contract in delivery_table_sql

    signed_check = (
        "constraint ck_order_deliveries_signed_fields check "
        "(status <> 'signed' or (signer_name is not null and signed_at is not null "
        "and signed_by_id is not null and signed_by_name is not null))"
    )
    delivering_check = (
        "constraint ck_order_deliveries_delivering_fields check "
        "(status <> 'delivering' or (signer_name is null and proof_image_urls is null "
        "and sign_remark is null and signed_at is null and signed_by_id is null "
        "and signed_by_name is null))"
    )
    proof_images_check = (
        "constraint ck_order_deliveries_proof_image_urls_array check "
        "(proof_image_urls is null or json_typeof(proof_image_urls) = 'array')"
    )
    assert signed_check in delivery_table_sql
    assert delivering_check in delivery_table_sql
    assert proof_images_check in delivery_table_sql
    assert "constraint uq_order_deliveries_order_id unique (order_id)" in delivery_table_sql

    event_columns = (
        "id uuid primary key",
        "delivery_id uuid not null references order_deliveries(id)",
        "event_type order_delivery_event_type not null",
        "from_employee_id uuid references employees(id)",
        "from_employee_name character varying(100)",
        "to_employee_id uuid references employees(id)",
        "to_employee_name character varying(100)",
        "exception_type order_delivery_exception_type",
        "remark text",
        "operator_id uuid not null references employees(id)",
        "operator_name character varying(100) not null",
        "created_at timestamp without time zone not null default now()",
    )
    for column_contract in event_columns:
        assert column_contract in event_table_sql

    model_indexes = {
        index.name: (index.table.name, tuple(index.columns.keys()))
        for table in (OrderDelivery.__table__, OrderDeliveryEvent.__table__)
        for index in table.indexes
    }
    expected_indexes = {
        "ix_order_deliveries_delivery_employee_status": (
            "order_deliveries",
            ("delivery_employee_id", "status"),
        ),
        "ix_order_deliveries_status_signed_at": (
            "order_deliveries",
            ("status", "signed_at"),
        ),
        "ix_order_delivery_events_delivery_created_at": (
            "order_delivery_events",
            ("delivery_id", "created_at"),
        ),
        "ix_order_delivery_events_event_type_delivery_created_at": (
            "order_delivery_events",
            ("event_type", "delivery_id", "created_at"),
        ),
    }
    assert model_indexes == expected_indexes
    for index_name, (table_name, columns) in model_indexes.items():
        index_contract = (
            f"create index if not exists {index_name} on "
            f"{table_name}({', '.join(columns)});"
        )
        assert index_contract in normalized_sql

    model_constraint_names = {
        constraint.name
        for constraint in OrderDelivery.__table__.constraints
        if constraint.name is not None
    }
    expected_constraint_names = {
        "uq_order_deliveries_order_id",
        "ck_order_deliveries_signed_fields",
        "ck_order_deliveries_delivering_fields",
        "ck_order_deliveries_proof_image_urls_array",
    }
    assert model_constraint_names == expected_constraint_names
    for constraint_name in model_constraint_names:
        assert f"constraint {constraint_name} " in delivery_table_sql

    comment_contracts = (
        "comment on table order_deliveries is '订单配送记录';",
        "comment on table order_delivery_events is '订单配送事件记录';",
        "comment on column order_deliveries.delivery_employee_id is '当前配送员id';",
        "comment on column order_deliveries.recipient_name is '收货联系人快照';",
        "comment on column order_deliveries.status is '配送状态';",
        "comment on column order_deliveries.signed_at is '签收时间';",
        "comment on column order_delivery_events.event_type is '配送事件类型';",
        "comment on column order_delivery_events.exception_type is '配送异常类型';",
    )
    for comment_contract in comment_contracts:
        assert comment_contract in normalized_sql
    assert normalized_sql.index("comment on table order_deliveries") > normalized_sql.index(
        "create table if not exists order_deliveries"
    )
    assert normalized_sql.index(
        "comment on table order_delivery_events"
    ) > normalized_sql.index("create table if not exists order_delivery_events")
    assert "create trigger" not in normalized_sql

    postcondition_tokens = (
        "array_agg(e.enumlabel order by e.enumsortorder)",
        "from pg_type t join pg_enum e on e.enumtypid = t.oid",
        "to_regclass(format('%i.%i', current_schema(), required_table))",
        "from pg_constraint c",
        "from pg_index i",
        "join pg_attribute a",
        "i.indkey::smallint[]",
        "raise exception",
        "array['delivering', 'signed']::text[]",
        "array['assigned', 'reassigned', 'exception', 'signed']::text[]",
        "array['customer_absent', 'customer_refused', 'invalid_contact', 'other']::text[]",
    )
    for token in postcondition_tokens:
        assert token in normalized_sql
    for constraint_name in (
        "uq_order_deliveries_order_id",
        "ck_order_deliveries_signed_fields",
        "ck_order_deliveries_delivering_fields",
        "ck_order_deliveries_proof_image_urls_array",
        "order_deliveries_order_id_fkey",
        "order_deliveries_delivery_employee_id_fkey",
        "order_deliveries_assigned_by_id_fkey",
        "order_deliveries_signed_by_id_fkey",
        "order_delivery_events_delivery_id_fkey",
        "order_delivery_events_from_employee_id_fkey",
        "order_delivery_events_to_employee_id_fkey",
        "order_delivery_events_operator_id_fkey",
    ):
        assert constraint_name in normalized_sql
    for index_name in expected_indexes:
        assert normalized_sql.count(index_name) >= 2


def test_order_payment_migration_sql_contract():
    migration_path = (
        Path(__file__).parents[1]
        / "migrations"
        / "incremental"
        / "2026-07-20_新增订单收款凭证.sql"
    )
    sql = migration_path.read_text(encoding="utf-8")
    normalized_sql = _normalize_sql_fragment(sql)

    assert normalized_sql.startswith("begin;")
    assert normalized_sql.endswith("commit;")
    assert "add column if not exists paid_amount numeric(12, 2)" in normalized_sql
    assert "add column if not exists payment_proof_image_urls json" in normalized_sql
    assert "set paid_amount = total_amount" in normalized_sql
    assert "set payment_proof_image_urls = '[]'::json" in normalized_sql
    assert "ck_orders_paid_amount_range" in normalized_sql
    assert "paid_amount > 0 and paid_amount <= total_amount" in normalized_sql
    assert "ck_orders_payment_proof_image_urls_array" in normalized_sql
    assert "json_typeof(payment_proof_image_urls) = 'array'" in normalized_sql
    assert "comment on column orders.paid_amount" in normalized_sql
    assert "comment on column orders.payment_proof_image_urls" in normalized_sql

    model_constraint_names = {
        constraint.name
        for constraint in Order.__table__.constraints
        if constraint.name is not None
    }
    assert {
        "ck_orders_paid_amount_range",
        "ck_orders_payment_proof_image_urls_array",
    }.issubset(model_constraint_names)


class FakeScalarResult:
    def __init__(self, values):
        self._values = values

    def all(self):
        return list(self._values)

    def one_or_none(self):
        if not self._values:
            return None
        if len(self._values) != 1:
            raise AssertionError("Expected at most one mapping row")
        return self._values[0]


class StrictUniqueMappingResult(FakeScalarResult):
    def all(self):
        raise AssertionError("unique detail query must use mappings().one_or_none()")


class FakeResult:
    def __init__(self, one=None, values=None, scalar=None, mappings=None):
        self._one = one
        self._values = values or []
        self._scalar = scalar
        self._mappings = mappings or []

    def scalar_one_or_none(self):
        return self._one

    def one_or_none(self):
        return self._one

    def scalar(self):
        return self._scalar

    def scalars(self):
        return FakeScalarResult(self._values)

    def all(self):
        return list(self._values)

    def mappings(self):
        return FakeScalarResult(self._mappings)


class StrictRowResult(FakeResult):
    def scalar_one_or_none(self):
        raise AssertionError("row query must use one_or_none()")


class StrictUniqueMappingQueryResult(FakeResult):
    def mappings(self):
        return StrictUniqueMappingResult(self._mappings)


class QueueDb:
    def __init__(self, results=None):
        self.results = list(results or [])
        self.added = []
        self.flushed = False
        self.refreshed = []
        self.statements = []
        self.statement_params = []

    async def execute(self, statement):
        self.statements.append(str(statement))
        self.statement_params.append(statement.compile().params)
        if not self.results:
            raise AssertionError("Unexpected query")
        return self.results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    def add_all(self, objs):
        self.added.extend(objs)

    async def flush(self):
        self.flushed = True
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()

    async def refresh(self, obj, attribute_names=None):
        self.refreshed.append(obj)
        return None


@pytest.mark.asyncio
async def test_get_db_rollback_after_yield_exception_does_not_commit(monkeypatch):
    from app.core import database

    class FakeSession:
        def __init__(self):
            self.commit_calls = 0
            self.rollback_calls = 0

        async def commit(self):
            self.commit_calls += 1

        async def rollback(self):
            self.rollback_calls += 1

    class FakeSessionContext:
        def __init__(self, session):
            self.session = session

        async def __aenter__(self):
            return self.session

        async def __aexit__(self, exc_type, exc, traceback):
            return False

    session = FakeSession()
    monkeypatch.setattr(
        database,
        "async_session_factory",
        lambda: FakeSessionContext(session),
    )
    dependency = database.get_db()

    assert await anext(dependency) is session
    with pytest.raises(RuntimeError, match="request failed"):
        await dependency.athrow(RuntimeError("request failed"))

    assert session.rollback_calls == 1
    assert session.commit_calls == 0


class CreateOrderDb(QueueDb):
    def __init__(self, customer, inventories, product, level, member_price=None):
        super().__init__()
        self.customer = customer
        self.inventories = inventories if isinstance(inventories, list) else [inventories]
        self.product = product
        self.level = level
        self.member_price = member_price

    async def execute(self, statement):
        sql = str(statement)
        self.statements.append(sql)
        if "FROM customers" in sql:
            return FakeResult(one=self.customer)
        if "FROM inventory" in sql:
            return FakeResult(values=[(inventory, index == 0) for index, inventory in enumerate(self.inventories)])
        if "FROM products" in sql:
            return FakeResult(one=self.product)
        if "FROM member_prices" in sql:
            return FakeResult(one=self.member_price)
        if "FROM customer_levels" in sql:
            return FakeResult(one=self.level)
        if "FROM orders" in sql:
            return FakeResult(scalar=0)
        raise AssertionError(f"Unexpected query: {sql}")


def test_member_price_batch_accepts_empty_reason():
    request = MemberPriceBatchUpdate(
        reason=None,
        items=[MemberPriceBatchItem(level_id=str(uuid.uuid4()), price=88.5)],
    )

    assert request.reason is None


def test_member_price_batch_rejects_duplicate_levels():
    level_id = str(uuid.uuid4())

    with pytest.raises(ValidationError, match="会员等级不能重复"):
        MemberPriceBatchUpdate(
            items=[
                MemberPriceBatchItem(level_id=level_id, price=1),
                MemberPriceBatchItem(level_id=level_id, price=2),
            ]
        )


def test_product_price_reasons_are_optional():
    product = ProductCreate(
        name="测试商品",
        barcode="6900000000001",
        category_id=str(uuid.uuid4()),
        unit="件",
        standard_price=12.34,
        cost_price=5.67,
    )
    price_change = PriceChangeRequest(price=13.5)

    assert product.price_reason == ""
    assert product.member_prices == []
    assert price_change.reason == ""


def test_product_create_rejects_duplicate_member_levels():
    level_id = str(uuid.uuid4())

    with pytest.raises(ValidationError, match="会员等级不能重复"):
        ProductCreate(
            name="测试商品",
            barcode="6900000000001",
            category_id=str(uuid.uuid4()),
            unit="件",
            standard_price=12.34,
            cost_price=5.67,
            member_prices=[
                {"level_id": level_id, "price": 88},
                {"level_id": level_id, "price": 78},
            ],
        )


@pytest.mark.asyncio
async def test_create_product_rejects_duplicate_barcode():
    request = ProductCreate(
        name="测试商品",
        barcode="6900000000001",
        category_id=str(uuid.uuid4()),
        unit="件",
        standard_price=12.34,
        cost_price=5.67,
        price_reason="首次建档",
    )
    db = QueueDb([FakeResult(one=request.category_id), FakeResult(one=uuid.uuid4())])

    with pytest.raises(ValueError, match="条形码已存在"):
        await product_service.create_product(db, request)

    assert db.added == []


@pytest.mark.asyncio
async def test_create_product_saves_member_prices_and_logs(monkeypatch):
    category_id = str(uuid.uuid4())
    normal_level = CustomerLevel(id=uuid.uuid4(), name="普通会员", min_spent=Decimal("0"))
    gold_level = CustomerLevel(id=uuid.uuid4(), name="黄金会员", min_spent=Decimal("1000"))
    request = ProductCreate(
        name="测试商品",
        barcode="6900000000001",
        category_id=category_id,
        unit="件",
        standard_price=100,
        cost_price=60,
        member_prices=[
            {"level_id": str(normal_level.id), "price": 95},
            {"level_id": str(gold_level.id), "price": 88},
        ],
    )
    db = QueueDb(
        [
            FakeResult(one=category_id),
            FakeResult(one=None),
            FakeResult(values=[normal_level, gold_level]),
        ]
    )

    async def populated_product(_db, _product):
        return "created-product"

    monkeypatch.setattr(product_service, "_populate_product_out", populated_product)

    result = await product_service.create_product(db, request, "admin")

    products = [item for item in db.added if isinstance(item, Product)]
    member_prices = [item for item in db.added if isinstance(item, MemberPrice)]
    logs = [item for item in db.added if isinstance(item, PriceChangeLog)]
    assert result == "created-product"
    assert len(products) == 1
    assert [(str(item.level_id), item.price) for item in member_prices] == [
        (str(normal_level.id), 95),
        (str(gold_level.id), 88),
    ]
    assert [(item.price_type, str(item.level_id) if item.level_id else None, item.new_value, item.reason) for item in logs] == [
        (PriceType.standard_price, None, 100, ""),
        (PriceType.cost_price, None, 60, ""),
        (PriceType.member_price, str(normal_level.id), 95, ""),
        (PriceType.member_price, str(gold_level.id), 88, ""),
    ]


@pytest.mark.asyncio
async def test_create_product_validates_member_levels_before_writing():
    category_id = str(uuid.uuid4())
    known_level = CustomerLevel(id=uuid.uuid4(), name="普通会员", min_spent=Decimal("0"))
    request = ProductCreate(
        name="测试商品",
        barcode="6900000000001",
        category_id=category_id,
        unit="件",
        standard_price=100,
        cost_price=60,
        member_prices=[
            {"level_id": str(known_level.id), "price": 95},
            {"level_id": str(uuid.uuid4()), "price": 88},
        ],
    )
    db = QueueDb(
        [
            FakeResult(one=category_id),
            FakeResult(one=None),
            FakeResult(values=[known_level]),
        ]
    )

    with pytest.raises(ValueError, match="会员等级不存在"):
        await product_service.create_product(db, request, "admin")

    assert db.added == []


@pytest.mark.asyncio
async def test_update_product_refreshes_database_generated_timestamps(monkeypatch):
    product = Product(
        id=uuid.uuid4(),
        name="测试商品",
        barcode="6900000000001",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("12.34"),
        cost_price=Decimal("5.67"),
    )
    db = QueueDb([FakeResult(one=product)])
    refreshed = []

    async def refresh(instance, attribute_names=None):
        refreshed.append((instance, attribute_names))

    async def populate_product_out(_db, instance):
        assert instance is product
        return "updated-product"

    db.refresh = refresh
    monkeypatch.setattr(product_service, "_populate_product_out", populate_product_out)

    result = await product_service.update_product(
        db,
        str(product.id),
        ProductUpdate(name="更新后的商品"),
    )

    assert result == "updated-product"
    assert product.name == "更新后的商品"
    assert refreshed == [(product, None)]


@pytest.mark.asyncio
async def test_list_member_prices_returns_every_level_with_nullable_price():
    product = Product(
        id=uuid.uuid4(),
        name="测试商品",
        barcode="6900000000001",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("12.34"),
        cost_price=Decimal("5.67"),
    )
    normal_level_id = uuid.uuid4()
    gold_level_id = uuid.uuid4()
    db = QueueDb(
        [
            FakeResult(one=product),
            FakeResult(
                values=[
                    (normal_level_id, "普通会员", Decimal("88.50")),
                    (gold_level_id, "黄金会员", None),
                ]
            ),
        ]
    )

    rows = await product_service.list_member_prices(db, str(product.id))

    assert [(row.level_id, row.level_name, row.price) for row in rows] == [
        (str(normal_level_id), "普通会员", 88.5),
        (str(gold_level_id), "黄金会员", None),
    ]


@pytest.mark.asyncio
async def test_batch_update_member_prices_creates_updates_and_logs_only_changes(monkeypatch):
    product = Product(
        id=uuid.uuid4(),
        name="测试商品",
        barcode="6900000000001",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("12.34"),
        cost_price=Decimal("5.67"),
    )
    normal_level = CustomerLevel(id=uuid.uuid4(), name="普通会员", min_spent=Decimal("0"))
    gold_level = CustomerLevel(id=uuid.uuid4(), name="黄金会员", min_spent=Decimal("1000"))
    silver_level = CustomerLevel(id=uuid.uuid4(), name="白银会员", min_spent=Decimal("500"))
    existing_price = MemberPrice(
        id=uuid.uuid4(),
        product_id=product.id,
        level_id=normal_level.id,
        price=Decimal("80.00"),
    )
    unchanged_price = MemberPrice(
        id=uuid.uuid4(),
        product_id=product.id,
        level_id=silver_level.id,
        price=Decimal("50.50"),
    )
    db = QueueDb(
        [
            FakeResult(one=product),
            FakeResult(values=[normal_level, gold_level, silver_level]),
            FakeResult(values=[existing_price, unchanged_price]),
        ]
    )

    async def populate_product_out(_db, instance):
        assert instance is product
        return "updated-product"

    monkeypatch.setattr(product_service, "_populate_product_out", populate_product_out)
    result = await product_service.batch_update_member_prices(
        db,
        str(product.id),
        MemberPriceBatchUpdate(
            items=[
                MemberPriceBatchItem(level_id=str(normal_level.id), price=90),
                MemberPriceBatchItem(level_id=str(gold_level.id), price=70),
                MemberPriceBatchItem(level_id=str(silver_level.id), price=50.5),
            ]
        ),
        "admin",
    )

    added_prices = [item for item in db.added if isinstance(item, MemberPrice)]
    logs = [item for item in db.added if isinstance(item, PriceChangeLog)]
    assert result == "updated-product"
    assert existing_price.price == 90
    assert [(item.level_id, item.price) for item in added_prices] == [(str(gold_level.id), 70)]
    assert [(item.level_id, item.old_value, item.new_value, item.reason) for item in logs] == [
        (str(normal_level.id), 80, 90, ""),
        (str(gold_level.id), None, 70, ""),
    ]


@pytest.mark.asyncio
async def test_batch_update_member_prices_validates_levels_before_writing():
    product = Product(
        id=uuid.uuid4(),
        name="测试商品",
        barcode="6900000000001",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("12.34"),
        cost_price=Decimal("5.67"),
    )
    known_level = CustomerLevel(id=uuid.uuid4(), name="普通会员", min_spent=Decimal("0"))
    db = QueueDb([FakeResult(one=product), FakeResult(values=[known_level])])

    with pytest.raises(ValueError, match="会员等级不存在"):
        await product_service.batch_update_member_prices(
            db,
            str(product.id),
            MemberPriceBatchUpdate(
                items=[
                    MemberPriceBatchItem(level_id=str(known_level.id), price=90),
                    MemberPriceBatchItem(level_id=str(uuid.uuid4()), price=70),
                ]
            ),
            "admin",
        )

    assert db.added == []


@pytest.mark.asyncio
async def test_member_price_routes_delegate_to_services(monkeypatch):
    product_id = str(uuid.uuid4())
    request = MemberPriceBatchUpdate(
        items=[MemberPriceBatchItem(level_id=str(uuid.uuid4()), price=88.5)]
    )
    expected_rows = [object()]
    expected_product = object()
    received = {}

    async def list_prices(db, received_product_id):
        received["list"] = (db, received_product_id)
        return expected_rows

    async def batch_update(db, received_product_id, received_request, operator_name):
        received["batch"] = (db, received_product_id, received_request, operator_name)
        return expected_product

    monkeypatch.setattr(product_api.product_service, "list_member_prices", list_prices)
    monkeypatch.setattr(product_api.product_service, "batch_update_member_prices", batch_update)
    db = object()
    admin = type("Admin", (), {"username": "admin"})()

    listed = await product_api.list_member_prices(product_id, admin, db)
    updated = await product_api.batch_member_prices(product_id, request, admin, db)

    assert listed.data == expected_rows
    assert updated.data == expected_product
    assert received["list"] == (db, product_id)
    assert received["batch"] == (db, product_id, request, "admin")


@pytest.mark.asyncio
async def test_list_price_change_logs_populates_member_level_name():
    product_id = uuid.uuid4()
    level_id = uuid.uuid4()
    log = PriceChangeLog(
        id=uuid.uuid4(),
        product_id=product_id,
        price_type="member_price",
        level_id=level_id,
        old_value=Decimal("80"),
        new_value=Decimal("90"),
        reason="调价",
        created_at=datetime.now(timezone.utc),
    )
    db = QueueDb(
        [
            FakeResult(scalar=1),
            FakeResult(values=[(log, "黄金会员", "测试商品", "6900000000001")]),
        ]
    )

    result = await product_service.list_price_change_logs(db, str(product_id))

    assert result.total == 1
    assert result.items[0].level_name == "黄金会员"
    assert result.items[0].product_name == "测试商品"


@pytest.mark.asyncio
async def test_list_all_price_change_logs_includes_product_details():
    product_id = uuid.uuid4()
    log = PriceChangeLog(
        id=uuid.uuid4(),
        product_id=product_id,
        price_type=PriceType.standard_price,
        old_value=Decimal("80"),
        new_value=Decimal("90"),
        reason="调价",
        created_at=datetime.now(timezone.utc),
    )
    db = QueueDb(
        [
            FakeResult(scalar=1),
            FakeResult(values=[(log, None, "测试商品", "6900000000001")]),
        ]
    )

    result = await product_service.list_price_change_logs(db)

    assert result.items[0].product_name == "测试商品"
    assert result.items[0].barcode == "6900000000001"


@pytest.mark.asyncio
async def test_change_standard_price_refreshes_product_before_serializing():
    product = Product(
        id=uuid.uuid4(),
        name="测试商品",
        barcode="6900000000001",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("80"),
        cost_price=Decimal("50"),
        status="active",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db = QueueDb([FakeResult(one=product), FakeResult(one="食品")])

    result = await product_service.change_price(
        db,
        str(product.id),
        PriceType.standard_price,
        PriceChangeRequest(price=90, reason="调价"),
        "admin",
    )

    assert result.standard_price == 90
    assert db.refreshed == [product]


@pytest.mark.asyncio
async def test_all_price_logs_route_queries_without_product_filter(monkeypatch):
    received = {}
    db = object()

    async def fake_list_price_change_logs(db, product_id, page, page_size):
        received.update(
            db=db,
            product_id=product_id,
            page=page,
            page_size=page_size,
        )
        return "logs"

    monkeypatch.setattr(product_api.product_service, "list_price_change_logs", fake_list_price_change_logs)

    response = await product_api.list_all_price_logs(page=2, page_size=50, user=object(), db=db)

    assert response.data == "logs"
    assert received == {
        "db": db,
        "product_id": None,
        "page": 2,
        "page_size": 50,
    }


@pytest.mark.asyncio
async def test_products_route_forwards_all_search_filters(monkeypatch):
    received = {}
    db = object()
    category_id = str(uuid.uuid4())
    brand_id = str(uuid.uuid4())

    async def fake_list_products(*args):
        received["args"] = args
        return "products"

    monkeypatch.setattr(product_api.product_service, "list_products", fake_list_products)

    response = await product_api.list_products(
        page=2,
        page_size=50,
        keyword="茉莉",
        category_id=category_id,
        brand_id=brand_id,
        barcode="6900",
        min_cost_price=10,
        max_cost_price=20,
        min_standard_price=30,
        max_standard_price=40,
        product_status=ProductStatus.active,
        user=object(),
        db=db,
    )

    assert response.data == "products"
    assert received["args"] == (
        db,
        2,
        50,
        "茉莉",
        category_id,
        brand_id,
        "6900",
        10,
        20,
        30,
        40,
        ProductStatus.active,
    )


@pytest.mark.asyncio
async def test_create_product_maps_unique_constraint_to_conflict(monkeypatch):
    request = ProductCreate(
        name="测试商品",
        barcode="6900000000001",
        category_id=str(uuid.uuid4()),
        unit="件",
        standard_price=12.34,
        cost_price=5.67,
        price_reason="首次建档",
    )

    async def raise_unique_constraint(*_args, **_kwargs):
        raise IntegrityError("INSERT INTO products", {}, Exception("duplicate key"))

    monkeypatch.setattr(product_api.product_service, "create_product", raise_unique_constraint)

    with pytest.raises(HTTPException) as error:
        await product_api.create_product(
            request,
            type("Admin", (), {"username": "admin"})(),
            object(),
        )

    assert error.value.status_code == 409
    assert error.value.detail == "条形码已存在"


@pytest.mark.asyncio
async def test_generate_order_no_is_unique_even_when_count_has_not_changed():
    db = QueueDb([FakeResult(scalar=0), FakeResult(scalar=0)])

    first = await order_service.generate_order_no(db)
    second = await order_service.generate_order_no(db)

    assert first != second
    expected_prefix = f"ORD{datetime.now(timezone.utc):%Y%m%d}000001"
    assert first.startswith(expected_prefix)
    assert second.startswith(expected_prefix)


@pytest.mark.asyncio
async def test_create_order_uses_product_price_without_member_price():
    level_id = uuid.uuid4()
    customer = Customer(
        id=uuid.uuid4(),
        name="客户",
        contact_name="联系人",
        contact_phone="13800000000",
        level_id=level_id,
    )
    level = CustomerLevel(id=level_id, name="普通会员", min_spent=Decimal("0"))
    product = Product(
        id=uuid.uuid4(),
        short_name="测试商品",
        barcode="6900000000001",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("100.00"),
        cost_price=Decimal("50.00"),
    )
    inventory = Inventory(
        id=uuid.uuid4(),
        product_id=product.id,
        warehouse_id=uuid.uuid4(),
        quantity=10,
        locked=0,
    )
    db = CreateOrderDb(customer, inventory, product, level)

    order = await order_service.create_order(
        db,
        OrderCreate(
            customer_id=str(customer.id),
            items=[OrderItemCreate(product_id=str(product.id), quantity=1)],
        ),
        operator="admin",
    )

    assert order.total_amount == Decimal("100.00")


@pytest.mark.asyncio
async def test_create_order_uses_exact_member_price():
    level_id = uuid.uuid4()
    customer = Customer(
        id=uuid.uuid4(),
        name="客户",
        contact_name="联系人",
        contact_phone="13800000000",
        level_id=level_id,
    )
    level = CustomerLevel(id=level_id, name="会员", min_spent=Decimal("0"))
    product = Product(
        id=uuid.uuid4(),
        short_name="测试商品",
        barcode="6900000000001",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("100.00"),
        cost_price=Decimal("50.00"),
    )
    inventory = Inventory(
        id=uuid.uuid4(),
        product_id=product.id,
        warehouse_id=uuid.uuid4(),
        quantity=10,
        locked=0,
    )
    member_price = MemberPrice(
        id=uuid.uuid4(),
        product_id=product.id,
        level_id=level_id,
        price=Decimal("76.50"),
    )
    db = CreateOrderDb(customer, inventory, product, level, member_price)

    order = await order_service.create_order(
        db,
        OrderCreate(
            customer_id=str(customer.id),
            items=[OrderItemCreate(product_id=str(product.id), quantity=1)],
        ),
        operator="admin",
    )

    assert order.total_amount == Decimal("76.50")


def test_customer_level_schema_does_not_expose_discount():
    assert "discount" not in CustomerLevelCreate.model_fields


def test_order_create_rejects_duplicate_products():
    product_id = str(uuid.uuid4())

    with pytest.raises(ValidationError, match="同一商品"):
        OrderCreate(
            customer_id=str(uuid.uuid4()),
            items=[
                OrderItemCreate(product_id=product_id, quantity=1),
                OrderItemCreate(product_id=product_id, quantity=2),
            ],
        )


def test_order_contract_does_not_expose_warehouse():
    assert "warehouse_id" not in OrderCreate.model_fields
    assert "warehouse_id" not in OrderOut.model_fields


def test_order_contract_exposes_shipper_for_audit():
    assert {status.value for status in OrderStatus} == {
        "placed",
        "shipping",
        "stocked_out",
        "delivered_unpaid",
        "completed",
        "cancelled",
    }
    expected_fields = {
        "shipping_started_at",
        "shipping_started_by",
        "stock_out_at",
        "stock_out_by",
        "delivered_at",
        "delivered_by",
        "paid_at",
        "paid_by",
        "cancelled_at",
        "cancelled_by",
    }
    assert expected_fields.issubset(Order.__table__.columns.keys())
    assert expected_fields.issubset(OrderOut.model_fields)
    assert "shipped_at" not in Order.__table__.columns
    assert "shipped_by" not in Order.__table__.columns


def test_order_delivery_contract_uses_lightweight_statuses():
    from app.models.order_delivery import (
        OrderDelivery,
        OrderDeliveryEvent,
        OrderDeliveryEventType,
        OrderDeliveryExceptionType,
        OrderDeliveryStatus,
    )

    assert {item.value for item in OrderDeliveryStatus} == {"delivering", "signed"}
    assert {item.value for item in OrderDeliveryEventType} == {
        "assigned",
        "reassigned",
        "exception",
        "signed",
    }
    assert {item.value for item in OrderDeliveryExceptionType} == {
        "customer_absent",
        "customer_refused",
        "invalid_contact",
        "other",
    }
    assert {
        "order_id",
        "delivery_employee_id",
        "delivery_employee_name",
        "status",
        "recipient_name",
        "recipient_phone",
        "delivery_address",
        "assigned_at",
        "assigned_by_id",
        "assigned_by_name",
        "signer_name",
        "proof_image_urls",
        "sign_remark",
        "signed_at",
        "signed_by_id",
        "signed_by_name",
    }.issubset(OrderDelivery.__table__.columns.keys())
    assert {
        "delivery_id",
        "event_type",
        "from_employee_id",
        "from_employee_name",
        "to_employee_id",
        "to_employee_name",
        "exception_type",
        "remark",
        "operator_id",
        "operator_name",
        "created_at",
    }.issubset(OrderDeliveryEvent.__table__.columns.keys())
    assert {constraint.name for constraint in OrderDelivery.__table__.constraints} >= {
        "uq_order_deliveries_order_id",
        "ck_order_deliveries_signed_fields",
        "ck_order_deliveries_delivering_fields",
        "ck_order_deliveries_proof_image_urls_array",
    }
    check_expressions = {
        constraint.name: _normalize_sql_fragment(str(constraint.sqltext))
        for constraint in OrderDelivery.__table__.constraints
        if constraint.name and constraint.name.startswith("ck_order_deliveries_")
    }
    assert check_expressions == {
        "ck_order_deliveries_signed_fields": (
            "status <> 'signed' or (signer_name is not null and signed_at is not null "
            "and signed_by_id is not null and signed_by_name is not null)"
        ),
        "ck_order_deliveries_delivering_fields": (
            "status <> 'delivering' or (signer_name is null and proof_image_urls is null "
            "and sign_remark is null and signed_at is null and signed_by_id is null "
            "and signed_by_name is null)"
        ),
        "ck_order_deliveries_proof_image_urls_array": (
            "proof_image_urls is null or json_typeof(proof_image_urls) = 'array'"
        ),
    }
    status_column = OrderDelivery.__table__.c.status
    assert status_column.default is not None
    assert status_column.default.arg == OrderDeliveryStatus.delivering
    status_default = status_column.server_default
    assert status_default is not None
    assert str(status_default.arg).strip("'") == "delivering"
    assert {
        index.name: tuple(index.columns.keys())
        for index in OrderDelivery.__table__.indexes
    } == {
        "ix_order_deliveries_delivery_employee_status": (
            "delivery_employee_id",
            "status",
        ),
        "ix_order_deliveries_status_signed_at": ("status", "signed_at"),
    }
    assert {
        index.name: tuple(index.columns.keys())
        for index in OrderDeliveryEvent.__table__.indexes
    } == {
        "ix_order_delivery_events_delivery_created_at": (
            "delivery_id",
            "created_at",
        ),
        "ix_order_delivery_events_event_type_delivery_created_at": (
            "event_type",
            "delivery_id",
            "created_at",
        ),
    }
    assert Order.delivery.property.uselist is False
    assert Order.delivery.property.back_populates == "order"
    assert OrderDelivery.order.property.back_populates == "delivery"


def test_delivery_schema_validates_requests_and_defaults():
    from app.models.order_delivery import OrderDeliveryExceptionType
    from app.schemas.order import OrderStockOutRequest
    from app.schemas.order_delivery import (
        OrderDeliveryExceptionRequest,
        OrderDeliveryReassignRequest,
        OrderDeliverySignRequest,
    )

    employee_uuid = uuid.uuid4()
    employee_id = str(employee_uuid)
    stock_out = OrderStockOutRequest(
        delivery_employee_id=employee_id,
        recipient_name="  李四  ",
        recipient_phone=" 13800000000 ",
        delivery_address="  客户本次收货地址  ",
    )
    assert stock_out.delivery_employee_id == employee_uuid
    assert stock_out.recipient_name == "李四"
    assert stock_out.recipient_phone == "13800000000"
    assert stock_out.delivery_address == "客户本次收货地址"

    for field_name in ("delivery_employee_id", "recipient_name", "recipient_phone", "delivery_address"):
        payload = {
            "delivery_employee_id": employee_id,
            "recipient_name": "李四",
            "recipient_phone": "13800000000",
            "delivery_address": "客户本次收货地址",
        }
        payload[field_name] = "   "
        with pytest.raises(ValidationError):
            OrderStockOutRequest(**payload)

    sign_request = OrderDeliverySignRequest(signer_name="  王五  ")
    assert sign_request.signer_name == "王五"
    assert sign_request.proof_image_urls == []
    with pytest.raises(ValidationError):
        OrderDeliverySignRequest(signer_name="   ")

    assert (
        OrderDeliveryReassignRequest(
            delivery_employee_id=employee_id,
            reason=" " * 600,
        ).reason
        is None
    )
    reassign_request = OrderDeliveryReassignRequest(
        delivery_employee_id=employee_id,
        reason="  临时调整  ",
    )
    assert reassign_request.delivery_employee_id == employee_uuid
    assert reassign_request.reason == "临时调整"

    with pytest.raises(ValidationError, match="说明"):
        OrderDeliveryExceptionRequest(
            exception_type=OrderDeliveryExceptionType.other,
            remark="   ",
        )
    exception_request = OrderDeliveryExceptionRequest(
        exception_type=OrderDeliveryExceptionType.customer_absent,
        remark="  客户暂时不在  ",
    )
    assert exception_request.remark == "客户暂时不在"

    with pytest.raises(ValidationError):
        OrderDeliveryReassignRequest(
            delivery_employee_id=employee_id,
            reason="x" * 501,
        )


def test_delivery_schema_rejects_non_string_trim_inputs_with_validation_errors():
    from app.models.order_delivery import OrderDeliveryExceptionType
    from app.schemas.order import OrderStockOutRequest
    from app.schemas.order_delivery import (
        OrderDeliveryExceptionRequest,
        OrderDeliveryReassignRequest,
        OrderDeliverySignRequest,
    )

    employee_id = str(uuid.uuid4())
    stock_out_payload = {
        "delivery_employee_id": employee_id,
        "recipient_name": "李四",
        "recipient_phone": "13800000000",
        "delivery_address": "客户本次收货地址",
    }

    with pytest.raises(ValidationError):
        OrderStockOutRequest(**{**stock_out_payload, "delivery_employee_id": 123})
    with pytest.raises(ValidationError):
        OrderDeliveryReassignRequest(delivery_employee_id=123)
    with pytest.raises(ValidationError):
        OrderDeliverySignRequest(signer_name=123)
    with pytest.raises(ValidationError):
        OrderDeliveryExceptionRequest(
            exception_type=OrderDeliveryExceptionType.customer_absent,
            remark=123,
        )
    with pytest.raises(ValidationError):
        OrderDeliveryReassignRequest(
            delivery_employee_id=employee_id,
            reason=123,
        )


def test_delivery_schema_exposes_output_contracts():
    from app.schemas.order import OrderOut
    from app.schemas.order_delivery import (
        OrderDeliveryArchiveOut,
        OrderDeliveryCurrentGroupOut,
        OrderDeliveryDetailOut,
        OrderDeliveryEmployeeOptionOut,
        OrderDeliveryEventOut,
        OrderDeliverySummaryOut,
    )

    assert {"id", "name"}.issubset(OrderDeliveryEmployeeOptionOut.model_fields)
    assert {"event_type", "operator_id", "operator_name", "created_at"}.issubset(
        OrderDeliveryEventOut.model_fields
    )
    assert {
        "id",
        "status",
        "delivery_employee_id",
        "delivery_employee_name",
        "recipient_name",
        "recipient_phone",
        "delivery_address",
    }.issubset(OrderDeliverySummaryOut.model_fields)
    assert {"events", "proof_image_urls", "order_no", "customer_name"}.issubset(
        OrderDeliveryDetailOut.model_fields
    )
    assert {
        "delivery_employee_id",
        "delivery_employee_name",
        "order_count",
        "customer_count",
        "product_quantity",
        "total_amount",
        "exception_order_count",
        "deliveries",
    }.issubset(OrderDeliveryCurrentGroupOut.model_fields)
    assert {"order_no", "customer_name", "signer_name", "signed_at"}.issubset(
        OrderDeliveryArchiveOut.model_fields
    )
    assert "delivery" in OrderOut.model_fields


def test_delivery_schema_normalizes_nullable_proof_images():
    from app.models.order_delivery import OrderDelivery, OrderDeliveryStatus
    from app.schemas.order_delivery import (
        OrderDeliveryArchiveOut,
        OrderDeliveryDetailOut,
    )

    now = datetime.now(timezone.utc)
    delivery = OrderDelivery(
        id=uuid.uuid4(),
        order_id=uuid.uuid4(),
        delivery_employee_id=uuid.uuid4(),
        delivery_employee_name="配送员",
        status=OrderDeliveryStatus.signed,
        recipient_name="李四",
        recipient_phone="13800000000",
        delivery_address="客户本次收货地址",
        assigned_at=now,
        assigned_by_id=uuid.uuid4(),
        assigned_by_name="管理员",
        signer_name="王五",
        proof_image_urls=None,
        signed_at=now,
        created_at=now,
        updated_at=now,
    )
    delivery.order_no = "ORD-DELIVERY-001"
    delivery.customer_id = uuid.uuid4()
    delivery.customer_name = "测试客户"
    delivery.total_amount = Decimal("100.00")
    delivery.product_quantity = 2
    delivery.order_status = OrderStatus.delivered_unpaid
    delivery.events = []

    for output_schema in (OrderDeliveryDetailOut, OrderDeliveryArchiveOut):
        output = output_schema.model_validate(delivery)
        assert output.id == str(delivery.id)
        assert output.delivery_employee_id == str(delivery.delivery_employee_id)
        assert output.status == OrderDeliveryStatus.signed
        assert output.proof_image_urls == []


def test_order_inventory_allocation_model_tracks_warehouse_quantity():
    allocation_model = getattr(order_models, "OrderInventoryAllocation", None)

    assert allocation_model is not None
    assert allocation_model.__tablename__ == "order_inventory_allocations"
    assert {
        "order_id",
        "order_item_id",
        "product_id",
        "warehouse_id",
        "quantity",
        "status",
    }.issubset(allocation_model.__table__.columns.keys())


def test_order_ship_request_rejects_duplicate_item_warehouse_allocations():
    request_model = getattr(order_schemas, "OrderShipRequest", None)
    allocation_model = getattr(order_schemas, "OrderShipmentAllocation", None)

    assert request_model is not None
    assert allocation_model is not None
    order_item_id = str(uuid.uuid4())
    warehouse_id = str(uuid.uuid4())
    with pytest.raises(ValidationError, match="重复"):
        request_model(
            allocations=[
                allocation_model(
                    order_item_id=order_item_id,
                    warehouse_id=warehouse_id,
                    quantity=1,
                ),
                allocation_model(
                    order_item_id=order_item_id,
                    warehouse_id=warehouse_id,
                    quantity=2,
                ),
            ]
        )


def test_cancel_requires_non_blank_reason():
    with pytest.raises(ValidationError):
        OrderActionRequest(cancel_reason="   ")


def test_delivery_route_order_fulfillment_matches_state_machine():
    order_put_paths = {
        route.path
        for route in app.routes
        if route.path.startswith("/api/v1/orders/")
        and "PUT" in getattr(route, "methods", set())
    }

    assert order_put_paths == {
        "/api/v1/orders/{order_id}/start-shipping",
        "/api/v1/orders/{order_id}/shipping-allocations",
        "/api/v1/orders/{order_id}/stock-out",
        "/api/v1/orders/{order_id}/complete",
        "/api/v1/orders/{order_id}/cancel",
    }


def test_delivery_route_contract_and_authorization_dependencies():
    delivery_routes = [
        route
        for route in app.routes
        if getattr(route, "path", "").startswith("/api/v1/deliveries")
    ]
    route_contract = {
        (route.path, method)
        for route in delivery_routes
        for method in route.methods
    }

    assert route_contract == {
        ("/api/v1/deliveries/employee-options", "GET"),
        ("/api/v1/deliveries/current", "GET"),
        ("/api/v1/deliveries/archive", "GET"),
        ("/api/v1/deliveries/{delivery_id}", "GET"),
        ("/api/v1/deliveries/{delivery_id}/reassign", "PUT"),
        ("/api/v1/deliveries/{delivery_id}/returnable-items", "GET"),
        ("/api/v1/deliveries/{delivery_id}/exceptions", "POST"),
        ("/api/v1/deliveries/{delivery_id}/sign", "PUT"),
    }

    route_by_contract = {
        (route.path, next(iter(route.methods))): route for route in delivery_routes
    }
    for path, method in route_contract:
        dependency_names = {
            dependency.call.__name__
            for dependency in route_by_contract[(path, method)].dependant.dependencies
            if dependency.call is not None
        }
        expected_dependency = (
            "require_admin"
            if path.endswith("/reassign")
            else "require_delivery"
            if path.endswith("/returnable-items") or path.endswith("/exceptions") or path.endswith("/sign")
            else "get_current_user"
        )
        assert expected_dependency in dependency_names

    delivery_paths = [route.path for route in delivery_routes]
    detail_index = delivery_paths.index("/api/v1/deliveries/{delivery_id}")
    assert delivery_paths.index("/api/v1/deliveries/employee-options") < detail_index
    assert delivery_paths.index("/api/v1/deliveries/current") < detail_index
    assert delivery_paths.index("/api/v1/deliveries/archive") < detail_index


def test_delivery_api_current_user_parameters_are_required():
    from app.api.v1 import order_delivery as delivery_api

    for handler in (
        delivery_api.employee_options,
        delivery_api.current_deliveries,
        delivery_api.delivery_archive,
        delivery_api.delivery_detail,
        delivery_api.create_delivery_exception,
        delivery_api.sign_delivery,
    ):
        assert (
            inspect.signature(handler).parameters["current_user"].default
            is inspect.Parameter.empty
        )


@pytest.mark.asyncio
async def test_complete_route_forwards_payment_request(monkeypatch):
    from app.api.v1 import order as order_api

    request = OrderCompleteRequest(
        paid_amount="200.00",
        payment_proof_image_urls=["https://example.com/payment.jpg"],
    )
    order = Order(id=uuid.uuid4())
    expected_order = object()
    received = {}

    async def transition(
        db,
        order_id,
        target_status,
        operator,
        *,
        complete_request,
    ):
        received["transition"] = (
            db,
            order_id,
            target_status,
            operator,
            complete_request,
        )
        return order

    async def get_refreshed_order(db, order_id):
        received["get"] = (db, order_id)
        return expected_order

    monkeypatch.setattr(order_api, "transition_order", transition)
    monkeypatch.setattr(order_api, "get_order", get_refreshed_order)
    db = object()
    user = type("User", (), {"username": "cashier"})()

    response = await order_api.complete(str(order.id), request, user, db)

    assert response.data is expected_order
    assert received["transition"] == (
        db,
        str(order.id),
        OrderStatus.completed,
        "cashier",
        request,
    )
    assert received["get"] == (db, str(order.id))


@pytest.mark.asyncio
async def test_stock_out_route_forwards_request_and_employee(monkeypatch):
    from app.api.v1 import order as order_api

    employee = Employee(
        id=uuid.uuid4(),
        username="stock-user",
        name="出库员",
        password_hash="hash",
        role_assignments=[EmployeeRoleAssignment(role=EmployeeRole.delivery)],
        status=EmployeeStatus.active,
    )
    request = OrderStockOutRequest(
        delivery_employee_id=str(uuid.uuid4()),
        recipient_name="收货人",
        recipient_phone="13800000000",
        delivery_address="测试地址",
    )
    order = Order(id=uuid.uuid4())
    expected_order = object()
    received = {}

    async def transition(
        db,
        order_id,
        target_status,
        operator,
        *,
        stock_out_request,
    ):
        received["transition"] = (
            db,
            order_id,
            target_status,
            operator,
            stock_out_request,
        )
        return order

    async def get_refreshed_order(db, order_id):
        received["get"] = (db, order_id)
        return expected_order

    monkeypatch.setattr(order_api, "transition_order", transition)
    monkeypatch.setattr(order_api, "get_order", get_refreshed_order)
    db = object()

    response = await order_api.stock_out(str(order.id), request, employee, db)

    assert response.data is expected_order
    assert received["transition"] == (
        db,
        str(order.id),
        OrderStatus.stocked_out,
        employee,
        request,
    )
    assert received["get"] == (db, str(order.id))


@pytest.mark.asyncio
async def test_delivery_api_delegates_queries_and_mutations(monkeypatch):
    from app.api.v1 import order_delivery as delivery_api
    from app.models.order_delivery import OrderDeliveryExceptionType
    from app.schemas.order_delivery import (
        OrderDeliveryExceptionRequest,
        OrderDeliveryReassignRequest,
        OrderDeliverySignRequest,
    )

    employee = Employee(
        id=uuid.uuid4(),
        username="delivery-user",
        name="配送员",
        password_hash="hash",
        role_assignments=[EmployeeRoleAssignment(role=EmployeeRole.delivery)],
        status=EmployeeStatus.active,
    )
    admin = Employee(
        id=uuid.uuid4(),
        username="admin",
        name="管理员",
        password_hash="hash",
        role_assignments=[EmployeeRoleAssignment(role=EmployeeRole.admin)],
        status=EmployeeStatus.active,
    )
    delivery_id = uuid.uuid4()
    reassign_request = OrderDeliveryReassignRequest(
        delivery_employee_id=str(uuid.uuid4()), reason="临时调整"
    )
    exception_request = OrderDeliveryExceptionRequest(
        exception_type=OrderDeliveryExceptionType.customer_absent,
        remark="客户不在",
    )
    sign_request = OrderDeliverySignRequest(
        signer_name="王老板", proof_image_urls=["proof.png"], remark="完好"
    )
    expected = {
        "options": [object()],
        "current": [object()],
        "archive": object(),
        "detail": object(),
    }
    received = {}

    async def employee_options(db):
        received["options"] = (db,)
        return expected["options"]

    async def current(db, current_user, **filters):
        received["current"] = (db, current_user, filters)
        return expected["current"]

    async def archive(db, current_user, **filters):
        received["archive"] = (db, current_user, filters)
        return expected["archive"]

    async def detail(db, received_delivery_id, current_user):
        received.setdefault("detail", []).append(
            (db, received_delivery_id, current_user)
        )
        return expected["detail"]

    async def reassign(db, received_delivery_id, request, current_user):
        received["reassign"] = (db, received_delivery_id, request, current_user)

    async def exception(db, received_delivery_id, request, current_user):
        received["exception"] = (db, received_delivery_id, request, current_user)

    async def sign(db, received_delivery_id, request, current_user):
        received["sign"] = (db, received_delivery_id, request, current_user)

    monkeypatch.setattr(delivery_api.order_delivery_service, "list_active_employee_options", employee_options)
    monkeypatch.setattr(delivery_api.order_delivery_service, "list_current_deliveries", current)
    monkeypatch.setattr(delivery_api.order_delivery_service, "list_delivery_archive", archive)
    monkeypatch.setattr(delivery_api.order_delivery_service, "get_delivery_detail", detail)
    monkeypatch.setattr(delivery_api.order_delivery_service, "reassign_delivery", reassign)
    monkeypatch.setattr(delivery_api.order_delivery_service, "record_delivery_exception", exception)
    monkeypatch.setattr(delivery_api.order_delivery_service, "sign_delivery", sign)
    db = object()

    options_response = await delivery_api.employee_options(employee, db)
    current_response = await delivery_api.current_deliveries(
        current_user=employee,
        order_keyword="ORD",
        customer_keyword="客户",
        employee_id=employee.id,
        has_exception=True,
        db=db,
    )
    archive_response = await delivery_api.delivery_archive(
        current_user=employee,
        page=2,
        page_size=30,
        employee_id=employee.id,
        order_keyword="ORD",
        customer_keyword="客户",
        signer_keyword="签收人",
        signed_from=date(2026, 7, 1),
        signed_to=date(2026, 7, 19),
        db=db,
    )
    detail_response = await delivery_api.delivery_detail(delivery_id, employee, db)
    reassign_response = await delivery_api.reassign_delivery(
        delivery_id, reassign_request, admin, db
    )
    exception_response = await delivery_api.create_delivery_exception(
        delivery_id, exception_request, employee, db
    )
    sign_response = await delivery_api.sign_delivery(
        delivery_id, sign_request, employee, db
    )

    assert options_response.data is expected["options"]
    assert current_response.data is expected["current"]
    assert archive_response.data is expected["archive"]
    assert detail_response.data is expected["detail"]
    assert reassign_response.data is expected["detail"]
    assert exception_response.data is expected["detail"]
    assert sign_response.data is expected["detail"]
    assert received["options"] == (db,)
    assert received["current"] == (
        db,
        employee,
        {
            "order_keyword": "ORD",
            "customer_keyword": "客户",
            "employee_id": employee.id,
            "has_exception": True,
        },
    )
    assert received["archive"] == (
        db,
        employee,
        {
            "page": 2,
            "page_size": 30,
            "employee_id": employee.id,
            "order_keyword": "ORD",
            "customer_keyword": "客户",
            "signer_keyword": "签收人",
            "signed_from": date(2026, 7, 1),
            "signed_to": date(2026, 7, 19),
        },
    )
    assert received["reassign"] == (db, delivery_id, reassign_request, admin)
    assert received["exception"] == (db, delivery_id, exception_request, employee)
    assert received["sign"] == (db, delivery_id, sign_request, employee)
    assert received["detail"] == [
        (db, delivery_id, employee),
        (db, delivery_id, admin),
        (db, delivery_id, employee),
        (db, delivery_id, employee),
    ]


@pytest.mark.asyncio
async def test_delivery_api_employee_options_service_queries_active_employees():
    from app.services import order_delivery_service

    first_id = uuid.uuid4()
    second_id = uuid.uuid4()
    db = QueueDb(
        [FakeResult(values=[(first_id, "甲配送员"), (second_id, "乙配送员")])]
    )

    options = await order_delivery_service.list_active_employee_options(db)

    assert [option.model_dump() for option in options] == [
        {"id": str(first_id), "name": "甲配送员"},
        {"id": str(second_id), "name": "乙配送员"},
    ]
    assert EmployeeStatus.active in db.statement_params[0].values()
    assert "ORDER BY employees.name, employees.id" in db.statements[0]
    selected_columns = db.statements[0].split("FROM", 1)[0]
    assert "employees.id" in selected_columns
    assert "employees.name" in selected_columns
    assert "employees.username" not in selected_columns
    assert "employees.password_hash" not in selected_columns


def _delivery_api_test_client(current_user):
    from app.core.database import get_db
    from app.core.deps import get_current_user

    async def override_current_user():
        return current_user

    async def override_db():
        return object()

    app.dependency_overrides[get_current_user] = override_current_user
    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def _delivery_current_response_payload(employee, now):
    delivery_id = uuid.uuid4()
    order_id = uuid.uuid4()
    customer_id = uuid.uuid4()
    delivery = {
        "id": delivery_id,
        "status": "delivering",
        "delivery_employee_id": employee.id,
        "delivery_employee_name": employee.name,
        "recipient_name": "客户联系人",
        "recipient_phone": "13800000000",
        "delivery_address": "客户地址",
        "assigned_at": now,
        "signer_name": None,
        "signed_at": None,
        "order_id": order_id,
        "order_no": "ORD-ASGI-001",
        "customer_id": customer_id,
        "customer_name": "客户甲",
        "total_amount": Decimal("100.00"),
        "product_quantity": 2,
        "has_exception": False,
    }
    group = {
        "delivery_employee_id": employee.id,
        "delivery_employee_name": employee.name,
        "order_count": 1,
        "customer_count": 1,
        "product_quantity": 2,
        "total_amount": Decimal("100.00"),
        "exception_order_count": 0,
        "deliveries": [delivery],
    }
    return group, delivery


def _delivery_detail_response_payload(employee, now):
    _, current = _delivery_current_response_payload(employee, now)
    return {
        **current,
        "order_status": "stocked_out",
        "assigned_by_id": employee.id,
        "assigned_by_name": employee.name,
        "proof_image_urls": [],
        "sign_remark": None,
        "signed_by_id": None,
        "signed_by_name": None,
        "created_at": now,
        "updated_at": now,
        "events": [],
        "items": [],
    }


def test_delivery_asgi_static_routes_and_response_serialization(monkeypatch):
    from app.api.v1 import order_delivery as delivery_api

    employee = _delivery_employee(name="配送员")
    now = datetime(2026, 7, 19, 10, 30)
    current_group, _ = _delivery_current_response_payload(employee, now)
    detail = _delivery_detail_response_payload(employee, now)
    received = {}

    async def options(db):
        return [{"id": employee.id, "name": employee.name}]

    async def current(db, current_user, **filters):
        received["current"] = (current_user, filters)
        return [current_group]

    async def archive(db, current_user, **filters):
        received["archive"] = (current_user, filters)
        return {"items": [], "total": 0, "page": 1, "page_size": 20}

    async def get_detail(db, delivery_id, current_user):
        received["detail"] = (delivery_id, current_user)
        return detail

    monkeypatch.setattr(delivery_api.order_delivery_service, "list_active_employee_options", options)
    monkeypatch.setattr(delivery_api.order_delivery_service, "list_current_deliveries", current)
    monkeypatch.setattr(delivery_api.order_delivery_service, "list_delivery_archive", archive)
    monkeypatch.setattr(delivery_api.order_delivery_service, "get_delivery_detail", get_detail)
    client = _delivery_api_test_client(employee)

    try:
        options_response = client.get("/api/v1/deliveries/employee-options")
        current_response = client.get("/api/v1/deliveries/current")
        archive_response = client.get(
            "/api/v1/deliveries/archive",
            params={"signed_from": "2026-07-19", "signed_to": "2026-07-19"},
        )
        detail_response = client.get(
            f"/api/v1/deliveries/{detail['id']}"
        )
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert options_response.status_code == 200
    assert options_response.json()["data"] == [
        {"id": str(employee.id), "name": employee.name}
    ]
    assert current_response.status_code == 200
    assert current_response.json()["data"][0]["delivery_employee_id"] == str(
        employee.id
    )
    assert current_response.json()["data"][0]["deliveries"][0]["assigned_at"] == (
        "2026-07-19 18:30:00"
    )
    assert archive_response.status_code == 200
    assert received["archive"][1]["signed_from"] == date(2026, 7, 19)
    assert received["archive"][1]["signed_to"] == date(2026, 7, 19)
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["id"] == str(detail["id"])
    assert isinstance(received["detail"][0], uuid.UUID)
    assert received["current"][0] is employee


@pytest.mark.parametrize(
    ("method", "path", "body", "as_admin"),
    [
        ("get", "/api/v1/deliveries/not-a-uuid", None, False),
        ("get", "/api/v1/deliveries/current?employee_id=not-a-uuid", None, False),
        ("get", "/api/v1/deliveries/archive?employee_id=not-a-uuid", None, False),
        (
            "put",
            "/api/v1/orders/not-a-uuid/stock-out",
            {
                "delivery_employee_id": str(uuid.uuid4()),
                "recipient_name": "收货人",
                "recipient_phone": "13800000000",
                "delivery_address": "客户地址",
            },
            False,
        ),
        (
            "put",
            f"/api/v1/orders/{uuid.uuid4()}/stock-out",
            {
                "delivery_employee_id": "not-a-uuid",
                "recipient_name": "收货人",
                "recipient_phone": "13800000000",
                "delivery_address": "客户地址",
            },
            False,
        ),
        (
            "put",
            f"/api/v1/deliveries/{uuid.uuid4()}/reassign",
            {"delivery_employee_id": "not-a-uuid"},
            True,
        ),
    ],
)
def test_delivery_asgi_rejects_malformed_uuid_boundaries(
    monkeypatch, method, path, body, as_admin
):
    from app.api.v1 import order as order_api
    from app.api.v1 import order_delivery as delivery_api

    user = _delivery_employee(
        role=EmployeeRole.admin if as_admin else EmployeeRole.delivery
    )

    async def unexpected(*args, **kwargs):
        raise AssertionError("service must not receive malformed UUID")

    monkeypatch.setattr(order_api, "transition_order", unexpected)
    monkeypatch.setattr(delivery_api.order_delivery_service, "get_delivery_detail", unexpected)
    monkeypatch.setattr(delivery_api.order_delivery_service, "list_current_deliveries", unexpected)
    monkeypatch.setattr(delivery_api.order_delivery_service, "list_delivery_archive", unexpected)
    monkeypatch.setattr(delivery_api.order_delivery_service, "reassign_delivery", unexpected)
    client = _delivery_api_test_client(user)

    try:
        if body is None:
            response = getattr(client, method)(path)
        else:
            response = getattr(client, method)(path, json=body)
    finally:
        client.close()
        app.dependency_overrides.clear()

    expected_status = 403 if path.startswith("/api/v1/orders/") else 422
    assert response.status_code == expected_status
    assert response.json()["code"] == expected_status
    expected_message = "warehouse_manager access required" if expected_status == 403 else "请求参数校验失败"
    assert response.json()["message"] == expected_message
    if expected_status == 422:
        assert response.json()["data"]
    else:
        assert response.json()["data"] is None


def test_delivery_asgi_reassign_requires_admin(monkeypatch):
    from app.api.v1 import order_delivery as delivery_api

    normal_user = _delivery_employee(role=EmployeeRole.delivery)

    async def unexpected(*args, **kwargs):
        raise AssertionError("normal user must not reach reassignment service")

    monkeypatch.setattr(delivery_api.order_delivery_service, "reassign_delivery", unexpected)
    client = _delivery_api_test_client(normal_user)

    try:
        response = client.put(
            f"/api/v1/deliveries/{uuid.uuid4()}/reassign",
            json={"delivery_employee_id": str(uuid.uuid4())},
        )
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert response.status_code == 403
    assert response.json() == {
        "code": 403,
        "message": "Admin access required",
        "data": None,
    }


@pytest.mark.parametrize(
    ("method", "suffix", "body", "service_name", "role"),
    [
        (
            "PUT",
            "sign",
            {
                "signer_name": "王老板",
                "proof_image_urls": ["proof.png"],
                "remark": "货物完好",
            },
            "sign_delivery",
            EmployeeRole.delivery,
        ),
        (
            "POST",
            "exceptions",
            {"exception_type": "customer_absent", "remark": "客户不在"},
            "record_delivery_exception",
            EmployeeRole.delivery,
        ),
        (
            "PUT",
            "reassign",
            {
                "delivery_employee_id": str(uuid.uuid4()),
                "reason": "临时调整",
            },
            "reassign_delivery",
            EmployeeRole.admin,
        ),
    ],
)
def test_delivery_asgi_mutations_parse_body_and_serialize_response(
    monkeypatch, method, suffix, body, service_name, role
):
    from app.api.v1 import order_delivery as delivery_api

    user = _delivery_employee(role=role, name="操作员")
    now = datetime(2026, 7, 19, 10, 30)
    detail = _delivery_detail_response_payload(user, now)
    delivery_id = detail["id"]
    received = {}

    async def mutate(db, received_delivery_id, request, current_user):
        received["mutation"] = (
            received_delivery_id,
            request,
            current_user,
        )

    async def get_detail(db, received_delivery_id, current_user):
        received["detail"] = (received_delivery_id, current_user)
        return detail

    monkeypatch.setattr(
        delivery_api.order_delivery_service, service_name, mutate
    )
    monkeypatch.setattr(
        delivery_api.order_delivery_service, "get_delivery_detail", get_detail
    )
    client = _delivery_api_test_client(user)

    try:
        response = client.request(
            method,
            f"/api/v1/deliveries/{delivery_id}/{suffix}",
            json=body,
        )
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["data"]["id"] == str(delivery_id)
    assert response.json()["data"]["assigned_at"] == "2026-07-19 18:30:00"
    assert received["mutation"][0] == delivery_id
    assert received["mutation"][2] is user
    assert received["detail"] == (delivery_id, user)
    if suffix == "sign":
        assert received["mutation"][1].signer_name == "王老板"
    elif suffix == "exceptions":
        assert received["mutation"][1].exception_type.value == "customer_absent"
    else:
        assert isinstance(received["mutation"][1].delivery_employee_id, uuid.UUID)


def test_delivery_asgi_archive_rejects_inverted_date_range():
    admin = _delivery_employee(role=EmployeeRole.admin, name="管理员")
    client = _delivery_api_test_client(admin)

    try:
        response = client.get(
            "/api/v1/deliveries/archive",
            params={"signed_from": "2026-07-20", "signed_to": "2026-07-19"},
        )
    finally:
        client.close()
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json() == {
        "code": 400,
        "message": "签收开始日期不能晚于结束日期",
        "data": None,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("handler_name", "service_name", "error", "expected_status"),
    [
        ("delivery_detail", "get_delivery_detail", ValueError("配送记录不存在"), 404),
        ("delivery_detail", "get_delivery_detail", PermissionError("无权查看该配送记录"), 403),
        ("sign_delivery", "sign_delivery", ValueError("配送记录状态无效"), 400),
    ],
)
async def test_delivery_api_maps_service_errors(
    monkeypatch, handler_name, service_name, error, expected_status
):
    from app.api.v1 import order_delivery as delivery_api
    from app.schemas.order_delivery import OrderDeliverySignRequest

    employee = Employee(
        id=uuid.uuid4(),
        username="delivery-user",
        name="配送员",
        password_hash="hash",
        role_assignments=[EmployeeRoleAssignment(role=EmployeeRole.delivery)],
        status=EmployeeStatus.active,
    )

    async def fail(*args, **kwargs):
        raise error

    monkeypatch.setattr(delivery_api.order_delivery_service, service_name, fail)
    handler = getattr(delivery_api, handler_name)

    with pytest.raises(HTTPException) as caught:
        if handler_name == "sign_delivery":
            await handler(
                str(uuid.uuid4()),
                OrderDeliverySignRequest(signer_name="签收人"),
                employee,
                object(),
            )
        else:
            await handler(str(uuid.uuid4()), employee, object())

    assert caught.value.status_code == expected_status
    assert caught.value.detail == str(error)


@pytest.mark.asyncio
async def test_create_order_locks_inventory_rows():
    level_id = uuid.uuid4()
    customer = Customer(
        id=uuid.uuid4(),
        name="客户",
        contact_name="联系人",
        contact_phone="13800000000",
        level_id=level_id,
    )
    level = CustomerLevel(id=level_id, name="普通会员", min_spent=Decimal("0"))
    product = Product(
        id=uuid.uuid4(),
        short_name="测试商品",
        barcode="6900000000001",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("100.00"),
        cost_price=Decimal("50.00"),
    )
    inventory = Inventory(
        id=uuid.uuid4(),
        product_id=product.id,
        warehouse_id=uuid.uuid4(),
        quantity=10,
        locked=0,
    )
    db = CreateOrderDb(customer, inventory, product, level)

    await order_service.create_order(
        db,
        OrderCreate(
            customer_id=str(customer.id),
            items=[OrderItemCreate(product_id=str(product.id), quantity=1)],
        ),
        operator="admin",
    )

    inventory_sql = next(sql for sql in db.statements if "FROM inventory" in sql)
    assert "FOR UPDATE" in inventory_sql


@pytest.mark.asyncio
async def test_create_order_splits_and_locks_inventory_across_warehouses():
    level_id = uuid.uuid4()
    customer = Customer(
        id=uuid.uuid4(),
        name="客户",
        contact_name="联系人",
        contact_phone="13800000000",
        level_id=level_id,
    )
    level = CustomerLevel(id=level_id, name="普通会员", min_spent=Decimal("0"))
    product = Product(
        id=uuid.uuid4(),
        short_name="测试商品",
        barcode="6900000000001",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("100.00"),
        cost_price=Decimal("50.00"),
    )
    default_inventory = Inventory(
        id=uuid.uuid4(),
        product_id=product.id,
        warehouse_id=uuid.uuid4(),
        quantity=2,
        locked=0,
    )
    secondary_inventory = Inventory(
        id=uuid.uuid4(),
        product_id=product.id,
        warehouse_id=uuid.uuid4(),
        quantity=5,
        locked=0,
    )
    db = CreateOrderDb(
        customer,
        [default_inventory, secondary_inventory],
        product,
        level,
    )

    await order_service.create_order(
        db,
        OrderCreate(
            customer_id=str(customer.id),
            items=[OrderItemCreate(product_id=str(product.id), quantity=5)],
        ),
        operator="admin",
    )

    allocations = [
        item for item in db.added if isinstance(item, OrderInventoryAllocation)
    ]
    assert default_inventory.locked == 2
    assert secondary_inventory.locked == 3
    assert [
        (allocation.warehouse_id, allocation.quantity, allocation.status)
        for allocation in allocations
    ] == [
        (
            default_inventory.warehouse_id,
            2,
            OrderInventoryAllocationStatus.reserved,
        ),
        (
            secondary_inventory.warehouse_id,
            3,
            OrderInventoryAllocationStatus.reserved,
        ),
    ]


@pytest.mark.asyncio
async def test_create_order_does_not_lock_partial_inventory_when_total_is_insufficient():
    level_id = uuid.uuid4()
    customer = Customer(
        id=uuid.uuid4(),
        name="客户",
        contact_name="联系人",
        contact_phone="13800000000",
        level_id=level_id,
    )
    level = CustomerLevel(id=level_id, name="普通会员", min_spent=Decimal("0"))
    product = Product(
        id=uuid.uuid4(),
        short_name="测试商品",
        barcode="6900000000001",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("100.00"),
        cost_price=Decimal("50.00"),
    )
    inventories = [
        Inventory(
            id=uuid.uuid4(),
            product_id=product.id,
            warehouse_id=uuid.uuid4(),
            quantity=2,
            locked=0,
        ),
        Inventory(
            id=uuid.uuid4(),
            product_id=product.id,
            warehouse_id=uuid.uuid4(),
            quantity=1,
            locked=0,
        ),
    ]
    db = CreateOrderDb(customer, inventories, product, level)

    with pytest.raises(ValueError, match="可用库存不足"):
        await order_service.create_order(
            db,
            OrderCreate(
                customer_id=str(customer.id),
                items=[OrderItemCreate(product_id=str(product.id), quantity=4)],
            ),
            operator="admin",
        )

    assert [inventory.locked for inventory in inventories] == [0, 0]
    assert not any(isinstance(item, Order) for item in db.added)


@pytest.mark.asyncio
async def test_cancel_locks_order_and_persists_reason(monkeypatch):
    order = Order(
        id=uuid.uuid4(),
        order_no="ORD1",
        customer_id=uuid.uuid4(),
        total_amount=Decimal("20.00"),
        status=OrderStatus.placed,
    )
    db = QueueDb([FakeResult(one=order)])

    async def release_inventory(*_args, **_kwargs):
        return None

    monkeypatch.setattr(order_service, "_release_locked_inventory", release_inventory)

    await order_service.transition_order(
        db,
        str(order.id),
        OrderStatus.cancelled,
        "admin",
        cancel_reason="客户撤单",
    )

    assert "FOR UPDATE" in db.statements[0]
    assert order.cancel_reason == "客户撤单"
    assert order.cancelled_by == "admin"


def test_customer_model_contains_order_statistics():
    assert {"total_spent", "order_count"}.issubset(Customer.__table__.columns.keys())


@pytest.mark.asyncio
async def test_complete_order_updates_customer_statistics_without_adjusting_level():
    customer = Customer(
        id=uuid.uuid4(),
        name="客户",
        contact_name="联系人",
        contact_phone="13800000000",
        level_id=uuid.uuid4(),
    )
    customer.total_spent = Decimal("20.00")
    customer.order_count = 2
    created_at = datetime(2026, 7, 15, 9, 30)
    order = Order(
        id=uuid.uuid4(),
        order_no="ORD1",
        customer_id=customer.id,
        total_amount=Decimal("30.00"),
        status=OrderStatus.delivered_unpaid,
        created_at=created_at,
    )
    db = QueueDb([FakeResult(one=customer)])
    original_level_id = customer.level_id

    await order_service._complete_order(db, order)

    assert customer.total_spent == Decimal("50.00")
    assert customer.order_count == 3
    assert customer.last_order_at == created_at
    assert customer.level_id == original_level_id
    assert not any(isinstance(item, LevelChangeLog) for item in db.added)


def test_order_complete_request_requires_valid_actual_payment():
    request = OrderCompleteRequest(
        paid_amount="20000.00",
        payment_proof_image_urls=["https://example.com/payment.jpg"],
    )

    assert request.paid_amount == Decimal("20000.00")
    assert request.payment_proof_image_urls == ["https://example.com/payment.jpg"]

    with pytest.raises(ValidationError):
        OrderCompleteRequest(paid_amount="0", payment_proof_image_urls=["proof.jpg"])
    with pytest.raises(ValidationError):
        OrderCompleteRequest(paid_amount="10", payment_proof_image_urls=[])


@pytest.mark.asyncio
async def test_complete_order_uses_paid_amount_for_customer_statistics():
    customer = Customer(
        id=uuid.uuid4(),
        name="客户",
        contact_name="联系人",
        contact_phone="13800000000",
        level_id=uuid.uuid4(),
    )
    customer.total_spent = Decimal("100.00")
    customer.order_count = 1
    order = Order(
        id=uuid.uuid4(),
        order_no="ORD1",
        customer_id=customer.id,
        total_amount=Decimal("20010.00"),
        status=OrderStatus.delivered_unpaid,
        created_at=datetime(2026, 7, 20, 9, 0),
    )
    db = QueueDb([FakeResult(one=order), FakeResult(one=customer)])

    await order_service.transition_order(
        db,
        str(order.id),
        OrderStatus.completed,
        "cashier-user",
        complete_request=OrderCompleteRequest(
            paid_amount="20000.00",
            payment_proof_image_urls=["https://example.com/payment.jpg"],
        ),
    )

    assert order.status == OrderStatus.completed
    assert order.paid_amount == Decimal("20000.00")
    assert order.payment_proof_image_urls == ["https://example.com/payment.jpg"]
    assert customer.total_spent == Decimal("20100.00")
    assert customer.order_count == 2


def test_order_output_contains_page_contract():
    assert {"customer_name", "cancel_reason"}.issubset(OrderOut.model_fields)


def test_price_change_log_records_operator():
    assert "operator_name" in PriceChangeLog.__table__.columns
    assert "operator_name" in PriceChangeLogOut.model_fields


@pytest.mark.asyncio
async def test_create_warehouse_keeps_contact_fields_and_status():
    req = WarehouseCreate(
        name="备用仓",
        contact_person="张三",
        contact_phone="13800000000",
        status=WarehouseStatus.disabled,
    )

    warehouse = await inventory_service.create_warehouse(QueueDb(), req)

    assert warehouse.contact_person == "张三"
    assert warehouse.contact_phone == "13800000000"
    assert warehouse.status == WarehouseStatus.disabled


def test_employee_read_routes_require_admin():
    employee_routes = [
        route
        for route in app.routes
        if getattr(route, "path", "").startswith("/api/v1/employees")
        and "GET" in getattr(route, "methods", set())
    ]

    assert employee_routes
    for route in employee_routes:
        dependency_names = {
            dependency.call.__name__
            for dependency in route.dependant.dependencies
            if dependency.call is not None
        }
        assert "require_admin" in dependency_names


@pytest.mark.asyncio
async def test_enable_employee_restores_active_status():
    employee = Employee(
        id=uuid.uuid4(),
        username="disabled-user",
        password_hash="hash",
        name="已禁用员工",
        role_assignments=[EmployeeRoleAssignment(role=EmployeeRole.delivery)],
        status=EmployeeStatus.disabled,
    )
    db = QueueDb([FakeResult(one=employee)])

    result = await employee_service.enable_employee(db, str(employee.id))

    assert result.status == EmployeeStatus.active
    assert db.flushed is True


@pytest.mark.asyncio
async def test_http_errors_use_common_response_shape():
    handler = app.exception_handlers[HTTPException]
    request = Request(
        {"type": "http", "method": "GET", "path": "/test", "headers": []}
    )

    response = await handler(
        request, HTTPException(status_code=400, detail="请求参数错误")
    )

    assert json.loads(response.body) == {
        "code": 400,
        "message": "请求参数错误",
        "data": None,
    }


def test_dashboard_stats_contains_overview_totals():
    assert {
        "customer_total",
        "product_total",
        "order_total",
        "employee_total",
    }.issubset(DashboardStats.model_fields)


@pytest.mark.asyncio
async def test_upload_reads_at_most_max_size_plus_one(monkeypatch):
    class RecordingFile:
        filename = "product.png"
        content_type = "image/png"

        def __init__(self):
            self.read_size = None

        async def read(self, size=None):
            self.read_size = size
            return b"image"

    file = RecordingFile()
    monkeypatch.setattr(
        upload_api.storage_service,
        "upload_file",
        lambda *_args, **_kwargs: "key",
    )
    monkeypatch.setattr(
        upload_api.storage_service, "get_public_url", lambda _key: "http://example/key"
    )

    await upload_api.upload_file(file=file, prefix="products", current_user=object())

    assert file.read_size == upload_api.MAX_FILE_SIZE + 1


@pytest.mark.asyncio
async def test_inventory_get_or_create_is_atomic_and_locks_row():
    product_id = uuid.uuid4()
    warehouse_id = uuid.uuid4()
    inventory = Inventory(
        id=uuid.uuid4(),
        product_id=product_id,
        warehouse_id=warehouse_id,
        quantity=0,
        locked=0,
    )
    db = QueueDb([FakeResult(), FakeResult(one=inventory)])

    result = await inventory_service._get_or_create_inventory(
        db, str(product_id), str(warehouse_id)
    )

    assert result is inventory
    assert "ON CONFLICT" in db.statements[0]
    assert "FOR UPDATE" in db.statements[1]


@pytest.mark.asyncio
async def test_inventory_alert_groups_available_quantity_by_product():
    db = QueueDb([FakeResult(values=[])])

    await dashboard_service._get_inventory_alerts(db)

    sql = db.statements[0]
    assert "sum(inventory.quantity - inventory.locked)" in sql
    assert "GROUP BY products.id" in sql
    assert "inventory.warning_quantity" not in sql


def test_product_warning_quantity_request_rejects_negative_values():
    with pytest.raises(ValidationError):
        ProductWarningQuantityUpdate(warning_quantity=-1)


@pytest.mark.asyncio
async def test_update_product_warning_quantity_updates_product_only():
    product = Product(id=uuid.uuid4(), barcode="6900000000101", name="预警商品")
    db = QueueDb([FakeResult(one=product)])

    result = await product_service.update_product_warning_quantity(
        db, str(product.id), 12
    )

    assert result.warning_quantity == 12
    assert db.flushed is True
    assert db.refreshed == [product]


def test_inventory_list_item_exposes_product_warning_and_image():
    item = InventoryListItemOut(
        id=str(uuid.uuid4()),
        product_id=str(uuid.uuid4()),
        warehouse_id=str(uuid.uuid4()),
        quantity=5,
        locked=1,
        warning_quantity=12,
        product_image_url="https://example.com/product.png",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    assert item.warning_quantity == 12
    assert item.product_image_url == "https://example.com/product.png"


@pytest.mark.asyncio
async def test_product_list_aggregates_available_quantity_across_warehouses():
    product = Product(
        id=uuid.uuid4(),
        name="可销售商品",
        barcode="6900000000201",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("20"),
        cost_price=Decimal("10"),
        image_urls=["https://example.com/product.png"],
        status="active",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db = QueueDb(
        [
            FakeResult(scalar=1),
            FakeResult(values=[(product, 7, 3)]),
            FakeResult(one="食品"),
        ]
    )

    result = await product_service.list_products(db)

    assert result.items[0].available_quantity == 7
    assert result.items[0].locked_quantity == 3
    sql = db.statements[1]
    assert "sum(inventory.quantity - inventory.locked)" in sql
    assert "sum(inventory.locked)" in sql
    assert "coalesce" in sql
    assert "LEFT OUTER JOIN" in sql


@pytest.mark.asyncio
async def test_shipping_reallocation_fails_if_inventory_row_is_missing():
    order = Order(id=uuid.uuid4(), order_no="ORD1")
    item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        product_id=uuid.uuid4(),
        barcode="商品-001",
        product_name="测试 商品",
        quantity=2,
        unit_price=Decimal("10.00"),
        subtotal=Decimal("20.00"),
    )
    warehouse_id = uuid.uuid4()
    allocation = OrderInventoryAllocation(
        id=uuid.uuid4(), order_id=order.id, order_item_id=item.id,
        product_id=item.product_id, warehouse_id=warehouse_id, quantity=2,
        status=OrderInventoryAllocationStatus.reserved,
    )
    db = QueueDb([FakeResult(values=[item]), FakeResult(values=[allocation]), FakeResult(values=[])])

    with pytest.raises(ValueError, match="没有库存"):
        await order_service._reallocate_reserved_inventory(db, order, OrderShipRequest(allocations=[OrderShipmentAllocation(order_item_id=str(item.id), warehouse_id=str(warehouse_id), quantity=2)]))


@pytest.mark.asyncio
async def test_shipping_reallocation_fails_if_locked_inventory_is_less_than_reservation():
    order = Order(id=uuid.uuid4(), order_no="ORD1")
    item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        product_id=uuid.uuid4(),
        barcode="商品-001",
        product_name="测试 商品",
        quantity=3,
        unit_price=Decimal("10.00"),
        subtotal=Decimal("30.00"),
    )
    warehouse_id = uuid.uuid4()
    inventory = Inventory(
        id=uuid.uuid4(),
        product_id=item.product_id,
        warehouse_id=warehouse_id,
        quantity=5,
        locked=1,
    )
    allocation = OrderInventoryAllocation(
        id=uuid.uuid4(), order_id=order.id, order_item_id=item.id,
        product_id=item.product_id, warehouse_id=warehouse_id, quantity=3,
        status=OrderInventoryAllocationStatus.reserved,
    )
    db = QueueDb([FakeResult(values=[item]), FakeResult(values=[allocation]), FakeResult(values=[inventory])])

    with pytest.raises(ValueError, match="锁定库存不足"):
        await order_service._reallocate_reserved_inventory(db, order, OrderShipRequest(allocations=[OrderShipmentAllocation(order_item_id=str(item.id), warehouse_id=str(warehouse_id), quantity=3)]))


@pytest.mark.asyncio
async def test_shipping_reallocates_reserved_inventory_without_deducting_quantity():
    order = Order(
        id=uuid.uuid4(),
        order_no="ORD1",
        customer_id=uuid.uuid4(),
        total_amount=Decimal("50.00"),
        status=OrderStatus.placed,
    )
    item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        product_id=uuid.uuid4(),
        barcode="商品-001",
        product_name="测试商品",
        quantity=5,
        unit_price=Decimal("10.00"),
        subtotal=Decimal("50.00"),
    )
    first_warehouse_id = uuid.uuid4()
    second_warehouse_id = uuid.uuid4()
    existing = OrderInventoryAllocation(
        id=uuid.uuid4(),
        order_id=order.id,
        order_item_id=item.id,
        product_id=item.product_id,
        warehouse_id=first_warehouse_id,
        quantity=5,
        status=OrderInventoryAllocationStatus.reserved,
    )
    first_inventory = Inventory(
        id=uuid.uuid4(),
        product_id=item.product_id,
        warehouse_id=first_warehouse_id,
        quantity=10,
        locked=5,
    )
    second_inventory = Inventory(
        id=uuid.uuid4(),
        product_id=item.product_id,
        warehouse_id=second_warehouse_id,
        quantity=4,
        locked=0,
    )
    db = QueueDb(
        [
            FakeResult(values=[item]),
            FakeResult(values=[existing]),
            FakeResult(values=[first_inventory, second_inventory]),
        ]
    )

    await order_service._reallocate_reserved_inventory(
        db,
        order,
        OrderShipRequest(
            allocations=[
                OrderShipmentAllocation(
                    order_item_id=str(item.id),
                    warehouse_id=str(first_warehouse_id),
                    quantity=2,
                ),
                OrderShipmentAllocation(
                    order_item_id=str(item.id),
                    warehouse_id=str(second_warehouse_id),
                    quantity=3,
                ),
            ]
        ),
    )

    created_allocations = [
        allocation
        for allocation in db.added
        if isinstance(allocation, OrderInventoryAllocation) and allocation is not existing
    ]
    movements = [item for item in db.added if isinstance(item, InventoryMovement)]
    assert (first_inventory.quantity, first_inventory.locked) == (10, 2)
    assert (second_inventory.quantity, second_inventory.locked) == (4, 3)
    assert (existing.quantity, existing.status) == (
        2,
        OrderInventoryAllocationStatus.reserved,
    )
    assert [
        (allocation.warehouse_id, allocation.quantity, allocation.status)
        for allocation in created_allocations
    ] == [
        (
            second_warehouse_id,
            3,
            OrderInventoryAllocationStatus.reserved,
        )
    ]
    assert movements == []


@pytest.mark.asyncio
async def test_stock_out_deducts_current_reservations_and_creates_warehouse_movements():
    order = Order(id=uuid.uuid4(), order_no="ORD1", customer_id=uuid.uuid4(), total_amount=Decimal("50.00"), status=OrderStatus.shipping)
    item = OrderItem(
        id=uuid.uuid4(), order_id=order.id, product_id=uuid.uuid4(), barcode="商品-001",
        product_name="测试商品", quantity=5, unit_price=Decimal("10.00"), subtotal=Decimal("50.00"),
    )
    first_warehouse_id = uuid.uuid4()
    second_warehouse_id = uuid.uuid4()
    allocations = [
        OrderInventoryAllocation(
            id=uuid.uuid4(), order_id=order.id, order_item_id=item.id, product_id=item.product_id,
            warehouse_id=first_warehouse_id, quantity=2, status=OrderInventoryAllocationStatus.reserved,
        ),
        OrderInventoryAllocation(
            id=uuid.uuid4(), order_id=order.id, order_item_id=item.id, product_id=item.product_id,
            warehouse_id=second_warehouse_id, quantity=3, status=OrderInventoryAllocationStatus.reserved,
        ),
    ]
    inventories = [
        Inventory(id=uuid.uuid4(), product_id=item.product_id, warehouse_id=first_warehouse_id, quantity=10, locked=2),
        Inventory(id=uuid.uuid4(), product_id=item.product_id, warehouse_id=second_warehouse_id, quantity=4, locked=3),
    ]
    db = QueueDb([
        FakeResult(values=[item]),
        FakeResult(values=allocations),
        FakeResult(values=inventories),
        FakeResult(scalar=0),
        FakeResult(scalar=0),
    ])

    await order_service._deduct_reserved_inventory(db, order)

    assert [(inventory.quantity, inventory.locked) for inventory in inventories] == [(8, 0), (1, 0)]
    assert all(allocation.status == OrderInventoryAllocationStatus.shipped for allocation in allocations)
    movements = [added for added in db.added if isinstance(added, InventoryMovement)]
    assert sorted(movement.warehouse_id for movement in movements) == sorted([first_warehouse_id, second_warehouse_id])


@pytest.mark.asyncio
async def test_start_shipping_records_operator_and_keeps_inventory_reserved(monkeypatch):
    order = Order(
        id=uuid.uuid4(),
        order_no="ORD1",
        customer_id=uuid.uuid4(),
        total_amount=Decimal("10.00"),
        status=OrderStatus.placed,
    )
    db = QueueDb([FakeResult(one=order)])

    reallocated = []

    async def reallocate_inventory(_db, current_order, request):
        reallocated.append((current_order, request))
        return None

    monkeypatch.setattr(
        order_service,
        "_reallocate_reserved_inventory",
        reallocate_inventory,
        raising=False,
    )

    request = OrderShipRequest(
        allocations=[
            OrderShipmentAllocation(
                order_item_id=str(uuid.uuid4()),
                warehouse_id=str(uuid.uuid4()),
                quantity=1,
            )
        ]
    )

    await order_service.transition_order(
        db,
        str(order.id),
        OrderStatus.shipping,
        "shipper-user",
        ship_request=request,
    )

    assert reallocated == [(order, request)]
    assert order.shipping_started_by == "shipper-user"
    assert order.shipping_started_at is not None


@pytest.mark.asyncio
async def test_stock_out_and_delivery_record_each_operator(monkeypatch):
    from app.services import order_delivery_service

    order = Order(
        id=uuid.uuid4(),
        order_no="ORD1",
        customer_id=uuid.uuid4(),
        total_amount=Decimal("10.00"),
        status=OrderStatus.shipping,
    )
    db = QueueDb([FakeResult(one=order), FakeResult(one=order), FakeResult(one=order), FakeResult(one=None)])
    deducted = []
    created_deliveries = []
    operator = _delivery_employee(name="仓库操作员")
    stock_out_request = OrderStockOutRequest(
        delivery_employee_id=str(uuid.uuid4()),
        recipient_name="客户联系人",
        recipient_phone="13800000000",
        delivery_address="客户地址",
    )

    async def deduct_inventory(_db, current_order):
        deducted.append(current_order)

    async def create_delivery(_db, current_order, request, operator):
        created_deliveries.append((_db, current_order, request, operator))

    async def skip_complete(*_args):
        return None

    monkeypatch.setattr(order_service, "_deduct_reserved_inventory", deduct_inventory, raising=False)
    monkeypatch.setattr(
        order_delivery_service,
        "create_order_delivery",
        create_delivery,
    )
    monkeypatch.setattr(order_service, "_complete", skip_complete)

    await order_service.transition_order(
        db,
        str(order.id),
        OrderStatus.stocked_out,
        operator,
        stock_out_request=stock_out_request,
    )
    assert deducted == [order]
    assert created_deliveries == [
        (db, order, stock_out_request, operator)
    ]
    assert order.stock_out_by == operator.username
    assert order.stock_out_at is not None

    await order_service.transition_order(db, str(order.id), OrderStatus.delivered_unpaid, "delivery-user")
    assert order.delivered_by == "delivery-user"
    assert order.delivered_at is not None

    await order_service.transition_order(
        db,
        str(order.id),
        OrderStatus.completed,
        "cashier-user",
        complete_request=OrderCompleteRequest(
            paid_amount="10.00",
            payment_proof_image_urls=["https://example.com/payment.jpg"],
        ),
    )
    assert order.paid_by == "cashier-user"
    assert order.paid_at is not None


@pytest.mark.asyncio
async def test_stock_out_and_delivery_are_atomic_in_one_session_without_service_commit():
    from app.models.order import OrderStatusLog
    from app.models.order_delivery import (
        OrderDelivery,
        OrderDeliveryEvent,
        OrderDeliveryEventType,
        OrderDeliveryStatus,
    )

    class CommitTrackingDb(QueueDb):
        def __init__(self, results):
            super().__init__(results)
            self.commit_calls = 0

        async def commit(self):
            self.commit_calls += 1

    operator = _delivery_employee(name="仓库操作员")
    delivery_employee = _delivery_employee(name="配送员")
    order = _delivery_order(status=OrderStatus.shipping, total_amount=Decimal("50.00"))
    item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        product_id=uuid.uuid4(),
        barcode="商品-001",
        product_name="测试商品",
        quantity=5,
        unit_price=Decimal("10.00"),
        subtotal=Decimal("50.00"),
    )
    warehouse_id = uuid.uuid4()
    allocation = OrderInventoryAllocation(
        id=uuid.uuid4(),
        order_id=order.id,
        order_item_id=item.id,
        product_id=item.product_id,
        warehouse_id=warehouse_id,
        quantity=5,
        status=OrderInventoryAllocationStatus.reserved,
    )
    inventory = Inventory(
        id=uuid.uuid4(),
        product_id=item.product_id,
        warehouse_id=warehouse_id,
        quantity=8,
        locked=5,
    )
    db = CommitTrackingDb(
        [
            FakeResult(one=order),
            FakeResult(values=[item]),
            FakeResult(values=[allocation]),
            FakeResult(values=[inventory]),
            FakeResult(scalar=0),
            FakeResult(one=delivery_employee),
        ]
    )
    request = OrderStockOutRequest(
        delivery_employee_id=str(delivery_employee.id),
        recipient_name="客户联系人",
        recipient_phone="13800000000",
        delivery_address="客户地址",
    )

    await order_service.transition_order(
        db,
        str(order.id),
        OrderStatus.stocked_out,
        operator,
        stock_out_request=request,
    )

    delivery = next(added for added in db.added if isinstance(added, OrderDelivery))
    assigned_event = next(
        added for added in db.added if isinstance(added, OrderDeliveryEvent)
    )
    assert (inventory.quantity, inventory.locked) == (3, 0)
    assert allocation.status == OrderInventoryAllocationStatus.shipped
    assert order.status == OrderStatus.stocked_out
    assert order.stock_out_by == operator.username
    assert order.stock_out_at is not None
    assert delivery.status == OrderDeliveryStatus.delivering
    assert delivery.delivery_employee_id == delivery_employee.id
    assert delivery.assigned_by_id == operator.id
    assert assigned_event.event_type == OrderDeliveryEventType.assigned
    assert assigned_event.delivery_id == delivery.id
    assert any(isinstance(added, OrderStatusLog) for added in db.added)
    assert db.commit_calls == 0


@pytest.mark.asyncio
async def test_stock_out_and_delivery_require_request_and_employee_actor(monkeypatch):
    order = _delivery_order(status=OrderStatus.shipping)
    operator = _delivery_employee(name="仓库操作员")
    request = OrderStockOutRequest(
        delivery_employee_id=str(uuid.uuid4()),
        recipient_name="客户联系人",
        recipient_phone="13800000000",
        delivery_address="客户地址",
    )
    deducted = []

    async def deduct_inventory(_db, current_order):
        deducted.append(current_order)

    monkeypatch.setattr(order_service, "_deduct_reserved_inventory", deduct_inventory)

    with pytest.raises(ValueError, match="配送信息不能为空"):
        await order_service.transition_order(
            QueueDb([FakeResult(one=order)]),
            str(order.id),
            OrderStatus.stocked_out,
            operator,
        )

    order.status = OrderStatus.shipping
    with pytest.raises(ValueError, match="出库操作员工不能为空"):
        await order_service.transition_order(
            QueueDb([FakeResult(one=order)]),
            str(order.id),
            OrderStatus.stocked_out,
            operator.username,
            stock_out_request=request,
        )

    assert deducted == []


@pytest.mark.asyncio
async def test_stock_out_and_delivery_failure_propagates_without_service_commit(monkeypatch):
    from app.services import order_delivery_service

    class CommitTrackingDb(QueueDb):
        def __init__(self, results):
            super().__init__(results)
            self.commit_calls = 0

        async def commit(self):
            self.commit_calls += 1

    operator = _delivery_employee(name="仓库操作员")
    order = _delivery_order(status=OrderStatus.shipping, total_amount=Decimal("20.00"))
    item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        product_id=uuid.uuid4(),
        barcode="商品-001",
        product_name="测试商品",
        quantity=2,
        unit_price=Decimal("10.00"),
        subtotal=Decimal("20.00"),
    )
    warehouse_id = uuid.uuid4()
    allocation = OrderInventoryAllocation(
        id=uuid.uuid4(),
        order_id=order.id,
        order_item_id=item.id,
        product_id=item.product_id,
        warehouse_id=warehouse_id,
        quantity=2,
        status=OrderInventoryAllocationStatus.reserved,
    )
    inventory = Inventory(
        id=uuid.uuid4(),
        product_id=item.product_id,
        warehouse_id=warehouse_id,
        quantity=5,
        locked=2,
    )
    db = CommitTrackingDb(
        [
            FakeResult(one=order),
            FakeResult(values=[item]),
            FakeResult(values=[allocation]),
            FakeResult(values=[inventory]),
            FakeResult(scalar=0),
        ]
    )
    request = OrderStockOutRequest(
        delivery_employee_id=str(uuid.uuid4()),
        recipient_name="客户联系人",
        recipient_phone="13800000000",
        delivery_address="客户地址",
    )

    async def fail_delivery_creation(*_args):
        raise ValueError("配送创建失败")

    monkeypatch.setattr(
        order_delivery_service,
        "create_order_delivery",
        fail_delivery_creation,
    )

    with pytest.raises(ValueError, match="配送创建失败"):
        await order_service.transition_order(
            db,
            str(order.id),
            OrderStatus.stocked_out,
            operator,
            stock_out_request=request,
        )

    assert (inventory.quantity, inventory.locked) == (3, 0)
    assert allocation.status == OrderInventoryAllocationStatus.shipped
    assert order.status == OrderStatus.shipping
    assert db.commit_calls == 0
    assert not any(
        added.__class__.__name__ == "OrderStatusLog" for added in db.added
    )


@pytest.mark.asyncio
async def test_stock_out_and_delivery_summary_serializes_final_signature_fields():
    from app.models.order_delivery import OrderDeliveryStatus

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    order = Order(
        id=uuid.uuid4(),
        order_no="ORD1",
        customer_id=uuid.uuid4(),
        total_amount=Decimal("20.00"),
        status=OrderStatus.delivered_unpaid,
        created_at=now,
        updated_at=now,
    )
    employee = _delivery_employee(name="配送员")
    delivery = _delivery_record(order, employee, status=OrderDeliveryStatus.signed)
    delivery.signer_name = "实际签收人"
    delivery.proof_image_urls = None
    delivery.sign_remark = "已当面交付"
    delivery.signed_at = now
    delivery.signed_by_id = employee.id
    delivery.signed_by_name = employee.name
    db = QueueDb(
        [
            FakeResult(values=[]),
            FakeResult(values=[]),
            FakeResult(one="测试客户"),
            FakeResult(values=[]),
            FakeResult(one=delivery),
            FakeResult(values=[]),
        ]
    )

    result = await order_service._out(db, order)

    assert result.delivery is not None
    assert result.delivery.delivery_employee_id == str(employee.id)
    assert result.delivery.delivery_employee_name == employee.name
    assert result.delivery.recipient_name == delivery.recipient_name
    assert result.delivery.recipient_phone == delivery.recipient_phone
    assert result.delivery.delivery_address == delivery.delivery_address
    assert result.delivery.status == OrderDeliveryStatus.signed
    assert result.delivery.signer_name == "实际签收人"
    assert result.delivery.proof_image_urls == []
    assert result.delivery.sign_remark == "已当面交付"
    assert result.delivery.signed_at == now
    assert result.delivery.signed_by_id == str(employee.id)
    assert result.delivery.signed_by_name == employee.name
    assert result.delivery.latest_exception is None
    assert sum("FROM order_deliveries" in sql for sql in db.statements) == 1
    assert sum("FROM order_delivery_events" in sql for sql in db.statements) == 1


@pytest.mark.asyncio
async def test_order_delivery_summary_uses_latest_exception_event_for_detail():
    from app.models.order_delivery import (
        OrderDeliveryEvent,
        OrderDeliveryEventType,
        OrderDeliveryExceptionType,
    )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    order = _delivery_order()
    order.created_at = now
    order.updated_at = now
    employee = _delivery_employee()
    delivery = _delivery_record(order, employee)
    latest_exception = OrderDeliveryEvent(
        id=uuid.uuid4(),
        delivery_id=delivery.id,
        event_type=OrderDeliveryEventType.exception,
        exception_type=OrderDeliveryExceptionType.customer_refused,
        remark="客户拒收",
        operator_id=employee.id,
        operator_name=employee.name,
        created_at=now.replace(microsecond=now.microsecond + 1),
    )
    db = QueueDb(
        [
            FakeResult(values=[]),
            FakeResult(values=[]),
            FakeResult(one="测试客户"),
            FakeResult(values=[]),
            FakeResult(one=delivery),
            FakeResult(values=[latest_exception]),
        ]
    )

    result = await order_service._out(db, order)

    assert result.delivery is not None
    assert result.delivery.latest_exception is not None
    assert result.delivery.latest_exception.exception_type == OrderDeliveryExceptionType.customer_refused
    assert result.delivery.latest_exception.remark == "客户拒收"
    assert result.delivery.latest_exception.occurred_at == latest_exception.created_at
    exception_statement = next(
        sql for sql in db.statements if "FROM order_delivery_events" in sql
    )
    assert "order_delivery_events.created_at DESC" in exception_statement
    assert "order_delivery_events.id DESC" in exception_statement


@pytest.mark.asyncio
async def test_stock_out_and_delivery_actor_identity_cannot_diverge(monkeypatch):
    from app.models.order import OrderStatusLog
    from app.services import order_delivery_service

    operator = _delivery_employee(name="仓库操作员姓名")
    order = _delivery_order(status=OrderStatus.shipping)
    request = OrderStockOutRequest(
        delivery_employee_id=str(uuid.uuid4()),
        recipient_name="客户联系人",
        recipient_phone="13800000000",
        delivery_address="客户地址",
    )
    delivery_actors = []

    async def deduct_inventory(*_args):
        return None

    async def create_delivery(_db, current_order, stock_out_request, actor):
        delivery_actors.append((current_order, stock_out_request, actor))

    monkeypatch.setattr(order_service, "_deduct_reserved_inventory", deduct_inventory)
    monkeypatch.setattr(
        order_delivery_service,
        "create_order_delivery",
        create_delivery,
    )
    db = QueueDb([FakeResult(one=order)])

    await order_service.transition_order(
        db,
        str(order.id),
        OrderStatus.stocked_out,
        operator,
        stock_out_request=request,
    )

    status_log = next(added for added in db.added if isinstance(added, OrderStatusLog))
    assert delivery_actors == [(order, request, operator)]
    assert order.stock_out_by == operator.username
    assert status_log.operator == operator.username


@pytest.mark.asyncio
async def test_list_orders_batch_loads_delivery_summaries_once():
    from app.models.order_delivery import (
        OrderDeliveryEvent,
        OrderDeliveryEventType,
        OrderDeliveryExceptionType,
        OrderDeliveryStatus,
    )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    orders = [
        Order(
            id=uuid.uuid4(),
            order_no=f"ORD-{index}",
            customer_id=uuid.uuid4(),
            total_amount=Decimal("20.00"),
            status=OrderStatus.stocked_out,
            created_at=now,
            updated_at=now,
        )
        for index in range(2)
    ]
    employees = [_delivery_employee(name=f"配送员{index}") for index in range(2)]
    deliveries = [
        _delivery_record(order, employee, status=OrderDeliveryStatus.delivering)
        for order, employee in zip(orders, employees, strict=True)
    ]
    latest_exception = OrderDeliveryEvent(
        id=uuid.uuid4(),
        delivery_id=deliveries[0].id,
        event_type=OrderDeliveryEventType.exception,
        exception_type=OrderDeliveryExceptionType.invalid_contact,
        remark="电话无效",
        operator_id=employees[0].id,
        operator_name=employees[0].name,
        created_at=now,
    )

    class ListOrdersDb(QueueDb):
        async def execute(self, statement):
            sql = str(statement)
            self.statements.append(sql)
            self.statement_params.append(statement.compile().params)
            if "count(*)" in sql and "FROM orders" in sql:
                return FakeResult(scalar=2)
            if "FROM orders" in sql:
                return FakeResult(values=orders)
            if "FROM order_deliveries" in sql:
                if " IN " in sql:
                    return FakeResult(values=deliveries)
                order_id = next(iter(statement.compile().params.values()))
                delivery = next(
                    item for item in deliveries if str(item.order_id) == str(order_id)
                )
                return FakeResult(one=delivery)
            if "FROM order_delivery_events" in sql:
                return FakeResult(values=[latest_exception])
            if "FROM order_items" in sql:
                return FakeResult(values=[])
            if "FROM order_inventory_allocations" in sql:
                return FakeResult(values=[])
            if "FROM customers" in sql:
                return FakeResult(one="测试客户")
            if "FROM order_status_logs" in sql:
                return FakeResult(values=[])
            raise AssertionError(f"Unexpected query: {sql}")

    db = ListOrdersDb()

    result = await order_service.list_orders(db, page=1, page_size=20)

    assert [item.delivery.id for item in result.items] == [
        str(delivery.id) for delivery in deliveries
    ]
    assert result.items[0].delivery.latest_exception is not None
    assert result.items[0].delivery.latest_exception.exception_type == OrderDeliveryExceptionType.invalid_contact
    assert result.items[1].delivery.latest_exception is None
    delivery_statements = [
        sql for sql in db.statements if "FROM order_deliveries" in sql
    ]
    assert len(delivery_statements) == 1
    assert " IN " in delivery_statements[0]
    exception_statements = [
        sql for sql in db.statements if "FROM order_delivery_events" in sql
    ]
    assert len(exception_statements) == 1
    assert " IN " in exception_statements[0]
    normalized_exception_sql = " ".join(exception_statements[0].split()).lower()
    assert "row_number() over (partition by order_delivery_events.delivery_id" in normalized_exception_sql
    assert "order_delivery_events.created_at desc" in normalized_exception_sql
    assert "order_delivery_events.id desc" in normalized_exception_sql
    assert "setdefault" not in inspect.getsource(order_service._latest_delivery_exceptions)


def test_order_delivery_order_summary_has_distinct_schema_name():
    from app.schemas.order import OrderDeliveryOrderSummaryOut

    assert "OrderDeliveryOrderSummaryOut" in str(
        OrderOut.model_fields["delivery"].annotation
    )
    assert {
        "proof_image_urls",
        "sign_remark",
        "signed_by_id",
        "signed_by_name",
        "latest_exception",
    }.issubset(OrderDeliveryOrderSummaryOut.model_fields)


@pytest.mark.asyncio
async def test_cancel_placed_order_releases_allocated_inventory_without_stock_movement():
    order = Order(id=uuid.uuid4(), order_no="ORD1")
    item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        product_id=uuid.uuid4(),
        barcode="商品-001",
        product_name="测试 商品",
        quantity=2,
        unit_price=Decimal("10.00"),
        subtotal=Decimal("20.00"),
    )
    warehouse_id = uuid.uuid4()
    inventory = Inventory(
        id=uuid.uuid4(),
        product_id=item.product_id,
        warehouse_id=warehouse_id,
        quantity=5,
        locked=2,
    )
    allocation = OrderInventoryAllocation(
        id=uuid.uuid4(), order_id=order.id, order_item_id=item.id,
        product_id=item.product_id, warehouse_id=warehouse_id, quantity=2,
        status=OrderInventoryAllocationStatus.reserved,
    )
    db = QueueDb([FakeResult(values=[item]), FakeResult(values=[allocation]), FakeResult(values=[inventory])])

    await order_service._release_locked_inventory(db, order, deduct_quantity=False)

    movements = [item for item in db.added if isinstance(item, InventoryMovement)]
    assert inventory.quantity == 5
    assert inventory.locked == 0
    assert allocation.status == OrderInventoryAllocationStatus.released
    assert movements == []


@pytest.mark.asyncio
async def test_stock_in_fails_for_unknown_product(monkeypatch):
    product_id = uuid.uuid4()
    warehouse_id = uuid.uuid4()
    inventory = Inventory(
        id=uuid.uuid4(),
        product_id=product_id,
        warehouse_id=warehouse_id,
        quantity=0,
        locked=0,
    )
    db = QueueDb()

    async def fake_get_or_create_inventory(*_args):
        return inventory

    async def fake_lookup_product_info(*_args):
        return {}

    monkeypatch.setattr(
        inventory_service, "_get_or_create_inventory", fake_get_or_create_inventory
    )
    monkeypatch.setattr(inventory_service, "_lookup_product_info", fake_lookup_product_info)

    with pytest.raises(ValueError, match="Product"):
        await inventory_service.stock_in(
            db,
            StockInRequest(
                product_id=str(product_id),
                warehouse_id=str(warehouse_id),
                quantity=1,
            ),
        )


@pytest.mark.asyncio
async def test_transfer_records_separate_out_and_in_movements(monkeypatch):
    product_id = uuid.uuid4()
    from_warehouse_id = uuid.uuid4()
    to_warehouse_id = uuid.uuid4()
    product = Product(id=uuid.uuid4(), name="商品")
    product = Product(
        id=product_id,
        short_name="测试商品",
        barcode="6900000000001",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("100.00"),
        cost_price=Decimal("50.00"),
    )
    from_inventory = Inventory(
        id=uuid.uuid4(),
        product_id=product_id,
        warehouse_id=from_warehouse_id,
        quantity=10,
        locked=0,
    )
    to_inventory = Inventory(
        id=uuid.uuid4(),
        product_id=product_id,
        warehouse_id=to_warehouse_id,
        quantity=3,
        locked=0,
    )
    db = QueueDb()
    sequence = {"value": 0}

    async def fake_get_or_create_inventory(_db, _product_id, warehouse_id):
        if str(warehouse_id) == str(from_warehouse_id):
            return from_inventory
        if str(warehouse_id) == str(to_warehouse_id):
            return to_inventory
        raise AssertionError("unexpected warehouse")

    async def fake_lookup_product_info(*_args):
        return {str(product_id): {"product": product, "brand_name": None}}

    async def fake_generate_order_no(_db, prefix, _model):
        sequence["value"] += 1
        return f"{prefix}20260711{sequence['value']:06d}"

    monkeypatch.setattr(
        inventory_service, "_get_or_create_inventory", fake_get_or_create_inventory
    )
    monkeypatch.setattr(inventory_service, "_lookup_product_info", fake_lookup_product_info)
    monkeypatch.setattr(inventory_service, "_generate_order_no", fake_generate_order_no)

    await inventory_service.transfer(
        db,
        TransferRequest(
            product_id=str(product_id),
            from_warehouse_id=str(from_warehouse_id),
            to_warehouse_id=str(to_warehouse_id),
            quantity=4,
        ),
    )

    movements = [item for item in db.added if isinstance(item, InventoryMovement)]
    assert [movement.movement_type for movement in movements] == [
        MovementType.transfer_out,
        MovementType.transfer_in,
    ]
    assert movements[0].items[0].before_quantity == 10
    assert movements[0].items[0].after_quantity == 6
    assert movements[1].items[0].before_quantity == 3
    assert movements[1].items[0].after_quantity == 7


@pytest.mark.asyncio
async def test_list_products_filters_by_keyword_brand_and_inclusive_price_ranges():
    db = QueueDb([FakeResult(scalar=0), FakeResult(values=[])])

    await product_service.list_products(
        db,
        keyword="茉莉",
        barcode="6900",
        category_id=str(uuid.uuid4()),
        brand_id=str(uuid.uuid4()),
        status=ProductStatus.active,
        min_cost_price=10,
        max_cost_price=20,
        min_standard_price=30,
        max_standard_price=40,
    )

    count_sql, query_sql = db.statements
    for sql in (count_sql, query_sql):
        assert "products.short_name" in sql
        assert "products.brand_id" in sql
        assert "products.cost_price >=" in sql
        assert "products.cost_price <=" in sql
        assert "products.standard_price >=" in sql
        assert "products.standard_price <=" in sql
        assert "products.barcode" in sql


def test_return_order_domain_contract():
    from app.models.inventory import MovementType
    from app.models.return_order import (
        ReturnOrder,
        ReturnOrderItem,
        ReturnOrderStatus,
        ReturnProductCondition,
    )

    assert {status.value for status in ReturnOrderStatus} == {"completed", "voided"}
    assert {condition.value for condition in ReturnProductCondition} == {
        "normal",
        "expired",
        "damaged",
        "other",
    }
    assert {
        "return_no",
        "customer_id",
        "total_amount",
        "status",
        "operator",
        "completed_at",
        "remark",
        "customer_spent_before",
        "customer_spent_after",
        "spend_deduction_amount",
        "voided_by",
        "voided_at",
        "void_reason",
        "void_customer_spent_before",
        "void_customer_spent_after",
    }.issubset(ReturnOrder.__table__.columns.keys())
    assert {
        "return_order_id",
        "product_id",
        "product_name",
        "barcode",
        "quantity",
        "unit_price",
        "subtotal",
        "condition",
        "return_reason",
        "remark",
        "should_stock_in",
        "warehouse_id",
    }.issubset(ReturnOrderItem.__table__.columns.keys())
    assert {
        "customer_return_in",
        "customer_return_void_out",
    }.issubset({movement.value for movement in MovementType})


def test_return_order_create_schema_validates_stock_in_warehouse_decision():
    from app.schemas.return_order import ReturnOrderCreate, ReturnOrderItemCreate

    common = {
        "source_order_item_id": str(uuid.uuid4()),
        "quantity": 1,
        "condition": "normal",
        "return_reason": "客户拒收",
    }
    with pytest.raises(ValidationError, match="入库仓库"):
        ReturnOrderCreate(
            handling_delivery_id=str(uuid.uuid4()),
            items=[ReturnOrderItemCreate(**common, should_stock_in=True)],
        )
    with pytest.raises(ValidationError, match="不得保留仓库"):
        ReturnOrderCreate(
            handling_delivery_id=str(uuid.uuid4()),
            items=[
                ReturnOrderItemCreate(
                    **common,
                    should_stock_in=False,
                    warehouse_id=str(uuid.uuid4()),
                )
            ],
        )


def test_return_order_void_requires_non_blank_reason():
    from app.schemas.return_order import ReturnOrderVoidRequest

    with pytest.raises(ValidationError):
        ReturnOrderVoidRequest(void_reason="   ")


@pytest.mark.asyncio
async def test_create_return_order_stocks_selected_items_and_deducts_actual_customer_spend(monkeypatch):
    from app.models.return_order import ReturnOrder, ReturnOrderItem, ReturnOrderStatus
    from app.models.order_delivery import OrderDelivery, OrderDeliveryStatus
    from app.schemas.return_order import ReturnOrderCreate, ReturnOrderItemCreate
    from app.services import return_order_service

    customer = Customer(
        id=uuid.uuid4(),
        name="退货客户",
        contact_name="联系人",
        contact_phone="13800000001",
        level_id=uuid.uuid4(),
        total_spent=Decimal("50.00"),
        order_count=4,
    )
    original_level_id = customer.level_id
    first_product = Product(
        id=uuid.uuid4(), name="可入库商品", barcode="6900000000301",
        category_id=uuid.uuid4(), unit="件", standard_price=Decimal("30.00"), cost_price=Decimal("10.00"),
    )
    second_product = Product(
        id=uuid.uuid4(), name="过期商品", barcode="6900000000302",
        category_id=uuid.uuid4(), unit="件", standard_price=Decimal("40.00"), cost_price=Decimal("12.00"),
    )
    operator_id = uuid.uuid4()
    handling_order = Order(
        id=uuid.uuid4(), order_no="ORD-HANDLING", customer_id=customer.id,
        total_amount=Decimal("10.00"), returned_amount=Decimal("0.00"),
        status=OrderStatus.stocked_out,
    )
    delivery = OrderDelivery(
        id=uuid.uuid4(), order_id=handling_order.id,
        delivery_employee_id=operator_id, delivery_employee_name="配送员",
        status=OrderDeliveryStatus.delivering, recipient_name="收货人",
        recipient_phone="13800000000", delivery_address="测试地址",
        assigned_at=datetime.now(timezone.utc).replace(tzinfo=None),
        assigned_by_id=uuid.uuid4(), assigned_by_name="管理员",
    )
    first_source_order = Order(
        id=uuid.uuid4(), order_no="ORD-SOURCE-1", customer_id=customer.id,
        total_amount=Decimal("60.00"), returned_amount=Decimal("0.00"),
        status=OrderStatus.completed,
    )
    first_source_item = OrderItem(
        id=uuid.uuid4(), order_id=first_source_order.id, product_id=first_product.id,
        product_name=first_product.name, barcode=first_product.barcode, quantity=2,
        unit_price=Decimal("30.00"), subtotal=Decimal("60.00"),
    )
    second_source_order = Order(
        id=uuid.uuid4(), order_no="ORD-SOURCE-2", customer_id=customer.id,
        total_amount=Decimal("40.00"), returned_amount=Decimal("0.00"),
        status=OrderStatus.delivered_unpaid,
    )
    second_source_item = OrderItem(
        id=uuid.uuid4(), order_id=second_source_order.id, product_id=second_product.id,
        product_name=second_product.name, barcode=second_product.barcode, quantity=1,
        unit_price=Decimal("40.00"), subtotal=Decimal("40.00"),
    )
    warehouse = Warehouse(id=uuid.uuid4(), name="主仓", status=WarehouseStatus.active)
    inventory = Inventory(
        id=uuid.uuid4(), product_id=first_product.id, warehouse_id=warehouse.id,
        quantity=3, locked=0,
    )
    db = QueueDb([
        FakeResult(one=(delivery, handling_order)),
        FakeResult(one=customer),
        FakeResult(values=[(first_source_item, first_source_order), (second_source_item, second_source_order)]),
        FakeResult(values=[]),
        FakeResult(values=[warehouse.id]),
    ])

    async def fixed_return_no(_db):
        return "RET20260719000001"

    async def fixed_movement_no(_db, _prefix):
        return "CRI20260719000001"

    async def get_inventory(_db, product_id, warehouse_id):
        assert str(product_id) == str(first_product.id)
        assert str(warehouse_id) == str(warehouse.id)
        return inventory

    monkeypatch.setattr(return_order_service, "generate_return_no", fixed_return_no)
    monkeypatch.setattr(return_order_service, "_movement_no", fixed_movement_no)
    monkeypatch.setattr(return_order_service, "_get_or_create_inventory", get_inventory)

    result = await return_order_service.create_return_order(
        db,
        ReturnOrderCreate(
            handling_delivery_id=str(delivery.id),
            items=[
                ReturnOrderItemCreate(
                    source_order_item_id=str(first_source_item.id), quantity=2,
                    condition="normal", return_reason="客户多买",
                    should_stock_in=True, warehouse_id=str(warehouse.id),
                ),
                ReturnOrderItemCreate(
                    source_order_item_id=str(second_source_item.id), quantity=1,
                    condition="expired", return_reason="商品过期", should_stock_in=False,
                ),
            ],
        ),
        operator_id=operator_id,
        operator_name="return-user",
    )

    assert isinstance(result, ReturnOrder)
    assert result.status == ReturnOrderStatus.completed
    assert result.total_amount == Decimal("100.00")
    assert result.customer_spent_before == Decimal("50.00")
    assert result.customer_spent_after == Decimal("0.00")
    assert result.spend_deduction_amount == Decimal("50.00")
    assert customer.total_spent == Decimal("0.00")
    assert customer.order_count == 4
    assert customer.level_id == original_level_id
    assert inventory.quantity == 5
    return_items = [added for added in db.added if isinstance(added, ReturnOrderItem)]
    assert len(return_items) == 2
    movements = [added for added in db.added if isinstance(added, InventoryMovement)]
    assert len(movements) == 1
    assert movements[0].movement_type == MovementType.customer_return_in


@pytest.mark.asyncio
async def test_void_return_order_reverses_inventory_and_only_restores_actual_deduction(monkeypatch):
    from app.models.return_order import ReturnOrder, ReturnOrderItem, ReturnOrderStatus, ReturnProductCondition
    from app.services import return_order_service

    customer = Customer(
        id=uuid.uuid4(), name="退货客户", contact_name="联系人",
        contact_phone="13800000002", level_id=uuid.uuid4(), total_spent=Decimal("20.00"), order_count=4,
    )
    warehouse_id = uuid.uuid4()
    product_id = uuid.uuid4()
    source_order = Order(
        id=uuid.uuid4(), order_no="ORD-SOURCE", customer_id=customer.id,
        total_amount=Decimal("100.00"), returned_amount=Decimal("60.00"),
        status=OrderStatus.completed,
    )
    source_item = OrderItem(
        id=uuid.uuid4(), order_id=source_order.id, product_id=product_id,
        product_name="可入库商品", barcode="6900000000301", quantity=2,
        unit_price=Decimal("30.00"), subtotal=Decimal("60.00"),
    )
    return_order = ReturnOrder(
        id=uuid.uuid4(), return_no="RET1", customer_id=customer.id,
        handling_delivery_id=uuid.uuid4(),
        total_amount=Decimal("100.00"), status=ReturnOrderStatus.completed,
        operator="return-user", completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
        customer_spent_before=Decimal("50.00"), customer_spent_after=Decimal("0.00"),
        spend_deduction_amount=Decimal("50.00"),
    )
    return_order.items = [
        ReturnOrderItem(
            id=uuid.uuid4(), return_order_id=return_order.id,
            source_order_item_id=source_item.id, product_id=product_id,
            product_name="可入库商品", barcode="6900000000301", quantity=2,
            unit_price=Decimal("30.00"), subtotal=Decimal("60.00"),
            condition=ReturnProductCondition.normal, return_reason="客户多买",
            should_stock_in=True, warehouse_id=warehouse_id,
        )
    ]
    inventory = Inventory(
        id=uuid.uuid4(), product_id=product_id, warehouse_id=warehouse_id,
        quantity=5, locked=1,
    )
    db = QueueDb([
        FakeResult(one=return_order),
        FakeResult(one=customer),
        FakeResult(values=[(source_item, source_order)]),
    ])

    async def fixed_movement_no(_db, _prefix):
        return "CRV20260719000001"

    async def get_inventory(_db, _product_id, _warehouse_id):
        return inventory

    monkeypatch.setattr(return_order_service, "_movement_no", fixed_movement_no)
    monkeypatch.setattr(return_order_service, "_get_or_create_inventory", get_inventory)

    result = await return_order_service.void_return_order(
        db, str(return_order.id), operator="audit-user", void_reason="录入错误"
    )

    assert result.status == ReturnOrderStatus.voided
    assert inventory.quantity == 3
    assert customer.total_spent == Decimal("70.00")
    assert customer.order_count == 4
    assert result.voided_by == "audit-user"
    assert result.void_reason == "录入错误"
    assert result.void_customer_spent_before == Decimal("20.00")
    assert result.void_customer_spent_after == Decimal("70.00")
    movements = [added for added in db.added if isinstance(added, InventoryMovement)]
    assert len(movements) == 1
    assert movements[0].movement_type == MovementType.customer_return_void_out


@pytest.mark.asyncio
async def test_void_return_order_rejects_inventory_that_would_consume_locked_stock(monkeypatch):
    from app.models.return_order import ReturnOrder, ReturnOrderItem, ReturnOrderStatus, ReturnProductCondition
    from app.services import return_order_service

    customer = Customer(
        id=uuid.uuid4(), name="退货客户", contact_name="联系人",
        contact_phone="13800000003", level_id=uuid.uuid4(), total_spent=Decimal("20.00"), order_count=4,
    )
    warehouse_id = uuid.uuid4()
    product_id = uuid.uuid4()
    source_order = Order(
        id=uuid.uuid4(), order_no="ORD-SOURCE", customer_id=customer.id,
        total_amount=Decimal("60.00"), returned_amount=Decimal("60.00"),
        status=OrderStatus.completed,
    )
    source_item = OrderItem(
        id=uuid.uuid4(), order_id=source_order.id, product_id=product_id,
        product_name="可入库商品", barcode="6900000000301", quantity=2,
        unit_price=Decimal("30.00"), subtotal=Decimal("60.00"),
    )
    return_order = ReturnOrder(
        id=uuid.uuid4(), return_no="RET1", customer_id=customer.id,
        handling_delivery_id=uuid.uuid4(),
        total_amount=Decimal("60.00"), status=ReturnOrderStatus.completed,
        operator="return-user", completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
        customer_spent_before=Decimal("50.00"), customer_spent_after=Decimal("0.00"),
        spend_deduction_amount=Decimal("50.00"),
    )
    return_order.items = [
        ReturnOrderItem(
            id=uuid.uuid4(), return_order_id=return_order.id,
            source_order_item_id=source_item.id, product_id=product_id,
            product_name="可入库商品", barcode="6900000000301", quantity=2,
            unit_price=Decimal("30.00"), subtotal=Decimal("60.00"),
            condition=ReturnProductCondition.normal, return_reason="客户多买",
            should_stock_in=True, warehouse_id=warehouse_id,
        )
    ]
    inventory = Inventory(
        id=uuid.uuid4(), product_id=product_id, warehouse_id=warehouse_id,
        quantity=5, locked=4,
    )
    db = QueueDb([
        FakeResult(one=return_order),
        FakeResult(one=customer),
        FakeResult(values=[(source_item, source_order)]),
    ])

    async def get_inventory(_db, _product_id, _warehouse_id):
        return inventory

    monkeypatch.setattr(return_order_service, "_get_or_create_inventory", get_inventory)

    with pytest.raises(ValueError, match="可用库存不足"):
        await return_order_service.void_return_order(
            db, str(return_order.id), operator="audit-user", void_reason="录入错误"
        )

    assert return_order.status == ReturnOrderStatus.completed
    assert inventory.quantity == 5
    assert customer.total_spent == Decimal("20.00")


def test_return_order_routes_and_auth_contract():
    return_routes = [
        route for route in app.routes
        if route.path.startswith("/api/v1/return-orders")
    ]
    assert {(route.path, tuple(sorted(route.methods))) for route in return_routes} == {
        ("/api/v1/return-orders", ("POST",)),
        ("/api/v1/return-orders", ("GET",)),
        ("/api/v1/return-orders/{return_order_id}", ("GET",)),
        ("/api/v1/return-orders/{return_order_id}/void", ("PUT",)),
    }
    for route in return_routes:
        dependency_names = {
            dependency.call.__name__
            for dependency in route.dependant.dependencies
            if dependency.call is not None
        }
        if route.path == "/api/v1/return-orders" and "POST" in route.methods:
            assert "require_delivery" in dependency_names
        elif route.path.endswith("/void"):
            assert "require_admin" in dependency_names
        else:
            assert "get_current_user" in dependency_names


@pytest.mark.asyncio
async def test_shipping_reallocation_reuses_previously_released_warehouse_row():
    order = Order(id=uuid.uuid4(), order_no="ORD1", customer_id=uuid.uuid4(), total_amount=Decimal("50.00"), status=OrderStatus.shipping)
    item = OrderItem(
        id=uuid.uuid4(), order_id=order.id, product_id=uuid.uuid4(), barcode="商品-001",
        product_name="测试商品", quantity=5, unit_price=Decimal("10.00"), subtotal=Decimal("50.00"),
    )
    first_warehouse_id = uuid.uuid4()
    second_warehouse_id = uuid.uuid4()
    released_allocation = OrderInventoryAllocation(
        id=uuid.uuid4(), order_id=order.id, order_item_id=item.id, product_id=item.product_id,
        warehouse_id=first_warehouse_id, quantity=5, status=OrderInventoryAllocationStatus.released,
    )
    reserved_allocation = OrderInventoryAllocation(
        id=uuid.uuid4(), order_id=order.id, order_item_id=item.id, product_id=item.product_id,
        warehouse_id=second_warehouse_id, quantity=5, status=OrderInventoryAllocationStatus.reserved,
    )
    first_inventory = Inventory(id=uuid.uuid4(), product_id=item.product_id, warehouse_id=first_warehouse_id, quantity=5, locked=0)
    second_inventory = Inventory(id=uuid.uuid4(), product_id=item.product_id, warehouse_id=second_warehouse_id, quantity=5, locked=5)
    db = QueueDb([
        FakeResult(values=[item]),
        FakeResult(values=[released_allocation, reserved_allocation]),
        FakeResult(values=[first_inventory, second_inventory]),
    ])

    await order_service._reallocate_reserved_inventory(
        db,
        order,
        OrderShipRequest(allocations=[
            OrderShipmentAllocation(order_item_id=str(item.id), warehouse_id=str(first_warehouse_id), quantity=5),
        ]),
    )

    created_allocations = [added for added in db.added if isinstance(added, OrderInventoryAllocation)]
    assert created_allocations == []
    assert released_allocation.status == OrderInventoryAllocationStatus.reserved
    assert released_allocation.quantity == 5
    assert reserved_allocation.status == OrderInventoryAllocationStatus.released
    assert (first_inventory.locked, second_inventory.locked) == (5, 0)


@pytest.mark.asyncio
async def test_order_output_does_not_lazy_load_relationships():
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    class RelationshipGuardOrder:
        id = uuid.uuid4()
        order_no = "ORD1"
        customer_id = uuid.uuid4()
        total_amount = Decimal("20.00")
        status = OrderStatus.placed
        remark = None
        shipping_started_at = None
        shipping_started_by = None
        stock_out_at = None
        stock_out_by = None
        delivered_at = None
        delivered_by = None
        paid_at = None
        paid_by = None
        paid_amount = None
        payment_proof_image_urls = None
        cancelled_at = None
        cancelled_by = None
        cancel_reason = None
        created_at = now
        updated_at = now

        def __getattribute__(self, name):
            if name in {"items", "inventory_allocations", "customer"}:
                raise RuntimeError("relationship lazy load attempted")
            return super().__getattribute__(name)

    db = QueueDb([
        FakeResult(values=[]),
        FakeResult(values=[]),
        FakeResult(one="测试客户"),
        FakeResult(values=[]),
        FakeResult(one=None),
    ])

    result = await order_service._out(db, RelationshipGuardOrder())

    assert result.order_no == "ORD1"
    assert result.customer_name == "测试客户"
    assert result.items == []
    assert result.delivery is None


@pytest.mark.asyncio
async def test_shipping_options_include_current_order_reservation_in_available_quantity():
    order = Order(
        id=uuid.uuid4(), order_no="ORD1", customer_id=uuid.uuid4(),
        total_amount=Decimal("50.00"), status=OrderStatus.placed,
    )
    item = OrderItem(
        id=uuid.uuid4(), order_id=order.id, product_id=uuid.uuid4(),
        barcode="商品-001", product_name="测试商品", quantity=3,
        unit_price=Decimal("10.00"), subtotal=Decimal("30.00"),
    )
    first_warehouse = Warehouse(id=uuid.uuid4(), name="主仓", status=WarehouseStatus.active, is_default=True)
    second_warehouse = Warehouse(id=uuid.uuid4(), name="备用仓", status=WarehouseStatus.active)
    first_inventory = Inventory(
        id=uuid.uuid4(), product_id=item.product_id, warehouse_id=first_warehouse.id,
        quantity=10, locked=5,
    )
    second_inventory = Inventory(
        id=uuid.uuid4(), product_id=item.product_id, warehouse_id=second_warehouse.id,
        quantity=4, locked=4,
    )
    allocation = OrderInventoryAllocation(
        id=uuid.uuid4(), order_id=order.id, order_item_id=item.id,
        product_id=item.product_id, warehouse_id=first_warehouse.id,
        quantity=3, status=OrderInventoryAllocationStatus.reserved,
    )
    db = QueueDb([
        FakeResult(one=order),
        FakeResult(values=[item]),
        FakeResult(values=[allocation]),
        FakeResult(values=[first_warehouse, second_warehouse]),
        FakeResult(values=[first_inventory, second_inventory]),
    ])

    result = await order_service.get_shipping_options(db, str(order.id))

    assert [option.available_quantity for option in result.items[0].warehouses] == [8, 0]


@pytest.mark.asyncio
async def test_shipping_options_reject_orders_after_stock_out():
    order = Order(
        id=uuid.uuid4(), order_no="ORD1", customer_id=uuid.uuid4(),
        total_amount=Decimal("50.00"), status=OrderStatus.stocked_out,
    )

    with pytest.raises(ValueError, match="已下单或正在发货"):
        await order_service.get_shipping_options(QueueDb([FakeResult(one=order)]), str(order.id))


def test_order_shipping_options_route_is_available():
    routes = {
        (route.path, tuple(sorted(route.methods)))
        for route in app.routes
        if route.path.startswith("/api/v1/orders/")
    }
    assert ("/api/v1/orders/{order_id}/shipping-options", ("GET",)) in routes


def _delivery_employee(*, role=EmployeeRole.delivery, status=EmployeeStatus.active, name="配送员"):
    return Employee(
        id=uuid.uuid4(),
        username=f"employee-{uuid.uuid4().hex[:8]}",
        password_hash="hashed",
        name=name,
        role_assignments=[EmployeeRoleAssignment(role=role)],
        status=status,
    )


def _delivery_order(*, status=OrderStatus.stocked_out, total_amount=Decimal("100.00")):
    return Order(
        id=uuid.uuid4(),
        order_no=f"ORD-{uuid.uuid4().hex[:8]}",
        customer_id=uuid.uuid4(),
        total_amount=total_amount,
        status=status,
    )


def _delivery_record(order, employee, *, status=None):
    from app.models.order_delivery import OrderDelivery, OrderDeliveryStatus

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return OrderDelivery(
        id=uuid.uuid4(),
        order_id=order.id,
        delivery_employee_id=employee.id,
        delivery_employee_name=employee.name,
        status=status or OrderDeliveryStatus.delivering,
        recipient_name="客户联系人",
        recipient_phone="13800000000",
        delivery_address="客户地址",
        assigned_at=now,
        assigned_by_id=employee.id,
        assigned_by_name=employee.name,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_delivery_service_creates_assignment_snapshot_and_event():
    from app.models.order_delivery import OrderDeliveryEvent, OrderDeliveryEventType, OrderDeliveryStatus
    from app.schemas.order import OrderStockOutRequest
    from app.services import order_delivery_service

    operator = _delivery_employee(role=EmployeeRole.admin, name="管理员")
    delivery_employee = _delivery_employee(name="张配送")
    order = _delivery_order()
    request = OrderStockOutRequest(
        delivery_employee_id=str(delivery_employee.id),
        recipient_name="李四",
        recipient_phone="13900000000",
        delivery_address="临时收货地址",
    )
    db = QueueDb([FakeResult(one=delivery_employee)])

    delivery = await order_delivery_service.create_order_delivery(
        db, order, request, operator
    )

    assert delivery.order_id == order.id
    assert delivery.status == OrderDeliveryStatus.delivering
    assert delivery.delivery_employee_id == delivery_employee.id
    assert delivery.delivery_employee_name == "张配送"
    assert delivery.assigned_by_id == operator.id
    assert delivery.assigned_by_name == "管理员"
    assert delivery.recipient_name == "李四"
    assert delivery.recipient_phone == "13900000000"
    assert delivery.delivery_address == "临时收货地址"
    assert delivery.assigned_at.tzinfo is None
    event = next(item for item in db.added if isinstance(item, OrderDeliveryEvent))
    assert event.event_type == OrderDeliveryEventType.assigned
    assert event.to_employee_id == delivery_employee.id
    assert event.to_employee_name == "张配送"
    assert event.operator_id == operator.id
    assert event.operator_name == "管理员"
    assert db.flushed is True


@pytest.mark.asyncio
async def test_delivery_active_employee_lookup_locks_selected_row():
    from app.services import order_delivery_service

    employee = _delivery_employee()
    db = QueueDb([FakeResult(one=employee)])

    assert await order_delivery_service._active_employee(db, employee.id) is employee
    assert "FOR UPDATE" in db.statements[0]


@pytest.mark.asyncio
@pytest.mark.parametrize("selected_employee", [None, _delivery_employee(status=EmployeeStatus.disabled)])
async def test_delivery_service_rejects_missing_or_disabled_employee(selected_employee):
    from app.schemas.order import OrderStockOutRequest
    from app.services import order_delivery_service

    operator = _delivery_employee(role=EmployeeRole.admin)
    order = _delivery_order()
    selected_id = selected_employee.id if selected_employee else uuid.uuid4()
    request = OrderStockOutRequest(
        delivery_employee_id=str(selected_id),
        recipient_name="李四",
        recipient_phone="13900000000",
        delivery_address="客户地址",
    )

    with pytest.raises(ValueError, match="配送员不存在或已禁用"):
        await order_delivery_service.create_order_delivery(
            QueueDb([FakeResult(one=selected_employee)]), order, request, operator
        )


@pytest.mark.asyncio
async def test_delivery_permission_and_reassignment_rules():
    from app.models.order_delivery import OrderDeliveryEvent, OrderDeliveryEventType
    from app.schemas.order_delivery import OrderDeliveryReassignRequest
    from app.services import order_delivery_service

    owner = _delivery_employee(name="原配送员")
    other = _delivery_employee(name="其他员工")
    admin = _delivery_employee(role=EmployeeRole.admin, name="管理员")
    target = _delivery_employee(name="新配送员")
    order = _delivery_order()
    delivery = _delivery_record(order, owner)

    with pytest.raises(PermissionError, match="管理员"):
        await order_delivery_service.reassign_delivery(
            QueueDb([]),
            str(delivery.id),
            OrderDeliveryReassignRequest(delivery_employee_id=str(target.id)),
            other,
        )

    db = QueueDb([FakeResult(one=(delivery, order)), FakeResult(one=target)])
    result = await order_delivery_service.reassign_delivery(
        db,
        str(delivery.id),
        OrderDeliveryReassignRequest(
            delivery_employee_id=str(target.id), reason="临时调整"
        ),
        admin,
    )

    assert result.delivery_employee_id == target.id
    assert result.delivery_employee_name == "新配送员"
    event = next(item for item in db.added if isinstance(item, OrderDeliveryEvent))
    assert event.event_type == OrderDeliveryEventType.reassigned
    assert event.from_employee_id == owner.id
    assert event.from_employee_name == "原配送员"
    assert event.to_employee_id == target.id
    assert event.to_employee_name == "新配送员"
    assert event.remark == "临时调整"

    same_target_delivery = _delivery_record(order, target)
    same_target_db = QueueDb(
        [FakeResult(one=(same_target_delivery, order)), FakeResult(one=target)]
    )
    with pytest.raises(ValueError, match="不能与当前配送员相同"):
        await order_delivery_service.reassign_delivery(
            same_target_db,
            str(same_target_delivery.id),
            OrderDeliveryReassignRequest(delivery_employee_id=str(target.id)),
            admin,
        )


@pytest.mark.asyncio
async def test_delivery_service_locked_row_query_uses_one_or_none():
    from app.models.order_delivery import OrderDeliveryExceptionType
    from app.schemas.order_delivery import OrderDeliveryExceptionRequest
    from app.services import order_delivery_service

    owner = _delivery_employee(name="配送员")
    order = _delivery_order()
    delivery = _delivery_record(order, owner)
    db = QueueDb([StrictRowResult(one=(delivery, order))])

    result = await order_delivery_service.record_delivery_exception(
        db,
        str(delivery.id),
        OrderDeliveryExceptionRequest(
            exception_type=OrderDeliveryExceptionType.customer_absent,
            remark="客户暂时不在",
        ),
        owner,
    )

    assert result is delivery


@pytest.mark.asyncio
async def test_delivery_permission_allows_owner_or_admin_to_record_repeated_exceptions():
    from app.models.order_delivery import OrderDeliveryEvent, OrderDeliveryEventType, OrderDeliveryExceptionType
    from app.schemas.order_delivery import OrderDeliveryExceptionRequest
    from app.services import order_delivery_service

    owner = _delivery_employee(name="配送员")
    other = _delivery_employee(name="无关员工")
    admin = _delivery_employee(role=EmployeeRole.admin, name="管理员")
    order = _delivery_order()
    delivery = _delivery_record(order, owner)
    request = OrderDeliveryExceptionRequest(
        exception_type=OrderDeliveryExceptionType.customer_absent,
        remark="客户暂时不在",
    )

    with pytest.raises(PermissionError, match="无权处理"):
        await order_delivery_service.record_delivery_exception(
            QueueDb([FakeResult(one=(delivery, order))]),
            str(delivery.id),
            request,
            other,
        )

    db = QueueDb(
        [FakeResult(one=(delivery, order)), FakeResult(one=(delivery, order))]
    )
    await order_delivery_service.record_delivery_exception(
        db, str(delivery.id), request, owner
    )
    await order_delivery_service.record_delivery_exception(
        db, str(delivery.id), request, admin
    )

    events = [item for item in db.added if isinstance(item, OrderDeliveryEvent)]
    assert [event.event_type for event in events] == [
        OrderDeliveryEventType.exception,
        OrderDeliveryEventType.exception,
    ]
    assert [event.operator_name for event in events] == ["配送员", "管理员"]
    assert all(event.exception_type == OrderDeliveryExceptionType.customer_absent for event in events)


@pytest.mark.asyncio
async def test_delivery_service_signs_once_and_advances_order():
    from app.models.order_delivery import OrderDeliveryEvent, OrderDeliveryEventType, OrderDeliveryStatus
    from app.schemas.order_delivery import OrderDeliverySignRequest
    from app.services import order_delivery_service

    owner = _delivery_employee(name="配送员")
    order = _delivery_order()
    delivery = _delivery_record(order, owner)
    db = QueueDb([FakeResult(one=(delivery, order)), FakeResult(one=order)])

    result = await order_delivery_service.sign_delivery(
        db,
        str(delivery.id),
        OrderDeliverySignRequest(
            signer_name="王老板",
            proof_image_urls=["https://example.com/proof.jpg"],
            remark="货物完好",
        ),
        owner,
    )

    assert result.status == OrderDeliveryStatus.signed
    assert result.signer_name == "王老板"
    assert result.proof_image_urls == ["https://example.com/proof.jpg"]
    assert result.sign_remark == "货物完好"
    assert result.signed_by_id == owner.id
    assert result.signed_by_name == "配送员"
    assert result.signed_at.tzinfo is None
    assert order.status == OrderStatus.delivered_unpaid
    assert order.delivered_by == owner.username
    delivered_log = next(
        item
        for item in db.added
        if item.__class__.__name__ == "OrderStatusLog"
    )
    assert delivered_log.operator == owner.username
    signed_events = [
        item
        for item in db.added
        if isinstance(item, OrderDeliveryEvent)
        and item.event_type == OrderDeliveryEventType.signed
    ]
    assert len(signed_events) == 1
    assert signed_events[0].remark == "货物完好"

    with pytest.raises(ValueError, match="配送记录状态无效"):
        await order_delivery_service.sign_delivery(
            QueueDb([FakeResult(one=(delivery, order))]),
            str(delivery.id),
            OrderDeliverySignRequest(signer_name="重复签收"),
            owner,
        )


@pytest.mark.asyncio
async def test_delivery_sign_can_collect_payment_and_complete_order():
    from app.models.order_delivery import OrderDeliveryStatus
    from app.schemas.order_delivery import OrderDeliverySignRequest
    from app.services import order_delivery_service

    owner = _delivery_employee(name="配送员")
    order = _delivery_order(total_amount=Decimal("20010.00"))
    delivery = _delivery_record(order, owner)
    customer = Customer(
        id=order.customer_id,
        name="客户",
        contact_name="联系人",
        contact_phone="13800000000",
        level_id=uuid.uuid4(),
    )
    customer.total_spent = Decimal("100.00")
    customer.order_count = 1
    db = QueueDb([
        FakeResult(one=(delivery, order)),
        FakeResult(one=order),
        FakeResult(one=order),
        FakeResult(one=customer),
    ])

    result = await order_delivery_service.sign_delivery(
        db,
        str(delivery.id),
        OrderDeliverySignRequest(
            signer_name="王老板",
            proof_image_urls=["https://example.com/sign.jpg"],
            remark="货物完好并已收款",
            collect_payment=True,
            paid_amount="20000.00",
            payment_proof_image_urls=["https://example.com/payment.jpg"],
        ),
        owner,
    )

    assert result.status == OrderDeliveryStatus.signed
    assert order.status == OrderStatus.completed
    assert order.paid_amount == Decimal("20000.00")
    assert order.payment_proof_image_urls == ["https://example.com/payment.jpg"]
    assert order.paid_by == owner.username
    assert customer.total_spent == Decimal("20100.00")
    assert [item.to_status for item in db.added if isinstance(item, OrderStatusLog)] == [
        OrderStatus.delivered_unpaid,
        OrderStatus.completed,
    ]


@pytest.mark.asyncio
async def test_current_delivery_group_aggregates_exact_metrics_and_rows():
    from app.services import order_delivery_service

    admin = _delivery_employee(role=EmployeeRole.admin)
    employee = _delivery_employee(name="配送员甲")
    first_delivery_id = uuid.uuid4()
    second_delivery_id = uuid.uuid4()
    first_order_id = uuid.uuid4()
    second_order_id = uuid.uuid4()
    first_customer_id = uuid.uuid4()
    second_customer_id = uuid.uuid4()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db = QueueDb(
        [
            FakeResult(
                mappings=[
                    {
                        "delivery_employee_id": employee.id,
                        "delivery_employee_name": employee.name,
                        "order_count": 2,
                        "customer_count": 2,
                        "product_quantity": 7,
                        "total_amount": Decimal("180.00"),
                        "exception_order_count": 1,
                    }
                ]
            ),
            FakeResult(
                mappings=[
                    {
                        "id": first_delivery_id,
                        "status": "delivering",
                        "delivery_employee_id": employee.id,
                        "delivery_employee_name": employee.name,
                        "recipient_name": "客户甲联系人",
                        "recipient_phone": "13800000001",
                        "delivery_address": "地址甲",
                        "assigned_at": now,
                        "signer_name": None,
                        "signed_at": None,
                        "order_id": first_order_id,
                        "order_no": "ORD-001",
                        "customer_id": first_customer_id,
                        "customer_name": "客户甲",
                        "total_amount": Decimal("100.00"),
                        "product_quantity": 3,
                        "has_exception": True,
                        "latest_exception_type": "customer_absent",
                        "latest_exception_remark": "客户临时外出",
                        "latest_exception_occurred_at": now,
                    },
                    {
                        "id": second_delivery_id,
                        "status": "delivering",
                        "delivery_employee_id": employee.id,
                        "delivery_employee_name": employee.name,
                        "recipient_name": "客户乙联系人",
                        "recipient_phone": "13800000002",
                        "delivery_address": "地址乙",
                        "assigned_at": now,
                        "signer_name": None,
                        "signed_at": None,
                        "order_id": second_order_id,
                        "order_no": "ORD-002",
                        "customer_id": second_customer_id,
                        "customer_name": "客户乙",
                        "total_amount": Decimal("80.00"),
                        "product_quantity": 4,
                        "has_exception": False,
                    },
                ]
            ),
        ]
    )

    groups = await order_delivery_service.list_current_deliveries(
        db, admin, order_keyword="ORD", customer_keyword="客户", has_exception=None
    )

    assert len(groups) == 1
    group = groups[0]
    assert group.order_count == 2
    assert group.customer_count == 2
    assert group.product_quantity == 7
    assert Decimal(str(group.total_amount)) == Decimal("180.00")
    assert group.exception_order_count == 1
    assert [item.order_no for item in group.deliveries] == ["ORD-001", "ORD-002"]
    assert [item.has_exception for item in group.deliveries] == [True, False]
    assert group.deliveries[0].latest_exception.exception_type.value == "customer_absent"
    assert group.deliveries[0].latest_exception.remark == "客户临时外出"
    assert group.deliveries[0].latest_exception.occurred_at == now
    assert group.deliveries[1].latest_exception is None
    assert len({item.id for item in group.deliveries}) == 2
    assert "count(distinct" in db.statements[0].lower()
    aggregate_sql = db.statements[0].lower()
    group_by_sql = aggregate_sql.rsplit("group by", 1)[1].split("order by", 1)[0]
    assert "order_deliveries.delivery_employee_id" in group_by_sql
    assert "row_number() over" in db.statements[1].lower()
    assert "order_deliveries.delivery_employee_name" not in group_by_sql
    assert "employees" in aggregate_sql


@pytest.mark.asyncio
async def test_current_delivery_group_scopes_normal_employee():
    from app.services import order_delivery_service

    employee = _delivery_employee()
    requested_employee_id = uuid.uuid4()
    db = QueueDb([FakeResult(mappings=[]), FakeResult(mappings=[])])

    await order_delivery_service.list_current_deliveries(
        db, employee, employee_id=str(requested_employee_id)
    )

    assert all(employee.id in params.values() for params in db.statement_params)
    assert all(requested_employee_id not in params.values() for params in db.statement_params)


@pytest.mark.asyncio
async def test_delivery_archive_filters_and_role_scope():
    from app.services import order_delivery_service

    employee = _delivery_employee(name="配送员")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    delivery_id = uuid.uuid4()
    order_id = uuid.uuid4()
    customer_id = uuid.uuid4()
    db = QueueDb(
        [
            FakeResult(scalar=1),
            FakeResult(
                mappings=[
                    {
                        "id": delivery_id,
                        "status": "signed",
                        "delivery_employee_id": employee.id,
                        "delivery_employee_name": employee.name,
                        "recipient_name": "联系人",
                        "recipient_phone": "13800000000",
                        "delivery_address": "客户地址",
                        "assigned_at": now,
                        "signer_name": "签收人",
                        "signed_at": now,
                        "order_id": order_id,
                        "order_no": "ORD-ARCHIVE-001",
                        "customer_id": customer_id,
                        "customer_name": "客户甲",
                        "total_amount": Decimal("100.00"),
                        "product_quantity": 2,
                        "proof_image_urls": None,
                        "sign_remark": "已签收",
                    }
                ]
            ),
        ]
    )

    page = await order_delivery_service.list_delivery_archive(
        db,
        employee,
        page=2,
        page_size=10,
        employee_id=str(uuid.uuid4()),
        order_keyword="ARCHIVE",
        customer_keyword="客户",
        signer_keyword="签收",
        signed_from=now,
        signed_to=now,
    )

    assert page.total == 1
    assert page.page == 2
    assert page.page_size == 10
    assert page.items[0].proof_image_urls == []
    assert all(employee.id in params.values() for params in db.statement_params)
    assert all("order_deliveries.status" in statement for statement in db.statements)
    assert "OFFSET" in db.statements[1] and "LIMIT" in db.statements[1]


@pytest.mark.asyncio
async def test_delivery_archive_date_filters_use_inclusive_end_day_boundary():
    from app.services import order_delivery_service

    admin = _delivery_employee(role=EmployeeRole.admin, name="管理员")
    db = QueueDb([FakeResult(scalar=0), FakeResult(mappings=[])])

    await order_delivery_service.list_delivery_archive(
        db,
        admin,
        signed_from=date(2026, 7, 19),
        signed_to=date(2026, 7, 19),
    )

    start_of_day_utc = datetime(2026, 7, 18, 16)
    next_day_utc = datetime(2026, 7, 19, 16)
    for statement, params in zip(db.statements, db.statement_params):
        assert "order_deliveries.signed_at >=" in statement
        assert "order_deliveries.signed_at <" in statement
        assert "order_deliveries.signed_at <=" not in statement
        assert start_of_day_utc in params.values()
        assert next_day_utc in params.values()


@pytest.mark.asyncio
async def test_delivery_archive_service_rejects_inverted_date_range():
    from app.services import order_delivery_service

    admin = _delivery_employee(role=EmployeeRole.admin, name="管理员")

    with pytest.raises(ValueError, match="签收开始日期不能晚于结束日期"):
        await order_delivery_service.list_delivery_archive(
            QueueDb(),
            admin,
            signed_from=date(2026, 7, 20),
            signed_to=date(2026, 7, 19),
        )


@pytest.mark.asyncio
async def test_delivery_service_detail_uses_unique_mapping_lookup():
    from app.services import order_delivery_service

    owner = _delivery_employee(name="配送员")
    order = _delivery_order()
    delivery = _delivery_record(order, owner)
    detail_row = {
        **{
            column.name: getattr(delivery, column.name)
            for column in delivery.__table__.columns
        },
        "order_no": order.order_no,
        "customer_id": order.customer_id,
        "customer_name": "客户甲",
        "total_amount": order.total_amount,
        "order_status": order.status,
        "product_quantity": 0,
    }
    db = QueueDb(
        [
            StrictUniqueMappingQueryResult(mappings=[detail_row]),
            FakeResult(values=[]),
            FakeResult(values=[]),
        ]
    )

    result = await order_delivery_service.get_delivery_detail(
        db, str(delivery.id), owner
    )

    assert result.id == str(delivery.id)


@pytest.mark.asyncio
async def test_delivery_service_detail_scopes_owner_and_orders_events():
    from app.models.order_delivery import OrderDeliveryEvent, OrderDeliveryEventType
    from app.services import order_delivery_service

    owner = _delivery_employee(name="配送员")
    other = _delivery_employee(name="其他员工")
    order = _delivery_order()
    delivery = _delivery_record(order, owner)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    assigned = OrderDeliveryEvent(
        id=uuid.uuid4(),
        delivery_id=delivery.id,
        event_type=OrderDeliveryEventType.assigned,
        to_employee_id=owner.id,
        to_employee_name=owner.name,
        operator_id=owner.id,
        operator_name=owner.name,
        created_at=now,
    )
    exception = OrderDeliveryEvent(
        id=uuid.uuid4(),
        delivery_id=delivery.id,
        event_type=OrderDeliveryEventType.exception,
        exception_type="customer_absent",
        operator_id=owner.id,
        operator_name=owner.name,
        created_at=now,
    )
    item = OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        product_id=uuid.uuid4(),
        product_name="测试商品",
        barcode="6900000000001",
        quantity=3,
        unit_price=Decimal("10.00"),
        subtotal=Decimal("30.00"),
    )
    detail_row = {
        **{column.name: getattr(delivery, column.name) for column in delivery.__table__.columns},
        "order_no": order.order_no,
        "customer_id": order.customer_id,
        "customer_name": "客户甲",
        "total_amount": order.total_amount,
        "order_status": order.status,
        "product_quantity": 3,
    }

    with pytest.raises(PermissionError, match="无权查看"):
        await order_delivery_service.get_delivery_detail(
            QueueDb(
                [
                    FakeResult(mappings=[detail_row]),
                    FakeResult(scalar=None),
                ]
            ),
            str(delivery.id),
            other,
        )

    db = QueueDb(
        [
            FakeResult(mappings=[detail_row]),
            FakeResult(values=[assigned, exception]),
            FakeResult(values=[item]),
        ]
    )
    result = await order_delivery_service.get_delivery_detail(
        db, str(delivery.id), owner
    )

    assert [event.event_type for event in result.events] == [
        OrderDeliveryEventType.assigned,
        OrderDeliveryEventType.exception,
    ]
    assert "order_delivery_events.created_at" in db.statements[1]
    assert "order_delivery_events.id" in db.statements[1]
    assert len(result.items) == 1
    assert result.items[0].product_id == str(item.product_id)
    assert result.items[0].product_name == "测试商品"
    assert result.items[0].barcode == "6900000000001"
    assert result.items[0].quantity == 3


@pytest.mark.asyncio
async def test_delivery_permission_allows_signed_historical_assignee_detail():
    from app.models.order_delivery import (
        OrderDeliveryEvent,
        OrderDeliveryEventType,
        OrderDeliveryStatus,
    )
    from app.services import order_delivery_service

    prior_assignee = _delivery_employee(name="原配送员")
    final_assignee = _delivery_employee(name="最终配送员")
    unrelated = _delivery_employee(name="无关员工")
    order = _delivery_order(status=OrderStatus.delivered_unpaid)
    delivery = _delivery_record(
        order, final_assignee, status=OrderDeliveryStatus.signed
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    assigned = OrderDeliveryEvent(
        id=uuid.uuid4(),
        delivery_id=delivery.id,
        event_type=OrderDeliveryEventType.assigned,
        to_employee_id=prior_assignee.id,
        to_employee_name=prior_assignee.name,
        operator_id=final_assignee.id,
        operator_name=final_assignee.name,
        created_at=now,
    )
    reassigned = OrderDeliveryEvent(
        id=uuid.uuid4(),
        delivery_id=delivery.id,
        event_type=OrderDeliveryEventType.reassigned,
        from_employee_id=prior_assignee.id,
        from_employee_name=prior_assignee.name,
        to_employee_id=final_assignee.id,
        to_employee_name=final_assignee.name,
        operator_id=final_assignee.id,
        operator_name=final_assignee.name,
        created_at=now,
    )
    detail_row = {
        **{
            column.name: getattr(delivery, column.name)
            for column in delivery.__table__.columns
        },
        "order_no": order.order_no,
        "customer_id": order.customer_id,
        "customer_name": "客户甲",
        "total_amount": order.total_amount,
        "order_status": order.status,
        "product_quantity": 0,
    }

    allowed_db = QueueDb(
        [
            FakeResult(mappings=[detail_row]),
            FakeResult(one=assigned.id),
            FakeResult(values=[assigned, reassigned]),
            FakeResult(values=[]),
        ]
    )
    result = await order_delivery_service.get_delivery_detail(
        allowed_db, str(delivery.id), prior_assignee
    )
    assert result.delivery_employee_id == str(final_assignee.id)

    with pytest.raises(PermissionError, match="无权查看"):
        await order_delivery_service.get_delivery_detail(
            QueueDb(
                [
                    FakeResult(mappings=[detail_row]),
                    FakeResult(scalar=None),
                ]
            ),
            str(delivery.id),
            unrelated,
        )


def test_access_token_keeps_positional_expiry_compatibility():
    from datetime import timedelta

    from app.core.security import create_access_token, decode_token

    token, _ = create_access_token("legacy-user", "normal", timedelta(minutes=1))
    assert decode_token(token)["sub"] == "legacy-user"


@pytest.mark.asyncio
async def test_refresh_uses_current_employee_claims_for_legacy_refresh_token():
    from app.core.security import create_refresh_token, decode_token
    from app.services.auth_service import refresh_access_token
    from app.schemas.auth import RefreshRequest

    employee = _delivery_employee(role=EmployeeRole.admin, name="已升级员工")
    refresh_token, _ = create_refresh_token(employee.username, "normal")

    class RedisStub:
        async def get(self, key):
            return None

        async def setex(self, key, ttl, value):
            return None

    response = await refresh_access_token(
        QueueDb([FakeResult(one=employee)]),
        RedisStub(),
        RefreshRequest(refresh_token=refresh_token),
    )
    access_claims = decode_token(response.access_token)
    refresh_claims = decode_token(response.refresh_token)
    assert access_claims["role"] == "admin"
    assert access_claims["employee_id"] == str(employee.id)
    assert "employee_id" not in refresh_claims

@pytest.mark.asyncio
async def test_complete_order_rejects_payment_above_net_amount_after_returns():
    customer = Customer(
        id=uuid.uuid4(), name="客户", contact_name="联系人", contact_phone="13800000000", level_id=uuid.uuid4()
    )
    order = Order(
        id=uuid.uuid4(), order_no="ORD-NET", customer_id=customer.id,
        total_amount=Decimal("100.00"), returned_amount=Decimal("40.00"),
        status=OrderStatus.delivered_unpaid,
    )
    db = QueueDb([FakeResult(one=order)])

    with pytest.raises(ValueError, match="实收金额不能超过订单应收金额"):
        await order_service.transition_order(
            db,
            str(order.id),
            OrderStatus.completed,
            "finance-user",
            complete_request=OrderCompleteRequest(
                paid_amount="60.01", payment_proof_image_urls=["https://example.com/payment.jpg"]
            ),
        )
