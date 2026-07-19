import { request } from '@umijs/max';
export async function listOrders(params?: { status?: string; customer_id?: string; keyword?: string; page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData>>('/api/v1/orders', { method: 'GET', params });
}
export async function getOrder(id: string) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}`, { method: 'GET' });
}
export interface OrderShippingWarehouseOption {
  warehouse_id: string;
  warehouse_name: string;
  available_quantity: number;
}

export interface OrderShippingItemOptions {
  order_item_id: string;
  product_id: string;
  warehouses: OrderShippingWarehouseOption[];
}

export interface OrderShippingOptions {
  items: OrderShippingItemOptions[];
}

export async function getOrderShippingOptions(id: string) {
  return request<API.ResponseBase<OrderShippingOptions>>(`/api/v1/orders/${id}/shipping-options`, { method: 'GET' });
}
export interface OrderShipmentAllocationInput {
  order_item_id: string;
  warehouse_id: string;
  quantity: number;
}

export async function createOrder(data: { customer_id: string; items: Array<{ product_id: string; quantity: number }>; remark?: string }) {
  return request<API.ResponseBase>('/api/v1/orders', { method: 'POST', data });
}
export async function startShippingOrder(id: string, data: { allocations: OrderShipmentAllocationInput[] }) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}/start-shipping`, { method: 'PUT', data });
}
export async function updateShippingAllocations(id: string, data: { allocations: OrderShipmentAllocationInput[] }) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}/shipping-allocations`, { method: 'PUT', data });
}
export async function stockOutOrder(id: string) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}/stock-out`, { method: 'PUT' });
}
export async function deliverOrder(id: string) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}/deliver`, { method: 'PUT' });
}
export async function completeOrder(id: string) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}/complete`, { method: 'PUT' });
}
export async function cancelOrder(id: string, data: { cancel_reason: string }) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}/cancel`, { method: 'PUT', data });
}
