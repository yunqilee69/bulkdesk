import uuid
import json
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException, Request
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
from app.models.employee import Employee, EmployeeRole, EmployeeStatus
from app.models.order import (
    Order,
    OrderInventoryAllocation,
    OrderInventoryAllocationStatus,
    OrderItem,
    OrderStatus,
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
    OrderItemCreate,
    OrderOut,
    OrderShipmentAllocation,
    OrderShipRequest,
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


class FakeScalarResult:
    def __init__(self, values):
        self._values = values

    def all(self):
        return list(self._values)


class FakeResult:
    def __init__(self, one=None, values=None, scalar=None):
        self._one = one
        self._values = values or []
        self._scalar = scalar

    def scalar_one_or_none(self):
        return self._one

    def scalar(self):
        return self._scalar

    def scalars(self):
        return FakeScalarResult(self._values)

    def all(self):
        return list(self._values)


class QueueDb:
    def __init__(self, results=None):
        self.results = list(results or [])
        self.added = []
        self.flushed = False
        self.refreshed = []
        self.statements = []

    async def execute(self, statement):
        self.statements.append(str(statement))
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


def test_order_fulfillment_routes_match_state_machine():
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
        "/api/v1/orders/{order_id}/deliver",
        "/api/v1/orders/{order_id}/complete",
        "/api/v1/orders/{order_id}/cancel",
    }


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
        role=EmployeeRole.normal,
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
async def test_stock_out_delivery_and_payment_record_each_operator(monkeypatch):
    order = Order(
        id=uuid.uuid4(),
        order_no="ORD1",
        customer_id=uuid.uuid4(),
        total_amount=Decimal("10.00"),
        status=OrderStatus.shipping,
    )
    db = QueueDb([FakeResult(one=order), FakeResult(one=order), FakeResult(one=order), FakeResult(one=None)])
    deducted = []

    async def deduct_inventory(_db, current_order):
        deducted.append(current_order)

    async def skip_complete(*_args):
        return None

    monkeypatch.setattr(order_service, "_deduct_reserved_inventory", deduct_inventory, raising=False)
    monkeypatch.setattr(order_service, "_complete", skip_complete)

    await order_service.transition_order(db, str(order.id), OrderStatus.stocked_out, "warehouse-user")
    assert deducted == [order]
    assert order.stock_out_by == "warehouse-user"
    assert order.stock_out_at is not None

    await order_service.transition_order(db, str(order.id), OrderStatus.delivered_unpaid, "delivery-user")
    assert order.delivered_by == "delivery-user"
    assert order.delivered_at is not None

    await order_service.transition_order(db, str(order.id), OrderStatus.completed, "cashier-user")
    assert order.paid_by == "cashier-user"
    assert order.paid_at is not None


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
        "product_id": str(uuid.uuid4()),
        "quantity": 1,
        "unit_price": Decimal("10.00"),
        "condition": "normal",
        "return_reason": "客户拒收",
    }
    with pytest.raises(ValidationError, match="入库仓库"):
        ReturnOrderCreate(
            customer_id=str(uuid.uuid4()),
            items=[ReturnOrderItemCreate(**common, should_stock_in=True)],
        )
    with pytest.raises(ValidationError, match="不得保留仓库"):
        ReturnOrderCreate(
            customer_id=str(uuid.uuid4()),
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
    warehouse = Warehouse(id=uuid.uuid4(), name="主仓", status=WarehouseStatus.active)
    inventory = Inventory(
        id=uuid.uuid4(), product_id=first_product.id, warehouse_id=warehouse.id,
        quantity=3, locked=0,
    )
    db = QueueDb([
        FakeResult(one=customer),
        FakeResult(values=[first_product, second_product]),
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
            customer_id=str(customer.id),
            items=[
                ReturnOrderItemCreate(
                    product_id=str(first_product.id), quantity=2, unit_price=30,
                    condition="normal", return_reason="客户多买",
                    should_stock_in=True, warehouse_id=str(warehouse.id),
                ),
                ReturnOrderItemCreate(
                    product_id=str(second_product.id), quantity=1, unit_price=40,
                    condition="expired", return_reason="商品过期", should_stock_in=False,
                ),
            ],
        ),
        operator="return-user",
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
    return_order = ReturnOrder(
        id=uuid.uuid4(), return_no="RET1", customer_id=customer.id,
        total_amount=Decimal("100.00"), status=ReturnOrderStatus.completed,
        operator="return-user", completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
        customer_spent_before=Decimal("50.00"), customer_spent_after=Decimal("0.00"),
        spend_deduction_amount=Decimal("50.00"),
    )
    return_order.items = [
        ReturnOrderItem(
            id=uuid.uuid4(), return_order_id=return_order.id, product_id=product_id,
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
    db = QueueDb([FakeResult(one=return_order), FakeResult(one=customer)])

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
    return_order = ReturnOrder(
        id=uuid.uuid4(), return_no="RET1", customer_id=customer.id,
        total_amount=Decimal("60.00"), status=ReturnOrderStatus.completed,
        operator="return-user", completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
        customer_spent_before=Decimal("50.00"), customer_spent_after=Decimal("0.00"),
        spend_deduction_amount=Decimal("50.00"),
    )
    return_order.items = [
        ReturnOrderItem(
            id=uuid.uuid4(), return_order_id=return_order.id, product_id=product_id,
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
    db = QueueDb([FakeResult(one=return_order), FakeResult(one=customer)])

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
    ])

    result = await order_service._out(db, RelationshipGuardOrder())

    assert result.order_no == "ORD1"
    assert result.customer_name == "测试客户"
    assert result.items == []


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
