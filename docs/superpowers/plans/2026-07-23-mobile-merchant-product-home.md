# Mobile Merchant Product Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the merchant-first mobile product and cart flow confirmed by `docs/prototypes/mobile-merchant-products.html` and `docs/prototypes/mobile-merchant-cart.html`, with category tabs, recommendation tab, scan/search entry, two-column product feed, customer-scoped cart tabs, brand-grouped cart items, add-to-cart behavior, and a five-item merchant bottom menu.

**Architecture:** Add a mobile-specific product catalog read contract on the FastAPI `/api/v1/mobile` router, because the mobile homepage needs lightweight card data and recommendation filtering instead of the full admin product table. In React Native, introduce a `products` tab, a customer-aware cart context, and focused `ProductHomeScreen` / `CartScreen` components that use React Query, existing scanner abstractions, and local cart state. Keep checkout submission out of this slice; the cart screen prepares selected customer/item state and a settlement entry point for a later order-draft/checkout task.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic, PostgreSQL, React Native 0.82, React 19, React Navigation bottom tabs, TanStack Query, Jest, React Test Renderer.

---

## Confirmed UX Scope

- Merchant mode bottom menu shows exactly: `商品`、`库存`、`派送`、`购物车`、`我的`.
- Customer mode remains a navigation seam, but this implementation optimizes merchant mode first.
- `库存` and `派送` are merchant-only routes.
- Product page follows the approved prototype and removes the floating back-to-top button.
- Product page removes the visible `推荐商品` heading and backend parameter hint line.
- Top category bar includes a separate `推荐` tab.
- `推荐` tab sends a recommendation flag to the backend; the backend may randomize active products.
- Search row embeds a scan icon on the left and a `搜索` action on the right.
- Product card shows first product image, brand + product name on one line, display price, and a plus button.
- Merchant price is the product default sale price. Customer mode can request customer-level pricing through `customer_id` when that mode is wired.
- Cart page follows `docs/prototypes/mobile-merchant-cart.html`: top-left title is `购物车`, top-right merchant mode area contains customer tabs and a plus button for adding/selecting a customer cart.
- Cart customer tabs use customer names; long-pressing a customer tab opens a delete/remove action for that customer cart.
- Cart item list is grouped by product brand, not by marketplace/store name, and there is no `立减` / `降价` / `分组` / `常购` / `筛选` toolbar.
- Cart item layout is `选择框 | 图片 | 商品名称 | 数量`, followed by specification and then price + `详情` action.
- Cart item supports left swipe to reveal a `删除` button; tapping the item or `详情` navigates to product detail.
- Cart quantity is clickable/editable. Checkout button displays the count of selected product kinds, for example `结算(2种)`.
- Cart member price displays the customer/member price as the main red price and shows the original standard price to the right in small gray text.

## File Structure

### Backend

- Modify: `backend/tests/test_mobile_read_contract.py` — add product category/list mobile contract tests.
- Modify: `backend/app/schemas/mobile.py` — add category and product-list response schemas.
- Modify: `backend/app/services/mobile_service.py` — add mobile category/product listing query logic.
- Modify: `backend/app/api/v1/mobile.py` — expose mobile categories and product list routes.
- No migration file is required because this plan only reads existing `products.image_urls`, `brands`, `categories`, `inventories`, `customers`, and `member_prices` fields.

### Mobile

- Create: `mobile/src/__tests__/mobileProductCatalogApi.test.ts` — API query serialization tests.
- Create: `mobile/src/__tests__/mobileProductHomeModel.test.ts` — formatting and card-model tests.
- Create: `mobile/src/__tests__/mobileCart.test.tsx` — cart reducer/provider behavior tests.
- Create: `mobile/src/__tests__/mobileCartScreen.test.tsx` — merchant cart screen rendering and interaction tests.
- Create: `mobile/src/__tests__/mobileProductHomeScreen.test.tsx` — screen rendering/search/scan/add tests.
- Modify: `mobile/src/__tests__/roleNavigation.test.ts` — update bottom menu expectations for merchant and customer mode.
- Modify: `mobile/src/api/products.ts` — add catalog/category list types and request functions.
- Modify: `mobile/src/app/roleNavigation.ts` — add `products` and `cart` routes plus merchant/customer mode route building.
- Modify: `mobile/src/app/AppNavigator.tsx` — render the new product home and cart screens with five merchant tabs.
- Modify: `mobile/src/app/AppProviders.tsx` — wrap app content in the cart provider.
- Create: `mobile/src/features/cart/cartModel.ts` — pure cart helpers for customer tabs, brand grouping, selection totals, prices, and quantities.
- Create: `mobile/src/features/cart/cartStore.tsx` — customer-aware in-memory cart context for added product quantities and selected lines.
- Create: `mobile/src/features/cart/CartItemRow.tsx` — swipeable cart item row with delete, quantity, detail, and select controls.
- Create: `mobile/src/features/cart/CartScreen.tsx` — merchant cart page with customer tabs, brand groups, item list, and checkout bar.
- Create: `mobile/src/features/products/ProductDetailScreen.tsx` — minimal product detail destination for cart item/detail taps.
- Create: `mobile/src/features/products/productHomeModel.ts` — pure helpers for query params, display price, image selection, and page merge.
- Create: `mobile/src/features/products/ProductCard.tsx` — product-card presentational component.
- Create: `mobile/src/features/products/ProductHomeScreen.tsx` — category tabs, search/scan row, infinite two-column product feed.

---

## Task 1: Backend Mobile Catalog Tests

**Files:**
- Modify: `backend/tests/test_mobile_read_contract.py`

- [ ] **Step 1: Add category contract test**

Add a test that creates active and disabled categories, authenticates as a warehouse/admin-capable user, calls `GET /api/v1/mobile/product-categories`, and expects only active categories in stable order.

```python
async def test_mobile_product_categories_returns_active_categories(client, admin_headers, db_session):
    await create_category_fixture(db_session, name="粮油", status="active", sort_order=2)
    await create_category_fixture(db_session, name="停用分类", status="disabled", sort_order=1)

    response = await client.get("/api/v1/mobile/product-categories", headers=admin_headers)

    assert response.status_code == 200
    payload = response.json()["data"]
    assert [item["name"] for item in payload] == ["粮油"]
    assert set(payload[0]) == {"id", "name"}
```

If existing fixtures use different helper names, reuse the local fixture style in `backend/tests/test_mobile_read_contract.py` and keep the assertions identical.

- [ ] **Step 2: Add merchant product-list contract test**

Add a test for `GET /api/v1/mobile/products?page=1&page_size=20&recommend=true`, asserting the card data is lightweight and uses default sale price for merchant mode.

```python
async def test_mobile_products_returns_card_data_for_merchant_mode(client, admin_headers, db_session):
    category = await create_category_fixture(db_session, name="粮油", status="active")
    brand = await create_brand_fixture(db_session, name="金龙鱼", status="active")
    product = await create_product_fixture(
        db_session,
        name="东北大米 25kg",
        barcode="6901000000010",
        category_id=category.id,
        brand_id=brand.id,
        standard_price=128.5,
        image_urls=["https://cdn.example.test/rice.jpg", "https://cdn.example.test/rice-2.jpg"],
        status="active",
    )

    response = await client.get("/api/v1/mobile/products?page=1&page_size=20&recommend=true", headers=admin_headers)

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["page"] == 1
    assert payload["page_size"] == 20
    assert payload["total"] >= 1
    item = next(row for row in payload["items"] if row["id"] == str(product.id))
    assert item["brand_name"] == "金龙鱼"
    assert item["name"] == "东北大米 25kg"
    assert item["image_url"] == "https://cdn.example.test/rice.jpg"
    assert item["standard_price"] == 128.5
    assert item["display_price"] == 128.5
    assert item["price_source"] == "standard"
```

- [ ] **Step 3: Add customer-price contract test**

Add a test that passes `customer_id` and verifies `display_price` uses `MemberPrice.price` when available, and `price_source` becomes `member`.

```python
async def test_mobile_products_can_use_customer_member_price(client, admin_headers, db_session):
    level = await create_customer_level_fixture(db_session, name="金牌", is_default=False)
    customer = await create_customer_fixture(db_session, name="海淀批发部", level_id=level.id)
    product = await create_product_fixture(db_session, name="整箱牛奶", standard_price=59.9, status="active")
    await create_member_price_fixture(db_session, product_id=product.id, level_id=level.id, price=49.9)

    response = await client.get(f"/api/v1/mobile/products?customer_id={customer.id}", headers=admin_headers)

    assert response.status_code == 200
    item = next(row for row in response.json()["data"]["items"] if row["id"] == str(product.id))
    assert item["standard_price"] == 59.9
    assert item["display_price"] == 49.9
    assert item["price_source"] == "member"
```

- [ ] **Step 4: Run backend focused tests and confirm failure**

Run from `backend/`:

```bash
uv run pytest tests/test_mobile_read_contract.py -q
```

Expected result before implementation: failure because `/api/v1/mobile/product-categories` and `/api/v1/mobile/products` do not exist.

---

## Task 2: Backend Mobile Catalog Implementation

**Files:**
- Modify: `backend/app/schemas/mobile.py`
- Modify: `backend/app/services/mobile_service.py`
- Modify: `backend/app/api/v1/mobile.py`

- [ ] **Step 1: Add response schemas**

Add the following schema shapes to `backend/app/schemas/mobile.py`.

```python
class MobileProductCategoryOut(ApiSchema):
    id: str
    name: str

    @field_validator("id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> str:
        return str(value)


class MobileProductPriceSource(str, enum.Enum):
    standard = "standard"
    member = "member"


class MobileProductListItemOut(ApiSchema):
    id: str
    name: str
    short_name: Optional[str] = None
    barcode: str
    category_id: str
    category_name: Optional[str] = None
    brand_id: Optional[str] = None
    brand_name: Optional[str] = None
    unit: str
    image_url: Optional[str] = None
    standard_price: float
    display_price: float
    price_source: MobileProductPriceSource = MobileProductPriceSource.standard
    status: ProductStatus
    available_quantity: int = 0

    @field_validator("id", "category_id", "brand_id", mode="before")
    @classmethod
    def uuid_to_str(cls, value: object) -> Optional[str]:
        return str(value) if value is not None else None

    @field_validator("standard_price", "display_price", mode="before")
    @classmethod
    def decimal_to_float(cls, value: object) -> float:
        if isinstance(value, Decimal):
            return float(value)
        return value
```

Also import `enum` and `PaginatedResponse` where needed.

- [ ] **Step 2: Add service functions**

In `backend/app/services/mobile_service.py`, add `list_mobile_product_categories` and `list_mobile_products`.

Implementation details:

```python
async def list_mobile_product_categories(db: AsyncSession) -> list[MobileProductCategoryOut]:
    rows = (
        await db.execute(
            select(Category)
            .where(Category.status == CategoryStatus.active)
            .order_by(Category.name)
        )
    ).scalars().all()
    return [MobileProductCategoryOut(id=row.id, name=row.name) for row in rows]
```

For `list_mobile_products`, use these rules:

- Require `admin`, `warehouse_manager`, or `delivery` role through `has_any_role`.
- Filter `Product.status == ProductStatus.active`.
- Apply `category_id` and `keyword` when provided.
- Join `Brand` and `Category` for card labels.
- Aggregate `Inventory.quantity - Inventory.locked` as `available_quantity`.
- Use `Product.image_urls[0]` as `image_url` when the JSON list is present.
- If `customer_id` is provided, load the customer level and left join `MemberPrice` for that level.
- Set `display_price = member price` only when a matching member price exists; otherwise use `standard_price`.
- Set `price_source` to `member` or `standard` accordingly.
- Order by `func.random()` when `recommend=True`; otherwise order by `Product.created_at.desc()`.
- Return `PaginatedResponse[MobileProductListItemOut]`.

- [ ] **Step 3: Expose API routes**

In `backend/app/api/v1/mobile.py`, import the new schemas and services, then add:

```python
@router.get("/product-categories", response_model=ResponseBase[list[MobileProductCategoryOut]])
async def product_categories(current_user: CurrentUser, db: AsyncSession = Depends(get_db)):
    try:
        return ResponseBase(data=await list_mobile_product_categories(db))
    except Exception as error:
        raise _map_read_error(error)


@router.get("/products", response_model=ResponseBase[PaginatedResponse[MobileProductListItemOut]])
async def products(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    keyword: Optional[str] = None,
    category_id: Optional[str] = None,
    recommend: bool = False,
    customer_id: Optional[str] = None,
):
    try:
        return ResponseBase(
            data=await list_mobile_products(
                db,
                current_user,
                page=page,
                page_size=page_size,
                keyword=keyword,
                category_id=category_id,
                recommend=recommend,
                customer_id=customer_id,
            )
        )
    except Exception as error:
        raise _map_read_error(error)
```

Also import `Query`, `Optional`, `PaginatedResponse`, `MobileProductCategoryOut`, and `MobileProductListItemOut`.

- [ ] **Step 4: Run backend tests and syntax check**

Run from `backend/`:

```bash
uv run pytest tests/test_mobile_read_contract.py -q
PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app
```

Expected result: focused contract tests pass and compileall completes without syntax errors.

---

## Task 3: Mobile Product API Client

**Files:**
- Create: `mobile/src/__tests__/mobileProductCatalogApi.test.ts`
- Modify: `mobile/src/api/products.ts`

- [ ] **Step 1: Write API serialization tests**

Create `mobile/src/__tests__/mobileProductCatalogApi.test.ts` with tests for category and product list calls.

```ts
import { createApiClient } from '../api/client';
import { listMobileProductCategories, listMobileProducts } from '../api/products';

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ code: 0, message: 'ok', data }) } as Response;
}

function createTestClient(fetchMock: jest.Mock) {
  return createApiClient({
    baseUrl: 'https://api.example.test',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: fetchMock,
  });
}

describe('mobile product catalog api', () => {
  it('loads mobile product categories', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse([{ id: 'category-1', name: '粮油' }]));

    await expect(listMobileProductCategories(createTestClient(fetchMock))).resolves.toEqual([
      { id: 'category-1', name: '粮油' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/mobile/product-categories',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('serializes recommend keyword and pagination product queries', async () => {
    const result = { items: [], total: 0, page: 2, page_size: 20 };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(result));

    await expect(listMobileProducts(createTestClient(fetchMock), {
      page: 2,
      pageSize: 20,
      keyword: '大米',
      categoryId: 'category-1',
      recommend: true,
    })).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/mobile/products?page=2&page_size=20&keyword=%E5%A4%A7%E7%B1%B3&category_id=category-1&recommend=true',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
```

- [ ] **Step 2: Run API tests and confirm failure**

Run from `mobile/`:

```bash
npm test -- --runInBand src/__tests__/mobileProductCatalogApi.test.ts
```

Expected result before implementation: failure because `listMobileProductCategories` and `listMobileProducts` are not exported.

- [ ] **Step 3: Add product catalog types and functions**

In `mobile/src/api/products.ts`, keep `getMobileProductByBarcode` and add:

```ts
export type MobileProductCategory = {
  id: string;
  name: string;
};

export type MobileProductPriceSource = 'standard' | 'member';

export type MobileProductListItem = {
  id: string;
  name: string;
  short_name?: string | null;
  barcode: string;
  category_id: string;
  category_name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  unit: string;
  image_url?: string | null;
  standard_price: number;
  display_price: number;
  price_source: MobileProductPriceSource;
  status: ProductStatus;
  available_quantity: number;
};

export type MobileProductListResult = {
  items: MobileProductListItem[];
  total: number;
  page: number;
  page_size: number;
};

export type MobileProductListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  categoryId?: string;
  recommend?: boolean;
  customerId?: string;
};

export async function listMobileProductCategories(client: ApiClient): Promise<MobileProductCategory[]> {
  return client.request<MobileProductCategory[]>('/api/v1/mobile/product-categories', { method: 'GET' });
}

export async function listMobileProducts(client: ApiClient, query: MobileProductListQuery = {}): Promise<MobileProductListResult> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('page_size', String(query.pageSize ?? 20));
  if (query.keyword?.trim()) params.set('keyword', query.keyword.trim());
  if (query.categoryId) params.set('category_id', query.categoryId);
  if (query.recommend) params.set('recommend', 'true');
  if (query.customerId) params.set('customer_id', query.customerId);
  return client.request<MobileProductListResult>(`/api/v1/mobile/products?${params.toString()}`, { method: 'GET' });
}
```

- [ ] **Step 4: Run API tests**

Run from `mobile/`:

```bash
npm test -- --runInBand src/__tests__/mobileProductCatalogApi.test.ts
```

Expected result: product catalog API tests pass.

---

## Task 4: Merchant Cart State and Screen

**Files:**
- Create: `mobile/src/__tests__/mobileCart.test.tsx`
- Create: `mobile/src/__tests__/mobileCartScreen.test.tsx`
- Create: `mobile/src/features/cart/cartModel.ts`
- Create: `mobile/src/features/cart/cartStore.tsx`
- Create: `mobile/src/features/cart/CartItemRow.tsx`
- Create: `mobile/src/features/cart/CartScreen.tsx`
- Create: `mobile/src/features/products/ProductDetailScreen.tsx`
- Modify: `mobile/src/app/AppProviders.tsx`
- Modify: `mobile/src/app/AppNavigator.tsx`

- [ ] **Step 1: Write cart model tests**

Create `mobile/src/__tests__/mobileCart.test.tsx` with reducer/model tests for repeated adds, customer tabs, long-press removal semantics, brand grouping, selected-kind count, selected total, and member/original price display inputs.

```tsx
import {
  addCartCustomer,
  addCartItem,
  createCartState,
  groupCartLinesByBrand,
  removeCartCustomer,
  removeCartItem,
  selectedCartKindCount,
  selectedCartTotal,
  setCartItemQuantity,
  toggleCartItemSelected,
} from '../features/cart/cartModel';

describe('merchant cart model', () => {
  it('keeps one tab per customer and removes a long-pressed customer cart', () => {
    let state = createCartState();
    state = addCartCustomer(state, { customerId: 'customer-1', customerName: '海淀批发部' });
    state = addCartCustomer(state, { customerId: 'customer-2', customerName: '朝阳便利店' });

    expect(state.customerTabs.map(tab => tab.customerName)).toEqual(['海淀批发部', '朝阳便利店']);
    expect(removeCartCustomer(state, 'customer-1').customerTabs.map(tab => tab.customerName)).toEqual(['朝阳便利店']);
  });

  it('groups active customer lines by brand instead of store name', () => {
    let state = addCartCustomer(createCartState(), { customerId: 'customer-1', customerName: '海淀批发部' });
    state = addCartItem(state, 'customer-1', { productId: 'p1', name: '东北大米', specification: '25kg/袋', brandId: 'b1', brandName: '金龙鱼', imageUrl: null, price: 128.5, standardPrice: 138.5 });
    state = addCartItem(state, 'customer-1', { productId: 'p2', name: '食用油', specification: '5L/桶', brandId: 'b1', brandName: '金龙鱼', imageUrl: null, price: 69, standardPrice: 79 });

    expect(groupCartLinesByBrand(state, 'customer-1')).toEqual([
      expect.objectContaining({ brandName: '金龙鱼', lines: [expect.objectContaining({ productId: 'p1' }), expect.objectContaining({ productId: 'p2' })] }),
    ]);
  });

  it('tracks selected product kinds and totals for checkout label', () => {
    let state = addCartCustomer(createCartState(), { customerId: 'customer-1', customerName: '海淀批发部' });
    state = addCartItem(state, 'customer-1', { productId: 'p1', name: '东北大米', specification: '25kg/袋', brandId: 'b1', brandName: '金龙鱼', imageUrl: null, price: 128.5, standardPrice: 138.5 });
    state = addCartItem(state, 'customer-1', { productId: 'p2', name: '牛奶', specification: '250ml×24', brandId: 'b2', brandName: '蒙牛', imageUrl: null, price: 49.9, standardPrice: 59.9 });
    state = setCartItemQuantity(state, 'customer-1', 'p2', 2);
    state = toggleCartItemSelected(state, 'customer-1', 'p2');

    expect(selectedCartKindCount(state, 'customer-1')).toBe(1);
    expect(selectedCartTotal(state, 'customer-1')).toBe(128.5);
  });

  it('removes a swiped cart item', () => {
    let state = addCartCustomer(createCartState(), { customerId: 'customer-1', customerName: '海淀批发部' });
    state = addCartItem(state, 'customer-1', { productId: 'p1', name: '东北大米', specification: '25kg/袋', brandId: 'b1', brandName: '金龙鱼', imageUrl: null, price: 128.5, standardPrice: 138.5 });

    expect(removeCartItem(state, 'customer-1', 'p1').linesByCustomerId['customer-1']).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement cart model**

Create `mobile/src/features/cart/cartModel.ts` with these exported types and pure functions.

```ts
export type CartCustomerTab = { customerId: string; customerName: string };

export type CartLineInput = {
  productId: string;
  name: string;
  specification?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  imageUrl?: string | null;
  price: number;
  standardPrice?: number | null;
};

export type CartLine = CartLineInput & {
  quantity: number;
  selected: boolean;
};

export type CartBrandGroup = {
  brandId: string;
  brandName: string;
  lines: CartLine[];
};

export type CartState = {
  activeCustomerId: string | null;
  customerTabs: CartCustomerTab[];
  linesByCustomerId: Record<string, CartLine[]>;
};
```

Implement these rules:

- `createCartState()` returns no active customer and no lines.
- `addCartCustomer(state, customer)` appends the customer only once, selects it, and initializes an empty line array.
- `removeCartCustomer(state, customerId)` removes the tab and its lines, then selects the next available customer or `null`.
- `addCartItem(state, customerId, input)` increments quantity when the product already exists; otherwise adds a selected line with quantity `1`.
- `setCartItemQuantity(state, customerId, productId, quantity)` clamps quantity to at least `1`.
- `toggleCartItemSelected(state, customerId, productId)` flips the item checkbox.
- `toggleAllCartItems(state, customerId, selected)` selects or deselects all active customer lines.
- `removeCartItem(state, customerId, productId)` removes a single product, matching the left-swipe delete behavior.
- `groupCartLinesByBrand(state, customerId)` groups by `brandId || 'unknown'` and labels missing brands as `其他品牌`.
- `selectedCartKindCount(state, customerId)` counts selected product lines, not total units.
- `selectedCartTotal(state, customerId)` sums `price * quantity` only for selected lines.

- [ ] **Step 3: Implement cart provider**

Create `mobile/src/features/cart/cartStore.tsx` that wraps the pure model with React context.

Required API:

```ts
export type CartContextValue = {
  state: CartState;
  activeCustomerId: string | null;
  activeLines: CartLine[];
  brandGroups: CartBrandGroup[];
  selectedKindCount: number;
  selectedTotal: number;
  addCustomer(customer: CartCustomerTab): void;
  removeCustomer(customerId: string): void;
  selectCustomer(customerId: string): void;
  addItem(customerId: string, input: CartLineInput): void;
  setQuantity(customerId: string, productId: string, quantity: number): void;
  toggleItem(customerId: string, productId: string): void;
  toggleAll(customerId: string, selected: boolean): void;
  removeItem(customerId: string, productId: string): void;
};
```

Implementation requirements:

- Use `useReducer` and the pure functions from `cartModel.ts`.
- `useCart()` throws `Error('购物车上下文未初始化')` outside provider.
- Seed one merchant customer tab only for local development/tests when the state is empty: `{ customerId: 'default-customer', customerName: '默认客户' }`.
- Product home plus taps add to `activeCustomerId`; if none exists, create/select `默认客户` first.

- [ ] **Step 4: Write cart screen tests**

Create `mobile/src/__tests__/mobileCartScreen.test.tsx` to verify the accepted UI contract from `docs/prototypes/mobile-merchant-cart.html`.

```tsx
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { CartProvider, useCart } from '../features/cart/cartStore';
import { CartScreen } from '../features/cart/CartScreen';

function SeedCart() {
  const cart = useCart();
  React.useEffect(() => {
    cart.addCustomer({ customerId: 'customer-1', customerName: '海淀批发部' });
    cart.addCustomer({ customerId: 'customer-2', customerName: '朝阳便利店' });
    cart.addItem('customer-1', { productId: 'p1', name: '东北大米', specification: '25kg/袋', brandId: 'brand-1', brandName: '金龙鱼', imageUrl: null, price: 128.5, standardPrice: 138.5 });
    cart.addItem('customer-1', { productId: 'p2', name: '纯牛奶', specification: '250ml×24盒', brandId: 'brand-2', brandName: '蒙牛', imageUrl: null, price: 49.9, standardPrice: 59.9 });
  }, []);
  return <CartScreen />;
}

describe('merchant cart screen', () => {
  it('renders customer tabs brand groups cart rows and selected checkout kind count', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<CartProvider><SeedCart /></CartProvider>);
    });

    const output = JSON.stringify(renderer.toJSON());
    expect(output).toContain('购物车');
    expect(output).toContain('海淀批发部');
    expect(output).toContain('朝阳便利店');
    expect(output).toContain('品牌 金龙鱼');
    expect(output).toContain('东北大米');
    expect(output).toContain('25kg/袋');
    expect(output).toContain('¥128.50');
    expect(output).toContain('¥138.50');
    expect(output).toContain('详情');
    expect(output).toContain('结算(2种)');
    expect(output).not.toContain('天猫超市 · 单品包邮');
    expect(output).not.toContain('筛选');
  });
});
```

Add tests for interactions:

- Press the customer `+` button and assert customer selection UI callback/sheet placeholder appears as `选择客户`.
- Call `onLongPress` on a customer tab and assert `删除客户购物车` appears.
- Trigger item row delete through the row delete action and assert the product is removed.
- Press the quantity chip and assert `修改数量` appears.
- Press the item detail action and assert navigation is requested with the product id.

- [ ] **Step 5: Implement cart item row**

Create `mobile/src/features/cart/CartItemRow.tsx` using React Native primitives and `PanResponder` for swipe-to-delete.

Required layout:

```text
选择框  图片  商品名称    数量
              规格
              会员/当前价格  原价(灰色)  详情
```

Implementation requirements:

- Row root uses `Pressable` so tapping the list item navigates to product detail.
- Checkbox is a `Pressable` with `accessibilityLabel={`选择 ${line.name}`}`.
- Image uses `line.imageUrl`; fallback shows brand/product initials.
- Quantity chip is a `Pressable` with `accessibilityLabel={`修改数量 ${line.name}`}`.
- Price uses `line.price` in red.
- If `line.standardPrice` exists and differs from `line.price`, show `line.standardPrice` in small gray text to the right.
- Detail action text is `详情`, not `明细`.
- A left swipe reveals a red `删除` button; the same delete action is available through an accessibility action for tests and accessibility users.

- [ ] **Step 6: Implement merchant cart screen**

Create `mobile/src/features/cart/CartScreen.tsx` with:

- Top title row: left `购物车` with total item count; right customer area and `+` button.
- Horizontal customer tabs using `cart.state.customerTabs`; selected tab uses active styling.
- Long press on a customer tab opens a confirmation/inline action labeled `删除客户购物车`.
- `+` button opens a lightweight `选择客户` placeholder panel for this slice; later checkout/customer-picker work can connect the real customer picker.
- No discount/filter toolbar.
- Brand groups from `cart.brandGroups`; group header format is `品牌 {brandName}`.
- `CartItemRow` for each item.
- Bottom checkout bar with all-select checkbox, `合计：¥金额`, and `结算({selectedKindCount}种)`.
- Empty state `购物车暂无商品` when the active customer has no items.
- Quantity edit can be an inline numeric prompt/sheet labeled `修改数量`; changing it calls `cart.setQuantity()`.

- [ ] **Step 7: Implement product detail destination**

Create `mobile/src/features/products/ProductDetailScreen.tsx` as a minimal destination so cart item taps have a real route.

Required behavior:

- Accept `productId` from navigation params.
- Render `商品详情` and the product id.
- Add a note `详情接口待接入` until the full product detail API is designed.

Update `mobile/src/app/AppNavigator.tsx` to wrap the bottom tabs in a native stack and add a `ProductDetail` screen. Cart item and `详情` presses navigate to `ProductDetail` with `{ productId }`.

- [ ] **Step 8: Wrap app with cart provider**

In `mobile/src/app/AppProviders.tsx`, wrap the current content inside `<CartProvider>` inside the existing `ApiClientContext.Provider`.

- [ ] **Step 9: Run cart tests**

Run from `mobile/`:

```bash
npm test -- --runInBand src/__tests__/mobileCart.test.tsx src/__tests__/mobileCartScreen.test.tsx
```

Expected result: cart model/provider and cart screen tests pass.

---

## Task 5: Merchant Bottom Navigation

**Files:**
- Modify: `mobile/src/__tests__/roleNavigation.test.ts`
- Modify: `mobile/src/app/roleNavigation.ts`
- Modify: `mobile/src/app/AppNavigator.tsx`

- [ ] **Step 1: Update navigation tests**

Update `mobile/src/__tests__/roleNavigation.test.ts` with expectations:

```ts
expect(buildNavigation(['admin'])).toEqual(['products', 'inventory', 'delivery', 'cart', 'profile']);
expect(buildNavigation(['warehouse_manager'])).toEqual(['products', 'inventory', 'delivery', 'cart', 'profile']);
expect(buildNavigation(['delivery'])).toEqual(['products', 'inventory', 'delivery', 'cart', 'profile']);
expect(buildNavigation([], 'customer')).toEqual(['products', 'cart', 'profile']);
```

If the existing tests assert `dashboard`, `customers`, `orders`, or `payments`, replace those expectations because the approved mobile shell is product-commerce-first.

- [ ] **Step 2: Run navigation tests and confirm failure**

Run from `mobile/`:

```bash
npm test -- --runInBand src/__tests__/roleNavigation.test.ts
```

Expected result before implementation: failure because `products` and `cart` are not route keys.

- [ ] **Step 3: Update route model**

In `mobile/src/app/roleNavigation.ts`:

- Add `products` and `cart` to `MobileRouteKey`.
- Keep legacy route keys only if existing screens still need direct test access.
- Make merchant route order exactly `['products', 'inventory', 'delivery', 'cart', 'profile']`.
- Add an optional `mode: 'merchant' | 'customer' = 'merchant'` parameter.
- Return `['products', 'cart', 'profile']` for customer mode.

- [ ] **Step 4: Update navigator labels and screens**

In `mobile/src/app/AppNavigator.tsx`:

- Set labels: `products: '商品'`, `inventory: '库存'`, `delivery: '派送'`, `cart: '购物车'`, `profile: '我的'`.
- Render `ProductHomeScreen` for `products`.
- Render `CartScreen` for `cart`.
- Keep `InventoryOperationScreen` for `inventory` and `DeliveryListScreen` for `delivery`.
- Keep `PocDashboard` under `profile` with logout action.
- Use bottom tab options to avoid header duplication on `ProductHomeScreen` if the page already renders its own header.

- [ ] **Step 5: Run navigation tests**

Run from `mobile/`:

```bash
npm test -- --runInBand src/__tests__/roleNavigation.test.ts
```

Expected result: navigation tests pass.

---

## Task 6: Product Home Model

**Files:**
- Create: `mobile/src/__tests__/mobileProductHomeModel.test.ts`
- Create: `mobile/src/features/products/productHomeModel.ts`

- [ ] **Step 1: Write pure model tests**

Create tests for image fallback, title composition, price formatting, and query building.

```ts
import { buildProductListQuery, formatProductPrice, getProductImageUrl, productCardTitle } from '../features/products/productHomeModel';

describe('product home model', () => {
  it('formats RMB prices with up to two decimals', () => {
    expect(formatProductPrice(35)).toBe('¥35');
    expect(formatProductPrice(179.1)).toBe('¥179.10');
  });

  it('uses backend image_url as the first card image', () => {
    expect(getProductImageUrl({ image_url: 'https://cdn.example.test/rice.jpg' })).toBe('https://cdn.example.test/rice.jpg');
    expect(getProductImageUrl({ image_url: null })).toBeNull();
  });

  it('keeps brand and product name on one display line', () => {
    expect(productCardTitle({ brand_name: '金龙鱼', name: '东北大米 25kg' })).toBe('金龙鱼 东北大米 25kg');
  });

  it('builds recommend query when the recommend tab is active', () => {
    expect(buildProductListQuery({ activeCategoryId: 'recommend', keyword: '大米', page: 1 })).toEqual({
      page: 1,
      pageSize: 20,
      keyword: '大米',
      recommend: true,
    });
  });
});
```

- [ ] **Step 2: Implement pure helpers**

Create `mobile/src/features/products/productHomeModel.ts` exporting:

- `RECOMMEND_CATEGORY_ID = 'recommend'`.
- `formatProductPrice(price: number): string`.
- `getProductImageUrl(product: Pick<MobileProductListItem, 'image_url'>): string | null`.
- `productCardTitle(product: Pick<MobileProductListItem, 'brand_name' | 'name'>): string`.
- `buildProductListQuery(input)` that maps recommend tab to `recommend: true`, category tabs to `categoryId`, and trimmed keyword to `keyword`.
- `flattenProductPages(pages)` that concatenates React Query infinite pages.

- [ ] **Step 3: Run model tests**

Run from `mobile/`:

```bash
npm test -- --runInBand src/__tests__/mobileProductHomeModel.test.ts
```

Expected result: product home model tests pass.

---

## Task 7: Product Home Screen

**Files:**
- Create: `mobile/src/__tests__/mobileProductHomeScreen.test.tsx`
- Create: `mobile/src/features/products/ProductCard.tsx`
- Create: `mobile/src/features/products/ProductHomeScreen.tsx`

- [ ] **Step 1: Write screen behavior tests**

Create `mobile/src/__tests__/mobileProductHomeScreen.test.tsx` using `QueryClientProvider`, `ApiClientContext.Provider`, and `CartProvider`. Cover these assertions:

```tsx
expect(JSON.stringify(renderer.toJSON())).toContain('推荐');
expect(JSON.stringify(renderer.toJSON())).toContain('粮油');
expect(JSON.stringify(renderer.toJSON())).toContain('扫码搜索');
expect(JSON.stringify(renderer.toJSON())).toContain('搜索');
expect(JSON.stringify(renderer.toJSON())).toContain('金龙鱼 东北大米 25kg');
expect(JSON.stringify(renderer.toJSON())).toContain('¥128.50');
expect(JSON.stringify(renderer.toJSON())).not.toContain('推荐商品');
expect(JSON.stringify(renderer.toJSON())).not.toContain('recommend=true');
```

Also simulate plus press:

```tsx
await ReactTestRenderer.act(async () => {
  renderer.root.findByProps({ accessibilityLabel: '加入购物车 东北大米 25kg' }).props.onPress();
});
expect(JSON.stringify(renderer.toJSON())).toContain('购物车 1');
```

Add a scan test with injected scanner:

```tsx
const scanner = { scanOnce: jest.fn().mockResolvedValue({ value: '6901000000010', format: 'ean-13', kind: 'barcode', scannedAt: '2026-07-23T00:00:00.000Z' }) };
await ReactTestRenderer.act(async () => {
  renderer.root.findByProps({ accessibilityLabel: '扫码搜索' }).props.onPress();
});
expect(scanner.scanOnce).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Implement ProductCard**

Create `mobile/src/features/products/ProductCard.tsx` with props:

```ts
type ProductCardProps = {
  product: MobileProductListItem;
  onAdd: (product: MobileProductListItem) => void;
};
```

Render:

- `Image` when `product.image_url` exists.
- Placeholder block with first character of brand or product name when no image exists.
- One-line text from `productCardTitle(product)`.
- Price from `formatProductPrice(product.display_price)`.
- Plus button with `accessibilityLabel={`加入购物车 ${product.name}`}`.

- [ ] **Step 3: Implement ProductHomeScreen**

Create `mobile/src/features/products/ProductHomeScreen.tsx` with:

- `useQuery` for `listMobileProductCategories`.
- `useInfiniteQuery` for `listMobileProducts` with page size `20`.
- Category `ScrollView` with `推荐` followed by active categories.
- Search state and submitted keyword state.
- Scan button using injected `scanner` prop or `createFixtureScanner()`.
- Search button that submits the trimmed keyword.
- `FlatList` with `numColumns={2}`, `onEndReached`, and no floating top button.
- `ProductCard` for each item.
- On plus tap, resolve `cart.activeCustomerId`; if missing, create/select `默认客户`, then call `cart.addItem(customerId, input)`.
- Pass product id, product name, specification/unit text, brand id/name, display price, standard price, and image URL into the cart input so the cart can group by brand and show member price + gray original price.
- A compact cart count text in the page or tab label test surface as `购物车 N` until tab badge wiring is added.

- [ ] **Step 4: Run screen tests**

Run from `mobile/`:

```bash
npm test -- --runInBand src/__tests__/mobileProductHomeScreen.test.tsx
```

Expected result: product home screen tests pass.

---

## Task 8: Full Verification

**Files:**
- No code changes beyond previous tasks.

- [ ] **Step 1: Run backend verification**

Run from `backend/`:

```bash
uv run pytest
PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app
```

Expected result: all backend tests pass. If unrelated existing failures appear, capture the failing test names and output.

- [ ] **Step 2: Run mobile verification**

Run from `mobile/`:

```bash
npm test -- --runInBand
npm run typecheck
npm run lint
```

Expected result: mobile Jest, TypeScript, and lint pass. If lint reports existing generated platform files, rerun with the project’s existing ignore configuration and record the exact output.

- [ ] **Step 3: Manual visual verification**

Run the mobile app and verify against `docs/prototypes/mobile-merchant-products.html` and `docs/prototypes/mobile-merchant-cart.html`:

- Merchant bottom menu has `商品`、`库存`、`派送`、`购物车`、`我的`.
- Product screen has no floating back-to-top button.
- Product screen has no visible `推荐商品` heading or `recommend=true` hint text.
- `推荐` tab loads products with recommendation flag.
- Category tabs switch product feeds.
- Search button filters product feed.
- Scan icon fills/submits the scanned value.
- Product cards show image, brand + product name, price, and plus button.
- Plus button increments cart count and adds the product into the active customer cart.
- Cart page has top customer tabs and a `+` add/select customer button.
- Long-pressing a customer tab exposes/removes that customer cart.
- Cart list is grouped by brand and does not show the removed `立减` / `筛选` toolbar.
- Cart row layout is checkbox, image, name, quantity, specification, price, gray original price when applicable, and `详情` action.
- Left-swiping a cart item reveals `删除` and removes the line.
- Tapping quantity opens quantity editing and updates totals.
- Checkout button shows selected product kind count, for example `结算(2种)`.

---

## Self-Review

- Spec coverage: The plan covers the approved merchant product homepage, merchant cart page, bottom menu, recommendation tab, scan/search row, two-column card feed, customer tabs, brand-grouped cart rows, member/original price display, and add-to-cart behavior.
- Backend contract: The plan adds only read endpoints and does not require database schema changes.
- Customer mode seam: The plan supports `customer_id` pricing in the backend and keeps customer navigation mode minimal, while merchant mode remains the active target.
- Test-first compliance: Each implementation task starts with focused tests and expected failing output before code changes.
- Validation coverage: Backend tests, backend compile, mobile Jest, mobile typecheck, mobile lint, and manual visual checks are listed with exact commands.
