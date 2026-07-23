from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import has_any_role
from app.models.customer import Customer
from app.models.employee import Employee, EmployeeRole
from app.models.order_draft import (
    OrderDraft,
    OrderDraftEvent,
    OrderDraftEventType,
    OrderDraftItem,
    OrderDraftStatus,
    OrderDraftSubmission,
)
from app.schemas.order import OrderCreate, OrderItemCreate
from app.schemas.order_draft import (
    OrderDraftAbandonRequest,
    OrderDraftCreateRequest,
    OrderDraftSaveRequest,
    OrderDraftSubmitRequest,
    OrderDraftTakeoverRequest,
)
from app.services.order_service import create_placed_order


class DraftConflictError(ValueError):
    def __init__(self, draft: OrderDraft, expected_version: int):
        self.draft = draft
        self.expected_version = expected_version
        super().__init__("草稿已被其他操作更新，请刷新后重试")


@dataclass
class DraftTakeoverResult:
    draft: OrderDraft
    previous_owner: Employee | None


@dataclass
class DraftSubmitResult:
    draft: OrderDraft
    order_id: UUID
    submission_id: UUID


def _assert_draft_role(current_user: Employee) -> None:
    if not has_any_role(
        current_user,
        EmployeeRole.warehouse_manager,
        EmployeeRole.delivery,
    ):
        raise PermissionError("无权操作移动端草稿订单")


def _assert_owner(draft: OrderDraft, current_user: Employee) -> None:
    if draft.owner_employee_id != current_user.id and not has_any_role(
        current_user, EmployeeRole.admin
    ):
        raise PermissionError("只能操作自己的草稿")


def _assert_editing(draft: OrderDraft) -> None:
    if draft.status != OrderDraftStatus.editing:
        raise ValueError("草稿不是编辑状态")


def _assert_version(draft: OrderDraft, expected_version: int) -> None:
    if draft.version != expected_version:
        raise DraftConflictError(draft, expected_version)


def _event(
    draft: OrderDraft,
    event_type: OrderDraftEventType,
    actor: Employee,
    *,
    previous_owner: Employee | None = None,
    new_owner: Employee | None = None,
    remark: str | None = None,
) -> OrderDraftEvent:
    return OrderDraftEvent(
        draft_id=draft.id,
        event_type=event_type,
        actor_employee_id=actor.id,
        actor_employee_name=actor.name,
        previous_owner_employee_id=previous_owner.id if previous_owner else None,
        previous_owner_employee_name=previous_owner.name if previous_owner else None,
        new_owner_employee_id=new_owner.id if new_owner else None,
        new_owner_employee_name=new_owner.name if new_owner else None,
        version=draft.version,
        remark=remark,
    )


async def _load_draft(db: AsyncSession, draft_id: str | UUID, *, lock: bool = False) -> OrderDraft:
    statement = (
        select(OrderDraft)
        .options(selectinload(OrderDraft.items), selectinload(OrderDraft.events))
        .where(OrderDraft.id == draft_id)
    )
    if lock:
        statement = statement.with_for_update()
    draft = (await db.execute(statement)).scalar_one_or_none()
    if not draft:
        raise ValueError("草稿不存在")
    return draft


async def get_or_create_draft(
    db: AsyncSession,
    req: OrderDraftCreateRequest,
    current_user: Employee,
) -> OrderDraft:
    _assert_draft_role(current_user)
    customer = (
        await db.execute(select(Customer).where(Customer.id == req.customer_id))
    ).scalar_one_or_none()
    if not customer:
        raise ValueError("客户不存在")

    existing = (
        await db.execute(
            select(OrderDraft)
            .options(selectinload(OrderDraft.items), selectinload(OrderDraft.events))
            .where(
                OrderDraft.customer_id == req.customer_id,
                OrderDraft.owner_employee_id == current_user.id,
                OrderDraft.status == OrderDraftStatus.editing,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    draft = OrderDraft(
        customer_id=req.customer_id,
        owner_employee_id=current_user.id,
        remark=req.remark,
    )
    db.add(draft)
    await db.flush()
    db.add(_event(draft, OrderDraftEventType.created, current_user, remark=req.remark))
    await db.flush()
    await db.refresh(draft, attribute_names=["items", "events"])
    return draft


async def list_available_drafts(db: AsyncSession, current_user: Employee) -> list[OrderDraft]:
    _assert_draft_role(current_user)
    result = await db.execute(
        select(OrderDraft)
        .options(selectinload(OrderDraft.items), selectinload(OrderDraft.events))
        .where(
            OrderDraft.status == OrderDraftStatus.editing,
            OrderDraft.owner_employee_id != current_user.id,
        )
        .order_by(OrderDraft.updated_at.desc())
    )
    return list(result.scalars().all())


async def list_my_drafts(db: AsyncSession, current_user: Employee) -> list[OrderDraft]:
    _assert_draft_role(current_user)
    result = await db.execute(
        select(OrderDraft)
        .options(selectinload(OrderDraft.items), selectinload(OrderDraft.events))
        .where(
            OrderDraft.owner_employee_id == current_user.id,
            OrderDraft.status == OrderDraftStatus.editing,
        )
        .order_by(OrderDraft.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_draft(
    db: AsyncSession,
    draft_id: str | UUID,
    current_user: Employee,
) -> OrderDraft:
    _assert_draft_role(current_user)
    draft = await _load_draft(db, draft_id)
    _assert_owner(draft, current_user)
    return draft


async def save_draft(
    db: AsyncSession,
    draft_id: str | UUID,
    req: OrderDraftSaveRequest,
    current_user: Employee,
) -> OrderDraft:
    _assert_draft_role(current_user)
    draft = await _load_draft(db, draft_id, lock=True)
    _assert_editing(draft)
    _assert_owner(draft, current_user)
    _assert_version(draft, req.version)

    await db.execute(delete(OrderDraftItem).where(OrderDraftItem.draft_id == draft.id))
    await db.flush()
    for item in req.items:
        db.add(
            OrderDraftItem(
                draft_id=draft.id,
                product_id=UUID(item.product_id),
                quantity=item.quantity,
                remark=item.remark,
            )
        )
    draft.remark = req.remark
    draft.version += 1
    db.add(_event(draft, OrderDraftEventType.saved, current_user, remark=req.remark))
    await db.flush()
    return await _load_draft(db, draft.id)


async def take_over_draft(
    db: AsyncSession,
    draft_id: str | UUID,
    req: OrderDraftTakeoverRequest,
    current_user: Employee,
) -> DraftTakeoverResult:
    _assert_draft_role(current_user)
    draft = await _load_draft(db, draft_id, lock=True)
    _assert_editing(draft)
    _assert_version(draft, req.version)
    previous_owner = await db.get(Employee, draft.owner_employee_id)
    draft.owner_employee_id = current_user.id
    draft.version += 1
    db.add(
        _event(
            draft,
            OrderDraftEventType.taken_over,
            current_user,
            previous_owner=previous_owner,
            new_owner=current_user,
        )
    )
    await db.flush()
    return DraftTakeoverResult(draft=await _load_draft(db, draft.id), previous_owner=previous_owner)


async def abandon_draft(
    db: AsyncSession,
    draft_id: str | UUID,
    req: OrderDraftAbandonRequest,
    current_user: Employee,
) -> OrderDraft:
    _assert_draft_role(current_user)
    draft = await _load_draft(db, draft_id, lock=True)
    _assert_editing(draft)
    _assert_owner(draft, current_user)
    _assert_version(draft, req.version)
    draft.status = OrderDraftStatus.abandoned
    draft.abandoned_at = datetime.utcnow()
    draft.version += 1
    db.add(_event(draft, OrderDraftEventType.abandoned, current_user))
    await db.flush()
    return await _load_draft(db, draft.id)


async def submit_draft(
    db: AsyncSession,
    draft_id: str | UUID,
    req: OrderDraftSubmitRequest,
    current_user: Employee,
    idempotency_key: str,
) -> DraftSubmitResult:
    _assert_draft_role(current_user)
    if not idempotency_key.strip():
        raise ValueError("Idempotency-Key 不能为空")

    draft = await _load_draft(db, draft_id, lock=True)
    _assert_owner(draft, current_user)
    existing_submission = (
        await db.execute(
            select(OrderDraftSubmission).where(
                OrderDraftSubmission.draft_id == draft.id,
                OrderDraftSubmission.idempotency_key == idempotency_key,
            )
        )
    ).scalar_one_or_none()
    if existing_submission and existing_submission.order_id:
        return DraftSubmitResult(
            draft=draft,
            order_id=existing_submission.order_id,
            submission_id=existing_submission.id,
        )

    _assert_editing(draft)
    _assert_version(draft, req.version)
    if not draft.items:
        raise ValueError("草稿商品不能为空")

    submission = existing_submission or OrderDraftSubmission(
        draft_id=draft.id,
        idempotency_key=idempotency_key,
    )
    if not existing_submission:
        db.add(submission)
        await db.flush()

    order_req = OrderCreate(
        customer_id=str(draft.customer_id),
        items=[
            OrderItemCreate(product_id=str(item.product_id), quantity=item.quantity)
            for item in draft.items
        ],
        remark=draft.remark,
    )
    try:
        order = await create_placed_order(db, order_req, current_user)
    except Exception:
        db.add(_event(draft, OrderDraftEventType.submit_failed, current_user))
        await db.flush()
        raise

    draft.status = OrderDraftStatus.submitted
    draft.submitted_order_id = order.id
    draft.version += 1
    submission.order_id = order.id
    db.add(_event(draft, OrderDraftEventType.submitted, current_user))
    await db.flush()
    return DraftSubmitResult(
        draft=await _load_draft(db, draft.id),
        order_id=order.id,
        submission_id=submission.id,
    )
