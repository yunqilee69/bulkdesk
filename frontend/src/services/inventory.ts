import { request } from '@umijs/max';
import { collectPages, collectResponsePages } from './pagination';

export interface InventoryItem {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  locked: number;
  warning_quantity: number;
  available_quantity?: number;
  product_info?: string;
  warehouse_name?: string;
  supplier_id?: string;
  supplier_name?: string;
  production_date?: string;
  expiry_date?: string;
  location?: string;
}
export async function listWarehouses(params?: { page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData>>('/api/v1/warehouses', { method: 'GET', params });
}
export async function listAllWarehouses() {
  return collectResponsePages((page, pageSize) =>
    listWarehouses({ page, page_size: pageSize }),
  );
}
export async function createWarehouse(data: { name: string; address?: string; contact_person?: string; contact_phone?: string; is_default?: boolean; status?: string }) {
  return request<API.ResponseBase>('/api/v1/warehouses', { method: 'POST', data });
}
export async function updateWarehouse(id: string, data: { name?: string; address?: string; contact_person?: string; contact_phone?: string; is_default?: boolean; status?: string }) {
  return request<API.ResponseBase>(`/api/v1/warehouses/${id}`, { method: 'PUT', data });
}
export async function stockIn(data: { product_id: string; warehouse_id: string; quantity: number; remark?: string }) {
  return request<API.ResponseBase>('/api/v1/stock-in', { method: 'POST', data });
}
export async function batchStockIn(data: { warehouse_id: string; supplier_id?: string; items: Array<{ product_id: string; quantity: number; cost_price?: number }>; remark?: string }) {
  return request<API.ResponseBase>('/api/v1/stock-in/batch', { method: 'POST', data });
}
export async function stockOut(data: { product_id: string; warehouse_id: string; quantity: number; remark?: string }) {
  return request<API.ResponseBase>('/api/v1/stock-out', { method: 'POST', data });
}
export async function batchStockOut(data: { warehouse_id: string; items: Array<{ product_id: string; quantity: number }>; remark?: string }) {
  return request<API.ResponseBase>('/api/v1/stock-out/batch', { method: 'POST', data });
}
export async function transfer(data: { product_id: string; from_warehouse_id: string; to_warehouse_id: string; quantity: number; remark?: string }) {
  return request<API.ResponseBase>('/api/v1/transfer', { method: 'POST', data });
}
export async function batchTransfer(data: { from_warehouse_id: string; to_warehouse_id: string; items: Array<{ product_id: string; quantity: number }>; remark?: string }) {
  return request<API.ResponseBase>('/api/v1/transfer/batch', { method: 'POST', data });
}
export async function stocktake(data: { product_id: string; warehouse_id: string; actual_quantity: number; remark?: string }) {
  return request<API.ResponseBase>('/api/v1/stocktake', { method: 'POST', data });
}
export async function batchStocktake(data: { warehouse_id: string; items: Array<{ product_id: string; actual_quantity: number }>; remark?: string }) {
  return request<API.ResponseBase>('/api/v1/stocktake/batch', { method: 'POST', data });
}
export async function listMovements(params?: { movement_type?: string; warehouse_id?: string; page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData>>('/api/v1/movements', { method: 'GET', params });
}
export async function getMovement(id: string) {
  return request<API.ResponseBase>(`/api/v1/movements/${id}`, { method: 'GET' });
}

// 供应商相关 API
export async function listSuppliers(params?: { page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData>>('/api/v1/suppliers', { method: 'GET', params });
}
export async function listAllSuppliers() {
  return collectResponsePages((page, pageSize) =>
    listSuppliers({ page, page_size: pageSize }),
  );
}
export async function listInventoryItems(params?: { warehouse_id?: string; page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData<InventoryItem>>>('/api/v1/inventory', { method: 'GET', params });
}

export async function listAllInventory(warehouseId: string): Promise<InventoryItem[]> {
  return collectPages(async (page, pageSize) => {
    const response = await listInventoryItems({
      warehouse_id: warehouseId,
      page,
      page_size: pageSize,
    });
    if (response.code !== 0 || !response.data) {
      throw new Error(response.message || '库存加载失败');
    }
    return response.data;
  });
}
export async function createSupplier(data: { name: string; contact_person?: string; contact_phone?: string; address?: string; remark?: string; status?: string }) {
  return request<API.ResponseBase>('/api/v1/suppliers', { method: 'POST', data });
}
export async function updateSupplier(id: string, data: { name?: string; contact_person?: string; contact_phone?: string; address?: string; remark?: string; status?: string }) {
  return request<API.ResponseBase>(`/api/v1/suppliers/${id}`, { method: 'PUT', data });
}
