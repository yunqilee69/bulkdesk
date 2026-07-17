# 商品列表图片与可销售数量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在商品列表显示商品首图，并按全部仓库库存减锁定库存的聚合值显示可销售数量。

**Architecture:** 后端为商品列表查询添加按商品分组的库存聚合子查询，通过左连接和 `COALESCE` 把可销售数量作为响应字段返回。前端只消费该字段，使用首张商品图片渲染缩略图，不在浏览器中计算库存。

**Tech Stack:** FastAPI、SQLAlchemy async、Pydantic、React 19、Umi Max、Ant Design 6、ProComponents、pytest、Vitest。

---

### Task 1: 后端商品可销售数量契约和聚合查询

**Files:**
- Modify: `backend/app/schemas/product.py`
- Modify: `backend/app/services/product_service.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 写失败测试**

```python
@pytest.mark.asyncio
async def test_list_products_aggregates_available_quantity_across_warehouses():
    await product_service.list_products(QueueDb([...]))
    sql = db.statements[1]
    assert "sum(inventory.quantity - inventory.locked)" in sql
    assert "coalesce" in sql
    assert "LEFT OUTER JOIN" in sql
```

- [ ] **Step 2: 验证失败**

Run: `cd backend && uv run pytest tests/test_business_logic.py -k product_available_quantity -v`

Expected: FAIL，因为当前商品查询不关联库存。

- [ ] **Step 3: 实现最小聚合查询**

```python
inventory_totals = (
    select(
        Inventory.product_id.label("product_id"),
        func.sum(Inventory.quantity - Inventory.locked).label("available_quantity"),
    )
    .group_by(Inventory.product_id)
    .subquery()
)
query = select(Product, func.coalesce(inventory_totals.c.available_quantity, 0).label("available_quantity")).outerjoin(
    inventory_totals, inventory_totals.c.product_id == Product.id
)
```

将 `available_quantity` 放入 `ProductOut`，并保留既有筛选、分页、分类和品牌名称补充。

- [ ] **Step 4: 验证通过**

Run: `cd backend && uv run pytest tests/test_business_logic.py -k product_available_quantity -v`

Expected: PASS。

### Task 2: 前端商品列表图片与可销售数量列

**Files:**
- Modify: `frontend/src/pages/Product/index.tsx`
- Modify: `frontend/src/pages/Product/index.test.tsx`

- [ ] **Step 1: 写失败测试**

```tsx
it('renders product image and available quantity columns', async () => {
  render(<ProductPage />);
  expect(await screen.findByText('图片')).toBeInTheDocument();
  expect(screen.getByText('可销售数量')).toBeInTheDocument();
});
```

- [ ] **Step 2: 验证失败**

Run: `cd frontend && npm test -- src/pages/Product/index.test.tsx`

Expected: FAIL，因为商品列表尚未定义这两个列。

- [ ] **Step 3: 实现最小表格展示**

```tsx
{ title: '图片', dataIndex: 'image_urls', render: (_, record) => ... }
{ title: '可销售数量', dataIndex: 'available_quantity', width: 110, search: false }
```

图片仅展示 `image_urls?.[0]`，无图片 URL 时显示占位，禁用图片预览。

- [ ] **Step 4: 验证通过**

Run: `cd frontend && npm test -- src/pages/Product/index.test.tsx`

Expected: PASS。

### Task 3: 相关验证

**Files:**
- Verify: `backend/app/schemas/product.py`
- Verify: `backend/app/services/product_service.py`
- Verify: `frontend/src/pages/Product/index.tsx`

- [ ] **Step 1: 运行后端验证**

Run: `cd backend && PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app && uv run pytest`

Expected: 编译成功且全部 pytest 通过。

- [ ] **Step 2: 运行前端验证**

Run: `cd frontend && npm run tsc && npx biome lint src/pages/Product/index.tsx && npm test`

Expected: 类型检查、改动文件 Biome 检查和全部 Vitest 测试通过。
