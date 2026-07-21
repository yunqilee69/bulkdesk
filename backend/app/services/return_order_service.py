import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.customer import Customer
from app.models.inventory import InventoryMovement, InventoryMovementItem, MovementType, Warehouse, WarehouseStatus
from app.models.employee import Employee
from app.models.order import Order, OrderItem, OrderStatus
from app.models.order_delivery import OrderDelivery, OrderDeliveryStatus
from app.models.return_order import ReturnOrder, ReturnOrderItem, ReturnOrderStatus
from app.schemas.common import PaginatedResponse
from app.schemas.return_order import (
    ReturnOrderCreate,
    ReturnOrderItemOut,
    ReturnOrderOut,
    ReturnableOrderItemOut,
)
from app.services.inventory_service import _get_or_create_inventory


async def generate_return_no(db: AsyncSession) -> str:
    prefix = f"RET{datetime.now(timezone.utc):%Y%m%d}"
    count = (
        await db.execute(
            select(func.count())
            .select_from(ReturnOrder)
            .where(ReturnOrder.return_no.like(f"{prefix}%"))
        )
    ).scalar() or 0
    return f"{prefix}{count + 1:06d}{uuid.uuid4().hex[:6].upper()}"


async def _movement_no(db: AsyncSession, prefix: str) -> str:
    code = f"{prefix}{datetime.now(timezone.utc):%Y%m%d}"
    count = (
        await db.execute(
            select(func.count())
            .select_from(InventoryMovement)
            .where(InventoryMovement.order_no.like(f"{code}%"))
        )
    ).scalar() or 0
    return f"{code}{count + 1:06d}{uuid.uuid4().hex[:6].upper()}"


async def list_returnable_items(
    db: AsyncSession,
    handling_delivery_id: str,
    operator_id: uuid.UUID,
    *,
    is_admin: bool = False,
) -> list[ReturnableOrderItemOut]:
    delivery_row = (
        await db.execute(
            select(OrderDelivery, Order)
            .join(Order, Order.id == OrderDelivery.order_id)
            .where(OrderDelivery.id == uuid.UUID(handling_delivery_id))
        )
    ).one_or_none()
    if delivery_row is None:
        raise ValueError("配送任务不存在")
    delivery, handling_order = delivery_row
    if delivery.status != OrderDeliveryStatus.delivering:
        raise ValueError("配送任务不是配送中状态")
    if not is_admin and delivery.delivery_employee_id != operator_id:
        raise PermissionError("只能查看本人当前配送任务的可退商品")

    rows = (
        await db.execute(
            select(OrderItem, Order)
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                Order.customer_id == handling_order.customer_id,
                Order.status.in_(
                    [
                        OrderStatus.stocked_out,
                        OrderStatus.delivered_unpaid,
                        OrderStatus.completed,
                    ]
                ),
            )
            .order_by(Order.created_at.desc(), OrderItem.id)
        )
    ).all()
    if not rows:
        return []

    source_item_ids = [item.id for item, _ in rows]
    returned_quantities = dict(
        (
            await db.execute(
                select(
                    ReturnOrderItem.source_order_item_id,
                    func.coalesce(func.sum(ReturnOrderItem.quantity), 0),
                )
                .join(ReturnOrder, ReturnOrder.id == ReturnOrderItem.return_order_id)
                .where(
                    ReturnOrderItem.source_order_item_id.in_(source_item_ids),
                    ReturnOrder.status == ReturnOrderStatus.completed,
                )
                .group_by(ReturnOrderItem.source_order_item_id)
            )
        ).all()
    )
    return [
        ReturnableOrderItemOut(
            source_order_item_id=item.id,
            order_id=order.id,
            order_no=order.order_no,
            product_id=item.product_id,
            product_name=item.product_name,
            barcode=item.barcode,
            unit_price=item.unit_price,
            sold_quantity=item.quantity,
            returned_quantity=int(returned_quantities.get(item.id, 0)),
            returnable_quantity=item.quantity - int(returned_quantities.get(item.id, 0)),
        )
        for item, order in rows
        if item.quantity > int(returned_quantities.get(item.id, 0))
    ]


async def create_return_order(
    db: AsyncSession,
    req: ReturnOrderCreate,
    operator_id: uuid.UUID,
    operator_name: str,
    *,
    is_admin: bool = False,
) -> ReturnOrder:
    delivery_row = (
        await db.execute(
            select(OrderDelivery, Order)
            .join(Order, Order.id == OrderDelivery.order_id)
            .where(OrderDelivery.id == uuid.UUID(req.handling_delivery_id))
            .with_for_update()
        )
    ).one_or_none()
    if delivery_row is None:
        raise ValueError("配送任务不存在")
    delivery, handling_order = delivery_row
    if delivery.status != OrderDeliveryStatus.delivering:
        raise ValueError("配送任务不是配送中状态")
    if not is_admin and delivery.delivery_employee_id != operator_id:
        raise PermissionError("只能从本人当前配送任务发起退货")

    customer = (
        await db.execute(
            select(Customer)
            .where(Customer.id == handling_order.customer_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if customer is None:
        raise ValueError("客户不存在")

    source_item_ids = sorted(
        {uuid.UUID(item.source_order_item_id) for item in req.items}, key=str
    )
    source_rows = (
        await db.execute(
            select(OrderItem, Order)
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                OrderItem.id.in_(source_item_ids),
                Order.customer_id == customer.id,
                Order.status.in_(
                    [
                        OrderStatus.stocked_out,
                        OrderStatus.delivered_unpaid,
                        OrderStatus.completed,
                    ]
                ),
            )
            .order_by(OrderItem.id)
            .with_for_update()
        )
    ).all()
    source_map = {str(source_item.id): (source_item, source_order) for source_item, source_order in source_rows}
    if len(source_map) != len(source_item_ids):
        raise ValueError("来源订单明细不存在、客户不一致或不可退")

    completed_quantities = dict(
        (
            await db.execute(
                select(
                    ReturnOrderItem.source_order_item_id,
                    func.coalesce(func.sum(ReturnOrderItem.quantity), 0),
                )
                .join(ReturnOrder, ReturnOrder.id == ReturnOrderItem.return_order_id)
                .where(
                    ReturnOrderItem.source_order_item_id.in_(source_item_ids),
                    ReturnOrder.status == ReturnOrderStatus.completed,
                )
                .group_by(ReturnOrderItem.source_order_item_id)
            )
        ).all()
    )
    for requested_item in req.items:
        source_item, _ = source_map[requested_item.source_order_item_id]
        completed_quantity = int(completed_quantities.get(source_item.id, 0))
        if completed_quantity + requested_item.quantity > source_item.quantity:
            raise ValueError(f"商品 {source_item.product_name} 可退数量不足")

    warehouse_ids = sorted(
        {
            uuid.UUID(item.warehouse_id)
            for item in req.items
            if item.should_stock_in and item.warehouse_id
        },
        key=str,
    )
    if warehouse_ids:
        active_warehouse_ids = set(
            (
                await db.execute(
                    select(Warehouse.id).where(
                        Warehouse.id.in_(warehouse_ids),
                        Warehouse.status == WarehouseStatus.active,
                    )
                )
            ).scalars().all()
        )
        if active_warehouse_ids != set(warehouse_ids):
            raise ValueError("入库仓库不存在或已停用")

    inventories = {}
    stock_in_items = sorted(
        [item for item in req.items if item.should_stock_in],
        key=lambda item: (item.source_order_item_id, item.warehouse_id or ""),
    )
    for requested_item in stock_in_items:
        source_item, _ = source_map[requested_item.source_order_item_id]
        inventories[(requested_item.source_order_item_id, requested_item.warehouse_id)] = await _get_or_create_inventory(
            db, source_item.product_id, uuid.UUID(requested_item.warehouse_id)
        )

    total_amount = sum(
        (
            Decimal(str(source_map[item.source_order_item_id][0].unit_price)) * item.quantity
            for item in req.items
        ),
        Decimal("0.00"),
    )
    customer_spent_before = Decimal(str(customer.total_spent))
    completed_return_amount = sum(
        (
            Decimal(str(source_map[item.source_order_item_id][0].unit_price)) * item.quantity
            for item in req.items
            if source_map[item.source_order_item_id][1].status == OrderStatus.completed
        ),
        Decimal("0.00"),
    )
    customer_spent_after = max(
        Decimal("0.00"), customer_spent_before - completed_return_amount
    )
    completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    return_order = ReturnOrder(
        return_no=await generate_return_no(db),
        customer_id=customer.id,
        handling_delivery_id=delivery.id,
        total_amount=total_amount,
        status=ReturnOrderStatus.completed,
        operator=operator_name,
        completed_at=completed_at,
        remark=req.remark,
        customer_spent_before=customer_spent_before,
        customer_spent_after=customer_spent_after,
        spend_deduction_amount=customer_spent_before - customer_spent_after,
    )
    db.add(return_order)
    await db.flush()

    movement_rows = {}
    for requested_item in req.items:
        source_item, source_order = source_map[requested_item.source_order_item_id]
        unit_price = Decimal(str(source_item.unit_price))
        subtotal = unit_price * requested_item.quantity
        return_item = ReturnOrderItem(
            return_order_id=return_order.id,
            source_order_item_id=source_item.id,
            product_id=source_item.product_id,
            product_name=source_item.product_name,
            barcode=source_item.barcode,
            quantity=requested_item.quantity,
            unit_price=unit_price,
            subtotal=subtotal,
            condition=requested_item.condition,
            return_reason=requested_item.return_reason,
            remark=requested_item.remark,
            should_stock_in=requested_item.should_stock_in,
            warehouse_id=(
                uuid.UUID(requested_item.warehouse_id)
                if requested_item.warehouse_id
                else None
            ),
        )
        db.add(return_item)
        source_order.returned_amount = Decimal(str(source_order.returned_amount)) + subtotal
        if not requested_item.should_stock_in:
            continue
        inventory = inventories[(requested_item.source_order_item_id, requested_item.warehouse_id)]
        before = inventory.quantity
        inventory.quantity += requested_item.quantity
        movement_rows.setdefault(return_item.warehouse_id, []).append(
            InventoryMovementItem(
                product_id=source_item.product_id,
                product_name=source_item.product_name,
                barcode=source_item.barcode,
                quantity=requested_item.quantity,
                before_quantity=before,
                after_quantity=inventory.quantity,
            )
        )

    for warehouse_id, movement_items in movement_rows.items():
        db.add(
            InventoryMovement(
                order_no=await _movement_no(db, "CRI"),
                movement_type=MovementType.customer_return_in,
                warehouse_id=warehouse_id,
                remark=f"退货单 {return_order.return_no} 入库",
                items=movement_items,
            )
        )
    customer.total_spent = customer_spent_after
    await db.flush()
    return return_order


async def void_return_order(
    db: AsyncSession,
    return_order_id: str,
    operator: str,
    void_reason: str,
) -> ReturnOrder:
    return_order = (
        await db.execute(
            select(ReturnOrder)
            .options(selectinload(ReturnOrder.items))
            .where(ReturnOrder.id == return_order_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if return_order is None:
        raise ValueError("退货单不存在")
    if return_order.status != ReturnOrderStatus.completed:
        raise ValueError("退货单已作废")

    customer = (
        await db.execute(
            select(Customer)
            .where(Customer.id == return_order.customer_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if customer is None:
        raise ValueError("客户不存在")

    source_item_ids = sorted(
        {item.source_order_item_id for item in return_order.items}, key=str
    )
    source_rows = (
        await db.execute(
            select(OrderItem, Order)
            .join(Order, Order.id == OrderItem.order_id)
            .where(OrderItem.id.in_(source_item_ids))
            .order_by(OrderItem.id)
            .with_for_update()
        )
    ).all()
    source_map = {item.id: (item, order) for item, order in source_rows}
    if len(source_map) != len(source_item_ids):
        raise ValueError("来源订单明细不存在")

    stock_in_items = sorted(
        [item for item in return_order.items if item.should_stock_in],
        key=lambda item: (str(item.product_id), str(item.warehouse_id)),
    )
    inventories = {}
    for item in stock_in_items:
        inventory = await _get_or_create_inventory(db, item.product_id, item.warehouse_id)
        if inventory.quantity - inventory.locked < item.quantity:
            raise ValueError(f"商品 {item.product_name} 在原入库仓库可用库存不足")
        inventories[(str(item.product_id), str(item.warehouse_id))] = inventory

    movement_rows = {}
    for item in stock_in_items:
        inventory = inventories[(str(item.product_id), str(item.warehouse_id))]
        before = inventory.quantity
        inventory.quantity -= item.quantity
        movement_rows.setdefault(item.warehouse_id, []).append(
            InventoryMovementItem(
                product_id=item.product_id,
                product_name=item.product_name,
                barcode=item.barcode,
                quantity=item.quantity,
                before_quantity=before,
                after_quantity=inventory.quantity,
            )
        )

    for item in return_order.items:
        _, source_order = source_map[item.source_order_item_id]
        source_order.returned_amount = Decimal(str(source_order.returned_amount)) - Decimal(
            str(item.subtotal)
        )
        if source_order.returned_amount < 0:
            raise ValueError("来源订单退货金额异常")

    for warehouse_id, movement_items in movement_rows.items():
        db.add(
            InventoryMovement(
                order_no=await _movement_no(db, "CRV"),
                movement_type=MovementType.customer_return_void_out,
                warehouse_id=warehouse_id,
                remark=f"退货单 {return_order.return_no} 作废出库",
                items=movement_items,
            )
        )

    customer_spent_before = Decimal(str(customer.total_spent))
    customer_spent_after = customer_spent_before + Decimal(
        str(return_order.spend_deduction_amount)
    )
    customer.total_spent = customer_spent_after
    return_order.status = ReturnOrderStatus.voided
    return_order.voided_by = operator
    return_order.voided_at = datetime.now(timezone.utc).replace(tzinfo=None)
    return_order.void_reason = void_reason
    return_order.void_customer_spent_before = customer_spent_before
    return_order.void_customer_spent_after = customer_spent_after
    await db.flush()
    return return_order


async def _out(db: AsyncSession, return_order: ReturnOrder) -> ReturnOrderOut:
    out = ReturnOrderOut.model_validate(return_order)
    out.customer_name = (
        await db.execute(
            select(Customer.name).where(Customer.id == return_order.customer_id)
        )
    ).scalar_one_or_none()
    items = return_order.items
    warehouse_ids = {item.warehouse_id for item in items if item.warehouse_id}
    warehouse_names = {}
    if warehouse_ids:
        warehouse_names = dict(
            (
                await db.execute(
                    select(Warehouse.id, Warehouse.name).where(
                        Warehouse.id.in_(warehouse_ids)
                    )
                )
            ).all()
        )
    out.items = []
    for item in items:
        item_out = ReturnOrderItemOut.model_validate(item)
        item_out.warehouse_name = warehouse_names.get(item.warehouse_id)
        out.items.append(item_out)
    return out


async def get_return_order(db: AsyncSession, return_order_id: str) -> ReturnOrderOut:
    return_order = (
        await db.execute(
            select(ReturnOrder)
            .options(selectinload(ReturnOrder.items))
            .where(ReturnOrder.id == return_order_id)
        )
    ).scalar_one_or_none()
    if return_order is None:
        raise ValueError("退货单不存在")
    return await _out(db, return_order)


async def list_return_orders(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    status: Optional[ReturnOrderStatus] = None,
    customer_id: Optional[str] = None,
) -> PaginatedResponse[ReturnOrderOut]:
    query = select(ReturnOrder).options(selectinload(ReturnOrder.items))
    count_query = select(func.count()).select_from(ReturnOrder)
    if status:
        query = query.where(ReturnOrder.status == status)
        count_query = count_query.where(ReturnOrder.status == status)
    if customer_id:
        query = query.where(ReturnOrder.customer_id == customer_id)
        count_query = count_query.where(ReturnOrder.customer_id == customer_id)
    total = (await db.execute(count_query)).scalar() or 0
    rows = (
        await db.execute(
            query.order_by(ReturnOrder.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    return PaginatedResponse(
        items=[await _out(db, row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
