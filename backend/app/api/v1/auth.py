from fastapi import APIRouter, Depends, HTTPException, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser, oauth2_scheme
from app.core.redis import get_redis
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse
from app.schemas.common import ResponseBase
from app.services.auth_service import login as auth_login
from app.services.auth_service import logout as auth_logout
from app.services.auth_service import refresh_access_token

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=ResponseBase[TokenResponse])
async def login(
    req: LoginRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    try:
        token_resp = await auth_login(db, redis, req)
        return ResponseBase(data=token_resp)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)
        )


@router.post("/logout", response_model=ResponseBase)
async def logout(
    current_user: CurrentUser,
    token: str = Depends(oauth2_scheme),
    redis: Redis = Depends(get_redis),
):
    await auth_logout(redis, token)
    return ResponseBase()


@router.post("/refresh", response_model=ResponseBase[TokenResponse])
async def refresh(
    req: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    try:
        token_resp = await refresh_access_token(db, redis, req)
        return ResponseBase(data=token_resp)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)
        )
