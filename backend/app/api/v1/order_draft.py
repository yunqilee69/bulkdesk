from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.schemas.common import ResponseBase
from app.schemas.order_draft import (
    OrderDraftAbandonRequest,
    OrderDraftConflictOut,
    OrderDraftCreateRequest,
    OrderDraftOut,
    OrderDraftSaveRequest,
    OrderDraftSubmitOut,
    OrderDraftSubmitRequest,
    OrderDraftTakeoverOut,
    OrderDraftTakeoverRequest,
)
from app.services.order_draft_service import (
    DraftConflictError,
    abandon_draft,
    get_draft,
    get_or_create_draft,
    list_available_drafts,
    list_my_drafts,
    save_draft,
    submit_draft,
    take_over_draft,
)

router = APIRouter(tags=["移动端草稿订单"])


def _draft_out(draft) -> OrderDraftOut:
    return OrderDraftOut.model_validate(draft)


def _map_error(error: Exception) -> HTTPException:
    if isinstance(error, DraftConflictError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=OrderDraftConflictOut(
                draft_id=error.draft.id,
                expected_version=error.expected_version,
                actual_version=error.draft.version,
            ).model_dump(mode="json"),
        )
    if isinstance(error, PermissionError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error))
    status_code = status.HTTP_404_NOT_FOUND if str(error) in {"草稿不存在", "客户不存在"} else status.HTTP_400_BAD_REQUEST
    return HTTPException(status_code=status_code, detail=str(error))


@router.post("/", response_model=ResponseBase[OrderDraftOut], status_code=status.HTTP_201_CREATED)
async def create(
    req: OrderDraftCreateRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(data=_draft_out(await get_or_create_draft(db, req, current_user)))
    except Exception as error:
        raise _map_error(error)


@router.get("/", response_model=ResponseBase[list[OrderDraftOut]])
async def list_mine(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        drafts = await list_my_drafts(db, current_user)
        return ResponseBase(data=[_draft_out(draft) for draft in drafts])
    except Exception as error:
        raise _map_error(error)


@router.get("/available", response_model=ResponseBase[list[OrderDraftOut]])
async def available(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        drafts = await list_available_drafts(db, current_user)
        return ResponseBase(data=[_draft_out(draft) for draft in drafts])
    except Exception as error:
        raise _map_error(error)


@router.get("/{draft_id}", response_model=ResponseBase[OrderDraftOut])
async def get(
    draft_id: UUID,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(data=_draft_out(await get_draft(db, draft_id, current_user)))
    except Exception as error:
        raise _map_error(error)


@router.put("/{draft_id}", response_model=ResponseBase[OrderDraftOut])
async def save(
    draft_id: UUID,
    req: OrderDraftSaveRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(data=_draft_out(await save_draft(db, draft_id, req, current_user)))
    except Exception as error:
        raise _map_error(error)


@router.post("/{draft_id}/takeover", response_model=ResponseBase[OrderDraftTakeoverOut])
async def takeover(
    draft_id: UUID,
    req: OrderDraftTakeoverRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await take_over_draft(db, draft_id, req, current_user)
        if not result.previous_owner:
            raise ValueError("原草稿负责人不存在")
        return ResponseBase(
            data=OrderDraftTakeoverOut(
                draft=_draft_out(result.draft),
                previous_owner_employee_id=result.previous_owner.id,
                previous_owner_employee_name=result.previous_owner.name,
            )
        )
    except Exception as error:
        raise _map_error(error)


@router.post("/{draft_id}/abandon", response_model=ResponseBase[OrderDraftOut])
async def abandon(
    draft_id: UUID,
    req: OrderDraftAbandonRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(data=_draft_out(await abandon_draft(db, draft_id, req, current_user)))
    except Exception as error:
        raise _map_error(error)


@router.post("/{draft_id}/submit", response_model=ResponseBase[OrderDraftSubmitOut])
async def submit(
    draft_id: UUID,
    req: OrderDraftSubmitRequest,
    current_user: CurrentUser,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: AsyncSession = Depends(get_db),
):
    if idempotency_key is None or not idempotency_key.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Idempotency-Key 不能为空")
    try:
        result = await submit_draft(db, draft_id, req, current_user, idempotency_key.strip())
        return ResponseBase(
            data=OrderDraftSubmitOut(
                draft=_draft_out(result.draft),
                order_id=result.order_id,
                submission_id=result.submission_id,
            )
        )
    except Exception as error:
        raise _map_error(error)
