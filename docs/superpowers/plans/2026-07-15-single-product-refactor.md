# 单一商品模型重构实施计划

> **给执行者：** 实施时按任务顺序逐项完成；每个任务完成后先运行其指定验证，再进入下一项。本计划不要求创建 Git 提交，除非用户另行要求。

**目标：** 移除 SPU、SKU、多规格和多级分类模型，让 `Product` 成为库存、订单、会员价和价格审计唯一关联的可交易商品实体。

**架构：** 商品资料、标准售价和成本价收敛至 `products` 表；客户等级会员价保留在以 `product_id + level_id` 唯一的独立表中。库存、库存流水、订单行、会员价和价格日志全部以 `product_id` 建立外键与接口字段，历史单据继续保存商品名称、条形码和价格快照。分类改为平级基础资料，移除父级和排序属性。

**技术栈：** Python 3.12、FastAPI、SQLAlchemy async、Alembic、PostgreSQL、React 19、Umi Max 4、Ant Design 6、ProComponents 3、Vitest、Pytest。

---

## 一、最终数据契约

### 1. 商品 `products`

| 字段 | 类型与约束 | 业务含义 |
|---|---|---|
| `id` | UUID 主键 | 唯一内部标识；不增加内部商品编码 |
| `name` | `varchar(200)`，必填 | 商品全名 |
| `short_name` | `varchar(100)`，可空 | 列表与单据的简称 |
| `barcode` | `varchar(50)`，必填、唯一 | 国家/行业条形码，扫码识别值 |
| `category_id` | UUID，必填，外键 `categories.id` | 单一平级分类 |
| `brand_id` | UUID，可空，外键 `brands.id` | 品牌 |
| `specification` | `varchar(200)`，可空 | 单规格描述，例如“500ml”“10kg/袋” |
| `unit` | `varchar(20)`，必填 | 基础计量单位 |
| `standard_price` | `numeric(12,2)`，必填，非负 | 标准售价 |
| `cost_price` | `numeric(12,2)`，必填，非负 | 当前成本价 |
| `image_urls` | JSON，可空 | 商品图片列表 |
| `description` | Text，可空 | 商品说明 |
| `status` | `active` / `disabled` | 销售状态：在售/停售 |
| `created_at` / `updated_at` | 时间戳 | 审计时间 |

明确删除：`sort_order`、`base_price`、商品多分类关系、`ProductVariant`、SKU 编码、SKU 条码、SKU 图片、划线价、规格及 SKU-规格关联。

### 2. 分类与价格关联

- `categories` 仅保留 `id`、`name`、`status`、创建/更新时间；名称全局唯一，不包含 `parent_id`、`sort_order`、父子关系。
- `member_prices` 改为 `product_id`、`level_id`、`price`、创建/更新时间，并保留 `(product_id, level_id)` 唯一约束。
- `price_change_logs` 改为 `product_id`、`price_type`、`level_id`（仅会员价必填）、`old_value`、`new_value`、`reason`、`operator_id`、`operator_name`、`created_at`。
- `price_type` 固定为 `standard_price`、`cost_price`、`member_price`。任何创建或变更这三种价格的操作都必须有非空原因并写日志。

### 3. 商品状态规则

- `active` 商品可以创建销售订单，也可以进行任何库存操作。
- `disabled` 商品禁止创建新的销售订单，但仍允许入库、出库、调拨、盘点等库存操作；历史库存、流水和订单允许查询。
- 库存服务只校验商品存在，不以销售状态拒绝库存操作；订单服务在创建订单时校验商品必须为 `active`。
- 订单、库存流水必须存储商品名、条形码、价格等快照，商品后续修改不能改写历史单据。

## 二、文件与职责清单

| 文件 | 改动职责 |
|---|---|
| `backend/app/models/product.py` | 定义平级分类、单一商品、会员价/价格日志外键与枚举 |
| `backend/app/models/inventory.py` | 将库存与库存流水项目的 `sku_*` 字段改为 `product_*` |
| `backend/app/models/order.py` | 将订单行外键和历史快照字段改为商品语义 |
| `backend/app/models/customer.py` | 将会员价关联改为 `product_id` |
| `backend/app/schemas/product.py` | 重新定义商品、分类、价格和会员价请求/响应契约 |
| `backend/app/schemas/inventory.py` | 将全部请求/响应字段替换为 `product_id`、`product_name`、`barcode` |
| `backend/app/schemas/order.py` | 将订单请求/响应字段替换为商品语义 |
| `backend/app/schemas/customer.py` | 将会员价请求/响应字段替换为商品语义 |
| `backend/app/services/product_service.py` | 商品、平级分类、价格调整与审计逻辑 |
| `backend/app/services/inventory_service.py` | 按商品校验、查询、锁定库存和写入商品快照 |
| `backend/app/services/order_service.py` | 商品选价、库存锁定、发货和取消恢复 |
| `backend/app/services/customer_service.py` | 商品会员价读写与回退逻辑 |
| `backend/app/api/v1/product.py` | 删除 SKU API，提供商品价格与会员价 API |
| `backend/app/api/v1/spec.py` | 删除该路由并从主路由注册中移除 |
| `backend/app/api/v1/router.py` | 取消规格路由挂载 |
| `backend/migrations/init.sql` | 更新唯一初始化数据库结构 |
| `backend/migrations/versions/75f80d2c9c04_initial_schema.py` | 与 `init.sql` 同步的唯一 Alembic 初始化 revision |
| `frontend/src/services/product.ts` | 商品、平级分类、价格、会员价服务契约 |
| `frontend/src/services/inventory.ts` | 所有 `sku_*` 参数和响应类型改为 `product_*` |
| `frontend/src/services/order.ts` | 下单商品参数与响应类型切换 |
| `frontend/src/services/customer.ts` | 会员价服务切换为 `product_id` |
| `frontend/src/services/system.ts` | 删除规格服务 |
| `frontend/src/pages/Product/index.tsx` | 改为单商品列表、基础资料编辑、价格管理抽屉 |
| `frontend/src/pages/Product/priceLogs/index.tsx` | 展示商品维度三类价格日志 |
| `frontend/src/pages/System/categories/index.tsx` | 改为平级分类 CRUD |
| `frontend/src/pages/System/specs/index.tsx` | 删除 |
| `frontend/src/pages/Inventory/**` | 选品、展示和提交载荷全部使用商品 |
| `frontend/src/pages/Order/index.tsx` | 商品选取、价格展示和订单行改为商品 |
| `frontend/config/routes.ts` | 删除规格管理路由 |
| `frontend/src/locales/zh-CN/menu.ts` | 删除规格管理菜单文本 |
| `frontend/src/typings.d.ts` | 移除 SKU 语义并补齐新 API 类型 |
| `docs/modules/product.md` | 更新为单一商品模型说明 |
| `FEATURES.md` | 删除 SKU/规格功能与接口说明，更新商品功能清单 |

## 三、执行任务

### 任务 1：先建立单一商品行为的回归测试

**文件：**
- 修改：`backend/tests/test_business_logic.py`
- 新建或修改：`frontend/src/pages/Product/productState.test.ts`
- 新建或修改：`frontend/src/services/product.test.ts`

- [ ] 编写后端测试：创建订单时按 `product_id` 查询库存和会员价；未配置会员价时使用 `standard_price`，已配置时使用指定等级的 `member_price`。
- [ ] 编写后端测试：停售商品不能创建订单，但可以执行入库、出库、调拨和盘点；历史订单状态流转不受影响。
- [ ] 编写后端测试：创建商品初始价格、调整标准售价、调整成本价、创建/调整会员价均要求原因，并各自产生正确的价格日志。
- [ ] 编写前端测试：商品编辑提交不得携带价格；价格管理操作必须在原因为空时阻止提交；会员价请求使用 `product_id`。
- [ ] 先运行目标测试，确认它们因现有 `sku_id`/SKU 模型而失败：

```bash
cd backend && uv run pytest tests/test_business_logic.py -q
cd frontend && npm run test -- --run src/pages/Product/productState.test.ts src/services/product.test.ts
```

**验收：** 测试名称、断言和错误描述均只使用“商品/product”，不再出现 SKU 作为业务主语。

### 任务 2：重建数据库初始化模型与 ORM 实体

**文件：**
- 修改：`backend/app/models/product.py`
- 修改：`backend/app/models/inventory.py`
- 修改：`backend/app/models/order.py`
- 修改：`backend/app/models/customer.py`
- 修改：`backend/app/models/__init__.py`
- 修改：`backend/migrations/init.sql`
- 修改：`backend/migrations/versions/75f80d2c9c04_initial_schema.py`

- [ ] 删除 `ProductVariant`、`Spec`、`VariantSpec`、`ProductCategory` 模型及关联关系；删除对应枚举。
- [ ] 将 `Category` 收敛为 `name`、`status` 与时间戳，增加 `name` 唯一约束，移除 `parent_id`、`sort_order` 和父子关系。
- [ ] 将 `Product` 替换为本计划“最终数据契约”的字段：特别是必填唯一 `barcode`、必填单一 `category_id`、`specification`、`short_name`、`standard_price`、`cost_price`；不保留 `sort_order` 与 `base_price`。
- [ ] 将库存表唯一约束改为 `(product_id, warehouse_id)`；全部 `sku_id` 外键改指向 `products.id`。
- [ ] 将库存流水项目、订单行、会员价、价格日志的字段和外键统一为 `product_id`；快照列统一命名为 `product_name`、`barcode`。
- [ ] 将价格日志枚举替换为三种 `price_type`，增加可空 `level_id`、必填 `reason`、可空 `operator_id` 和 `operator_name`。
- [ ] 在 `init.sql` 和唯一 Alembic 初始化 revision 中同步创建/删除所有上述表、外键、唯一约束和枚举，避免新增零散历史 migration。
- [ ] 运行模型语法检查：

```bash
cd backend && PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app
```

**验收：** 全库不存在 `product_variants`、`variant_specs`、`specs`、`product_categories`、`sku_id`、`sku_code` 外键或表定义。

### 任务 3：收敛商品、分类和定价服务及 API

**文件：**
- 修改：`backend/app/schemas/product.py`
- 修改：`backend/app/schemas/customer.py`
- 修改：`backend/app/services/product_service.py`
- 修改：`backend/app/services/customer_service.py`
- 修改：`backend/app/api/v1/product.py`
- 删除：`backend/app/schemas/spec.py`
- 删除：`backend/app/services/spec_service.py`
- 删除：`backend/app/api/v1/spec.py`
- 修改：`backend/app/api/v1/router.py`

- [ ] 定义 `ProductCreate`：要求 `name`、`barcode`、`category_id`、`unit`、`standard_price`、`cost_price`、`price_reason`；校验条形码唯一、分类存在且启用、品牌存在且启用。
- [ ] 定义 `ProductUpdate`：只允许修改基础资料和 `status`，不包含任何价格字段；禁用商品前检查并返回明确业务错误，不让数据库异常直接暴露。
- [ ] 定义三个价格命令：标准售价调整、成本价调整、会员价设置；均含非空 `reason`，会员价命令包含 `level_id`。
- [ ] 在一个私有价格服务入口内执行“读取旧价 → 写新价/会员价 → 追加价格日志”，确保每次写价都不会漏审计；会员价首次设置的 `old_value` 使用 `NULL`。
- [ ] 提供平级分类 CRUD：创建、更新、列表均不接受 `parent_id` 和 `sort_order`；删除分类前拒绝仍被商品引用的分类。
- [ ] 移除所有 SKU、规格绑定和 SKU 价格接口；提供商品维度价格路由：

```text
PUT /api/v1/products/{product_id}/standard-price
PUT /api/v1/products/{product_id}/cost-price
PUT /api/v1/products/{product_id}/member-prices/{level_id}
GET /api/v1/products/{product_id}/price-change-logs
```

- [ ] 保持写操作使用 `AdminUser`，读取接口使用登录用户；业务错误统一转换为既有 `ResponseBase` 错误结构。
- [ ] 运行商品与客户相关测试：

```bash
cd backend && uv run pytest tests/test_business_logic.py -q
```

**验收：** 价格不能通过普通商品 `PUT` 绕过原因和日志；不存在任何 `/products/variants` 或 `/specs` 路由。

### 任务 4：将库存与订单交易链路切换为商品

**文件：**
- 修改：`backend/app/schemas/inventory.py`
- 修改：`backend/app/schemas/order.py`
- 修改：`backend/app/services/inventory_service.py`
- 修改：`backend/app/services/order_service.py`
- 修改：`backend/app/api/v1/inventory.py`
- 修改：`backend/app/api/v1/order.py`

- [ ] 将全部库存操作请求的 `sku_id` 改为 `product_id`：入库、出库、调拨、盘点、库存列表筛选和库存预警。
- [ ] 将库存服务的“查找 SKU 信息”私有函数替换为“查找商品信息”，读取商品名称、条形码、品牌并只拒绝不存在的商品；销售状态不参与库存操作校验。
- [ ] 将库存流水项目改为写入 `product_id`、`product_name`、`barcode`、数量和变动前后库存；不再写 SKU 编码/名称。
- [ ] 将订单创建项改为 `product_id + quantity`，以会员等级价优先、标准售价回退的顺序计算单价，并将商品名、条形码、结算单价写入订单行快照。
- [ ] 保留现有库存锁定、发货扣减、取消释放/恢复的守恒逻辑，只替换关联对象与输出字段，不改变订单状态机 `placed -> shipped -> paid -> completed`。
- [ ] 将商品状态校验限定在订单创建：订单仅接受 `active` 商品；入库、出库、调拨和盘点仅校验商品存在。
- [ ] 运行库存与订单重点测试：

```bash
cd backend && uv run pytest tests/test_business_logic.py -q
```

**验收：** 商品从库存操作到订单取消的数量、锁定数和流水完全守恒，且所有 API 返回 `product_*` 字段。

### 任务 5：重做前端商品资料与价格管理界面

**文件：**
- 修改：`frontend/src/services/product.ts`
- 修改：`frontend/src/services/customer.ts`
- 删除：`frontend/src/services/system.ts` 中规格服务
- 修改：`frontend/src/pages/Product/index.tsx`
- 修改：`frontend/src/pages/Product/priceLogs/index.tsx`
- 删除：`frontend/src/pages/Product/variantRelations.ts`
- 删除：`frontend/src/pages/Product/variantRelations.test.ts`
- 新建：`frontend/src/pages/Product/productState.ts`
- 新建：`frontend/src/pages/Product/productState.test.ts`

- [ ] 将前端商品类型改为单一 `ProductRecord`，删除 `VariantRecord`、展开表格、SKU 创建/编辑表单、规格选择、SKU 图片和划线价。
- [ ] 商品列表展示：名称、简称、条形码、分类、品牌、规格说明、单位、标准售价、成本价、状态和图片；搜索至少支持名称、条形码、分类、状态。
- [ ] 商品新建表单要求条形码、分类、单位、标准售价、成本价和初始定价原因；不显示排序、SKU 编码、基础价格、SKU 字段或多分类选择。
- [ ] 商品编辑表单仅维护基础资料与状态；标准售价、成本价和会员价全部移至商品“价格管理”抽屉。
- [ ] 价格管理抽屉提供三个独立提交动作，每个动作都有必填原因；会员价表按客户等级加载、创建和更新，并展示会员价日志。
- [ ] 价格日志页改用商品名称、条形码、价格类型、客户等级（仅会员价）、原值、新值、原因、操作人与时间。
- [ ] 使用页面局部 `productState.ts` 封装“价格请求构造与原因校验”，以单元测试防止把价格字段误混入商品编辑请求。
- [ ] 运行前端商品测试：

```bash
cd frontend && npm run test -- --run src/pages/Product/productState.test.ts src/services/product.test.ts
```

**验收：** 前端网络请求中不再出现 `sku_id`、`sku_code`、`spec_ids`、`base_price` 或 `/variants`。

### 任务 6：切换前端库存、订单、分类与导航

**文件：**
- 修改：`frontend/src/services/inventory.ts`
- 修改：`frontend/src/services/order.ts`
- 修改：`frontend/src/pages/Inventory/stock/index.tsx`
- 修改：`frontend/src/pages/Inventory/operations/index.tsx`
- 修改：`frontend/src/pages/Inventory/movements/index.tsx`
- 修改：`frontend/src/pages/Order/index.tsx`
- 修改：`frontend/src/pages/System/categories/index.tsx`
- 删除：`frontend/src/pages/System/specs/index.tsx`
- 修改：`frontend/config/routes.ts`
- 修改：`frontend/src/locales/zh-CN/menu.ts`
- 修改：`frontend/src/typings.d.ts`

- [ ] 将库存、出入库、调拨、盘点页面的商品选择器统一调用商品列表，并显示“名称 + 条形码 + 规格说明 + 单位”。
- [ ] 将库存、流水、订单行各页面的列名和字段由 SKU 改为商品；订单行使用后端返回的商品价格快照。
- [ ] 将分类管理改为平级列表，仅保留名称与状态；删除父分类选择、层级列和排序输入。
- [ ] 删除规格管理路由、菜单、页面、服务入口和所有引用；删除商品列表的 SKU 展开逻辑。
- [ ] 更新 `API` 声明，保证 `product_id`、`product_name`、`barcode`、`standard_price`、`member_price` 与后端 schema 同名。
- [ ] 运行页面与服务测试，以及前端静态检查：

```bash
cd frontend && npm run test -- --run src/pages/Inventory/operations/inventoryState.test.ts src/pages/Inventory/operations/submission.test.ts src/pages/Order/pricing.test.ts
cd frontend && npm run tsc
cd frontend && npm run biome:lint
```

**验收：** 路由中不存在 `/system/specs`，页面文案与字段均使用“商品”而非“SKU”。

### 任务 7：数据重置/迁移准备与文档收尾

**文件：**
- 修改：`backend/migrations/reset.sql`
- 修改：`docs/modules/product.md`
- 修改：`FEATURES.md`
- 修改：`docs/modules/inventory.md`
- 修改：`docs/modules/order.md`
- 修改：`docs/modules/customer.md`

- [ ] 在执行数据库结构变更前导出并审查现有数据；统计每个原商品的 SKU 数量。
- [ ] 将“一个商品关联多个 SKU”的记录列为阻断项：该记录无法自动无损合并，必须由业务人工决定保留的条形码、规格、成本价和售价后才可导入新结构。
- [ ] 对“恰有一个 SKU”的旧商品制定一次性映射：SKU 条码映射为商品条形码、SKU 名称映射为商品简称或名称、SKU 规格拼接为 `specification`、SKU 售价/成本价映射为商品价格；库存、订单行、会员价和日志关联映射为新商品 ID。
- [ ] 若当前环境允许重置，优先使用更新后的唯一初始化 schema 重新建库并导入清洗数据；不新增零散 Alembic 历史 migration。
- [ ] 更新商品、库存、订单、客户和功能清单文档，删除 SPU/SKU、多规格、多级分类与过期 API 描述。
- [ ] 全量验证：

```bash
cd backend && PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app
cd backend && uv run pytest
cd frontend && npm run tsc
cd frontend && npm run biome:lint
cd frontend && npm run build
```

**验收：** 初始化 SQL、Alembic 初始化 revision、ORM、Pydantic schema、前端服务、页面、测试和文档都只表达单一商品模型。

## 四、实施顺序与风险控制

1. 先完成任务 1 的测试和最终契约确认，再动数据库结构，防止表改完后业务规则没有保护。
2. 任务 2 至任务 4 必须在同一后端变更批次完成；数据库不允许出现一半指向 `sku_id`、一半指向 `product_id` 的中间状态。
3. 任务 5 与任务 6 紧随 API 契约稳定后实施；前端不保留 SKU 参数降级逻辑。
4. 任务 7 的多 SKU 数据属于发布前阻断风险，必须在真实数据迁移前由业务逐条确认；不能静默选择任意一个 SKU。
5. 任何验证失败只修复本次重构直接引入的问题；不顺手修改无关模块。
