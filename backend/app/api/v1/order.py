from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.order import OrderStatus
from app.schemas.common import PaginatedResponse, ResponseBase
from app.schemas.order import (
    OrderActionRequest,
    OrderCompleteRequest,
    OrderCreate,
    OrderOut,
    OrderShippingOptionsOut,
    OrderShipRequest,
    OrderStockOutRequest,
)
from app.services.order_service import (
    create_order,
    get_order,
    get_shipping_options,
    list_orders,
    transition_order,
    update_shipping_allocations,
)

router = APIRouter(prefix="/orders", tags=["Order"])


@router.post("", response_model=ResponseBase[OrderOut], status_code=status.HTTP_201_CREATED)
async def create(
    req: OrderCreate,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        order = await create_order(db, req, current_user.username)
        order_out = await get_order(db, str(order.id))
        return ResponseBase(data=order_out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", response_model=ResponseBase[PaginatedResponse[OrderOut]])
async def list_all(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    order_status: OrderStatus = Query(None, alias="status"),
    customer_id: str = Query(None),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    result = await list_orders(db, page, page_size, order_status, customer_id)
    return ResponseBase(data=result)


@router.get("/{order_id}", response_model=ResponseBase[OrderOut])
async def get(
    order_id: str,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        order_out = await get_order(db, order_id)
        return ResponseBase(data=order_out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get(
    "/{order_id}/shipping-options",
    response_model=ResponseBase[OrderShippingOptionsOut],
)
async def shipping_options(
    order_id: str,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(data=await get_shipping_options(db, order_id))
    except ValueError as e:
        status_code = (
            status.HTTP_404_NOT_FOUND
            if str(e) == "订单不存在"
            else status.HTTP_400_BAD_REQUEST
        )
        raise HTTPException(status_code=status_code, detail=str(e))


@router.put("/{order_id}/start-shipping", response_model=ResponseBase[OrderOut])
async def start_shipping(
    order_id: str,
    req: OrderShipRequest,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        order = await transition_order(
            db, order_id, OrderStatus.shipping, current_user.username, ship_request=req
        )
        order_out = await get_order(db, str(order.id))
        return ResponseBase(data=order_out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{order_id}/shipping-allocations", response_model=ResponseBase[OrderOut])
async def adjust_shipping_allocations(
    order_id: str,
    req: OrderShipRequest,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        order = await update_shipping_allocations(db, order_id, req)
        order_out = await get_order(db, str(order.id))
        return ResponseBase(data=order_out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{order_id}/stock-out", response_model=ResponseBase[OrderOut])
async def stock_out(
    order_id: UUID,
    req: OrderStockOutRequest,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        order = await transition_order(
            db,
            str(order_id),
            OrderStatus.stocked_out,
            current_user,
            stock_out_request=req,
        )
        order_out = await get_order(db, str(order.id))
        return ResponseBase(data=order_out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{order_id}/complete", response_model=ResponseBase[OrderOut])
async def complete(
    order_id: str,
    req: OrderCompleteRequest,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        order = await transition_order(
            db, order_id, OrderStatus.completed, current_user.username, complete_request=req
        )
        order_out = await get_order(db, str(order.id))
        return ResponseBase(data=order_out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{order_id}/cancel", response_model=ResponseBase[OrderOut])
async def cancel(
    order_id: str,
    req: OrderActionRequest,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        order = await transition_order(
            db,
            order_id,
            OrderStatus.cancelled,
            current_user.username,
            cancel_reason=req.cancel_reason,
        )
        order_out = await get_order(db, str(order.id))
        return ResponseBase(data=order_out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
