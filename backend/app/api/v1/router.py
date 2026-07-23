from fastapi import APIRouter

from app.api.v1.auth import router as auth_router
from app.api.v1.customer import router as customer_router
from app.api.v1.dashboard import router as dashboard_router
from app.api.v1.employee import router as employee_router
from app.api.v1.inventory import router as inventory_router
from app.api.v1.level import router as level_router
from app.api.v1.mobile import router as mobile_router
from app.api.v1.order import router as order_router
from app.api.v1.order_delivery import router as order_delivery_router
from app.api.v1.order_draft import router as order_draft_router
from app.api.v1.product import router as product_router
from app.api.v1.return_order import router as return_order_router
from app.api.v1.upload import router as upload_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
api_router.include_router(dashboard_router)
api_router.include_router(employee_router)
api_router.include_router(customer_router)
api_router.include_router(level_router)
api_router.include_router(product_router)
api_router.include_router(inventory_router)
api_router.include_router(mobile_router, prefix="/mobile")
api_router.include_router(order_delivery_router)
api_router.include_router(order_draft_router, prefix="/order-drafts")
api_router.include_router(order_router)
api_router.include_router(return_order_router)
api_router.include_router(upload_router)
