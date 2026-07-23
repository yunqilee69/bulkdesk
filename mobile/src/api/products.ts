import type { ApiClient } from './client';

export type ProductStatus = 'active' | 'disabled';

export type MobileWarehouseStock = {
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  locked: number;
  available_quantity: number;
};

export type MobileProductBarcode = {
  id: string;
  name: string;
  short_name?: string | null;
  barcode: string;
  unit: string;
  standard_price: number;
  status: ProductStatus;
  warehouses: MobileWarehouseStock[];
};

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

export async function getMobileProductByBarcode(client: ApiClient, barcode: string): Promise<MobileProductBarcode> {
  return client.request<MobileProductBarcode>(`/api/v1/mobile/products/barcode/${encodeURIComponent(barcode)}`, {
    method: 'GET',
  });
}

export async function listMobileProductCategories(client: ApiClient): Promise<MobileProductCategory[]> {
  return client.request<MobileProductCategory[]>('/api/v1/mobile/product-categories', { method: 'GET' });
}

export async function listMobileProducts(
  client: ApiClient,
  query: MobileProductListQuery = {},
): Promise<MobileProductListResult> {
  const params = new URLSearchParams();
  params.append('page', String(query.page ?? 1));
  params.append('page_size', String(query.pageSize ?? 20));
  if (query.keyword?.trim()) {
    params.append('keyword', query.keyword.trim());
  }
  if (query.categoryId) {
    params.append('category_id', query.categoryId);
  }
  if (query.recommend) {
    params.append('recommend', 'true');
  }
  if (query.customerId) {
    params.append('customer_id', query.customerId);
  }

  return client.request<MobileProductListResult>(`/api/v1/mobile/products?${params.toString()}`, { method: 'GET' });
}
