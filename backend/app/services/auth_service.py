from datetime import datetime, timezone

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import normalize_roles
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_password,
)
from app.models.employee import Employee, EmployeeRole, EmployeeStatus
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse


async def login(
    db: AsyncSession, redis: Redis, req: LoginRequest
) -> TokenResponse:
    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.role_assignments))
        .where(Employee.username == req.username)
    )
    employee = result.scalar_one_or_none()
    if employee is None:
        raise ValueError("Invalid username or password")
    if not verify_password(req.password, employee.password_hash):
        raise ValueError("Invalid username or password")
    if employee.status != EmployeeStatus.active:
        raise ValueError("Employee account is disabled")

    role = _legacy_token_role(employee)
    access_token, _ = create_access_token(
        employee.username, role, employee_id=str(employee.id)
    )
    refresh_token, _ = create_refresh_token(employee.username, role)

    employee.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.flush()

    return TokenResponse(
        access_token=access_token, refresh_token=refresh_token
    )


async def logout(redis: Redis, token: str) -> None:
    payload = decode_token(token)
    jti = payload.get("jti")
    exp = payload.get("exp")

    if jti and exp:
        import time
        ttl = max(int(exp - time.time()), 0)
        if ttl > 0:
            await redis.setex(f"token_blacklist:{jti}", ttl, "1")


async def refresh_access_token(
    db: AsyncSession, redis: Redis, req: RefreshRequest
) -> TokenResponse:
    try:
        payload = decode_token(req.refresh_token)
    except ValueError:
        raise ValueError("Invalid refresh token")

    if payload.get("type") != "refresh":
        raise ValueError("Invalid refresh token")

    jti = payload.get("jti")
    if jti:
        is_blacklisted = await redis.get(f"token_blacklist:{jti}")
        if is_blacklisted:
            raise ValueError("Refresh token has been revoked")

    username = payload.get("sub")
    if not username:
        raise ValueError("Invalid refresh token")

    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.role_assignments))
        .where(Employee.username == username)
    )
    employee = result.scalar_one_or_none()
    if employee is None or employee.status != EmployeeStatus.active:
        raise ValueError("Employee account not found or disabled")

    # Blacklist old refresh token
    if jti:
        import time

        exp = payload.get("exp")
        ttl = max(int(exp - time.time()), 0) if exp else 0
        if ttl > 0:
            await redis.setex(f"token_blacklist:{jti}", ttl, "1")

    role = _legacy_token_role(employee)
    access_token, _ = create_access_token(
        employee.username, role, employee_id=str(employee.id)
    )
    refresh_token, _ = create_refresh_token(employee.username, role)

    return TokenResponse(
        access_token=access_token, refresh_token=refresh_token
    )


def _legacy_token_role(employee: Employee) -> str:
    roles = normalize_roles(employee.roles)
    if not roles:
        raise ValueError("Employee has no roles")
    if EmployeeRole.admin in roles:
        return EmployeeRole.admin.value
    return roles[0].value
