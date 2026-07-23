import type { ApiClient } from './client';

export type CustomerListItem = {
  id: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  level_id?: string;
  level_name?: string | null;
  address?: string | null;
  remark?: string | null;
  image_urls?: string[] | null;
  total_spent?: number;
  order_count?: number;
  last_order_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type MobileCustomerSummary = {
  id: string;
  name: string;
  contact_name: string;
  contact_phone: string;
  level_name?: string | null;
  address?: string | null;
  total_spent: number;
  order_count: number;
  last_order_at?: string | null;
  open_order_count: number;
  delivering_order_count: number;
};

export async function searchCustomers(
  client: ApiClient,
  keyword: string,
): Promise<PaginatedResponse<CustomerListItem>> {
  return client.request<PaginatedResponse<CustomerListItem>>(`/api/v1/customers?keyword=${encodeURIComponent(keyword)}`, {
    method: 'GET',
  });
}

export async function getMobileCustomerSummary(client: ApiClient, customerId: string): Promise<MobileCustomerSummary> {
  return client.request<MobileCustomerSummary>(`/api/v1/mobile/customers/${encodeURIComponent(customerId)}/summary`, {
    method: 'GET',
  });
}
