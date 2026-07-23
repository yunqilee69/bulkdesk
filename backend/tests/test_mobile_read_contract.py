import importlib
import inspect
import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.core.deps import get_current_user
from app.models.customer import Customer, CustomerLevel, MemberPrice
from app.models.employee import Employee, EmployeeRole, EmployeeRoleAssignment
from app.models.product import Brand, Category, CategoryStatus, Product, ProductStatus
from tests.test_business_logic import FakeResult, QueueDb


def _require_module(module_name: str):
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError as error:
        pytest.fail(f"missing Phase 0 module {module_name}: {error}")


def _route_by_path(router, path: str):
    route = next((item for item in router.routes if item.path == path), None)
    assert route is not None, f"missing mobile route {path}"
    return route


def _normalized_source(callable_object) -> str:
    return " ".join(inspect.getsource(callable_object).split())


def test_mobile_router_contract():
    mobile_api = _require_module("app.api.v1.mobile")

    expected_paths = {
        "/dashboard",
        "/customers/{customer_id}/summary",
        "/products/barcode/{barcode}",
        "/product-categories",
        "/products",
    }
    paths = {route.path for route in mobile_api.router.routes}
    assert expected_paths <= paths


def test_mobile_read_routes_require_current_user():
    mobile_api = _require_module("app.api.v1.mobile")

    for path in (
        "/dashboard",
        "/customers/{customer_id}/summary",
        "/products/barcode/{barcode}",
        "/product-categories",
        "/products",
    ):
        route = _route_by_path(mobile_api.router, path)
        dependency_calls = {
            dependency.call for dependency in route.dependant.dependencies
        }
        assert get_current_user in dependency_calls, f"{path} must use CurrentUser"


def test_dashboard_actions_are_filtered_by_roles():
    mobile_service = _require_module("app.services.mobile_service")
    get_dashboard = getattr(mobile_service, "get_mobile_dashboard", None)
    assert get_dashboard is not None, "missing get_mobile_dashboard service"

    source = _normalized_source(get_dashboard)
    for role in ("admin", "warehouse_manager", "delivery"):
        assert role in source
    assert "current_user" in source


def test_delivery_customer_summary_is_scoped_to_assigned_deliveries():
    mobile_service = _require_module("app.services.mobile_service")
    get_customer_summary = getattr(mobile_service, "get_customer_summary", None)
    assert get_customer_summary is not None, "missing get_customer_summary service"

    source = _normalized_source(get_customer_summary)
    assert "EmployeeRole.delivery" in source
    assert "OrderDelivery.delivery_employee_id" in source
    assert "current_user.id" in source
    assert "PermissionError" in source


def test_warehouse_user_can_read_any_customer_summary():
    mobile_service = _require_module("app.services.mobile_service")
    get_customer_summary = getattr(mobile_service, "get_customer_summary", None)
    assert get_customer_summary is not None, "missing get_customer_summary service"

    source = _normalized_source(get_customer_summary)
    assert "EmployeeRole.warehouse_manager" in source


def test_barcode_summary_uses_exact_active_product_match():
    mobile_service = _require_module("app.services.mobile_service")
    get_barcode_summary = getattr(mobile_service, "get_product_barcode_summary", None)
    assert get_barcode_summary is not None, "missing get_product_barcode_summary service"

    source = _normalized_source(get_barcode_summary)
    assert "Product.barcode == barcode" in source
    assert "Product.status == ProductStatus.active" in source
    assert ".ilike(" not in source
    assert ".contains(" not in source


@pytest.mark.asyncio
async def test_mobile_product_categories_returns_active_categories():
    mobile_service = _require_module("app.services.mobile_service")
    active = Category(id=uuid.uuid4(), name="粮油", status=CategoryStatus.active)
    db = QueueDb([FakeResult(values=[active])])

    result = await mobile_service.list_mobile_product_categories(db)

    assert [item.name for item in result] == ["粮油"]
    assert result[0].model_dump() == {"id": str(active.id), "name": "粮油"}
    sql = db.statements[0]
    assert "categories.status =" in sql
    assert "ORDER BY categories.name" in sql


@pytest.mark.asyncio
async def test_mobile_products_returns_card_data_for_merchant_mode():
    mobile_service = _require_module("app.services.mobile_service")
    category = Category(id=uuid.uuid4(), name="粮油", status=CategoryStatus.active)
    brand = Brand(id=uuid.uuid4(), name="金龙鱼")
    product = Product(
        id=uuid.uuid4(),
        name="东北大米 25kg",
        barcode="6901000000010",
        category_id=category.id,
        brand_id=brand.id,
        unit="袋",
        standard_price=Decimal("128.50"),
        cost_price=Decimal("80.00"),
        image_urls=["https://cdn.example.test/rice.jpg", "https://cdn.example.test/rice-2.jpg"],
        status=ProductStatus.active,
    )
    row = SimpleNamespace(product=product, category_name="粮油", brand_name="金龙鱼", member_price=None, available_quantity=8)
    db = QueueDb([FakeResult(scalar=1), FakeResult(values=[row])])
    employee = Employee(id=uuid.uuid4(), username="admin", name="管理员", password_hash="hash")
    employee.role_assignments = [EmployeeRoleAssignment(role=EmployeeRole.admin)]

    result = await mobile_service.list_mobile_products(db, employee, page=1, page_size=20, recommend=True)

    assert result.page == 1
    assert result.page_size == 20
    assert result.total == 1
    assert result.items[0].model_dump() == {
        "id": str(product.id),
        "name": "东北大米 25kg",
        "short_name": None,
        "barcode": "6901000000010",
        "category_id": str(category.id),
        "category_name": "粮油",
        "brand_id": str(brand.id),
        "brand_name": "金龙鱼",
        "unit": "袋",
        "image_url": "https://cdn.example.test/rice.jpg",
        "standard_price": 128.5,
        "display_price": 128.5,
        "price_source": "standard",
        "status": ProductStatus.active,
        "available_quantity": 8,
    }
    assert "products.status =" in db.statements[0]
    assert "random()" in db.statements[1]


@pytest.mark.asyncio
async def test_mobile_products_can_use_customer_member_price():
    mobile_service = _require_module("app.services.mobile_service")
    level = CustomerLevel(id=uuid.uuid4(), name="金牌")
    customer = Customer(
        id=uuid.uuid4(),
        name="海淀批发部",
        contact_name="李四",
        contact_phone="13800000000",
        level_id=level.id,
    )
    product = Product(
        id=uuid.uuid4(),
        name="整箱牛奶",
        barcode="6901000000027",
        category_id=uuid.uuid4(),
        unit="箱",
        standard_price=Decimal("59.90"),
        cost_price=Decimal("40.00"),
        status=ProductStatus.active,
    )
    member_price = MemberPrice(product_id=product.id, level_id=level.id, price=Decimal("49.90"))
    row = SimpleNamespace(product=product, category_name=None, brand_name=None, member_price=member_price.price, available_quantity=0)
    db = QueueDb([FakeResult(one=customer), FakeResult(scalar=1), FakeResult(values=[row])])
    employee = Employee(id=uuid.uuid4(), username="delivery", name="配送员", password_hash="hash")
    employee.role_assignments = [EmployeeRoleAssignment(role=EmployeeRole.delivery)]

    result = await mobile_service.list_mobile_products(db, employee, customer_id=str(customer.id))

    item = result.items[0]
    assert item.standard_price == 59.9
    assert item.display_price == 49.9
    assert item.price_source == "member"
    assert "member_prices" in db.statements[2]
