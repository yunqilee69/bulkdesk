import uuid

import pytest
from fastapi import HTTPException

from app.core import deps
from app.models.employee import (
    Employee,
    EmployeeRole,
    EmployeeRoleAssignment,
    EmployeeStatus,
)
from app.schemas.auth import LoginRequest
from app.schemas.employee import EmployeeCreate, EmployeeUpdate
from app.services import auth_service, employee_service


class _Result:
    def __init__(self, employee: Employee | None):
        self.employee = employee

    def scalar_one_or_none(self):
        return self.employee


class _Database:
    def __init__(self, employee: Employee | None):
        self.employee = employee
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return _Result(self.employee)


class _WritableDatabase(_Database):
    def __init__(self, employee: Employee | None):
        super().__init__(employee)
        self.added = []
        self.refreshed_attribute_names = []

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        pass

    async def refresh(self, value, attribute_names=None):
        self.refreshed_attribute_names.append(attribute_names)


class _Redis:
    async def get(self, key: str):
        return None


def _employee(*roles: EmployeeRole) -> Employee:
    employee = Employee(
        id=uuid.uuid4(),
        username="multi-role",
        password_hash="hash",
        name="兼任员工",
        status=EmployeeStatus.active,
    )
    employee.role_assignments = [
        EmployeeRoleAssignment(role=role) for role in roles
    ]
    return employee


@pytest.mark.asyncio
async def test_current_user_loads_latest_roles_from_database_not_jwt(monkeypatch):
    employee = _employee(EmployeeRole.delivery, EmployeeRole.finance)
    database = _Database(employee)
    monkeypatch.setattr(
        deps,
        "decode_token",
        lambda token: {"type": "access", "sub": employee.username, "role": "admin"},
    )

    current_user = await deps.get_current_user(
        token="token", db=database, redis=_Redis()
    )

    assert current_user.roles == [EmployeeRole.delivery, EmployeeRole.finance]
    assert any(
        option.__class__.__name__ == "Load"
        for option in database.statements[0]._with_options
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("requirement", "roles"),
    [
        (deps.require_admin, [EmployeeRole.admin, EmployeeRole.delivery]),
        (deps.require_warehouse_manager, [EmployeeRole.warehouse_manager, EmployeeRole.delivery]),
        (deps.require_delivery, [EmployeeRole.delivery, EmployeeRole.finance]),
        (deps.require_finance, [EmployeeRole.finance, EmployeeRole.delivery]),
    ],
)
async def test_role_dependencies_accept_assigned_multi_roles(requirement, roles):
    employee = _employee(*roles)

    assert await requirement(employee) is employee


@pytest.mark.asyncio
async def test_admin_dependency_rejects_non_admin_role():
    with pytest.raises(HTTPException, match="Admin access required"):
        await deps.require_admin(_employee(EmployeeRole.finance))


@pytest.mark.asyncio
async def test_login_loads_roles_before_creating_legacy_tokens(monkeypatch):
    employee = _employee(EmployeeRole.finance, EmployeeRole.delivery)
    database = _WritableDatabase(employee)
    access_roles = []
    refresh_roles = []
    monkeypatch.setattr(auth_service, "verify_password", lambda *_: True)
    monkeypatch.setattr(
        auth_service,
        "create_access_token",
        lambda _username, role, **_kwargs: (access_roles.append(role) or "access", "jti"),
    )
    monkeypatch.setattr(
        auth_service,
        "create_refresh_token",
        lambda _username, role: (refresh_roles.append(role) or "refresh", "jti"),
    )

    response = await auth_service.login(
        database,
        _Redis(),
        LoginRequest(username=employee.username, password="password1"),
    )

    assert response.access_token == "access"
    assert response.refresh_token == "refresh"
    assert access_roles == [EmployeeRole.delivery.value]
    assert refresh_roles == [EmployeeRole.delivery.value]
    assert database.statements[0]._with_options


@pytest.mark.asyncio
async def test_employee_service_persists_and_replaces_role_assignments(monkeypatch):
    database = _WritableDatabase(None)
    monkeypatch.setattr(employee_service, "get_password_hash", lambda _: "hash")

    employee = await employee_service.create_employee(
        database,
        EmployeeCreate(
            username="multi-role",
            password="password1",
            name="兼任员工",
            roles=[EmployeeRole.delivery, EmployeeRole.finance],
        ),
    )
    database.employee = employee
    updated = await employee_service.update_employee(
        database,
        str(employee.id),
        EmployeeUpdate(roles=[EmployeeRole.warehouse_manager]),
    )

    assert [assignment.role for assignment in employee.role_assignments] == [
        EmployeeRole.warehouse_manager
    ]
    assert updated is employee
    assert database.statements[-1]._with_options
    assert database.refreshed_attribute_names == [
        ["role_assignments"],
        ["role_assignments"],
    ]
