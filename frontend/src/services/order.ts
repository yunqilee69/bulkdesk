import { request } from '@umijs/max';

import type { OrderDeliveryExceptionType, OrderDeliverySummary } from './delivery';

export type OrderStatus =
  | 'placed'
  | 'shipping'
  | 'stocked_out'
  | 'delivered_unpaid'
  | 'completed'
  | 'cancelled';

export interface OrderDeliveryLatestException {
  exception_type: OrderDeliveryExceptionType;
  remark: string | null;
  occurred_at: string;
}

export interface OrderDeliveryOrderSummary extends OrderDeliverySummary {
  signer_name: string | null;
  signed_at: string | null;
  proof_image_urls: string[];
  sign_remark: string | null;
  signed_by_id: string | null;
  signed_by_name: string | null;
  latest_exception: OrderDeliveryLatestException | null;
}

export type OrderInventoryAllocationStatus = 'reserved' | 'shipped' | 'released' | 'returned';

export interface OrderInventoryAllocationRecord {
  id: string;
  order_id: string;
  order_item_id: string;
  product_id: string;
  warehouse_id: string;
  warehouse_name: string | null;
  quantity: number;
  status: OrderInventoryAllocationStatus;
}

export interface OrderItemRecord {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  barcode: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  allocations: OrderInventoryAllocationRecord[];
}

export interface OrderStatusLogRecord {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  operator: string | null;
  remark: string | null;
  created_at: string;
}

export interface OrderOut {
  id: string;
  order_no: string;
  customer_id: string;
  customer_name: string | null;
  total_amount: number;
  status: OrderStatus;
  remark: string | null;
  shipping_started_at: string | null;
  shipping_started_by: string | null;
  stock_out_at: string | null;
  stock_out_by: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  paid_amount: number | null;
  payment_proof_image_urls: string[];
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItemRecord[];
  status_logs: OrderStatusLogRecord[];
  delivery: OrderDeliveryOrderSummary | null;
}

export type OrderRecord = OrderOut;

export interface OrderStockOutInput {
  delivery_employee_id: string;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
}

export interface OrderCompleteInput {
  paid_amount: number;
  payment_proof_image_urls: string[];
}

export async function listOrders(params?: { status?: string; customer_id?: string; keyword?: string; page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData<OrderOut>>>('/api/v1/orders', { method: 'GET', params });
}
export async function getOrder(id: string) {
  return request<API.ResponseBase<OrderOut>>(`/api/v1/orders/${id}`, { method: 'GET' });
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
export async function stockOutOrder(id: string, data: OrderStockOutInput) {
  return request<API.ResponseBase<OrderOut>>(`/api/v1/orders/${id}/stock-out`, { method: 'PUT', data });
}
export async function completeOrder(id: string, data: OrderCompleteInput) {
  return request<API.ResponseBase<OrderOut>>(`/api/v1/orders/${id}/complete`, { method: 'PUT', data });
}
export async function cancelOrder(id: string, data: { cancel_reason: string }) {
  return request<API.ResponseBase>(`/api/v1/orders/${id}/cancel`, { method: 'PUT', data });
}
