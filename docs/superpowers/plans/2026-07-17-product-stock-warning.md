# 商品级库存预警 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让商品维护唯一的库存预警阈值，仪表盘按商品跨仓可用库存汇总告警，并在库存查询中展示商品图片和商品级预警配置入口。

**Architecture:** 将阈值从 `Inventory` 移至 `Product`，以数据库增量脚本完成字段变更且不回填旧数据。库存列表通过已有商品查询信息返回阈值和首图；仪表盘使用 SQL 聚合库存数量并按商品阈值过滤。前端库存列表通过商品 ID 调用专用商品预警接口。

**Tech Stack:** FastAPI、SQLAlchemy async、Pydantic、PostgreSQL、React 19、Umi Max、Ant Design 6、ProComponents、Vitest、pytest。

---

### Task 1: 商品级阈值数据契约与数据库迁移

**Files:**
- Modify: `backend/app/models/product.py`
- Modify: `backend/app/models/inventory.py`
- Modify: `backend/app/schemas/product.py`
- Modify: `backend/app/schemas/inventory.py`
- Create: `backend/migrations/incremental/2026-07-17_商品级库存预警.sql`
- Test: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 写入失败测试，表达商品字段和库存列表响应的新契约**

```python
def test_product_warning_quantity_defaults_to_zero():
    product = Product(...)
    assert product.warning_quantity == 0

def test_inventory_list_item_exposes_product_warning_and_image():
    item = InventoryListItemOut(..., warning_quantity=5, product_image_url="https://example.com/a.png")
    assert item.warning_quantity == 5
    assert item.product_image_url == "https://example.com/a.png"
```

- [ ] **Step 2: 运行指定测试，确认它因字段缺失失败**

Run: `cd backend && uv run pytest tests/test_business_logic.py -k 'warning_quantity_defaults or exposes_product_warning' -v`

Expected: FAIL，提示 `Product` 或 `InventoryListItemOut` 不存在商品级字段。

- [ ] **Step 3: 实现最小数据模型和 schema 变更**

```python
# Product
warning_quantity: Mapped[int] = mapped_column(default=0, nullable=False)

# InventoryListItemOut
warning_quantity: int = 0
product_image_url: Optional[str] = None
```

- [ ] **Step 4: 编写增量 SQL，不迁移旧库存阈值**

```sql
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS warning_quantity INTEGER NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_products_warning_quantity_nonnegative CHECK (warning_quantity >= 0);

ALTER TABLE inventory DROP COLUMN IF EXISTS warning_quantity;
```

使用 PostgreSQL 的条件约束创建方式避免重复执行失败，并在脚本中查询字段存在性作为执行确认。

- [ ] **Step 5: 运行指定测试，确认模型与响应契约通过**

Run: `cd backend && uv run pytest tests/test_business_logic.py -k 'warning_quantity_defaults or exposes_product_warning' -v`

Expected: PASS。

### Task 2: 商品预警更新接口

**Files:**
- Modify: `backend/app/schemas/product.py`
- Modify: `backend/app/services/product_service.py`
- Modify: `backend/app/api/v1/product.py`
- Test: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 写入失败测试，定义更新、校验和不存在商品行为**

```python
@pytest.mark.asyncio
async def test_update_product_warning_quantity_updates_only_warning_quantity():
    product = Product(..., warning_quantity=0)
    result = await update_product_warning_quantity(QueueDb([FakeResult(one=product)]), str(product.id), 12)
    assert result.warning_quantity == 12

def test_product_warning_quantity_request_rejects_negative_values():
    with pytest.raises(ValidationError):
        ProductWarningQuantityUpdate(warning_quantity=-1)
```

- [ ] **Step 2: 运行指定测试，确认缺少 schema 和 service 时失败**

Run: `cd backend && uv run pytest tests/test_business_logic.py -k 'update_product_warning or warning_quantity_request' -v`

Expected: FAIL，提示请求 schema 或 service 函数缺失。

- [ ] **Step 3: 添加专用请求 schema、服务函数和管理员路由**

```python
class ProductWarningQuantityUpdate(BaseModel):
    warning_quantity: int = Field(..., ge=0)

async def update_product_warning_quantity(db, product_id: str, warning_quantity: int) -> Product:
    product = await get_product_or_raise(db, product_id)
    product.warning_quantity = warning_quantity
    await db.flush()
    await db.refresh(product)
    return product

@router.patch('/{product_id}/warning-quantity', response_model=ResponseBase[ProductOut])
async def update_warning_quantity(product_id: str, req: ProductWarningQuantityUpdate, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    ...
```

- [ ] **Step 4: 运行指定测试，确认更新和校验通过**

Run: `cd backend && uv run pytest tests/test_business_logic.py -k 'update_product_warning or warning_quantity_request' -v`

Expected: PASS。

### Task 3: 库存列表与仪表盘商品级聚合

**Files:**
- Modify: `backend/app/services/inventory_service.py`
- Modify: `backend/app/services/dashboard_service.py`
- Modify: `backend/app/schemas/dashboard.py`
- Test: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 写入失败测试，约束商品首图、商品阈值和跨仓聚合 SQL**

```python
@pytest.mark.asyncio
async def test_inventory_list_uses_product_warning_and_first_image():
    result = await list_inventory(db, page=1, page_size=20)
    assert result.items[0].warning_quantity == 9
    assert result.items[0].product_image_url == 'https://example.com/first.png'

@pytest.mark.asyncio
async def test_inventory_alert_groups_available_stock_by_product():
    await _get_inventory_alerts(QueueDb([FakeResult(values=[])]))
    sql = db.statements[0]
    assert 'sum(inventory.quantity - inventory.locked)' in sql
    assert 'GROUP BY products.id' in sql
```

- [ ] **Step 2: 运行指定测试，确认当前单仓阈值查询失败要求**

Run: `cd backend && uv run pytest tests/test_business_logic.py -k 'inventory_list_uses_product_warning or inventory_alert_groups_available' -v`

Expected: FAIL，当前查询仍包含 `inventory.warning_quantity` 且未按商品聚合。

- [ ] **Step 3: 实现库存列表商品字段和仪表盘聚合**

```python
# 库存列表
out.warning_quantity = product.warning_quantity
out.product_image_url = (product.image_urls or [None])[0]

# 仪表盘查询
select(
    Product.id,
    Product.warning_quantity,
    func.sum(Inventory.quantity).label('quantity'),
    func.sum(Inventory.locked).label('locked'),
    func.sum(Inventory.quantity - Inventory.locked).label('available_quantity'),
    func.count(Inventory.warehouse_id).label('warehouse_count'),
).join(Inventory, Inventory.product_id == Product.id).group_by(Product.id).having(
    func.sum(Inventory.quantity - Inventory.locked) <= Product.warning_quantity
)
```

- [ ] **Step 4: 运行指定测试，确认商品级列表与告警聚合通过**

Run: `cd backend && uv run pytest tests/test_business_logic.py -k 'inventory_list_uses_product_warning or inventory_alert_groups_available' -v`

Expected: PASS。

### Task 4: 库存列表预警配置和图片展示

**Files:**
- Modify: `frontend/src/services/product.ts`
- Modify: `frontend/src/services/inventory.ts`
- Modify: `frontend/src/typings.d.ts`
- Modify: `frontend/src/pages/Inventory/stock/index.tsx`
- Modify: `frontend/src/pages/Dashboard/index.tsx`
- Modify: `frontend/src/services/product.test.ts`
- Modify: `frontend/src/services/inventory.test.ts`

- [ ] **Step 1: 写入失败的服务和展示辅助测试**

```ts
it('updates a product warning quantity through the product endpoint', async () => {
  await updateProductWarningQuantity('product-1', 8);
  expect(mockedRequest).toHaveBeenCalledWith('/api/v1/products/product-1/warning-quantity', {
    method: 'PATCH',
    data: { warning_quantity: 8 },
  });
});

it('uses the first image URL for a stock item', () => {
  expect(getStockProductImage({ product_image_url: 'https://example.com/a.png' })).toBe('https://example.com/a.png');
});
```

- [ ] **Step 2: 运行指定前端测试，确认新服务和辅助函数缺失**

Run: `cd frontend && npm test -- src/services/product.test.ts src/pages/Inventory/stock/index.test.tsx`

Expected: FAIL，提示更新服务或图片辅助函数缺失。

- [ ] **Step 3: 实现前端请求、类型和最小交互**

```tsx
export async function updateProductWarningQuantity(productId: string, warningQuantity: number) {
  return request<API.ResponseBase<API.Product>>(`/api/v1/products/${productId}/warning-quantity`, {
    method: 'PATCH',
    data: { warning_quantity: warningQuantity },
  });
}

<Image src={record.product_image_url} width={40} height={40} preview={false} fallback={placeholder} />
<Button type="link" onClick={() => openWarningModal(record)}>设置预警</Button>
```

使用 `ModalForm`、`ProFormDigit` 和 `Image`，限制数字最小值为 `0`；提交成功后调用 `actionRef.current?.reload()`。仪表盘类型和列改为商品级字段，不再显示仓库列。

- [ ] **Step 4: 运行指定前端测试，确认接口和图片选择行为通过**

Run: `cd frontend && npm test -- src/services/product.test.ts src/services/inventory.test.ts src/pages/Inventory/stock/index.test.tsx`

Expected: PASS。

### Task 5: 执行增量脚本与全量验证

**Files:**
- Verify: `backend/migrations/incremental/2026-07-17_商品级库存预警.sql`

- [ ] **Step 1: 使用 DBX MCP 的 `postgres` 连接执行增量脚本**

执行脚本后查询 `information_schema.columns`，确认 `products.warning_quantity` 存在且 `inventory.warning_quantity` 不存在；再检查商品级阈值默认值为 `0`。

- [ ] **Step 2: 运行后端完整验证**

Run: `cd backend && PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app && uv run pytest`

Expected: 编译成功且所有测试通过。

- [ ] **Step 3: 运行前端完整验证**

Run: `cd frontend && npm run tsc && npm run biome:lint && npm test`

Expected: 类型检查、Biome 和全部 Vitest 测试通过。
