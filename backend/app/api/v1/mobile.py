from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.schemas.common import PaginatedResponse, ResponseBase
from app.schemas.mobile import (
    MobileCustomerSummaryOut,
    MobileDashboardOut,
    MobileProductBarcodeOut,
    MobileProductCategoryOut,
    MobileProductListItemOut,
)
from app.services.mobile_service import (
    get_customer_summary,
    get_mobile_dashboard,
    get_product_barcode_summary,
    list_mobile_product_categories,
    list_mobile_products,
)

router = APIRouter(tags=["移动端"])


def _map_read_error(error: Exception) -> HTTPException:
    if isinstance(error, PermissionError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error))
    if str(error) in {"客户不存在", "商品不存在"}:
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error))


@router.get("/dashboard", response_model=ResponseBase[MobileDashboardOut])
async def dashboard(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    return ResponseBase(data=await get_mobile_dashboard(db, current_user))


@router.get("/customers/{customer_id}/summary", response_model=ResponseBase[MobileCustomerSummaryOut])
async def customer_summary(
    customer_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(data=await get_customer_summary(db, customer_id, current_user))
    except Exception as error:
        raise _map_read_error(error)


@router.get("/products/barcode/{barcode}", response_model=ResponseBase[MobileProductBarcodeOut])
async def product_barcode(
    barcode: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(data=await get_product_barcode_summary(db, barcode, current_user))
    except Exception as error:
        raise _map_read_error(error)


@router.get("/product-categories", response_model=ResponseBase[list[MobileProductCategoryOut]])
async def product_categories(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        return ResponseBase(data=await list_mobile_product_categories(db))
    except Exception as error:
        raise _map_read_error(error)


@router.get("/products", response_model=ResponseBase[PaginatedResponse[MobileProductListItemOut]])
async def products(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    keyword: Optional[str] = None,
    category_id: Optional[str] = None,
    recommend: bool = False,
    customer_id: Optional[str] = None,
):
    try:
        return ResponseBase(
            data=await list_mobile_products(
                db,
                current_user,
                page=page,
                page_size=page_size,
                keyword=keyword,
                category_id=category_id,
                recommend=recommend,
                customer_id=customer_id,
            )
        )
    except Exception as error:
        raise _map_read_error(error)
