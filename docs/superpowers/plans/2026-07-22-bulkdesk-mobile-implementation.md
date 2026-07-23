# BulkDesk 移动端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 React Native POC 上交付 Android/iOS 优先的 BulkDesk 现场工作台，覆盖客户只读查询、多客户草稿下单、仓库扫码作业和带拍照/手写签名的配送闭环，并复用现有后端库存、订单与配送事务。

**Architecture:** 客户端按 `features`、`api`、`platform` 分层；所有业务写入均在线调用 FastAPI，客户端不建立离线写队列。后端新增独立草稿订单域，提交时调用抽取后的正式订单创建服务；配送签收扩展独立签名 PNG URL，库存、价格和状态机仍只有一套服务端实现。

**Tech Stack:** React Native 0.82 + TypeScript + Jest、Vision Camera、View Shot；FastAPI、SQLAlchemy async、Pydantic、PostgreSQL、MinIO；React Navigation、TanStack Query（新增客户端依赖）。

---

## 实施前约束

- 在独立 worktree 中执行实现；不要覆盖当前未跟踪的 `mobile/`、设计文档或用户本地改动。
- 不创建 Git commit，除非用户在实施时明确要求；每个任务完成后以测试和构建输出作为检查点。
- 任何表结构变更必须同时包含 `backend/migrations/incremental/` 增量 SQL，并使用 DBX `postgres` 连接在开发库执行和验证。
- 所有移动端写操作使用在线请求；网络失败只显示可重试错误，不把库存、订单、签收或收款操作写入本地队列。
- 所有新接口保持 `/api/v1` 前缀及 `{ code, message, data }` 响应包装。

## 文件结构与职责

### 后端新增/修改

| 文件 | 职责 |
| --- | --- |
| `backend/migrations/incremental/2026-07-22_移动端草稿订单.sql` | 创建草稿订单、商品项、事件、幂等提交记录及索引。 |
| `backend/migrations/incremental/2026-07-22_配送签名凭证.sql` | 为配送记录增加签名图片 URL。 |
| `backend/app/models/order_draft.py` | 草稿状态、事件类型及 ORM 模型。 |
| `backend/app/models/order_delivery.py` | 增加 `signature_image_url`。 |
| `backend/app/models/__init__.py` | 导出新增草稿模型和枚举。 |
| `backend/app/schemas/order_draft.py` | 草稿读写、冲突、接手、提交响应契约。 |
| `backend/app/schemas/mobile.py` | 移动工作台、客户摘要、条码商品摘要。 |
| `backend/app/schemas/order_delivery.py` | 扩展签收请求/响应签名字段。 |
| `backend/app/services/order_service.py` | 提取可复用的“在事务内创建并锁库”服务。 |
| `backend/app/services/order_draft_service.py` | 草稿创建、保存、接手、放弃、幂等提交。 |
| `backend/app/services/mobile_service.py` | 移动工作台、客户可见性、条码查询摘要。 |
| `backend/app/services/order_delivery_service.py` | 在签收记录中保存签名 URL。 |
| `backend/app/api/v1/order_draft.py` | 草稿路由与权限映射。 |
| `backend/app/api/v1/mobile.py` | 移动端只读聚合路由。 |
| `backend/app/api/v1/router.py` | 注册草稿和移动路由。 |
| `backend/tests/test_mobile_draft_contract.py` | 迁移、模型、schema、服务边界和权限契约。 |
| `backend/tests/test_mobile_delivery_signature.py` | 签名字段迁移、schema 与签收服务契约。 |
| `backend/tests/test_mobile_read_contract.py` | 工作台、客户可见性、条码摘要契约。 |

### 移动端新增/修改

| 文件/目录 | 职责 |
| --- | --- |
| `mobile/package.json`、`mobile/package-lock.json` | 添加导航、服务端数据缓存、加密存储和图片压缩所需依赖。 |
| `mobile/App.tsx` | 以应用壳替换 POC 仪表盘直出。 |
| `mobile/src/app/` | API Provider、会话恢复、动态导航、主题、全局错误边界。 |
| `mobile/src/api/auth.ts`、`customers.ts`、`products.ts`、`dashboard.ts`、`orderDrafts.ts`、`inventory.ts`、`delivery.ts` | 业务 API 类型与请求封装。 |
| `mobile/src/features/auth/` | 登录和退出。 |
| `mobile/src/features/dashboard/` | 角色化工作台。 |
| `mobile/src/features/customers/` | 客户只读搜索和详情。 |
| `mobile/src/features/orders/` | 多客户草稿标签、商品搜索/扫码、接手、提交。 |
| `mobile/src/features/inventory/` | 入库、出库、盘点、调拨批量清单。 |
| `mobile/src/features/delivery/` | 我的任务、签收、收款、异常、退货。 |
| `mobile/src/platform/media/`、`mobile/src/platform/signature/` | 图片大小处理、签名导出上传适配。 |
| `mobile/src/__tests__/` | API、状态模型、权限导航、各流程的 Jest 测试。 |
| `mobile/README.md` | 更新实际运行、环境变量、真机验收说明。 |

---

## Phase 0 — 后端基础契约、迁移与只读移动能力

### Task 1: 固化移动端接口和数据域测试基线

**Files:**
- Create: `backend/tests/test_mobile_draft_contract.py`
- Create: `backend/tests/test_mobile_delivery_signature.py`
- Create: `backend/tests/test_mobile_read_contract.py`
- Modify: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 编写草稿订单迁移与模型的失败契约测试。**

  在 `test_mobile_draft_contract.py` 复用 `test_business_logic.py` 的 `_normalize_sql_fragment` 和 `_extract_create_table_block` 模式，先断言迁移路径和模型尚不存在：

  ```python
  def test_mobile_order_draft_migration_contract():
      migration_path = Path(__file__).parents[1] / "migrations" / "incremental" / "2026-07-22_移动端草稿订单.sql"
      sql = migration_path.read_text(encoding="utf-8")
      normalized = _normalize_sql_fragment(sql)

      assert normalized.startswith("begin;")
      assert normalized.endswith("commit;")
      assert "create table if not exists order_drafts (" in normalized
      assert "create table if not exists order_draft_items (" in normalized
      assert "create table if not exists order_draft_events (" in normalized
      assert "create table if not exists order_draft_submissions (" in normalized
      assert "create unique index if not exists uq_order_drafts_editing_owner_customer" in normalized
  ```

- [ ] **Step 2: 编写签名字段和移动只读路由的失败契约测试。**

  在对应测试文件先声明最终契约：

  ```python
  def test_delivery_signature_contract():
      assert "signature_image_url" in OrderDelivery.__table__.columns
      assert "signature_image_url" in OrderDeliverySignRequest.model_fields

  def test_mobile_router_contract():
      from app.api.v1 import mobile as mobile_api
      paths = {route.path for route in mobile_api.router.routes}
      assert "/dashboard" in paths
      assert "/customers/{customer_id}/summary" in paths
      assert "/products/barcode/{barcode}" in paths
  ```

- [ ] **Step 3: 运行目标测试，确认因缺少实现而失败。**

  Run:

  ```bash
  cd backend && uv run pytest tests/test_mobile_draft_contract.py tests/test_mobile_delivery_signature.py tests/test_mobile_read_contract.py -q
  ```

  Expected: `FAIL`，错误为缺少迁移文件、`order_draft` 模型、`mobile` 路由或签名字段；不得出现已有测试的非相关失败。

- [ ] **Step 4: 记录最终测试命名和行为范围。**

  不实现业务代码。将测试覆盖的四类不变量保持为：迁移幂等性、草稿唯一性、签名字段兼容、只读接口路径与角色边界。

### Task 2: 创建草稿订单和配送签名的数据库迁移

**Files:**
- Create: `backend/migrations/incremental/2026-07-22_移动端草稿订单.sql`
- Create: `backend/migrations/incremental/2026-07-22_配送签名凭证.sql`
- Test: `backend/tests/test_mobile_draft_contract.py`
- Test: `backend/tests/test_mobile_delivery_signature.py`

- [ ] **Step 1: 完成草稿迁移 SQL。**

  使用与 `2026-07-19_新增订单配送管理.sql` 一致的 `BEGIN; ... COMMIT;` 和 `DO $$ ... duplicate_object ... $$` 风格。定义：

  ```sql
  CREATE TYPE order_draft_status AS ENUM ('editing', 'submitted', 'abandoned');
  CREATE TYPE order_draft_event_type AS ENUM ('created', 'saved', 'taken_over', 'abandoned', 'submitted', 'submit_failed');

  CREATE TABLE IF NOT EXISTS order_drafts (
      id uuid PRIMARY KEY,
      customer_id uuid NOT NULL REFERENCES customers(id),
      owner_employee_id uuid NOT NULL REFERENCES employees(id),
      status order_draft_status NOT NULL DEFAULT 'editing',
      remark character varying(255),
      version integer NOT NULL DEFAULT 1,
      submitted_order_id uuid REFERENCES orders(id),
      abandoned_at timestamp without time zone,
      created_at timestamp without time zone NOT NULL DEFAULT now(),
      updated_at timestamp without time zone NOT NULL DEFAULT now(),
      CONSTRAINT ck_order_drafts_version_positive CHECK (version > 0)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_order_drafts_editing_owner_customer
      ON order_drafts(owner_employee_id, customer_id) WHERE status = 'editing';
  ```

  为 `order_draft_items` 增加 `(draft_id, product_id)` 唯一约束；为 `order_draft_events` 写入操作者、原/新 owner、版本和备注；为 `order_draft_submissions` 写入 `draft_id`、`idempotency_key`、`order_id`、`created_at`，并对 `(draft_id, idempotency_key)` 设唯一约束。

- [ ] **Step 2: 完成配送签名迁移 SQL。**

  只做幂等性 `ALTER TABLE`，不修改历史配送数据：

  ```sql
  BEGIN;

  ALTER TABLE order_deliveries
      ADD COLUMN IF NOT EXISTS signature_image_url character varying(1000);

  COMMENT ON COLUMN order_deliveries.signature_image_url
      IS '客户手写签名PNG的公开URL；历史Web签收记录允许为空';

  COMMIT;
  ```

- [ ] **Step 3: 扩展契约测试，检查表、约束、索引和 SQL 安全性。**

  在测试中断言 `id` 无默认 UUID 函数、没有 `INSERT/UPDATE/DELETE/TRUNCATE`、草稿状态枚举和部分唯一索引存在、签名迁移仅包含允许的 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`。

- [ ] **Step 4: 运行迁移契约测试。**

  Run:

  ```bash
  cd backend && uv run pytest tests/test_mobile_draft_contract.py tests/test_mobile_delivery_signature.py -q
  ```

  Expected: `PASS`。

- [ ] **Step 5: 在开发库执行并验证迁移。**

  通过 DBX `postgres` 连接依次执行两个 SQL 文件；随后执行：

  ```sql
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('order_drafts', 'order_draft_items', 'order_draft_events', 'order_draft_submissions');

  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'order_deliveries'
    AND column_name = 'signature_image_url';
  ```

  Expected: 四张草稿表和 `signature_image_url` 均返回。将实际 DBX 输出附在实施记录中。

### Task 3: 实现 ORM、Pydantic 草稿/签名契约与模型导出

**Files:**
- Create: `backend/app/models/order_draft.py`
- Create: `backend/app/schemas/order_draft.py`
- Modify: `backend/app/models/order_delivery.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/schemas/order_delivery.py`
- Test: `backend/tests/test_mobile_draft_contract.py`
- Test: `backend/tests/test_mobile_delivery_signature.py`

- [ ] **Step 1: 在测试中定义 schema 行为。**

  增加以下测试：

  ```python
  def test_draft_save_rejects_duplicate_products():
      with pytest.raises(ValidationError, match="同一商品不能重复添加"):
          OrderDraftSaveRequest(
              version=3,
              items=[
                  OrderDraftItemInput(product_id="p-1", quantity=1),
                  OrderDraftItemInput(product_id="p-1", quantity=2),
              ],
          )

  def test_mobile_signature_requires_non_empty_url_when_supplied():
      with pytest.raises(ValidationError):
          OrderDeliverySignRequest(signer_name="李四", signature_image_url="   ")
  ```

- [ ] **Step 2: 运行 schema 测试，确认失败。**

  Run:

  ```bash
  cd backend && uv run pytest tests/test_mobile_draft_contract.py tests/test_mobile_delivery_signature.py -q
  ```

  Expected: `FAIL`，因为新 schema 和字段尚未定义。

- [ ] **Step 3: 实现草稿 ORM 模型。**

  在 `order_draft.py` 定义 `OrderDraftStatus`、`OrderDraftEventType`、`OrderDraft`、`OrderDraftItem`、`OrderDraftEvent`、`OrderDraftSubmission`。关键字段应与迁移同名；`OrderDraft.items` 使用 `cascade="all, delete-orphan"`；金额快照使用 `Numeric(12, 2)`，只用于界面预估，不作为正式下单价格来源。

  ```python
  class OrderDraft(UUIDMixin, TimestampMixin, Base):
      __tablename__ = "order_drafts"

      customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), nullable=False)
      owner_employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id"), nullable=False)
      status: Mapped[OrderDraftStatus] = mapped_column(Enum(OrderDraftStatus, name="order_draft_status", native_enum=True), nullable=False)
      version: Mapped[int] = mapped_column(nullable=False, default=1)
      submitted_order_id: Mapped[Optional[uuid.UUID]] = mapped_column(ForeignKey("orders.id"))
      items: Mapped[list["OrderDraftItem"]] = relationship(back_populates="draft", cascade="all, delete-orphan")
  ```

- [ ] **Step 4: 实现请求/响应 schema 和配送签名字段。**

  `OrderDraftSaveRequest` 包含 `version`、`items`、`remark`；`OrderDraftTakeoverRequest` 和 `OrderDraftAbandonRequest` 只接受 `version`；`OrderDraftSubmitRequest` 接受 `version`；所有 `items` 数量大于零并拒绝重复 `product_id`。`OrderDeliverySignRequest` 和配送输出新增 `signature_image_url: Optional[str]`，用现有 URL 列表的 trim/空串校验风格处理。

- [ ] **Step 5: 更新模型导出并运行目标测试。**

  Run:

  ```bash
  cd backend && uv run pytest tests/test_mobile_draft_contract.py tests/test_mobile_delivery_signature.py -q
  ```

  Expected: `PASS`。

### Task 4: 抽取正式订单创建服务，确保草稿提交不复制锁库逻辑

**Files:**
- Modify: `backend/app/services/order_service.py`
- Modify: `backend/app/api/v1/order.py`
- Test: `backend/tests/test_mobile_draft_contract.py`
- Test: `backend/tests/test_business_logic.py`

- [ ] **Step 1: 编写失败测试，锁定公共服务的事务语义。**

  在 `test_mobile_draft_contract.py` 通过 `inspect.getsource` 断言 API 和草稿服务都将调用同一个服务函数，并在现有订单服务测试中覆盖以下输入/输出：

  ```python
  async def create_placed_order(
      db: AsyncSession,
      request: OrderCreate,
      operator: Employee,
  ) -> Order:
      ...
  ```

  关键断言：商品价格来自 `_member_price` 和 `_effective_order_price`；库存查询带 `with_for_update()`；库存不足抛出 `ValueError`；订单状态为 `OrderStatus.placed`。

- [ ] **Step 2: 运行目标测试，确认抽取前失败。**

  Run:

  ```bash
  cd backend && uv run pytest tests/test_mobile_draft_contract.py tests/test_business_logic.py -q
  ```

  Expected: `FAIL`，公共函数不存在或调用边界不满足。

- [ ] **Step 3: 提取并替换调用。**

  将目前 `create_order` 内已有的客户读取、商品锁定、会员价重算、库存分配、`Order`/`OrderItem`/`OrderInventoryAllocation`/`OrderStatusLog` 创建代码移动到 `create_placed_order`；保持原子事务边界不变。`create_order` 保留为现有 API 的薄包装：

  ```python
  async def create_order(db: AsyncSession, req: OrderCreate, operator: Employee) -> Order:
      return await create_placed_order(db, req, operator)
  ```

- [ ] **Step 4: 运行订单和草稿契约回归。**

  Run:

  ```bash
  cd backend && uv run pytest tests/test_business_logic.py tests/test_mobile_draft_contract.py -q
  ```

  Expected: `PASS`；现有 Web 创建订单的输入和输出不变。

### Task 5: 实现草稿服务、权限和 API

**Files:**
- Create: `backend/app/services/order_draft_service.py`
- Create: `backend/app/api/v1/order_draft.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_mobile_draft_contract.py`

- [ ] **Step 1: 先写服务层失败测试。**

  测试应覆盖以下不变量，以服务函数命名为准：

  ```python
  async def test_get_or_create_draft_returns_same_editing_draft_for_owner_customer(): ...
  async def test_save_draft_rejects_stale_version_without_mutating_items(): ...
  async def test_take_over_rejects_recipient_existing_customer_draft(): ...
  async def test_submit_uses_existing_order_creation_and_marks_draft_submitted(): ...
  async def test_submit_retries_same_idempotency_key_return_same_order(): ...
  ```

  若当前测试基础设施没有 async PostgreSQL fixture，则为此文件增加最小 `pytest-asyncio` fixture，连接开发测试数据库；不得用 SQLite 替代 PostgreSQL 原生 enum/部分唯一索引语义。

- [ ] **Step 2: 运行草稿服务测试，确认失败。**

  Run:

  ```bash
  cd backend && uv run pytest tests/test_mobile_draft_contract.py -q
  ```

  Expected: `FAIL`，因为 `order_draft_service` 不存在。

- [ ] **Step 3: 实现查询、保存和并发控制。**

  实现 `list_my_drafts`、`list_available_drafts`、`get_or_create_draft`、`get_draft`、`save_draft`、`take_over_draft`、`abandon_draft`、`submit_draft`。所有更改函数先 `SELECT ... FOR UPDATE` 锁定草稿并检查 `request.version == draft.version`；版本冲突统一抛出 `ValueError("草稿已被其他操作更新，请刷新后重试")`。

  保存完整商品清单时，按请求替换/更新 `OrderDraftItem`，并从当前商品与客户等级写入预估价格快照；不得修改正式 `OrderItem`。

- [ ] **Step 4: 实现接手与幂等提交。**

  接手只允许 `admin` 或 `warehouse_manager`；若接手者已有同客户 `editing` 草稿，返回 `ValueError("接手人已有该客户的进行中草稿")`。提交顺序必须是：锁草稿 → 验证 owner/status/version → 查询同 key `OrderDraftSubmission` → 将草稿项转换为 `OrderCreate` → 调用 `create_placed_order` → 创建 submission → 标记 `submitted` 和 `submitted_order_id` → 写事件。

- [ ] **Step 5: 实现路由并注册。**

  路由使用 `WarehouseUser`：

  ```python
  router = APIRouter(prefix="/order-drafts", tags=["移动端草稿订单"])

  @router.post("", response_model=ResponseBase[OrderDraftOut])
  async def create_or_open_draft(req: OrderDraftCreateRequest, current_user: WarehouseUser, db: AsyncSession = Depends(get_db)):
      return ResponseBase(data=await order_draft_service.get_or_create_draft(db, req.customer_id, current_user))
  ```

  `POST /{id}/submit` 必须读取 `Idempotency-Key` 请求头，空值返回 422；`available`、`takeover`、`abandon`、`submit` 在服务层再次校验角色和 owner，不能只依赖页面隐藏。

- [ ] **Step 6: 运行草稿测试与后端完整回归。**

  Run:

  ```bash
  cd backend && uv run pytest tests/test_mobile_draft_contract.py -q
  cd backend && uv run pytest
  ```

  Expected: 两条命令均 `PASS`。如既有用例失败，保留完整失败输出并停止处理无关问题。

### Task 6: 实现移动工作台、客户范围和条码摘要只读接口

**Files:**
- Create: `backend/app/schemas/mobile.py`
- Create: `backend/app/services/mobile_service.py`
- Create: `backend/app/api/v1/mobile.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_mobile_read_contract.py`

- [ ] **Step 1: 编写失败测试，确定角色过滤。**

  覆盖：

  ```python
  def test_dashboard_actions_are_filtered_by_roles(): ...
  def test_delivery_user_can_only_read_customer_from_assigned_delivery(): ...
  def test_warehouse_user_can_read_any_customer_summary(): ...
  def test_barcode_summary_uses_exact_active_product_match(): ...
  ```

  `delivery` 用户直接请求未分配客户 ID 时预期 `PermissionError`，API 映射为 HTTP 403；不存在条码/客户预期 HTTP 404。

- [ ] **Step 2: 实现 Pydantic 输出和 service。**

  `MobileDashboardOut` 包含 `actions`、`summary`、`alerts`；`MobileCustomerSummaryOut` 只包含客户资料、等级、订单/配送摘要；`MobileProductBarcodeOut` 包含产品、条码、单位、标准价、状态和各仓库可用库存摘要。查询必须按当前用户角色限制数据，不返回支付凭证 URL、员工敏感字段或无关客户。

- [ ] **Step 3: 实现移动路由。**

  ```python
  router = APIRouter(prefix="/mobile", tags=["移动端"])

  @router.get("/dashboard", response_model=ResponseBase[MobileDashboardOut])
  @router.get("/customers/{customer_id}/summary", response_model=ResponseBase[MobileCustomerSummaryOut])
  @router.get("/products/barcode/{barcode}", response_model=ResponseBase[MobileProductBarcodeOut])
  ```

  路由使用 `CurrentUser`，服务层针对 `delivery` 进行配送归属二次校验。

- [ ] **Step 4: 运行移动只读接口测试。**

  Run:

  ```bash
  cd backend && uv run pytest tests/test_mobile_read_contract.py -q
  ```

  Expected: `PASS`。

### Task 7: 将签名 URL 接入配送签收服务和 Web 详情

**Files:**
- Modify: `backend/app/models/order_delivery.py`
- Modify: `backend/app/schemas/order_delivery.py`
- Modify: `backend/app/services/order_delivery_service.py`
- Modify: `frontend/src/services/delivery.ts`
- Modify: `frontend/src/pages/Delivery/index.tsx`
- Modify: `frontend/src/pages/Delivery/delivery.test.ts`
- Test: `backend/tests/test_mobile_delivery_signature.py`

- [ ] **Step 1: 写失败测试，锁定兼容性和签收写入。**

  ```python
  async def test_sign_delivery_persists_signature_image_url():
      request = OrderDeliverySignRequest(
          signer_name="张三",
          proof_image_urls=["https://storage/proof.jpg"],
          signature_image_url="https://storage/signature.png",
      )
      delivery = await sign_delivery(db, delivery_id, request, delivery_employee)
      assert delivery.signature_image_url == "https://storage/signature.png"

  def test_legacy_signature_request_without_signature_url_is_valid():
      assert OrderDeliverySignRequest(signer_name="张三").signature_image_url is None
  ```

  在前端测试中断言历史记录签名 URL 为空时不渲染损坏图片，有 URL 时显示“手写签名”凭证。

- [ ] **Step 2: 运行测试，确认失败。**

  Run:

  ```bash
  cd backend && uv run pytest tests/test_mobile_delivery_signature.py -q
  cd frontend && npm run tsc && npm run biome:lint
  ```

  Expected: 后端测试失败于字段未持久化；前端在服务类型添加前可能出现类型失败。

- [ ] **Step 3: 实现后端和 Web 展示。**

  在 `sign_delivery` 的现有赋值旁添加：

  ```python
  delivery.signature_image_url = request.signature_image_url
  ```

  保持字段可空，兼容历史 Web 签收。`OrderDeliveryDetailOut`、订单详情关联配送摘要和前端 `delivery.ts` 类型均添加 `signature_image_url?: string | null`；在配送详情使用现有图片预览组件展示独立签名，不把它塞进 `proof_image_urls`。

- [ ] **Step 4: 运行后端和前端验证。**

  Run:

  ```bash
  cd backend && uv run pytest tests/test_mobile_delivery_signature.py && uv run pytest
  cd frontend && npm run tsc && npm run biome:lint
  ```

  Expected: 全部 `PASS`。

---

## Phase 1 — React Native 应用骨架、会话与只读页面

### Task 8: 建立应用壳、导航、查询缓存和安全会话实现

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/package-lock.json`
- Modify: `mobile/App.tsx`
- Create: `mobile/src/app/AppProviders.tsx`
- Create: `mobile/src/app/AppNavigator.tsx`
- Create: `mobile/src/app/roleNavigation.ts`
- Create: `mobile/src/security/nativeSecureStorage.ts`
- Modify: `mobile/src/security/secureSession.ts`
- Create: `mobile/src/__tests__/roleNavigation.test.ts`
- Create: `mobile/src/__tests__/secureSessionNative.test.ts`

- [ ] **Step 1: 添加失败的角色导航与安全存储测试。**

  ```ts
  expect(buildNavigation(['warehouse_manager'])).toEqual(['dashboard', 'customers', 'orders', 'inventory', 'profile']);
  expect(buildNavigation(['delivery'])).toEqual(['dashboard', 'delivery', 'profile']);
  await expect(storage.get('bulkdesk.session.tokens')).resolves.toEqual({ accessToken: 'token' });
  ```

- [ ] **Step 2: 运行 Jest，确认失败。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand roleNavigation secureSessionNative
  ```

  Expected: `FAIL`，因为导航和原生安全存储实现不存在。

- [ ] **Step 3: 安装并配置依赖。**

  添加 React Navigation 所需包、`@tanstack/react-query`、平台安全存储库和图片压缩库。安装后执行 iOS Pods 更新：

  ```bash
  cd mobile && npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs @tanstack/react-query react-native-keychain react-native-image-resizer
  cd mobile/ios && bundle exec pod install
  ```

  对 Harmony，不直接在 feature 中引用不兼容原生库；仅在 `nativeSecureStorage.ts` 和媒体 adapter 中分支，并在后续 Harmony 构建中验证。

- [ ] **Step 4: 实现 Provider、导航和会话。**

  `App.tsx` 只渲染 `AppProviders`；Provider 初始化 `QueryClient`、安全会话恢复和导航容器。`buildNavigation` 根据角色返回唯一、稳定的模块列表；API 401 时清空 secure session 和 Query 缓存并回到登录页。安全存储实现必须符合已有 `SecureStorageAdapter`，严禁退回到 `AsyncStorage`。

- [ ] **Step 5: 运行类型、Jest 和原生构建。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand roleNavigation secureSessionNative
  cd mobile && npm run typecheck && npm run lint
  cd mobile/android && ./gradlew app:assembleDebug -x lint
  ```

  Expected: 全部 `PASS`；若 iOS Pods 变动，随后运行一次 `npm run ios -- --simulator` 验证能启动。

### Task 9: 实现登录、工作台、客户查询和条码查询 API/页面

**Files:**
- Create: `mobile/src/api/auth.ts`
- Create: `mobile/src/api/dashboard.ts`
- Create: `mobile/src/api/customers.ts`
- Create: `mobile/src/api/products.ts`
- Create: `mobile/src/features/auth/LoginScreen.tsx`
- Create: `mobile/src/features/dashboard/DashboardScreen.tsx`
- Create: `mobile/src/features/customers/CustomerListScreen.tsx`
- Create: `mobile/src/features/customers/CustomerDetailScreen.tsx`
- Create: `mobile/src/features/products/BarcodeLookupScreen.tsx`
- Create: `mobile/src/__tests__/mobileReadApi.test.ts`
- Create: `mobile/src/__tests__/customerPermissionView.test.tsx`

- [ ] **Step 1: 写 API 解包与页面权限失败测试。**

  ```ts
  await expect(api.getCustomerSummary('customer-1')).resolves.toEqual(expect.objectContaining({ id: 'customer-1' }));
  expect(buildNavigation(['delivery'])).not.toContain('customers');
  expect(screen.queryByText('所有客户')).toBeNull();
  ```

- [ ] **Step 2: 运行目标测试，确认失败。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand mobileReadApi customerPermissionView
  ```

  Expected: `FAIL`，因为 API 模块和页面不存在。

- [ ] **Step 3: 实现强类型 API 和 React Query hooks。**

  请求路径固定为 `/api/v1/mobile/dashboard`、`/api/v1/mobile/customers/{id}/summary`、`/api/v1/mobile/products/barcode/{barcode}`；客户列表仍调用既有 `/api/v1/customers?keyword=`。所有 hook 的 query key 使用 `['mobile', resource, params]`，登出时统一清空。

- [ ] **Step 4: 实现最小页面闭环。**

  登录页保存令牌后获取当前用户及角色；工作台只渲染后端允许的 actions；客户页只读搜索/详情；配送员只能从配送详情进入受限客户摘要，不能访问全客户列表；条码页面复用已有 `createScanner`，扫码后请求条码摘要并处理未找到、无权限和相机失败。

- [ ] **Step 5: 运行移动端验证。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand mobileReadApi customerPermissionView scannerDeduplication visionCameraAdapter
  cd mobile && npm run typecheck && npm run lint
  ```

  Expected: 全部 `PASS`。

---

## Phase 2 — 多客户草稿订单

### Task 10: 实现草稿订单 API 客户端和纯状态模型

**Files:**
- Create: `mobile/src/api/orderDrafts.ts`
- Create: `mobile/src/features/orders/draftWorkspaceModel.ts`
- Create: `mobile/src/__tests__/orderDraftsApi.test.ts`
- Create: `mobile/src/__tests__/draftWorkspaceModel.test.ts`

- [ ] **Step 1: 写多客户标签与冲突处理的失败测试。**

  ```ts
  const state = openDraft(openDraft(createWorkspace(), customerA), customerB);
  expect(state.openDraftIds).toEqual(['draft-a', 'draft-b']);
  expect(selectActiveDraft(switchDraft(state, 'draft-a'))?.customerId).toBe('customer-a');
  expect(mapDraftError({ status: 409, message: '草稿已被其他操作更新，请刷新后重试' })).toEqual('refresh-required');
  ```

- [ ] **Step 2: 运行测试，确认失败。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand orderDraftsApi draftWorkspaceModel
  ```

  Expected: `FAIL`。

- [ ] **Step 3: 实现 API。**

  `orderDrafts.ts` 必须提供 `listMine`、`listAvailable`、`open(customerId)`、`save(draft)`、`takeOver(id, version)`、`abandon(id, version)`、`submit(id, version, idempotencyKey)`。提交请求的 `Idempotency-Key` 必须由调用方以 `crypto.randomUUID()` 生成，并在同一按钮重试期间复用。

- [ ] **Step 4: 实现纯状态模型。**

  状态模型只保存已打开草稿 ID、当前 active ID、提交中的 ID 和待显示的冲突；草稿明细以 React Query 服务端数据为准。禁止把服务端草稿副本写进 `AsyncStorage`。

- [ ] **Step 5: 运行测试、类型和 lint。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand orderDraftsApi draftWorkspaceModel
  cd mobile && npm run typecheck && npm run lint
  ```

  Expected: `PASS`。

### Task 11: 实现多客户订单工作区页面

**Files:**
- Create: `mobile/src/features/orders/OrderWorkspaceScreen.tsx`
- Create: `mobile/src/features/orders/CustomerPickerSheet.tsx`
- Create: `mobile/src/features/orders/ProductPickerSheet.tsx`
- Create: `mobile/src/features/orders/AvailableDraftsScreen.tsx`
- Create: `mobile/src/features/orders/orderWorkspaceValidation.ts`
- Create: `mobile/src/__tests__/orderWorkspaceValidation.test.ts`
- Create: `mobile/src/__tests__/orderWorkspaceScreen.test.tsx`

- [ ] **Step 1: 写页面/校验失败测试。**

  ```ts
  expect(validateDraftSubmission({ items: [], version: 1 })).toEqual('请至少添加一件商品');
  expect(validateDraftSubmission({ items: [{ productId: 'p', quantity: 1 }], version: 0 })).toEqual('草稿版本无效');
  expect(screen.getByText('兴隆超市')).toBeTruthy();
  expect(screen.getByText('惠民便利店')).toBeTruthy();
  ```

- [ ] **Step 2: 运行测试，确认失败。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand orderWorkspaceValidation orderWorkspaceScreen
  ```

  Expected: `FAIL`。

- [ ] **Step 3: 实现客户、商品和扫码加购。**

  选择客户时调用 `open(customerId)` 并打开/激活标签；商品选择支持关键词搜索和条码扫描；同一 `productId` 再次添加只递增数量，不产生重复行；修改数量、删除商品、修改备注在 500 ms 防抖后调用 `save`，离开页面前 flush 当前保存。

- [ ] **Step 4: 实现接手、放弃、提交和失败恢复。**

  “可接手草稿”只显示后端返回的元数据；接手成功后刷新 mine/available 列表并打开新归属草稿。提交按钮使用单次 loading lock；成功后关闭标签、失效草稿查询、展示订单号并跳订单详情；400/409 返回时保留当前草稿和商品行，按商品展示缺货/停售/价格变化，409 提供“刷新草稿”动作。

- [ ] **Step 5: 运行测试和 Android 真机手工验收。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand orderWorkspaceValidation orderWorkspaceScreen orderDraftsApi
  cd mobile && npm run typecheck && npm run lint
  ```

  真机步骤：为客户 A 扫码加商品但不提交 → 切换到客户 B 加商品 → 返回 A 核对数量/备注未丢失 → 另一可下单账号接手 A → 原账号刷新后只读 → 新账号提交一次，确认只生成一张 `placed` 订单且库存锁定一次。

---

## Phase 3 — 仓库扫码作业

### Task 12: 实现库存 API、批量清单模型与作业表单

**Files:**
- Create: `mobile/src/api/inventory.ts`
- Create: `mobile/src/features/inventory/inventoryOperationModel.ts`
- Create: `mobile/src/features/inventory/InventoryOperationScreen.tsx`
- Create: `mobile/src/features/inventory/InventoryLookupScreen.tsx`
- Create: `mobile/src/__tests__/inventoryOperationModel.test.ts`
- Create: `mobile/src/__tests__/inventoryApi.test.ts`

- [ ] **Step 1: 写入/出/盘/调的失败测试。**

  ```ts
  expect(addScannedItem(createInventoryOperation('stock-in'), product, 2).items).toHaveLength(1);
  expect(addScannedItem(withItem, product, 3).items[0].quantity).toBe(5);
  expect(validateTransfer({ fromWarehouseId: 'w-1', toWarehouseId: 'w-1', items: [item] })).toEqual('来源仓库和目标仓库不能相同');
  expect(validateStockOut({ warehouseId: 'w-1', items: [itemWithZeroQuantity] })).toEqual('商品数量必须大于零');
  ```

- [ ] **Step 2: 运行测试，确认失败。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand inventoryOperationModel inventoryApi
  ```

  Expected: `FAIL`。

- [ ] **Step 3: 实现 API 和纯模型。**

  API 映射既有路径：`/inventory/stock-in/batch`、`/inventory/stock-out/batch`、`/inventory/stocktake/batch`、`/inventory/transfer/batch`、`/inventory`、`/warehouses`、`/suppliers`。模型分别校验必填仓库、数量、盘点实际数量、调拨来源/目标；扫描未知条码不得加入清单。

- [ ] **Step 4: 实现页面和提交保护。**

  每个作业一次选择仓库/供应商（入库可选），扫码持续累积清单，显示可用库存和差异。提交时使用已有 `runWithSubmissionLock` 等价的移动端 helper，成功后清空本地表单和失效库存查询；失败时保留清单并显示后端错误。

- [ ] **Step 5: 运行测试和仓库验收。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand inventoryOperationModel inventoryApi scannerDeduplication
  cd mobile && npm run typecheck && npm run lint
  ```

  手工步骤：分别做 1 次批量入库、出库、盘点和调拨；在 Web 库存流水中核对每次只产生一条对应批量业务记录，重复点击提交不得重复变动。

---

## Phase 4 — 配送、拍照、签名、收款与退货

### Task 13: 实现配送任务 API、签收媒体管线和签名上传

**Files:**
- Create: `mobile/src/api/delivery.ts`
- Modify: `mobile/src/api/upload.ts`
- Modify: `mobile/src/platform/media/validateImage.ts`
- Create: `mobile/src/platform/media/prepareUploadImage.ts`
- Modify: `mobile/src/platform/signature/createSignatureExporter.ts`
- Create: `mobile/src/features/delivery/deliverySignModel.ts`
- Create: `mobile/src/__tests__/deliverySignModel.test.ts`
- Create: `mobile/src/__tests__/prepareUploadImage.test.ts`

- [ ] **Step 1: 写媒体和签收失败测试。**

  ```ts
  expect(validateSignPayload({ signerName: '', proofImageUrls: ['https://x/proof.jpg'], signatureImageUrl: 'https://x/sign.png' })).toEqual('请填写签收人姓名');
  expect(validateSignPayload({ signerName: '张三', proofImageUrls: [], signatureImageUrl: 'https://x/sign.png' })).toEqual('请至少拍摄一张现场照片');
  expect(validateSignPayload({ signerName: '张三', proofImageUrls: ['https://x/proof.jpg'], signatureImageUrl: null })).toEqual('请完成手写签名');
  await expect(prepareUploadImage(tooLargeImage)).resolves.toEqual(expect.objectContaining({ size: expect.any(Number) }));
  ```

- [ ] **Step 2: 运行测试，确认失败。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand deliverySignModel prepareUploadImage signatureExport upload
  ```

  Expected: `FAIL`。

- [ ] **Step 3: 实现图片准备和上传。**

  `prepareUploadImage` 在上传前验证 JPEG/PNG/WebP、压缩并校验小于等于 10 MB；压缩失败或仍超限时返回可读错误，不上传。签名导出后必须经同一上传 API 使用 `prefix=delivery-signatures` 上传，返回 URL；现场照片使用 `prefix=delivery-proofs`，付款凭证使用 `prefix=payment-proofs`。

- [ ] **Step 4: 实现配送 API 和签收模型。**

  API 覆盖 `/deliveries/current`、`/deliveries/{id}/sign`、`/deliveries/{id}/exception`、`/deliveries/{id}/returnable-items`、`/return-orders`。`sign` 请求传 `signer_name`、`proof_image_urls`、`signature_image_url`、`remark`、`collect_payment`、`paid_amount`、`payment_proof_image_urls`。只有所有上传成功、姓名/照片/签名齐全，签收提交按钮才可用。

- [ ] **Step 5: 运行测试。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand deliverySignModel prepareUploadImage signatureExport upload
  cd mobile && npm run typecheck && npm run lint
  ```

  Expected: `PASS`。

### Task 14: 实现配送任务、签收、收款、异常和现场退货页面

**Files:**
- Create: `mobile/src/features/delivery/DeliveryListScreen.tsx`
- Create: `mobile/src/features/delivery/DeliveryDetailScreen.tsx`
- Create: `mobile/src/features/delivery/DeliverySignScreen.tsx`
- Create: `mobile/src/features/delivery/DeliveryExceptionSheet.tsx`
- Create: `mobile/src/features/delivery/ReturnOrderScreen.tsx`
- Create: `mobile/src/__tests__/deliveryActionPermissions.test.ts`
- Create: `mobile/src/__tests__/deliverySignScreen.test.tsx`

- [ ] **Step 1: 写角色和表单失败测试。**

  ```ts
  expect(getDeliveryActions('delivery', true, 'delivering')).toEqual(['sign', 'exception']);
  expect(getDeliveryActions('delivery', false, 'delivering')).toEqual([]);
  expect(screen.getByText('开始手写签名')).toBeTruthy();
  expect(screen.getByRole('button', { name: '确认签收' }).props.disabled).toBe(true);
  ```

- [ ] **Step 2: 运行测试，确认失败。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand deliveryActionPermissions deliverySignScreen
  ```

  Expected: `FAIL`。

- [ ] **Step 3: 实现任务和详情页面。**

  默认查询本人 `delivering` 任务；管理员使用现有服务端过滤能力。详情展示客户收货信息、订单项、异常记录、退货入口和“导航”按钮；导航只调用系统地图 URL，不记录或上传实时定位。

- [ ] **Step 4: 实现签收与收款。**

  页面顺序固定：填写签收人 → 拍摄至少一张照片 → 连续手写签名 → 可选开启收款并填写金额/拍付款凭证 → 上传全部媒体 → 调用 sign API。上传中和请求中均禁用重复提交；任一上传失败保留本地表单及成功 URL，允许只重试失败项。

- [ ] **Step 5: 实现异常和退货。**

  异常类型沿用后端枚举；选择 `other` 时强制备注。退货页先调用 `returnable-items`，再选择数量、品相、原因、是否入库和入库仓库，调用既有 `createReturnOrder`。无可退数量时禁用提交。

- [ ] **Step 6: 运行自动化与真机验收。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand deliveryActionPermissions deliverySignScreen deliverySignModel
  cd mobile && npm run typecheck && npm run lint
  cd mobile/android && ./gradlew app:assembleDebug -x lint
  ```

  Android 真机步骤：进入本人配送任务 → 连续写签名 → 拍摄现场照片 → 上传并签收 → 在 Web 配送详情确认照片和独立签名都回显 → 再用一张任务执行收款和付款凭证 → 验证订单状态与实收金额。iOS 执行同一流程；Harmony 对扫码、照片、签名、安全存储和上传分别记录通过/失败。

---

## Phase 5 — 端到端回归、文档与发布检查

### Task 15: 补齐端到端契约、构建矩阵和运行文档

**Files:**
- Modify: `mobile/README.md`
- Modify: `docs/superpowers/specs/2026-07-22-bulkdesk-mobile-design.md`
- Create: `docs/mobile-acceptance-checklist.md`
- Modify: `mobile/android/app/src/main/AndroidManifest.xml`（仅在新增原生库要求额外权限时）
- Modify: `mobile/ios/BulkDeskMobilePoc/Info.plist`（仅在新增原生库要求额外说明时）
- Test: `backend/tests/test_mobile_draft_contract.py`
- Test: `mobile/src/__tests__/`

- [ ] **Step 1: 写验收清单和失败闭环测试。**

  在 `docs/mobile-acceptance-checklist.md` 列出以下不可跳过项：角色越权、两客户草稿切换、接手冲突、幂等提交、四类库存作业、真实二维码/条形码、真实拍照、连续签名、照片/签名回显、收款、异常、退货、登录/退出、Android/iOS/Harmony 能力矩阵。为每项标记自动化测试名或手工步骤。

- [ ] **Step 2: 更新运行文档。**

  `mobile/README.md` 写明：

  ```bash
  npm start
  npm run android
  npm run ios
  npm run harmony:assemble
  npm test -- --runInBand
  npm run typecheck
  npm run lint
  ```

  同时说明通过环境变量/本地配置注入 API Base URL，不能把生产 Token、MinIO 密钥或局域网地址提交到仓库。

- [ ] **Step 3: 执行后端完整验证。**

  Run:

  ```bash
  cd backend && PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app
  cd backend && uv run pytest
  ```

  Expected: `PASS`。

- [ ] **Step 4: 执行移动端完整验证。**

  Run:

  ```bash
  cd mobile && npm test -- --runInBand
  cd mobile && npm run typecheck
  cd mobile && npm run lint
  cd mobile/android && ./gradlew app:assembleDebug -x lint
  cd mobile && npm run ios -- --simulator
  cd mobile && npm run harmony:assemble
  ```

  Expected: Android/iOS 构建和全部 JS 校验通过；Harmony 的构建结果和原生能力矩阵单独记录。若现有环境/第三方依赖造成无关失败，保留原始输出、说明影响范围，不修改无关代码。

- [ ] **Step 5: 执行数据库与真实设备最终验收。**

  使用 DBX 查询确认草稿、事件、submission、配送签名 URL 和库存锁定记录；按验收清单在 Android 真机、iOS 模拟器/真机、Harmony 设备（如可用）执行。确认每个媒体对象已上传到 MinIO 后再关闭测试任务。

---

## 计划自检映射

| 设计需求 | 对应任务 |
| --- | --- |
| 角色化导航、工作台、客户只读查询 | Task 6、8、9 |
| 多客户草稿、自动保存、接手、版本冲突 | Task 2、3、5、10、11 |
| 提交时重算价格并锁库、幂等提交 | Task 4、5、11 |
| 扫码入/出/盘/调 | Task 9、12 |
| 配送照片、连续手写签名、收款、异常、退货 | Task 2、3、7、13、14 |
| Web 回显签名、历史兼容 | Task 2、3、7 |
| Android/iOS 优先、Harmony 单独验收 | Task 8、14、15 |
| 迁移执行、完整测试、手工真机验收 | Task 2、15 |

## 执行顺序与检查点

1. 完成 Task 1–7 后，先完成一次后端代码审查和数据库迁移确认；此时不开始移动端订单页面。
2. 完成 Task 8–9 后，在 Android/iOS 上确认登录、会话恢复、角色导航、客户查询和真实条码/二维码查询。
3. 完成 Task 10–11 后，进行两账号草稿接手和一次真实库存锁定验证。
4. 完成 Task 12 后，使用测试仓库完成四种库存操作回归。
5. 完成 Task 13–14 后，在真实配送任务上采集照片和连续签名，并核对 Web 回显。
6. 仅在 Task 15 全部验证通过、DBX schema/数据确认完成且验收清单无阻断项时，向用户报告可发布状态。

本计划刻意不包含 Git 提交步骤，遵循当前协作约束。实施时每个任务都应先补齐/调整测试，再写最小实现，并在该任务的验证命令通过后继续下一项。
