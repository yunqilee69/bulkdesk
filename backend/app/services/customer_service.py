from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.customer import Customer
from app.schemas.common import PaginatedResponse
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate


async def create_customer(db: AsyncSession, req: CustomerCreate) -> Customer:
    result = await db.execute(select(Customer).where(Customer.contact_phone == req.contact_phone))
    if result.scalar_one_or_none():
        raise ValueError("联系电话已存在")

    customer = Customer(
        name=req.name,
        contact_name=req.contact_name,
        contact_phone=req.contact_phone,
        level_id=req.level_id,
        address=req.address,
        remark=req.remark,
        image_urls=req.image_urls,
    )
    db.add(customer)
    await db.flush()
    await db.refresh(customer)
    result = await db.execute(
        select(Customer).options(selectinload(Customer.level)).where(Customer.id == customer.id)
    )
    return result.scalar_one()


async def list_customers(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    keyword: Optional[str] = None,
) -> PaginatedResponse[CustomerOut]:
    query = select(Customer).options(selectinload(Customer.level))
    count_query = select(func.count()).select_from(Customer)

    if keyword:
        filter_cond = Customer.name.ilike(f"%{keyword}%") | Customer.contact_phone.ilike(
            f"%{keyword}%"
        )
        query = query.where(filter_cond)
        count_query = count_query.where(filter_cond)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.order_by(Customer.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    customers = result.scalars().all()

    items = []
    for c in customers:
        out = CustomerOut.model_validate(c)
        if c.level:
            out.level_name = c.level.name
        items.append(out)
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


async def get_customer(db: AsyncSession, customer_id: str) -> Customer:
    result = await db.execute(
        select(Customer).options(selectinload(Customer.level)).where(Customer.id == customer_id)
    )
    customer = result.scalar_one_or_none()
    if customer is None:
        raise ValueError("Customer not found")
    return customer


async def update_customer(
    db: AsyncSession, customer_id: str, req: CustomerUpdate
) -> Customer:
    customer = await get_customer(db, customer_id)

    if req.contact_phone and req.contact_phone != customer.contact_phone:
        result = await db.execute(select(Customer).where(Customer.contact_phone == req.contact_phone))
        if result.scalar_one_or_none():
            raise ValueError("联系电话已存在")

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)

    await db.flush()
    await db.refresh(customer)
    result = await db.execute(
        select(Customer).options(selectinload(Customer.level)).where(Customer.id == customer.id)
    )
    return result.scalar_one()
