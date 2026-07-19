# Order Fulfillment And Returns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the confirmed sales-order fulfillment state machine and an independent return-order module with optional per-item stock-in, customer-spend adjustments, void reversal, audit fields, and dedicated frontend pages.

**Architecture:** Keep sales fulfillment in the existing order module behind explicit transition interfaces, and add a separate return-order module with its own models, schemas, business implementation, router, and page. Inventory and customer changes occur atomically in the corresponding order or return transaction; frontend callers submit business inputs while the backend derives operators and audit timestamps.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, SQLAlchemy async, PostgreSQL, React 19, Umi Max 4, Ant Design 6, ProComponents 3, pytest, Vitest, DBX MCP.

---

### Task 1: Sales order state contract

**Files:**
- Modify: `backend/tests/test_business_logic.py`
- Modify: `backend/app/models/order.py`
- Modify: `backend/app/schemas/order.py`

- [ ] Add failing tests asserting the exact statuses `placed`, `shipping`, `stocked_out`, `delivered_unpaid`, `completed`, `cancelled` and the new audit fields.
- [ ] Run `uv run pytest tests/test_business_logic.py -k "order_status or order_contract" -q` and verify failures reference the old status contract.
- [ ] Replace the order enum and rename/add model and output fields: `shipping_started_at/by`, `stock_out_at/by`, `delivered_at/by`, `paid_at/by`, `cancelled_at/by`.
- [ ] Run the focused tests until they pass.

### Task 2: Fulfillment transitions

**Files:**
- Modify: `backend/tests/test_business_logic.py`
- Modify: `backend/app/services/order_service.py`
- Modify: `backend/app/api/v1/order.py`
- Modify: `backend/app/schemas/order.py`

- [ ] Add failing tests for start-shipping allocation reconciliation, shipping allocation adjustment, stock-out deduction, delivery confirmation, payment completion, and allowed cancellation states.
- [ ] Add failing tests proving stock-out orders cannot cancel and order completion updates customer spending/order count without changing the customer level.
- [ ] Run the focused tests and confirm each fails for the missing transition behavior.
- [ ] Split the current shipment implementation into deep interfaces: reserve/reallocate, deduct current reservations, confirm delivery, confirm payment, and release pre-outbound reservations.
- [ ] Add explicit endpoints for `start-shipping`, `shipping-allocations`, `stock-out`, and `deliver`; adapt `complete` and `cancel` to the new state rules.
- [ ] Remove automatic customer-level lookup and `LevelChangeLog` creation from order completion.
- [ ] Run all order-focused backend tests.

### Task 3: Return order domain model

**Files:**
- Create: `backend/app/models/return_order.py`
- Create: `backend/app/schemas/return_order.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/models/inventory.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] Add failing tests for return status, product condition, return header/item columns, per-item stock-in fields, audit fields, and new inventory movement types.
- [ ] Run focused model/schema tests and verify the new types are missing.
- [ ] Add `ReturnOrder`, `ReturnOrderItem`, `ReturnOrderStatus`, `ReturnProductCondition`, `customer_return_in`, and `customer_return_void_out`.
- [ ] Add create/void request schemas, list/detail output schemas, validation for inbound warehouse requirements, and mandatory void reason.
- [ ] Run the focused tests until they pass.

### Task 4: Return creation transaction

**Files:**
- Create: `backend/app/services/return_order_service.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] Add failing tests for return number uniqueness, editable return pricing, per-item stock-in, multiple warehouse movements, non-stock-in items, customer-spend floor at zero, actual deduction amount, and no order-count or level change.
- [ ] Run each new test once to verify the expected RED failure.
- [ ] Implement return creation with deterministic customer/inventory row locks, product snapshots, amount calculation, customer before/after audit values, per-warehouse movements, and direct `completed` status.
- [ ] Run return-creation tests until they pass.

### Task 5: Return void transaction

**Files:**
- Modify: `backend/app/services/return_order_service.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] Add failing tests for void authorization data, inventory reversal, insufficient inventory rollback, restoration of only the actual spend deduction, duplicate void rejection, void audit fields, and per-warehouse void movements.
- [ ] Run focused tests and confirm failures are caused by missing void behavior.
- [ ] Implement atomic completed-to-voided reversal with deterministic locks and mandatory reason.
- [ ] Run all return-order backend tests.

### Task 6: Return order API

**Files:**
- Create: `backend/app/api/v1/return_order.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] Add failing API tests for authenticated create, list, detail, void, validation error mapping, and missing return-order handling.
- [ ] Add `/api/v1/return-orders` routes using `CurrentUser` for all writes and reads consistent with the order module.
- [ ] Run focused backend API tests.

### Task 7: Incremental database migration

**Files:**
- Create: `backend/migrations/incremental/2026-07-19_订单履约与退货单.sql`

- [ ] Write SQL that recreates all three order status enums with historical mappings, backfills customer statistics for legacy `paid` orders only, renames outbound audit columns, adds fulfillment audit columns, creates return enums/tables/indexes/constraints, and extends the movement enum.
- [ ] Query DBX `postgres` for current enum values, constraints, and row counts before execution.
- [ ] Execute the script through DBX `postgres` against database `postgres`.
- [ ] Verify order columns and enum values, return table schemas and constraints, movement enum values, indexes, and historical mapping counts.

### Task 8: Frontend order workflow

**Files:**
- Modify: `frontend/src/services/order.ts`
- Modify: `frontend/src/pages/Order/index.tsx`
- Modify: `frontend/src/pages/Order/index.test.tsx`
- Modify: `frontend/src/pages/Order/shipment.ts`
- Modify: `frontend/src/pages/Order/shipment.test.ts`

- [ ] Add failing tests for new status labels and action availability by state.
- [ ] Add failing interaction tests for start shipping, adjust allocations, confirm stock-out, confirm delivery, confirm payment, and cancellation restrictions.
- [ ] Update service interfaces and the shipment draft helper to save reservations separately from stock-out.
- [ ] Replace old shipped/paid actions and fields with the confirmed workflow and audit displays.
- [ ] Run the focused Vitest files until they pass.

### Task 9: Frontend return-order helpers and service

**Files:**
- Create: `frontend/src/services/returnOrder.ts`
- Create: `frontend/src/pages/ReturnOrder/returnOrder.ts`
- Create: `frontend/src/pages/ReturnOrder/returnOrder.test.ts`

- [ ] Add failing helper tests for totals, default product rows, batch inbound warehouse assignment, batch non-inbound clearing, condition/reason updates, and request serialization.
- [ ] Implement typed return-order requests and pure draft/batch helpers.
- [ ] Run `npm test -- src/pages/ReturnOrder/returnOrder.test.ts` until it passes.

### Task 10: Frontend return-order page

**Files:**
- Create: `frontend/src/pages/ReturnOrder/index.tsx`
- Create: `frontend/src/pages/ReturnOrder/index.test.tsx`
- Modify: `frontend/config/routes.ts`
- Modify: `frontend/src/locales/zh-CN/menu.ts`

- [ ] Run `npx antd info Modal`, `npx antd info Table`, `npx antd info Select`, and `npx antd info Descriptions` before component changes.
- [ ] Add failing page tests for list loading, create Modal, public `ProductSelectModal`, row selection, batch stock-in, batch non-stock-in, validation, detail Drawer, and void reason submission.
- [ ] Build `/order/returns` with toolbar create, filters, detail, per-row/batch decisions, warehouse selection, totals, and void action.
- [ ] Add route and `menu.order.returns` locale entry.
- [ ] Run ReturnOrder and existing Order page tests.

### Task 11: Documentation

**Files:**
- Modify: `docs/modules/order.md`
- Create: `docs/modules/return-order.md`
- Modify: `docs/modules/inventory.md`
- Modify: `docs/modules/customer.md`
- Modify: `FEATURES.md`
- Modify: `CONTEXT.md`

- [ ] Replace the current order diagram and contract with the confirmed state machine and audit fields.
- [ ] Document independent returns, per-item stock-in, batch UI, customer-spend deduction, void reversal, and both Mermaid diagrams.
- [ ] Document new inventory movement types and the manual-only customer-level rule.
- [ ] Review terminology against `CONTEXT.md` and remove obsolete “已发货/已付款自动升级” wording.

### Task 12: Full verification

**Files:**
- Review all modified files.

- [ ] Run `PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app` in `backend/`.
- [ ] Run `uv run pytest` in `backend/` and record pass/failure counts.
- [ ] Run `npm test` in `frontend/`.
- [ ] Run `npm run tsc`, `npm run biome:lint`, and `npx antd lint ./src` in `frontend/`.
- [ ] Run `git diff --check` and search for obsolete `shipped`, `paid`, automatic level-up, and direct post-outbound cancellation assumptions.
- [ ] Compare the final diff line-by-line against `docs/superpowers/specs/2026-07-19-order-fulfillment-returns-design.md`.
