from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.schemas.common import PaginatedResponse, ResponseBase
from app.schemas.customer import CustomerCreate, CustomerOut, CustomerUpdate
from app.services.customer_service import (
    create_customer,
    get_customer,
    list_customers,
    update_customer,
)

router = APIRouter(prefix="/customers", tags=["Customer"])


@router.post("", response_model=ResponseBase[CustomerOut], status_code=status.HTTP_201_CREATED)
async def create(
    req: CustomerCreate,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        customer = await create_customer(db, req)
        out = CustomerOut.model_validate(customer)
        if customer.level:
            out.level_name = customer.level.name
        return ResponseBase(data=out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("", response_model=ResponseBase[PaginatedResponse[CustomerOut]])
async def list_all(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str = Query(None),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    result = await list_customers(db, page, page_size, keyword)
    return ResponseBase(data=result)


@router.get("/{customer_id}", response_model=ResponseBase[CustomerOut])
async def get(
    customer_id: str,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        customer = await get_customer(db, customer_id)
        out = CustomerOut.model_validate(customer)
        if customer.level:
            out.level_name = customer.level.name
        return ResponseBase(data=out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put("/{customer_id}", response_model=ResponseBase[CustomerOut])
async def update(
    customer_id: str,
    req: CustomerUpdate,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    try:
        customer = await update_customer(db, customer_id, req)
        out = CustomerOut.model_validate(customer)
        if customer.level:
            out.level_name = customer.level.name
        return ResponseBase(data=out)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
