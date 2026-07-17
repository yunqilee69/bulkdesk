# 商品搜索条件优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持商品列表的名称/简称、条形码、分类、品牌、销售状态、成本价范围和售价范围服务端筛选，并让库存选品弹窗按相同关键词、条形码、分类和品牌条件分页搜索在售商品。

**Architecture:** 扩展既有 `GET /api/v1/products` 的查询参数，由 `product_service.list_products` 构造全部 SQLAlchemy 条件，保持分页总数和列表结果使用同一筛选范围。前端将 ProTable 的表单值转为服务层参数；库存选品弹窗改为分页请求并缓存已选商品，避免筛选或翻页丢失选择。

**Tech Stack:** FastAPI、SQLAlchemy async、pytest、React 19、TypeScript、Ant Design 6、ProComponents、Vitest。

---

## 文件结构

- 修改 `backend/app/api/v1/product.py`：解析新增列表查询参数并传给服务层。
- 修改 `backend/app/services/product_service.py`：组合名称/简称、品牌与价格范围筛选条件。
- 修改 `backend/tests/test_business_logic.py`：验证商品列表服务查询条件。
- 修改 `frontend/src/services/product.ts`：声明并传递完整商品列表查询参数。
- 修改 `frontend/src/services/product.test.ts`：验证服务层参数契约。
- 新建 `frontend/src/pages/Product/searchFilters.ts`：集中转换商品列表 ProTable 表单值。
- 新建 `frontend/src/pages/Product/searchFilters.test.ts`：验证商品列表查询参数转换。
- 修改 `frontend/src/pages/Product/index.tsx`：定义搜索字段并使用查询参数转换函数。
- 修改 `frontend/src/components/ProductSelectModal/productSelection.ts`：定义选品搜索参数与已选商品缓存合并逻辑。
- 修改 `frontend/src/components/ProductSelectModal/productSelection.test.ts`：覆盖独立名称/简称、条形码筛选参数和跨页已选缓存。
- 修改 `frontend/src/components/ProductSelectModal/index.tsx`：以分页接口加载在售商品，提供两个搜索输入框并保留已选商品。
- 修改 `frontend/src/pages/Inventory/operations/index.tsx`：向选品弹窗提供当前库存操作行的已选商品基础信息。

## Task 1: 后端查询参数与 SQL 条件

**Files:**
- Modify: `backend/app/api/v1/product.py:36-38`
- Modify: `backend/app/services/product_service.py:99-125`
- Test: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 写入失败的服务层查询测试**

在 `backend/tests/test_business_logic.py` 新增异步测试。使用 `QueueDb` 返回总数和空商品行，替换 `_populate_product_out` 以避免无关关联查询；调用：

```python
await product_service.list_products(
    db,
    keyword="茶",
    barcode="6900",
    category_id=str(uuid.uuid4()),
    brand_id=str(uuid.uuid4()),
    status=ProductStatus.active,
    min_cost_price=10,
    max_cost_price=20,
    min_standard_price=30,
    max_standard_price=40,
)
```

断言 `db.statements` 中的商品查询和总数查询均包含 `short_name`、`brand_id`、`cost_price`、`standard_price` 和条形码条件；额外测试只传 `keyword` 时 SQL 包含名称与简称的 OR 匹配。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && uv run pytest tests/test_business_logic.py -k list_products -v`

Expected: FAIL，因 `list_products()` 尚不接受品牌和价格范围参数。

- [ ] **Step 3: 扩展路由和服务层最小实现**

在 `product.py` 的 `list_products` 路由增加：

```python
brand_id: Optional[str] = None,
min_cost_price: Optional[float] = Query(None, ge=0),
max_cost_price: Optional[float] = Query(None, ge=0),
min_standard_price: Optional[float] = Query(None, ge=0),
max_standard_price: Optional[float] = Query(None, ge=0),
```

并以相同顺序传入服务层。服务层增加同名可选参数，使用 `or_` 构造名称或简称的 `ilike` 条件，追加品牌、价格上下限条件；对 `query` 和 `count` 同时应用每个条件。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd backend && uv run pytest tests/test_business_logic.py -k list_products -v`

Expected: PASS。

## Task 2: 前端商品列表服务契约与表单映射

**Files:**
- Modify: `frontend/src/services/product.ts:16`
- Modify: `frontend/src/services/product.test.ts`
- Create: `frontend/src/pages/Product/searchFilters.ts`
- Create: `frontend/src/pages/Product/searchFilters.test.ts`
- Modify: `frontend/src/pages/Product/index.tsx:145-220,365-382`

- [ ] **Step 1: 写入失败的前端服务和映射测试**

在 `product.test.ts` 增加 `listProducts` 测试，调用包含：

```ts
{
  keyword: '茉莉', barcode: '6900', category_id: 'category-1', brand_id: 'brand-1',
  status: 'active', min_cost_price: 10, max_cost_price: 20,
  min_standard_price: 30, max_standard_price: 40, page: 1, page_size: 20,
}
```

并断言 `request` 接收相同的 `params`。

创建 `searchFilters.test.ts`，先为尚不存在的 `toProductListParams` 写测试：给定 ProTable 表单值（`keyword`、`barcode`、`category_id`、`brand_id`、`status` 和两组数组价格范围）时，返回后端字段 `min_*` / `max_*`，并将 `current` / `pageSize` 转为 `page` / `page_size`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npm test -- src/services/product.test.ts src/pages/Product/searchFilters.test.ts`

Expected: FAIL，因 `listProducts` 类型不含新字段，且 `toProductListParams` 尚不存在。

- [ ] **Step 3: 最小实现服务类型和参数转换**

扩展 `listProducts` 参数类型为完整接口契约。新增 `searchFilters.ts`：导出仅负责请求转换的 `toProductListParams`，使用 `[min, max]` 数组值填充对应价格上下限，保留未填写范围端为空。不要在此辅助函数中执行客户端筛选或校验。

- [ ] **Step 4: 在商品列表使用转换函数和正确搜索组件**

在 `Product/index.tsx`：

- 将商品名称列的搜索字段设为 `keyword`，展示为“商品名称/简称”。
- 保持条形码列的独立搜索字段 `barcode`。
- 为分类和品牌添加 `valueType: 'select'` 与动态选项。
- 保留销售状态搜索。
- 新增成本价和标准售价的独立搜索列，使用数值区间值类型并隐藏表格展示重复列的搜索。
- 在 `request` 中调用 `toProductListParams(params)`，不再把商品名称映射为 `keyword: params.name`。

- [ ] **Step 5: 运行测试确认通过**

Run: `cd frontend && npm test -- src/services/product.test.ts src/pages/Product/searchFilters.test.ts`

Expected: PASS。

## Task 3: 分页库存选品与选中缓存

**Files:**
- Modify: `frontend/src/components/ProductSelectModal/productSelection.ts`
- Modify: `frontend/src/components/ProductSelectModal/productSelection.test.ts`
- Modify: `frontend/src/components/ProductSelectModal/index.tsx`
- Modify: `frontend/src/pages/Inventory/operations/index.tsx:111-205,669-674`

- [ ] **Step 1: 写入失败的选品帮助函数测试**

将 `productSelection.test.ts` 扩展为：

```ts
expect(toProductSelectQuery({ keyword: '茉莉', barcode: '6900', categoryId: 'tea', brandId: 'brand-a', current: 2 }))
  .toEqual({ keyword: '茉莉', barcode: '6900', category_id: 'tea', brand_id: 'brand-a', status: 'active', page: 2, page_size: 10 });

expect(mergeSelectedProducts([products[0]], [products[1], products[0]])).toEqual([products[0], products[1]]);
```

测试名称/简称关键词和条形码为独立字段，并验证旧选择数据与当前页数据合并后不丢失。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npm test -- src/components/ProductSelectModal/productSelection.test.ts`

Expected: FAIL，因分页查询转换和选中缓存合并函数尚不存在。

- [ ] **Step 3: 实现选品查询与缓存辅助函数**

在 `productSelection.ts` 导出 `toProductSelectQuery` 与 `mergeSelectedProducts`。查询函数必须固定 `status: 'active'`、使用 `page_size: 10`，仅映射关键词、条形码、分类、品牌和当前页；合并函数按商品 ID 去重并保留已选商品数据。

- [ ] **Step 4: 将弹窗改为服务端分页**

在 `ProductSelectModal/index.tsx`：

- 使用 `listProducts` 加载商品页，并从响应中设置表格数据、总数和加载状态。
- 将当前关键词与条形码分为两个 `Input` 状态；输入、分类、品牌变化时重置为第一页并重新请求。
- 表格分页受控，切页重新请求；保留 `rowSelection.preserveSelectedRowKeys`。
- 使用 `mergeSelectedProducts` 缓存当前页和父组件传入的已选商品，底部“已选商品”表始终展示缓存中的已选记录。
- 分类选项仍使用 `listAllCategories()`；品牌选项可以从产品数据聚合，或在需要完整品牌范围时通过 `listAllBrands()` 加载。

在库存操作页构造当前标签页已选行的 `id`、名称、条形码、品牌、成本价等基础商品数据并传给弹窗，确认操作时继续复用现有行，新增商品才使用服务端返回商品的价格和单位信息。

- [ ] **Step 5: 运行测试确认通过**

Run: `cd frontend && npm test -- src/components/ProductSelectModal/productSelection.test.ts`

Expected: PASS。

## Task 4: 全量验证

**Files:**
- Verify only

- [ ] **Step 1: 运行后端语法检查**

Run: `cd backend && PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app`

Expected: exit code 0。

- [ ] **Step 2: 运行全部后端测试**

Run: `cd backend && uv run pytest`

Expected: exit code 0；如存在既有失败，保留完整输出并确认与本改动无关。

- [ ] **Step 3: 运行前端相关与全部测试**

Run: `cd frontend && npm test -- src/services/product.test.ts src/pages/Product/searchFilters.test.ts src/components/ProductSelectModal/productSelection.test.ts && npm test`

Expected: exit code 0。

- [ ] **Step 4: 运行前端静态检查**

Run: `cd frontend && npm run tsc && npm run biome:lint`

Expected: exit code 0。

- [ ] **Step 5: 审查最终差异**

Run: `git diff --check && git diff -- backend/app/api/v1/product.py backend/app/services/product_service.py backend/tests/test_business_logic.py frontend/src/services/product.ts frontend/src/services/product.test.ts frontend/src/pages/Product frontend/src/components/ProductSelectModal frontend/src/pages/Inventory/operations/index.tsx`

Expected: 无空白错误；每一项变更都映射到本计划范围。
