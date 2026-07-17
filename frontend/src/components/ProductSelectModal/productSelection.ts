export interface SelectableProduct {
  id: string;
  name: string;
  short_name?: string | null;
  barcode: string;
  category_id: string;
  category_name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  unit: string;
  cost_price: number;
  standard_price: number;
  status: string;
}

interface ProductSelectSearchValues {
  keyword?: string;
  barcode?: string;
  categoryId?: string;
  brandId?: string;
  current: number;
}

export function toProductSelectQuery({
  keyword,
  barcode,
  categoryId,
  brandId,
  current,
}: ProductSelectSearchValues) {
  return {
    ...(keyword ? { keyword } : {}),
    ...(barcode ? { barcode } : {}),
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(brandId ? { brand_id: brandId } : {}),
    status: 'active',
    page: current,
    page_size: 10,
  };
}

export function mergeSelectedProducts(
  selectedProducts: SelectableProduct[],
  products: SelectableProduct[],
) {
  return [...selectedProducts, ...products].filter(
    (product, index, items) => items.findIndex((item) => item.id === product.id) === index,
  );
}

interface ProductFilter {
  categoryId?: string;
  keyword: string;
  brandId?: string;
}

export function filterSelectableProducts(
  products: SelectableProduct[],
  { categoryId, keyword, brandId }: ProductFilter,
) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();

  return products.filter((product) => {
    const matchesKeyword = !normalizedKeyword || [product.name, product.short_name, product.barcode]
      .filter(Boolean)
      .some((value) => value?.toLocaleLowerCase().includes(normalizedKeyword));

    return product.status === 'active'
      && (!categoryId || product.category_id === categoryId)
      && (!brandId || product.brand_id === brandId)
      && matchesKeyword;
  });
}

export function toSelectedProducts(products: SelectableProduct[], selectedIds: string[]) {
  const selectedIdsSet = new Set(selectedIds);
  return products.filter((product) => selectedIdsSet.has(product.id));
}
