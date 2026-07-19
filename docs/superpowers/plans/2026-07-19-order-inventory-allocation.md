# Order Inventory Allocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove warehouse selection from order creation while preserving immediate, cross-warehouse inventory reservation and allowing final warehouse reallocation at shipment.

**Architecture:** Add an order inventory allocation model that records per-order-item warehouse quantities and lifecycle state. Order creation automatically allocates and locks inventory; shipment atomically reconciles submitted allocations, deducts inventory, and writes one movement per warehouse.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy async, PostgreSQL, React 19, Umi Max, Ant Design, Vitest, pytest.

---

### Task 1: Backend reservation behavior

**Files:**
- Modify: `backend/tests/test_business_logic.py`
- Modify: `backend/app/models/order.py`
- Modify: `backend/app/schemas/order.py`
- Modify: `backend/app/services/order_service.py`

- [ ] Add failing tests proving order creation accepts no warehouse, splits one item across warehouses, increments each inventory lock, and rolls back on insufficient total stock.
- [ ] Run the focused pytest tests and confirm failures are caused by the missing allocation behavior.
- [ ] Add the allocation model/schema and implement deterministic automatic allocation with row locks.
- [ ] Run the focused tests until they pass.

### Task 2: Shipment reallocation and cancellation

**Files:**
- Modify: `backend/tests/test_business_logic.py`
- Modify: `backend/app/services/order_service.py`
- Modify: `backend/app/api/v1/order.py`
- Modify: `backend/app/schemas/order.py`

- [ ] Add failing tests for multi-warehouse shipment, warehouse reassignment, quantity mismatch, insufficient target stock, placed cancellation, and shipped return.
- [ ] Run the focused tests and confirm the expected failures.
- [ ] Implement shipment request validation, allocation reconciliation, per-warehouse movements, and allocation-based cancellation.
- [ ] Run all order-focused backend tests.

### Task 3: Database migration

**Files:**
- Create: `backend/migrations/incremental/2026-07-19_订单库存分配.sql`

- [ ] Write SQL to create the allocation status enum and allocation table.
- [ ] Backfill existing order items from `orders.warehouse_id` with lifecycle status derived from order status.
- [ ] Drop the `orders.warehouse_id` foreign key, index if present, and column.
- [ ] Execute the script through DBX `postgres` and verify table columns, constraints, backfill counts, and removal of the order column.

### Task 4: Frontend service contract

**Files:**
- Modify: `frontend/src/services/order.ts`
- Modify: `frontend/src/pages/Order/index.test.tsx`

- [ ] Add failing tests proving creation omits warehouse and shipment submits multi-warehouse allocations.
- [ ] Update order, item, allocation, creation, and shipment request types.
- [ ] Run the order page test and confirm the service contract behavior passes.

### Task 5: Order creation and shipment UI

**Files:**
- Modify: `frontend/src/pages/Order/index.tsx`
- Modify: `frontend/src/pages/Order/index.test.tsx`

- [ ] Add failing interaction tests for warehouse-free creation and editable shipment allocations.
- [ ] Remove warehouse state and inventory loading from the creation drawer.
- [ ] Replace shipment confirmation with an allocation modal that supports multiple warehouse rows per item.
- [ ] Display allocation details in the order drawer.
- [ ] Run the focused Vitest tests until they pass.

### Task 6: Documentation and verification

**Files:**
- Modify: `docs/modules/order.md`
- Modify: `FEATURES.md`

- [ ] Update order API payloads and inventory lifecycle documentation.
- [ ] Run `PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app` in `backend/`.
- [ ] Run `uv run pytest` in `backend/`.
- [ ] Run `npm test -- src/pages/Order/index.test.tsx` in `frontend/`.
- [ ] Run `npm run tsc` and `npm run biome:lint` in `frontend/`.
- [ ] Review the final diff for unrelated changes and contract mismatches.
