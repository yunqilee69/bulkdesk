import type { ApiClient } from './client';

export type OrderDraftStatus = 'editing' | 'submitted' | 'abandoned';
export type OrderDraftEventType = 'created' | 'saved' | 'taken_over' | 'abandoned' | 'submitted' | 'submit_failed';

export type OrderDraftItemInput = {
  product_id: string;
  quantity: number;
  remark?: string | null;
};

export type OrderDraftItem = OrderDraftItemInput & {
  id: string;
  draft_id: string;
  created_at: string;
  updated_at: string;
};

export type OrderDraftEvent = {
  id: string;
  draft_id: string;
  event_type: OrderDraftEventType;
  actor_employee_id: string;
  actor_employee_name: string;
  previous_owner_employee_id?: string | null;
  previous_owner_employee_name?: string | null;
  new_owner_employee_id?: string | null;
  new_owner_employee_name?: string | null;
  version: number;
  remark?: string | null;
  created_at: string;
};

export type OrderDraft = {
  id: string;
  customer_id: string;
  owner_employee_id: string;
  status: OrderDraftStatus;
  remark?: string | null;
  version: number;
  submitted_order_id?: string | null;
  abandoned_at?: string | null;
  created_at: string;
  updated_at: string;
  items: OrderDraftItem[];
  events: OrderDraftEvent[];
};

export type OrderDraftCreateInput = {
  customer_id: string;
  remark?: string | null;
};

export type OrderDraftSaveInput = {
  version: number;
  items: OrderDraftItemInput[];
  remark?: string | null;
};

export type OrderDraftVersionInput = {
  version: number;
};

export type OrderDraftTakeoverResult = {
  draft: OrderDraft;
  previous_owner_employee_id: string;
  previous_owner_employee_name: string;
};

export type OrderDraftSubmitResult = {
  draft: OrderDraft;
  order_id: string;
  submission_id: string;
};

export function createOrderDraft(client: ApiClient, input: OrderDraftCreateInput): Promise<OrderDraft> {
  return client.request<OrderDraft>('/api/v1/order-drafts/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function listMyOrderDrafts(client: ApiClient): Promise<OrderDraft[]> {
  return client.request<OrderDraft[]>('/api/v1/order-drafts/', { method: 'GET' });
}

export function listAvailableOrderDrafts(client: ApiClient): Promise<OrderDraft[]> {
  return client.request<OrderDraft[]>('/api/v1/order-drafts/available', { method: 'GET' });
}

export function getOrderDraft(client: ApiClient, draftId: string): Promise<OrderDraft> {
  return client.request<OrderDraft>(`/api/v1/order-drafts/${encodeURIComponent(draftId)}`, { method: 'GET' });
}

export function saveOrderDraft(client: ApiClient, draftId: string, input: OrderDraftSaveInput): Promise<OrderDraft> {
  return client.request<OrderDraft>(`/api/v1/order-drafts/${encodeURIComponent(draftId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function takeOverOrderDraft(
  client: ApiClient,
  draftId: string,
  input: OrderDraftVersionInput,
): Promise<OrderDraftTakeoverResult> {
  return client.request<OrderDraftTakeoverResult>(`/api/v1/order-drafts/${encodeURIComponent(draftId)}/takeover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function abandonOrderDraft(client: ApiClient, draftId: string, input: OrderDraftVersionInput): Promise<OrderDraft> {
  return client.request<OrderDraft>(`/api/v1/order-drafts/${encodeURIComponent(draftId)}/abandon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function submitOrderDraft(
  client: ApiClient,
  draftId: string,
  input: OrderDraftVersionInput,
  idempotencyKey: string,
): Promise<OrderDraftSubmitResult> {
  return client.request<OrderDraftSubmitResult>(`/api/v1/order-drafts/${encodeURIComponent(draftId)}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(input),
  });
}
