# 品牌/供应商管理页面 + SKU价格走势 实施计划

> **给代理工人：** 必备技能：使用 superpowers:subagent-driven-development 或 superpowers:executing-plans 按任务逐步执行。

**目标：** 1) 品牌从自由文本改为独立实体+管理页面，商品表单改为下拉选择；2) 供应商添加前端管理页面；3) SKU编辑弹窗中用折线图展示价格变更历史。

**架构：** 品牌新增后端完整 CRUD + 前端管理页；供应商仅前端管理页（后端已有）；价格走势用 `@ant-design/charts` 折线图嵌入 SKU 编辑弹窗。

**技术栈：** SQLAlchemy 2.0 + Alembic（后端），Ant Design Pro + ProComponents + @ant-design/charts（前端）

---

## 变更文件一览

| 文件 | 操作 | 说明 |
|---|---|---|
| `backend/app/models/product.py` | 修改 | 新增 Brand 模型；Product.brand 改为 FK→brands.id |
| `backend/app/models/__init__.py` | 修改 | 导出 Brand, BrandStatus |
| `backend/app/schemas/product.py` | 修改 | 新增 BrandCreate/Update/Out；ProductCreate/Update/Out 的 brand 改为 brand_id；ProductOut 增加 brand_name |
| `backend/app/services/product_service.py` | 修改 | 新增品牌 CRUD；_populate_product_out 填充 brand_name；create/update_product 改用 brand_id |
| `backend/app/api/v1/product.py` | 修改 | 新增品牌 API 路由 |
| `backend/migrations/versions/<新>.py` | 新建 | brands 表 + products.brand_id FK + 数据迁移(brand字符串→brand_id) |
| `frontend/src/services/product.ts` | 修改 | 新增品牌 API；createProduct/updateProduct 改用 brand_id |
| `frontend/src/services/inventory.ts` | 无变更 | 供应商 API 已有 |
| `frontend/src/pages/Product/index.tsx` | 修改 | 商品表单 brand 改为下拉选择；SKU编辑弹窗添加价格走势折线图 |
| `frontend/src/pages/System/brands/index.tsx` | 新建 | 品牌管理页面（ProTable + ModalForm CRUD） |
| `frontend/src/pages/Inventory/suppliers/index.tsx` | 新建 | 供应商管理页面（ProTable + ModalForm CRUD） |
| `frontend/config/routes.ts` | 修改 | 系统设置加品牌路由；库存管理加供应商路由 |
| `frontend/package.json` | 修改 | 添加 @ant-design/charts 依赖 |

---

### 任务 1：后端品牌模型 + Schema + Service + API

**文件：** `backend/app/models/product.py`, `backend/app/models/__init__.py`, `backend/app/schemas/product.py`, `backend/app/services/product_service.py`, `backend/app/api/v1/product.py`

- [ ] **步骤 1：新增 Brand 模型**

在 `backend/app/models/product.py` 中，`ProductCategory` 类之后添加：

```python
class BrandStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"


class Brand(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "brands"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    status: Mapped[BrandStatus] = mapped_column(
        Enum(BrandStatus, name="brand_status", native_enum=True),
        default=BrandStatus.active,
        nullable=False,
    )
```

修改 `Product` 类：`brand` 从 `String(100)` 改为 FK：

```python
    brand_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("brands.id"), nullable=True
    )
```

删除原来的 `brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)` 行。

- [ ] **步骤 2：更新 models/__init__.py**

添加 `Brand`, `BrandStatus` 到 import 和 `__all__`。

- [ ] **步骤 3：新增 Brand Schema + 修改 Product Schema**

在 `backend/app/schemas/product.py` 中新增：

```python
class BrandCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    logo_url: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = Field(None, max_length=255)
    sort_order: int = 0
    status: BrandStatus = BrandStatus.active


class BrandUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    logo_url: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = Field(None, max_length=255)
    sort_order: Optional[int] = None
    status: Optional[BrandStatus] = None


class BrandOut(BaseModel):
    id: str
    name: str
    logo_url: Optional[str]
    description: Optional[str]
    sort_order: int
    status: BrandStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)
```

修改 Product Schema：
- `ProductCreate`: `brand` → `brand_id: Optional[str] = None`
- `ProductUpdate`: `brand` → `brand_id: Optional[str] = None`
- `ProductOut`: `brand` → `brand_id: Optional[str] = None` + `brand_name: Optional[str] = None`

需要 import `BrandStatus`。

- [ ] **步骤 4：品牌 Service + 修改 Product Service**

在 `backend/app/services/product_service.py` 中新增品牌 CRUD（与分类一致的模式）：

```python
from app.models.product import Brand, BrandStatus

async def create_brand(db: AsyncSession, req: BrandCreate) -> BrandOut:
    brand = Brand(name=req.name, logo_url=req.logo_url, description=req.description, sort_order=req.sort_order, status=req.status)
    db.add(brand)
    await db.flush()
    await db.refresh(brand)
    return BrandOut.model_validate(brand)

async def list_brands(db, page=1, page_size=20) -> PaginatedResponse[BrandOut]:
    # 标准 list 模式，同 list_categories

async def update_brand(db, brand_id, req: BrandUpdate) -> BrandOut:
    # 标准 update 模式
```

修改 `_populate_product_out`：在填充 category 信息之后，增加品牌名称填充：

```python
    if product.brand_id:
        brand_result = await db.execute(select(Brand.name).where(Brand.id == product.brand_id))
        out.brand_name = brand_result.scalar_one_or_none()
```

修改 `create_product`：`brand=req.brand` → `brand_id=req.brand_id`

修改 `list_products`：批量填充 brand_name（与 category_names 同模式）。

- [ ] **步骤 5：品牌 API 路由**

在 `backend/app/api/v1/product.py` 的 Categories 路由组之前添加品牌路由（POST/GET/PUT /brands）。

---

### 任务 2：数据库迁移（品牌表 + brand_id FK）

**文件：** 新建 migration

- [ ] **步骤 1：生成 migration**

`alembic revision --autogenerate -m "add_brands_table_and_product_brand_id"`

- [ ] **步骤 2：数据迁移 — products.brand 字符串 → brands 表 + brand_id**

在 migration 的 upgrade() 中，在添加 `products.brand_id` 列之后、删除 `products.brand` 列之前：

1. 创建 brands 表（autogenerate 已生成）
2. 添加 `products.brand_id` 列（nullable=True）
3. 数据迁移：提取所有不重复的 brand 名称，插入 brands 表，然后更新 products.brand_id
4. 设置 `products.brand_id` 为 nullable=False（可选，保持 nullable 也行）
5. 删除 `products.brand` 列

```python
    # 数据迁移
    conn = op.get_bind()
    # 提取所有不重复的品牌名称
    brand_names = conn.execute(
        sa.text("SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != ''")
    ).fetchall()

    # 插入 brands 表
    from uuid import uuid4
    brand_map = {}
    for (name,) in brand_names:
        brand_id = uuid4()
        conn.execute(
            sa.text("INSERT INTO brands (id, name, sort_order, status, created_at, updated_at) VALUES (:id, :name, 0, 'active', now(), now())"),
            {"id": str(brand_id), "name": name}
        )
        brand_map[name] = str(brand_id)

    # 更新 products.brand_id
    for name, bid in brand_map.items():
        conn.execute(
            sa.text("UPDATE products SET brand_id = :bid WHERE brand = :name"),
            {"bid": bid, "name": name}
        )

    # 删除旧 brand 列
    op.drop_column('products', 'brand')
```

- [ ] **步骤 3：执行 migration + 验证**

---

### 任务 3：前端品牌/供应商管理页面 + 路由

**文件：** 新建2个页面 + 修改路由 + 修改 product.ts

- [ ] **步骤 1：安装 @ant-design/charts**

`cd frontend && npm install @ant-design/charts`

- [ ] **步骤 2：新建品牌管理页面**

新建 `frontend/src/pages/System/brands/index.tsx`，模式与 `warehouses/index.tsx` 完全一致（ProTable + ModalForm CRUD），字段：name, logo_url, description, sort_order, status。

- [ ] **步骤 3：新建供应商管理页面**

新建 `frontend/src/pages/Inventory/suppliers/index.tsx`，模式与 warehouses 一致，字段：name, contact_person, contact_phone, address, remark, status。

- [ ] **步骤 4：添加路由**

修改 `frontend/config/routes.ts`：

在 system 路由组中添加品牌：
```typescript
{ path: '/system/brands', name: 'brands', component: './System/brands' },
```

在 inventory 路由组中添加供应商：
```typescript
{ path: '/inventory/suppliers', name: 'suppliers', access: 'canAdmin', component: './Inventory/suppliers' },
```

- [ ] **步骤 5：更新 product.ts 服务**

新增品牌 API：
```typescript
export async function listBrands(params?: { page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData>>('/api/v1/products/brands', { method: 'GET', params });
}
export async function createBrand(data: { name: string; logo_url?: string; description?: string; sort_order?: number; status?: string }) {
  return request<API.ResponseBase>('/api/v1/products/brands', { method: 'POST', data });
}
export async function updateBrand(id: string, data: { name?: string; logo_url?: string; description?: string; sort_order?: number; status?: string }) {
  return request<API.ResponseBase>(`/api/v1/products/brands/${id}`, { method: 'PUT', data });
}
```

修改 createProduct/updateProduct 参数：`brand` → `brand_id`。

---

### 任务 4：商品表单品牌改为下拉 + SKU价格走势折线图

**文件：** `frontend/src/pages/Product/index.tsx`

- [ ] **步骤 1：品牌改为下拉选择**

1. 添加 `listBrands` import 和 `brands` state
2. useEffect 加载品牌列表（与 categories 同模式）
3. 新建/编辑商品 ModalForm 中，`brand` 的 `ProFormText` 改为 `ProFormSelect`：

```typescript
<ProFormSelect
  name="brand_id"
  label="品牌"
  options={brandOptions}
  showSearch
/>
```

4. ProductRecord 接口：`brand` → `brand_id`, `brand_name`
5. 商品列表品牌列：`dataIndex` 改为 `brand_name`

- [ ] **步骤 2：SKU 编辑弹窗添加价格走势折线图**

在 SKU 编辑 ModalForm 中，在所有表单字段之后添加折线图区域：

```typescript
{currentVariant && (
  <ProForm.Item label="价格走势">
    <PriceTrendChart skuId={currentVariant.id} />
  </ProForm.Item>
)}
```

新建 `PriceTrendChart` 组件（在同一文件或单独文件中）：

```typescript
import { Line } from '@ant-design/charts';

const PriceTrendChart: React.FC<{ skuId: string }> = ({ skuId }) => {
  const [data, setData] = useState<{ date: string; value: number; type: string }[]>([]);

  useEffect(() => {
    if (!skuId) return;
    listPriceChangeLogs({ sku_id: skuId, page: 1, page_size: 100 }).then(res => {
      if (res.code !== 0) return;
      const logs = res.data.items;
      // 构建折线图数据：每个变更点作为数据点
      const priceData = logs
        .filter((l: any) => l.field === 'price')
        .map((l: any) => ({ date: l.created_at?.slice(0, 10), value: Number(l.new_value), type: '售价' }));
      const costData = logs
        .filter((l: any) => l.field === 'cost_price')
        .map((l: any) => ({ date: l.created_at?.slice(0, 10), value: Number(l.new_value), type: '成本价' }));
      setData([...priceData, ...costData]);
    });
  }, [skuId]);

  if (data.length === 0) return <span style={{ color: '#999' }}>暂无价格变更记录</span>;

  return (
    <Line
      data={data}
      xField="date"
      yField="value"
      colorField="type"
      smooth
      height={200}
    />
  );
};
```

---

### 任务 5：端到端验证

- [ ] 后端启动无错误
- [ ] 品牌 CRUD API 测试（创建/列表/更新）
- [ ] 商品创建带 brand_id 测试
- [ ] 前端品牌管理页面（CRUD）
- [ ] 前端供应商管理页面（CRUD）
- [ ] 商品表单品牌下拉选择
- [ ] SKU 编辑弹窗价格走势折线图
- [ ] 控制台无错误
