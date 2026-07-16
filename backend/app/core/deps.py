from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
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

    result = await db.execute(select(Employee).where(Employee.username == username))
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
    if current_user.role != EmployeeRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


CurrentUser = Annotated[Employee, Depends(get_current_user)]
AdminUser = Annotated[Employee, Depends(require_admin)]
