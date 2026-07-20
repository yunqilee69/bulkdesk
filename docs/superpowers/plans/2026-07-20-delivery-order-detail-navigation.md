# 配送订单详情导航实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让当前配送卡片直接展示配送中的订单，并从配送管理或订单列表进入独立订单详情页。

**Architecture:** 保持现有后端配送状态模型不变，前端复用订单详情接口中的 `delivery` 摘要。新增隐藏的订单详情路由和独立页面，订单列表与配送卡片统一通过订单 ID 跳转；当前配送卡片首次加载时默认展开，后续刷新保留用户展开状态。

**Tech Stack:** React 19、Umi Max 4、Ant Design 6、Vitest、Testing Library。

---

### Task 1: 路由与导航行为

**Files:**
- Modify: `frontend/config/routes.ts`
- Modify: `frontend/src/config/routes.test.ts`
- Modify: `frontend/src/pages/Order/index.tsx`
- Modify: `frontend/src/pages/Order/index.test.tsx`
- Modify: `frontend/src/pages/Delivery/index.tsx`
- Modify: `frontend/src/pages/Delivery/index.test.tsx`

- [ ] 先增加测试，约束隐藏详情路由、订单列表跳转和配送订单跳转。
- [ ] 运行相关 Vitest 用例，确认新断言在实现前失败。
- [ ] 增加 `/order/detail/:id` 隐藏路由，并用 `history.push` 统一导航。
- [ ] 运行相关 Vitest 用例，确认导航行为通过。

### Task 2: 独立订单详情页

**Files:**
- Create: `frontend/src/pages/Order/Detail/index.tsx`
- Create: `frontend/src/pages/Order/Detail/index.test.tsx`
- Modify: `frontend/src/pages/Order/index.tsx`

- [ ] 先增加详情加载、错误提示、订单信息和配送信息测试。
- [ ] 运行详情页测试，确认页面尚不存在时失败。
- [ ] 实现独立详情页，展示基本信息、商品明细、库存分配、状态日志和配送摘要。
- [ ] 删除订单列表原有详情抽屉及其重复状态。
- [ ] 运行详情页与订单列表测试，确认行为通过。

### Task 3: 当前配送卡片可见性

**Files:**
- Modify: `frontend/src/pages/Delivery/index.tsx`
- Modify: `frontend/src/pages/Delivery/index.test.tsx`

- [ ] 先增加首次加载默认展开、可收起和刷新保留展开状态测试。
- [ ] 实现首次加载默认展开全部配送员卡片。
- [ ] 在订单表格中增加“查看订单”入口，跳转独立订单详情页。
- [ ] 运行配送页面测试，确认卡片交互通过。

### Task 4: 完整验证

**Files:**
- Verify only

- [ ] 运行 `npm test -- --run`。
- [ ] 运行 `npm run tsc`。
- [ ] 运行 `npm run biome:lint` 与 `npx antd lint ./src`。
- [ ] 运行 `npm run build`。
- [ ] 运行后端语法检查与 `uv run pytest -q`，确认前端改动未破坏全项目。
- [ ] 运行 `git diff --check` 并核对最终差异。
