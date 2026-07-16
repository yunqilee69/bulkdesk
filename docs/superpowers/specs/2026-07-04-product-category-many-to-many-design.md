# Product-Category Many-to-Many Redesign

## Background

Current model: `products.category_id` FK → one product belongs to one category.
Requirement: products can belong to multiple categories (pure many-to-many, no primary category concept).

## Key Decisions

1. **Pure many-to-many** — no primary/secondary category distinction
2. **Association table** `product_categories` — standard join table approach
3. **Drawer UI** for category detail → product list management
4. **Multi-select** category field in product create/edit forms

## Data Model Changes

### New Table: `product_categories`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, auto-generated |
| product_id | UUID | FK → products.id, NOT NULL, ON DELETE CASCADE |
| category_id | UUID | FK → categories.id, NOT NULL, ON DELETE CASCADE |
| created_at | TIMESTAMP | DEFAULT now() |

- **UniqueConstraint**: `(product_id, category_id)` — prevent duplicate associations

### Removed

- `products.category_id` column — dropped after data migration
- `Product.category` relationship (single FK)

### Added Relationships

- `Product.categories` → many-to-many via `product_categories`
- `Category.products` → many-to-many via `product_categories`

### Data Migration

1. Create `product_categories` table
2. INSERT rows from existing `products.category_id` (skip NULLs)
3. Drop `products.category_id` column

## API Changes

### Product Schemas

**ProductCreate**: `category_id: str` → `category_ids: list[str]` (at least 1 required)
**ProductUpdate**: `category_id: Optional[str]` → `category_ids: Optional[list[str]]`
**ProductOut**: `category_id: str` + `category_name: Optional[str]` → `category_ids: list[str]` + `category_names: list[str]`

### Product List/Filter

- `category_id` query param remains — backend JOINs `product_categories` to filter
- Response includes `category_names: list[str]` (populated via batch query, same pattern as `parent_name`)

### New Category-Product Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/categories/{id}/products` | Paginated list of products in a category |
| POST | `/categories/{id}/products/bind` | Batch add products to category: `{ product_ids: [str] }` |
| DELETE | `/categories/{id}/products/{product_id}` | Remove a product from category |

## Frontend Changes

### Product Page (`/product`)

- Create/Edit form: `category_id` single-select → `category_ids` multi-select
- Product list table: category column shows multiple Tags instead of single text
- Search filter: `category_id` select remains (filters by "in this category")

### Category Page (`/system/categories`)

- Add "详情" button to each row
- Click opens Drawer showing:
  - Category info header (name, parent, status)
  - Product table with columns: name, status, base_price, image
  - "添加商品" button → opens modal with multi-select product list
  - "移除" button on each row → removes product from this category

### Service Layer

- `listProducts` response: `category_names` as string array
- `createProduct`/`updateProduct`: send `category_ids` instead of `category_id`
- New service functions: `listCategoryProducts`, `bindProductsToCategory`, `removeProductFromCategory`

## Implementation Order

1. Backend: model + migration (product_categories table, drop category_id)
2. Backend: schema changes (category_ids, category_names)
3. Backend: service changes (product CRUD with categories, category-product endpoints)
4. Backend: API routes (new endpoints)
5. Frontend: product form multi-select + list display
6. Frontend: category detail Drawer with product management
7. Verification: full E2E testing
