import { createApiClient } from '../api/client';
import { login, type LoginTokenResponse } from '../api/auth';
import { getMobileDashboard } from '../api/dashboard';
import { getMobileCustomerSummary, searchCustomers } from '../api/customers';
import { getMobileProductByBarcode } from '../api/products';

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ code: 0, message: 'ok', data }),
  } as Response;
}

function createTestClient(fetchMock: jest.Mock) {
  return createApiClient({
    baseUrl: 'https://api.example.test',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: fetchMock,
  });
}

describe('mobile read api', () => {
  it('unwraps the mobile dashboard response from the mobile endpoint', async () => {
    const dashboard = {
      actions: [{ key: 'scan', title: '扫码', path: '/products/barcode' }],
      summary: { openOrders: 2 },
      alerts: ['low stock'],
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(dashboard));

    await expect(getMobileDashboard(createTestClient(fetchMock))).resolves.toEqual(dashboard);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/mobile/dashboard',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('searches customers through the shared customer endpoint keyword query', async () => {
    const result = {
      items: [{ id: 'customer-1', name: '海淀批发部', contact_name: '李四', contact_phone: '13800000000' }],
      total: 1,
      page: 1,
      page_size: 20,
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(result));

    await expect(searchCustomers(createTestClient(fetchMock), '海淀')).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/customers?keyword=%E6%B5%B7%E6%B7%80',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('gets customer summaries from the mobile customer summary endpoint', async () => {
    const summary = {
      id: 'customer-1',
      name: '海淀批发部',
      contact_name: '李四',
      contact_phone: '13800000000',
      total_spent: 1200,
      order_count: 3,
      open_order_count: 1,
      delivering_order_count: 1,
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(summary));

    await expect(getMobileCustomerSummary(createTestClient(fetchMock), 'customer-1')).resolves.toEqual(summary);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/mobile/customers/customer-1/summary',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('gets barcode product summaries from the mobile barcode endpoint', async () => {
    const product = {
      id: 'product-1',
      name: '茉莉花茶',
      short_name: '花茶',
      barcode: '6901234567890',
      unit: '盒',
      standard_price: 39.9,
      status: 'active',
      warehouses: [{ warehouse_id: 'warehouse-1', warehouse_name: '主仓', quantity: 12, locked: 2, available_quantity: 10 }],
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(product));

    await expect(getMobileProductByBarcode(createTestClient(fetchMock), '6901234567890')).resolves.toEqual(product);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/mobile/products/barcode/6901234567890',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('posts login credentials and exposes token fields needed for secure storage', async () => {
    const tokens: LoginTokenResponse = {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
    };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(tokens));
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => null,
      fetchImpl: fetchMock,
    });

    await expect(login(client, { username: 'mobile', password: 'secret' })).resolves.toEqual(tokens);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ username: 'mobile', password: 'secret' }),
      }),
    );
  });
});
