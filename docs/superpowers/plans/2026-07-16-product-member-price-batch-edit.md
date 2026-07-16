# 商品会员价批量维护 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在商品价格管理 Modal 中以可编辑列表批量展示、新增并更新所有会员等级的会员价，并展示多系列价格变动折线图。

**Architecture:** 后端新增会员价读取与批量 upsert 接口，查询时合并全部 `customer_levels` 与已有 `member_prices`，写入时以一个事务处理所有变更并为实际变化逐条写价格日志；日志列表补齐会员等级名称。前端在价格管理 Modal 内以受控表格维护会员价，并用最近 100 条日志绘制标准价、成本价和各会员价的独立折线。

**Tech Stack:** FastAPI、Pydantic v2、SQLAlchemy async、PostgreSQL、React 19、Ant Design 6、Vitest、pytest。

---

### Task 1: 定义批量会员价数据契约

**Files:**
- Modify: `backend/app/schemas/product.py`
- Test: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 写失败的 schema 测试**

```python
def test_member_price_batch_accepts_empty_reason():
    request = MemberPriceBatchUpdate(reason=None, items=[MemberPriceBatchItem(level_id=str(uuid.uuid4()), price=88.5)])
    assert request.reason is None


def test_member_price_batch_rejects_duplicate_levels():
    level_id = str(uuid.uuid4())
    with pytest.raises(ValidationError, match="会员等级不能重复"):
        MemberPriceBatchUpdate(items=[MemberPriceBatchItem(level_id=level_id, price=1), MemberPriceBatchItem(level_id=level_id, price=2)])
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_business_logic.py -k member_price_batch -v`

Expected: FAIL，原因是批量会员价 schema 尚不存在。

- [ ] **Step 3: 增加最小 schema**

```python
class MemberPriceItemOut(BaseModel):
    level_id: str
    level_name: str
    price: Optional[float] = None


class MemberPriceBatchItem(BaseModel):
    level_id: str
    price: float = Field(..., ge=0)


class MemberPriceBatchUpdate(BaseModel):
    reason: Optional[str] = Field(None, max_length=255)
    items: list[MemberPriceBatchItem] = Field(..., min_length=1)

    @model_validator(mode="after")
    def unique_levels(self):
        if len({item.level_id for item in self.items}) != len(self.items):
            raise ValueError("会员等级不能重复")
        return self
```

- [ ] **Step 4: 重跑 schema 测试**

Run: `cd backend && .venv/bin/python -m pytest tests/test_business_logic.py -k member_price_batch -v`

Expected: PASS。

### Task 2: 实现会员价列表与原子批量保存服务

**Files:**
- Modify: `backend/app/services/product_service.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 写失败的服务测试**

覆盖以下可观察行为：

```python
@pytest.mark.asyncio
async def test_list_member_prices_returns_every_level_with_nullable_price():
    rows = await product_service.list_member_prices(db, str(product_id))
    assert [(row.level_name, row.price) for row in rows] == [("普通会员", 88), ("黄金会员", None)]


@pytest.mark.asyncio
async def test_batch_update_member_prices_creates_updates_and_logs_only_changes():
    await product_service.batch_update_member_prices(
        db, str(product_id),
        MemberPriceBatchUpdate(reason=None, items=[...]),
        "admin",
    )
    assert len(created_or_updated_prices) == 2
    assert [(log.old_value, log.new_value, log.reason) for log in price_logs] == [(80, 90, ""), (None, 70, "")]
```

测试还必须断言：相同价格不生成日志，未知等级抛出 `ValueError` 且不会写任何 `MemberPrice` 或 `PriceChangeLog`。

- [ ] **Step 2: 运行服务测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_business_logic.py -k 'member_prices' -v`

Expected: FAIL，原因是服务函数不存在。

- [ ] **Step 3: 实现查询与批量 upsert**

```python
async def list_member_prices(db, product_id):
    await _require_product(db, product_id)
    rows = await db.execute(
        select(CustomerLevel.id, CustomerLevel.name, MemberPrice.price)
        .outerjoin(MemberPrice, (MemberPrice.level_id == CustomerLevel.id) & (MemberPrice.product_id == product_id))
        .order_by(CustomerLevel.sort_order, CustomerLevel.created_at)
    )
    return [MemberPriceItemOut(level_id=str(level_id), level_name=name, price=price) for level_id, name, price in rows.all()]


async def batch_update_member_prices(db, product_id, req, operator_name):
    product = await _require_product(db, product_id)
    # 预先确认所有等级存在；随后查询已有价格；只对变化项 upsert 并创建日志。
    # req.reason or "" 用于满足日志 reason 的非空列约束。
    await db.flush()
    return await _populate_product_out(db, product)
```

实现必须在所有写入前完成等级存在性校验，依赖请求事务在异常时整体回滚。

- [ ] **Step 4: 重跑服务测试**

Run: `cd backend && .venv/bin/python -m pytest tests/test_business_logic.py -k 'member_prices' -v`

Expected: PASS。

### Task 3: 暴露管理员 API 并保持响应契约

**Files:**
- Modify: `backend/app/api/v1/product.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 写失败的路由委托测试**

```python
@pytest.mark.asyncio
async def test_batch_member_price_route_passes_admin_username(monkeypatch):
    monkeypatch.setattr(product_api.product_service, "batch_update_member_prices", fake_service)
    response = await product_api.batch_member_prices(product_id, request, type("Admin", (), {"username": "admin"})(), object())
    assert response.data == expected_product
```

- [ ] **Step 2: 运行路由测试确认失败**

Run: `cd backend && .venv/bin/python -m pytest tests/test_business_logic.py -k batch_member_price_route -v`

Expected: FAIL，原因是路由不存在。

- [ ] **Step 3: 增加两个管理员路由**

```python
@router.get("/{product_id}/member-prices", response_model=ResponseBase[list[MemberPriceItemOut]])
async def list_member_prices(product_id: str, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    return ResponseBase(data=await product_service.list_member_prices(db, product_id))


@router.put("/{product_id}/member-prices", response_model=ResponseBase[ProductOut])
async def batch_member_prices(product_id: str, req: MemberPriceBatchUpdate, admin: AdminUser, db: AsyncSession = Depends(get_db)):
    return ResponseBase(data=await product_service.batch_update_member_prices(db, product_id, req, admin.username))
```

将 `ValueError` 映射为现有的 `400` 响应。

- [ ] **Step 4: 重跑路由测试**

Run: `cd backend && .venv/bin/python -m pytest tests/test_business_logic.py -k batch_member_price_route -v`

Expected: PASS。

### Task 4: 添加前端服务与变更行辅助函数

**Files:**
- Modify: `frontend/src/services/product.ts`
- Create: `frontend/src/pages/Product/memberPrices.ts`
- Create: `frontend/src/pages/Product/memberPrices.test.ts`

- [ ] **Step 1: 写失败的辅助函数测试**

```ts
it('identifies new and changed member prices without requiring a reason', () => {
  expect(getChangedMemberPriceItems([
    { level_id: 'normal', price: undefined, draftPrice: 50 },
    { level_id: 'gold', price: 80, draftPrice: 90 },
    { level_id: 'platinum', price: 100, draftPrice: 100 },
  ])).toEqual([
    { level_id: 'normal', price: 50 },
    { level_id: 'gold', price: 90 },
  ]);
});
```

- [ ] **Step 2: 运行前端测试确认失败**

Run: `cd frontend && npm test -- --run src/pages/Product/memberPrices.test.ts`

Expected: FAIL，原因是辅助模块不存在。

- [ ] **Step 3: 增加服务与纯函数**

```ts
export async function listMemberPrices(productId: string) {
  return request<API.ResponseBase<MemberPriceItem[]>>(`/api/v1/products/${productId}/member-prices`);
}

export async function batchUpdateMemberPrices(productId: string, data: { reason?: string; items: MemberPriceChange[] }) {
  return request<API.ResponseBase<API.Product>>(`/api/v1/products/${productId}/member-prices`, { method: 'PUT', data });
}
```

`getChangedMemberPriceItems` 必须忽略未设置且仍为空的行，并忽略与原价格相同的行。

- [ ] **Step 4: 重跑前端测试**

Run: `cd frontend && npm test -- --run src/pages/Product/memberPrices.test.ts`

Expected: PASS。

### Task 5: 将价格抽屉替换为会员价可编辑表格

**Files:**
- Modify: `frontend/src/pages/Product/index.tsx`
- Modify: `frontend/src/pages/Product/form.test.ts`（仅在已有价格辅助测试适合扩展时）

- [ ] **Step 1: 先增加组件行为测试或提取可测纯函数**

通过 `memberPrices.ts` 覆盖保存按钮启用条件、状态标签和提交载荷；不要依赖浏览器 DOM 测试表格实现细节。

- [ ] **Step 2: 实现列表 UI**

```tsx
<Table<MemberPriceRow>
  pagination={false}
  rowKey="level_id"
  columns={[
    { title: '会员等级', dataIndex: 'level_name' },
    { title: '当前价格', render: (_, row) => row.price === undefined ? '未设置' : `¥${row.price.toFixed(2)}` },
    { title: '新价格', render: (_, row) => <InputNumber min={0} precision={2} prefix="¥" suffix="元" value={row.draftPrice} onChange={(value) => updateDraft(row.level_id, value)} /> },
    { title: '状态', render: (_, row) => <Tag>{getMemberPriceChangeState(row)}</Tag> },
  ]}
  dataSource={memberPriceRows}
/>
```

加载失败时显示错误消息；保存中禁用按钮；成功后重新加载会员价列表与商品表格。全局“调整原因”输入框不设置 `required`。

- [ ] **Step 3: 验证前端类型与单测**

Run: `cd frontend && npm test -- --run && npm run tsc`

Expected: PASS。

### Task 6: 端到端验证与全量检查

**Files:**
- No production changes expected.

- [ ] **Step 1: 运行后端和前端完整校验**

Run:

```bash
cd backend && .venv/bin/python -m pytest
PYTHONPYCACHEPREFIX=.pycache .venv/bin/python -m compileall app
cd ../frontend && npm test -- --run
npm run tsc
npm run biome:lint
cd .. && bash tests/test_dev_start.sh && git diff --check
```

Expected: 全部通过；若 Biome 仍显示既有断裂软链接告警，记录该告警但不得把它表述为本次代码错误。

- [ ] **Step 2: 浏览器验证**

使用本地开发服务登录管理员账户，打开商品价格管理 Modal，确认：

1. 所有会员等级出现，未设置价格显示“未设置”；
2. 在至少两个等级填写或修改价格；
3. 不填写调整原因仍可保存；
4. 保存请求仅含变更行，返回成功后列表显示新价格；
5. 价格变更日志包含每个实际变更等级。

### Task 7: 在价格管理 Modal 中展示价格变动折线图

**Files:**
- Modify: `backend/app/services/product_service.py`
- Modify: `backend/tests/test_business_logic.py`
- Modify: `frontend/src/pages/Product/index.tsx`
- Create: `frontend/src/pages/Product/priceChart.ts`
- Create: `frontend/src/pages/Product/priceChart.test.ts`

- [ ] **Step 1: 为日志等级名称与图表系列转换写失败测试**

```python
assert logs[0].level_name == "黄金会员"
```

```ts
expect(toPriceChartData(logs)).toEqual([
  { changedAt: '2026-07-16T10:00:00', series: '标准售价', price: 100 },
  { changedAt: '2026-07-16T10:01:00', series: '黄金会员会员价', price: 90 },
]);
```

- [ ] **Step 2: 实现日志标签与图表转换**

日志查询对会员等级执行外连接并返回 `level_name`；前端以 `price_type` 和 `level_name` 生成系列名称，使用 `@ant-design/charts` 的 `Line` 在 Modal 内绘图。

- [ ] **Step 3: 加载与刷新图表**

Modal 打开时请求 `page_size=100`；任一价格保存成功后重新请求日志并刷新图表。无日志时显示空状态。

- [ ] **Step 4: 验证**

Run: `cd backend && .venv/bin/python -m pytest && cd ../frontend && npm test -- --run && npm run tsc`

浏览器确认 Modal 内存在标准售价、成本价及会员价系列图例，并在保存后刷新。

## Self-review

- [x] 覆盖设计中的列表查询、批量 upsert、空原因、未设置价格新增和原子保存。
- [x] 未要求数据库 schema 变更，继续使用现有唯一约束与请求事务。
- [x] 每个生产改动前都有对应的失败测试步骤和明确的运行命令。
- [x] 前端将变更行识别抽为纯函数，避免仅用 DOM 测试覆盖核心提交规则。
