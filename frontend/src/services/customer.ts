import { request } from '@umijs/max';
import { collectResponsePages } from './pagination';
export interface MemberPriceItem {
  id: string;
  product_id: string;
  level_id: string;
  barcode?: string;
  product_name?: string;
  level_name?: string;
  price: number;
}
export interface CustomerOut {
  id: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  level_id: string;
  level_name: string | null;
  address: string | null;
  remark: string | null;
  image_urls: string[] | null;
  total_spent: number;
  order_count: number;
  last_order_at: string | null;
  created_at: string;
  updated_at: string;
}
export async function listCustomers(params?: { keyword?: string; page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData>>('/api/v1/customers', { method: 'GET', params });
}
export async function listAllCustomers() {
  return collectResponsePages((page, pageSize) =>
    listCustomers({ page, page_size: pageSize }),
  );
}
export async function getCustomer(id: string) {
  return request<API.ResponseBase<CustomerOut>>(`/api/v1/customers/${id}`, { method: 'GET' });
}
export async function createCustomer(data: { name: string; contact_name: string; contact_phone: string; address?: string; level_id?: string; remark?: string; image_urls?: string[] }) {
  return request<API.ResponseBase>('/api/v1/customers', { method: 'POST', data });
}
export async function updateCustomer(id: string, data: { name?: string; contact_name?: string; contact_phone?: string; address?: string; level_id?: string; remark?: string; image_urls?: string[] }) {
  return request<API.ResponseBase>(`/api/v1/customers/${id}`, { method: 'PUT', data });
}
export async function listLevels(params?: { page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData>>('/api/v1/levels', { method: 'GET', params });
}
export async function listAllLevels() {
  return collectResponsePages((page, pageSize) =>
    listLevels({ page, page_size: pageSize }),
  );
}
export async function createLevel(data: { name: string; min_spent: number; sort_order?: number; is_default?: boolean }) {
  return request<API.ResponseBase>('/api/v1/levels', { method: 'POST', data });
}
export async function updateLevel(id: string, data: { name?: string; min_spent?: number; sort_order?: number; is_default?: boolean }) {
  return request<API.ResponseBase>(`/api/v1/levels/${id}`, { method: 'PUT', data });
}
export async function deleteLevel(id: string) {
  return request<API.ResponseBase>(`/api/v1/levels/${id}`, { method: 'DELETE' });
}
