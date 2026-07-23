import type { ApiClient } from './client';

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  page_size: number;
};

export type InventoryListItem = {
  id: string;
  product_id: string;
  product_info?: string | null;
  warehouse_id: string;
  warehouse_name?: string | null;
  quantity: number;
  locked: number;
  warning_quantity: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  available_quantity: number;
};

export type WarehouseLookupItem = {
  id: string;
  name: string;
  address?: string | null;
  contact_person?: string | null;
  contact_phone?: string | null;
  is_default: boolean;
  status: string;
};

export type SupplierLookupItem = {
  id: string;
  name: string;
  contact_person?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  status: string;
};

export type InventoryBatchItem = {
  product_id: string;
  quantity: number;
  cost_price?: number | null;
};

export type StocktakeBatchItem = {
  product_id: string;
  actual_quantity: number;
};

export type InventoryMovement = {
  id: string;
  order_no: string;
  movement_type: 'stock_in' | 'stock_out' | 'transfer' | 'stocktake';
  warehouse_id?: string | null;
  from_warehouse_id?: string | null;
  to_warehouse_id?: string | null;
  remark?: string | null;
};

export type BatchStockInInput = {
  warehouse_id: string;
  supplier_id?: string | null;
  items: InventoryBatchItem[];
  remark?: string | null;
};

export type BatchStockOutInput = {
  warehouse_id: string;
  items: InventoryBatchItem[];
  remark?: string | null;
};

export type BatchTransferInput = {
  from_warehouse_id: string;
  to_warehouse_id: string;
  items: InventoryBatchItem[];
  remark?: string | null;
};

export type BatchStocktakeInput = {
  warehouse_id: string;
  items: StocktakeBatchItem[];
  remark?: string | null;
};

export type InventoryLookupOptions = {
  page?: number;
  pageSize?: number;
};

export type InventoryListOptions = InventoryLookupOptions & {
  warehouseId?: string;
};

function appendPagination(params: URLSearchParams, options: InventoryLookupOptions): void {
  params.append('page', String(options.page ?? 1));
  params.append('page_size', String(options.pageSize ?? 100));
}

function withQuery(path: string, params: URLSearchParams): string {
  return `${path}?${params.toString()}`;
}

function postMovement<T>(client: ApiClient, path: string, data: T): Promise<InventoryMovement> {
  return client.request<InventoryMovement>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function submitBatchStockIn(client: ApiClient, data: BatchStockInInput): Promise<InventoryMovement> {
  return postMovement(client, '/api/v1/stock-in/batch', data);
}

export function submitBatchStockOut(client: ApiClient, data: BatchStockOutInput): Promise<InventoryMovement> {
  return postMovement(client, '/api/v1/stock-out/batch', data);
}

export function submitBatchTransfer(client: ApiClient, data: BatchTransferInput): Promise<InventoryMovement> {
  return postMovement(client, '/api/v1/transfer/batch', data);
}

export function submitBatchStocktake(client: ApiClient, data: BatchStocktakeInput): Promise<InventoryMovement> {
  return postMovement(client, '/api/v1/stocktake/batch', data);
}

export function listInventory(
  client: ApiClient,
  options: InventoryListOptions = {},
): Promise<PaginatedResponse<InventoryListItem>> {
  const params = new URLSearchParams();
  if (options.warehouseId) {
    params.append('warehouse_id', options.warehouseId);
  }
  appendPagination(params, options);
  return client.request<PaginatedResponse<InventoryListItem>>(withQuery('/api/v1/inventory', params), { method: 'GET' });
}

export function listWarehouses(
  client: ApiClient,
  options: InventoryLookupOptions = {},
): Promise<PaginatedResponse<WarehouseLookupItem>> {
  const params = new URLSearchParams();
  appendPagination(params, options);
  return client.request<PaginatedResponse<WarehouseLookupItem>>(withQuery('/api/v1/warehouses', params), { method: 'GET' });
}

export function listSuppliers(
  client: ApiClient,
  options: InventoryLookupOptions = {},
): Promise<PaginatedResponse<SupplierLookupItem>> {
  const params = new URLSearchParams();
  appendPagination(params, options);
  return client.request<PaginatedResponse<SupplierLookupItem>>(withQuery('/api/v1/suppliers', params), { method: 'GET' });
}
