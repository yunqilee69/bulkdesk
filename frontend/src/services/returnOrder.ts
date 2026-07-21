import { request } from '@umijs/max';
import type { ReturnProductCondition } from '@/pages/ReturnOrder/returnOrder';

export interface ReturnOrderItemInput {
  source_order_item_id: string;
  quantity: number;
  condition: ReturnProductCondition;
  return_reason: string;
  remark?: string;
  should_stock_in: boolean;
  warehouse_id?: string;
}

export interface ReturnOrderCreateInput {
  handling_delivery_id: string;
  items: ReturnOrderItemInput[];
  remark?: string;
}

export interface ReturnableOrderItem {
  source_order_item_id: string;
  order_id: string;
  order_no: string;
  product_id: string;
  product_name: string;
  barcode: string;
  unit_price: number;
  sold_quantity: number;
  returned_quantity: number;
  returnable_quantity: number;
}

export async function listReturnableOrderItems(deliveryId: string) {
  return request<API.ResponseBase<ReturnableOrderItem[]>>(
    `/api/v1/deliveries/${deliveryId}/returnable-items`,
    { method: 'GET' },
  );
}

export async function listReturnOrders(params?: { status?: string; customer_id?: string; page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData>>('/api/v1/return-orders', { method: 'GET', params });
}

export async function getReturnOrder(id: string) {
  return request<API.ResponseBase>(`/api/v1/return-orders/${id}`, { method: 'GET' });
}

export async function createReturnOrder(data: ReturnOrderCreateInput) {
  return request<API.ResponseBase>('/api/v1/return-orders', { method: 'POST', data });
}

export async function voidReturnOrder(id: string, data: { void_reason: string }) {
  return request<API.ResponseBase>(`/api/v1/return-orders/${id}/void`, { method: 'PUT', data });
}
