from typing import Optional

from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash, verify_password
from app.models.employee import Employee, EmployeeRole, EmployeeStatus
from app.schemas.common import PaginatedResponse
from app.schemas.employee import EmployeeCreate, EmployeeOut, EmployeeUpdate


async def create_employee(db: AsyncSession, req: EmployeeCreate) -> Employee:
    result = await db.execute(select(Employee).where(Employee.username == req.username))
    if result.scalar_one_or_none():
        raise ValueError("Username already exists")

    employee = Employee(
        username=req.username,
        password_hash=get_password_hash(req.password),
        name=req.name,
        phone=req.phone,
        role=req.role,
    )
    db.add(employee)
    await db.flush()
    await db.refresh(employee)
    return employee


async def list_employees(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    keyword: Optional[str] = None,
) -> PaginatedResponse[EmployeeOut]:
    query = select(Employee)
    count_query = select(func.count()).select_from(Employee)

    if keyword:
        filter_cond = Employee.name.ilike(f"%{keyword}%") | Employee.username.ilike(
            f"%{keyword}%"
        )
        query = query.where(filter_cond)
        count_query = count_query.where(filter_cond)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.order_by(Employee.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    employees = result.scalars().all()

    items = [EmployeeOut.model_validate(e) for e in employees]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


async def get_employee(db: AsyncSession, employee_id: str) -> Employee:
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    employee = result.scalar_one_or_none()
    if employee is None:
        raise ValueError("Employee not found")
    return employee


async def update_employee(
    db: AsyncSession, employee_id: str, req: EmployeeUpdate
) -> Employee:
    employee = await get_employee(db, employee_id)

    if req.status == EmployeeStatus.disabled and employee.role == EmployeeRole.admin:
        admin_count_result = await db.execute(
            select(func.count()).select_from(Employee).where(
                Employee.role == EmployeeRole.admin,
                Employee.status == EmployeeStatus.active,
            )
        )
        admin_count = admin_count_result.scalar() or 0
        if admin_count <= 1:
            raise ValueError("Cannot disable the last active admin")

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(employee, field, value)

    await db.flush()
    await db.refresh(employee)
    return employee


async def disable_employee(
    db: AsyncSession, redis: Redis, employee_id: str
) -> Employee:
    employee = await get_employee(db, employee_id)

    if employee.role == EmployeeRole.admin:
        raise ValueError("Cannot disable admin user")

    employee.status = EmployeeStatus.disabled
    await db.flush()
    await db.refresh(employee)
    return employee


async def enable_employee(db: AsyncSession, employee_id: str) -> Employee:
    employee = await get_employee(db, employee_id)
    employee.status = EmployeeStatus.active
    await db.flush()
    await db.refresh(employee)
    return employee


async def change_password(
    db: AsyncSession, employee: Employee, req
) -> Employee:
    if not verify_password(req.old_password, employee.password_hash):
        raise ValueError("Old password is incorrect")

    employee.password_hash = get_password_hash(req.new_password)
    await db.flush()
    await db.refresh(employee)
    return employee


async def reset_password(
    db: AsyncSession, employee_id: str, req
) -> Employee:
    employee = await get_employee(db, employee_id)
    employee.password_hash = get_password_hash(req.new_password)
    await db.flush()
    await db.refresh(employee)
    return employee
