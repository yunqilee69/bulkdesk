import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { createApiClient } from '../api/client';
import { ApiClientContext } from '../app/apiClientContext';
import { OrdersWorkspaceScreen } from '../features/orders/OrdersWorkspaceScreen';

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ code: 0, message: 'ok', data }) } as Response;
}

function draft(version = 1, items: unknown[] = []) {
  return {
    id: 'draft-1',
    customer_id: 'customer-1',
    owner_employee_id: 'employee-1',
    status: 'editing',
    version,
    created_at: '2026-07-23 10:00:00',
    updated_at: '2026-07-23 10:00:00',
    items,
    events: [],
  };
}

async function renderWithApi(fetchMock: jest.Mock) {
  const client = createApiClient({ baseUrl: 'https://api.example.test', getAccessToken: async () => 'token', fetchImpl: fetchMock });
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity, retry: false } } });
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <ApiClientContext.Provider value={client}>
          <OrdersWorkspaceScreen />
        </ApiClientContext.Provider>
      </QueryClientProvider>,
    );
  });
  return { queryClient, renderer };
}

async function waitForAssertion(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await ReactTestRenderer.act(async () => {
        await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
      });
    }
  }
  throw lastError;
}

describe('orders workspace barcode add', () => {
  it('resolves scanned barcode through the mobile product API before adding to the draft', async () => {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/order-drafts/available') && init?.method === 'GET') {
        return jsonResponse([]);
      }
      if (url.endsWith('/api/v1/order-drafts/') && init?.method === 'GET') {
        return jsonResponse([]);
      }
      if (url.endsWith('/api/v1/order-drafts/') && init?.method === 'POST') {
        return jsonResponse(draft());
      }
      if (url.endsWith('/api/v1/mobile/products/barcode/6901234567890') && init?.method === 'GET') {
        return jsonResponse({
          barcode: '6901234567890',
          id: 'product-1',
          name: '茉莉花茶',
          standard_price: 12,
          status: 'active',
          unit: '箱',
          warehouses: [],
        });
      }
      throw new Error(`Unexpected request ${init?.method ?? 'GET'} ${url}`);
    });
    const { queryClient, renderer } = await renderWithApi(fetchMock);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '客户ID' }).props.onChangeText('customer-1');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '打开草稿' }).props.onPress();
    });
    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('customer-1');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '商品条码' }).props.onChangeText('6901234567890');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '加购' }).props.onPress();
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/api/v1/mobile/products/barcode/6901234567890',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(JSON.stringify(renderer.toJSON())).toContain('product-1');
      expect(JSON.stringify(renderer.toJSON())).toContain('商品数量：1');
      expect(JSON.stringify(renderer.toJSON())).not.toContain('6901234567890 × 1');
    });

    queryClient.clear();
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });
});
