import { createApiClient } from '../api/client';
import {
  listInventory,
  listSuppliers,
  listWarehouses,
  submitBatchStockIn,
  submitBatchStockOut,
  submitBatchStocktake,
  submitBatchTransfer,
} from '../api/inventory';

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ code: 0, message: 'ok', data }) } as Response;
}

function client(fetchMock: jest.Mock) {
  return createApiClient({ baseUrl: 'https://api.example.test', getAccessToken: async () => 'token', fetchImpl: fetchMock });
}

describe('inventory api', () => {
  it('posts all batch inventory operations to backend batch endpoints', async () => {
    const movement = { id: 'movement-1', order_no: 'INV-001', movement_type: 'stock_in' };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(movement));
    const api = client(fetchMock);

    await submitBatchStockIn(api, { warehouse_id: 'warehouse-1', items: [{ product_id: 'product-1', quantity: 2 }] });
    await submitBatchStockOut(api, { warehouse_id: 'warehouse-1', items: [{ product_id: 'product-1', quantity: 1 }] });
    await submitBatchTransfer(api, {
      from_warehouse_id: 'warehouse-1',
      to_warehouse_id: 'warehouse-2',
      items: [{ product_id: 'product-1', quantity: 1 }],
    });
    await submitBatchStocktake(api, { warehouse_id: 'warehouse-1', items: [{ product_id: 'product-1', actual_quantity: 5 }] });

    expect(fetchMock.mock.calls.map(call => [call[0], call[1].method])).toEqual([
      ['https://api.example.test/api/v1/stock-in/batch', 'POST'],
      ['https://api.example.test/api/v1/stock-out/batch', 'POST'],
      ['https://api.example.test/api/v1/transfer/batch', 'POST'],
      ['https://api.example.test/api/v1/stocktake/batch', 'POST'],
    ]);
  });

  it('loads inventory, warehouse and supplier lookup data from existing backend routes', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ items: [], total: 0, page: 1, page_size: 20 }));
    const api = client(fetchMock);

    await listInventory(api, { warehouseId: 'warehouse-1', page: 2, pageSize: 10 });
    await listWarehouses(api);
    await listSuppliers(api, { pageSize: 50 });

    expect(fetchMock.mock.calls.map(call => [call[0], call[1].method])).toEqual([
      ['https://api.example.test/api/v1/inventory?warehouse_id=warehouse-1&page=2&page_size=10', 'GET'],
      ['https://api.example.test/api/v1/warehouses?page=1&page_size=100', 'GET'],
      ['https://api.example.test/api/v1/suppliers?page=1&page_size=50', 'GET'],
    ]);
  });
});
