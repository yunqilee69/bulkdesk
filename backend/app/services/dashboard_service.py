from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.customer import Customer
from app.models.employee import Employee
from app.models.inventory import Inventory
from app.models.order import Order, OrderItem
from app.models.product import Brand, Product
from app.schemas.dashboard import (
    CustomerRankingItem,
    DashboardStats,
    InventoryAlertItem,
    OrderTrendItem,
    ProductSaleItem,
)


async def get_dashboard_stats(
    db: AsyncSession,
    period: str = "week",
) -> DashboardStats:
    customer_total = await _count_rows(db, Customer)
    product_total = await _count_rows(db, Product)
    order_total = await _count_rows(db, Order)
    employee_total = await _count_rows(db, Employee)
    order_trend = await _get_order_trend(db, period)
    customer_ranking = await _get_customer_ranking(db)
    inventory_alerts = await _get_inventory_alerts(db)
    product_sales = await _get_product_sales(db, period)
    return DashboardStats(
        customer_total=customer_total,
        product_total=product_total,
        order_total=order_total,
        employee_total=employee_total,
        order_trend=order_trend,
        customer_ranking=customer_ranking,
        inventory_alerts=inventory_alerts,
        product_sales=product_sales,
    )


async def _count_rows(db: AsyncSession, model) -> int:
    result = await db.execute(select(func.count()).select_from(model))
    return result.scalar() or 0


async def _get_order_trend(db: AsyncSession, period: str) -> list[OrderTrendItem]:
    if period == "year":
        date_fmt = func.to_char(Order.created_at, "YYYY-MM")
        interval = timedelta(days=365)
    elif period == "month":
        date_fmt = func.to_char(Order.created_at, "YYYY-MM-DD")
        interval = timedelta(days=30)
    else:
        date_fmt = func.to_char(Order.created_at, "YYYY-MM-DD")
        interval = timedelta(days=7)

    query = (
        select(
            date_fmt.label("date"),
            func.count(Order.id).label("order_count"),
            func.coalesce(func.sum(Order.total_amount), 0).label("order_amount"),
        )
        .where(Order.created_at >= func.now() - interval)
        .where(Order.status != "cancelled")
        .group_by("date")
        .order_by("date")
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        OrderTrendItem(
            date=str(row.date),
            order_count=row.order_count,
            order_amount=float(row.order_amount),
        )
        for row in rows
    ]


async def _get_customer_ranking(db: AsyncSession, limit: int = 10) -> list[CustomerRankingItem]:
    query = (
        select(
            Order.customer_id,
            Customer.name.label("customer_name"),
            func.count(Order.id).label("order_count"),
            func.coalesce(func.sum(Order.total_amount), 0).label("total_amount"),
        )
        .join(Customer, Order.customer_id == Customer.id)
        .where(Order.status != "cancelled")
        .group_by(Order.customer_id, Customer.name)
        .order_by(func.sum(Order.total_amount).desc())
        .limit(limit)
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        CustomerRankingItem(
            customer_id=str(row.customer_id),
            customer_name=row.customer_name,
            total_amount=float(row.total_amount),
            order_count=row.order_count,
        )
        for row in rows
    ]


async def _get_inventory_alerts(db: AsyncSession) -> list[InventoryAlertItem]:
    query = (
        select(
            Product.id.label("product_id"),
            Product.barcode,
            Product.name,
            Product.image_urls,
            Product.warning_quantity,
            func.sum(Inventory.quantity).label("quantity"),
            func.sum(Inventory.locked).label("locked"),
            func.count(Inventory.warehouse_id).label("warehouse_count"),
        )
        .join(Product, Inventory.product_id == Product.id)
        .where(Product.warning_quantity > 0)
        .group_by(Product.id)
        .having(func.sum(Inventory.quantity - Inventory.locked) <= Product.warning_quantity)
        .order_by(
            (Product.warning_quantity - func.sum(Inventory.quantity - Inventory.locked)).desc()
        )
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        InventoryAlertItem(
            id=str(row.product_id),
            product_id=str(row.product_id),
            product_info=f"{row.barcode} - {row.name}",
            quantity=row.quantity,
            locked=row.locked,
            warning_quantity=row.warning_quantity,
            product_image_url=(row.image_urls or [None])[0],
            warehouse_count=row.warehouse_count,
        )
        for row in rows
    ]


async def _get_product_sales(db: AsyncSession, period: str) -> list[ProductSaleItem]:
    if period == "year":
        interval = timedelta(days=365)
    elif period == "month":
        interval = timedelta(days=30)
    else:
        interval = timedelta(days=7)

    query = (
        select(
            OrderItem.product_id,
            OrderItem.barcode,
            OrderItem.product_name,
            func.sum(OrderItem.quantity).label("total_quantity"),
            func.coalesce(func.sum(OrderItem.subtotal), 0).label("total_amount"),
        )
        .join(Order, OrderItem.order_id == Order.id)
        .where(Order.created_at >= func.now() - interval)
        .where(Order.status != "cancelled")
        .group_by(OrderItem.product_id, OrderItem.barcode, OrderItem.product_name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(10)
    )
    result = await db.execute(query)
    rows = result.all()

    return [
        ProductSaleItem(
            product_id=str(row.product_id),
            barcode=row.barcode,
            product_name=row.product_name,
            total_quantity=row.total_quantity,
            total_amount=float(row.total_amount),
        )
        for row in rows
    ]


async def _lookup_variant_info(db: AsyncSession, product_ids: list[str]) -> dict:
    from uuid import UUID

    variant_ids = [UUID(sid) for sid in product_ids]
    result = await db.execute(select(Product).where(Product.id.in_(variant_ids)))
    variants = {str(v.id): v for v in result.scalars().all()}

    product_ids = list({str(v.product_id) for v in variants.values()})
    prod_result = await db.execute(select(Product).where(Product.id.in_([UUID(pid) for pid in product_ids])))
    products = {str(p.id): p for p in prod_result.scalars().all()}

    brand_ids = list({
        str(products[str(v.product_id)].brand_id)
        for v in variants.values()
        if str(v.product_id) in products and products[str(v.product_id)].brand_id
    })
    brand_names: dict[str, str] = {}
    if brand_ids:
        brand_result = await db.execute(select(Brand).where(Brand.id.in_([UUID(bid) for bid in brand_ids])))
        brand_names = {str(b.id): b.name for b in brand_result.scalars().all()}

    info: dict[str, dict] = {}
    for v in variants.values():
        p = products.get(str(v.product_id))
        info[str(v.id)] = {
            "variant": v,
            "brand_name": brand_names.get(str(p.brand_id)) if p and p.brand_id else None,
        }
    return info


def _format_product_info(v_info: dict | None) -> str:
    if not v_info:
        return ""
    v = v_info["variant"]
    brand = v_info.get("brand_name")
    return f"{v.barcode} - {v.name}" + (f" [{brand}]" if brand else "")
