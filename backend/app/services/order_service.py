import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer, CustomerLevel, LevelChangeLog, MemberPrice
from app.models.inventory import Inventory, InventoryMovement, InventoryMovementItem, MovementType
from app.models.order import Order, OrderItem, OrderStatus, OrderStatusLog
from app.models.product import Product, ProductStatus
from app.schemas.common import PaginatedResponse
from app.schemas.order import OrderCreate, OrderItemOut, OrderOut, OrderStatusLogOut

VALID_TRANSITIONS = {OrderStatus.placed: [OrderStatus.shipped, OrderStatus.cancelled], OrderStatus.shipped: [OrderStatus.paid, OrderStatus.cancelled], OrderStatus.paid: [OrderStatus.completed, OrderStatus.cancelled], OrderStatus.completed: [], OrderStatus.cancelled: []}

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

async def create_order(db: AsyncSession, req: OrderCreate, operator: str) -> Order:
    customer = (await db.execute(select(Customer).where(Customer.id == req.customer_id))).scalar_one_or_none()
    if not customer: raise ValueError("客户不存在")
    locked = []
    for item in sorted(req.items, key=lambda value: value.product_id):
        product = (await db.execute(select(Product).where(Product.id == item.product_id))).scalar_one_or_none()
        if not product: raise ValueError("商品不存在")
        if product.status == ProductStatus.disabled: raise ValueError("停售商品不能创建订单")
        inventory = (await db.execute(select(Inventory).where(Inventory.product_id == item.product_id, Inventory.warehouse_id == req.warehouse_id).with_for_update())).scalar_one_or_none()
        if not inventory: raise ValueError("商品库存不存在")
        if inventory.quantity - inventory.locked < item.quantity: raise ValueError("商品可用库存不足")
        locked.append((item, product, inventory))
    for item, _, inventory in locked: inventory.locked += item.quantity
    order = Order(order_no=await generate_order_no(db), customer_id=req.customer_id, warehouse_id=req.warehouse_id, total_amount=0, status=OrderStatus.placed, remark=req.remark)
    db.add(order); await db.flush()
    total = Decimal("0")
    for item, product, _ in locked:
        unit_price = await _member_price(db, item.product_id, str(customer.level_id)) or Decimal(str(product.standard_price))
        subtotal = unit_price * item.quantity; total += subtotal
        db.add(OrderItem(order_id=order.id, product_id=product.id, product_name=product.name, barcode=product.barcode, quantity=item.quantity, unit_price=unit_price, subtotal=subtotal))
    order.total_amount = total
    db.add(OrderStatusLog(order_id=order.id, from_status=None, to_status=OrderStatus.placed, operator=operator, remark="订单创建")); await db.flush(); return order

async def _items(db: AsyncSession, order_id: str): return (await db.execute(select(OrderItem).where(OrderItem.order_id == order_id))).scalars().all()
async def _movement_item(item, before, after): return InventoryMovementItem(product_id=item.product_id, product_name=item.product_name, barcode=item.barcode, quantity=item.quantity, before_quantity=before, after_quantity=after)

async def _release(db: AsyncSession, order: Order, restore: bool):
    rows = []
    for item in await _items(db, order.id):
        inventory = (await db.execute(select(Inventory).where(Inventory.product_id == item.product_id, Inventory.warehouse_id == order.warehouse_id).with_for_update())).scalar_one_or_none()
        if not inventory: raise ValueError("商品库存不存在")
        before = inventory.quantity; inventory.locked -= item.quantity
        if inventory.locked < 0: raise ValueError("锁定库存不足")
        if restore: inventory.quantity += item.quantity
        rows.append(await _movement_item(item, before, inventory.quantity))
    if rows: db.add(InventoryMovement(order_no=await _movement_no(db, "OR" if restore else "OC"), movement_type=MovementType.order_return if restore else MovementType.stock_out, warehouse_id=order.warehouse_id, remark=f"订单 {order.order_no} 取消", items=rows))

async def _ship(db: AsyncSession, order: Order):
    rows = []
    for item in await _items(db, order.id):
        inventory = (await db.execute(select(Inventory).where(Inventory.product_id == item.product_id, Inventory.warehouse_id == order.warehouse_id).with_for_update())).scalar_one_or_none()
        if not inventory: raise ValueError("Inventory not found")
        if inventory.locked < item.quantity: raise ValueError("Locked inventory is less than order quantity")
        if inventory.quantity < item.quantity: raise ValueError("Inventory quantity is insufficient")
        before = inventory.quantity; inventory.quantity -= item.quantity; inventory.locked -= item.quantity; rows.append(await _movement_item(item, before, inventory.quantity))
    if rows: db.add(InventoryMovement(order_no=await _movement_no(db, "OD"), movement_type=MovementType.order_deduction, warehouse_id=order.warehouse_id, remark=f"订单 {order.order_no} 发货", items=rows))

async def _deduct_inventory_on_ship(db: AsyncSession, order: Order):
    await _ship(db, order)

async def _release_locked_inventory(db: AsyncSession, order: Order, deduct_quantity: bool):
    await _release(db, order, deduct_quantity)

async def _complete(db: AsyncSession, order: Order):
    customer = (await db.execute(select(Customer).where(Customer.id == order.customer_id))).scalar_one_or_none()
    if not customer: return
    customer.total_spent = Decimal(str(customer.total_spent)) + Decimal(str(order.total_amount)); customer.order_count += 1; customer.last_order_at = order.created_at
    await _check_level_up(db, customer, customer.total_spent)

async def _complete_order(db: AsyncSession, order: Order):
    await _complete(db, order)

async def _check_level_up(db: AsyncSession, customer: Customer, total_spent: Decimal):
    current = (await db.execute(select(CustomerLevel).where(CustomerLevel.id == customer.level_id))).scalar_one_or_none()
    level = (await db.execute(select(CustomerLevel).where(CustomerLevel.min_spent <= total_spent).order_by(CustomerLevel.min_spent.desc()).limit(1))).scalar_one_or_none()
    if level and (not current or Decimal(str(level.min_spent)) > Decimal(str(current.min_spent))):
        db.add(LevelChangeLog(customer_id=customer.id, from_level_id=customer.level_id, to_level_id=level.id, reason="订单累计消费升级")); customer.level_id = level.id

async def transition_order(db: AsyncSession, order_id: str, target_status: OrderStatus, operator: str, cancel_reason: Optional[str] = None):
    order = (await db.execute(select(Order).where(Order.id == order_id).with_for_update())).scalar_one_or_none()
    if not order: raise ValueError("订单不存在")
    if target_status not in VALID_TRANSITIONS[order.status]: raise ValueError("订单状态流转无效")
    current = order.status
    if target_status == OrderStatus.shipped: await _ship(db, order); order.shipped_at = datetime.now(timezone.utc).replace(tzinfo=None)
    elif target_status == OrderStatus.paid: order.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)
    elif target_status == OrderStatus.completed: await _complete(db, order)
    elif target_status == OrderStatus.cancelled: await _release_locked_inventory(db, order, current != OrderStatus.placed); order.cancelled_at = datetime.now(timezone.utc).replace(tzinfo=None); order.cancel_reason = cancel_reason
    order.status = target_status; db.add(OrderStatusLog(order_id=order.id, from_status=current, to_status=target_status, operator=operator, remark=cancel_reason)); await db.flush(); return order

async def _out(db: AsyncSession, order: Order):
    out = OrderOut.model_validate(order); out.items = [OrderItemOut.model_validate(item) for item in await _items(db, order.id)]; out.customer_name = (await db.execute(select(Customer.name).where(Customer.id == order.customer_id))).scalar_one_or_none(); out.status_logs = [OrderStatusLogOut.model_validate(row) for row in (await db.execute(select(OrderStatusLog).where(OrderStatusLog.order_id == order.id).order_by(OrderStatusLog.created_at))).scalars().all()]; return out
async def list_orders(db: AsyncSession, page=1, page_size=20, status: Optional[OrderStatus]=None, customer_id: Optional[str]=None):
    query = select(Order); count = select(func.count()).select_from(Order)
    if status: query, count = query.where(Order.status == status), count.where(Order.status == status)
    if customer_id: query, count = query.where(Order.customer_id == customer_id), count.where(Order.customer_id == customer_id)
    total = (await db.execute(count)).scalar() or 0; rows = (await db.execute(query.order_by(Order.created_at.desc()).offset((page-1)*page_size).limit(page_size))).scalars().all(); return PaginatedResponse(items=[await _out(db, row) for row in rows], total=total, page=page, page_size=page_size)
async def get_order(db: AsyncSession, order_id: str):
    order = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not order: raise ValueError("订单不存在")
    return await _out(db, order)
