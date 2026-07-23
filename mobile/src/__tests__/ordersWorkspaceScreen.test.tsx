import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { createApiClient } from '../api/client';
import { ApiClientContext } from '../app/apiClientContext';
import { OrdersWorkspaceScreen } from '../features/orders/OrdersWorkspaceScreen';

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ code: 0, message: 'ok', data }) } as Response;
}

function draft(version = 1, items: unknown[] = [], status = 'editing', id = 'draft-1', customerId = 'customer-1') {
  return {
    id,
    customer_id: customerId,
    owner_employee_id: 'employee-1',
    status,
    version,
    created_at: '2026-07-23 10:00:00',
    updated_at: '2026-07-23 10:00:00',
    items,
    events: [],
  };
}

function productBarcode() {
  return {
    barcode: 'product-1',
    id: 'product-1',
    name: '测试商品',
    standard_price: 12,
    status: 'active',
    unit: '箱',
    warehouses: [],
  };
}

async function renderWithApi(fetchMock: jest.Mock) {
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    getAccessToken: async () => 'token',
    fetchImpl: fetchMock,
  });
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

describe('orders workspace screen', () => {
  const originalCrypto = (globalThis as { crypto?: unknown }).crypto;

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
  });

	  it('creates, saves and submits a backend order draft', async () => {
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
        return jsonResponse(productBarcode());
      }
      if (url.endsWith('/api/v1/order-drafts/draft-1') && init?.method === 'PUT') {
        return jsonResponse(draft(2, [{ id: 'item-1', draft_id: 'draft-1', product_id: 'product-1', quantity: 1 }]));
      }
      if (url.endsWith('/api/v1/order-drafts/draft-1/submit') && init?.method === 'POST') {
        return jsonResponse({
          draft: draft(3, [{ id: 'item-1', draft_id: 'draft-1', product_id: 'product-1', quantity: 1 }], 'submitted'),
          order_id: 'order-1',
          submission_id: 'submission-1',
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
      renderer.root.findByProps({ accessibilityLabel: '商品条码' }).props.onChangeText('product-1');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '加购' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '保存草稿' }).props.onPress();
    });
    await waitForAssertion(() => {
      const saveCall = fetchMock.mock.calls.find(call => call[0] === 'https://api.example.test/api/v1/order-drafts/draft-1');
      if (!saveCall) {
        throw new Error('save call not found');
      }
      const saveOptions = saveCall[1] as RequestInit;
      expect(saveOptions).toMatchObject({ method: 'PUT' });
      expect(JSON.parse(saveOptions.body as string)).toEqual({
        items: [{ product_id: 'product-1', quantity: 1, remark: null }],
        remark: null,
        version: 1,
      });
      expect(JSON.stringify(renderer.toJSON())).toContain('版本：2');
    });

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '提交' }).props.onPress();
    });
	    await waitForAssertion(() => {
	      expect(fetchMock).toHaveBeenCalledWith(
	        'https://api.example.test/api/v1/order-drafts/draft-1/submit',
        expect.objectContaining({
          headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
          method: 'POST',
        }),
	      );
	      expect(JSON.stringify(renderer.toJSON())).toContain('已提交订单：order-1');
	      expect(JSON.stringify(renderer.toJSON())).toContain('请选择或打开一个客户草稿。');
	      expect(JSON.stringify(renderer.toJSON())).not.toContain('版本：3');
	    });
	    await waitForAssertion(() => {
	      expect(fetchMock.mock.calls.filter(call => call[0] === 'https://api.example.test/api/v1/order-drafts/' && call[1]?.method === 'GET').length).toBeGreaterThanOrEqual(2);
	      expect(fetchMock.mock.calls.filter(call => call[0] === 'https://api.example.test/api/v1/order-drafts/available' && call[1]?.method === 'GET').length).toBeGreaterThanOrEqual(2);
	    });

    queryClient.clear();
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });

	  it('reuses the same random idempotency key after a failed submit retry', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: jest.fn(() => 'idem-1') },
    });
    let submitAttempts = 0;
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
        return jsonResponse(productBarcode());
      }
      if (url.endsWith('/api/v1/order-drafts/draft-1/submit') && init?.method === 'POST') {
        submitAttempts += 1;
        if (submitAttempts === 1) {
          return { ok: false, status: 500, json: async () => ({ code: 500, message: 'temporary failure', data: null }) } as Response;
        }
        return jsonResponse({ draft: draft(2, [], 'submitted'), order_id: 'order-1', submission_id: 'submission-1' });
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
      renderer.root.findByProps({ accessibilityLabel: '商品条码' }).props.onChangeText('product-1');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '加购' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '提交' }).props.onPress();
    });
    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('temporary failure');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '提交' }).props.onPress();
    });
    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('已提交订单：order-1');
    });

    const submitCalls = fetchMock.mock.calls.filter(call => call[0] === 'https://api.example.test/api/v1/order-drafts/draft-1/submit');
    expect(submitCalls).toHaveLength(2);
    expect(submitCalls.map(call => (call[1] as RequestInit).headers)).toEqual([
      expect.objectContaining({ 'Idempotency-Key': 'idem-1' }),
      expect.objectContaining({ 'Idempotency-Key': 'idem-1' }),
    ]);

    queryClient.clear();
	    await ReactTestRenderer.act(async () => {
	      renderer.unmount();
	    });
	  });

	  it('blocks empty draft submission with a local validation message', async () => {
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
	      renderer.root.findByProps({ title: '提交' }).props.onPress();
	    });

	    expect(JSON.stringify(renderer.toJSON())).toContain('请至少添加一件商品');
	    expect(fetchMock.mock.calls.some(call => call[0] === 'https://api.example.test/api/v1/order-drafts/draft-1/submit')).toBe(false);

	    queryClient.clear();
	    await ReactTestRenderer.act(async () => {
	      renderer.unmount();
	    });
	  });

	  it('shows available drafts and takes one over by id and version', async () => {
	    let takeoverDone = false;
	    const availableDraft = draft(4, [], 'editing', 'draft-available', 'customer-2');
	    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
	      if (url.endsWith('/api/v1/order-drafts/available') && init?.method === 'GET') {
	        return jsonResponse(takeoverDone ? [] : [availableDraft]);
	      }
	      if (url.endsWith('/api/v1/order-drafts/') && init?.method === 'GET') {
	        return jsonResponse(takeoverDone ? [draft(5, [], 'editing', 'draft-available', 'customer-2')] : []);
	      }
	      if (url.endsWith('/api/v1/order-drafts/draft-available/takeover') && init?.method === 'POST') {
	        takeoverDone = true;
	        return jsonResponse({
	          draft: draft(5, [], 'editing', 'draft-available', 'customer-2'),
	          previous_owner_employee_id: 'employee-old',
	          previous_owner_employee_name: '张三',
	        });
	      }
	      throw new Error(`Unexpected request ${init?.method ?? 'GET'} ${url}`);
	    });

	    const { queryClient, renderer } = await renderWithApi(fetchMock);
	    await waitForAssertion(() => {
	      expect(JSON.stringify(renderer.toJSON())).toContain('可接手草稿：1');
	      expect(JSON.stringify(renderer.toJSON())).toContain('draft-available');
	    });

	    await ReactTestRenderer.act(async () => {
	      renderer.root.findByProps({ title: '接手草稿' }).props.onPress();
	    });

	    await waitForAssertion(() => {
	      const takeoverCall = fetchMock.mock.calls.find(call => call[0] === 'https://api.example.test/api/v1/order-drafts/draft-available/takeover');
	      if (!takeoverCall) {
	        throw new Error('takeover call not found');
	      }
	      expect(JSON.parse((takeoverCall[1] as RequestInit).body as string)).toEqual({ version: 4 });
	      expect(JSON.stringify(renderer.toJSON())).toContain('已接手：张三');
	      expect(JSON.stringify(renderer.toJSON())).toContain('customer-2');
	      expect(fetchMock.mock.calls.filter(call => call[0] === 'https://api.example.test/api/v1/order-drafts/' && call[1]?.method === 'GET').length).toBeGreaterThanOrEqual(2);
	      expect(fetchMock.mock.calls.filter(call => call[0] === 'https://api.example.test/api/v1/order-drafts/available' && call[1]?.method === 'GET').length).toBeGreaterThanOrEqual(2);
	    });

	    queryClient.clear();
	    await ReactTestRenderer.act(async () => {
	      renderer.unmount();
	    });
	  });

	  it('abandons the active draft and closes its tab', async () => {
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
	      if (url.endsWith('/api/v1/order-drafts/draft-1/abandon') && init?.method === 'POST') {
	        return jsonResponse(draft(2, [], 'abandoned'));
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
	      renderer.root.findByProps({ title: '作废草稿' }).props.onPress();
	    });

	    await waitForAssertion(() => {
	      const abandonCall = fetchMock.mock.calls.find(call => call[0] === 'https://api.example.test/api/v1/order-drafts/draft-1/abandon');
	      if (!abandonCall) {
	        throw new Error('abandon call not found');
	      }
	      expect(JSON.parse((abandonCall[1] as RequestInit).body as string)).toEqual({ version: 1 });
	      expect(JSON.stringify(renderer.toJSON())).toContain('草稿已作废');
	      expect(JSON.stringify(renderer.toJSON())).toContain('请选择或打开一个客户草稿。');
	      expect(fetchMock.mock.calls.filter(call => call[0] === 'https://api.example.test/api/v1/order-drafts/' && call[1]?.method === 'GET').length).toBeGreaterThanOrEqual(2);
	      expect(fetchMock.mock.calls.filter(call => call[0] === 'https://api.example.test/api/v1/order-drafts/available' && call[1]?.method === 'GET').length).toBeGreaterThanOrEqual(2);
	    });

	    queryClient.clear();
	    await ReactTestRenderer.act(async () => {
	      renderer.unmount();
	    });
	  });
	});
