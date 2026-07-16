from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import CurrentUser
from app.schemas.common import ResponseBase
from app.schemas.dashboard import DashboardStats
from app.services.dashboard_service import get_dashboard_stats

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=ResponseBase[DashboardStats])
async def stats(
    period: str = Query("week", pattern="^(week|month|year)$"),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    result = await get_dashboard_stats(db, period)
    return ResponseBase(data=result)
