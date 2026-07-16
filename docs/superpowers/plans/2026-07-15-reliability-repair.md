# Reliability Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复商品管理系统的业务一致性、前后端契约和全部页面交互，并用后端测试、前端交互测试与逐页回归证明功能有效。

**Architecture:** 后端继续保持 API、service、schema、model 分层，库存和订单一致性由 service 内的数据库行锁与单事务保证。前端将跨页数据收集和实体类型收敛到 service 层，页面只负责交互；所有行为改动先由失败测试描述，再实现最小修复。

**Tech Stack:** Python 3.12、FastAPI、SQLAlchemy async、Pydantic 2、pytest/pytest-asyncio、React 19、Umi Max 4、Ant Design 6、Vitest、Testing Library、Biome。

---

## 文件职责

- `backend/app/services/order_service.py`：订单定价、状态机、库存锁定与客户统计。
- `backend/app/models/customer.py`、`backend/app/schemas/customer.py`：会员等级和客户累计数据契约。
- `backend/app/services/inventory_service.py`、`backend/app/schemas/inventory.py`：库存事务及仓库字段。
- `backend/app/main.py`：统一错误响应，不处理环境配置。
- `frontend/src/services/*.ts`：强类型接口和分页聚合。
- `frontend/src/pages/**/index.tsx`：页面交互，不自行拼装后端不存在的字段。
- `frontend/tests/pages/`：按页面覆盖按钮、弹窗和提交行为。
- `docs/testing/button-matrix.md`：逐页按钮验收清单和实测结果。

### Task 1: 固化 SKU 独立会员价规则

**Files:**
- Modify: `backend/tests/test_business_logic.py`
- Modify: `backend/app/services/order_service.py`
- Modify: `backend/app/models/customer.py`
- Modify: `backend/app/schemas/customer.py`
- Modify: `backend/app/services/level_service.py`
- Modify: `backend/app/seed.py`
- Modify: `backend/migrations/init.sql`
- Modify: `docs/modules/customer.md`
- Modify: `docs/modules/order.md`
- Modify: `FEATURES.md`

- [ ] **Step 1: 写定价失败测试**

```python
@pytest.mark.asyncio
async def test_create_order_uses_sku_price_without_member_price():
    customer, inventory, variant, level = make_order_entities()
    db = CreateOrderDb(customer, inventory, variant, level, member_price=None)
    order = await order_service.create_order(
        db,
        OrderCreate(
            customer_id=str(customer.id),
            warehouse_id=str(inventory.warehouse_id),
            items=[OrderItemCreate(sku_id=str(variant.id), quantity=1)],
        ),
        "admin",
    )
    assert order.total_amount == Decimal("100.00")

@pytest.mark.asyncio
async def test_create_order_uses_exact_member_price():
    customer, inventory, variant, level = make_order_entities()
    member_price = MemberPrice(
        id=uuid.uuid4(), sku_id=variant.id, level_id=level.id, price=Decimal("76.50")
    )
    db = CreateOrderDb(customer, inventory, variant, level, member_price=member_price)
    order = await order_service.create_order(
        db,
        OrderCreate(
            customer_id=str(customer.id),
            warehouse_id=str(inventory.warehouse_id),
            items=[OrderItemCreate(sku_id=str(variant.id), quantity=1)],
        ),
        "admin",
    )
    assert order.total_amount == Decimal("76.50")
```

同时把现有 `CreateOrderDb` 增加 `member_price` 参数，并让 `FROM member_prices` 分支返回该对象；`make_order_entities()` 复用当前测试中的 Customer、Inventory、ProductVariant、CustomerLevel 构造代码，售价固定为 `100.00`。

- [ ] **Step 2: 运行测试确认旧折扣逻辑导致失败**

Run: `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_business_logic.py -k 'member_price or sku_price' -v`

Expected: 默认价用例得到折扣后的金额，测试失败。

- [ ] **Step 3: 删除第二套折扣规则**

```python
member_price = await get_member_price(db, item.sku_id, str(customer.level_id))
unit_price = (
    Decimal(str(member_price))
    if member_price is not None
    else Decimal(str(variant.price))
)
```

同时从 `CustomerLevel`、Pydantic schema、level service、seed、初始化 SQL 和文档删除 `discount`。

- [ ] **Step 4: 验证定价测试通过**

Run: `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_business_logic.py -k 'member_price or sku_price' -v`

Expected: 两个用例通过。

- [ ] **Step 5: 提交定价规则变更**

```bash
git add backend/app backend/tests backend/migrations/init.sql docs/modules FEATURES.md
git commit -m "fix: use sku-specific member pricing"
```

### Task 2: 保证订单与库存并发守恒

**Files:**
- Create: `backend/tests/test_order_invariants.py`
- Modify: `backend/app/schemas/order.py`
- Modify: `backend/app/services/order_service.py`
- Modify: `backend/app/schemas/order.py`

- [ ] **Step 1: 写重复 SKU、行锁和取消原因失败测试**

```python
def test_order_create_rejects_duplicate_skus():
    sku_id = str(uuid.uuid4())
    with pytest.raises(ValidationError, match="同一 SKU"):
        OrderCreate(
            customer_id=str(uuid.uuid4()),
            warehouse_id=str(uuid.uuid4()),
            items=[
                OrderItemCreate(sku_id=sku_id, quantity=1),
                OrderItemCreate(sku_id=sku_id, quantity=2),
            ],
        )

@pytest.mark.asyncio
async def test_create_order_locks_inventory_rows():
    customer, inventory, variant, level = make_order_entities()
    db = CreateOrderDb(customer, inventory, variant, level, member_price=None)
    await order_service.create_order(
        db,
        OrderCreate(
            customer_id=str(customer.id),
            warehouse_id=str(inventory.warehouse_id),
            items=[OrderItemCreate(sku_id=str(variant.id), quantity=1)],
        ),
        "admin",
    )
    inventory_sql = next(sql for sql in db.statements if "FROM inventory" in sql)
    assert "FOR UPDATE" in inventory_sql

def test_cancel_requires_non_blank_reason():
    with pytest.raises(ValidationError):
        OrderActionRequest(cancel_reason="   ")
```

- [ ] **Step 2: 运行测试确认失败原因正确**

Run: `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_order_invariants.py -v`

Expected: 重复 SKU 被接受、SQL 无 `FOR UPDATE`、空取消原因被接受。

- [ ] **Step 3: 实现请求去重与数据库锁**

```python
@model_validator(mode="after")
def unique_skus(self):
    sku_ids = [item.sku_id for item in self.items]
    if len(sku_ids) != len(set(sku_ids)):
        raise ValueError("同一 SKU 不能重复添加")
    return self

# 锁定顺序按 SKU ID 固定，避免并发事务以不同顺序申请锁。
inventory_query = (
    select(Inventory)
    .where(Inventory.sku_id.in_(sorted(sku_ids)), Inventory.warehouse_id == req.warehouse_id)
    .order_by(Inventory.sku_id)
    .with_for_update()
)
```

订单状态转换先以 `select(Order).where(...).with_for_update()` 锁订单，再锁相关库存；取消时设置 `order.cancel_reason = cancel_reason`。

- [ ] **Step 4: 补库存守恒状态测试并运行**

```python
@pytest.mark.asyncio
async def test_ship_deducts_quantity_and_releases_lock():
    inventory = Inventory(quantity=10, locked=3, sku_id=sku_id, warehouse_id=warehouse_id)
    db = QueueDb([FakeResult(values=[order_item]), FakeResult(one=inventory), FakeResult(scalar=0)])
    await order_service._deduct_inventory_on_ship(db, order)
    assert (inventory.quantity, inventory.locked) == (7, 0)

@pytest.mark.asyncio
async def test_cancel_shipped_restores_quantity_without_negative_lock():
    inventory = Inventory(quantity=7, locked=0, sku_id=sku_id, warehouse_id=warehouse_id)
    db = QueueDb([FakeResult(values=[order_item]), FakeResult(one=inventory), FakeResult(scalar=0)])
    await order_service._release_locked_inventory(db, order, restore_quantity=True)
    assert (inventory.quantity, inventory.locked) == (10, 0)
```

测试函数内按现有 `test_ship_fails_if_inventory_row_is_missing` 的方式创建 `sku_id`、`warehouse_id`、`order` 和数量为 3 的 `order_item`；实现时把含义模糊的 `deduct_quantity` 参数重命名为 `restore_quantity`。

Run: `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_order_invariants.py -v`

Expected: 全部通过。

- [ ] **Step 5: 提交订单一致性变更**

```bash
git add backend/app/services/order_service.py backend/app/schemas/order.py backend/tests/test_order_invariants.py
git commit -m "fix: preserve order inventory invariants"
```

### Task 3: 补齐客户统计、订单输出与价格审计

**Files:**
- Create: `backend/tests/test_order_completion.py`
- Modify: `backend/app/models/customer.py`
- Modify: `backend/app/models/product.py`
- Modify: `backend/app/schemas/order.py`
- Modify: `backend/app/schemas/product.py`
- Modify: `backend/app/services/order_service.py`
- Modify: `backend/app/services/product_service.py`
- Modify: `backend/app/api/v1/product.py`
- Modify: `backend/migrations/init.sql`

- [ ] **Step 1: 写客户统计、只升级和输出字段失败测试**

```python
@pytest.mark.asyncio
async def test_complete_updates_customer_stats():
    await order_service._complete_order(db, order)
    assert customer.total_spent == Decimal("120.00")
    assert customer.order_count == 1
    assert customer.last_order_at is not None

@pytest.mark.asyncio
async def test_level_check_never_downgrades_customer():
    platinum = CustomerLevel(id=uuid.uuid4(), name="铂金", min_spent=Decimal("1000"))
    normal = CustomerLevel(id=uuid.uuid4(), name="普通", min_spent=Decimal("0"))
    customer = Customer(
        id=uuid.uuid4(), name="客户", contact_name="联系人",
        contact_phone="13800000000", level_id=platinum.id,
    )
    db = QueueDb([
        FakeResult(scalar=Decimal("10")),
        FakeResult(one=normal),
        FakeResult(one=platinum),
    ])
    await order_service._check_level_up(db, customer, Decimal("10"))
    assert customer.level_id == platinum.id

def test_order_out_contains_page_contract():
    assert OrderOut.model_fields.keys() >= {"customer_name", "cancel_reason", "items", "status_logs"}
```

- [ ] **Step 2: 运行测试确认模型字段和升级保护缺失**

Run: `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_order_completion.py -v`

Expected: 缺少统计字段或出现降级，测试失败。

- [ ] **Step 3: 实现累计数据和只升级规则**

```python
customer.total_spent = Decimal(str(customer.total_spent)) + Decimal(str(order.total_amount))
customer.order_count += 1
customer.last_order_at = order.created_at

if new_level and Decimal(str(new_level.min_spent)) > Decimal(str(current_level.min_spent)):
    customer.level_id = new_level.id
```

为 `OrderOut` 填充 `customer_name/cancel_reason`，明细沿用 `sku_code/sku_name`；价格日志增加 `operator`，API 将管理员用户名传入 service。

- [ ] **Step 4: 同步初始化迁移并验证**

Run: `cd backend && PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app migrations`

Expected: 编译成功，模型和 `init.sql` 都包含 `total_spent`、`order_count`、价格日志 `operator`。

- [ ] **Step 5: 运行相关测试并提交**

Run: `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_order_completion.py -v`

```bash
git add backend/app backend/migrations/init.sql backend/tests/test_order_completion.py
git commit -m "fix: complete customer and order audit data"
```

### Task 4: 修复仓库契约、权限、上传与错误响应

**Files:**
- Create: `backend/tests/test_api_contracts.py`
- Modify: `backend/app/schemas/inventory.py`
- Modify: `backend/app/services/inventory_service.py`
- Modify: `backend/app/api/v1/employee.py`
- Modify: `backend/app/schemas/dashboard.py`
- Modify: `backend/app/services/dashboard_service.py`
- Modify: `backend/app/api/v1/upload.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: 写 API 契约失败测试**

```python
def test_warehouse_schema_keeps_contact_fields():
    req = WarehouseCreate(name="主仓", contact_person="张三", contact_phone="13800000000")
    assert req.contact_person == "张三"

def test_employee_read_routes_require_admin():
    route = next(
        route for route in app.routes
        if getattr(route, "path", None) == "/api/v1/employees" and "GET" in route.methods
    )
    dependency_names = {
        dependency.call.__name__ for dependency in route.dependant.dependencies
        if dependency.call is not None
    }
    assert "require_admin" in dependency_names

@pytest.mark.asyncio
async def test_http_exception_handler_uses_common_response_shape():
    request = Request({"type": "http", "method": "GET", "path": "/test", "headers": []})
    response = await http_exception_handler(request, HTTPException(status_code=400, detail="bad"))
    assert json.loads(response.body) == {"code": 400, "message": "bad", "data": None}
```

- [ ] **Step 2: 运行测试确认字段、权限和响应不一致**

Run: `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_contracts.py -v`

Expected: 三类契约测试失败。

- [ ] **Step 3: 实现后端契约修复**

```python
class WarehouseCreate(BaseModel):
    name: str
    contact_person: str | None = None
    contact_phone: str | None = None
    status: WarehouseStatus = WarehouseStatus.active

warehouse = Warehouse(**req.model_dump())
```

员工列表/详情依赖改为 `AdminUser`；仪表盘 stats 增加四个总数字段。异常处理器返回 `JSONResponse(status_code=..., content={"code": status_code, "message": detail, "data": None})`。

- [ ] **Step 4: 限制上传读取并异步包装同步 SDK**

```python
data = await file.read(MAX_FILE_SIZE + 1)
if len(data) > MAX_FILE_SIZE:
    raise HTTPException(status_code=400, detail="文件大小不能超过10MB")
key = await run_in_threadpool(storage_service.upload_file, data, filename, content_type, prefix)
```

- [ ] **Step 5: 运行 API 测试并提交**

Run: `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest tests/test_api_contracts.py -v`

```bash
git add backend/app backend/tests/test_api_contracts.py
git commit -m "fix: align backend API contracts"
```

### Task 5: 建立前端类型与安全分页基础

**Files:**
- Create: `frontend/src/services/pagination.ts`
- Create: `frontend/tests/services/pagination.test.ts`
- Modify: `frontend/src/services/inventory.ts`
- Modify: `frontend/src/services/order.ts`
- Modify: `frontend/src/services/customer.ts`
- Modify: `frontend/src/typings.d.ts`

- [ ] **Step 1: 写分页聚合失败测试**

```typescript
it('loads every page without exceeding the backend page size', async () => {
  const lastItem = { id: 'last' };
  const fetchPage = vi.fn()
    .mockResolvedValueOnce({ items: Array(100), total: 101, page: 1, page_size: 100 })
    .mockResolvedValueOnce({ items: [lastItem], total: 101, page: 2, page_size: 100 });
  const items = await collectPages(fetchPage);
  expect(items).toHaveLength(101);
  expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 100);
  expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 100);
});
```

- [ ] **Step 2: 运行测试确认 helper 尚不存在**

Run: `cd frontend && npm test -- tests/services/pagination.test.ts`

Expected: import 失败。

- [ ] **Step 3: 实现通用分页收集器和实体类型**

```typescript
export async function collectPages<T>(fetchPage: (page: number, pageSize: number) => Promise<API.PaginatedData<T>>) {
  const pageSize = 100;
  const first = await fetchPage(1, pageSize);
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page += 1) {
    const next = await fetchPage(page, pageSize);
    items.push(...next.items);
    if (next.items.length === 0) break;
  }
  return items;
}
```

在 `inventory.ts` 暴露 `listAllInventory(warehouseId)`；为订单、库存、客户、等级和仓库定义具体类型，移除页面依赖的 `any`。

- [ ] **Step 4: 验证测试和类型检查**

Run: `cd frontend && npm test -- tests/services/pagination.test.ts && npm run tsc`

Expected: 通过。

- [ ] **Step 5: 提交 service 基础设施**

```bash
git add frontend/src/services frontend/src/typings.d.ts frontend/tests/services
git commit -m "fix: add typed safe pagination services"
```

### Task 6: 修复订单和库存操作页面

**Files:**
- Create: `frontend/tests/pages/order.test.tsx`
- Create: `frontend/tests/pages/inventory-operations.test.tsx`
- Modify: `frontend/src/pages/Order/index.tsx`
- Modify: `frontend/src/pages/Inventory/operations/index.tsx`

- [ ] **Step 1: 写订单按钮和盘点错误状态失败测试**

```typescript
it('requires a reason before cancelling an order', async () => {
  render(<OrderPage />);
  await user.click(await screen.findByRole('button', { name: '取消' }));
  expect(screen.getByLabelText('取消原因')).toBeRequired();
  expect(cancelOrder).not.toHaveBeenCalled();
});

it('blocks stocktake when inventory loading fails', async () => {
  vi.mocked(listAllInventory).mockRejectedValue(new Error('load failed'));
  render(<InventoryOperations />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: '盘点' }));
  await user.click(screen.getByRole('button', { name: '选择SKU' }));
  expect(screen.getByRole('button', { name: '确认盘点' })).toBeDisabled();
  expect(screen.getByText('库存加载失败')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行页面测试确认现有行为失败**

Run: `cd frontend && npm test -- tests/pages/order.test.tsx tests/pages/inventory-operations.test.tsx`

Expected: 取消无原因弹窗；盘点把未知库存显示为零。

- [ ] **Step 3: 实现订单页面交互**

使用 `Modal` + 必填 `Input.TextArea` 取消订单；详情字段改为 `customer_name`、`sku_code/sku_name`、`from_status/to_status`，移除后端不存在的优惠金额和实付金额。所有 action 使用 loading 状态和 `try/finally`。

- [ ] **Step 4: 实现库存安全加载**

订单和盘点均调用 `listAllInventory`。维护 `inventoryLoadState: 'idle' | 'loading' | 'ready' | 'error'`；仅在 `ready` 时允许提交，并在界面显示明确错误。

- [ ] **Step 5: 运行交互测试和提交**

Run: `cd frontend && npm test -- tests/pages/order.test.tsx tests/pages/inventory-operations.test.tsx`

```bash
git add frontend/src/pages/Order frontend/src/pages/Inventory/operations frontend/tests/pages
git commit -m "fix: make order and inventory actions reliable"
```

### Task 7: 修复等级、商品和仓库页面

**Files:**
- Create: `frontend/tests/pages/level.test.tsx`
- Create: `frontend/tests/pages/product.test.tsx`
- Create: `frontend/tests/pages/warehouses.test.tsx`
- Modify: `frontend/src/pages/Level/index.tsx`
- Modify: `frontend/src/pages/Product/index.tsx`
- Modify: `frontend/src/pages/Inventory/warehouses/index.tsx`
- Modify: `frontend/src/services/customer.ts`
- Modify: `frontend/src/services/inventory.ts`

- [ ] **Step 1: 写关键按钮失败测试**

```typescript
it('does not render a level discount input', () => {
  render(<LevelPage />);
  expect(screen.queryByLabelText('折扣率')).not.toBeInTheDocument();
});

it('does not create zero member prices for selected levels', async () => {
  render(<ProductPage />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '添加SKU' }));
  await user.type(screen.getByLabelText('SKU名称'), '测试SKU');
  await user.type(screen.getByLabelText('售价'), '100');
  await user.type(screen.getByLabelText('成本价'), '60');
  await user.click(screen.getByRole('button', { name: '完成' }));
  expect(setMemberPrice).not.toHaveBeenCalledWith(expect.objectContaining({ price: 0 }));
});

it('sends disabled and warehouse contact fields', async () => {
  render(<WarehousePage />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '编辑' }));
  await user.clear(screen.getByLabelText('联系人'));
  await user.type(screen.getByLabelText('联系人'), '张三');
  await user.clear(screen.getByLabelText('联系电话'));
  await user.type(screen.getByLabelText('联系电话'), '13800000000');
  await user.click(screen.getByLabelText('启用'));
  await user.click(screen.getByRole('button', { name: '确定' }));
  expect(updateWarehouse).toHaveBeenCalledWith('warehouse-1', expect.objectContaining({
    status: 'disabled', contact_person: '张三', contact_phone: '13800000000',
  }));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npm test -- tests/pages/level.test.tsx tests/pages/product.test.tsx tests/pages/warehouses.test.tsx`

Expected: 折扣控件存在、SKU 创建写零价、仓库发送 `inactive`。

- [ ] **Step 3: 修复三个页面及 service 类型**

删除折扣率和 `points_rate`；SKU 创建不再用等级多选生成占位价，会员价仅通过明确价格表单保存；仓库布尔开关映射 `active/disabled` 并传联系人字段。

- [ ] **Step 4: 运行测试和类型检查**

Run: `cd frontend && npm test -- tests/pages/level.test.tsx tests/pages/product.test.tsx tests/pages/warehouses.test.tsx && npm run tsc`

Expected: 通过。

- [ ] **Step 5: 提交页面契约修复**

```bash
git add frontend/src/pages/Level frontend/src/pages/Product frontend/src/pages/Inventory/warehouses frontend/src/services frontend/tests/pages
git commit -m "fix: align pricing and warehouse forms"
```

### Task 8: 建立全页面按钮回归矩阵

**Files:**
- Create: `docs/testing/button-matrix.md`
- Create: `frontend/tests/pages/customer.test.tsx`
- Create: `frontend/tests/pages/employee.test.tsx`
- Create: `frontend/tests/pages/inventory-pages.test.tsx`
- Create: `frontend/tests/pages/system-pages.test.tsx`
- Create: `frontend/tests/pages/dashboard-login.test.tsx`
- Modify: `frontend/src/pages/**/*.tsx` only when a test exposes a defect

- [ ] **Step 1: 枚举路由和按钮**

在 `button-matrix.md` 记录每个路由、角色、按钮、预期 service/API、成功结果和失败结果。必须覆盖 Dashboard、Employee、Customer、Level、Product、Price Logs、Inventory 四页、Supplier、Warehouse、Order、Category、Spec、Brand、Login 和异常页。

- [ ] **Step 2: 为每组页面写失败交互测试**

```typescript
it('creates a customer and closes the form', async () => {
  vi.mocked(createCustomer).mockResolvedValue({ code: 0, message: 'success', data: customer });
  render(<CustomerPage />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '新建客户' }));
  await user.type(screen.getByLabelText('客户名称'), '测试客户');
  await user.type(screen.getByLabelText('联系人'), '张三');
  await user.type(screen.getByLabelText('联系电话'), '13800000000');
  await user.click(screen.getByRole('button', { name: '确定' }));
  expect(createCustomer).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog', { name: '新建客户' })).not.toBeInTheDocument();
});
```

每个页面还必须覆盖取消按钮不调用 service、失败响应显示错误、非管理员不显示管理按钮。

- [ ] **Step 3: 逐组运行并修复发现的问题**

Run: `cd frontend && npm test -- tests/pages/customer.test.tsx tests/pages/employee.test.tsx`

Run: `cd frontend && npm test -- tests/pages/inventory-pages.test.tsx tests/pages/system-pages.test.tsx`

Run: `cd frontend && npm test -- tests/pages/dashboard-login.test.tsx`

Expected: 每组最终通过；每个修复都保留能先失败的测试。

- [ ] **Step 4: 执行全量前端测试**

Run: `cd frontend && npm test`

Expected: 所有页面交互测试通过，没有未处理 Promise 或 React `act` 警告。

- [ ] **Step 5: 提交按钮回归覆盖**

```bash
git add frontend/src/pages frontend/tests/pages docs/testing/button-matrix.md
git commit -m "test: cover all page actions"
```

### Task 9: 清理质量门禁并执行完整验收

**Files:**
- Modify: `frontend/src/pages/Dashboard/index.tsx`
- Modify: Ant Design lint 报告涉及的页面
- Modify: `backend/tests/test_business_logic.py`
- Modify: `docs/testing/button-matrix.md`

- [ ] **Step 1: 修复硬编码时间测试和 Biome 错误**

订单号测试从生成结果提取当天 UTC 日期，不再写死 `20260711`。Dashboard `Mix` 使用 Ant Design Charts 6 支持的 JSX/配置接口；修复非空断言、全局 `isNaN`、缺失图片 `alt` 和废弃属性。

- [ ] **Step 2: 运行后端完整验证**

Run: `cd backend && PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app migrations`

Run: `cd backend && UV_CACHE_DIR=.uv-cache uv run pytest`

Expected: 编译成功，全部测试通过且无日期相关失败。

- [ ] **Step 3: 运行前端完整验证**

Run: `cd frontend && npm test`

Run: `cd frontend && npm run tsc`

Run: `cd frontend && npm run biome:lint`

Run: `cd frontend && ./node_modules/.bin/antd lint ./src`

Run: `cd frontend && npm run build`

Expected: 所有命令退出码为 0；Ant Design lint 不再报告本次涉及页面的废弃或无障碍问题。

- [ ] **Step 4: 启动服务并逐页执行按钮矩阵**

Run: `cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000`

Run: `cd frontend && PORT=8001 npm run dev`

按 `docs/testing/button-matrix.md` 分别使用管理员和普通用户完成每条操作；记录实际结果。核心链路必须包含基础数据 → SKU/会员价 → 入库 → 创建订单 → 发货 → 收款 → 完成，以及下单后取消和发货后取消。

- [ ] **Step 5: 最终工作区审计**

Run: `git diff --check`

Run: `git status --short`

确认没有意外生成文件、环境配置改动或未记录的失败项，再更新按钮矩阵结果。
