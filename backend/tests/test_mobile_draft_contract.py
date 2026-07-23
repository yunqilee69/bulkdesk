import importlib
import inspect
import re
import uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from tests.test_business_logic import (
    CreateOrderDb,
    _extract_create_table_block,
    _normalize_sql_fragment,
)
from app.models.customer import Customer, CustomerLevel, MemberPrice
from app.models.inventory import Inventory
from app.models.order import Order, OrderInventoryAllocation, OrderInventoryAllocationStatus, OrderStatus
from app.models.product import Product
from app.schemas.order import OrderCreate, OrderItemCreate
from app.services import order_service


MIGRATION_PATH = (
    Path(__file__).parents[1]
    / "migrations"
    / "incremental"
    / "2026-07-22_移动端草稿订单.sql"
)


def _require_module(module_name: str):
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError as error:
        pytest.fail(f"missing Phase 0 module {module_name}: {error}")


def test_mobile_order_draft_migration_contract():
    assert MIGRATION_PATH.is_file(), f"missing migration: {MIGRATION_PATH}"

    sql = MIGRATION_PATH.read_text(encoding="utf-8")
    normalized_sql = _normalize_sql_fragment(sql)

    assert normalized_sql.startswith("begin;")
    assert normalized_sql.endswith("commit;")

    table_names = (
        "order_drafts",
        "order_draft_items",
        "order_draft_events",
        "order_draft_submissions",
    )
    for table_name in table_names:
        assert f"create table if not exists {table_name} (" in normalized_sql
        assert _extract_create_table_block(sql, table_name)

    enum_contracts = {
        "order_draft_status": "('editing', 'submitted', 'abandoned')",
        "order_draft_event_type": (
            "('created', 'saved', 'taken_over', 'abandoned', 'submitted', "
            "'submit_failed')"
        ),
    }
    for enum_name, enum_values in enum_contracts.items():
        enum_guard = (
            f"do $$ begin create type {enum_name} as enum {enum_values}; "
            "exception when duplicate_object then null; end $$;"
        )
        assert enum_guard in normalized_sql

    assert normalized_sql.count("when duplicate_object then null;") == 2
    assert "default gen_random_uuid()" not in normalized_sql
    assert "default uuid_generate_v4()" not in normalized_sql
    assert "default uuid_generate()" not in normalized_sql

    mutation_scan_sql = re.sub(r"'(?:''|[^'])*'", "''", sql)
    mutation_scan_sql = re.sub(
        r"\bon\s+delete\s+cascade\b",
        "",
        mutation_scan_sql,
        flags=re.IGNORECASE,
    )
    assert re.search(
        r"\b(drop|alter|insert|update|delete|truncate)\b",
        mutation_scan_sql,
        flags=re.IGNORECASE,
    ) is None

    draft_table_sql = _extract_create_table_block(sql, "order_drafts")
    item_table_sql = _extract_create_table_block(sql, "order_draft_items")
    event_table_sql = _extract_create_table_block(sql, "order_draft_events")
    submission_table_sql = _extract_create_table_block(sql, "order_draft_submissions")

    assert "customer_id uuid not null references customers(id)" in draft_table_sql
    assert "owner_employee_id uuid not null references employees(id)" in draft_table_sql
    assert "status order_draft_status not null default 'editing'" in draft_table_sql
    assert "version integer not null default 1" in draft_table_sql
    assert "submitted_order_id uuid references orders(id)" in draft_table_sql
    assert "constraint ck_order_drafts_version_positive check (version > 0)" in draft_table_sql

    assert "draft_id uuid not null references order_drafts(id) on delete cascade" in item_table_sql
    assert "product_id uuid not null references products(id)" in item_table_sql
    assert "constraint uq_order_draft_items_draft_product unique (draft_id, product_id)" in item_table_sql

    assert "draft_id uuid not null references order_drafts(id) on delete cascade" in event_table_sql
    assert "event_type order_draft_event_type not null" in event_table_sql
    assert "actor_employee_id uuid not null references employees(id)" in event_table_sql
    assert "previous_owner_employee_id uuid references employees(id)" in event_table_sql
    assert "new_owner_employee_id uuid references employees(id)" in event_table_sql
    assert "version integer not null" in event_table_sql

    assert "draft_id uuid not null references order_drafts(id) on delete cascade" in submission_table_sql
    assert "idempotency_key character varying(100) not null" in submission_table_sql
    assert "order_id uuid references orders(id)" in submission_table_sql
    assert "constraint uq_order_draft_submissions_draft_idempotency unique (draft_id, idempotency_key)" in submission_table_sql

    assert (
        "create unique index if not exists "
        "uq_order_drafts_editing_owner_customer on "
        "order_drafts(owner_employee_id, customer_id) where status = 'editing';"
        in normalized_sql
    )

    expected_indexes = (
        "create index if not exists ix_order_drafts_owner_status_updated_at on order_drafts(owner_employee_id, status, updated_at desc);",
        "create index if not exists ix_order_drafts_customer_status_updated_at on order_drafts(customer_id, status, updated_at desc);",
        "create index if not exists ix_order_draft_items_draft_id on order_draft_items(draft_id);",
        "create index if not exists ix_order_draft_events_draft_created_at on order_draft_events(draft_id, created_at desc);",
        "create index if not exists ix_order_draft_submissions_order_id on order_draft_submissions(order_id);",
    )
    for index_sql in expected_indexes:
        assert index_sql in normalized_sql


def test_mobile_order_draft_model_contract():
    draft_models = _require_module("app.models.order_draft")

    expected_tables = {
        "OrderDraft": "order_drafts",
        "OrderDraftItem": "order_draft_items",
        "OrderDraftEvent": "order_draft_events",
        "OrderDraftSubmission": "order_draft_submissions",
    }
    for model_name, table_name in expected_tables.items():
        model = getattr(draft_models, model_name, None)
        assert model is not None, f"missing draft model {model_name}"
        assert model.__tablename__ == table_name

    draft_indexes = {
        index.name: index for index in draft_models.OrderDraft.__table__.indexes
    }
    unique_index = draft_indexes.get("uq_order_drafts_editing_owner_customer")
    assert unique_index is not None
    assert unique_index.unique is True
    assert tuple(unique_index.columns.keys()) == ("owner_employee_id", "customer_id")


def test_draft_save_trims_and_rejects_invalid_items():
    draft_schemas = _require_module("app.schemas.order_draft")
    save_request = draft_schemas.OrderDraftSaveRequest
    item_input = draft_schemas.OrderDraftItemInput

    with pytest.raises(ValidationError, match="同一商品不能重复添加"):
        save_request(
            version=3,
            items=[
                item_input(product_id="product-1", quantity=1),
                item_input(product_id="product-1", quantity=2),
            ],
        )

    with pytest.raises(ValidationError):
        item_input(product_id="product-1", quantity=0)

    request = save_request(
        version=3,
        remark="  客户备注  ",
        items=[item_input(product_id="product-1", quantity=2, remark="  商品备注  ")],
    )
    assert request.remark == "客户备注"
    assert request.items[0].remark == "商品备注"


@pytest.mark.parametrize(
    "request_name",
    (
        "OrderDraftTakeoverRequest",
        "OrderDraftAbandonRequest",
        "OrderDraftSubmitRequest",
    ),
)
def test_draft_action_requests_require_positive_version(request_name: str):
    draft_schemas = _require_module("app.schemas.order_draft")
    request_type = getattr(draft_schemas, request_name)

    with pytest.raises(ValidationError):
        request_type(version=0)


def test_draft_output_serializes_uuids_and_enums():
    draft_models = _require_module("app.models.order_draft")
    draft_schemas = _require_module("app.schemas.order_draft")
    draft_id = uuid.uuid4()
    customer_id = uuid.uuid4()
    owner_employee_id = uuid.uuid4()

    draft = draft_schemas.OrderDraftOut(
        id=draft_id,
        customer_id=customer_id,
        owner_employee_id=owner_employee_id,
        status=draft_models.OrderDraftStatus.editing,
        remark=None,
        version=1,
        submitted_order_id=None,
        abandoned_at=None,
        created_at=datetime(2026, 7, 22, 9, 0, 0),
        updated_at=datetime(2026, 7, 22, 9, 0, 0),
    )

    assert draft.id == str(draft_id)
    assert draft.customer_id == str(customer_id)
    assert draft.owner_employee_id == str(owner_employee_id)
    assert draft.model_dump(mode="json")["status"] == "editing"


class _TransactionBoundaryCreateOrderDb(CreateOrderDb):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.commit_calls = 0
        self.rollback_calls = 0

    async def commit(self):
        self.commit_calls += 1

    async def rollback(self):
        self.rollback_calls += 1


def _create_placed_order_fixture(inventory_quantities: list[int]):
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
    inventories = [
        Inventory(
            id=uuid.uuid4(),
            product_id=product.id,
            warehouse_id=uuid.uuid4(),
            quantity=quantity,
            locked=0,
        )
        for quantity in inventory_quantities
    ]
    member_price = MemberPrice(
        id=uuid.uuid4(),
        product_id=product.id,
        level_id=level_id,
        price=Decimal("76.50"),
    )
    return customer, level, product, inventories, member_price


@pytest.mark.asyncio
async def test_create_placed_order_uses_server_price_allocates_and_leaves_transaction_open():
    customer, level, product, inventories, member_price = _create_placed_order_fixture(
        [2, 3]
    )
    db = _TransactionBoundaryCreateOrderDb(
        customer, inventories, product, level, member_price
    )

    order = await order_service.create_placed_order(
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
    assert order.status == OrderStatus.placed
    assert order.total_amount == Decimal("382.50")
    assert [inventory.locked for inventory in inventories] == [2, 3]
    assert [
        (allocation.warehouse_id, allocation.quantity, allocation.status)
        for allocation in allocations
    ] == [
        (inventories[0].warehouse_id, 2, OrderInventoryAllocationStatus.reserved),
        (inventories[1].warehouse_id, 3, OrderInventoryAllocationStatus.reserved),
    ]
    assert db.commit_calls == 0
    assert db.rollback_calls == 0
    assert any("FOR UPDATE" in statement for statement in db.statements)


@pytest.mark.asyncio
async def test_create_placed_order_does_not_lock_partial_inventory_when_insufficient():
    customer, level, product, inventories, member_price = _create_placed_order_fixture(
        [2, 1]
    )
    db = _TransactionBoundaryCreateOrderDb(
        customer, inventories, product, level, member_price
    )

    with pytest.raises(ValueError, match="可用库存不足"):
        await order_service.create_placed_order(
            db,
            OrderCreate(
                customer_id=str(customer.id),
                items=[OrderItemCreate(product_id=str(product.id), quantity=4)],
            ),
            operator="admin",
        )

    assert [inventory.locked for inventory in inventories] == [0, 0]
    assert not any(isinstance(item, Order) for item in db.added)
    assert db.commit_calls == 0
    assert db.rollback_calls == 0


def test_order_draft_service_exports_transactional_operations():
    draft_service = _require_module("app.services.order_draft_service")

    for function_name in (
        "get_or_create_draft",
        "list_available_drafts",
        "list_my_drafts",
        "get_draft",
        "save_draft",
        "take_over_draft",
        "abandon_draft",
        "submit_draft",
    ):
        assert callable(getattr(draft_service, function_name, None))

    source = inspect.getsource(draft_service)
    assert "with_for_update" in source
    assert "OrderDraftSubmission" in source
    assert "create_placed_order" in source
    assert "submit_failed" in source
    assert ".commit(" not in source
    assert ".rollback(" not in source


def test_order_draft_router_contract_and_idempotency_header():
    order_draft_api = _require_module("app.api.v1.order_draft")
    paths = {route.path for route in order_draft_api.router.routes}

    assert "/" in paths
    assert "/available" in paths
    assert "/{draft_id}" in paths
    assert "/{draft_id}/takeover" in paths
    assert "/{draft_id}/abandon" in paths
    assert "/{draft_id}/submit" in paths

    submit_route = next(
        route
        for route in order_draft_api.router.routes
        if route.path == "/{draft_id}/submit"
    )
    assert "idempotency_key" in inspect.signature(submit_route.endpoint).parameters


def test_order_draft_router_is_registered():
    router_module = _require_module("app.api.v1.router")
    registered_paths = {route.path for route in router_module.api_router.routes}
    assert any(path.startswith("/api/v1/order-drafts") for path in registered_paths)
