import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { createApiClient } from '../api/client';
import { ApiClientContext } from '../app/apiClientContext';
import { CustomerDetailScreen } from '../features/customers/CustomerDetailScreen';
import { CustomerListScreen } from '../features/customers/CustomerListScreen';
import { DashboardScreen } from '../features/dashboard/DashboardScreen';
import { BarcodeLookupScreen } from '../features/products/BarcodeLookupScreen';
import type { Scanner } from '../platform/contracts';

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ code: 0, message: 'ok', data }) } as Response;
}

async function renderWithApi(element: React.ReactElement, fetchMock: jest.Mock) {
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
        <ApiClientContext.Provider value={client}>{element}</ApiClientContext.Provider>
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

async function cleanup(queryClient: QueryClient, renderer: ReactTestRenderer.ReactTestRenderer) {
  queryClient.clear();
  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
}

describe('mobile read screens', () => {
  it('loads dashboard actions and alerts from the mobile dashboard endpoint', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        actions: [{ key: 'barcode', title: '条码查询', path: '/products/barcode' }],
        summary: { open_orders: 2 },
        alerts: ['低库存商品 3 个'],
      }),
    );

    const { queryClient, renderer } = await renderWithApi(<DashboardScreen />, fetchMock);

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/api/v1/mobile/dashboard',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(JSON.stringify(renderer.toJSON())).toContain('条码查询');
      expect(JSON.stringify(renderer.toJSON())).toContain('低库存商品 3 个');
    });
    await cleanup(queryClient, renderer);
  });

  it('searches customers and renders returned customer cards', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        items: [{ id: 'customer-1', name: '海淀批发部', contact_name: '李四', contact_phone: '13800000000' }],
        total: 1,
        page: 1,
        page_size: 20,
      }),
    );

    const { queryClient, renderer } = await renderWithApi(<CustomerListScreen />, fetchMock);
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '客户关键字' }).props.onChangeText('海淀');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '搜索客户' }).props.onPress();
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/api/v1/customers?keyword=%E6%B5%B7%E6%B7%80',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(JSON.stringify(renderer.toJSON())).toContain('海淀批发部');
    });
    await cleanup(queryClient, renderer);
  });

  it('loads a mobile customer summary when a customer id is supplied', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 'customer-1',
        name: '海淀批发部',
        contact_name: '李四',
        contact_phone: '13800000000',
        level_name: '金牌',
        total_spent: 1200,
        order_count: 3,
        open_order_count: 1,
        delivering_order_count: 1,
      }),
    );

    const { queryClient, renderer } = await renderWithApi(<CustomerDetailScreen customerId="customer-1" />, fetchMock);

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/api/v1/mobile/customers/customer-1/summary',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(JSON.stringify(renderer.toJSON())).toContain('累计消费：1200');
    });
    await cleanup(queryClient, renderer);
  });

  it('looks up barcode products and renders warehouse availability', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 'product-1',
        name: '茉莉花茶',
        barcode: '6901234567890',
        unit: '盒',
        standard_price: 39.9,
        status: 'active',
        warehouses: [{ warehouse_id: 'warehouse-1', warehouse_name: '主仓', quantity: 12, locked: 2, available_quantity: 10 }],
      }),
    );

    const { queryClient, renderer } = await renderWithApi(<BarcodeLookupScreen />, fetchMock);
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '商品条码' }).props.onChangeText('6901234567890');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '查询商品' }).props.onPress();
    });

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/api/v1/mobile/products/barcode/6901234567890',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(JSON.stringify(renderer.toJSON())).toContain('茉莉花茶');
      expect(JSON.stringify(renderer.toJSON())).toContain('主仓 可用 10');
    });
    await cleanup(queryClient, renderer);
  });

  it('scans a barcode, fills the input, and looks up the product', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 'product-1',
        name: '茉莉花茶',
        barcode: '6901234567890',
        unit: '盒',
        standard_price: 39.9,
        status: 'active',
        warehouses: [{ warehouse_id: 'warehouse-1', warehouse_name: '主仓', quantity: 12, locked: 2, available_quantity: 10 }],
      }),
    );
    const scanner: Scanner = {
      scanOnce: jest.fn().mockResolvedValue({
        value: '6901234567890',
        format: 'ean-13',
        kind: 'barcode',
        scannedAt: '2026-07-23T00:00:00.000Z',
      }),
    };

    const { queryClient, renderer } = await renderWithApi(<BarcodeLookupScreen scanner={scanner} />, fetchMock);
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '扫描条码' }).props.onPress();
    });

    await waitForAssertion(() => {
      expect(renderer.root.findByProps({ accessibilityLabel: '商品条码' }).props.value).toBe('6901234567890');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/api/v1/mobile/products/barcode/6901234567890',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(JSON.stringify(renderer.toJSON())).toContain('茉莉花茶');
    });
    await cleanup(queryClient, renderer);
  });

  it('opens the real camera scanner for barcode lookup by default', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 'product-1',
        name: '茉莉花茶',
        barcode: '6901234567890',
        unit: '盒',
        standard_price: 39.9,
        status: 'active',
        warehouses: [{ warehouse_id: 'warehouse-1', warehouse_name: '主仓', quantity: 12, locked: 2, available_quantity: 10 }],
      }),
    );

    const { queryClient, renderer } = await renderWithApi(<BarcodeLookupScreen />, fetchMock);
    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({ title: '扫描条码' }).props.onPress();
    });

    const camera = renderer.root.findByProps({ testID: 'VisionCamera' });
    expect(camera.props.isActive).toBe(true);

    await ReactTestRenderer.act(async () => {
      camera.props.codeScanner.onCodeScanned([{ type: 'ean-13', value: '6901234567890' }]);
    });

    await waitForAssertion(() => {
      expect(renderer.root.findByProps({ accessibilityLabel: '商品条码' }).props.value).toBe('6901234567890');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/api/v1/mobile/products/barcode/6901234567890',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(JSON.stringify(renderer.toJSON())).not.toContain('相机扫码中');
    });

    await cleanup(queryClient, renderer);
  });

  it('shows a recoverable scanner error when scanning fails', async () => {
    const fetchMock = jest.fn();
    const scanner: Scanner = {
      scanOnce: jest.fn().mockRejectedValue(new Error('摄像头未授权')),
    };

    const { queryClient, renderer } = await renderWithApi(<BarcodeLookupScreen scanner={scanner} />, fetchMock);
    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({ title: '扫描条码' }).props.onPress();
    });

    expect(JSON.stringify(renderer.toJSON())).toContain('摄像头未授权');
    expect(JSON.stringify(renderer.toJSON())).toContain('请重试或手动输入条码');
    expect(fetchMock).not.toHaveBeenCalled();
    await cleanup(queryClient, renderer);
  });
});
