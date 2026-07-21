# Return Source Tracking and Multi-Role Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every return traceable to original order items, add order return/net amount accounting, support multi-select employee roles, enforce role-specific operations, and prohibit zero standard/member prices.

**Architecture:** Keep the existing FastAPI service-layer transaction pattern and add focused domain helpers for role checks and return calculations. Store employee roles in a normalized association table, persist `orders.returned_amount`, derive `net_amount` in schemas, and authorize field operations from the active delivery while validating each returned item against historical order lines for the same customer.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, PostgreSQL incremental SQL, Pydantic v2, React 19, Umi Max 4, Ant Design 6, Vitest, pytest, DBX MCP.

**Design Reference:** `docs/superpowers/specs/2026-07-20-return-role-permissions-design.md`

---

## File Map

### Backend domain and database

- Create `backend/app/core/permissions.py` — centralized role-set checks used by dependencies and services.
- Create `backend/migrations/incremental/2026-07-20_退货来源追踪与员工多角色.sql` — employee-role migration plus order/return columns, constraints, indexes, and legacy-data guard.
- Modify `backend/app/models/employee.py` — fixed business-role enum, employee role-assignment model, and employee role relationship.
- Modify `backend/app/models/order.py` — persisted `returned_amount`.
- Modify `backend/app/models/return_order.py` — handling delivery and source order-item relationships.
- Modify `backend/app/models/__init__.py` — export the new role-assignment model.

### Backend contracts and services

- Modify `backend/app/core/deps.py` — reusable role dependencies and role-specific user aliases.
- Modify `backend/app/schemas/auth.py` — current-user roles list.
- Modify `backend/app/schemas/employee.py` — multi-role create/update/output contracts.
- Modify `backend/app/schemas/product.py` — positive standard/member price validation.
- Modify `backend/app/schemas/order.py` — `returned_amount` and computed `net_amount` output.
- Modify `backend/app/schemas/return_order.py` — source-linked return input/output and returnable-item output.
- Modify `backend/app/services/auth_service.py` — token/current-user role serialization.
- Modify `backend/app/services/employee_service.py` — role replacement and eager loading.
- Modify `backend/app/services/order_service.py` — explicit member-price fallback and net-amount payment ceiling.
- Modify `backend/app/services/order_delivery_service.py` — returnable historical-item query and active-delivery authorization helper.
- Modify `backend/app/services/return_order_service.py` — source validation, cumulative quantity checks, per-order return accounting, inventory changes, and reversal.
- Modify `backend/app/services/product_service.py` — preserve price-log behavior under role-specific routes.

### Backend API permission matrix

- Modify `backend/app/api/v1/auth.py`
- Modify `backend/app/api/v1/customer.py`
- Modify `backend/app/api/v1/employee.py`
- Modify `backend/app/api/v1/inventory.py`
- Modify `backend/app/api/v1/order.py`
- Modify `backend/app/api/v1/order_delivery.py`
- Modify `backend/app/api/v1/product.py`
- Modify `backend/app/api/v1/return_order.py`

### Frontend role and return UI

- Modify `frontend/src/typings.d.ts` — replace single role with `roles`.
- Modify `frontend/src/access.ts` — role-set access keys.
- Create `frontend/src/access.test.ts` — role union and admin tests.
- Modify `frontend/config/routes.ts` — role-aware route visibility.
- Modify `frontend/src/services/api.ts` — current-user contract.
- Modify `frontend/src/services/employee.ts` — role-array contracts.
- Modify `frontend/src/services/order.ts` — returned/net amount fields.
- Modify `frontend/src/services/delivery.ts` — returnable-item endpoint and types.
- Modify `frontend/src/services/returnOrder.ts` — source-linked create payload.
- Create `frontend/src/pages/Employee/roles.ts` — role labels and form normalization.
- Create `frontend/src/pages/Employee/roles.test.ts` — multi-role helper tests.
- Modify `frontend/src/pages/Employee/index.tsx` — multi-select role form and role tags.
- Create `frontend/src/pages/Delivery/returnFlow.ts` — return quantity and payload helpers.
- Create `frontend/src/pages/Delivery/returnFlow.test.ts` — return helper tests.
- Create `frontend/src/pages/Delivery/ReturnModal.tsx` — historical source-item selection and return submission.
- Modify `frontend/src/pages/Delivery/index.tsx` — current-delivery return entry.
- Modify `frontend/src/pages/ReturnOrder/index.tsx` — remove generic unlinked creation and retain list/detail/admin void.
- Modify `frontend/src/pages/Product/index.tsx` — role-specific price/basic-data actions and positive sale prices.
- Modify `frontend/src/pages/Inventory/operations/index.tsx` — warehouse-role operation controls.
- Modify `frontend/src/pages/Order/index.tsx` — warehouse/finance action visibility and net-amount payment display.

### Tests and documentation

- Create `backend/tests/test_price_rules.py`
- Create `backend/tests/test_role_permissions.py`
- Create `backend/tests/test_return_order_sources.py`
- Modify `backend/tests/test_business_logic.py` only where existing contracts must be replaced rather than duplicated.
- Modify `AGENTS.md`
- Modify `FEATURES.md`
- Modify `docs/modules/auth.md`
- Modify `docs/modules/customer.md`
- Modify `docs/modules/employee.md`
- Modify `docs/modules/inventory.md`
- Modify `docs/modules/order.md`
- Modify `docs/modules/return-order.md`

---

### Task 1: Enforce Positive Sale and Member Prices

**Files:**
- Create: `backend/tests/test_price_rules.py`
- Modify: `backend/app/schemas/product.py:58-74`
- Modify: `backend/app/schemas/customer.py:82-89`
- Modify: `backend/app/services/order_service.py:45-49,87-98`
- Modify: `frontend/src/pages/Product/form.test.ts`
- Modify: `frontend/src/pages/Product/form.ts`
- Modify: `frontend/src/pages/Product/memberPrices.test.ts`
- Modify: `frontend/src/pages/Product/memberPrices.ts`

- [ ] **Step 1: Write failing backend price-rule tests**

```python
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.product import MemberPriceBatchItem, ProductCreate
from app.services.order_service import _effective_order_price


def test_standard_price_must_be_positive():
    with pytest.raises(ValidationError):
        ProductCreate(
            name="测试商品",
            barcode="ZERO-STANDARD",
            category_id="00000000-0000-0000-0000-000000000001",
            unit="件",
            standard_price=0,
            cost_price=0,
        )


def test_member_price_must_be_positive():
    with pytest.raises(ValidationError):
        MemberPriceBatchItem(
            level_id="00000000-0000-0000-0000-000000000001",
            price=0,
        )


def test_effective_order_price_falls_back_only_for_missing_member_price():
    assert _effective_order_price(None, Decimal("100")) == Decimal("100")
    assert _effective_order_price(Decimal("80"), Decimal("100")) == Decimal("80")
    assert _effective_order_price(Decimal("0"), Decimal("100")) == Decimal("0")
```

- [ ] **Step 2: Run the backend tests and verify failure**

Run:

```bash
cd backend
uv run pytest tests/test_price_rules.py -v
```

Expected: failures because zero prices are currently accepted and `_effective_order_price` does not exist.

- [ ] **Step 3: Implement positive sale-price validation and explicit fallback**

Use `gt=0` for standard/member sale prices while leaving cost price at `ge=0`:

```python
class MemberPriceBatchItem(ApiSchema):
    level_id: str
    price: float = Field(..., gt=0)


class ProductCreate(ApiSchema):
    standard_price: float = Field(..., gt=0)
    cost_price: float = Field(..., ge=0)
```

Apply the same `gt=0` rule to `MemberPriceCreate` and `MemberPriceUpdate`. Split price-change requests so cost price can still be zero:

```python
class SalePriceChangeRequest(ApiSchema):
    price: float = Field(..., gt=0)
    reason: str = Field("", max_length=255)


class CostPriceChangeRequest(ApiSchema):
    price: float = Field(..., ge=0)
    reason: str = Field("", max_length=255)


class MemberPriceRequest(SalePriceChangeRequest):
    pass
```

Use `SalePriceChangeRequest` on the standard-price route, `CostPriceChangeRequest` on the cost-price route, and `MemberPriceRequest` on the member-price route. Add and use:

```python
def _effective_order_price(
    member_price: Decimal | None,
    standard_price: Decimal,
) -> Decimal:
    return standard_price if member_price is None else member_price
```

- [ ] **Step 4: Add frontend failing tests for zero sale/member prices**

Add assertions that normalization rejects zero:

```ts
expect(() => normalizeSalePrice(0)).toThrow('售价必须大于0');
expect(() => normalizeMemberPrice(0)).toThrow('会员价必须大于0');
expect(normalizeCostPrice(0)).toBe(0);
```

- [ ] **Step 5: Implement frontend price helpers and form minimums**

Use shared helpers in the existing product form modules:

```ts
export function normalizeSalePrice(value: number): number {
  if (value <= 0) throw new Error('售价必须大于0');
  return value;
}

export function normalizeMemberPrice(value: number): number {
  if (value <= 0) throw new Error('会员价必须大于0');
  return value;
}

export function normalizeCostPrice(value: number): number {
  if (value < 0) throw new Error('成本价不能小于0');
  return value;
}
```

Set sale/member `InputNumber` controls to `min={0.01}` and keep cost at `min={0}`.

- [ ] **Step 6: Run focused price tests**

```bash
cd backend && uv run pytest tests/test_price_rules.py -v
cd ../frontend && npm test -- src/pages/Product/form.test.ts src/pages/Product/memberPrices.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit the price-rule change**

```bash
git add backend/tests/test_price_rules.py backend/app/schemas/product.py backend/app/schemas/customer.py backend/app/services/order_service.py frontend/src/pages/Product/form.ts frontend/src/pages/Product/form.test.ts frontend/src/pages/Product/memberPrices.ts frontend/src/pages/Product/memberPrices.test.ts
git commit -m "fix: enforce positive sale prices"
```

---

### Task 2: Add Multi-Role Employee Domain Model

**Files:**
- Create: `backend/tests/test_role_permissions.py`
- Modify: `backend/app/models/employee.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/core/permissions.py`
- Modify: `backend/app/schemas/employee.py`

- [ ] **Step 1: Write failing employee-role model tests**

```python
import uuid

from app.core.permissions import has_any_role, role_values
from app.models.employee import Employee, EmployeeRole, EmployeeRoleAssignment


def test_fixed_business_roles_are_available_without_normal():
    assert {role.value for role in EmployeeRole} == {
        "admin",
        "warehouse_manager",
        "delivery",
        "finance",
    }


def test_employee_roles_are_deduplicated_and_checked_as_a_set():
    employee = Employee(id=uuid.uuid4(), username="mixed", password_hash="x", name="兼任员工")
    employee.role_assignments = [
        EmployeeRoleAssignment(role=EmployeeRole.warehouse_manager),
        EmployeeRoleAssignment(role=EmployeeRole.delivery),
    ]
    assert role_values(employee) == {"warehouse_manager", "delivery"}
    assert has_any_role(employee, EmployeeRole.delivery)
    assert not has_any_role(employee, EmployeeRole.finance)
```

- [ ] **Step 2: Run the model tests and verify failure**

```bash
cd backend
uv run pytest tests/test_role_permissions.py -v
```

Expected: failure because the association model and permission helpers do not exist.

- [ ] **Step 3: Implement fixed roles and association model**

Define the normalized role model:

```python
class EmployeeRole(str, enum.Enum):
    admin = "admin"
    warehouse_manager = "warehouse_manager"
    delivery = "delivery"
    finance = "finance"


class EmployeeRoleAssignment(UUIDMixin, Base):
    __tablename__ = "employee_roles"
    __table_args__ = (
        UniqueConstraint("employee_id", "role", name="uq_employee_roles_employee_role"),
    )

    employee_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[EmployeeRole] = mapped_column(
        Enum(EmployeeRole, name="employee_business_role", native_enum=True),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    employee: Mapped["Employee"] = relationship(back_populates="role_assignments")
```

Replace the single `Employee.role` mapping with:

```python
role_assignments: Mapped[list["EmployeeRoleAssignment"]] = relationship(
    back_populates="employee",
    cascade="all, delete-orphan",
    lazy="selectin",
)
```

- [ ] **Step 4: Implement centralized role helpers**

Create `backend/app/core/permissions.py`:

```python
from collections.abc import Iterable

from app.models.employee import Employee, EmployeeRole


def employee_roles(employee: Employee) -> set[EmployeeRole]:
    return {assignment.role for assignment in employee.role_assignments}


def role_values(employee: Employee) -> set[str]:
    return {role.value for role in employee_roles(employee)}


def has_any_role(employee: Employee, *required: EmployeeRole) -> bool:
    roles = employee_roles(employee)
    return EmployeeRole.admin in roles or bool(roles.intersection(required))


def normalize_roles(values: Iterable[EmployeeRole]) -> list[EmployeeRole]:
    return sorted(set(values), key=lambda role: role.value)
```

- [ ] **Step 5: Update employee schemas for role arrays**

Use non-empty, duplicate-free roles:

```python
class EmployeeCreate(ApiSchema):
    username: str
    password: str
    name: str
    phone: Optional[str] = None
    roles: list[EmployeeRole] = Field(..., min_length=1)

    @field_validator("roles")
    @classmethod
    def unique_roles(cls, values: list[EmployeeRole]) -> list[EmployeeRole]:
        if len(values) != len(set(values)):
            raise ValueError("员工角色不能重复")
        return values
```

Apply the same rule to update/output schemas, with update roles optional and output roles always populated.

- [ ] **Step 6: Run focused model/schema tests**

```bash
cd backend
uv run pytest tests/test_role_permissions.py -v
```

Expected: all role model and schema tests pass without touching API dependencies yet.

- [ ] **Step 7: Commit the role domain model**

```bash
git add backend/tests/test_role_permissions.py backend/app/models/employee.py backend/app/models/__init__.py backend/app/core/permissions.py backend/app/schemas/employee.py
git commit -m "feat: add multi-role employee model"
```

---

### Task 3: Add the Incremental Database Migration and Verify It in DBX

**Files:**
- Create: `backend/migrations/incremental/2026-07-20_退货来源追踪与员工多角色.sql`
- Modify: `backend/tests/test_role_permissions.py`
- Create: `backend/tests/test_return_order_sources.py`

- [ ] **Step 1: Add failing SQL contract tests**

```python
from pathlib import Path


MIGRATION = (
    Path(__file__).parents[1]
    / "migrations"
    / "incremental"
    / "2026-07-20_退货来源追踪与员工多角色.sql"
)


def test_role_return_migration_contains_required_guards_and_constraints():
    sql = MIGRATION.read_text(encoding="utf-8").lower()
    assert "create type employee_business_role" in sql
    assert "create table if not exists employee_roles" in sql
    assert "insert into employee_roles" in sql
    assert "returned_amount numeric(12, 2)" in sql
    assert "handling_delivery_id" in sql
    assert "source_order_item_id" in sql
    assert "ck_orders_returned_amount_range" in sql
    assert "raise exception" in sql
```

- [ ] **Step 2: Run migration contract tests and verify failure**

```bash
cd backend
uv run pytest tests/test_role_permissions.py tests/test_return_order_sources.py -v
```

Expected: failure because the migration file does not exist.

- [ ] **Step 3: Write the transactional migration**

The SQL must perform these concrete operations in one transaction:

```sql
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM return_orders) THEN
        RAISE EXCEPTION 'Existing return_orders must be mapped before source tracking migration';
    END IF;
END $$;

DO $$
BEGIN
    CREATE TYPE employee_business_role AS ENUM (
        'admin', 'warehouse_manager', 'delivery', 'finance'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS employee_roles (
    id uuid PRIMARY KEY,
    employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role employee_business_role NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT now(),
    CONSTRAINT uq_employee_roles_employee_role UNIQUE (employee_id, role)
);

INSERT INTO employee_roles (id, employee_id, role)
SELECT gen_random_uuid(), id,
       CASE role::text WHEN 'admin' THEN 'admin'::employee_business_role
                       ELSE 'warehouse_manager'::employee_business_role END
FROM employees
ON CONFLICT (employee_id, role) DO NOTHING;

ALTER TABLE employees DROP COLUMN role;
DROP TYPE IF EXISTS employee_role;

ALTER TABLE orders
    ADD COLUMN returned_amount numeric(12, 2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_orders_returned_amount_range
        CHECK (returned_amount >= 0 AND returned_amount <= total_amount);

ALTER TABLE return_orders
    ADD COLUMN handling_delivery_id uuid NOT NULL REFERENCES order_deliveries(id);

ALTER TABLE return_order_items
    ADD COLUMN source_order_item_id uuid NOT NULL REFERENCES order_items(id);

CREATE INDEX IF NOT EXISTS ix_employee_roles_employee_id
    ON employee_roles(employee_id);
CREATE INDEX IF NOT EXISTS ix_return_orders_handling_delivery_id
    ON return_orders(handling_delivery_id);
CREATE INDEX IF NOT EXISTS ix_return_order_items_source_order_item_id
    ON return_order_items(source_order_item_id);

COMMIT;
```

Use `gen_random_uuid()` for migrated association-row IDs, matching the existing incremental migration convention in `backend/migrations/incremental/2026-07-19_订单库存分配.sql`.

- [ ] **Step 4: Run SQL contract tests**

```bash
cd backend
uv run pytest tests/test_role_permissions.py tests/test_return_order_sources.py -v
```

Expected: migration contract tests pass.

- [ ] **Step 5: Execute the migration with DBX MCP**

Use DBX connection `postgres`, database `postgres`, and execute the complete migration file through `dbx_execute_and_show`. Do not use `psql` or an application startup hook.

Expected: the transaction commits without an exception.

- [ ] **Step 6: Verify migrated schema and data with DBX**

Run these read-only queries through `dbx_execute_query`:

```sql
SELECT employee_id, array_agg(role::text ORDER BY role::text) AS roles
FROM employee_roles
GROUP BY employee_id;
```

```sql
SELECT count(*) AS employees_without_roles
FROM employees e
WHERE NOT EXISTS (
    SELECT 1 FROM employee_roles er WHERE er.employee_id = e.id
);
```

```sql
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name IN ('orders', 'return_orders', 'return_order_items')
  AND column_name IN ('returned_amount', 'handling_delivery_id', 'source_order_item_id')
ORDER BY table_name, column_name;
```

Expected:

- Every employee has at least one role.
- Existing admins map to `admin`; existing normal users map to `warehouse_manager`.
- `returned_amount`, `handling_delivery_id`, and `source_order_item_id` exist with the intended nullability.

- [ ] **Step 7: Commit the migration**

```bash
git add backend/migrations/incremental/2026-07-20_退货来源追踪与员工多角色.sql backend/tests/test_role_permissions.py backend/tests/test_return_order_sources.py
git commit -m "feat: migrate employee roles and return sources"
```

---

### Task 4: Update Authentication, Employee CRUD, and Role Dependencies

**Files:**
- Modify: `backend/app/core/deps.py`
- Modify: `backend/app/schemas/auth.py`
- Modify: `backend/app/services/auth_service.py`
- Modify: `backend/app/services/employee_service.py`
- Modify: `backend/app/api/v1/auth.py`
- Modify: `backend/app/api/v1/employee.py`
- Modify: `backend/tests/test_role_permissions.py`

- [ ] **Step 1: Write failing dependency and employee-service tests**

```python
import pytest
from fastapi import HTTPException

from app.core.deps import require_any_role
from app.models.employee import EmployeeRole


@pytest.mark.asyncio
async def test_require_any_role_uses_role_union(employee_with_roles):
    dependency = require_any_role(EmployeeRole.warehouse_manager, EmployeeRole.delivery)
    assert await dependency(employee_with_roles) is employee_with_roles


@pytest.mark.asyncio
async def test_require_any_role_rejects_unmatched_employee(finance_employee):
    dependency = require_any_role(EmployeeRole.warehouse_manager)
    with pytest.raises(HTTPException) as error:
        await dependency(finance_employee)
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_update_employee_replaces_complete_role_set(db, employee):
    updated = await update_employee(
        db,
        str(employee.id),
        EmployeeUpdate(roles=[EmployeeRole.warehouse_manager, EmployeeRole.delivery]),
    )
    assert role_values(updated) == {"warehouse_manager", "delivery"}
```

- [ ] **Step 2: Run focused tests and verify failure**

```bash
cd backend
uv run pytest tests/test_role_permissions.py -v
```

Expected: role dependency and role replacement tests fail.

- [ ] **Step 3: Load employee roles during authentication**

Update employee lookups to use `selectinload(Employee.role_assignments)` and return roles explicitly:

```python
class CurrentUserOut(ApiSchema):
    id: str
    username: str
    name: str
    roles: list[EmployeeRole]
```

Access-token payloads may include `roles` for client convenience, but every authenticated request must continue loading the current employee from the database so role changes take effect immediately.

- [ ] **Step 4: Implement reusable role dependencies**

```python
def require_any_role(*required_roles: EmployeeRole):
    async def dependency(current_user: Employee = Depends(get_current_user)) -> Employee:
        if not has_any_role(current_user, *required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role permission",
            )
        return current_user

    return dependency


AdminUser = Annotated[
    Employee,
    Depends(require_any_role(EmployeeRole.admin)),
]
WarehouseUser = Annotated[
    Employee,
    Depends(require_any_role(EmployeeRole.warehouse_manager)),
]
DeliveryUser = Annotated[
    Employee,
    Depends(require_any_role(EmployeeRole.delivery)),
]
FinanceUser = Annotated[
    Employee,
    Depends(require_any_role(EmployeeRole.finance)),
]
```

Because `has_any_role` treats `admin` as an override, each alias automatically permits administrators.

- [ ] **Step 5: Replace employee role assignments atomically**

Implement one helper in `employee_service.py`:

```python
def replace_employee_roles(
    employee: Employee,
    roles: list[EmployeeRole],
) -> None:
    normalized = normalize_roles(roles)
    employee.role_assignments = [
        EmployeeRoleAssignment(role=role) for role in normalized
    ]
```

Call it from create and update. Reject empty role arrays at schema validation before service execution.

- [ ] **Step 6: Run authentication and employee tests**

```bash
cd backend
uv run pytest tests/test_role_permissions.py tests/test_business_logic.py -k "auth or employee or role" -v
```

Expected: all focused auth/employee/role tests pass.

- [ ] **Step 7: Commit authentication and employee changes**

```bash
git add backend/app/core/deps.py backend/app/schemas/auth.py backend/app/services/auth_service.py backend/app/services/employee_service.py backend/app/api/v1/auth.py backend/app/api/v1/employee.py backend/tests/test_role_permissions.py
git commit -m "feat: authorize employees by role sets"
```

---

### Task 5: Apply the Backend Permission Matrix

**Files:**
- Modify: `backend/app/api/v1/customer.py`
- Modify: `backend/app/api/v1/inventory.py`
- Modify: `backend/app/api/v1/order.py`
- Modify: `backend/app/api/v1/order_delivery.py`
- Modify: `backend/app/api/v1/product.py`
- Modify: `backend/app/api/v1/return_order.py`
- Modify: `backend/tests/test_role_permissions.py`

- [ ] **Step 1: Write failing route dependency contract tests**

Add route-signature assertions for the intended matrix:

```python
PERMISSION_MATRIX = {
    "create_customer": {"admin"},
    "create_order": {"warehouse_manager", "admin"},
    "start_shipping": {"warehouse_manager", "admin"},
    "adjust_shipping_allocations": {"warehouse_manager", "admin"},
    "stock_out": {"warehouse_manager", "admin"},
    "batch_stock_in_op": {"warehouse_manager", "admin"},
    "batch_stocktake_op": {"warehouse_manager", "admin"},
    "sign_delivery": {"delivery", "admin"},
    "create_return_order": {"delivery", "admin"},
    "void_return_order": {"admin"},
}
```

Use FastAPI dependency introspection or authenticated ASGI tests to verify a permitted role receives a non-403 response and a non-permitted role receives 403 before the service is called.

- [ ] **Step 2: Run permission tests and verify failure**

```bash
cd backend
uv run pytest tests/test_role_permissions.py -k "route or permission" -v
```

Expected: failures because write routes still use `CurrentUser` or single-role dependencies.

- [ ] **Step 3: Apply customer and order permissions**

Use these dependencies:

```text
Customer create/update: AdminUser
Order create/start-shipping/cancel: WarehouseUser
Order shipping-allocation/stock-out: WarehouseUser
Order list/detail/shipping-options: CurrentUser
Order complete from order management: FinanceUser
```

Delivery signing continues to support collection for the assigned `delivery` employee through the delivery endpoint.

- [ ] **Step 4: Apply inventory and product permissions**

Use these dependencies:

```text
Supplier/warehouse/category/brand/product-basic writes: WarehouseUser
Inventory stock-in/out/transfer/stocktake writes: WarehouseUser
Standard-price/member-price/cost-price writes: WarehouseUser
Read operations: CurrentUser
```

Do not authorize based only on hidden frontend buttons.

- [ ] **Step 5: Apply delivery and return permissions**

Use these dependencies:

```text
Delivery current/archive/detail: CurrentUser with service-level scope
Delivery exception/sign: DeliveryUser with owner check
Delivery reassign: AdminUser
Return create: DeliveryUser with handling-delivery owner check
Return void: AdminUser
Return list/detail: CurrentUser
```

- [ ] **Step 6: Run permission tests**

```bash
cd backend
uv run pytest tests/test_role_permissions.py -v
```

Expected: the complete permission matrix passes.

- [ ] **Step 7: Commit backend permission routing**

```bash
git add backend/app/api/v1/customer.py backend/app/api/v1/inventory.py backend/app/api/v1/order.py backend/app/api/v1/order_delivery.py backend/app/api/v1/product.py backend/app/api/v1/return_order.py backend/tests/test_role_permissions.py
git commit -m "feat: enforce business role permissions"
```

---

### Task 6: Add Order Returned Amount and Net Payment Ceiling

**Files:**
- Modify: `backend/app/models/order.py`
- Modify: `backend/app/schemas/order.py`
- Modify: `backend/app/services/order_service.py`
- Modify: `backend/tests/test_return_order_sources.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] **Step 1: Write failing order accounting tests**

```python
from decimal import Decimal

import pytest

from app.services.order_service import order_net_amount


def test_order_net_amount_subtracts_returns_without_mutating_total():
    order = Order(total_amount=Decimal("1000"), returned_amount=Decimal("250"))
    assert order_net_amount(order) == Decimal("750")
    assert order.total_amount == Decimal("1000")


def test_complete_order_rejects_payment_above_net_amount():
    order = Order(total_amount=Decimal("1000"), returned_amount=Decimal("250"))
    with pytest.raises(ValueError, match="应收净额"):
        validate_payment_amount(order, Decimal("800"))
```

- [ ] **Step 2: Run focused order accounting tests and verify failure**

```bash
cd backend
uv run pytest tests/test_return_order_sources.py -k "net_amount or payment" -v
```

Expected: failures because the model field/helper/output do not exist.

- [ ] **Step 3: Implement model and schema fields**

```python
returned_amount: Mapped[Decimal] = mapped_column(
    Numeric(12, 2), nullable=False, default=Decimal("0")
)
```

Add output fields:

```python
class OrderOut(ApiSchema):
    total_amount: float
    returned_amount: float = 0
    net_amount: float = 0
```

Populate `net_amount` in `_out` from a single helper:

```python
def order_net_amount(order: Order) -> Decimal:
    return Decimal(str(order.total_amount)) - Decimal(str(order.returned_amount))
```

- [ ] **Step 4: Enforce payment ceiling against net amount**

Replace the total-amount ceiling with:

```python
def validate_payment_amount(order: Order, paid_amount: Decimal) -> None:
    if paid_amount > order_net_amount(order):
        raise ValueError("实收金额不能超过订单应收净额")
```

Call `validate_payment_amount(order, paid_amount)` from the completed transition. Keep the existing positive payment and proof requirements.

- [ ] **Step 5: Run order accounting tests**

```bash
cd backend
uv run pytest tests/test_return_order_sources.py tests/test_business_logic.py -k "order or payment or complete" -v
```

Expected: all focused order/payment tests pass.

- [ ] **Step 6: Commit order return accounting**

```bash
git add backend/app/models/order.py backend/app/schemas/order.py backend/app/services/order_service.py backend/tests/test_return_order_sources.py backend/tests/test_business_logic.py
git commit -m "feat: track order return and net amounts"
```

---

### Task 7: Implement Returnable Historical Order Items

**Files:**
- Modify: `backend/app/schemas/return_order.py`
- Modify: `backend/app/services/order_delivery_service.py`
- Modify: `backend/app/api/v1/order_delivery.py`
- Modify: `backend/tests/test_return_order_sources.py`

- [ ] **Step 1: Write failing returnable-item query tests**

```python
@pytest.mark.asyncio
async def test_returnable_items_include_same_customer_history_only(db, current_delivery, employee):
    result = await list_returnable_items(db, current_delivery.id, employee)
    assert {item.source_order_item_id for item in result.items} == {"same-customer-item"}
    assert result.items[0].sold_quantity == 5
    assert result.items[0].returned_quantity == 2
    assert result.items[0].returnable_quantity == 3


@pytest.mark.asyncio
async def test_returnable_items_require_current_delivery_owner(db, other_delivery, employee):
    with pytest.raises(PermissionError, match="当前配送任务"):
        await list_returnable_items(db, other_delivery.id, employee)
```

- [ ] **Step 2: Run query tests and verify failure**

```bash
cd backend
uv run pytest tests/test_return_order_sources.py -k "returnable_items" -v
```

Expected: failure because the output schema and query do not exist.

- [ ] **Step 3: Add explicit output contracts**

```python
class ReturnableOrderItemOut(ApiSchema):
    source_order_id: str
    source_order_no: str
    source_order_status: OrderStatus
    source_order_item_id: str
    product_id: str
    product_name: str
    barcode: str
    unit_price: Decimal
    sold_quantity: int
    returned_quantity: int
    returnable_quantity: int


class ReturnableOrderItemPageOut(ApiSchema):
    customer_id: str
    customer_name: str
    items: list[ReturnableOrderItemOut]
```

- [ ] **Step 4: Implement active-delivery authorization helper**

```python
async def require_active_handling_delivery(
    db: AsyncSession,
    delivery_id: UUID,
    current_user: Employee,
) -> tuple[OrderDelivery, Order]:
    delivery, order = await _locked_delivery_order(db, delivery_id)
    _require_owner_or_admin(delivery, current_user)
    _require_delivering_stocked_out(delivery, order)
    return delivery, order
```

Use the helper from both the query and return creation so permission semantics cannot diverge.

- [ ] **Step 5: Implement the historical-item query**

Query source orders for the handling order's customer and statuses `stocked_out`, `delivered_unpaid`, `completed`. Left join aggregate completed return quantities by `source_order_item_id`, then return rows where sold quantity is greater than effective returned quantity.

The calculation must be exactly:

```python
returned_quantity = func.coalesce(
    func.sum(ReturnOrderItem.quantity).filter(
        ReturnOrder.status == ReturnOrderStatus.completed
    ),
    0,
)
returnable_quantity = OrderItem.quantity - returned_quantity
```

- [ ] **Step 6: Add the delivery endpoint**

```python
@router.get(
    "/{delivery_id}/returnable-items",
    response_model=ResponseBase[ReturnableOrderItemPageOut],
)
async def returnable_items(
    delivery_id: UUID,
    current_user: DeliveryUser,
    db: AsyncSession = Depends(get_db),
):
    return ResponseBase(
        data=await list_returnable_items(db, delivery_id, current_user)
    )
```

- [ ] **Step 7: Run returnable-item tests**

```bash
cd backend
uv run pytest tests/test_return_order_sources.py -k "returnable_items" -v
```

Expected: same-customer source rows and remaining quantities are correct; cross-owner access is rejected.

- [ ] **Step 8: Commit the returnable-item query**

```bash
git add backend/app/schemas/return_order.py backend/app/services/order_delivery_service.py backend/app/api/v1/order_delivery.py backend/tests/test_return_order_sources.py
git commit -m "feat: expose historical returnable items"
```

---

### Task 8: Rewrite Return Creation Around Source Order Items

**Files:**
- Modify: `backend/app/models/return_order.py`
- Modify: `backend/app/schemas/return_order.py`
- Modify: `backend/app/services/return_order_service.py`
- Modify: `backend/app/api/v1/return_order.py`
- Modify: `backend/tests/test_return_order_sources.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] **Step 1: Write failing source-linked return tests**

Cover these concrete cases:

```python
@pytest.mark.asyncio
async def test_delivery_can_return_previous_order_for_same_customer(
    db,
    delivery_employee,
    handling_delivery,
    historical_item,
    source_linked_return_request,
):
    created = await create_return_order(db, request, delivery_employee)
    assert created.handling_delivery_id == handling_delivery.id
    assert created.items[0].source_order_item_id == historical_item.id
    assert created.items[0].unit_price == historical_item.unit_price


@pytest.mark.asyncio
async def test_return_rejects_different_customer_source_item(
    db,
    delivery_employee,
    different_customer_return_request,
):
    with pytest.raises(ValueError, match="同一客户"):
        await create_return_order(db, request, delivery_employee)


@pytest.mark.asyncio
async def test_return_rejects_quantity_above_remaining_returnable(
    db,
    delivery_employee,
    excessive_return_request,
):
    with pytest.raises(ValueError, match="可退数量"):
        await create_return_order(db, request, delivery_employee)


@pytest.mark.asyncio
async def test_disabled_product_from_historical_order_can_be_returned(
    db,
    delivery_employee,
    disabled_product_return_request,
):
    created = await create_return_order(db, request, delivery_employee)
    assert created.status == ReturnOrderStatus.completed
```

- [ ] **Step 2: Run source-linked return tests and verify failure**

```bash
cd backend
uv run pytest tests/test_return_order_sources.py -k "create_return or disabled_product" -v
```

Expected: failures because requests still accept customer/product/unit price and services do not validate source order items.

- [ ] **Step 3: Replace the return create request contract**

```python
class ReturnOrderItemCreate(ApiSchema):
    source_order_item_id: str
    quantity: int = Field(..., gt=0)
    condition: ReturnProductCondition = ReturnProductCondition.normal
    return_reason: str = Field(..., min_length=1, max_length=255)
    remark: Optional[str] = None
    should_stock_in: bool = False
    warehouse_id: Optional[str] = None


class ReturnOrderCreate(ApiSchema):
    handling_delivery_id: str
    items: list[ReturnOrderItemCreate] = Field(..., min_length=1)
    remark: Optional[str] = None

    @model_validator(mode="after")
    def reject_duplicate_sources(self):
        source_ids = [item.source_order_item_id for item in self.items]
        if len(source_ids) != len(set(source_ids)):
            raise ValueError("同一订单明细不能重复添加")
        return self
```

- [ ] **Step 4: Update return models**

Add `handling_delivery_id` to `ReturnOrder` and `source_order_item_id` to `ReturnOrderItem`, with relationships used only where eager loading is required. Keep product/name/barcode/unit-price snapshots.

- [ ] **Step 5: Implement locked source validation and cumulative quantity calculation**

In one service transaction:

```python
delivery, handling_order = await require_active_handling_delivery(
    db, UUID(req.handling_delivery_id), operator
)

source_items = await lock_source_order_items(
    db,
    [UUID(item.source_order_item_id) for item in req.items],
)
```

For every source item require:

```python
source_order.customer_id == handling_order.customer_id
source_order.status in {
    OrderStatus.stocked_out,
    OrderStatus.delivered_unpaid,
    OrderStatus.completed,
}
requested_quantity <= source_item.quantity - completed_return_quantity
```

Do not reject a source item because the current product status is disabled.

- [ ] **Step 6: Derive snapshots and per-order return amounts on the server**

Create each return item from the source item:

```python
subtotal = Decimal(str(source_item.unit_price)) * requested.quantity
return_item = ReturnOrderItem(
    source_order_item_id=source_item.id,
    product_id=source_item.product_id,
    product_name=source_item.product_name,
    barcode=source_item.barcode,
    quantity=requested.quantity,
    unit_price=source_item.unit_price,
    subtotal=subtotal,
    condition=requested.condition,
    return_reason=requested.return_reason,
    remark=requested.remark,
    should_stock_in=requested.should_stock_in,
    warehouse_id=requested.warehouse_id,
)
```

Aggregate subtotal by source order and increment each locked order's `returned_amount`. Reject any result above `total_amount`.

- [ ] **Step 7: Apply customer-spend rules exactly once**

For source orders already `completed`, sum their returned amounts and reduce customer `total_spent`, capped at zero. Persist the actual deduction in the return order's existing spend-audit fields so void reversal restores only the amount actually deducted.

For `stocked_out` and `delivered_unpaid` source orders, do not change customer `total_spent`.

- [ ] **Step 8: Preserve inventory transaction behavior**

Keep the existing warehouse validation and movement types, but source all product snapshots from the historical order item. Lock inventory rows in sorted `(product_id, warehouse_id)` order before quantity changes.

- [ ] **Step 9: Update API actor handling**

Pass the full `Employee` object to `create_return_order`, not a username string, so service authorization cannot be bypassed:

```python
return_order = await create_return_order(db, req, current_user)
```

- [ ] **Step 10: Run complete return-creation tests**

```bash
cd backend
uv run pytest tests/test_return_order_sources.py tests/test_business_logic.py -k "return_order or returnable" -v
```

Expected: all source, customer, quantity, status, disabled-product, inventory, and spend tests pass.

- [ ] **Step 11: Commit source-linked return creation**

```bash
git add backend/app/models/return_order.py backend/app/schemas/return_order.py backend/app/services/return_order_service.py backend/app/api/v1/return_order.py backend/tests/test_return_order_sources.py backend/tests/test_business_logic.py
git commit -m "feat: create returns from historical order items"
```

---

### Task 9: Rewrite Return Void Reversal for Multiple Source Orders

**Files:**
- Modify: `backend/app/services/return_order_service.py`
- Modify: `backend/tests/test_return_order_sources.py`

- [ ] **Step 1: Write failing multi-order void tests**

```python
@pytest.mark.asyncio
async def test_void_restores_each_source_order_returned_amount(
    db,
    completed_multi_order_return,
    source_order_one,
    source_order_two,
    admin,
):
    voided = await void_return_order(db, str(return_order.id), admin, "录入错误")
    assert source_order_one.returned_amount == Decimal("0")
    assert source_order_two.returned_amount == Decimal("0")
    assert voided.status == ReturnOrderStatus.voided


@pytest.mark.asyncio
async def test_void_restores_only_actual_customer_spend_deduction(
    db,
    completed_multi_order_return,
    customer,
    original_spent,
    admin,
):
    await void_return_order(db, str(return_order.id), admin, "录入错误")
    assert customer.total_spent == original_spent


@pytest.mark.asyncio
async def test_void_fails_atomically_when_return_stock_is_locked(
    db,
    completed_multi_order_return,
    return_order,
    admin,
):
    with pytest.raises(ValueError, match="可用库存不足"):
        await void_return_order(db, str(return_order.id), admin, "录入错误")
    assert return_order.status == ReturnOrderStatus.completed
```

- [ ] **Step 2: Run void tests and verify failure**

```bash
cd backend
uv run pytest tests/test_return_order_sources.py -k "void" -v
```

Expected: failures because void currently restores only customer/inventory and does not group source orders.

- [ ] **Step 3: Lock and group source orders during void**

Load return items with source order items, derive distinct source order IDs, and lock orders in sorted ID order. For each order:

```python
new_returned_amount = Decimal(str(order.returned_amount)) - returned_by_order[order.id]
if new_returned_amount < 0:
    raise ValueError("订单累计退货金额不足")
order.returned_amount = new_returned_amount
```

- [ ] **Step 4: Preserve inventory and spend reversal audit**

Run inventory availability checks before mutating any order/customer state. Restore only `spend_deduction_amount`, then write `void_customer_spent_before` and `void_customer_spent_after` as the existing audit model requires.

- [ ] **Step 5: Run all void tests**

```bash
cd backend
uv run pytest tests/test_return_order_sources.py tests/test_business_logic.py -k "void_return" -v
```

Expected: all void and rollback tests pass.

- [ ] **Step 6: Commit return reversal changes**

```bash
git add backend/app/services/return_order_service.py backend/tests/test_return_order_sources.py
git commit -m "fix: reverse source order returns atomically"
```

---

### Task 10: Update Frontend Identity, Access, and Employee Role Editing

**Files:**
- Modify: `frontend/src/typings.d.ts`
- Modify: `frontend/src/access.ts`
- Create: `frontend/src/access.test.ts`
- Modify: `frontend/config/routes.ts`
- Modify: `frontend/src/services/api.ts`
- Modify: `frontend/src/services/employee.ts`
- Create: `frontend/src/pages/Employee/roles.ts`
- Create: `frontend/src/pages/Employee/roles.test.ts`
- Modify: `frontend/src/pages/Employee/index.tsx`
- Modify: `frontend/src/pages/Customer/index.tsx`

- [ ] **Step 1: Write failing access tests**

```ts
import { describe, expect, it } from 'vitest';
import access from './access';

describe('multi-role access', () => {
  it('unions employee roles', () => {
    expect(access({ currentUser: { roles: ['warehouse_manager', 'delivery'] } as API.CurrentUser })).toMatchObject({
      canDelivery: true,
      canWarehouse: true,
      canAdmin: false,
    });
  });

  it('grants every business capability to admin', () => {
    expect(access({ currentUser: { roles: ['admin'] } as API.CurrentUser })).toMatchObject({
      canAdmin: true,
      canWarehouse: true,
      canDelivery: true,
      canFinance: true,
    });
  });
});
```

- [ ] **Step 2: Write failing employee-role helper tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeEmployeeRoles, roleOptions } from './roles';

describe('employee roles', () => {
  it('deduplicates roles while preserving fixed option order', () => {
    expect(normalizeEmployeeRoles(['delivery', 'warehouse_manager', 'delivery'])).toEqual(['warehouse_manager', 'delivery']);
  });

  it('contains all fixed business roles', () => {
    expect(roleOptions.map((option) => option.value)).toEqual([
      'admin', 'warehouse_manager', 'delivery', 'finance',
    ]);
  });
});
```

- [ ] **Step 3: Run frontend access/role tests and verify failure**

```bash
cd frontend
npm test -- src/access.test.ts src/pages/Employee/roles.test.ts
```

Expected: failures because `roles` and access keys do not exist.

- [ ] **Step 4: Replace single-role frontend contracts**

Define:

```ts
type EmployeeRole = 'admin' | 'warehouse_manager' | 'delivery' | 'finance';

interface CurrentUser {
  id: string;
  username: string;
  name: string;
  roles: EmployeeRole[];
}
```

Remove business authorization reads of `currentUser.role`.

- [ ] **Step 5: Implement role-set access keys**

```ts
export default function access(initialState: { currentUser?: API.CurrentUser } | undefined) {
  const roles = new Set(initialState?.currentUser?.roles ?? []);
  const admin = roles.has('admin');
  return {
    canAdmin: admin,
    canWarehouse: admin || roles.has('warehouse_manager'),
    canDelivery: admin || roles.has('delivery'),
    canFinance: admin || roles.has('finance'),
  };
}
```

- [ ] **Step 6: Update route visibility**

Use `canWarehouse` for warehouse/supplier administration and inventory operations, `canDelivery` for delivery, and `canAdmin` for employee management. Keep read-only product, customer, order, and return routes visible to authenticated users where the backend allows reads.

- [ ] **Step 7: Implement employee role multi-select**

Use an Ant Design/ProForm multiple select:

```tsx
<ProFormSelect
  name="roles"
  label="角色"
  mode="multiple"
  options={roleOptions}
  rules={[{ required: true, message: '请至少选择一个角色' }]}
/>
```

Render roles as tags in the employee table and send the complete role array on create/update.

- [ ] **Step 8: Restrict customer write UI to admin**

Use `useAccess()` and hide create/edit actions unless `access.canAdmin` is true. Keep customer list and customer selection available to authenticated warehouse users for order creation.

- [ ] **Step 9: Run focused frontend tests**

```bash
cd frontend
npm test -- src/access.test.ts src/pages/Employee/roles.test.ts src/pages/Customer/index.test.tsx
npm run tsc
```

Expected: access, employee role, customer UI, and type checks pass.

- [ ] **Step 10: Commit frontend multi-role identity**

```bash
git add frontend/src/typings.d.ts frontend/src/access.ts frontend/src/access.test.ts frontend/config/routes.ts frontend/src/services/api.ts frontend/src/services/employee.ts frontend/src/pages/Employee/roles.ts frontend/src/pages/Employee/roles.test.ts frontend/src/pages/Employee/index.tsx frontend/src/pages/Customer/index.tsx
git commit -m "feat: support multi-role employee access"
```

---

### Task 11: Apply Frontend Product, Inventory, and Order Permissions

**Files:**
- Modify: `frontend/src/pages/Product/index.tsx`
- Modify: `frontend/src/pages/Inventory/operations/index.tsx`
- Modify: `frontend/src/pages/Inventory/warehouses/index.tsx`
- Modify: `frontend/src/pages/Inventory/suppliers/index.tsx`
- Modify: `frontend/src/pages/Order/index.tsx`
- Modify: `frontend/src/pages/Order/Detail/index.tsx`
- Modify: `frontend/src/services/order.ts`
- Modify: `frontend/src/pages/Order/index.test.tsx`
- Modify: `frontend/src/pages/Order/Detail/index.test.tsx`

- [ ] **Step 1: Add failing action-visibility tests**

Add explicit cases:

```ts
it('shows all product and price actions to warehouse users', () => {});
it('hides product and price actions from delivery-only users', () => {});
it('shows stock-out to warehouse users but not delivery-only users', () => {});
it('shows order create and cancel to warehouse users', () => {});
it('shows finance completion to finance users', () => {});
```

Mock `useAccess()` per case and assert buttons are present or absent.

- [ ] **Step 2: Run action tests and verify failure**

```bash
cd frontend
npm test -- src/pages/Order/index.test.tsx src/pages/Order/Detail/index.test.tsx
```

Expected: failures because actions are currently status-driven only.

- [ ] **Step 3: Gate product actions**

Use these UI rules:

```text
Product create/edit/basic status/category/brand: canWarehouse
Cost-price/standard-price/member-price edit: canWarehouse
Read/preview/price history: authenticated users
```

The backend remains the source of truth; UI gating only improves usability.

- [ ] **Step 4: Gate inventory actions**

Require `canWarehouse` before rendering operation forms or write buttons. Warehouse and supplier routes already use access keys; update them to `canWarehouse` instead of `canAdmin`.

- [ ] **Step 5: Gate order actions and show net amounts**

Use:

```text
Create/start shipping/cancel before stock-out: canWarehouse
Adjust allocation/confirm stock-out: canWarehouse
Confirm payment from order page: canFinance
View order/detail: authenticated users
```

Display `total_amount`, `returned_amount`, and `net_amount` separately. Default payment form amount to `net_amount`, not `total_amount`.

- [ ] **Step 6: Run focused UI tests and type checking**

```bash
cd frontend
npm test -- src/pages/Order/index.test.tsx src/pages/Order/Detail/index.test.tsx
npm run tsc
```

Expected: role-aware action and net-amount tests pass.

- [ ] **Step 7: Commit frontend business permissions**

```bash
git add frontend/src/pages/Product/index.tsx frontend/src/pages/Inventory/operations/index.tsx frontend/src/pages/Inventory/warehouses/index.tsx frontend/src/pages/Inventory/suppliers/index.tsx frontend/src/pages/Order/index.tsx frontend/src/pages/Order/Detail/index.tsx frontend/src/services/order.ts frontend/src/pages/Order/index.test.tsx frontend/src/pages/Order/Detail/index.test.tsx
git commit -m "feat: gate business actions by employee roles"
```

---

### Task 12: Add Delivery-Site Historical Return UI

**Files:**
- Modify: `frontend/src/services/delivery.ts`
- Modify: `frontend/src/services/returnOrder.ts`
- Create: `frontend/src/pages/Delivery/returnFlow.ts`
- Create: `frontend/src/pages/Delivery/returnFlow.test.ts`
- Create: `frontend/src/pages/Delivery/ReturnModal.tsx`
- Modify: `frontend/src/pages/Delivery/index.tsx`
- Modify: `frontend/src/pages/Delivery/index.test.tsx`
- Modify: `frontend/src/pages/ReturnOrder/index.tsx`
- Modify: `frontend/src/pages/ReturnOrder/index.test.tsx`
- Modify: `frontend/src/pages/ReturnOrder/returnOrder.ts`
- Modify: `frontend/src/pages/ReturnOrder/returnOrder.test.ts`

- [ ] **Step 1: Write failing pure return-flow tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildReturnPayload, validateReturnQuantity } from './returnFlow';

describe('delivery return flow', () => {
  it('rejects quantities above the historical remaining amount', () => {
    expect(() => validateReturnQuantity(4, 3)).toThrow('退货数量不能超过可退数量');
  });

  it('builds source-linked payload without editable price or product fields', () => {
    expect(buildReturnPayload('delivery-1', [{ source_order_item_id: 'item-1', quantity: 2 }])).toEqual({
      handling_delivery_id: 'delivery-1',
      items: [{ source_order_item_id: 'item-1', quantity: 2 }],
    });
  });
});
```

- [ ] **Step 2: Add failing component tests**

Test that a current delivery card/detail renders “办理退货”, opens the modal, loads `returnable-items`, displays source order number/unit price/remaining quantity, and submits no client-controlled product or unit-price fields.

Test that the standalone return-order page no longer exposes the old generic product-selection creation flow.

- [ ] **Step 3: Run return UI tests and verify failure**

```bash
cd frontend
npm test -- src/pages/Delivery/returnFlow.test.ts src/pages/Delivery/index.test.tsx src/pages/ReturnOrder/index.test.tsx src/pages/ReturnOrder/returnOrder.test.ts
```

Expected: failures because the delivery return modal and new service contracts do not exist.

- [ ] **Step 4: Add frontend service contracts**

Define:

```ts
export interface ReturnableOrderItem {
  source_order_id: string;
  source_order_no: string;
  source_order_status: OrderStatus;
  source_order_item_id: string;
  product_id: string;
  product_name: string;
  barcode: string;
  unit_price: number;
  sold_quantity: number;
  returned_quantity: number;
  returnable_quantity: number;
}
```

Add:

```ts
export function listDeliveryReturnableItems(deliveryId: string) {
  return request(`/api/v1/deliveries/${deliveryId}/returnable-items`, { method: 'GET' });
}
```

Replace the return create payload with `handling_delivery_id` and `source_order_item_id` fields.

- [ ] **Step 5: Implement the return-flow helpers**

```ts
export function validateReturnQuantity(quantity: number, returnableQuantity: number): number {
  if (quantity <= 0) throw new Error('退货数量必须大于0');
  if (quantity > returnableQuantity) throw new Error('退货数量不能超过可退数量');
  return quantity;
}
```

`buildReturnPayload` must copy only allowed request fields and must never accept product ID, customer ID, or unit price from editable form state.

- [ ] **Step 6: Implement `ReturnModal`**

The modal must:

- load historical returnable items when opened;
- group/display rows by source order number;
- show original unit price, sold quantity, returned quantity, and remaining quantity as read-only;
- allow quantity, condition, reason, stock-in decision, and warehouse selection;
- require active warehouse only when `should_stock_in` is true;
- submit the source-linked request and refresh both delivery and return-order lists.

- [ ] **Step 7: Add the delivery entry and simplify return-order page**

Render “办理退货” only for current `delivering` rows the user can operate. Remove the old generic create modal from `ReturnOrder/index.tsx`; keep list, detail, and admin-only void.

- [ ] **Step 8: Run return UI tests and type checking**

```bash
cd frontend
npm test -- src/pages/Delivery/returnFlow.test.ts src/pages/Delivery/index.test.tsx src/pages/ReturnOrder/index.test.tsx src/pages/ReturnOrder/returnOrder.test.ts
npm run tsc
```

Expected: all delivery-site return UI tests pass.

- [ ] **Step 9: Commit delivery-site return UI**

```bash
git add frontend/src/services/delivery.ts frontend/src/services/returnOrder.ts frontend/src/pages/Delivery/returnFlow.ts frontend/src/pages/Delivery/returnFlow.test.ts frontend/src/pages/Delivery/ReturnModal.tsx frontend/src/pages/Delivery/index.tsx frontend/src/pages/Delivery/index.test.tsx frontend/src/pages/ReturnOrder/index.tsx frontend/src/pages/ReturnOrder/index.test.tsx frontend/src/pages/ReturnOrder/returnOrder.ts frontend/src/pages/ReturnOrder/returnOrder.test.ts
git commit -m "feat: process historical returns from deliveries"
```

---

### Task 13: Synchronize Business Rules and Module Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `FEATURES.md`
- Modify: `docs/modules/auth.md`
- Modify: `docs/modules/customer.md`
- Modify: `docs/modules/employee.md`
- Modify: `docs/modules/inventory.md`
- Modify: `docs/modules/order.md`
- Modify: `docs/modules/return-order.md`

- [ ] **Step 1: Update the project-level customer-level rule**

Replace the automatic-level wording in `AGENTS.md` with the explicit current rule:

```text
付款并完成订单后更新客户累计消费和订单统计；客户等级当前仅人工维护，自动升级或降级属于后续功能。
```

- [ ] **Step 2: Document fixed multi-role permissions**

Document the four role codes, multi-select behavior, admin override, and role-union rule in auth and employee modules. State that customer writes are admin-only, while warehouse managers own product, price, inventory, and order operations.

- [ ] **Step 3: Replace the return module contract**

Document:

- active handling delivery;
- same-customer historical source order items;
- cumulative quantity ceiling;
- server-derived sale price;
- direct `completed` processing;
- `returned_amount` and computed `net_amount`;
- admin-only void reversal.

- [ ] **Step 4: Update order and inventory documentation**

Add order return/net amount fields and clarify that return inventory movements originate from historical order-item snapshots. Keep customer level explicitly manual.

- [ ] **Step 5: Verify documentation has no contradictory legacy statements**

Run:

```bash
rg -n "normal|自动调整客户等级|自动升级|不依赖原销售订单|可编辑退货单价|创建并处理退货" AGENTS.md FEATURES.md docs/modules
```

Expected: no legacy business claim remains except text explicitly describing migration from `normal` or future automatic-level work.

- [ ] **Step 6: Commit documentation synchronization**

```bash
git add AGENTS.md FEATURES.md docs/modules/auth.md docs/modules/customer.md docs/modules/employee.md docs/modules/inventory.md docs/modules/order.md docs/modules/return-order.md
git commit -m "docs: align return and role business rules"
```

---

### Task 14: Run Full Verification and Database Invariant Checks

**Files:**
- Modify only files required to fix failures introduced by Tasks 1-13.

- [ ] **Step 1: Run backend syntax validation**

```bash
cd backend
PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app
```

Expected: exit code 0 with every application package compiled.

- [ ] **Step 2: Run the full backend test suite**

```bash
cd backend
uv run pytest
```

Expected: all tests pass. Preserve and report any unrelated pre-existing failure rather than changing unrelated code.

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend
npm test
```

Expected: all Vitest files pass.

- [ ] **Step 4: Run frontend type and lint checks**

```bash
cd frontend
npm run tsc
npm run biome:lint
npx antd lint ./src
```

Expected: all commands exit 0 with no Ant Design usage issues.

- [ ] **Step 5: Run frontend production build**

```bash
cd frontend
npm run build
```

Expected: production build completes successfully.

- [ ] **Step 6: Verify database invariants through DBX**

Run through DBX `postgres`:

```sql
SELECT count(*) AS employees_without_roles
FROM employees e
WHERE NOT EXISTS (
    SELECT 1 FROM employee_roles er WHERE er.employee_id = e.id
);
```

```sql
SELECT count(*) AS invalid_order_return_amounts
FROM orders
WHERE returned_amount < 0 OR returned_amount > total_amount;
```

```sql
SELECT roi.source_order_item_id,
       sum(roi.quantity) AS returned_quantity,
       oi.quantity AS sold_quantity
FROM return_order_items roi
JOIN return_orders ro ON ro.id = roi.return_order_id
JOIN order_items oi ON oi.id = roi.source_order_item_id
WHERE ro.status = 'completed'
GROUP BY roi.source_order_item_id, oi.quantity
HAVING sum(roi.quantity) > oi.quantity;
```

Expected: all three checks return zero invalid rows.

- [ ] **Step 7: Review the final diff for scope and secrets**

```bash
git status --short
git diff --check
git diff --stat
git diff -- AGENTS.md FEATURES.md backend frontend docs/modules
```

Expected: only planned files changed, no credentials or unrelated formatting changes, and `git diff --check` is clean.

- [ ] **Step 8: Commit final verification fixes if needed**

```bash
git add AGENTS.md FEATURES.md backend frontend docs/modules
git commit -m "test: verify return and role workflows"
```

Skip this commit when verification required no follow-up changes.

---

## Final Acceptance Checklist

- [ ] Standard price and member price reject zero; cost price still allows zero.
- [ ] Existing `normal` employees are migrated to `warehouse_manager`; existing admins remain admins.
- [ ] Every employee has one or more roles and permissions are the union of those roles.
- [ ] Warehouse managers can create and maintain products, all product prices, warehouses, suppliers, inventory, and order operations.
- [ ] Customer creation and editing are admin-only; warehouse managers retain customer read/select access for order creation.
- [ ] Delivery employees can sign, collect payment, and process on-site returns only for their current delivery task.
- [ ] A return can select multiple historical source order items belonging to the handling delivery's customer.
- [ ] Return product and unit price are server-derived from source order items.
- [ ] Completed return quantity never exceeds original sold quantity, including concurrent requests.
- [ ] Original order total remains unchanged; `returned_amount` and computed `net_amount` are accurate.
- [ ] Unpaid returns reduce net receivable only; completed-order returns also reduce customer `total_spent`.
- [ ] Admin-only void fully reverses inventory, order return amounts, and actual customer-spend deductions.
- [ ] Disabled historical products can still be returned.
- [ ] Customer levels remain manually maintained and are not automatically changed.
- [ ] Migration is executed and verified in the development PostgreSQL database through DBX.
- [ ] Backend tests, frontend tests, type checking, Biome, Ant Design lint, and production build pass.
