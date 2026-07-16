from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import CustomerLevel, MemberPrice
from app.schemas.common import PaginatedResponse
from app.schemas.customer import (
    CustomerLevelCreate,
    CustomerLevelOut,
    CustomerLevelUpdate,
    MemberPriceCreate,
    MemberPriceOut,
    MemberPriceUpdate,
)


async def create_level(db: AsyncSession, req: CustomerLevelCreate) -> CustomerLevel:
    result = await db.execute(select(CustomerLevel).where(CustomerLevel.name == req.name))
    if result.scalar_one_or_none():
        raise ValueError("Level name already exists")

    if req.is_default:
        await _clear_default_level(db)

    level = CustomerLevel(
        name=req.name,
        min_spent=req.min_spent,
        sort_order=req.sort_order,
        is_default=req.is_default,
    )
    db.add(level)
    await db.flush()
    await db.refresh(level)
    return level


async def list_levels(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedResponse[CustomerLevelOut]:
    count_result = await db.execute(select(func.count()).select_from(CustomerLevel))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    query = (
        select(CustomerLevel)
        .order_by(CustomerLevel.sort_order.asc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(query)
    levels = result.scalars().all()

    items = [CustomerLevelOut.model_validate(l) for l in levels]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


async def get_level(db: AsyncSession, level_id: str) -> CustomerLevel:
    result = await db.execute(select(CustomerLevel).where(CustomerLevel.id == level_id))
    level = result.scalar_one_or_none()
    if level is None:
        raise ValueError("Customer level not found")
    return level


async def update_level(
    db: AsyncSession, level_id: str, req: CustomerLevelUpdate
) -> CustomerLevel:
    level = await get_level(db, level_id)

    if req.name and req.name != level.name:
        result = await db.execute(
            select(CustomerLevel).where(CustomerLevel.name == req.name)
        )
        if result.scalar_one_or_none():
            raise ValueError("Level name already exists")

    if req.is_default:
        await _clear_default_level(db)

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(level, field, value)

    await db.flush()
    await db.refresh(level)
    return level


async def delete_level(db: AsyncSession, level_id: str) -> None:
    level = await get_level(db, level_id)

    if level.is_default:
        raise ValueError("Cannot delete default level")

    from app.models.customer import Customer

    count_result = await db.execute(
        select(func.count()).select_from(Customer).where(Customer.level_id == level_id)
    )
    if (count_result.scalar() or 0) > 0:
        raise ValueError("Cannot delete level with existing customers")

    await db.delete(level)
    await db.flush()


async def _clear_default_level(db: AsyncSession) -> None:
    result = await db.execute(
        select(CustomerLevel).where(CustomerLevel.is_default == True)  # noqa: E712
    )
    current_default = result.scalar_one_or_none()
    if current_default:
        current_default.is_default = False
        await db.flush()


async def upsert_member_price(
    db: AsyncSession, req: MemberPriceCreate
) -> MemberPrice:
    result = await db.execute(
        select(MemberPrice).where(
            MemberPrice.product_id == req.product_id, MemberPrice.level_id == req.level_id
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.price = req.price
        await db.flush()
        await db.refresh(existing)
        return existing

    mp = MemberPrice(
        product_id=req.product_id,
        level_id=req.level_id,
        price=req.price,
    )
    db.add(mp)
    await db.flush()
    await db.refresh(mp)
    return mp


async def list_member_prices(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    product_id: Optional[str] = None,
    level_id: Optional[str] = None,
) -> PaginatedResponse[MemberPriceOut]:
    query = select(MemberPrice)
    count_query = select(func.count()).select_from(MemberPrice)

    if product_id:
        query = query.where(MemberPrice.product_id == product_id)
        count_query = count_query.where(MemberPrice.product_id == product_id)
    if level_id:
        query = query.where(MemberPrice.level_id == level_id)
        count_query = count_query.where(MemberPrice.level_id == level_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.order_by(MemberPrice.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    prices = result.scalars().all()

    product_ids = {str(p.product_id) for p in prices}
    level_ids = {str(p.level_id) for p in prices}

    product_info: dict = {}
    if product_ids:
        from app.models.product import Product
        product_result = await db.execute(
            select(Product.id, Product.barcode, Product.name).where(
                Product.id.in_(product_ids)
            )
        )
        product_info = {str(row[0]): (row[1], row[2]) for row in product_result.all()}

    level_names: dict = {}
    if level_ids:
        lv_result = await db.execute(
            select(CustomerLevel.id, CustomerLevel.name).where(
                CustomerLevel.id.in_(level_ids)
            )
        )
        level_names = {str(row[0]): row[1] for row in lv_result.all()}

    items = []
    for p in prices:
        out = MemberPriceOut.model_validate(p)
        info = product_info.get(str(p.product_id))
        if info:
            out.barcode = info[0]
            out.product_name = info[1]
        lname = level_names.get(str(p.level_id))
        if lname:
            out.level_name = lname
        items.append(out)
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)
