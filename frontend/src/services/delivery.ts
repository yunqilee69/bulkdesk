import { request } from '@umijs/max';

export type OrderDeliveryStatus = 'delivering' | 'signed';

export type OrderDeliveryEventType = 'assigned' | 'reassigned' | 'exception' | 'signed';

export type OrderDeliveryExceptionType =
  | 'customer_absent'
  | 'customer_refused'
  | 'invalid_contact'
  | 'other';

export interface OrderDeliveryEmployeeOption {
  id: string;
  name: string;
}

export interface OrderDeliveryEvent {
  id: string;
  delivery_id: string;
  event_type: OrderDeliveryEventType;
  from_employee_id?: string | null;
  from_employee_name?: string | null;
  to_employee_id?: string | null;
  to_employee_name?: string | null;
  exception_type?: OrderDeliveryExceptionType | null;
  remark?: string | null;
  operator_id: string;
  operator_name: string;
  created_at: string;
}

export interface OrderDeliveryItemSummary {
  product_id: string;
  product_name: string;
  barcode: string;
  quantity: number;
}

export interface OrderDeliverySummary {
  id: string;
  status: OrderDeliveryStatus;
  delivery_employee_id: string;
  delivery_employee_name: string;
  recipient_name: string;
  recipient_phone: string;
  delivery_address: string;
  assigned_at: string;
  signer_name?: string | null;
  signed_at?: string | null;
}

export interface OrderDeliveryCurrentRecord extends OrderDeliverySummary {
  order_id: string;
  order_no: string;
  customer_id: string;
  customer_name: string;
  total_amount: number;
  product_quantity: number;
  has_exception: boolean;
  latest_exception?: {
    exception_type: OrderDeliveryExceptionType;
    remark?: string | null;
    occurred_at: string;
  } | null;
}

export interface OrderDeliveryCurrentGroup {
  delivery_employee_id: string;
  delivery_employee_name: string;
  order_count: number;
  customer_count: number;
  product_quantity: number;
  total_amount: number;
  exception_order_count: number;
  deliveries: OrderDeliveryCurrentRecord[];
}

export interface OrderDeliveryArchiveRecord extends OrderDeliverySummary {
  order_id: string;
  order_no: string;
  customer_id: string;
  customer_name: string;
  total_amount: number;
  product_quantity: number;
  proof_image_urls: string[];
  sign_remark?: string | null;
}

export type OrderDeliveryArchivePage = API.PaginatedData<OrderDeliveryArchiveRecord>;

export interface OrderDeliveryDetail extends OrderDeliverySummary {
  order_id: string;
  order_no: string;
  customer_id: string;
  customer_name: string;
  total_amount: number;
  order_status:
    | 'placed'
    | 'shipping'
    | 'stocked_out'
    | 'delivered_unpaid'
    | 'completed'
    | 'cancelled';
  product_quantity: number;
  assigned_by_id: string;
  assigned_by_name: string;
  proof_image_urls: string[];
  sign_remark?: string | null;
  signed_by_id?: string | null;
  signed_by_name?: string | null;
  created_at: string;
  updated_at: string;
  events: OrderDeliveryEvent[];
  items: OrderDeliveryItemSummary[];
}

export interface OrderDeliveryCurrentParams {
  order_keyword?: string;
  customer_keyword?: string;
  employee_id?: string;
  has_exception?: boolean;
}

export interface OrderDeliveryArchiveParams {
  page?: number;
  page_size?: number;
  employee_id?: string;
  order_keyword?: string;
  customer_keyword?: string;
  signer_keyword?: string;
  signed_from?: string;
  signed_to?: string;
}

export interface OrderDeliveryReassignRequest {
  delivery_employee_id: string;
  reason?: string;
}

export interface OrderDeliveryExceptionRequest {
  exception_type: OrderDeliveryExceptionType;
  remark?: string;
}

export interface OrderDeliverySignInput {
  signer_name: string;
  proof_image_urls?: string[];
  remark?: string;
  collect_payment?: boolean;
  paid_amount?: number;
  payment_proof_image_urls?: string[];
}

export type OrderDeliverySignRequest = OrderDeliverySignInput;

export function listDeliveryEmployeeOptions() {
  return request<API.ResponseBase<OrderDeliveryEmployeeOption[]>>(
    '/api/v1/deliveries/employee-options',
    { method: 'GET' },
  );
}

export function listCurrentDeliveries(params?: OrderDeliveryCurrentParams) {
  return request<API.ResponseBase<OrderDeliveryCurrentGroup[]>>('/api/v1/deliveries/current', {
    method: 'GET',
    params,
  });
}

export function listDeliveryArchive(params?: OrderDeliveryArchiveParams) {
  return request<API.ResponseBase<OrderDeliveryArchivePage>>(
    '/api/v1/deliveries/archive',
    { method: 'GET', params },
  );
}

export function getDeliveryDetail(id: string) {
  return request<API.ResponseBase<OrderDeliveryDetail>>(`/api/v1/deliveries/${id}`, {
    method: 'GET',
  });
}

export function reassignDelivery(id: string, data: OrderDeliveryReassignRequest) {
  return request<API.ResponseBase<OrderDeliveryDetail>>(`/api/v1/deliveries/${id}/reassign`, {
    method: 'PUT',
    data,
  });
}

export function createDeliveryException(id: string, data: OrderDeliveryExceptionRequest) {
  return request<API.ResponseBase<OrderDeliveryDetail>>(
    `/api/v1/deliveries/${id}/exceptions`,
    { method: 'POST', data },
  );
}

export function signDelivery(id: string, data: OrderDeliverySignInput) {
  return request<API.ResponseBase<OrderDeliveryDetail>>(`/api/v1/deliveries/${id}/sign`, {
    method: 'PUT',
    data,
  });
}
