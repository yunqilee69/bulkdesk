from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import CustomerLevel, MemberPrice
from app.models.product import Brand, Category, PriceChangeLog, PriceType, Product, ProductStatus
from app.schemas.common import PaginatedResponse
from app.schemas.product import (
    BrandCreate, BrandOut, BrandUpdate, CategoryCreate, CategoryOut, CategoryUpdate,
    MemberPriceBatchUpdate, MemberPriceItemOut, PriceChangeLogOut, PriceChangeRequest,
    ProductCreate, ProductOut, ProductUpdate,
)


async def _page(db, model, out_type, page, page_size):
    total = (await db.execute(select(func.count()).select_from(model))).scalar() or 0
    result = await db.execute(select(model).order_by(model.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return PaginatedResponse(items=[out_type.model_validate(item) for item in result.scalars().all()], total=total, page=page, page_size=page_size)


async def create_brand(db: AsyncSession, req: BrandCreate):
    brand = Brand(**req.model_dump()); db.add(brand); await db.flush(); await db.refresh(brand); return BrandOut.model_validate(brand)
async def list_brands(db: AsyncSession, page=1, page_size=20): return await _page(db, Brand, BrandOut, page, page_size)
async def update_brand(db: AsyncSession, brand_id: str, req: BrandUpdate):
    brand = (await db.execute(select(Brand).where(Brand.id == brand_id))).scalar_one_or_none()
    if not brand: raise ValueError("品牌不存在")
    for field, value in req.model_dump(exclude_unset=True).items(): setattr(brand, field, value)
    await db.flush(); return BrandOut.model_validate(brand)


async def create_category(db: AsyncSession, req: CategoryCreate):
    category = Category(**req.model_dump()); db.add(category); await db.flush(); await db.refresh(category); return CategoryOut.model_validate(category)
async def list_categories(db: AsyncSession, page=1, page_size=20): return await _page(db, Category, CategoryOut, page, page_size)
async def update_category(db: AsyncSession, category_id: str, req: CategoryUpdate):
    category = (await db.execute(select(Category).where(Category.id == category_id))).scalar_one_or_none()
    if not category: raise ValueError("分类不存在")
    for field, value in req.model_dump(exclude_unset=True).items(): setattr(category, field, value)
    await db.flush(); return CategoryOut.model_validate(category)


async def _require_product(db: AsyncSession, product_id: str):
    product = (await db.execute(select(Product).where(Product.id == product_id))).scalar_one_or_none()
    if not product: raise ValueError("商品不存在")
    return product

async def _populate_product_out(db: AsyncSession, product: Product):
    out = ProductOut.model_validate(product)
    out.category_name = (await db.execute(select(Category.name).where(Category.id == product.category_id))).scalar_one_or_none()
    if product.brand_id: out.brand_name = (await db.execute(select(Brand.name).where(Brand.id == product.brand_id))).scalar_one_or_none()
    return out

async def create_product(db: AsyncSession, req: ProductCreate, operator_name: Optional[str] = None):
    if not (await db.execute(select(Category.id).where(Category.id == req.category_id, Category.status == "active"))).scalar_one_or_none(): raise ValueError("分类不存在或已停用")
    if req.brand_id and not (await db.execute(select(Brand.id).where(Brand.id == req.brand_id))).scalar_one_or_none(): raise ValueError("品牌不存在")
    if (await db.execute(select(Product.id).where(Product.barcode == req.barcode))).scalar_one_or_none(): raise ValueError("条形码已存在")
    if req.member_prices:
        level_ids = [item.level_id for item in req.member_prices]
        levels = (
            await db.execute(select(CustomerLevel).where(CustomerLevel.id.in_(level_ids)))
        ).scalars().all()
        if {str(level.id) for level in levels} != set(level_ids):
            raise ValueError("会员等级不存在")

    data = req.model_dump(exclude={"price_reason", "member_prices"})
    product = Product(**data)
    db.add(product)
    await db.flush()

    member_prices = [
        MemberPrice(product_id=product.id, level_id=item.level_id, price=item.price)
        for item in req.member_prices
    ]
    logs = [
        PriceChangeLog(product_id=product.id, price_type=PriceType.standard_price, old_value=None, new_value=product.standard_price, reason=req.price_reason, operator_name=operator_name),
        PriceChangeLog(product_id=product.id, price_type=PriceType.cost_price, old_value=None, new_value=product.cost_price, reason=req.price_reason, operator_name=operator_name),
        *[
            PriceChangeLog(product_id=product.id, price_type=PriceType.member_price, level_id=item.level_id, old_value=None, new_value=item.price, reason=req.price_reason, operator_name=operator_name)
            for item in req.member_prices
        ],
    ]
    db.add_all([*member_prices, *logs])
    await db.flush()
    return await _populate_product_out(db, product)

async def list_products(db: AsyncSession, page=1, page_size=20, keyword: Optional[str] = None, category_id: Optional[str] = None, barcode: Optional[str] = None, status: Optional[ProductStatus] = None):
    query = select(Product); count = select(func.count()).select_from(Product)
    for cond in [Product.name.ilike(f"%{keyword}%") if keyword else None, Product.category_id == category_id if category_id else None, Product.barcode.ilike(f"%{barcode}%") if barcode else None, Product.status == status if status else None]:
        if cond is not None: query, count = query.where(cond), count.where(cond)
    total = (await db.execute(count)).scalar() or 0
    products = (await db.execute(query.order_by(Product.created_at.desc()).offset((page-1)*page_size).limit(page_size))).scalars().all()
    return PaginatedResponse(items=[await _populate_product_out(db, product) for product in products], total=total, page=page, page_size=page_size)

async def get_product(db: AsyncSession, product_id: str): return await _populate_product_out(db, await _require_product(db, product_id))
async def update_product(db: AsyncSession, product_id: str, req: ProductUpdate):
    product = await _require_product(db, product_id)
    if req.category_id and not (await db.execute(select(Category.id).where(Category.id == req.category_id))).scalar_one_or_none(): raise ValueError("分类不存在")
    for field, value in req.model_dump(exclude_unset=True).items(): setattr(product, field, value)
    await db.flush(); await db.refresh(product); return await _populate_product_out(db, product)


async def list_member_prices(db: AsyncSession, product_id: str):
    await _require_product(db, product_id)
    rows = await db.execute(
        select(CustomerLevel.id, CustomerLevel.name, MemberPrice.price)
        .outerjoin(
            MemberPrice,
            and_(
                MemberPrice.level_id == CustomerLevel.id,
                MemberPrice.product_id == product_id,
            ),
        )
        .order_by(CustomerLevel.sort_order, CustomerLevel.created_at)
    )
    return [
        MemberPriceItemOut(level_id=str(level_id), level_name=level_name, price=price)
        for level_id, level_name, price in rows.all()
    ]


async def batch_update_member_prices(
    db: AsyncSession,
    product_id: str,
    req: MemberPriceBatchUpdate,
    operator_name: Optional[str] = None,
):
    product = await _require_product(db, product_id)
    level_ids = [item.level_id for item in req.items]
    levels = (
        await db.execute(select(CustomerLevel).where(CustomerLevel.id.in_(level_ids)))
    ).scalars().all()
    if {str(level.id) for level in levels} != set(level_ids):
        raise ValueError("会员等级不存在")
    existing_prices = (
        await db.execute(
            select(MemberPrice).where(
                MemberPrice.product_id == product.id,
                MemberPrice.level_id.in_(level_ids),
            )
        )
    ).scalars().all()
    prices_by_level_id = {str(member_price.level_id): member_price for member_price in existing_prices}

    for item in req.items:
        member_price = prices_by_level_id.get(item.level_id)
        old_value = member_price.price if member_price else None
        if old_value == item.price:
            continue
        if member_price:
            member_price.price = item.price
        else:
            db.add(MemberPrice(product_id=product.id, level_id=item.level_id, price=item.price))
        db.add(
            PriceChangeLog(
                product_id=product.id,
                price_type=PriceType.member_price,
                level_id=item.level_id,
                old_value=old_value,
                new_value=item.price,
                reason=req.reason or "",
                operator_name=operator_name,
            )
        )
    await db.flush()
    return await _populate_product_out(db, product)

async def change_price(db: AsyncSession, product_id: str, price_type: PriceType, req: PriceChangeRequest, operator_name: Optional[str] = None, level_id: Optional[str] = None):
    product = await _require_product(db, product_id)
    if price_type == PriceType.member_price:
        if not level_id: raise ValueError("会员价必须指定等级")
        if not (await db.execute(select(CustomerLevel.id).where(CustomerLevel.id == level_id))).scalar_one_or_none(): raise ValueError("会员等级不存在")
        member_price = (await db.execute(select(MemberPrice).where(MemberPrice.product_id == product.id, MemberPrice.level_id == level_id))).scalar_one_or_none()
        old_value = member_price.price if member_price else None
        if member_price: member_price.price = req.price
        else: db.add(MemberPrice(product_id=product.id, level_id=level_id, price=req.price))
    else:
        field = "standard_price" if price_type == PriceType.standard_price else "cost_price"; old_value = getattr(product, field); setattr(product, field, req.price)
    db.add(PriceChangeLog(product_id=product.id, price_type=price_type, level_id=level_id, old_value=old_value, new_value=req.price, reason=req.reason, operator_name=operator_name)); await db.flush(); return await _populate_product_out(db, product)

async def list_price_change_logs(db: AsyncSession, product_id: Optional[str] = None, page=1, page_size=20):
    query = select(PriceChangeLog, CustomerLevel.name); count = select(func.count()).select_from(PriceChangeLog)
    query = query.outerjoin(CustomerLevel, CustomerLevel.id == PriceChangeLog.level_id)
    if product_id: query, count = query.where(PriceChangeLog.product_id == product_id), count.where(PriceChangeLog.product_id == product_id)
    total = (await db.execute(count)).scalar() or 0; rows = (await db.execute(query.order_by(PriceChangeLog.created_at.desc()).offset((page-1)*page_size).limit(page_size))).all()
    items = []
    for log, level_name in rows:
        item = PriceChangeLogOut.model_validate(log)
        item.level_name = level_name
        items.append(item)
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)
