import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.inventory import (
    Inventory,
    InventoryMovement,
    InventoryMovementItem,
    MovementType,
    Supplier,
    Warehouse,
)
from app.models.product import Brand, Product
from app.schemas.common import PaginatedResponse
from app.schemas.inventory import (
    BatchStockInRequest,
    BatchStockOutRequest,
    BatchStocktakeRequest,
    BatchTransferRequest,
    InventoryListItemOut,
    InventoryMovementOut,
    InventoryOut,
    StockInRequest,
    StockOutRequest,
    StocktakeRequest,
    SupplierCreate,
    SupplierOut,
    SupplierUpdate,
    TransferRequest,
    WarehouseCreate,
    WarehouseOut,
    WarehouseUpdate,
)


# --- 供应商 CRUD ---


async def create_supplier(db: AsyncSession, req: SupplierCreate) -> Supplier:
    supplier = Supplier(
        name=req.name,
        contact_person=req.contact_person,
        contact_phone=req.contact_phone,
        address=req.address,
        remark=req.remark,
        status=req.status,
    )
    db.add(supplier)
    await db.flush()
    await db.refresh(supplier)
    return supplier


async def list_suppliers(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedResponse[SupplierOut]:
    count_result = await db.execute(select(func.count()).select_from(Supplier))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    query = (
        select(Supplier)
        .order_by(Supplier.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(query)
    suppliers = result.scalars().all()

    items = [SupplierOut.model_validate(s) for s in suppliers]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


async def get_supplier(db: AsyncSession, supplier_id: str) -> Supplier:
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    supplier = result.scalar_one_or_none()
    if supplier is None:
        raise ValueError("Supplier not found")
    return supplier


async def update_supplier(
    db: AsyncSession, supplier_id: str, req: SupplierUpdate
) -> Supplier:
    supplier = await get_supplier(db, supplier_id)
    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(supplier, field, value)
    await db.flush()
    await db.refresh(supplier)
    return supplier


# --- Warehouse CRUD ---


async def create_warehouse(db: AsyncSession, req: WarehouseCreate) -> Warehouse:
    if req.is_default:
        await _clear_default_warehouse(db)

    warehouse = Warehouse(
        name=req.name,
        address=req.address,
        remark=req.remark,
        contact_person=req.contact_person,
        contact_phone=req.contact_phone,
        is_default=req.is_default,
        status=req.status,
    )
    db.add(warehouse)
    await db.flush()
    await db.refresh(warehouse)
    return warehouse


async def list_warehouses(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedResponse[WarehouseOut]:
    count_result = await db.execute(select(func.count()).select_from(Warehouse))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    query = (
        select(Warehouse)
        .order_by(Warehouse.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(query)
    warehouses = result.scalars().all()

    items = [WarehouseOut.model_validate(w) for w in warehouses]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


async def get_warehouse(db: AsyncSession, warehouse_id: str) -> Warehouse:
    result = await db.execute(select(Warehouse).where(Warehouse.id == warehouse_id))
    warehouse = result.scalar_one_or_none()
    if warehouse is None:
        raise ValueError("Warehouse not found")
    return warehouse


async def update_warehouse(
    db: AsyncSession, warehouse_id: str, req: WarehouseUpdate
) -> Warehouse:
    warehouse = await get_warehouse(db, warehouse_id)

    if req.is_default:
        await _clear_default_warehouse(db)

    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(warehouse, field, value)
    await db.flush()
    await db.refresh(warehouse)
    return warehouse


async def _clear_default_warehouse(db: AsyncSession) -> None:
    result = await db.execute(
        select(Warehouse).where(Warehouse.is_default == True)  # noqa: E712
    )
    current_default = result.scalar_one_or_none()
    if current_default:
        current_default.is_default = False
        await db.flush()


# --- Inventory operations ---


async def _get_or_create_inventory(
    db: AsyncSession, product_id: str, warehouse_id: str
) -> Inventory:
    product_uuid = uuid.UUID(str(product_id))
    warehouse_uuid = uuid.UUID(str(warehouse_id))
    # The upsert closes the race for a 商品's first stock operation; the select
    # then serializes every quantity mutation on the same inventory row.
    await db.execute(
        pg_insert(Inventory)
        .values(
            product_id=product_uuid,
            warehouse_id=warehouse_uuid,
            quantity=0,
            locked=0,
        )
        .on_conflict_do_nothing(index_elements=["product_id", "warehouse_id"])
    )
    result = await db.execute(
        select(Inventory).where(
            Inventory.product_id == product_uuid,
            Inventory.warehouse_id == warehouse_uuid,
        ).with_for_update()
    )
    inv = result.scalar_one_or_none()
    if inv is None:
        raise RuntimeError("Inventory row could not be created")
    return inv


async def _generate_order_no(db: AsyncSession, prefix: str, model) -> str:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    date_str = now.strftime("%Y%m%d")
    full_prefix = f"{prefix}{date_str}"
    result = await db.execute(
        select(func.count()).select_from(model).where(model.order_no.like(f"{full_prefix}%"))
    )
    count = result.scalar() or 0
    seq = count + 1
    suffix = uuid.uuid4().hex[:6].upper()
    return f"{full_prefix}{seq:06d}{suffix}"


async def _require_product_info(db: AsyncSession, product_id: str) -> dict:
    info = await _lookup_product_info(db, [product_id])
    product_info = info.get(product_id)
    if not product_info:
        raise ValueError(f"Product {product_id} not found")
    return product_info


async def _enrich_movement_out(db: AsyncSession, movement: InventoryMovement) -> InventoryMovementOut:
    await db.refresh(movement, attribute_names=["items"])
    out = InventoryMovementOut.model_validate(movement)

    wh_ids = [movement.warehouse_id]
    if movement.from_warehouse_id:
        wh_ids.append(movement.from_warehouse_id)
    if movement.to_warehouse_id:
        wh_ids.append(movement.to_warehouse_id)

    wh_result = await db.execute(select(Warehouse).where(Warehouse.id.in_(wh_ids)))
    wh_map = {str(w.id): w.name for w in wh_result.scalars().all()}
    out.warehouse_name = wh_map.get(str(movement.warehouse_id))
    out.from_warehouse_name = wh_map.get(str(movement.from_warehouse_id)) if movement.from_warehouse_id else None
    out.to_warehouse_name = wh_map.get(str(movement.to_warehouse_id)) if movement.to_warehouse_id else None

    if movement.supplier_id:
        sup_result = await db.execute(select(Supplier).where(Supplier.id == movement.supplier_id))
        sup = sup_result.scalar_one_or_none()
        if sup:
            out.supplier_name = sup.name

    return out


async def _lookup_product_info(db: AsyncSession, product_ids: list[str]) -> dict:
    product_ids = [uuid.UUID(product_id) for product_id in product_ids]
    result = await db.execute(select(Product).where(Product.id.in_(product_ids)))
    products = {str(product.id): product for product in result.scalars().all()}
    brand_ids = [product.brand_id for product in products.values() if product.brand_id]
    brand_names: dict[str, str] = {}
    if brand_ids:
        brand_result = await db.execute(select(Brand).where(Brand.id.in_(brand_ids)))
        brand_names = {str(b.id): b.name for b in brand_result.scalars().all()}

    info: dict[str, dict] = {}
    for product in products.values():
        info[str(product.id)] = {
            "product": product,
            "brand_name": brand_names.get(str(product.brand_id)) if product.brand_id else None,
        }
    return info


async def stock_in(db: AsyncSession, req: StockInRequest) -> InventoryOut:
    product_info = await _require_product_info(db, req.product_id)
    v = product_info["product"]

    inv = await _get_or_create_inventory(db, req.product_id, req.warehouse_id)
    before = inv.quantity
    inv.quantity += req.quantity

    order_no = await _generate_order_no(db, "SI", InventoryMovement)
    movement = InventoryMovement(
        order_no=order_no,
        movement_type=MovementType.stock_in,
        warehouse_id=uuid.UUID(req.warehouse_id),
        remark=req.remark,
        items=[InventoryMovementItem(
            product_id=v.id,
            barcode=v.barcode,
            product_name=v.name,
            brand_name=product_info["brand_name"],
            quantity=req.quantity,
            before_quantity=before,
            after_quantity=inv.quantity,
        )],
    )
    db.add(movement)
    await db.flush()
    await db.refresh(inv)
    out = InventoryOut.model_validate(inv)
    out.available_quantity = inv.quantity - inv.locked
    return out


async def batch_stock_in(
    db: AsyncSession,
    req: BatchStockInRequest,
    operator: Optional[Employee] = None,
) -> InventoryMovementOut:
    order_no = await _generate_order_no(db, "SI", InventoryMovement)
    info = await _lookup_product_info(db, [item.product_id for item in req.items])

    price_changes: list[tuple[str, float, float]] = []
    movement_items: list[InventoryMovementItem] = []

    for item in req.items:
        product_info = info.get(item.product_id)
        if not product_info:
            raise ValueError(f"Product {item.product_id} not found")
        v = product_info["product"]

        original_cost = float(v.cost_price)
        final_cost = item.cost_price if item.cost_price is not None else original_cost

        if item.cost_price is not None and item.cost_price != original_cost:
            price_changes.append((item.product_id, original_cost, item.cost_price))
            v.cost_price = item.cost_price
            from app.models.product import PriceChangeLog, PriceType
            log = PriceChangeLog(
                product_id=v.id,
                price_type=PriceType.cost_price,
                old_value=original_cost,
                new_value=item.cost_price,
                reason=f"入库变动 - 单号: {order_no}",
                operator_name=operator.username if operator else None,
            )
            db.add(log)

        inv = await _get_or_create_inventory(db, item.product_id, req.warehouse_id)
        if req.supplier_id:
            inv.supplier_id = uuid.UUID(req.supplier_id)
        before = inv.quantity
        inv.quantity += item.quantity

        subtotal = final_cost * item.quantity
        movement_items.append(InventoryMovementItem(
            product_id=v.id,
            barcode=v.barcode,
            product_name=v.name,
            brand_name=product_info["brand_name"],
            quantity=item.quantity,
            before_quantity=before,
            after_quantity=inv.quantity,
            cost_price=final_cost,
            subtotal=subtotal,
        ))

    movement = InventoryMovement(
        order_no=order_no,
        movement_type=MovementType.stock_in,
        warehouse_id=uuid.UUID(req.warehouse_id),
        supplier_id=uuid.UUID(req.supplier_id) if req.supplier_id else None,
        operator=operator.username if operator else None,
        remark=req.remark,
        items=movement_items,
    )
    db.add(movement)
    await db.flush()
    await db.refresh(movement, attribute_names=["items"])
    return await _enrich_movement_out(db, movement)


async def batch_stock_out(
    db: AsyncSession,
    req: BatchStockOutRequest,
    operator: Optional[Employee] = None,
) -> InventoryMovementOut:
    order_no = await _generate_order_no(db, "SO", InventoryMovement)
    info = await _lookup_product_info(db, [item.product_id for item in req.items])
    movement_items: list[InventoryMovementItem] = []

    for item in req.items:
        product_info = info.get(item.product_id)
        if not product_info:
            raise ValueError(f"Product {item.product_id} not found")
        v = product_info["product"]

        inv = await _get_or_create_inventory(db, item.product_id, req.warehouse_id)
        available = inv.quantity - inv.locked
        if item.quantity > available:
            raise ValueError(
                f"Insufficient available quantity for 商品 {item.product_id}. Available: {available}, Requested: {item.quantity}"
            )
        before = inv.quantity
        inv.quantity -= item.quantity

        movement_items.append(InventoryMovementItem(
            product_id=v.id,
            barcode=v.barcode,
            product_name=v.name,
            brand_name=product_info["brand_name"],
            quantity=item.quantity,
            before_quantity=before,
            after_quantity=inv.quantity,
        ))

    movement = InventoryMovement(
        order_no=order_no,
        movement_type=MovementType.stock_out,
        warehouse_id=uuid.UUID(req.warehouse_id),
        operator=operator.username if operator else None,
        remark=req.remark,
        items=movement_items,
    )
    db.add(movement)
    await db.flush()
    await db.refresh(movement, attribute_names=["items"])
    return await _enrich_movement_out(db, movement)


async def batch_transfer(
    db: AsyncSession,
    req: BatchTransferRequest,
    operator: Optional[Employee] = None,
) -> InventoryMovementOut:
    if req.from_warehouse_id == req.to_warehouse_id:
        raise ValueError("Source and destination warehouses must be different")

    order_no = await _generate_order_no(db, "TR", InventoryMovement)
    info = await _lookup_product_info(db, [item.product_id for item in req.items])
    movement_items: list[InventoryMovementItem] = []
    in_movement_items: list[InventoryMovementItem] = []

    for item in req.items:
        product_info = info.get(item.product_id)
        if not product_info:
            raise ValueError(f"Product {item.product_id} not found")
        v = product_info["product"]

        from_inv = await _get_or_create_inventory(db, item.product_id, req.from_warehouse_id)
        available = from_inv.quantity - from_inv.locked
        if item.quantity > available:
            raise ValueError(
                f"Insufficient available quantity for 商品 {item.product_id} in source warehouse. Available: {available}, Requested: {item.quantity}"
            )

        from_before = from_inv.quantity
        from_inv.quantity -= item.quantity

        to_inv = await _get_or_create_inventory(db, item.product_id, req.to_warehouse_id)
        to_before = to_inv.quantity
        to_inv.quantity += item.quantity

        movement_items.append(InventoryMovementItem(
            product_id=v.id,
            barcode=v.barcode,
            product_name=v.name,
            brand_name=product_info["brand_name"],
            quantity=item.quantity,
            before_quantity=from_before,
            after_quantity=from_inv.quantity,
        ))
        in_movement_items.append(InventoryMovementItem(
            product_id=v.id,
            barcode=v.barcode,
            product_name=v.name,
            brand_name=product_info["brand_name"],
            quantity=item.quantity,
            before_quantity=to_before,
            after_quantity=to_inv.quantity,
        ))

    out_movement = InventoryMovement(
        order_no=order_no,
        movement_type=MovementType.transfer_out,
        warehouse_id=uuid.UUID(req.from_warehouse_id),
        from_warehouse_id=uuid.UUID(req.from_warehouse_id),
        to_warehouse_id=uuid.UUID(req.to_warehouse_id),
        operator=operator.username if operator else None,
        remark=req.remark,
        items=movement_items,
    )
    db.add(out_movement)
    await db.flush()

    in_order_no = await _generate_order_no(db, "TR", InventoryMovement)
    in_movement = InventoryMovement(
        order_no=in_order_no,
        movement_type=MovementType.transfer_in,
        warehouse_id=uuid.UUID(req.to_warehouse_id),
        from_warehouse_id=uuid.UUID(req.from_warehouse_id),
        to_warehouse_id=uuid.UUID(req.to_warehouse_id),
        operator=operator.username if operator else None,
        remark=req.remark,
        items=in_movement_items,
    )
    db.add(in_movement)
    await db.flush()
    await db.refresh(out_movement, attribute_names=["items"])
    return await _enrich_movement_out(db, out_movement)


async def batch_stocktake(
    db: AsyncSession,
    req: BatchStocktakeRequest,
    operator: Optional[Employee] = None,
) -> InventoryMovementOut:
    order_no = await _generate_order_no(db, "ST", InventoryMovement)
    info = await _lookup_product_info(db, [item.product_id for item in req.items])
    movement_items: list[InventoryMovementItem] = []

    for item in req.items:
        product_info = info.get(item.product_id)
        if not product_info:
            raise ValueError(f"Product {item.product_id} not found")
        v = product_info["product"]

        inv = await _get_or_create_inventory(db, item.product_id, req.warehouse_id)
        if item.actual_quantity < inv.locked:
            raise ValueError(
                f"Actual quantity ({item.actual_quantity}) for 商品 {item.product_id} cannot be less than locked quantity ({inv.locked})"
            )

        before = inv.quantity
        inv.quantity = item.actual_quantity

        movement_items.append(InventoryMovementItem(
            product_id=v.id,
            barcode=v.barcode,
            product_name=v.name,
            brand_name=product_info["brand_name"],
            quantity=abs(item.actual_quantity - before),
            before_quantity=before,
            after_quantity=inv.quantity,
        ))

    movement = InventoryMovement(
        order_no=order_no,
        movement_type=MovementType.stocktake_adjustment,
        warehouse_id=uuid.UUID(req.warehouse_id),
        operator=operator.username if operator else None,
        remark=req.remark,
        items=movement_items,
    )
    db.add(movement)
    await db.flush()
    await db.refresh(movement, attribute_names=["items"])
    return await _enrich_movement_out(db, movement)


async def stock_out(db: AsyncSession, req: StockOutRequest) -> InventoryOut:
    product_info = await _require_product_info(db, req.product_id)
    v = product_info["product"]

    inv = await _get_or_create_inventory(db, req.product_id, req.warehouse_id)
    available = inv.quantity - inv.locked
    if req.quantity > available:
        raise ValueError(
            f"Insufficient available quantity. Available: {available}, Requested: {req.quantity}"
        )
    before = inv.quantity
    inv.quantity -= req.quantity
    order_no = await _generate_order_no(db, "SO", InventoryMovement)

    movement = InventoryMovement(
        order_no=order_no,
        movement_type=MovementType.stock_out,
        warehouse_id=uuid.UUID(req.warehouse_id),
        remark=req.remark,
        items=[InventoryMovementItem(
            product_id=v.id,
            barcode=v.barcode,
            product_name=v.name,
            brand_name=product_info["brand_name"],
            quantity=req.quantity,
            before_quantity=before,
            after_quantity=inv.quantity,
        )],
    )
    db.add(movement)
    await db.flush()
    await db.refresh(inv)
    out = InventoryOut.model_validate(inv)
    out.available_quantity = inv.quantity - inv.locked
    return out


async def transfer(db: AsyncSession, req: TransferRequest) -> None:
    if req.from_warehouse_id == req.to_warehouse_id:
        raise ValueError("Source and destination warehouses must be different")

    product_info = await _require_product_info(db, req.product_id)
    v = product_info["product"]

    from_inv = await _get_or_create_inventory(db, req.product_id, req.from_warehouse_id)
    available = from_inv.quantity - from_inv.locked
    if req.quantity > available:
        raise ValueError(
            f"Insufficient available quantity in source warehouse. Available: {available}, Requested: {req.quantity}"
        )

    from_before = from_inv.quantity
    from_inv.quantity -= req.quantity

    to_inv = await _get_or_create_inventory(db, req.product_id, req.to_warehouse_id)
    to_before = to_inv.quantity
    to_inv.quantity += req.quantity
    out_order_no = await _generate_order_no(db, "TR", InventoryMovement)
    in_order_no = await _generate_order_no(db, "TR", InventoryMovement)

    out_movement = InventoryMovement(
        order_no=out_order_no,
        movement_type=MovementType.transfer_out,
        warehouse_id=uuid.UUID(req.from_warehouse_id),
        from_warehouse_id=uuid.UUID(req.from_warehouse_id),
        to_warehouse_id=uuid.UUID(req.to_warehouse_id),
        remark=req.remark,
        items=[InventoryMovementItem(
            product_id=v.id,
            barcode=v.barcode,
            product_name=v.name,
            brand_name=product_info["brand_name"],
            quantity=req.quantity,
            before_quantity=from_before,
            after_quantity=from_inv.quantity,
        )],
    )
    in_movement = InventoryMovement(
        order_no=in_order_no,
        movement_type=MovementType.transfer_in,
        warehouse_id=uuid.UUID(req.to_warehouse_id),
        from_warehouse_id=uuid.UUID(req.from_warehouse_id),
        to_warehouse_id=uuid.UUID(req.to_warehouse_id),
        remark=req.remark,
        items=[InventoryMovementItem(
            product_id=v.id,
            barcode=v.barcode,
            product_name=v.name,
            brand_name=product_info["brand_name"],
            quantity=req.quantity,
            before_quantity=to_before,
            after_quantity=to_inv.quantity,
        )],
    )
    db.add(out_movement)
    db.add(in_movement)
    await db.flush()


async def stocktake(db: AsyncSession, req: StocktakeRequest) -> InventoryOut:
    product_info = await _require_product_info(db, req.product_id)
    v = product_info["product"]

    inv = await _get_or_create_inventory(db, req.product_id, req.warehouse_id)
    diff = req.actual_quantity - inv.quantity

    if req.actual_quantity < inv.locked:
        raise ValueError(
            f"Actual quantity ({req.actual_quantity}) cannot be less than locked quantity ({inv.locked})"
        )

    before = inv.quantity
    inv.quantity = req.actual_quantity

    if diff != 0:
        order_no = await _generate_order_no(db, "ST", InventoryMovement)
        movement = InventoryMovement(
            order_no=order_no,
            movement_type=MovementType.stocktake_adjustment,
            warehouse_id=uuid.UUID(req.warehouse_id),
            remark=req.remark,
            items=[InventoryMovementItem(
                product_id=v.id,
                barcode=v.barcode,
                product_name=v.name,
                brand_name=product_info["brand_name"],
                quantity=abs(diff),
                before_quantity=before,
                after_quantity=inv.quantity,
            )],
        )
        db.add(movement)

    await db.flush()
    await db.refresh(inv)
    out = InventoryOut.model_validate(inv)
    out.available_quantity = inv.quantity - inv.locked
    return out


async def list_inventory(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    warehouse_id: Optional[str] = None,
) -> PaginatedResponse[InventoryListItemOut]:
    query = select(Inventory)
    count_query = select(func.count()).select_from(Inventory)

    if warehouse_id:
        query = query.where(Inventory.warehouse_id == uuid.UUID(warehouse_id))
        count_query = count_query.where(Inventory.warehouse_id == uuid.UUID(warehouse_id))

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.order_by(Inventory.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    inventories = result.scalars().all()

    product_ids = [str(inv.product_id) for inv in inventories]
    info = await _lookup_product_info(db, product_ids) if product_ids else {}

    wh_ids = list({str(inv.warehouse_id) for inv in inventories})
    wh_result = await db.execute(select(Warehouse).where(Warehouse.id.in_([uuid.UUID(wid) for wid in wh_ids])))
    wh_map = {str(w.id): w.name for w in wh_result.scalars().all()}

    sup_ids = list({str(inv.supplier_id) for inv in inventories if inv.supplier_id})
    sup_map: dict[str, str] = {}
    if sup_ids:
        sup_result = await db.execute(select(Supplier).where(Supplier.id.in_([uuid.UUID(sid) for sid in sup_ids])))
        sup_map = {str(s.id): s.name for s in sup_result.scalars().all()}

    items = []
    for inv in inventories:
        out = InventoryListItemOut.model_validate(inv)
        out.available_quantity = inv.quantity - inv.locked
        out.warehouse_name = wh_map.get(str(inv.warehouse_id))
        out.supplier_name = sup_map.get(str(inv.supplier_id)) if inv.supplier_id else None
        product_info = info.get(str(inv.product_id))
        if product_info:
            v = product_info["product"]
            brand = product_info.get("brand_name")
            out.product_info = f"{v.barcode} - {v.name}" + (f" [{brand}]" if brand else "")
            out.warning_quantity = v.warning_quantity
            out.product_image_url = (v.image_urls or [None])[0]
        items.append(out)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


async def list_movements(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    movement_type: Optional[str] = None,
    warehouse_id: Optional[str] = None,
) -> PaginatedResponse[InventoryMovementOut]:
    query = select(InventoryMovement)
    count_query = select(func.count()).select_from(InventoryMovement)

    if movement_type:
        query = query.where(InventoryMovement.movement_type == movement_type)
        count_query = count_query.where(InventoryMovement.movement_type == movement_type)
    if warehouse_id:
        query = query.where(InventoryMovement.warehouse_id == warehouse_id)
        count_query = count_query.where(InventoryMovement.warehouse_id == warehouse_id)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.order_by(InventoryMovement.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    movements = result.scalars().all()

    items = []
    for m in movements:
        out = await _enrich_movement_out(db, m)
        items.append(out)

    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


async def get_movement(db: AsyncSession, movement_id: str) -> InventoryMovementOut:
    result = await db.execute(select(InventoryMovement).where(InventoryMovement.id == movement_id))
    movement = result.scalar_one_or_none()
    if movement is None:
        raise ValueError("Movement not found")
    return await _enrich_movement_out(db, movement)
