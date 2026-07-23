from datetime import date, datetime, time, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import has_any_role
from app.models.customer import Customer
from app.models.employee import Employee, EmployeeRole, EmployeeStatus
from app.models.order import Order, OrderItem, OrderStatus
from app.models.order_delivery import (
    OrderDelivery,
    OrderDeliveryEvent,
    OrderDeliveryEventType,
    OrderDeliveryStatus,
)
from app.schemas.common import UTC_PLUS_EIGHT
from app.schemas.order import OrderCompleteRequest, OrderStockOutRequest
from app.schemas.order_delivery import (
    OrderDeliveryArchiveOut,
    OrderDeliveryArchivePageOut,
    OrderDeliveryCurrentGroupOut,
    OrderDeliveryCurrentOut,
    OrderDeliveryDetailOut,
    OrderDeliveryEmployeeOptionOut,
    OrderDeliveryEventOut,
    OrderDeliveryExceptionRequest,
    OrderDeliveryItemSummaryOut,
    OrderDeliveryReassignRequest,
    OrderDeliverySignRequest,
)
from app.services import order_service


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _local_date_start_to_utc_naive(value: date) -> datetime:
    return (
        datetime.combine(value, time.min, tzinfo=UTC_PLUS_EIGHT)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )


def _is_admin(employee: Employee) -> bool:
    return has_any_role(employee, EmployeeRole.admin)


def _require_owner_or_admin(delivery: OrderDelivery, current_user: Employee) -> None:
    if not _is_admin(current_user) and delivery.delivery_employee_id != current_user.id:
        raise PermissionError("无权处理该配送记录")


async def _active_employee(db: AsyncSession, employee_id: UUID) -> Employee:
    employee = (
        await db.execute(
            select(Employee).where(Employee.id == employee_id).with_for_update()
        )
    ).scalar_one_or_none()
    if employee is None or employee.status != EmployeeStatus.active:
        raise ValueError("配送员不存在或已禁用")
    return employee


async def _locked_delivery_order(
    db: AsyncSession, delivery_id: UUID
) -> tuple[OrderDelivery, Order]:
    result = await db.execute(
        select(OrderDelivery, Order)
        .join(Order, Order.id == OrderDelivery.order_id)
        .where(OrderDelivery.id == delivery_id)
        .with_for_update()
    )
    row = result.one_or_none()
    if row is None:
        raise ValueError("配送记录不存在")
    return row[0], row[1]


def _require_delivering_stocked_out(
    delivery: OrderDelivery, order: Order
) -> None:
    if delivery.status != OrderDeliveryStatus.delivering:
        raise ValueError("配送记录状态无效")
    if order.status != OrderStatus.stocked_out:
        raise ValueError("订单状态必须为已出库")


async def list_active_employee_options(
    db: AsyncSession,
) -> list[OrderDeliveryEmployeeOptionOut]:
    rows = (
        await db.execute(
            select(Employee.id, Employee.name)
            .where(Employee.status == EmployeeStatus.active)
            .order_by(Employee.name, Employee.id)
        )
    ).all()
    return [
        OrderDeliveryEmployeeOptionOut.model_validate({"id": row[0], "name": row[1]})
        for row in rows
    ]


async def create_order_delivery(
    db: AsyncSession,
    order: Order,
    stock_out_request: OrderStockOutRequest,
    operator: Employee,
) -> OrderDelivery:
    delivery_employee = await _active_employee(
        db, stock_out_request.delivery_employee_id
    )
    assigned_at = _utc_now()
    delivery = OrderDelivery(
        order_id=order.id,
        delivery_employee_id=delivery_employee.id,
        delivery_employee_name=delivery_employee.name,
        status=OrderDeliveryStatus.delivering,
        recipient_name=stock_out_request.recipient_name,
        recipient_phone=stock_out_request.recipient_phone,
        delivery_address=stock_out_request.delivery_address,
        assigned_at=assigned_at,
        assigned_by_id=operator.id,
        assigned_by_name=operator.name,
    )
    db.add(delivery)
    await db.flush()
    db.add(
        OrderDeliveryEvent(
            delivery_id=delivery.id,
            event_type=OrderDeliveryEventType.assigned,
            to_employee_id=delivery_employee.id,
            to_employee_name=delivery_employee.name,
            operator_id=operator.id,
            operator_name=operator.name,
            created_at=assigned_at,
        )
    )
    await db.flush()
    return delivery


def _item_totals_subquery():
    return (
        select(
            OrderItem.order_id.label("order_id"),
            func.sum(OrderItem.quantity).label("product_quantity"),
        )
        .group_by(OrderItem.order_id)
        .subquery()
    )


def _exception_orders_subquery():
    return (
        select(OrderDeliveryEvent.delivery_id.label("delivery_id"))
        .where(OrderDeliveryEvent.event_type == OrderDeliveryEventType.exception)
        .distinct()
        .subquery()
    )


def _latest_exceptions_subquery():
    ranked_exceptions = (
        select(
            OrderDeliveryEvent.delivery_id.label("delivery_id"),
            OrderDeliveryEvent.exception_type.label("exception_type"),
            OrderDeliveryEvent.remark.label("remark"),
            OrderDeliveryEvent.created_at.label("occurred_at"),
            func.row_number()
            .over(
                partition_by=OrderDeliveryEvent.delivery_id,
                order_by=(
                    OrderDeliveryEvent.created_at.desc(),
                    OrderDeliveryEvent.id.desc(),
                ),
            )
            .label("row_number"),
        )
        .where(OrderDeliveryEvent.event_type == OrderDeliveryEventType.exception)
        .subquery()
    )
    return (
        select(
            ranked_exceptions.c.delivery_id,
            ranked_exceptions.c.exception_type,
            ranked_exceptions.c.remark,
            ranked_exceptions.c.occurred_at,
        )
        .where(ranked_exceptions.c.row_number == 1)
        .subquery()
    )


def _current_conditions(
    current_user: Employee,
    exception_orders,
    *,
    order_keyword: Optional[str],
    customer_keyword: Optional[str],
    employee_id: Optional[UUID],
    has_exception: Optional[bool],
):
    conditions = [OrderDelivery.status == OrderDeliveryStatus.delivering]
    scoped_employee_id = employee_id if _is_admin(current_user) else current_user.id
    if scoped_employee_id:
        conditions.append(OrderDelivery.delivery_employee_id == scoped_employee_id)
    if order_keyword:
        conditions.append(Order.order_no.ilike(f"%{order_keyword}%"))
    if customer_keyword:
        conditions.append(Customer.name.ilike(f"%{customer_keyword}%"))
    if has_exception is True:
        conditions.append(exception_orders.c.delivery_id.is_not(None))
    elif has_exception is False:
        conditions.append(exception_orders.c.delivery_id.is_(None))
    return conditions


async def list_current_deliveries(
    db: AsyncSession,
    current_user: Employee,
    *,
    order_keyword: Optional[str] = None,
    customer_keyword: Optional[str] = None,
    employee_id: Optional[UUID] = None,
    has_exception: Optional[bool] = None,
) -> list[OrderDeliveryCurrentGroupOut]:
    item_totals = _item_totals_subquery()
    exception_orders = _exception_orders_subquery()
    latest_exceptions = _latest_exceptions_subquery()
    conditions = _current_conditions(
        current_user,
        exception_orders,
        order_keyword=order_keyword,
        customer_keyword=customer_keyword,
        employee_id=employee_id,
        has_exception=has_exception,
    )
    joins = (
        OrderDelivery.__table__.join(Order, Order.id == OrderDelivery.order_id)
        .join(Customer, Customer.id == Order.customer_id)
        .outerjoin(item_totals, item_totals.c.order_id == Order.id)
        .outerjoin(
            exception_orders,
            exception_orders.c.delivery_id == OrderDelivery.id,
        )
        .outerjoin(
            latest_exceptions,
            latest_exceptions.c.delivery_id == OrderDelivery.id,
        )
    )
    aggregate_subquery = (
        select(
            OrderDelivery.delivery_employee_id.label("delivery_employee_id"),
            func.count(func.distinct(OrderDelivery.id)).label("order_count"),
            func.count(func.distinct(Order.customer_id)).label("customer_count"),
            func.coalesce(func.sum(item_totals.c.product_quantity), 0).label(
                "product_quantity"
            ),
            func.coalesce(func.sum(Order.total_amount), 0).label("total_amount"),
            func.count(func.distinct(exception_orders.c.delivery_id)).label(
                "exception_order_count"
            ),
        )
        .select_from(joins)
        .where(*conditions)
        .group_by(OrderDelivery.delivery_employee_id)
        .subquery()
    )
    aggregate_query = (
        select(
            aggregate_subquery.c.delivery_employee_id,
            Employee.name.label("delivery_employee_name"),
            aggregate_subquery.c.order_count,
            aggregate_subquery.c.customer_count,
            aggregate_subquery.c.product_quantity,
            aggregate_subquery.c.total_amount,
            aggregate_subquery.c.exception_order_count,
        )
        .join(Employee, Employee.id == aggregate_subquery.c.delivery_employee_id)
        .order_by(Employee.name, aggregate_subquery.c.delivery_employee_id)
    )
    group_rows = (await db.execute(aggregate_query)).mappings().all()

    detail_query = (
        select(
            OrderDelivery.id.label("id"),
            OrderDelivery.status.label("status"),
            OrderDelivery.delivery_employee_id.label("delivery_employee_id"),
            OrderDelivery.delivery_employee_name.label("delivery_employee_name"),
            OrderDelivery.recipient_name.label("recipient_name"),
            OrderDelivery.recipient_phone.label("recipient_phone"),
            OrderDelivery.delivery_address.label("delivery_address"),
            OrderDelivery.assigned_at.label("assigned_at"),
            OrderDelivery.signer_name.label("signer_name"),
            OrderDelivery.signed_at.label("signed_at"),
            Order.id.label("order_id"),
            Order.order_no.label("order_no"),
            Order.customer_id.label("customer_id"),
            Customer.name.label("customer_name"),
            Order.total_amount.label("total_amount"),
            func.coalesce(item_totals.c.product_quantity, 0).label(
                "product_quantity"
            ),
            exception_orders.c.delivery_id.is_not(None).label("has_exception"),
            latest_exceptions.c.exception_type.label("latest_exception_type"),
            latest_exceptions.c.remark.label("latest_exception_remark"),
            latest_exceptions.c.occurred_at.label("latest_exception_occurred_at"),
        )
        .select_from(joins)
        .where(*conditions)
        .order_by(
            OrderDelivery.delivery_employee_name,
            OrderDelivery.delivery_employee_id,
            Order.stock_out_at,
            Order.id,
        )
    )
    delivery_rows = (await db.execute(detail_query)).mappings().all()
    deliveries_by_employee = {}
    for row in delivery_rows:
        key = str(row["delivery_employee_id"])
        delivery_data = dict(row)
        if row.get("latest_exception_type") is not None:
            delivery_data["latest_exception"] = {
                "exception_type": row["latest_exception_type"],
                "remark": row.get("latest_exception_remark"),
                "occurred_at": row.get("latest_exception_occurred_at"),
            }
        deliveries_by_employee.setdefault(key, []).append(
            OrderDeliveryCurrentOut.model_validate(delivery_data)
        )

    return [
        OrderDeliveryCurrentGroupOut.model_validate(
            {
                **row,
                "deliveries": deliveries_by_employee.get(
                    str(row["delivery_employee_id"]), []
                ),
            }
        )
        for row in group_rows
    ]


def _archive_conditions(
    current_user: Employee,
    *,
    employee_id: Optional[UUID],
    order_keyword: Optional[str],
    customer_keyword: Optional[str],
    signer_keyword: Optional[str],
    signed_from: Optional[date],
    signed_to: Optional[date],
):
    if signed_from and signed_to and signed_from > signed_to:
        raise ValueError("签收开始日期不能晚于结束日期")
    conditions = [OrderDelivery.status == OrderDeliveryStatus.signed]
    scoped_employee_id = employee_id if _is_admin(current_user) else current_user.id
    if scoped_employee_id:
        conditions.append(OrderDelivery.delivery_employee_id == scoped_employee_id)
    if order_keyword:
        conditions.append(Order.order_no.ilike(f"%{order_keyword}%"))
    if customer_keyword:
        conditions.append(Customer.name.ilike(f"%{customer_keyword}%"))
    if signer_keyword:
        conditions.append(OrderDelivery.signer_name.ilike(f"%{signer_keyword}%"))
    if signed_from:
        conditions.append(
            OrderDelivery.signed_at >= _local_date_start_to_utc_naive(signed_from)
        )
    if signed_to:
        conditions.append(
            OrderDelivery.signed_at
            < _local_date_start_to_utc_naive(signed_to + timedelta(days=1))
        )
    return conditions


async def list_delivery_archive(
    db: AsyncSession,
    current_user: Employee,
    *,
    page: int = 1,
    page_size: int = 20,
    employee_id: Optional[UUID] = None,
    order_keyword: Optional[str] = None,
    customer_keyword: Optional[str] = None,
    signer_keyword: Optional[str] = None,
    signed_from: Optional[date] = None,
    signed_to: Optional[date] = None,
) -> OrderDeliveryArchivePageOut:
    item_totals = _item_totals_subquery()
    conditions = _archive_conditions(
        current_user,
        employee_id=employee_id,
        order_keyword=order_keyword,
        customer_keyword=customer_keyword,
        signer_keyword=signer_keyword,
        signed_from=signed_from,
        signed_to=signed_to,
    )
    joins = (
        OrderDelivery.__table__.join(Order, Order.id == OrderDelivery.order_id)
        .join(Customer, Customer.id == Order.customer_id)
        .outerjoin(item_totals, item_totals.c.order_id == Order.id)
    )
    total = (
        await db.execute(
            select(func.count(OrderDelivery.id)).select_from(joins).where(*conditions)
        )
    ).scalar() or 0
    rows = (
        await db.execute(
            select(
                OrderDelivery.id.label("id"),
                OrderDelivery.status.label("status"),
                OrderDelivery.delivery_employee_id.label("delivery_employee_id"),
                OrderDelivery.delivery_employee_name.label("delivery_employee_name"),
                OrderDelivery.recipient_name.label("recipient_name"),
                OrderDelivery.recipient_phone.label("recipient_phone"),
                OrderDelivery.delivery_address.label("delivery_address"),
                OrderDelivery.assigned_at.label("assigned_at"),
                OrderDelivery.signer_name.label("signer_name"),
                OrderDelivery.signed_at.label("signed_at"),
                OrderDelivery.proof_image_urls.label("proof_image_urls"),
                OrderDelivery.signature_image_url.label("signature_image_url"),
                OrderDelivery.sign_remark.label("sign_remark"),
                Order.id.label("order_id"),
                Order.order_no.label("order_no"),
                Order.customer_id.label("customer_id"),
                Customer.name.label("customer_name"),
                Order.total_amount.label("total_amount"),
                func.coalesce(item_totals.c.product_quantity, 0).label(
                    "product_quantity"
                ),
            )
            .select_from(joins)
            .where(*conditions)
            .order_by(OrderDelivery.signed_at.desc(), OrderDelivery.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).mappings().all()
    return OrderDeliveryArchivePageOut(
        items=[OrderDeliveryArchiveOut.model_validate(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


async def get_delivery_detail(
    db: AsyncSession, delivery_id: UUID, current_user: Employee
) -> OrderDeliveryDetailOut:
    item_totals = _item_totals_subquery()
    row = (
        await db.execute(
            select(
                *OrderDelivery.__table__.c,
                Order.order_no.label("order_no"),
                Order.customer_id.label("customer_id"),
                Customer.name.label("customer_name"),
                Order.total_amount.label("total_amount"),
                Order.status.label("order_status"),
                func.coalesce(item_totals.c.product_quantity, 0).label(
                    "product_quantity"
                ),
            )
            .select_from(OrderDelivery)
            .join(Order, Order.id == OrderDelivery.order_id)
            .join(Customer, Customer.id == Order.customer_id)
            .outerjoin(item_totals, item_totals.c.order_id == Order.id)
            .where(OrderDelivery.id == delivery_id)
        )
    ).mappings().one_or_none()
    if row is None:
        raise ValueError("配送记录不存在")
    can_view = _is_admin(current_user) or row["delivery_employee_id"] == current_user.id
    if not can_view and row["status"] == OrderDeliveryStatus.signed:
        historical_event_id = (
            await db.execute(
                select(OrderDeliveryEvent.id)
                .where(
                    OrderDeliveryEvent.delivery_id == delivery_id,
                    or_(
                        OrderDeliveryEvent.from_employee_id == current_user.id,
                        OrderDeliveryEvent.to_employee_id == current_user.id,
                    ),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        can_view = historical_event_id is not None
    if not can_view:
        raise PermissionError("无权查看该配送记录")
    events = (
        await db.execute(
            select(OrderDeliveryEvent)
            .where(OrderDeliveryEvent.delivery_id == delivery_id)
            .order_by(OrderDeliveryEvent.created_at, OrderDeliveryEvent.id)
        )
    ).scalars().all()
    items = (
        await db.execute(
            select(OrderItem)
            .where(OrderItem.order_id == row["order_id"])
            .order_by(OrderItem.created_at, OrderItem.id)
        )
    ).scalars().all()
    return OrderDeliveryDetailOut.model_validate(
        {
            **row,
            "events": [OrderDeliveryEventOut.model_validate(event) for event in events],
            "items": [
                OrderDeliveryItemSummaryOut.model_validate(item) for item in items
            ],
        }
    )


async def reassign_delivery(
    db: AsyncSession,
    delivery_id: UUID,
    request: OrderDeliveryReassignRequest,
    admin: Employee,
) -> OrderDelivery:
    if not _is_admin(admin):
        raise PermissionError("仅管理员可以改派配送")
    delivery, order = await _locked_delivery_order(db, delivery_id)
    _require_delivering_stocked_out(delivery, order)
    target = await _active_employee(db, request.delivery_employee_id)
    if target.id == delivery.delivery_employee_id:
        raise ValueError("新配送员不能与当前配送员相同")
    old_employee_id = delivery.delivery_employee_id
    old_employee_name = delivery.delivery_employee_name
    delivery.delivery_employee_id = target.id
    delivery.delivery_employee_name = target.name
    db.add(
        OrderDeliveryEvent(
            delivery_id=delivery.id,
            event_type=OrderDeliveryEventType.reassigned,
            from_employee_id=old_employee_id,
            from_employee_name=old_employee_name,
            to_employee_id=target.id,
            to_employee_name=target.name,
            remark=request.reason,
            operator_id=admin.id,
            operator_name=admin.name,
            created_at=_utc_now(),
        )
    )
    await db.flush()
    return delivery


async def record_delivery_exception(
    db: AsyncSession,
    delivery_id: UUID,
    request: OrderDeliveryExceptionRequest,
    current_user: Employee,
) -> OrderDelivery:
    delivery, order = await _locked_delivery_order(db, delivery_id)
    _require_owner_or_admin(delivery, current_user)
    _require_delivering_stocked_out(delivery, order)
    db.add(
        OrderDeliveryEvent(
            delivery_id=delivery.id,
            event_type=OrderDeliveryEventType.exception,
            exception_type=request.exception_type,
            remark=request.remark,
            operator_id=current_user.id,
            operator_name=current_user.name,
            created_at=_utc_now(),
        )
    )
    await db.flush()
    return delivery


async def sign_delivery(
    db: AsyncSession,
    delivery_id: UUID,
    request: OrderDeliverySignRequest,
    current_user: Employee,
) -> OrderDelivery:
    delivery, order = await _locked_delivery_order(db, delivery_id)
    _require_owner_or_admin(delivery, current_user)
    _require_delivering_stocked_out(delivery, order)
    signed_at = _utc_now()
    delivery.signer_name = request.signer_name
    delivery.proof_image_urls = request.proof_image_urls
    delivery.signature_image_url = request.signature_image_url
    delivery.sign_remark = request.remark
    delivery.signed_at = signed_at
    delivery.signed_by_id = current_user.id
    delivery.signed_by_name = current_user.name
    delivery.status = OrderDeliveryStatus.signed
    db.add(
        OrderDeliveryEvent(
            delivery_id=delivery.id,
            event_type=OrderDeliveryEventType.signed,
            remark=request.remark,
            operator_id=current_user.id,
            operator_name=current_user.name,
            created_at=signed_at,
        )
    )
    await order_service.transition_order(
        db,
        str(order.id),
        OrderStatus.delivered_unpaid,
        current_user,
    )
    if request.collect_payment:
        await order_service.transition_order(
            db,
            str(order.id),
            OrderStatus.completed,
            current_user,
            complete_request=OrderCompleteRequest(
                paid_amount=request.paid_amount,
                payment_proof_image_urls=request.payment_proof_image_urls,
            ),
        )
    await db.flush()
    return delivery
