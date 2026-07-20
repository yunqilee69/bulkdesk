# 签收与收款凭证实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在配送签收和订单确认收款时记录实际收款金额与付款凭证，并用实际收款金额更新客户累计消费。

**Architecture:** 收款数据保存在订单维度，新增 `paid_amount` 与 `payment_proof_image_urls`。订单确认收款必须提交实际收款金额和至少一张付款凭证；配送签收可选择同时收款，服务端先完成签收/送达，再复用订单完成逻辑进入 `completed`。

**Tech Stack:** FastAPI、SQLAlchemy async、PostgreSQL、React、Ant Design、Vitest、pytest。

---

### Task 1: 后端收款模型与规则

**Files:**
- Modify: `backend/app/models/order.py`
- Modify: `backend/app/schemas/order.py`
- Modify: `backend/app/services/order_service.py`
- Modify: `backend/app/api/v1/order.py`
- Modify: `backend/tests/test_business_logic.py`
- Create: `backend/migrations/incremental/2026-07-20_新增订单收款凭证.sql`

- [ ] 新增失败测试：完成订单必须使用 `paid_amount` 累计客户消费。
- [ ] 新增失败测试：`paid_amount` 必须 `> 0` 且 `<= total_amount`，付款凭证不能为空。
- [ ] 实现 `OrderCompleteRequest`、订单字段、服务参数和接口请求体。
- [ ] 增量 SQL 添加订单收款字段和约束。

### Task 2: 配送签收同时收款

**Files:**
- Modify: `backend/app/schemas/order_delivery.py`
- Modify: `backend/app/services/order_delivery_service.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] 新增失败测试：签收携带收款信息时订单直接进入 `completed`。
- [ ] 新增失败测试：签收不携带收款信息时仍进入 `delivered_unpaid`。
- [ ] 实现签收请求的可选收款字段并复用订单完成逻辑。

### Task 3: 前端收款交互

**Files:**
- Modify: `frontend/src/services/order.ts`
- Modify: `frontend/src/services/delivery.ts`
- Modify: `frontend/src/pages/Order/index.tsx`
- Modify: `frontend/src/pages/Delivery/index.tsx`
- Modify: `frontend/src/pages/Order/Detail/index.tsx`
- Modify: frontend related tests

- [ ] 新增失败测试：订单确认收款弹窗提交实收金额和付款凭证。
- [ ] 新增失败测试：签收弹窗勾选同时收款后提交收款字段。
- [ ] 实现订单确认收款弹窗和签收收款区块。
- [ ] 详情页展示应收、实收、优惠差额和凭证数量。

### Task 4: 执行迁移与完整验证

**Files:**
- Verify only

- [ ] 通过 DBX 执行增量 SQL 并验证字段、约束存在。
- [ ] 运行后端 compileall 与 pytest。
- [ ] 运行前端测试、tsc、Biome、Ant Design lint 和 build。
- [ ] 运行 `git diff --check`。
