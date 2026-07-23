from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import has_any_role
from app.models.customer import Customer, MemberPrice
from app.models.employee import Employee, EmployeeRole
from app.models.inventory import Inventory, Warehouse
from app.models.order import Order, OrderStatus
from app.models.order_delivery import OrderDelivery, OrderDeliveryStatus
from app.models.product import Brand, Category, CategoryStatus, Product, ProductStatus
from app.schemas.common import PaginatedResponse
from app.schemas.mobile import (
    MobileCustomerSummaryOut,
    MobileDashboardActionOut,
    MobileDashboardOut,
    MobileProductBarcodeOut,
    MobileProductCategoryOut,
    MobileProductListItemOut,
    MobileProductPriceSource,
    MobileWarehouseStockOut,
)


async def get_mobile_dashboard(db: AsyncSession, current_user: Employee) -> MobileDashboardOut:
    actions: list[MobileDashboardActionOut] = []
    if has_any_role(current_user, EmployeeRole.admin, EmployeeRole.warehouse_manager):
        actions.extend(
            [
                MobileDashboardActionOut(key="customers", title="客户查询", path="customers"),
                MobileDashboardActionOut(key="orders", title="草稿下单", path="orders"),
                MobileDashboardActionOut(key="inventory", title="库存作业", path="inventory"),
            ]
        )
    if has_any_role(current_user, EmployeeRole.admin, EmployeeRole.delivery):
        actions.append(MobileDashboardActionOut(key="delivery", title="配送任务", path="delivery"))
    if has_any_role(current_user, EmployeeRole.finance):
        actions.append(MobileDashboardActionOut(key="payments", title="收款核对", path="payments"))

    delivery_count = (
        await db.execute(
            select(func.count())
            .select_from(OrderDelivery)
            .where(
                OrderDelivery.delivery_employee_id == current_user.id,
                OrderDelivery.status == OrderDeliveryStatus.delivering,
            )
        )
    ).scalar() or 0
    return MobileDashboardOut(
        actions=actions,
        summary={"delivery_task_count": delivery_count},
        alerts=[],
    )


async def get_customer_summary(
    db: AsyncSession,
    customer_id: str,
    current_user: Employee,
) -> MobileCustomerSummaryOut:
    if (
        EmployeeRole.delivery in current_user.roles
        and EmployeeRole.warehouse_manager not in current_user.roles
        and EmployeeRole.admin not in current_user.roles
    ):
        assigned = (
            await db.execute(
                select(OrderDelivery.id)
                .join(Order, OrderDelivery.order_id == Order.id)
                .where(
                    Order.customer_id == customer_id,
                    OrderDelivery.delivery_employee_id == current_user.id,
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if not assigned:
            raise PermissionError("无权查看未分配配送客户")
    elif not has_any_role(current_user, EmployeeRole.admin, EmployeeRole.warehouse_manager):
        raise PermissionError("无权查看客户摘要")

    customer = (
        await db.execute(
            select(Customer)
            .options(selectinload(Customer.level))
            .where(Customer.id == customer_id)
        )
    ).scalar_one_or_none()
    if not customer:
        raise ValueError("客户不存在")

    open_order_count = (
        await db.execute(
            select(func.count())
            .select_from(Order)
            .where(
                Order.customer_id == customer.id,
                Order.status.notin_([OrderStatus.completed, OrderStatus.cancelled]),
            )
        )
    ).scalar() or 0
    delivering_order_count = (
        await db.execute(
            select(func.count())
            .select_from(OrderDelivery)
            .join(Order, OrderDelivery.order_id == Order.id)
            .where(
                Order.customer_id == customer.id,
                OrderDelivery.status == OrderDeliveryStatus.delivering,
            )
        )
    ).scalar() or 0

    return MobileCustomerSummaryOut(
        id=customer.id,
        name=customer.name,
        contact_name=customer.contact_name,
        contact_phone=customer.contact_phone,
        level_name=customer.level.name if customer.level else None,
        address=customer.address,
        total_spent=float(customer.total_spent or 0),
        order_count=customer.order_count,
        last_order_at=customer.last_order_at,
        open_order_count=open_order_count,
        delivering_order_count=delivering_order_count,
    )


async def get_product_barcode_summary(
    db: AsyncSession,
    barcode: str,
    current_user: Employee,
) -> MobileProductBarcodeOut:
    if not has_any_role(current_user, EmployeeRole.admin, EmployeeRole.warehouse_manager, EmployeeRole.delivery):
        raise PermissionError("无权查看商品条码摘要")
    product = (
        await db.execute(
            select(Product).where(
                Product.barcode == barcode,
                Product.status == ProductStatus.active,
            )
        )
    ).scalar_one_or_none()
    if not product:
        raise ValueError("商品不存在")

    rows = (
        await db.execute(
            select(
                Inventory.warehouse_id,
                Warehouse.name.label("warehouse_name"),
                func.coalesce(func.sum(Inventory.quantity), 0).label("quantity"),
                func.coalesce(func.sum(Inventory.locked), 0).label("locked"),
            )
            .join(Warehouse, Inventory.warehouse_id == Warehouse.id)
            .where(Inventory.product_id == product.id)
            .group_by(Inventory.warehouse_id, Warehouse.name)
            .order_by(Warehouse.name)
        )
    ).all()
    warehouses = [
        MobileWarehouseStockOut(
            warehouse_id=row.warehouse_id,
            warehouse_name=row.warehouse_name,
            quantity=int(row.quantity or 0),
            locked=int(row.locked or 0),
            available_quantity=int((row.quantity or 0) - (row.locked or 0)),
        )
        for row in rows
    ]
    return MobileProductBarcodeOut(
        id=product.id,
        name=product.name,
        short_name=product.short_name,
        barcode=product.barcode,
        unit=product.unit,
        standard_price=product.standard_price,
        status=product.status,
        warehouses=warehouses,
    )


async def list_mobile_product_categories(db: AsyncSession) -> list[MobileProductCategoryOut]:
    rows = (
        await db.execute(
            select(Category)
            .where(Category.status == CategoryStatus.active)
            .order_by(Category.name)
        )
    ).scalars().all()
    return [MobileProductCategoryOut(id=row.id, name=row.name) for row in rows]


def _row_attr(row, name: str):
    if hasattr(row, name):
        return getattr(row, name)
    if hasattr(row, "_mapping") and name in row._mapping:
        return row._mapping[name]
    return None


async def list_mobile_products(
    db: AsyncSession,
    current_user: Employee,
    page: int = 1,
    page_size: int = 20,
    keyword: str | None = None,
    category_id: str | None = None,
    recommend: bool = False,
    customer_id: str | None = None,
) -> PaginatedResponse[MobileProductListItemOut]:
    if not has_any_role(current_user, EmployeeRole.admin, EmployeeRole.warehouse_manager, EmployeeRole.delivery):
        raise PermissionError("无权查看移动端商品目录")

    customer = None
    if customer_id:
        customer = (
            await db.execute(select(Customer).where(Customer.id == customer_id))
        ).scalar_one_or_none()
        if not customer:
            raise ValueError("客户不存在")

    inventory_totals = (
        select(
            Inventory.product_id.label("product_id"),
            func.sum(Inventory.quantity - Inventory.locked).label("available_quantity"),
        )
        .group_by(Inventory.product_id)
        .subquery()
    )

    member_price_column = MemberPrice.price.label("member_price") if customer else None
    selected_columns = [
        Product,
        Category.name.label("category_name"),
        Brand.name.label("brand_name"),
        func.coalesce(inventory_totals.c.available_quantity, 0).label("available_quantity"),
    ]
    if member_price_column is not None:
        selected_columns.append(member_price_column)

    query = (
        select(*selected_columns)
        .join(Category, Product.category_id == Category.id)
        .outerjoin(Brand, Product.brand_id == Brand.id)
        .outerjoin(inventory_totals, inventory_totals.c.product_id == Product.id)
    )
    count = select(func.count()).select_from(Product)
    if customer:
        query = query.outerjoin(
            MemberPrice,
            and_(
                MemberPrice.product_id == Product.id,
                MemberPrice.level_id == customer.level_id,
            ),
        )

    conditions = [Product.status == ProductStatus.active]
    if category_id:
        conditions.append(Product.category_id == category_id)
    if keyword and keyword.strip():
        keyword_filter = f"%{keyword.strip()}%"
        conditions.append(
            or_(
                Product.name.ilike(keyword_filter),
                Product.short_name.ilike(keyword_filter),
                Product.barcode.ilike(keyword_filter),
            )
        )

    for condition in conditions:
        query = query.where(condition)
        count = count.where(condition)

    total = (await db.execute(count)).scalar() or 0
    order_by = func.random() if recommend else Product.created_at.desc()
    rows = (
        await db.execute(
            query.order_by(order_by)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()

    items: list[MobileProductListItemOut] = []
    for row in rows:
        product = _row_attr(row, "product") or _row_attr(row, "Product") or row[0]
        image_urls = product.image_urls if isinstance(product.image_urls, list) else []
        member_price = _row_attr(row, "member_price")
        display_price = member_price if member_price is not None else product.standard_price
        price_source = (
            MobileProductPriceSource.member
            if member_price is not None
            else MobileProductPriceSource.standard
        )
        items.append(
            MobileProductListItemOut(
                id=product.id,
                name=product.name,
                short_name=product.short_name,
                barcode=product.barcode,
                category_id=product.category_id,
                category_name=_row_attr(row, "category_name"),
                brand_id=product.brand_id,
                brand_name=_row_attr(row, "brand_name"),
                unit=product.unit,
                image_url=image_urls[0] if image_urls else None,
                standard_price=product.standard_price,
                display_price=display_price,
                price_source=price_source,
                status=product.status,
                available_quantity=int(_row_attr(row, "available_quantity") or 0),
            )
        )

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)
