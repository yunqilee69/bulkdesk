from datetime import date
from typing import NoReturn, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import AdminUser, CurrentUser
from app.schemas.common import ResponseBase
from app.schemas.order_delivery import (
    OrderDeliveryArchivePageOut,
    OrderDeliveryCurrentGroupOut,
    OrderDeliveryDetailOut,
    OrderDeliveryEmployeeOptionOut,
    OrderDeliveryExceptionRequest,
    OrderDeliveryReassignRequest,
    OrderDeliverySignRequest,
)
from app.services import order_delivery_service

router = APIRouter(prefix="/deliveries", tags=["配送管理"])


def _raise_service_error(error: PermissionError | ValueError) -> NoReturn:
    if isinstance(error, PermissionError):
        status_code = status.HTTP_403_FORBIDDEN
    elif str(error) == "配送记录不存在":
        status_code = status.HTTP_404_NOT_FOUND
    else:
        status_code = status.HTTP_400_BAD_REQUEST
    raise HTTPException(status_code=status_code, detail=str(error))


@router.get(
    "/employee-options",
    response_model=ResponseBase[list[OrderDeliveryEmployeeOptionOut]],
)
async def employee_options(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(
            data=await order_delivery_service.list_active_employee_options(db)
        )
    except ValueError as error:
        _raise_service_error(error)


@router.get(
    "/current",
    response_model=ResponseBase[list[OrderDeliveryCurrentGroupOut]],
)
async def current_deliveries(
    current_user: CurrentUser,
    order_keyword: Optional[str] = Query(None),
    customer_keyword: Optional[str] = Query(None),
    employee_id: Optional[UUID] = Query(None),
    has_exception: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(
            data=await order_delivery_service.list_current_deliveries(
                db,
                current_user,
                order_keyword=order_keyword,
                customer_keyword=customer_keyword,
                employee_id=employee_id,
                has_exception=has_exception,
            )
        )
    except (PermissionError, ValueError) as error:
        _raise_service_error(error)


@router.get(
    "/archive",
    response_model=ResponseBase[OrderDeliveryArchivePageOut],
)
async def delivery_archive(
    current_user: CurrentUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    employee_id: Optional[UUID] = Query(None),
    order_keyword: Optional[str] = Query(None),
    customer_keyword: Optional[str] = Query(None),
    signer_keyword: Optional[str] = Query(None),
    signed_from: Optional[date] = Query(None),
    signed_to: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(
            data=await order_delivery_service.list_delivery_archive(
                db,
                current_user,
                page=page,
                page_size=page_size,
                employee_id=employee_id,
                order_keyword=order_keyword,
                customer_keyword=customer_keyword,
                signer_keyword=signer_keyword,
                signed_from=signed_from,
                signed_to=signed_to,
            )
        )
    except (PermissionError, ValueError) as error:
        _raise_service_error(error)


@router.get(
    "/{delivery_id}",
    response_model=ResponseBase[OrderDeliveryDetailOut],
)
async def delivery_detail(
    delivery_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(
            data=await order_delivery_service.get_delivery_detail(
                db, delivery_id, current_user
            )
        )
    except (PermissionError, ValueError) as error:
        _raise_service_error(error)


@router.put(
    "/{delivery_id}/reassign",
    response_model=ResponseBase[OrderDeliveryDetailOut],
)
async def reassign_delivery(
    delivery_id: UUID,
    request: OrderDeliveryReassignRequest,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        await order_delivery_service.reassign_delivery(
            db, delivery_id, request, admin
        )
        return ResponseBase(
            data=await order_delivery_service.get_delivery_detail(
                db, delivery_id, admin
            )
        )
    except (PermissionError, ValueError) as error:
        _raise_service_error(error)


@router.post(
    "/{delivery_id}/exceptions",
    response_model=ResponseBase[OrderDeliveryDetailOut],
)
async def create_delivery_exception(
    delivery_id: UUID,
    request: OrderDeliveryExceptionRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        await order_delivery_service.record_delivery_exception(
            db, delivery_id, request, current_user
        )
        return ResponseBase(
            data=await order_delivery_service.get_delivery_detail(
                db, delivery_id, current_user
            )
        )
    except (PermissionError, ValueError) as error:
        _raise_service_error(error)


@router.put(
    "/{delivery_id}/sign",
    response_model=ResponseBase[OrderDeliveryDetailOut],
)
async def sign_delivery(
    delivery_id: UUID,
    request: OrderDeliverySignRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        await order_delivery_service.sign_delivery(
            db, delivery_id, request, current_user
        )
        return ResponseBase(
            data=await order_delivery_service.get_delivery_detail(
                db, delivery_id, current_user
            )
        )
    except (PermissionError, ValueError) as error:
        _raise_service_error(error)
