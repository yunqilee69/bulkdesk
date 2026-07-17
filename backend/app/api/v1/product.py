from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import AdminUser, CurrentUser
from app.models.product import PriceType, ProductStatus
from app.schemas.common import PaginatedResponse, ResponseBase
from app.schemas.product import BrandCreate, BrandOut, BrandUpdate, CategoryCreate, CategoryOut, CategoryUpdate, MemberPriceBatchUpdate, MemberPriceItemOut, PriceChangeLogOut, PriceChangeRequest, ProductCreate, ProductOut, ProductUpdate, ProductWarningQuantityUpdate
from app.services import product_service

router = APIRouter(prefix="/products", tags=["Product"])

def _bad(error: ValueError): raise HTTPException(status_code=400, detail=str(error))

@router.get("/brands", response_model=ResponseBase[PaginatedResponse[BrandOut]])
async def list_brands(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: CurrentUser = None, db: AsyncSession = Depends(get_db)): return ResponseBase(data=await product_service.list_brands(db, page, page_size))
@router.post("/brands", response_model=ResponseBase[BrandOut], status_code=status.HTTP_201_CREATED)
async def create_brand(req: BrandCreate, admin: AdminUser, db: AsyncSession = Depends(get_db)): return ResponseBase(data=await product_service.create_brand(db, req))
@router.put("/brands/{brand_id}", response_model=ResponseBase[BrandOut])
async def update_brand(brand_id: str, req: BrandUpdate, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    try: return ResponseBase(data=await product_service.update_brand(db, brand_id, req))
    except ValueError as error: _bad(error)

@router.get("/categories", response_model=ResponseBase[PaginatedResponse[CategoryOut]])
async def list_categories(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: CurrentUser = None, db: AsyncSession = Depends(get_db)): return ResponseBase(data=await product_service.list_categories(db, page, page_size))
@router.post("/categories", response_model=ResponseBase[CategoryOut], status_code=status.HTTP_201_CREATED)
async def create_category(req: CategoryCreate, admin: AdminUser, db: AsyncSession = Depends(get_db)): return ResponseBase(data=await product_service.create_category(db, req))
@router.put("/categories/{category_id}", response_model=ResponseBase[CategoryOut])
async def update_category(category_id: str, req: CategoryUpdate, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    try: return ResponseBase(data=await product_service.update_category(db, category_id, req))
    except ValueError as error: _bad(error)

@router.get("", response_model=ResponseBase[PaginatedResponse[ProductOut]])
async def list_products(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    category_id: Optional[str] = None,
    brand_id: Optional[str] = None,
    barcode: Optional[str] = None,
    min_cost_price: Optional[float] = Query(None, ge=0),
    max_cost_price: Optional[float] = Query(None, ge=0),
    min_standard_price: Optional[float] = Query(None, ge=0),
    max_standard_price: Optional[float] = Query(None, ge=0),
    product_status: Optional[ProductStatus] = Query(None, alias="status"),
    user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    return ResponseBase(
        data=await product_service.list_products(
            db,
            page,
            page_size,
            keyword,
            category_id,
            brand_id,
            barcode,
            min_cost_price,
            max_cost_price,
            min_standard_price,
            max_standard_price,
            product_status,
        )
    )
@router.post("", response_model=ResponseBase[ProductOut], status_code=status.HTTP_201_CREATED)
async def create_product(req: ProductCreate, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    try: return ResponseBase(data=await product_service.create_product(db, req, admin.username))
    except ValueError as error: _bad(error)
    except IntegrityError: raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="条形码已存在")
@router.get("/price-change-logs", response_model=ResponseBase[PaginatedResponse[PriceChangeLogOut]])
async def list_all_price_logs(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: CurrentUser = None, db: AsyncSession = Depends(get_db)): return ResponseBase(data=await product_service.list_price_change_logs(db, None, page, page_size))
@router.get("/{product_id}", response_model=ResponseBase[ProductOut])
async def get_product(product_id: str, user: CurrentUser = None, db: AsyncSession = Depends(get_db)):
    try: return ResponseBase(data=await product_service.get_product(db, product_id))
    except ValueError as error: raise HTTPException(status_code=404, detail=str(error))
@router.put("/{product_id}", response_model=ResponseBase[ProductOut])
async def update_product(product_id: str, req: ProductUpdate, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    try: return ResponseBase(data=await product_service.update_product(db, product_id, req))
    except ValueError as error: _bad(error)

@router.patch("/{product_id}/warning-quantity", response_model=ResponseBase[ProductOut])
async def update_product_warning_quantity(product_id: str, req: ProductWarningQuantityUpdate, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    try: return ResponseBase(data=await product_service.update_product_warning_quantity(db, product_id, req.warning_quantity))
    except ValueError as error: _bad(error)

@router.put("/{product_id}/standard-price", response_model=ResponseBase[ProductOut])
async def standard_price(product_id: str, req: PriceChangeRequest, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    try: return ResponseBase(data=await product_service.change_price(db, product_id, PriceType.standard_price, req, admin.username))
    except ValueError as error: _bad(error)
@router.put("/{product_id}/cost-price", response_model=ResponseBase[ProductOut])
async def cost_price(product_id: str, req: PriceChangeRequest, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    try: return ResponseBase(data=await product_service.change_price(db, product_id, PriceType.cost_price, req, admin.username))
    except ValueError as error: _bad(error)
@router.get("/{product_id}/member-prices", response_model=ResponseBase[list[MemberPriceItemOut]])
async def list_member_prices(product_id: str, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    try: return ResponseBase(data=await product_service.list_member_prices(db, product_id))
    except ValueError as error: _bad(error)
@router.put("/{product_id}/member-prices", response_model=ResponseBase[ProductOut])
async def batch_member_prices(product_id: str, req: MemberPriceBatchUpdate, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    try: return ResponseBase(data=await product_service.batch_update_member_prices(db, product_id, req, admin.username))
    except ValueError as error: _bad(error)
@router.put("/{product_id}/member-prices/{level_id}", response_model=ResponseBase[ProductOut])
async def member_price(product_id: str, level_id: str, req: PriceChangeRequest, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    try: return ResponseBase(data=await product_service.change_price(db, product_id, PriceType.member_price, req, admin.username, level_id))
    except ValueError as error: _bad(error)
@router.get("/{product_id}/price-change-logs", response_model=ResponseBase[PaginatedResponse[PriceChangeLogOut]])
async def price_logs(product_id: str, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: CurrentUser = None, db: AsyncSession = Depends(get_db)): return ResponseBase(data=await product_service.list_price_change_logs(db, product_id, page, page_size))
