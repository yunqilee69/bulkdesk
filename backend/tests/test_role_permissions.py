import uuid
from datetime import datetime

import pytest
from pydantic import ValidationError

from app.core.permissions import has_any_role, normalize_roles, role_values
from app.models.employee import Employee, EmployeeRole, EmployeeRoleAssignment
from app.schemas.employee import EmployeeCreate, EmployeeOut, EmployeeUpdate


def test_fixed_business_roles_are_available_without_normal():
    assert {role.value for role in EmployeeRole} == {
        "admin",
        "warehouse_manager",
        "delivery",
        "finance",
    }


def test_employee_roles_are_deduplicated_and_checked_as_a_set():
    employee = Employee(
        id=uuid.uuid4(),
        username="mixed",
        password_hash="x",
        name="兼任员工",
    )
    employee.role_assignments = [
        EmployeeRoleAssignment(role=EmployeeRole.warehouse_manager),
        EmployeeRoleAssignment(role=EmployeeRole.delivery),
    ]

    assert role_values(employee) == {"warehouse_manager", "delivery"}
    assert has_any_role(employee, EmployeeRole.delivery)
    assert not has_any_role(employee, EmployeeRole.finance)
    assert normalize_roles(
        [EmployeeRole.delivery, EmployeeRole.admin, EmployeeRole.delivery]
    ) == [EmployeeRole.admin, EmployeeRole.delivery]


def test_admin_role_has_access_to_every_role_requirement():
    employee = Employee(
        id=uuid.uuid4(),
        username="admin",
        password_hash="x",
        name="管理员",
    )
    employee.role_assignments = [
        EmployeeRoleAssignment(role=EmployeeRole.admin),
    ]

    assert has_any_role(employee, EmployeeRole.finance)


def test_employee_schemas_require_non_empty_unique_role_lists():
    create = EmployeeCreate(
        username="mixed",
        password="password1",
        name="兼任员工",
        roles=[EmployeeRole.delivery, EmployeeRole.finance],
    )
    update = EmployeeUpdate(roles=[EmployeeRole.warehouse_manager])
    output = EmployeeOut(
        id=str(uuid.uuid4()),
        username="mixed",
        name="兼任员工",
        phone=None,
        roles=[EmployeeRole.delivery, EmployeeRole.finance],
        status="active",
        last_login_at=None,
        created_at="2026-07-20T00:00:00",
        updated_at="2026-07-20T00:00:00",
    )

    assert create.roles == [EmployeeRole.delivery, EmployeeRole.finance]
    assert update.roles == [EmployeeRole.warehouse_manager]
    assert output.roles == [EmployeeRole.delivery, EmployeeRole.finance]

    with pytest.raises(ValidationError, match="员工角色不能重复"):
        EmployeeCreate(
            username="duplicate",
            password="password1",
            name="重复角色员工",
            roles=[EmployeeRole.delivery, EmployeeRole.delivery],
        )

    with pytest.raises(ValidationError):
        EmployeeCreate(
            username="empty",
            password="password1",
            name="空角色员工",
            roles=[],
        )

    for schema in (EmployeeUpdate, EmployeeOut):
        with pytest.raises(ValidationError, match="员工角色不能重复"):
            schema(
                **_employee_schema_data(
                    roles=[EmployeeRole.delivery, EmployeeRole.delivery]
                )
            )

        with pytest.raises(ValidationError):
            schema(**_employee_schema_data(roles=[]))


def test_employee_out_reads_roles_from_role_assignments():
    employee = Employee(
        id=uuid.uuid4(),
        username="mixed",
        password_hash="x",
        name="兼任员工",
        status="active",
        last_login_at=None,
        created_at=datetime(2026, 7, 20),
        updated_at=datetime(2026, 7, 20),
    )
    employee.role_assignments = [
        EmployeeRoleAssignment(role=EmployeeRole.delivery),
        EmployeeRoleAssignment(role=EmployeeRole.finance),
    ]

    output = EmployeeOut.model_validate(employee)

    assert output.roles == [EmployeeRole.delivery, EmployeeRole.finance]


def _employee_schema_data(**overrides):
    data = {
        "id": str(uuid.uuid4()),
        "username": "mixed",
        "name": "兼任员工",
        "phone": None,
        "roles": [EmployeeRole.delivery],
        "status": "active",
        "last_login_at": None,
        "created_at": "2026-07-20T00:00:00",
        "updated_at": "2026-07-20T00:00:00",
    }
    data.update(overrides)
    return data


def test_write_routes_use_the_business_role_dependencies():
    import inspect

    from app.api.v1 import customer, inventory, order, order_delivery, product, return_order
    from app.core.deps import AdminUser, DeliveryUser, FinanceUser, WarehouseUser

    expected = {
        customer.create: ("current_user", AdminUser),
        customer.update: ("current_user", AdminUser),
        order.create: ("current_user", WarehouseUser),
        order.start_shipping: ("current_user", WarehouseUser),
        order.adjust_shipping_allocations: ("current_user", WarehouseUser),
        order.stock_out: ("current_user", WarehouseUser),
        order.complete: ("current_user", FinanceUser),
        order.cancel: ("current_user", WarehouseUser),
        inventory.create_sup: ("current_user", WarehouseUser),
        inventory.create_wh: ("current_user", WarehouseUser),
        inventory.stock_in_op: ("current_user", WarehouseUser),
        inventory.batch_stocktake_op: ("current_user", WarehouseUser),
        product.create_product: ("current_user", WarehouseUser),
        product.standard_price: ("current_user", WarehouseUser),
        order_delivery.sign_delivery: ("current_user", DeliveryUser),
        order_delivery.create_delivery_exception: ("current_user", DeliveryUser),
        return_order.create: ("current_user", DeliveryUser),
        return_order.void: ("current_user", AdminUser),
    }

    for route, (parameter_name, expected_annotation) in expected.items():
        assert inspect.signature(route).parameters[parameter_name].annotation == expected_annotation

@pytest.mark.asyncio
async def test_return_creation_passes_admin_override_to_service(monkeypatch):
    from app.api.v1 import return_order as return_order_api
    from app.models.employee import EmployeeRoleAssignment
    from app.schemas.return_order import ReturnOrderCreate, ReturnOrderItemCreate

    employee = Employee(
        id=uuid.uuid4(), username="admin", password_hash="x", name="管理员"
    )
    employee.role_assignments = [EmployeeRoleAssignment(role=EmployeeRole.admin)]
    captured = {}

    async def create_return(_db, _request, _operator_id, _operator_name, *, is_admin):
        captured["is_admin"] = is_admin
        return type("ReturnOrder", (), {"id": uuid.uuid4()})()

    async def get_return(_db, _return_order_id):
        return {"id": _return_order_id}

    monkeypatch.setattr(return_order_api, "create_return_order", create_return)
    monkeypatch.setattr(return_order_api, "get_return_order", get_return)

    response = await return_order_api.create(
        ReturnOrderCreate(
            handling_delivery_id=str(uuid.uuid4()),
            items=[
                ReturnOrderItemCreate(
                    source_order_item_id=str(uuid.uuid4()),
                    quantity=1,
                    return_reason="客户退货",
                )
            ],
        ),
        employee,
        object(),
    )

    assert captured["is_admin"] is True
    assert response.data["id"]

@pytest.mark.asyncio
async def test_auth_me_returns_the_complete_role_array_for_admin():
    from app.api.v1 import auth as auth_api

    employee = Employee(
        id=uuid.uuid4(), username="admin", password_hash="x", name="管理员"
    )
    employee.role_assignments = [EmployeeRoleAssignment(role=EmployeeRole.admin)]

    response = await auth_api.current_user(employee)

    assert response.data.roles == [EmployeeRole.admin]
