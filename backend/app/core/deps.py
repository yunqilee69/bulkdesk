from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.permissions import has_any_role
from app.core.redis import get_redis
from app.core.security import decode_token
from app.models.employee import Employee, EmployeeRole, EmployeeStatus

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> Employee:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
    except ValueError:
        raise credentials_exception

    if payload.get("type") != "access":
        raise credentials_exception

    jti = payload.get("jti")
    if jti:
        is_blacklisted = await redis.get(f"token_blacklist:{jti}")
        if is_blacklisted:
            raise credentials_exception

    username = payload.get("sub")
    if username is None:
        raise credentials_exception

    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.role_assignments))
        .where(Employee.username == username)
    )
    employee = result.scalar_one_or_none()
    if employee is None:
        raise credentials_exception

    if employee.status != EmployeeStatus.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Employee account is disabled",
        )

    return employee


async def require_admin(current_user: Employee = Depends(get_current_user)) -> Employee:
    if not has_any_role(current_user, EmployeeRole.admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


async def _require_role(current_user: Employee, role: EmployeeRole) -> Employee:
    if not has_any_role(current_user, role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{role.value} access required",
        )
    return current_user


async def require_warehouse_manager(
    current_user: Employee = Depends(get_current_user),
) -> Employee:
    return await _require_role(current_user, EmployeeRole.warehouse_manager)


async def require_delivery(
    current_user: Employee = Depends(get_current_user),
) -> Employee:
    return await _require_role(current_user, EmployeeRole.delivery)


async def require_finance(
    current_user: Employee = Depends(get_current_user),
) -> Employee:
    return await _require_role(current_user, EmployeeRole.finance)


CurrentUser = Annotated[Employee, Depends(get_current_user)]
AdminUser = Annotated[Employee, Depends(require_admin)]
WarehouseManagerUser = Annotated[Employee, Depends(require_warehouse_manager)]
WarehouseUser = WarehouseManagerUser
DeliveryUser = Annotated[Employee, Depends(require_delivery)]
FinanceUser = Annotated[Employee, Depends(require_finance)]
