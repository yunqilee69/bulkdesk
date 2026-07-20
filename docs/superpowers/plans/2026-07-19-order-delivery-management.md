# Order Delivery Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight order delivery management that binds an active employee at stock-out, groups current deliveries by employee, records exceptions and proof-backed signatures, supports audited reassignment, and automatically archives signed deliveries.

**Architecture:** Add a one-to-one `OrderDelivery` aggregate beside `Order` and an append-only `OrderDeliveryEvent` timeline. Stock-out creates the delivery atomically with inventory deduction; signing completes the delivery and advances the order to `delivered_unpaid` atomically. The frontend adds a delivery workspace and replaces direct order delivery confirmation with delivery signing.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy async, Pydantic 2, PostgreSQL incremental SQL, React 19, Umi Max 4, Ant Design 6, ProComponents 3, Vitest, Biome.

---

## File Map

### Backend

- Create `backend/app/models/order_delivery.py`: delivery enums, one-to-one delivery record, append-only event model.
- Modify `backend/app/models/order.py`: add one-to-one delivery relationship only; keep order state ownership in the order module.
- Modify `backend/app/models/__init__.py`: export delivery models and enums.
- Create `backend/app/schemas/order_delivery.py`: delivery requests, detail, current-group and archive responses.
- Modify `backend/app/schemas/order.py`: add stock-out request and optional delivery summary on order output.
- Create `backend/app/services/order_delivery_service.py`: delivery queries, aggregation, exception, reassignment and signing rules.
- Modify `backend/app/services/order_service.py`: accept delivery data at stock-out, create delivery in the same transaction, enrich order output, and remove direct delivery as a public workflow.
- Create `backend/app/api/v1/order_delivery.py`: current, archive, detail, employee options, reassign, exception and sign routes.
- Modify `backend/app/api/v1/order.py`: require stock-out body and remove `/deliver`.
- Modify `backend/app/api/v1/router.py`: register delivery routes.
- Modify `backend/tests/test_business_logic.py`: model, service, route, permission, aggregation and concurrency-oriented contract tests.
- Create `backend/migrations/incremental/2026-07-19_新增订单配送管理.sql`: enums, tables, constraints and indexes.

### Frontend

- Create `frontend/src/services/delivery.ts`: delivery contracts and API wrappers.
- Modify `frontend/src/services/order.ts`: typed stock-out payload, delivery summary and removal of direct delivery API.
- Create `frontend/src/pages/Delivery/delivery.ts`: pure aggregation display, proof upload and request-serialization helpers.
- Create `frontend/src/pages/Delivery/delivery.test.ts`: helper tests.
- Create `frontend/src/pages/Delivery/index.tsx`: current and archive delivery workspace.
- Create `frontend/src/pages/Delivery/index.test.tsx`: page permission, filtering and action tests.
- Modify `frontend/src/pages/Order/index.tsx`: stock-out form, customer snapshot defaults and delivery detail block.
- Modify `frontend/src/pages/Order/index.test.tsx`: stock-out validation, request body and removal of direct deliver action.
- Modify `frontend/config/routes.ts`: add `/delivery` route.
- Modify `frontend/src/config/routes.test.ts`: assert delivery route/menu contract.
- Modify `frontend/src/locales/zh-CN/menu.ts`: add delivery menu text.

### Documentation

- Modify `docs/modules/order.md`: stock-out delivery binding and delivery-only signing transition.
- Create `docs/modules/delivery.md`: delivery model, permissions, API and page behavior.
- Modify `FEATURES.md`: delivery endpoints and order workflow wording.
- Review `CONTEXT.md`: keep confirmed delivery terminology aligned with implementation names.

## Task 1: Delivery Model and Schema Contracts

**Files:**
- Create: `backend/app/models/order_delivery.py`
- Modify: `backend/app/models/order.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/schemas/order_delivery.py`
- Modify: `backend/app/schemas/order.py`
- Test: `backend/tests/test_business_logic.py`

- [ ] Add failing contract tests that assert the exact enum values and one-to-one relationship:

```python
def test_order_delivery_contract_uses_lightweight_statuses():
    assert {item.value for item in OrderDeliveryStatus} == {"delivering", "signed"}
    assert {item.value for item in OrderDeliveryEventType} == {
        "assigned", "reassigned", "exception", "signed"
    }
    assert {item.value for item in OrderDeliveryExceptionType} == {
        "customer_absent", "customer_refused", "invalid_contact", "other"
    }
    assert OrderDelivery.__table__.constraints
```

- [ ] Add failing Pydantic tests for non-blank recipient fields, non-blank signer name, `other` exception requiring a remark, optional multi-image proof URLs, and blank optional reassignment reasons normalizing to `None` after trimming.
- [ ] Run `uv run pytest tests/test_business_logic.py -k 'order_delivery_contract or delivery_schema' -v` in `backend/`; expect failures because delivery types do not exist.
- [ ] Implement `OrderDeliveryStatus`, `OrderDeliveryEventType`, `OrderDeliveryExceptionType`, `OrderDelivery`, and `OrderDeliveryEvent` with the fields and indexes from the approved design.
- [ ] Add `Order.delivery` as a `uselist=False` relationship and export all delivery types from `app.models`.
- [ ] Implement request schemas:

```python
class OrderStockOutRequest(ApiSchema):
    delivery_employee_id: str
    recipient_name: str = Field(..., min_length=1, max_length=100)
    recipient_phone: str = Field(..., min_length=1, max_length=20)
    delivery_address: str = Field(..., min_length=1, max_length=500)

class OrderDeliverySignRequest(ApiSchema):
    signer_name: str = Field(..., min_length=1, max_length=100)
    proof_image_urls: list[str] = Field(default_factory=list)
    remark: str | None = Field(None, max_length=500)
```

- [ ] Add output schemas for delivery summary, detail, event timeline, current employee group, employee option and paginated archive records.
- [ ] Run the focused backend tests until they pass.

## Task 2: Delivery Service Rules and Aggregation

**Files:**
- Create: `backend/app/services/order_delivery_service.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] Add failing service tests for active employee lookup, initial delivery creation, disabled employee rejection, reassignment, repeated exceptions, ownership checks, signing, duplicate signing and current-group aggregation.
- [ ] Use explicit sample totals in aggregation tests:

```python
assert group.order_count == 2
assert group.customer_count == 2
assert group.product_quantity == 7
assert group.total_amount == Decimal("180.00")
assert group.exception_order_count == 1
```

- [ ] Add failing permission tests proving admins can process any record while normal employees can only process a delivery whose current `delivery_employee_id` equals their own ID.
- [ ] Run `uv run pytest tests/test_business_logic.py -k 'delivery_service or delivery_permission or current_delivery_group or delivery_archive' -v`; expect failures from missing service functions.
- [ ] Implement `create_order_delivery()` to validate the employee is active, snapshot employee/operator names, add the `assigned` event and flush without committing.
- [ ] Implement `list_current_deliveries()` with role-scoped filters and SQL aggregation for order count, distinct customer count, order-item quantity sum, order amount sum and distinct orders having exception events.
- [ ] Implement `list_delivery_archive()` with pagination and filters for employee, order number, customer, signer and signed date range.
- [ ] Implement `get_delivery_detail()` with role scoping and events ordered by `created_at, id`.
- [ ] Implement `reassign_delivery()` with row locking, admin enforcement, active employee validation and an append-only `reassigned` event.
- [ ] Implement `record_delivery_exception()` with row locking, ownership/admin enforcement, `stocked_out` consistency validation and an append-only `exception` event.
- [ ] Implement `sign_delivery()` with row locks, ownership/admin enforcement, signature fields, `signed` event and order transition to `delivered_unpaid` without committing inside the service.
- [ ] Run all delivery service tests until they pass.

## Task 3: Atomic Stock-Out Integration

**Files:**
- Modify: `backend/app/services/order_service.py`
- Modify: `backend/app/schemas/order.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] Replace the existing stock-out operator test with failing tests that require `OrderStockOutRequest` and assert inventory deduction, `stocked_out`, delivery creation and the assigned event occur in one session transaction.
- [ ] Add a rollback-oriented test where delivery creation raises after inventory deduction and assert the route/service does not commit partial state.
- [ ] Add a failing test that `OrderOut.delivery` contains the current employee, recipient snapshot, status and final signature fields after stock-out.
- [ ] Run `uv run pytest tests/test_business_logic.py -k 'stock_out and delivery' -v`; expect failures because stock-out does not accept delivery data.
- [ ] Extend `transition_order()` with a `stock_out_request` parameter used only for the `shipping -> stocked_out` transition.
- [ ] After `_deduct_reserved_inventory()`, call `create_order_delivery()` before flushing the order transition; reject missing delivery data with `配送信息不能为空`.
- [ ] Keep `delivered_unpaid` in the internal state machine, but remove every public direct-delivery caller so only `sign_delivery()` invokes it.
- [ ] Enrich `_out()` with the optional delivery summary using a focused query, without loading the full event timeline for order lists.
- [ ] Run focused stock-out, inventory conservation and order serialization tests until they pass.

## Task 4: Delivery API and Authorization

**Files:**
- Create: `backend/app/api/v1/order_delivery.py`
- Modify: `backend/app/api/v1/order.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] Add failing route-contract tests asserting `/api/v1/orders/{order_id}/deliver` is absent and these delivery routes exist:

```text
GET  /api/v1/deliveries/employee-options
GET  /api/v1/deliveries/current
GET  /api/v1/deliveries/archive
GET  /api/v1/deliveries/{delivery_id}
PUT  /api/v1/deliveries/{delivery_id}/reassign
POST /api/v1/deliveries/{delivery_id}/exceptions
PUT  /api/v1/deliveries/{delivery_id}/sign
```

- [ ] Add failing API delegation tests for stock-out payload forwarding, role-scoped query forwarding, admin-only reassignment, normal-user sign/exception handling and `400/403/404` error mapping.
- [ ] Run `uv run pytest tests/test_business_logic.py -k 'delivery_route or delivery_api or stock_out_route' -v`; expect failures from missing routes.
- [ ] Change `PUT /orders/{order_id}/stock-out` to accept `OrderStockOutRequest` and pass the current `Employee` to the service so both ID and username/name snapshots remain available.
- [ ] Remove `PUT /orders/{order_id}/deliver`.
- [ ] Add `GET /deliveries/employee-options` using `CurrentUser`; return only `id` and `name` for active employees so stock-out does not require access to admin employee management APIs.
- [ ] Add current, archive and detail routes using `CurrentUser`, reassignment using `AdminUser`, and exception/sign routes using `CurrentUser` plus service ownership checks.
- [ ] Register the delivery router before the generic order router has no effect on paths because prefixes differ, but keep route imports alphabetized with existing modules.
- [ ] Run all backend delivery and existing order route tests.

## Task 5: Incremental PostgreSQL Migration

**Files:**
- Create: `backend/migrations/incremental/2026-07-19_新增订单配送管理.sql`

- [ ] Query DBX `postgres` for current `orders`, `employees`, enum types and existing delivery-named objects before writing SQL.
- [ ] Write idempotence-aware incremental SQL that creates:
  - `order_delivery_status`, `order_delivery_event_type`, `order_delivery_exception_type` enums;
  - `order_deliveries` with one-to-one `order_id`, employee/operator foreign keys and signed-field consistency checks;
  - `order_delivery_events` with append-only event data and foreign keys;
  - indexes on `(delivery_employee_id, status)`, `(status, signed_at)`, `(delivery_id, created_at)` and exception query fields.
- [ ] Include check constraints that require signature fields when status is `signed` and prohibit `signed_at` on `delivering` rows.
- [ ] Execute the script through DBX MCP connection `postgres` against database `postgres`.
- [ ] Verify enum values, columns, foreign keys, unique constraint, check constraints and indexes with DBX schema/query calls.
- [ ] Record the successful verification queries in the implementation handoff; do not claim migration completion without DBX evidence.

## Task 6: Frontend Delivery Contracts and Helpers

**Files:**
- Create: `frontend/src/services/delivery.ts`
- Modify: `frontend/src/services/order.ts`
- Create: `frontend/src/pages/Delivery/delivery.ts`
- Create: `frontend/src/pages/Delivery/delivery.test.ts`

- [ ] Add failing helper tests for status/exception labels, current-group metric normalization, archive filter serialization, `other` exception validation, proof URL extraction and permission decisions.
- [ ] Add a failing service request test or request-mock assertion that stock-out sends:

```ts
type OrderStockOutInput = {
  delivery_employee_id: string;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
};
```

- [ ] Run `npm test -- src/pages/Delivery/delivery.test.ts src/pages/Order/index.test.tsx`; expect failures from missing helpers and changed contract.
- [ ] Define typed delivery records, events, current groups, archive pages, employee options, sign/reassign/exception requests and API wrappers in `src/services/delivery.ts`.
- [ ] Change `stockOutOrder(id, data)` to send the new body and remove `deliverOrder()` from `src/services/order.ts`.
- [ ] Implement pure helpers for labels, proof uploads, filters and role/action checks in `src/pages/Delivery/delivery.ts`.
- [ ] Run the focused helper tests until they pass.

## Task 7: Order Stock-Out and Delivery Detail UI

**Files:**
- Modify: `frontend/src/pages/Order/index.tsx`
- Modify: `frontend/src/pages/Order/index.test.tsx`

- [ ] Run `npx antd info Modal`, `npx antd info Form`, `npx antd info Select`, and `npx antd info Descriptions` before changing Ant Design usage.
- [ ] Add failing interaction tests that open stock-out, load active employee options, default recipient fields from the order customer, require all four fields and send the exact stock-out payload.
- [ ] Add a failing test proving `stocked_out` orders no longer render a direct “确认送达” action.
- [ ] Add failing detail tests for current delivery employee, recipient snapshot, latest exception and final signature display.
- [ ] Run `npm test -- src/pages/Order/index.test.tsx`; expect the new tests to fail.
- [ ] Replace the stock-out confirmation with a form modal containing delivery employee, recipient name, phone and address.
- [ ] Fetch customer details when opening stock-out and prefill the snapshot without mutating customer data.
- [ ] Remove the direct delivery action and call; keep payment completion available only after the delivery sign API advances the order.
- [ ] Add a delivery information section to the existing order detail modal/drawer.
- [ ] Run the focused order page tests until they pass.

## Task 8: Delivery Management Page

**Files:**
- Create: `frontend/src/pages/Delivery/index.tsx`
- Create: `frontend/src/pages/Delivery/index.test.tsx`
- Modify: `frontend/config/routes.ts`
- Modify: `frontend/src/config/routes.test.ts`
- Modify: `frontend/src/locales/zh-CN/menu.ts`

- [ ] Run `npx antd info Tabs`, `npx antd info Card`, `npx antd info Table`, `npx antd info Drawer`, `npx antd info Upload`, and `npx antd info Statistic` before implementation.
- [ ] Add failing page tests for current/archive tab loading, administrator multi-employee groups, normal employee self-only display, C-level summary metrics, order expansion and archive filters.
- [ ] Add failing action tests for sign, repeated exception, admin reassignment, hidden reassignment for normal users, proof image upload and data refresh after successful mutations.
- [ ] Add failing route tests for `/delivery` and `menu.delivery`.
- [ ] Run `npm test -- src/pages/Delivery/index.test.tsx src/config/routes.test.ts`; expect failures before the page and route exist.
- [ ] Build the current tab with expandable employee cards showing order count, customer count, product quantity, total amount and exception order count.
- [ ] Render order rows with order number, customer, snapshot contact/phone/address, product summary, amount, stock-out time and latest exception.
- [ ] Implement sign, exception and admin-only reassignment modals; upload proof images through `uploadFile(file, 'deliveries')` and submit only completed URLs.
- [ ] Build the archive tab as a paginated ProTable with employee, order, customer, signer and signed-date filters plus a detail drawer containing the complete event timeline.
- [ ] Add the top-level `/delivery` menu route for all authenticated employees.
- [ ] Run Delivery, Order and route tests until they pass.

## Task 9: Documentation and Contract Cleanup

**Files:**
- Modify: `docs/modules/order.md`
- Create: `docs/modules/delivery.md`
- Modify: `FEATURES.md`
- Modify: `CONTEXT.md`

- [ ] Update the order workflow to state that stock-out requires delivery binding and only delivery signing can move `stocked_out -> delivered_unpaid`.
- [ ] Document delivery models, event types, exception types, role scoping, current aggregation, archive filters and API paths in `docs/modules/delivery.md`.
- [ ] Add delivery management to `FEATURES.md` and remove the direct `/orders/{id}/deliver` contract.
- [ ] Search documentation for conflicting terms with `rg -n '确认送达|配送任务|配送批次|配送车次|/deliver' docs FEATURES.md CONTEXT.md` and keep only intentional historical/non-goal wording.
- [ ] Verify implementation enum and field names exactly match the glossary and approved design.

## Task 10: Full Verification

**Files:**
- Review every modified file and the executed migration.

- [ ] Run focused backend delivery tests:

```bash
cd backend
uv run pytest tests/test_business_logic.py -k 'delivery or stock_out' -v
```

- [ ] Run full backend syntax and tests:

```bash
cd backend
PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app
uv run pytest
```

- [ ] Run focused frontend tests:

```bash
cd frontend
npm test -- src/pages/Delivery/delivery.test.ts src/pages/Delivery/index.test.tsx src/pages/Order/index.test.tsx src/config/routes.test.ts
```

- [ ] Run full frontend validation:

```bash
cd frontend
npm test
npm run tsc
npm run biome:lint
npx antd lint ./src
npm run build
```

- [ ] Run `git diff --check` and inspect `git status --short` without reverting unrelated user changes.
- [ ] Search for obsolete direct-delivery calls with `rg -n 'deliverOrder|/orders/.*/deliver|确认送达' backend frontend docs FEATURES.md` and confirm remaining matches are intentional migration/history text only.
- [ ] Compare the final diff line-by-line against `docs/superpowers/specs/2026-07-19-order-delivery-management-design.md` and record any consciously deferred items as remaining risks.

## Execution Notes

- Follow red-green-refactor for every behavior change; do not write implementation before its focused failing test.
- Do not commit unless the user explicitly requests commits, despite the general plan-writing preference for frequent commits.
- Keep delivery business logic out of API routes and React components.
- Do not introduce delivery tasks, trips, vehicles, routes or partial-delivery quantities.
- Do not edit generated frontend service directories.
- Database implementation is incomplete until the incremental SQL has been executed and verified through DBX `postgres`.
