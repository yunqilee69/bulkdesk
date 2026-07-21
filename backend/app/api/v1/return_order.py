from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import AdminUser, CurrentUser, DeliveryUser
from app.core.permissions import has_any_role
from app.models.employee import EmployeeRole
from app.models.return_order import ReturnOrderStatus
from app.schemas.common import PaginatedResponse, ResponseBase
from app.schemas.return_order import ReturnOrderCreate, ReturnOrderOut, ReturnOrderVoidRequest
from app.services.return_order_service import (
    create_return_order,
    get_return_order,
    list_return_orders,
    void_return_order,
)

router = APIRouter(prefix="/return-orders", tags=["ReturnOrder"])


@router.post("", response_model=ResponseBase[ReturnOrderOut], status_code=status.HTTP_201_CREATED)
async def create(
    req: ReturnOrderCreate,
    current_user: DeliveryUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        return_order = await create_return_order(
            db,
            req,
            current_user.id,
            current_user.name,
            is_admin=has_any_role(current_user, EmployeeRole.admin),
        )
        return ResponseBase(data=await get_return_order(db, str(return_order.id)))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.get("", response_model=ResponseBase[PaginatedResponse[ReturnOrderOut]])
async def list_all(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    return_status: ReturnOrderStatus = Query(None, alias="status"),
    customer_id: str = Query(None),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    return ResponseBase(
        data=await list_return_orders(
            db, page, page_size, return_status, customer_id
        )
    )


@router.get("/{return_order_id}", response_model=ResponseBase[ReturnOrderOut])
async def get(
    return_order_id: str,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(data=await get_return_order(db, return_order_id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.put("/{return_order_id}/void", response_model=ResponseBase[ReturnOrderOut])
async def void(
    return_order_id: str,
    req: ReturnOrderVoidRequest,
    current_user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        return_order = await void_return_order(
            db,
            return_order_id,
            current_user.username,
            req.void_reason,
        )
        return ResponseBase(data=await get_return_order(db, str(return_order.id)))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
