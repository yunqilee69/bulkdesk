# 商品价格表单调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将商品价格原因改为选填，并支持在新建商品时原子创建部分会员等级价格，同时保持编辑商品表单不包含任何价格字段。

**Architecture:** 后端扩展 `ProductCreate` 请求契约，由商品服务在写入商品前统一校验会员等级，并在同一事务中创建商品、会员价和价格日志。前端复用现有会员价行模型，在新建表单中加载等级、编辑草稿价格并只提交已填写项目；价格管理继续负责商品创建后的全部价格调整。

**Tech Stack:** Python 3.12、FastAPI、Pydantic 2、SQLAlchemy async、pytest、React 19、TypeScript、Umi Max、Ant Design 6、Vitest。

---

### Task 1: 放宽价格原因请求契约

**Files:**
- Modify: `backend/app/schemas/product.py`
- Test: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 写失败的 schema 测试**

新增测试，断言 `ProductCreate` 和 `PriceChangeRequest` 在不提供原因时均得到空字符串，并断言创建会员价不能包含重复等级。

- [ ] **Step 2: 运行定向测试确认失败**

Run: `cd backend && mkdir -p .uv-cache && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_business_logic.py -k "product_price_reasons or product_create_rejects_duplicate_member_levels" -q`

Expected: 因 `price_reason`、`reason` 仍为必填或 `member_prices` 尚不存在而失败。

- [ ] **Step 3: 实现最小 schema 变更**

为 `ProductCreate` 增加默认空字符串的 `price_reason`、默认空数组的 `member_prices`，复用 `MemberPriceBatchItem` 数据结构并校验等级唯一；将 `PriceChangeRequest.reason` 改为默认空字符串。

- [ ] **Step 4: 重跑定向测试**

Run: `cd backend && mkdir -p .uv-cache && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_business_logic.py -k "product_price_reasons or product_create_rejects_duplicate_member_levels" -q`

Expected: PASS。

### Task 2: 原子创建商品会员价和日志

**Files:**
- Modify: `backend/app/services/product_service.py`
- Test: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 写失败的服务测试**

新增异步测试，构造两个有效会员等级，调用 `create_product` 后断言写入一个 `Product`、两个 `MemberPrice`、四条 `PriceChangeLog`，所有日志原因均为空字符串；再新增无效等级测试，断言校验失败前数据库没有新增对象。

- [ ] **Step 2: 运行定向测试确认失败**

Run: `cd backend && mkdir -p .uv-cache && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_business_logic.py -k "create_product_saves_member_prices or create_product_validates_member_levels" -q`

Expected: 因服务未处理 `member_prices` 而失败。

- [ ] **Step 3: 实现原子创建逻辑**

在创建商品前一次查询所有请求中的会员等级并比对 ID；从商品模型数据中排除 `price_reason` 和 `member_prices`；商品 flush 后批量增加会员价及对应 `member_price` 日志，再统一 flush 并返回商品。

- [ ] **Step 4: 重跑服务测试**

Run: `cd backend && mkdir -p .uv-cache && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_business_logic.py -k "create_product" -q`

Expected: PASS。

### Task 3: 增加新建会员价表单数据转换

**Files:**
- Modify: `frontend/src/pages/Product/memberPrices.ts`
- Modify: `frontend/src/pages/Product/memberPrices.test.ts`

- [ ] **Step 1: 写失败的前端单元测试**

新增测试覆盖：会员等级转换为空白草稿行；只提取已填写价格；价格 `0` 被视为有效输入；未填写项目不进入请求。

- [ ] **Step 2: 运行定向测试确认失败**

Run: `cd frontend && npm test -- src/pages/Product/memberPrices.test.ts`

Expected: 因新辅助函数不存在而失败。

- [ ] **Step 3: 实现辅助函数**

新增会员等级类型、`createMemberPriceRows` 和 `getEnteredMemberPriceItems`；保持现有价格管理的 `getChangedMemberPriceItems` 行为不变。

- [ ] **Step 4: 重跑前端单元测试**

Run: `cd frontend && npm test -- src/pages/Product/memberPrices.test.ts`

Expected: PASS。

### Task 4: 在新建商品表单接入会员价

**Files:**
- Modify: `frontend/src/services/product.ts`
- Modify: `frontend/src/pages/Product/index.tsx`

- [ ] **Step 1: 扩展前端创建请求类型**

将 `price_reason` 改为可选，并为 `createProduct` 增加可选 `member_prices: MemberPriceChange[]`。

- [ ] **Step 2: 加载会员等级并维护新建草稿**

页面初始化时将 `listAllLevels` 与分类、品牌并行加载；打开新建弹窗时生成空白会员价行；关闭弹窗时清理草稿。

- [ ] **Step 3: 更新新建表单**

删除“初始定价原因”的必填规则并标注选填；只在 `!editing` 分支渲染会员价表格；提交时将已填写会员价转换为 `member_prices`。编辑分支继续不渲染标准售价、成本价、原因和会员价。

- [ ] **Step 4: 放宽价格管理原因校验**

删除标准售价和成本价保存前的空原因拦截，将 trim 后的原因传给接口；会员价逻辑保持现有选填行为。

### Task 5: 全量验证

**Files:**
- Verify: `backend/app/schemas/product.py`
- Verify: `backend/app/services/product_service.py`
- Verify: `frontend/src/pages/Product/index.tsx`
- Verify: `frontend/src/services/product.ts`

- [ ] **Step 1: 后端语法检查**

Run: `cd backend && PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app`

Expected: exit code 0。

- [ ] **Step 2: 后端全量测试**

Run: `cd backend && mkdir -p .uv-cache && UV_CACHE_DIR=.uv-cache uv run pytest`

Expected: 全部测试通过；如有既有失败，保留输出并说明与本次修改的关系。

- [ ] **Step 3: 前端测试与类型检查**

Run: `cd frontend && npm test -- src/pages/Product/memberPrices.test.ts && npm run tsc`

Expected: exit code 0。

- [ ] **Step 4: 前端 lint**

Run: `cd frontend && npm run biome:lint && ./node_modules/.bin/antd lint ./src`

Expected: exit code 0。
