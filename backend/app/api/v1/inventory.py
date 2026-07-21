from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser, WarehouseUser
from app.schemas.common import PaginatedResponse, ResponseBase
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
from app.services.inventory_service import (
    batch_stock_in,
    batch_stock_out,
    batch_stocktake,
    batch_transfer,
    create_supplier,
    create_warehouse,
    get_movement,
    list_inventory,
    list_movements,
    list_suppliers,
    list_warehouses,
    stock_in,
    stock_out,
    stocktake,
    transfer,
    update_supplier,
    update_warehouse,
)

router = APIRouter(tags=["Inventory"])


# --- 供应商 ---


@router.post(
    "/suppliers",
    response_model=ResponseBase[SupplierOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_sup(
    req: SupplierCreate,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    supplier = await create_supplier(db, req)
    return ResponseBase(data=SupplierOut.model_validate(supplier))


@router.get(
    "/suppliers",
    response_model=ResponseBase[PaginatedResponse[SupplierOut]],
)
async def list_sup(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    result = await list_suppliers(db, page, page_size)
    return ResponseBase(data=result)


@router.put(
    "/suppliers/{supplier_id}",
    response_model=ResponseBase[SupplierOut],
)
async def update_sup(
    supplier_id: str,
    req: SupplierUpdate,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        supplier = await update_supplier(db, supplier_id, req)
        return ResponseBase(data=SupplierOut.model_validate(supplier))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# --- Warehouses ---


@router.post(
    "/warehouses",
    response_model=ResponseBase[WarehouseOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_wh(
    req: WarehouseCreate,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    wh = await create_warehouse(db, req)
    return ResponseBase(data=WarehouseOut.model_validate(wh))


@router.get(
    "/warehouses",
    response_model=ResponseBase[PaginatedResponse[WarehouseOut]],
)
async def list_wh(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    result = await list_warehouses(db, page, page_size)
    return ResponseBase(data=result)


@router.put(
    "/warehouses/{warehouse_id}",
    response_model=ResponseBase[WarehouseOut],
)
async def update_wh(
    warehouse_id: str,
    req: WarehouseUpdate,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        wh = await update_warehouse(db, warehouse_id, req)
        return ResponseBase(data=WarehouseOut.model_validate(wh))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


# --- Inventory List ---


@router.get(
    "/inventory",
    response_model=ResponseBase[PaginatedResponse[InventoryListItemOut]],
)
async def list_inv(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    warehouse_id: str = Query(None),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    result = await list_inventory(db, page, page_size, warehouse_id)
    return ResponseBase(data=result)


# --- Stock Operations ---


@router.post("/stock-in", response_model=ResponseBase[InventoryOut])
async def stock_in_op(
    req: StockInRequest,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        inv = await stock_in(db, req)
        return ResponseBase(data=inv)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/stock-in/batch", response_model=ResponseBase[InventoryMovementOut])
async def batch_stock_in_op(
    req: BatchStockInRequest,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await batch_stock_in(db, req, operator=current_user)
        return ResponseBase(data=result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/stock-out", response_model=ResponseBase[InventoryOut])
async def stock_out_op(
    req: StockOutRequest,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        inv = await stock_out(db, req)
        return ResponseBase(data=inv)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/stock-out/batch", response_model=ResponseBase[InventoryMovementOut])
async def batch_stock_out_op(
    req: BatchStockOutRequest,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await batch_stock_out(db, req, operator=current_user)
        return ResponseBase(data=result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/transfer", response_model=ResponseBase)
async def transfer_op(
    req: TransferRequest,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        await transfer(db, req)
        return ResponseBase()
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/transfer/batch", response_model=ResponseBase[InventoryMovementOut])
async def batch_transfer_op(
    req: BatchTransferRequest,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await batch_transfer(db, req, operator=current_user)
        return ResponseBase(data=result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/stocktake", response_model=ResponseBase[InventoryOut])
async def stocktake_op(
    req: StocktakeRequest,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        inv = await stocktake(db, req)
        return ResponseBase(data=inv)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/stocktake/batch", response_model=ResponseBase[InventoryMovementOut])
async def batch_stocktake_op(
    req: BatchStocktakeRequest,
    current_user: WarehouseUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await batch_stocktake(db, req, operator=current_user)
        return ResponseBase(data=result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# --- Movements ---


@router.get(
    "/movements",
    response_model=ResponseBase[PaginatedResponse[InventoryMovementOut]],
)
async def list_movements_op(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    movement_type: str = Query(None),
    warehouse_id: str = Query(None),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    result = await list_movements(db, page, page_size, movement_type, warehouse_id)
    return ResponseBase(data=result)


@router.get(
    "/movements/{movement_id}",
    response_model=ResponseBase[InventoryMovementOut],
)
async def get_movement_op(
    movement_id: str,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await get_movement(db, movement_id)
        return ResponseBase(data=result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
