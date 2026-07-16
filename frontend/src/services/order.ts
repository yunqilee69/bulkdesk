import { request } from '@umijs/max';
export async function listOrders(params?: { status?: string; customer_id?: string; keyword?: string; page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData>>('/api/v1/orders', { method: 'GET', params });
}
export async function getOrder(id: string) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}`, { method: 'GET' });
}
export async function createOrder(data: { customer_id: string; warehouse_id: string; items: Array<{ product_id: string; quantity: number }>; remark?: string }) {
  return request<API.ResponseBase>('/api/v1/orders', { method: 'POST', data });
}
export async function shipOrder(id: string, data?: { remark?: string }) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}/ship`, { method: 'PUT', data });
}
export async function confirmPayment(id: string, data?: { remark?: string }) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}/confirm-payment`, { method: 'PUT', data });
}
export async function completeOrder(id: string, data?: { remark?: string }) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}/complete`, { method: 'PUT', data });
}
export async function cancelOrder(id: string, data: { cancel_reason: string }) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}/cancel`, { method: 'PUT', data });
}
