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

describe('orders workspace autosave', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('autosaves dirty draft items after 500ms', async () => {
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
      if (url.endsWith('/api/v1/mobile/products/barcode/product-1') && init?.method === 'GET') {
        return jsonResponse({ barcode: 'product-1', id: 'product-1', name: '测试商品', standard_price: 12, status: 'active', unit: '箱', warehouses: [] });
      }
      if (url.endsWith('/api/v1/order-drafts/draft-1') && init?.method === 'PUT') {
        return jsonResponse(draft(2, [{ id: 'item-1', draft_id: 'draft-1', product_id: 'product-1', quantity: 1 }]));
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

    jest.useFakeTimers();
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '商品条码' }).props.onChangeText('product-1');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '加购' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls.some(call => call[0] === 'https://api.example.test/api/v1/order-drafts/draft-1' && call[1]?.method === 'PUT')).toBe(false);

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    const saveCall = fetchMock.mock.calls.find(call => call[0] === 'https://api.example.test/api/v1/order-drafts/draft-1' && call[1]?.method === 'PUT');
    expect(JSON.parse((saveCall?.[1] as RequestInit).body as string)).toEqual({
      items: [{ product_id: 'product-1', quantity: 1, remark: null }],
      remark: null,
      version: 1,
    });

    queryClient.clear();
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });
});
