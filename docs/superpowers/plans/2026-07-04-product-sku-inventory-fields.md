# 商品 / SKU / 库存 字段扩展实施计划

> **给代理工人：** 必备技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步执行。步骤使用复选框（`- [ ]`）语法追踪。

**目标：** 为商品(Product)、SKU(ProductVariant)、库存(Inventory) 三个实体补充缺失的业务字段，新增供应商(Supplier)实体。会员等级价格保留现有 `MemberPrice` 关联表（已在 `order_service` 中使用，便于查询）。

**架构：** 纯字段扩展，不改业务逻辑。后端 Model → Schema → Service → API 逐层添加；前端 Service → 表单/列表 逐层适配。Alembic migration 一次性处理所有 DDL 变更。不涉及 `member_prices` 表变更。

**技术栈：** SQLAlchemy 2.0 + Alembic（后端），Ant Design Pro + ProComponents（前端）

---

## 变更文件一览

| 文件 | 操作 | 说明 |
|---|---|---|
| `backend/app/models/product.py` | 修改 | 商品添加 brand/unit/barcode/sort_order；SKU添加 barcode/image_url/compare_at_price |
| `backend/app/models/inventory.py` | 修改 | 库存添加 warning_quantity/supplier_id/production_date/expiry_date/location；新增供应商模型 |
| `backend/app/models/__init__.py` | 修改 | 导出 Supplier, SupplierStatus |
| `backend/app/schemas/product.py` | 修改 | ProductCreate/Update/Out 添加新字段；ProductVariantCreate/Update/Out 添加新字段 |
| `backend/app/schemas/inventory.py` | 修改 | InventoryOut 添加新字段；新增供应商 CRUD schemas |
| `backend/app/services/product_service.py` | 修改 | create_product/update_product 传递新字段；create_variant/update_variant 传递新字段 |
| `backend/app/services/inventory_service.py` | 修改 | 新增供应商 CRUD 函数 |
| `backend/app/api/v1/inventory.py` | 修改 | 新增供应商 API 路由 |
| `backend/migrations/versions/<新>.py` | 新建 | 一次性 migration：新增 suppliers 表，products/product_variants/inventory 表添加新列 |
| `frontend/src/services/product.ts` | 修改 | createProduct/updateProduct/createVariant/updateVariant 添加新参数 |
| `frontend/src/services/inventory.ts` | 修改 | 新增供应商相关 API 调用 |
| `frontend/src/pages/Product/index.tsx` | 修改 | 商品表单添加 brand/unit/barcode/sort_order；SKU 表单添加 barcode/image_url/compare_at_price |
| `frontend/src/pages/Inventory/stock/index.tsx` | 修改 | 库存列表添加 warning_quantity/supplier/location/expiry_date 列 |

---

### 任务 1：后端模型变更

**文件：**
- 修改：`backend/app/models/product.py`
- 修改：`backend/app/models/inventory.py`
- 修改：`backend/app/models/__init__.py`

- [ ] **步骤 1：商品模型添加字段**

在 `backend/app/models/product.py` 的 `Product` 类中，`name` 字段之后添加：

```python
class Product(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "products"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    brand: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    barcode: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # ... image_urls, status, categories, variants 保持不变
```

注意：需在文件顶部 import 中确认 `BigInteger` 已导入（当前已有）。

- [ ] **步骤 2：SKU模型添加字段**

在 `backend/app/models/product.py` 的 `ProductVariant` 类中，`cost_price` 之后添加：

```python
class ProductVariant(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "product_variants"

    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("products.id"), nullable=False
    )
    sku_code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    cost_price: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    barcode: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    compare_at_price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    status: Mapped[VariantStatus] = mapped_column(
        Enum(VariantStatus, name="variant_status", native_enum=True),
        default=VariantStatus.active,
        nullable=False,
    )
    # ... product, variant_specs 保持不变
```

注意：会员等级价格保留现有 `MemberPrice` 关联表（`backend/app/models/customer.py`），不在 ProductVariant 上添加 `member_prices` JSON 字段。

- [ ] **步骤 3：库存模型添加字段 + 新增供应商模型**

在 `backend/app/models/inventory.py` 中：

1. 添加 `Date` 到 sqlalchemy import
2. 文件顶部添加 `from datetime import date` （与已有的 `datetime` 并存）
3. 添加 `SupplierStatus` 枚举和 `Supplier` 模型（在 `Warehouse` 类之前）
4. 在 `Inventory` 类中添加新字段
5. 在 `Inventory` 类中添加 `supplier` 关系

完整变更：

```python
# 文件顶部 import 追加 Date
from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
    func,
)

# 文件顶部添加 date 导入
from datetime import date, datetime

# 新增 SupplierStatus 枚举和 Supplier 模型
class SupplierStatus(str, enum.Enum):
    active = "active"
    disabled = "disabled"


class Supplier(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "suppliers"

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_person: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    remark: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[SupplierStatus] = mapped_column(
        Enum(SupplierStatus, name="supplier_status", native_enum=True),
        default=SupplierStatus.active,
        nullable=False,
    )

    inventories: Mapped[list["Inventory"]] = relationship(back_populates="supplier")
```

库存类变更（`locked` 之后添加）：

```python
class Inventory(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "inventory"
    __table_args__ = (
        UniqueConstraint(
            "sku_id", "warehouse_id", name="uq_inventory_sku_warehouse"
        ),
    )

    sku_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("product_variants.id"), nullable=False
    )
    warehouse_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("warehouses.id"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(default=0, nullable=False)
    locked: Mapped[int] = mapped_column(default=0, nullable=False)
    warning_quantity: Mapped[int] = mapped_column(default=0, nullable=False)
    supplier_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("suppliers.id"), nullable=True
    )
    production_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    warehouse: Mapped["Warehouse"] = relationship(back_populates="inventories")
    supplier: Mapped[Optional["Supplier"]] = relationship(back_populates="inventories")
```

- [ ] **步骤 4：更新 models/__init__.py 导出**

在 `backend/app/models/__init__.py` 中：

1. 从 inventory import 中添加 `Supplier`, `SupplierStatus`
2. 在 `__all__` 列表中添加 `"Supplier"`, `"SupplierStatus"`

```python
from app.models.inventory import (
    Inventory,
    InventoryMovement,
    MovementType,
    Supplier,
    SupplierStatus,
    Warehouse,
    WarehouseStatus,
)
```

`__all__` 列表中在 `"Warehouse"` 之前添加 `"Supplier"`, `"SupplierStatus"`。

- [ ] **步骤 5：运行 LSP 诊断确认无类型错误**

运行：`检查 backend/app/models/product.py 和 backend/app/models/inventory.py 的 LSP diagnostics`

---

### 任务 2：后端 Schema 变更

**文件：**
- 修改：`backend/app/schemas/product.py`
- 修改：`backend/app/schemas/inventory.py`

- [ ] **步骤 1：商品 Schema 添加新字段**

在 `backend/app/schemas/product.py` 中：

`ProductCreate` 添加：
```python
class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    brand: Optional[str] = Field(None, max_length=100)
    unit: Optional[str] = Field(None, max_length=20)
    barcode: Optional[str] = Field(None, max_length=50)
    sort_order: int = 0
    category_ids: List[str] = Field(..., min_length=1)
    description: Optional[str] = None
    image_urls: Optional[List[str]] = None
    status: ProductStatus = ProductStatus.active
```

`ProductUpdate` 添加：
```python
class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    brand: Optional[str] = Field(None, max_length=100)
    unit: Optional[str] = Field(None, max_length=20)
    barcode: Optional[str] = Field(None, max_length=50)
    sort_order: Optional[int] = None
    category_ids: Optional[List[str]] = None
    description: Optional[str] = None
    image_urls: Optional[List[str]] = None
    status: Optional[ProductStatus] = None
```

`ProductOut` 添加：
```python
class ProductOut(BaseModel):
    id: str
    name: str
    brand: Optional[str]
    unit: Optional[str]
    barcode: Optional[str]
    sort_order: int
    category_ids: List[str] = []
    category_names: List[str] = []
    description: Optional[str]
    image_urls: Optional[List[str]]
    status: ProductStatus
    created_at: datetime
    updated_at: datetime
    # ... model_config, validators 保持不变
```

- [ ] **步骤 2：SKU Schema 添加新字段**

`ProductVariantCreate` 添加：
```python
class ProductVariantCreate(BaseModel):
    product_id: str
    sku_code: str = Field(..., min_length=1, max_length=100)
    name: str = Field(..., min_length=1, max_length=200)
    price: float = Field(..., ge=0)
    cost_price: float = Field(..., ge=0)
    barcode: Optional[str] = Field(None, max_length=50)
    image_url: Optional[str] = Field(None, max_length=500)
    compare_at_price: Optional[float] = Field(None, ge=0)
    status: VariantStatus = VariantStatus.active
```

`ProductVariantUpdate` 添加：
```python
class ProductVariantUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    price: Optional[float] = Field(None, ge=0)
    cost_price: Optional[float] = Field(None, ge=0)
    barcode: Optional[str] = Field(None, max_length=50)
    image_url: Optional[str] = Field(None, max_length=500)
    compare_at_price: Optional[float] = Field(None, ge=0)
    status: Optional[VariantStatus] = None
```

`ProductVariantOut` 添加：
```python
class ProductVariantOut(BaseModel):
    id: str
    product_id: str
    sku_code: str
    name: str
    specs: List[VariantSpecInfo] = []
    price: float
    cost_price: float
    barcode: Optional[str]
    image_url: Optional[str]
    compare_at_price: Optional[float]
    status: VariantStatus
    created_at: datetime
    updated_at: datetime
    # ... model_config, validators 保持不变
```

注意：会员等级价格使用现有 `MemberPrice` 关联表，不在 SKU Schema 中添加 member_prices 字段。

- [ ] **步骤 3：库存 Schema 添加新字段 + 供应商 Schemas**

在 `backend/app/schemas/inventory.py` 中：

1. 添加 `SupplierStatus` import
2. 新增供应商 CRUD schemas
3. 修改 InventoryOut

```python
from app.models.inventory import MovementType, SupplierStatus
```

新增供应商 schemas：
```python
class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    contact_person: Optional[str] = Field(None, max_length=100)
    contact_phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=255)
    remark: Optional[str] = Field(None, max_length=255)
    status: SupplierStatus = SupplierStatus.active


class SupplierUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    contact_person: Optional[str] = Field(None, max_length=100)
    contact_phone: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = Field(None, max_length=255)
    remark: Optional[str] = Field(None, max_length=255)
    status: Optional[SupplierStatus] = None


class SupplierOut(BaseModel):
    id: str
    name: str
    contact_person: Optional[str]
    contact_phone: Optional[str]
    address: Optional[str]
    remark: Optional[str]
    status: SupplierStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v)
```

修改 `InventoryOut`：
```python
class InventoryOut(BaseModel):
    id: str
    sku_id: str
    warehouse_id: str
    quantity: int
    locked: int
    warning_quantity: int = 0
    supplier_id: Optional[str] = None
    production_date: Optional[str] = None   # 日期，ISO 字符串格式
    expiry_date: Optional[str] = None       # 日期，ISO 字符串格式
    location: Optional[str] = None
    available_quantity: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", "sku_id", "warehouse_id", "supplier_id", mode="before")
    @classmethod
    def uuid_to_str(cls, v):
        return str(v) if v is not None else None
```

- [ ] **步骤 4：运行 LSP 诊断确认无类型错误**

---

### 任务 3：后端 Service 变更

**文件：**
- 修改：`backend/app/services/product_service.py`
- 修改：`backend/app/services/inventory_service.py`

- [ ] **步骤 1：商品 Service 传递新字段**

在 `backend/app/services/product_service.py` 中：

`create_product` 函数中 `Product(...)` 构造改为：
```python
    product = Product(
        name=req.name,
        brand=req.brand,
        unit=req.unit,
        barcode=req.barcode,
        sort_order=req.sort_order,
        description=req.description,
        image_urls=req.image_urls,
        status=req.status,
    )
```

`create_variant` 函数中 `ProductVariant(...)` 构造改为：
```python
    variant = ProductVariant(
        product_id=req.product_id,
        sku_code=req.sku_code,
        name=req.name,
        price=req.price,
        cost_price=req.cost_price,
        barcode=req.barcode,
        image_url=req.image_url,
        compare_at_price=req.compare_at_price,
        status=req.status,
    )
```

注意：`update_product` 和 `update_variant` 使用 `model_dump(exclude_unset=True)` + `setattr` 循环，无需修改，新字段会自动传递。

- [ ] **步骤 2：库存 Service 添加供应商 CRUD**

在 `backend/app/services/inventory_service.py` 中添加供应商的 CRUD 函数，模式与仓库一致：

```python
from app.models.inventory import Inventory, InventoryMovement, MovementType, Supplier, Warehouse
from app.schemas.inventory import (
    # ... 现有 import
    SupplierCreate,
    SupplierOut,
    SupplierUpdate,
)


# --- 供应商 CRUD ---


async def create_supplier(db: AsyncSession, req: SupplierCreate) -> Supplier:
    supplier = Supplier(
        name=req.name,
        contact_person=req.contact_person,
        contact_phone=req.contact_phone,
        address=req.address,
        remark=req.remark,
        status=req.status,
    )
    db.add(supplier)
    await db.flush()
    await db.refresh(supplier)
    return supplier


async def list_suppliers(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
) -> PaginatedResponse[SupplierOut]:
    count_result = await db.execute(select(func.count()).select_from(Supplier))
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    query = (
        select(Supplier)
        .order_by(Supplier.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(query)
    suppliers = result.scalars().all()

    items = [SupplierOut.model_validate(s) for s in suppliers]
    return PaginatedResponse(items=items, total=total, page=page, page_size=page_size)


async def get_supplier(db: AsyncSession, supplier_id: str) -> Supplier:
    result = await db.execute(select(Supplier).where(Supplier.id == supplier_id))
    supplier = result.scalar_one_or_none()
    if supplier is None:
        raise ValueError("Supplier not found")
    return supplier


async def update_supplier(
    db: AsyncSession, supplier_id: str, req: SupplierUpdate
) -> Supplier:
    supplier = await get_supplier(db, supplier_id)
    update_data = req.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(supplier, field, value)
    await db.flush()
    await db.refresh(supplier)
    return supplier
```

- [ ] **步骤 3：运行 LSP 诊断确认无类型错误**

---

### 任务 4：后端 API 变更

**文件：**
- 修改：`backend/app/api/v1/inventory.py`

- [ ] **步骤 1：添加供应商 API 路由**

在 `backend/app/api/v1/inventory.py` 中添加供应商的 import 和路由：

import 追加：
```python
from app.schemas.inventory import (
    # ... 现有 import
    SupplierCreate,
    SupplierOut,
    SupplierUpdate,
)
from app.services.inventory_service import (
    # ... 现有 import
    create_supplier,
    list_suppliers,
    update_supplier,
)
```

路由追加在仓库路由组之前：
```python
# --- 供应商 ---


@router.post(
    "/suppliers",
    response_model=ResponseBase[SupplierOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_sup(
    req: SupplierCreate,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    supplier = await create_supplier(db, req)
    return ResponseBase(data=SupplierOut.model_validate(supplier))


@router.get(
    "/suppliers",
    response_model=ResponseBase[PaginatedResponse[SupplierOut]],
)
async def list_sup(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    result = await list_suppliers(db, page, page_size)
    return ResponseBase(data=result)


@router.put(
    "/suppliers/{supplier_id}",
    response_model=ResponseBase[SupplierOut],
)
async def update_sup(
    supplier_id: str,
    req: SupplierUpdate,
    admin: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    try:
        supplier = await update_supplier(db, supplier_id, req)
        return ResponseBase(data=SupplierOut.model_validate(supplier))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
```

- [ ] **步骤 2：运行 LSP 诊断确认无类型错误**

---

### 任务 5：Alembic 数据库迁移

**文件：**
- 新建：`backend/migrations/versions/<自动>_add_product_sku_inventory_fields_and_suppliers.py`

- [ ] **步骤 1：生成 migration 文件**

运行：`cd backend && alembic revision --autogenerate -m "add_product_sku_inventory_fields_and_suppliers"`

- [ ] **步骤 2：审查生成的 migration**

检查 migration 文件是否包含：
1. `suppliers` 表创建（id, name, contact_person, contact_phone, address, remark, status, created_at, updated_at）
2. `products` 表添加列：brand, unit, barcode, sort_order
3. `product_variants` 表添加列：barcode, image_url, compare_at_price
4. `inventory` 表添加列：warning_quantity, supplier_id(FK→suppliers.id), production_date, expiry_date, location

注意：不应包含 `member_prices` 相关变更（不删除表、不添加 JSON 列）。如 autogenerate 检测到 `member_prices` 表变更（因为 `MemberPrice` 模型可能被误识别），需手动移除相关操作。

如有遗漏或多余，手动修正 migration 文件。

- [ ] **步骤 3：执行 migration**

运行：`cd backend && alembic upgrade head`

- [ ] **步骤 4：验证数据库**

用 psql 或数据库工具确认：
- `suppliers` 表存在
- `products` 表有 brand, unit, barcode, sort_order 列
- `product_variants` 表有 barcode, image_url, compare_at_price 列
- `inventory` 表有 warning_quantity, supplier_id, production_date, expiry_date, location 列
- `member_prices` 表仍然存在（未被删除）

---

### 任务 6：前端 Service 变更

**文件：**
- 修改：`frontend/src/services/product.ts`
- 修改：`frontend/src/services/inventory.ts`

- [ ] **步骤 1：更新 product.ts**

```typescript
// createProduct 参数类型添加 brand, unit, barcode, sort_order
export async function createProduct(data: {
  name: string;
  brand?: string;
  unit?: string;
  barcode?: string;
  sort_order?: number;
  category_ids: string[];
  base_price?: number;
  description?: string;
  status?: string;
  image_urls?: string[];
}) {
  return request<API.ResponseBase>('/api/v1/products', { method: 'POST', data });
}

// updateProduct 参数类型添加
export async function updateProduct(id: string, data: {
  name?: string;
  brand?: string;
  unit?: string;
  barcode?: string;
  sort_order?: number;
  category_ids?: string[];
  base_price?: number;
  description?: string;
  status?: string;
  image_urls?: string[];
}) {
  return request<API.ResponseBase>(`/api/v1/products/${id}`, { method: 'PUT', data });
}

// createVariant 参数类型添加 barcode, image_url, compare_at_price
export async function createVariant(data: {
  product_id: string;
  sku_code: string;
  name: string;
  price: number;
  cost_price?: number;
  barcode?: string;
  image_url?: string;
  compare_at_price?: number;
  status?: string;
}) {
  return request<API.ResponseBase>('/api/v1/products/variants', { method: 'POST', data });
}

// updateVariant 参数类型添加
export async function updateVariant(id: string, data: {
  name?: string;
  price?: number;
  cost_price?: number;
  barcode?: string;
  image_url?: string;
  compare_at_price?: number;
  status?: string;
}) {
  return request<API.ResponseBase>(`/api/v1/products/variants/${id}`, { method: 'PUT', data });
}
```

- [ ] **步骤 2：更新 inventory.ts — 添加供应商 API**

```typescript
// 新增供应商相关 API
export async function listSuppliers(params?: { page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData>>('/api/v1/suppliers', { method: 'GET', params });
}
export async function createSupplier(data: { name: string; contact_person?: string; contact_phone?: string; address?: string; remark?: string; status?: string }) {
  return request<API.ResponseBase>('/api/v1/suppliers', { method: 'POST', data });
}
export async function updateSupplier(id: string, data: { name?: string; contact_person?: string; contact_phone?: string; address?: string; remark?: string; status?: string }) {
  return request<API.ResponseBase>(`/api/v1/suppliers/${id}`, { method: 'PUT', data });
}
```

---

### 任务 7：前端商品页面变更

**文件：**
- 修改：`frontend/src/pages/Product/index.tsx`

- [ ] **步骤 1：更新 ProductRecord / VariantRecord 接口**

```typescript
interface ProductRecord {
  id: string;
  name: string;
  brand?: string;
  unit?: string;
  barcode?: string;
  sort_order?: number;
  category_ids?: string[];
  category_names?: string[];
  base_price?: number;
  description?: string;
  status: string;
  image_urls?: string[];
  variants?: VariantRecord[];
}

interface VariantRecord {
  id: string;
  product_id: string;
  sku_code: string;
  name: string;
  specs?: { id: string; name: string; value: string }[];
  price: number;
  cost_price?: number;
  barcode?: string;
  image_url?: string;
  compare_at_price?: number;
  status: string;
}
```

注意：会员等级价格通过现有 `MemberPrice` 关联表管理（已有独立 API `/api/v1/member-prices`），不在 VariantRecord 中添加 member_prices。

- [ ] **步骤 2：商品列表添加品牌列**

在 `productColumns` 的 `name` 列之后添加：
```typescript
{ title: '品牌', dataIndex: 'brand', width: 100, search: false },
```

- [ ] **步骤 3：新建商品弹窗添加新字段**

在 `createProductOpen` 的 ModalForm 中，`name` 之后添加：
```typescript
<ProFormText name="brand" label="品牌" />
<ProFormSelect
  name="unit"
  label="计量单位"
  options={[
    { label: '个', value: '个' },
    { label: '件', value: '件' },
    { label: '箱', value: '箱' },
    { label: 'kg', value: 'kg' },
    { label: 'L', value: 'L' },
  ]}
/>
<ProFormText name="barcode" label="商品条码" />
<ProFormDigit name="sort_order" label="排序" min={0} initialValue={0} />
```

- [ ] **步骤 4：编辑商品弹窗添加新字段**

在 `editProductOpen` 的 ModalForm 中，同样在 `name` 之后添加与步骤 3 相同的四个字段。

- [ ] **步骤 5：SKU 弹窗添加新字段**

在 `variantModalOpen` 的 ModalForm 中，`cost_price` 之后、`status` 之前添加：
```typescript
<ProFormText name="barcode" label="SKU条码" />
<ProFormText name="image_url" label="SKU图片URL" />
<ProFormDigit
  name="compare_at_price"
  label="原价(划线价)"
  min={0}
  fieldProps={{ precision: 2 }}
/>
```

注意：会员等级价格通过现有 `MemberPrice` 关联表独立管理，SKU 表单中不涉及。

- [ ] **步骤 6：运行 lint 确认无错误**

运行：`cd frontend && npm run lint`

---

### 任务 8：前端库存页面变更

**文件：**
- 修改：`frontend/src/pages/Inventory/stock/index.tsx`

- [ ] **步骤 1：更新 StockRecord 接口**

```typescript
interface StockRecord {
  id: string;
  sku_id: string;
  sku_info?: string;
  warehouse_id: string;
  warehouse_name?: string;
  quantity: number;
  locked: number;
  warning_quantity: number;
  supplier_id?: string;
  supplier_name?: string;
  production_date?: string;
  expiry_date?: string;
  location?: string;
}
```

- [ ] **步骤 2：库存列表添加新列**

在现有列（可用数量之后）添加：
```typescript
{ title: '预警数量', dataIndex: 'warning_quantity', width: 100, search: false },
{ title: '供应商', dataIndex: 'supplier_name', width: 120, search: false },
{ title: '库位', dataIndex: 'location', width: 120, search: false },
{
  title: '生产日期',
  dataIndex: 'production_date',
  width: 110,
  search: false,
  valueType: 'date',
},
{
  title: '有效期',
  dataIndex: 'expiry_date',
  width: 110,
  search: false,
  valueType: 'date',
},
```

- [ ] **步骤 3：运行 lint 确认无错误**

---

### 任务 9：端到端验证

- [ ] **步骤 1：启动后端，确认无启动错误**

运行：`cd backend && uvicorn app.main:app --reload --port 8000`

- [ ] **步骤 2：测试供应商 CRUD API**

```bash
# 创建供应商
curl -X POST http://localhost:8000/api/v1/suppliers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试供应商","contact_person":"张三","contact_phone":"13800138000"}'

# 列表
curl http://localhost:8000/api/v1/suppliers \
  -H "Authorization: Bearer <token>"
```

- [ ] **步骤 3：测试商品创建带新字段**

```bash
curl -X POST http://localhost:8000/api/v1/products \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试商品","brand":"测试品牌","unit":"个","barcode":"6901234567890","category_ids":["<existing_category_id>"]}'
```

- [ ] **步骤 4：测试 SKU 创建带新字段**

```bash
curl -X POST http://localhost:8000/api/v1/products/variants \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"product_id":"<id>","sku_code":"SKU-001","name":"红色-M","price":99.00,"cost_price":50.00,"barcode":"6901234567891","compare_at_price":129.00}'
```

- [ ] **步骤 5：浏览器验证前端页面**

1. 商品列表页 — 品牌列显示
2. 新建商品 — 品牌/单位/条码/排序字段可用
3. 编辑商品 — 新字段回显和保存
4. 添加/编辑 SKU — 条码/图片URL/原价字段可用
5. 库存页面 — 预警数量/供应商/库位/日期列显示
6. 控制台无错误

- [ ] **步骤 6：Git 提交所有变更**

```bash
git add -A
git commit -m "feat: 扩展商品/SKU/库存字段，新增供应商模型"
```
