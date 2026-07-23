import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer, MemberPrice
from app.models.employee import Employee
from app.models.inventory import Inventory, InventoryMovement, InventoryMovementItem, MovementType, Warehouse, WarehouseStatus
from app.models.order import Order, OrderInventoryAllocation, OrderInventoryAllocationStatus, OrderItem, OrderStatus, OrderStatusLog
from app.models.order_delivery import (
    OrderDelivery,
    OrderDeliveryEvent,
    OrderDeliveryEventType,
)
from app.models.product import Product, ProductStatus
from app.schemas.common import PaginatedResponse
from app.schemas.order import OrderCompleteRequest, OrderCreate, OrderDeliveryLatestExceptionOut, OrderDeliveryOrderSummaryOut, OrderInventoryAllocationOut, OrderItemOut, OrderOut, OrderShipRequest, OrderShipmentAllocation, OrderShippingItemOptionsOut, OrderShippingOptionsOut, OrderShippingWarehouseOptionOut, OrderStatusLogOut, OrderStockOutRequest

VALID_TRANSITIONS = {
    OrderStatus.placed: [OrderStatus.shipping, OrderStatus.cancelled],
    OrderStatus.shipping: [OrderStatus.stocked_out, OrderStatus.cancelled],
    OrderStatus.stocked_out: [OrderStatus.delivered_unpaid],
    OrderStatus.delivered_unpaid: [OrderStatus.completed],
    OrderStatus.completed: [],
    OrderStatus.cancelled: [],
}


def _operator_username(operator: str | Employee) -> str:
    return operator.username if isinstance(operator, Employee) else operator

async def generate_order_no(db: AsyncSession) -> str:
    prefix = f"ORD{datetime.now(timezone.utc):%Y%m%d}"
    count = (await db.execute(select(func.count()).select_from(Order).where(Order.order_no.like(f"{prefix}%")))).scalar() or 0
    return f"{prefix}{count + 1:06d}{uuid.uuid4().hex[:6].upper()}"

async def _movement_no(db: AsyncSession, prefix: str) -> str:
    code = f"{prefix}{datetime.now(timezone.utc):%Y%m%d}"
    count = (await db.execute(select(func.count()).select_from(InventoryMovement).where(InventoryMovement.order_no.like(f"{code}%")))).scalar() or 0
    return f"{code}{count + 1:06d}{uuid.uuid4().hex[:6].upper()}"

async def _member_price(db: AsyncSession, product_id: str, level_id: str) -> Optional[Decimal]:
    price = (await db.execute(select(MemberPrice.price).where(MemberPrice.product_id == product_id, MemberPrice.level_id == level_id))).scalar_one_or_none()
    if price is None:
        return None
    return Decimal(str(getattr(price, "price", price)))


def _effective_order_price(
    member_price: Decimal | None,
    standard_price: Decimal,
) -> Decimal:
    return standard_price if member_price is None else member_price

async def create_placed_order(
    db: AsyncSession,
    req: OrderCreate,
    operator: str | Employee,
) -> Order:
    customer = (await db.execute(select(Customer).where(Customer.id == req.customer_id))).scalar_one_or_none()
    if not customer: raise ValueError("客户不存在")
    planned_items = []
    for item in sorted(req.items, key=lambda value: value.product_id):
        product = (await db.execute(select(Product).where(Product.id == item.product_id))).scalar_one_or_none()
        if not product: raise ValueError("商品不存在")
        if product.status == ProductStatus.disabled: raise ValueError("停售商品不能创建订单")
        inventory_rows = (await db.execute(
            select(Inventory, Warehouse.is_default)
            .join(Warehouse, Warehouse.id == Inventory.warehouse_id)
            .where(
                Inventory.product_id == item.product_id,
                Warehouse.status == WarehouseStatus.active,
            )
            .order_by(
                Warehouse.is_default.desc(),
                (Inventory.quantity - Inventory.locked).desc(),
                Inventory.warehouse_id,
            )
            .with_for_update()
        )).all()
        remaining = item.quantity
        allocations = []
        for inventory, _ in inventory_rows:
            available = inventory.quantity - inventory.locked
            if available <= 0:
                continue
            allocated = min(available, remaining)
            allocations.append((inventory, allocated))
            remaining -= allocated
            if remaining == 0:
                break
        product_name = product.short_name or product.name or product.barcode
        if remaining > 0: raise ValueError(f"商品 {product_name} 可用库存不足")
        planned_items.append((item, product, allocations))
    order = Order(order_no=await generate_order_no(db), customer_id=req.customer_id, total_amount=0, status=OrderStatus.placed, remark=req.remark)
    db.add(order); await db.flush()
    total = Decimal("0")
    for item, product, allocations in planned_items:
        unit_price = _effective_order_price(
            await _member_price(db, item.product_id, str(customer.level_id)),
            Decimal(str(product.standard_price)),
        )
        subtotal = unit_price * item.quantity; total += subtotal
        order_item = OrderItem(order_id=order.id, product_id=product.id, product_name=product.name, barcode=product.barcode, quantity=item.quantity, unit_price=unit_price, subtotal=subtotal)
        db.add(order_item); await db.flush()
        for inventory, quantity in allocations:
            inventory.locked += quantity
            db.add(OrderInventoryAllocation(order_id=order.id, order_item_id=order_item.id, product_id=product.id, warehouse_id=inventory.warehouse_id, quantity=quantity, status=OrderInventoryAllocationStatus.reserved))
    order.total_amount = total
    db.add(OrderStatusLog(order_id=order.id, from_status=None, to_status=OrderStatus.placed, operator=_operator_username(operator), remark="订单创建")); await db.flush(); return order


async def create_order(
    db: AsyncSession,
    req: OrderCreate,
    operator: str | Employee,
) -> Order:
    return await create_placed_order(db, req, operator)

async def _items(db: AsyncSession, order_id: str): return (await db.execute(select(OrderItem).where(OrderItem.order_id == order_id))).scalars().all()
async def _allocations(db: AsyncSession, order_id: str): return (await db.execute(select(OrderInventoryAllocation).where(OrderInventoryAllocation.order_id == order_id))).scalars().all()
async def _movement_item(item, quantity, before, after): return InventoryMovementItem(product_id=item.product_id, product_name=item.product_name, barcode=item.barcode, quantity=quantity, before_quantity=before, after_quantity=after)

async def _release(db: AsyncSession, order: Order, restore: bool):
    items = {str(item.id): item for item in await _items(db, order.id)}
    allocations = await _allocations(db, order.id)
    relevant_status = OrderInventoryAllocationStatus.shipped if restore else OrderInventoryAllocationStatus.reserved
    allocations = [allocation for allocation in allocations if allocation.status == relevant_status]
    if not allocations:
        return
    pairs = sorted({(allocation.product_id, allocation.warehouse_id) for allocation in allocations}, key=lambda pair: (str(pair[0]), str(pair[1])))
    inventories = (await db.execute(select(Inventory).where(tuple_(Inventory.product_id, Inventory.warehouse_id).in_(pairs)).order_by(Inventory.product_id, Inventory.warehouse_id).with_for_update())).scalars().all()
    inventory_map = {(str(inventory.product_id), str(inventory.warehouse_id)): inventory for inventory in inventories}
    movement_rows = {}
    for allocation in allocations:
        inventory = inventory_map.get((str(allocation.product_id), str(allocation.warehouse_id)))
        if not inventory: raise ValueError("商品库存不存在")
        before = inventory.quantity
        if restore:
            inventory.quantity += allocation.quantity
            allocation.status = OrderInventoryAllocationStatus.returned
            item = items[str(allocation.order_item_id)]
            movement_rows.setdefault(allocation.warehouse_id, []).append(await _movement_item(item, allocation.quantity, before, inventory.quantity))
        else:
            if inventory.locked < allocation.quantity: raise ValueError("锁定库存不足")
            inventory.locked -= allocation.quantity
            allocation.status = OrderInventoryAllocationStatus.released
    for warehouse_id, rows in movement_rows.items():
        db.add(InventoryMovement(order_no=await _movement_no(db, "OR"), movement_type=MovementType.order_return, warehouse_id=warehouse_id, remark=f"订单 {order.order_no} 取消退回", items=rows))

async def _release_locked_inventory(db: AsyncSession, order: Order, deduct_quantity: bool):
    await _release(db, order, deduct_quantity)

async def _complete(db: AsyncSession, order: Order, paid_amount: Decimal | None = None):
    customer = (await db.execute(select(Customer).where(Customer.id == order.customer_id))).scalar_one_or_none()
    if not customer: return
    actual_paid_amount = paid_amount or order.paid_amount or order.total_amount
    customer.total_spent = Decimal(str(customer.total_spent)) + Decimal(str(actual_paid_amount)); customer.order_count += 1; customer.last_order_at = order.created_at

async def _complete_order(db: AsyncSession, order: Order, paid_amount: Decimal | None = None):
    await _complete(db, order, paid_amount)

async def _reallocate_reserved_inventory(db: AsyncSession, order: Order, req: OrderShipRequest):
    items = await _items(db, order.id)
    item_map = {str(item.id): item for item in items}
    requested_totals = {item_id: 0 for item_id in item_map}
    requested_map = {}
    for allocation in req.allocations:
        item = item_map.get(allocation.order_item_id)
        if item is None:
            raise ValueError("发货明细不属于当前订单")
        requested_totals[allocation.order_item_id] += allocation.quantity
        requested_map[(allocation.order_item_id, allocation.warehouse_id)] = allocation.quantity
    for item_id, item in item_map.items():
        if requested_totals[item_id] != item.quantity:
            raise ValueError(f"商品 {item.product_name} 发货数量必须等于订单数量")

    all_allocations = await _allocations(db, order.id)
    existing = [
        allocation
        for allocation in all_allocations
        if allocation.status == OrderInventoryAllocationStatus.reserved
    ]
    allocation_map = {
        (str(allocation.order_item_id), str(allocation.warehouse_id)): allocation
        for allocation in all_allocations
    }
    inventory_keys = {
        (str(allocation.product_id), str(allocation.warehouse_id))
        for allocation in existing
    }
    inventory_keys.update(
        (str(item_map[item_id].product_id), warehouse_id)
        for item_id, warehouse_id in requested_map
    )
    inventory_pairs = [
        (uuid.UUID(product_id), uuid.UUID(warehouse_id))
        for product_id, warehouse_id in sorted(inventory_keys)
    ]
    inventories = (
        await db.execute(
            select(Inventory)
            .where(tuple_(Inventory.product_id, Inventory.warehouse_id).in_(inventory_pairs))
            .order_by(Inventory.product_id, Inventory.warehouse_id)
            .with_for_update()
        )
    ).scalars().all()
    inventory_map = {
        (str(inventory.product_id), str(inventory.warehouse_id)): inventory
        for inventory in inventories
    }
    old_reserved_by_inventory = {}
    for allocation in existing:
        key = (str(allocation.product_id), str(allocation.warehouse_id))
        old_reserved_by_inventory[key] = old_reserved_by_inventory.get(key, 0) + allocation.quantity

    requested_by_inventory = {}
    for (item_id, warehouse_id), quantity in requested_map.items():
        item = item_map[item_id]
        key = (str(item.product_id), warehouse_id)
        inventory = inventory_map.get(key)
        if inventory is None:
            raise ValueError(f"商品 {item.product_name} 在所选仓库中没有库存")
        requested_by_inventory[key] = requested_by_inventory.get(key, 0) + quantity
    for key, quantity in requested_by_inventory.items():
        inventory = inventory_map[key]
        available_after_release = inventory.quantity - inventory.locked + old_reserved_by_inventory.get(key, 0)
        if available_after_release < quantity:
            raise ValueError("所选仓库可用库存不足")

    for allocation in existing:
        inventory = inventory_map[(str(allocation.product_id), str(allocation.warehouse_id))]
        if inventory.locked < allocation.quantity:
            raise ValueError("锁定库存不足")
        inventory.locked -= allocation.quantity
        allocation.status = OrderInventoryAllocationStatus.released

    for (item_id, warehouse_id), quantity in requested_map.items():
        item = item_map[item_id]
        inventory = inventory_map[(str(item.product_id), warehouse_id)]
        inventory.locked += quantity
        allocation = allocation_map.get((item_id, warehouse_id))
        if allocation is None:
            db.add(
                OrderInventoryAllocation(
                    order_id=order.id,
                    order_item_id=item.id,
                    product_id=item.product_id,
                    warehouse_id=uuid.UUID(warehouse_id),
                    quantity=quantity,
                    status=OrderInventoryAllocationStatus.reserved,
                )
            )
        else:
            allocation.quantity = quantity
            allocation.status = OrderInventoryAllocationStatus.reserved


async def _deduct_reserved_inventory(db: AsyncSession, order: Order):
    items = await _items(db, order.id)
    item_map = {str(item.id): item for item in items}
    allocations = [
        allocation
        for allocation in await _allocations(db, order.id)
        if allocation.status == OrderInventoryAllocationStatus.reserved
    ]
    reserved_totals = {item_id: 0 for item_id in item_map}
    for allocation in allocations:
        item_id = str(allocation.order_item_id)
        if item_id not in item_map:
            raise ValueError("库存分配明细不属于当前订单")
        reserved_totals[item_id] += allocation.quantity
    for item_id, item in item_map.items():
        if reserved_totals[item_id] != item.quantity:
            raise ValueError(f"商品 {item.product_name} 锁定数量必须等于订单数量")

    inventory_pairs = sorted(
        {(allocation.product_id, allocation.warehouse_id) for allocation in allocations},
        key=lambda pair: (str(pair[0]), str(pair[1])),
    )
    inventories = (
        await db.execute(
            select(Inventory)
            .where(tuple_(Inventory.product_id, Inventory.warehouse_id).in_(inventory_pairs))
            .order_by(Inventory.product_id, Inventory.warehouse_id)
            .with_for_update()
        )
    ).scalars().all()
    inventory_map = {
        (str(inventory.product_id), str(inventory.warehouse_id)): inventory
        for inventory in inventories
    }
    movement_rows = {}
    for allocation in allocations:
        inventory = inventory_map.get((str(allocation.product_id), str(allocation.warehouse_id)))
        if inventory is None:
            raise ValueError("商品库存不存在")
        if inventory.locked < allocation.quantity:
            raise ValueError("锁定库存不足")
        if inventory.quantity < allocation.quantity:
            raise ValueError("商品库存不足")
        before = inventory.quantity
        inventory.quantity -= allocation.quantity
        inventory.locked -= allocation.quantity
        allocation.status = OrderInventoryAllocationStatus.shipped
        item = item_map[str(allocation.order_item_id)]
        movement_rows.setdefault(allocation.warehouse_id, []).append(
            await _movement_item(item, allocation.quantity, before, inventory.quantity)
        )
    for warehouse_id, rows in movement_rows.items():
        db.add(
            InventoryMovement(
                order_no=await _movement_no(db, "OD"),
                movement_type=MovementType.order_deduction,
                warehouse_id=warehouse_id,
                remark=f"订单 {order.order_no} 出库",
                items=rows,
            )
        )

async def update_shipping_allocations(db: AsyncSession, order_id: str, req: OrderShipRequest):
    order = (
        await db.execute(select(Order).where(Order.id == order_id).with_for_update())
    ).scalar_one_or_none()
    if not order:
        raise ValueError("订单不存在")
    if order.status != OrderStatus.shipping:
        raise ValueError("只有正在发货的订单可以调整仓库分配")
    await _reallocate_reserved_inventory(db, order, req)
    await db.flush()
    return order

async def get_shipping_options(db: AsyncSession, order_id: str):
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order:
        raise ValueError("订单不存在")
    if order.status not in (OrderStatus.placed, OrderStatus.shipping):
        raise ValueError("只有已下单或正在发货的订单可以选择发货仓库")

    items = await _items(db, order.id)
    allocations = [
        allocation
        for allocation in await _allocations(db, order.id)
        if allocation.status == OrderInventoryAllocationStatus.reserved
    ]
    warehouses = (
        await db.execute(
            select(Warehouse)
            .where(Warehouse.status == WarehouseStatus.active)
            .order_by(Warehouse.is_default.desc(), Warehouse.name, Warehouse.id)
        )
    ).scalars().all()

    product_ids = {item.product_id for item in items}
    warehouse_ids = {warehouse.id for warehouse in warehouses}
    inventories = []
    if product_ids and warehouse_ids:
        inventories = (
            await db.execute(
                select(Inventory).where(
                    Inventory.product_id.in_(product_ids),
                    Inventory.warehouse_id.in_(warehouse_ids),
                )
            )
        ).scalars().all()

    inventory_map = {
        (str(inventory.product_id), str(inventory.warehouse_id)): inventory
        for inventory in inventories
    }
    reserved_map = {
        (str(allocation.order_item_id), str(allocation.warehouse_id)): allocation.quantity
        for allocation in allocations
    }

    return OrderShippingOptionsOut(
        items=[
            OrderShippingItemOptionsOut(
                order_item_id=item.id,
                product_id=item.product_id,
                warehouses=[
                    OrderShippingWarehouseOptionOut(
                        warehouse_id=warehouse.id,
                        warehouse_name=warehouse.name,
                        available_quantity=max(
                            0,
                            (
                                inventory_map[(str(item.product_id), str(warehouse.id))].quantity
                                - inventory_map[(str(item.product_id), str(warehouse.id))].locked
                                if (str(item.product_id), str(warehouse.id)) in inventory_map
                                else 0
                            )
                            + reserved_map.get((str(item.id), str(warehouse.id)), 0),
                        ),
                    )
                    for warehouse in warehouses
                ],
            )
            for item in items
        ]
    )

async def transition_order(
    db: AsyncSession,
    order_id: str,
    target_status: OrderStatus,
    operator: str | Employee,
    cancel_reason: Optional[str] = None,
    ship_request: Optional[OrderShipRequest] = None,
    stock_out_request: Optional[OrderStockOutRequest] = None,
    complete_request: Optional[OrderCompleteRequest] = None,
):
    order = (await db.execute(select(Order).where(Order.id == order_id).with_for_update())).scalar_one_or_none()
    if not order: raise ValueError("订单不存在")
    if target_status not in VALID_TRANSITIONS[order.status]: raise ValueError("订单状态流转无效")
    current = order.status
    operator_username = _operator_username(operator)
    if target_status == OrderStatus.shipping:
        if ship_request is None: raise ValueError("发货仓库分配不能为空")
        await _reallocate_reserved_inventory(db, order, ship_request)
        order.shipping_started_at = datetime.now(timezone.utc).replace(tzinfo=None)
        order.shipping_started_by = operator_username
    elif target_status == OrderStatus.stocked_out:
        if stock_out_request is None:
            raise ValueError("配送信息不能为空")
        if not isinstance(operator, Employee):
            raise ValueError("出库操作员工不能为空")
        await _deduct_reserved_inventory(db, order)
        order.stock_out_at = datetime.now(timezone.utc).replace(tzinfo=None)
        order.stock_out_by = operator_username
        from app.services.order_delivery_service import create_order_delivery

        await create_order_delivery(
            db,
            order,
            stock_out_request,
            operator,
        )
    elif target_status == OrderStatus.delivered_unpaid:
        order.delivered_at = datetime.now(timezone.utc).replace(tzinfo=None)
        order.delivered_by = operator_username
    elif target_status == OrderStatus.completed:
        if complete_request is None:
            raise ValueError("收款信息不能为空")
        paid_amount = Decimal(str(complete_request.paid_amount))
        if paid_amount > order.net_amount:
            raise ValueError("实收金额不能超过订单应收金额")
        order.paid_amount = paid_amount
        order.payment_proof_image_urls = complete_request.payment_proof_image_urls
        await _complete(db, order, paid_amount)
        order.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)
        order.paid_by = operator_username
    elif target_status == OrderStatus.cancelled:
        await _release_locked_inventory(db, order, False)
        order.cancelled_at = datetime.now(timezone.utc).replace(tzinfo=None)
        order.cancelled_by = operator_username
        order.cancel_reason = cancel_reason
    order.status = target_status; db.add(OrderStatusLog(order_id=order.id, from_status=current, to_status=target_status, operator=operator_username, remark=cancel_reason)); await db.flush(); return order

async def _latest_delivery_exceptions(
    db: AsyncSession,
    delivery_ids: list[uuid.UUID],
) -> dict[uuid.UUID, OrderDeliveryEvent]:
    if not delivery_ids:
        return {}
    ranked_exceptions = (
        select(
            OrderDeliveryEvent.id.label("event_id"),
            func.row_number()
            .over(
                partition_by=OrderDeliveryEvent.delivery_id,
                order_by=(
                    OrderDeliveryEvent.created_at.desc(),
                    OrderDeliveryEvent.id.desc(),
                ),
            )
            .label("event_rank"),
        )
        .where(
            OrderDeliveryEvent.delivery_id.in_(delivery_ids),
            OrderDeliveryEvent.event_type == OrderDeliveryEventType.exception,
        )
        .subquery()
    )
    events = (
        await db.execute(
            select(OrderDeliveryEvent)
            .join(
                ranked_exceptions,
                OrderDeliveryEvent.id == ranked_exceptions.c.event_id,
            )
            .where(ranked_exceptions.c.event_rank == 1)
        )
    ).scalars().all()
    return {event.delivery_id: event for event in events}


async def _out(
    db: AsyncSession,
    order: Order,
    delivery: Optional[OrderDelivery] = None,
    latest_exception: Optional[OrderDeliveryEvent] = None,
    *,
    delivery_loaded: bool = False,
    latest_exception_loaded: bool = False,
):
    order_data = {
        column.name: getattr(order, column.name, None)
        for column in Order.__table__.columns
    }
    returned_amount = order_data["returned_amount"] or Decimal("0.00")
    order_data["returned_amount"] = returned_amount
    order_data["net_amount"] = Decimal(str(order_data["total_amount"])) - Decimal(str(returned_amount))
    out = OrderOut.model_validate(order_data)
    items = await _items(db, order.id)
    allocations = await _allocations(db, order.id)
    warehouse_ids = {allocation.warehouse_id for allocation in allocations}
    warehouse_names = {}
    if warehouse_ids:
        warehouse_names = dict((await db.execute(select(Warehouse.id, Warehouse.name).where(Warehouse.id.in_(warehouse_ids)))).all())
    allocations_by_item = {}
    for allocation in allocations:
        allocation_out = OrderInventoryAllocationOut.model_validate(allocation)
        allocation_out.warehouse_name = warehouse_names.get(allocation.warehouse_id)
        allocations_by_item.setdefault(str(allocation.order_item_id), []).append(allocation_out)
    out.items = []
    for item in items:
        item_out = OrderItemOut.model_validate(item)
        item_out.allocations = allocations_by_item.get(str(item.id), [])
        out.items.append(item_out)
    out.customer_name = (await db.execute(select(Customer.name).where(Customer.id == order.customer_id))).scalar_one_or_none()
    out.status_logs = [OrderStatusLogOut.model_validate(row) for row in (await db.execute(select(OrderStatusLog).where(OrderStatusLog.order_id == order.id).order_by(OrderStatusLog.created_at))).scalars().all()]
    if not delivery_loaded:
        delivery = (
            await db.execute(
                select(OrderDelivery).where(OrderDelivery.order_id == order.id)
            )
        ).scalar_one_or_none()
    if delivery and not latest_exception_loaded:
        latest_exception = (
            await _latest_delivery_exceptions(db, [delivery.id])
        ).get(delivery.id)
    if delivery:
        summary = OrderDeliveryOrderSummaryOut.model_validate(delivery)
        if latest_exception:
            summary.latest_exception = OrderDeliveryLatestExceptionOut(
                exception_type=latest_exception.exception_type,
                remark=latest_exception.remark,
                occurred_at=latest_exception.created_at,
            )
        out.delivery = summary
    else:
        out.delivery = None
    return out
async def list_orders(db: AsyncSession, page=1, page_size=20, status: Optional[OrderStatus]=None, customer_id: Optional[str]=None):
    query = select(Order); count = select(func.count()).select_from(Order)
    if status: query, count = query.where(Order.status == status), count.where(Order.status == status)
    if customer_id: query, count = query.where(Order.customer_id == customer_id), count.where(Order.customer_id == customer_id)
    total = (await db.execute(count)).scalar() or 0
    rows = (await db.execute(query.order_by(Order.created_at.desc()).offset((page-1)*page_size).limit(page_size))).scalars().all()
    delivery_map = {}
    latest_exception_map = {}
    if rows:
        deliveries = (
            await db.execute(
                select(OrderDelivery).where(
                    OrderDelivery.order_id.in_([row.id for row in rows])
                )
            )
        ).scalars().all()
        delivery_map = {delivery.order_id: delivery for delivery in deliveries}
        latest_exception_map = await _latest_delivery_exceptions(
            db,
            [delivery.id for delivery in deliveries],
        )
    return PaginatedResponse(
        items=[
            await _out(
                db,
                row,
                delivery_map.get(row.id),
                latest_exception_map.get(delivery_map[row.id].id)
                if row.id in delivery_map
                else None,
                delivery_loaded=True,
                latest_exception_loaded=True,
            )
            for row in rows
        ],
        total=total,
        page=page,
        page_size=page_size,
    )
async def get_order(db: AsyncSession, order_id: str):
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order: raise ValueError("订单不存在")
    return await _out(db, order)
