import { request } from '@umijs/max';
import { collectResponsePages } from './pagination';

export type PriceType = 'standard_price' | 'cost_price' | 'member_price';
export type MemberPriceItem = { level_id: string; level_name: string; price?: number | null };
export type MemberPriceChange = { level_id: string; price: number };
export type PriceChangeLogItem = { id: string; product_id: string; product_name?: string | null; barcode?: string | null; price_type: PriceType; level_id?: string | null; level_name?: string | null; old_value?: number | null; new_value: number; reason: string; operator_name?: string | null; created_at: string };
export async function listCategories(params?: { page?: number; page_size?: number }) { return request<API.ResponseBase<API.PaginatedData>>('/api/v1/products/categories', { method: 'GET', params }); }
export async function listAllCategories() { return collectResponsePages((page, pageSize) => listCategories({ page, page_size: pageSize })); }
export async function createCategory(data: { name: string; status?: string }) { return request<API.ResponseBase>('/api/v1/products/categories', { method: 'POST', data }); }
export async function updateCategory(id: string, data: { name?: string; status?: string }) { return request<API.ResponseBase>(`/api/v1/products/categories/${id}`, { method: 'PUT', data }); }
export async function listBrands(params?: { page?: number; page_size?: number }) { return request<API.ResponseBase<API.PaginatedData>>('/api/v1/products/brands', { method: 'GET', params }); }
export async function listAllBrands() { return collectResponsePages((page, pageSize) => listBrands({ page, page_size: pageSize })); }
export async function createBrand(data: { name: string; logo_url?: string; description?: string; sort_order?: number; status?: string }) { return request<API.ResponseBase>('/api/v1/products/brands', { method: 'POST', data }); }
export async function updateBrand(id: string, data: { name?: string; logo_url?: string; description?: string; sort_order?: number; status?: string }) { return request<API.ResponseBase>(`/api/v1/products/brands/${id}`, { method: 'PUT', data }); }
export async function listProducts(params?: { keyword?: string; category_id?: string; barcode?: string; status?: string; page?: number; page_size?: number }) { return request<API.ResponseBase<API.PaginatedData>>('/api/v1/products', { method: 'GET', params }); }
export async function listAllProducts() { return collectResponsePages((page, pageSize) => listProducts({ page, page_size: pageSize })); }
export async function createProduct(data: { name: string; short_name?: string; barcode: string; category_id: string; brand_id?: string; specification?: string; unit: string; standard_price: number; cost_price: number; price_reason?: string; member_prices?: MemberPriceChange[]; description?: string; image_urls?: string[]; status?: string }) { return request<API.ResponseBase>('/api/v1/products', { method: 'POST', data }); }
export async function updateProduct(id: string, data: { name?: string; short_name?: string; barcode?: string; category_id?: string; brand_id?: string; specification?: string; unit?: string; description?: string; image_urls?: string[]; status?: string }) { return request<API.ResponseBase>(`/api/v1/products/${id}`, { method: 'PUT', data }); }
export async function changeProductPrice(id: string, type: Exclude<PriceType, 'member_price'>, data: { price: number; reason?: string }) { return request<API.ResponseBase>(`/api/v1/products/${id}/${type === 'standard_price' ? 'standard-price' : 'cost-price'}`, { method: 'PUT', data }); }
export async function changeMemberPrice(productId: string, levelId: string, data: { price: number; reason?: string }) { return request<API.ResponseBase>(`/api/v1/products/${productId}/member-prices/${levelId}`, { method: 'PUT', data }); }
export async function listMemberPrices(productId: string) { return request<API.ResponseBase<MemberPriceItem[]>>(`/api/v1/products/${productId}/member-prices`, { method: 'GET' }); }
export async function batchUpdateMemberPrices(productId: string, data: { reason?: string; items: MemberPriceChange[] }) { return request<API.ResponseBase>(`/api/v1/products/${productId}/member-prices`, { method: 'PUT', data }); }
export async function listPriceChangeLogs(params?: { product_id?: string; page?: number; page_size?: number }) { const { product_id, ...query } = params ?? {}; return request<API.ResponseBase<API.PaginatedData<PriceChangeLogItem>>>(`/api/v1/products/${product_id ?? ''}/price-change-logs`, { method: 'GET', params: query }); }
