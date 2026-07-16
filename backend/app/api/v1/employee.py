from fastapi import APIRouter, Depends, HTTPException, Query, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import AdminUser, CurrentUser
from app.core.redis import get_redis
from app.schemas.common import PaginatedResponse, ResponseBase
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeOut,
    EmployeeUpdate,
    PasswordChange,
    PasswordReset,
)
from app.services.employee_service import (
    change_password,
    create_employee,
    disable_employee,
    enable_employee,
    get_employee,
    list_employees,
    reset_password,
    update_employee,
)

router = APIRouter(prefix="/employees", tags=["Employee"])


@router.post("", response_model=ResponseBase[EmployeeOut], status_code=status.HTTP_201_CREATED)
async def create(
    req: EmployeeCreate,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        employee = await create_employee(db, req)
        return ResponseBase(data=EmployeeOut.model_validate(employee))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", response_model=ResponseBase[PaginatedResponse[EmployeeOut]])
async def list_all(
    admin: AdminUser,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    result = await list_employees(db, page, page_size, keyword)
    return ResponseBase(data=result)


@router.get("/{employee_id}", response_model=ResponseBase[EmployeeOut])
async def get(
    employee_id: str,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        employee = await get_employee(db, employee_id)
        return ResponseBase(data=EmployeeOut.model_validate(employee))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/{employee_id}", response_model=ResponseBase[EmployeeOut])
async def update(
    employee_id: str,
    req: EmployeeUpdate,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        employee = await update_employee(db, employee_id, req)
        return ResponseBase(data=EmployeeOut.model_validate(employee))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{employee_id}/disable", response_model=ResponseBase[EmployeeOut])
async def disable(
    employee_id: str,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    try:
        employee = await disable_employee(db, redis, employee_id)
        return ResponseBase(data=EmployeeOut.model_validate(employee))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{employee_id}/enable", response_model=ResponseBase[EmployeeOut])
async def enable(
    employee_id: str,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        employee = await enable_employee(db, employee_id)
        return ResponseBase(data=EmployeeOut.model_validate(employee))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/me/password", response_model=ResponseBase)
async def change_own_password(
    req: PasswordChange,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        await change_password(db, current_user, req)
        return ResponseBase()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{employee_id}/reset-password", response_model=ResponseBase)
async def reset_pwd(
    employee_id: str,
    req: PasswordReset,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        await reset_password(db, employee_id, req)
        return ResponseBase()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
