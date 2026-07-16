from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import AdminUser, CurrentUser
from app.schemas.common import PaginatedResponse, ResponseBase
from app.schemas.customer import CustomerLevelCreate, CustomerLevelOut, CustomerLevelUpdate
from app.services.level_service import (
    create_level,
    delete_level,
    get_level,
    list_levels,
    update_level,
)

router = APIRouter(prefix="/levels", tags=["Level"])


@router.post("", response_model=ResponseBase[CustomerLevelOut], status_code=status.HTTP_201_CREATED)
async def create(
    req: CustomerLevelCreate,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        level = await create_level(db, req)
        return ResponseBase(data=CustomerLevelOut.model_validate(level))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", response_model=ResponseBase[PaginatedResponse[CustomerLevelOut]])
async def list_all(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    result = await list_levels(db, page, page_size)
    return ResponseBase(data=result)


# --- Level CRUD endpoints (parameterized routes must come last) ---


@router.get("/{level_id}", response_model=ResponseBase[CustomerLevelOut])
async def get(
    level_id: str,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        level = await get_level(db, level_id)
        return ResponseBase(data=CustomerLevelOut.model_validate(level))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/{level_id}", response_model=ResponseBase[CustomerLevelOut])
async def update(
    level_id: str,
    req: CustomerLevelUpdate,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        level = await update_level(db, level_id, req)
        return ResponseBase(data=CustomerLevelOut.model_validate(level))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{level_id}", response_model=ResponseBase)
async def delete(
    level_id: str,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        await delete_level(db, level_id)
        return ResponseBase()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
