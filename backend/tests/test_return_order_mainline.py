import uuid
from datetime import datetime
from decimal import Decimal

import pytest

from app.models.customer import Customer
from app.models.inventory import Inventory, Warehouse, WarehouseStatus
from app.models.order import Order, OrderItem, OrderStatus
from app.models.order_delivery import OrderDelivery, OrderDeliveryStatus
from app.models.product import Product, ProductStatus
from app.models.return_order import (
    ReturnOrder,
    ReturnOrderItem,
    ReturnOrderStatus,
    ReturnProductCondition,
)
from app.schemas.return_order import ReturnOrderCreate, ReturnOrderItemCreate
from app.services import return_order_service


class FakeScalars:
    def __init__(self, values):
        self.values = values

    def all(self):
        return list(self.values)


class FakeResult:
    def __init__(self, *, one=None, values=None):
        self.one = one
        self.values = values or []

    def one_or_none(self):
        return self.one

    def scalar_one_or_none(self):
        return self.one

    def scalars(self):
        return FakeScalars(self.values)

    def all(self):
        return list(self.values)


class QueueDb:
    def __init__(self, results):
        self.results = list(results)
        self.added = []
        self.statements = []

    async def execute(self, statement):
        self.statements.append(str(statement))
        if not self.results:
            raise AssertionError(f"Unexpected query: {statement}")
        return self.results.pop(0)

    def add(self, object_):
        self.added.append(object_)

    async def flush(self):
        for object_ in self.added:
            if getattr(object_, "id", None) is None:
                object_.id = uuid.uuid4()


def _customer() -> Customer:
    return Customer(
        id=uuid.uuid4(),
        name="退货客户",
        contact_name="联系人",
        contact_phone="13800000001",
        level_id=uuid.uuid4(),
        total_spent=Decimal("100.00"),
        order_count=2,
    )


def _delivery(order: Order, employee_id: uuid.UUID) -> OrderDelivery:
    return OrderDelivery(
        id=uuid.uuid4(),
        order_id=order.id,
        delivery_employee_id=employee_id,
        delivery_employee_name="配送员",
        status=OrderDeliveryStatus.delivering,
        recipient_name="收货人",
        recipient_phone="13800000000",
        delivery_address="测试地址",
        assigned_at=datetime(2026, 7, 20),
        assigned_by_id=uuid.uuid4(),
        assigned_by_name="管理员",
    )


def _source_item(order: Order, product: Product) -> OrderItem:
    return OrderItem(
        id=uuid.uuid4(),
        order_id=order.id,
        product_id=product.id,
        product_name="来源商品快照",
        barcode="6900000000001",
        quantity=4,
        unit_price=Decimal("10.00"),
        subtotal=Decimal("40.00"),
    )


def test_return_models_track_delivery_and_source_order_item():
    assert "handling_delivery_id" in ReturnOrder.__table__.columns
    assert "source_order_item_id" in ReturnOrderItem.__table__.columns
    handling_target = next(iter(ReturnOrder.__table__.c.handling_delivery_id.foreign_keys))
    source_target = next(iter(ReturnOrderItem.__table__.c.source_order_item_id.foreign_keys))
    assert handling_target.target_fullname == "order_deliveries.id"
    assert source_target.target_fullname == "order_items.id"


def test_return_create_requires_delivery_and_source_item_not_client_price_data():
    source_item_id = str(uuid.uuid4())
    request = ReturnOrderCreate(
        handling_delivery_id=str(uuid.uuid4()),
        items=[
            ReturnOrderItemCreate(
                source_order_item_id=source_item_id,
                quantity=1,
                condition=ReturnProductCondition.normal,
                return_reason="客户拒收",
            )
        ],
    )

    assert request.items[0].source_order_item_id == source_item_id


@pytest.mark.asyncio
async def test_create_return_derives_source_data_and_updates_order_and_completed_customer(
    monkeypatch,
):
    customer = _customer()
    employee_id = uuid.uuid4()
    handling_order = Order(
        id=uuid.uuid4(),
        order_no="ORD-HANDLING",
        customer_id=customer.id,
        total_amount=Decimal("30.00"),
        returned_amount=Decimal("0.00"),
        status=OrderStatus.stocked_out,
    )
    source_order = Order(
        id=uuid.uuid4(),
        order_no="ORD-SOURCE",
        customer_id=customer.id,
        total_amount=Decimal("40.00"),
        returned_amount=Decimal("0.00"),
        status=OrderStatus.completed,
    )
    product = Product(
        id=uuid.uuid4(),
        name="已停售来源商品",
        barcode="6900000000999",
        category_id=uuid.uuid4(),
        unit="件",
        standard_price=Decimal("20.00"),
        cost_price=Decimal("8.00"),
        status=ProductStatus.disabled,
    )
    source_item = _source_item(source_order, product)
    warehouse = Warehouse(id=uuid.uuid4(), name="主仓", status=WarehouseStatus.active)
    inventory = Inventory(
        id=uuid.uuid4(),
        product_id=product.id,
        warehouse_id=warehouse.id,
        quantity=3,
        locked=0,
    )
    delivery = _delivery(handling_order, employee_id)
    db = QueueDb(
        [
            FakeResult(one=(delivery, handling_order)),
            FakeResult(one=customer),
            FakeResult(values=[(source_item, source_order)]),
            FakeResult(values=[]),
            FakeResult(values=[warehouse.id]),
        ]
    )

    async def fixed_return_no(_db):
        return "RET20260720000001"

    async def fixed_movement_no(_db, _prefix):
        return "CRI20260720000001"

    async def get_inventory(_db, product_id, warehouse_id):
        assert product_id == product.id
        assert warehouse_id == warehouse.id
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
                    source_order_item_id=str(source_item.id),
                    quantity=2,
                    condition=ReturnProductCondition.normal,
                    return_reason="客户拒收",
                    should_stock_in=True,
                    warehouse_id=str(warehouse.id),
                )
            ],
        ),
        operator_id=employee_id,
        operator_name="配送员",
    )

    return_item = next(item for item in db.added if isinstance(item, ReturnOrderItem))
    assert result.status == ReturnOrderStatus.completed
    assert result.handling_delivery_id == delivery.id
    assert return_item.source_order_item_id == source_item.id
    assert return_item.product_id == source_item.product_id
    assert return_item.product_name == source_item.product_name
    assert return_item.barcode == source_item.barcode
    assert return_item.unit_price == Decimal("10.00")
    assert result.total_amount == Decimal("20.00")
    assert source_order.returned_amount == Decimal("20.00")
    assert source_order.net_amount == Decimal("20.00")
    assert customer.total_spent == Decimal("80.00")
    assert inventory.quantity == 5
    assert all("FOR UPDATE" in statement for statement in db.statements[:3])


@pytest.mark.asyncio
async def test_create_return_rejects_quantity_already_completed_for_source_item():
    customer = _customer()
    employee_id = uuid.uuid4()
    handling_order = Order(
        id=uuid.uuid4(), order_no="ORD-HANDLING", customer_id=customer.id,
        total_amount=Decimal("10.00"), returned_amount=Decimal("0.00"),
        status=OrderStatus.stocked_out,
    )
    source_order = Order(
        id=uuid.uuid4(), order_no="ORD-SOURCE", customer_id=customer.id,
        total_amount=Decimal("40.00"), returned_amount=Decimal("30.00"),
        status=OrderStatus.completed,
    )
    product = Product(
        id=uuid.uuid4(), name="商品", barcode="6900000000002", category_id=uuid.uuid4(),
        unit="件", standard_price=Decimal("10.00"), cost_price=Decimal("5.00"),
    )
    source_item = _source_item(source_order, product)
    db = QueueDb([
        FakeResult(one=(_delivery(handling_order, employee_id), handling_order)),
        FakeResult(one=customer),
        FakeResult(values=[(source_item, source_order)]),
        FakeResult(values=[(source_item.id, 3)]),
    ])

    with pytest.raises(ValueError, match="可退数量不足"):
        await return_order_service.create_return_order(
            db,
            ReturnOrderCreate(
                handling_delivery_id=str(db.results[0].one[0].id),
                items=[
                    ReturnOrderItemCreate(
                        source_order_item_id=str(source_item.id),
                        quantity=2,
                        return_reason="客户拒收",
                    )
                ],
            ),
            operator_id=employee_id,
            operator_name="配送员",
        )


@pytest.mark.asyncio
async def test_void_return_restores_inventory_source_order_and_completed_customer(
    monkeypatch,
):
    customer = _customer()
    customer.total_spent = Decimal("80.00")
    source_order = Order(
        id=uuid.uuid4(),
        order_no="ORD-SOURCE",
        customer_id=customer.id,
        total_amount=Decimal("40.00"),
        returned_amount=Decimal("20.00"),
        status=OrderStatus.completed,
    )
    product = Product(
        id=uuid.uuid4(), name="来源商品", barcode="6900000000003", category_id=uuid.uuid4(),
        unit="件", standard_price=Decimal("10.00"), cost_price=Decimal("5.00"),
    )
    source_item = _source_item(source_order, product)
    warehouse_id = uuid.uuid4()
    return_order = ReturnOrder(
        id=uuid.uuid4(),
        return_no="RET1",
        customer_id=customer.id,
        handling_delivery_id=uuid.uuid4(),
        total_amount=Decimal("20.00"),
        status=ReturnOrderStatus.completed,
        operator="配送员",
        completed_at=datetime(2026, 7, 20),
        customer_spent_before=Decimal("100.00"),
        customer_spent_after=Decimal("80.00"),
        spend_deduction_amount=Decimal("20.00"),
    )
    return_order.items = [
        ReturnOrderItem(
            id=uuid.uuid4(),
            return_order_id=return_order.id,
            source_order_item_id=source_item.id,
            product_id=product.id,
            product_name=source_item.product_name,
            barcode=source_item.barcode,
            quantity=2,
            unit_price=Decimal("10.00"),
            subtotal=Decimal("20.00"),
            condition=ReturnProductCondition.normal,
            return_reason="客户拒收",
            should_stock_in=True,
            warehouse_id=warehouse_id,
        )
    ]
    inventory = Inventory(
        id=uuid.uuid4(), product_id=product.id, warehouse_id=warehouse_id,
        quantity=5, locked=0,
    )
    db = QueueDb([
        FakeResult(one=return_order),
        FakeResult(one=customer),
        FakeResult(values=[(source_item, source_order)]),
    ])

    async def fixed_movement_no(_db, _prefix):
        return "CRV20260720000001"

    async def get_inventory(_db, product_id, target_warehouse_id):
        assert product_id == product.id
        assert target_warehouse_id == warehouse_id
        return inventory

    monkeypatch.setattr(return_order_service, "_movement_no", fixed_movement_no)
    monkeypatch.setattr(return_order_service, "_get_or_create_inventory", get_inventory)

    result = await return_order_service.void_return_order(
        db, str(return_order.id), operator="管理员", void_reason="录入错误"
    )

    assert result.status == ReturnOrderStatus.voided
    assert source_order.returned_amount == Decimal("0.00")
    assert source_order.net_amount == Decimal("40.00")
    assert customer.total_spent == Decimal("100.00")
    assert inventory.quantity == 3
    assert all("FOR UPDATE" in statement for statement in db.statements[:3])
