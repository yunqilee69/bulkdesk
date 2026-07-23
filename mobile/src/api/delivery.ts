import type { ApiClient } from './client';

export type DeliveryStatus = 'delivering' | 'signed';
export type DeliveryExceptionType = 'customer_absent' | 'customer_refused' | 'invalid_contact' | 'other';

export type DeliveryTask = {
  id: string;
  order_id: string;
  order_no: string;
  customer_id: string;
  customer_name: string;
  status: DeliveryStatus;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
  total_amount: number;
  product_quantity: number;
};

export type DeliveryDetail = DeliveryTask & {
  proof_image_urls: string[];
  signature_image_url?: string | null;
  sign_remark?: string | null;
  events?: {
    id: string;
    event_type: string;
    exception_type?: DeliveryExceptionType | null;
    remark?: string | null;
    created_at: string;
  }[];
  items: { product_id: string; product_name: string; barcode: string; quantity: number }[];
};

export type DeliverySignInput = {
  signer_name: string;
  proof_image_urls?: string[];
  signature_image_url?: string | null;
  remark?: string | null;
  collect_payment?: boolean;
  paid_amount?: number;
  payment_proof_image_urls?: string[];
};

export type DeliveryExceptionInput = {
  exception_type: DeliveryExceptionType;
  remark?: string | null;
};

export type ReturnableOrderItem = {
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
};

export type ReturnOrderItemInput = {
  source_order_item_id: string;
  quantity: number;
  condition?: 'normal' | 'expired' | 'damaged' | 'other';
  return_reason: string;
  remark?: string | null;
  should_stock_in?: boolean;
  warehouse_id?: string | null;
};

export type ReturnOrderCreateInput = {
  handling_delivery_id: string;
  items: ReturnOrderItemInput[];
  remark?: string | null;
};

export type ReturnOrder = {
  id: string;
  return_no: string;
};

export function listCurrentDeliveryTasks(client: ApiClient): Promise<{ deliveries: DeliveryTask[] }[]> {
  return client.request<{ deliveries: DeliveryTask[] }[]>('/api/v1/deliveries/current', { method: 'GET' });
}

export function getDeliveryTaskDetail(client: ApiClient, deliveryId: string): Promise<DeliveryDetail> {
  return client.request<DeliveryDetail>(`/api/v1/deliveries/${encodeURIComponent(deliveryId)}`, { method: 'GET' });
}

export function signDeliveryTask(client: ApiClient, deliveryId: string, data: DeliverySignInput): Promise<DeliveryDetail> {
  return client.request<DeliveryDetail>(`/api/v1/deliveries/${encodeURIComponent(deliveryId)}/sign`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function createDeliveryException(client: ApiClient, deliveryId: string, data: DeliveryExceptionInput): Promise<DeliveryDetail> {
  return client.request<DeliveryDetail>(`/api/v1/deliveries/${encodeURIComponent(deliveryId)}/exceptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function listReturnableItems(client: ApiClient, deliveryId: string): Promise<ReturnableOrderItem[]> {
  return client.request<ReturnableOrderItem[]>(`/api/v1/deliveries/${encodeURIComponent(deliveryId)}/returnable-items`, { method: 'GET' });
}

export function createReturnOrder(client: ApiClient, data: ReturnOrderCreateInput): Promise<ReturnOrder> {
  return client.request<ReturnOrder>('/api/v1/return-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
