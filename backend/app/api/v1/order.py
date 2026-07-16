from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.models.order import OrderStatus
from app.schemas.common import PaginatedResponse, ResponseBase
from app.schemas.order import OrderActionRequest, OrderCreate, OrderOut
from app.services.order_service import (
    create_order,
    get_order,
    list_orders,
    transition_order,
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


@router.put("/{order_id}/ship", response_model=ResponseBase[OrderOut])
async def ship(
    order_id: str,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        order = await transition_order(
            db, order_id, OrderStatus.shipped, current_user.username
        )
        order_out = await get_order(db, str(order.id))
        return ResponseBase(data=order_out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{order_id}/confirm-payment", response_model=ResponseBase[OrderOut])
async def confirm_payment(
    order_id: str,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        order = await transition_order(
            db, order_id, OrderStatus.paid, current_user.username
        )
        order_out = await get_order(db, str(order.id))
        return ResponseBase(data=order_out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{order_id}/complete", response_model=ResponseBase[OrderOut])
async def complete(
    order_id: str,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        order = await transition_order(
            db, order_id, OrderStatus.completed, current_user.username
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
