import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { Button, Text, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

import type { ApiClient } from '../api/client';
import { ApiClientContext } from '../app/apiClientContext';
import { InventoryBatchScreen } from '../features/inventory/InventoryBatchScreen';

function renderScreen(request = jest.fn().mockResolvedValue({ order_no: 'INV-001' })) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } } });
  const apiClient = { request } as unknown as ApiClient;
  let renderer: ReactTestRenderer.ReactTestRenderer;

  act(() => {
    renderer = ReactTestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <ApiClientContext.Provider value={apiClient}>
          <InventoryBatchScreen />
        </ApiClientContext.Provider>
      </QueryClientProvider>,
    );
  });

  return { renderer: renderer!, request };
}

function textInput(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === label)!;
}

function press(renderer: ReactTestRenderer.ReactTestRenderer, title: string) {
  const button = renderer.root.findAllByType(Button).find(item => item.props.title === title)!;
  act(() => {
    button.props.onPress();
  });
}

async function submitSingleLine(
  renderer: ReactTestRenderer.ReactTestRenderer,
  options: { operation?: string; warehouse?: string; toWarehouse?: string } = {},
) {
  if (options.operation) {
    press(renderer, options.operation);
  }
  if (options.warehouse) {
    act(() => {
      textInput(renderer, '仓库').props.onChangeText(options.warehouse);
    });
  }
  if (options.toWarehouse) {
    act(() => {
      textInput(renderer, '目标仓库').props.onChangeText(options.toWarehouse);
    });
  }
  act(() => {
    textInput(renderer, '商品').props.onChangeText('product-1');
  });
  press(renderer, '加入');
  await act(async () => {
    press(renderer, '提交');
  });
}

describe('InventoryBatchScreen', () => {
  it('submits stock in lines through the API client and renders the order number', async () => {
    const { renderer, request } = renderScreen();

    await submitSingleLine(renderer, { warehouse: 'warehouse-1' });

    expect(request).toHaveBeenCalledWith('/api/v1/stock-in/batch', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ warehouse_id: 'warehouse-1', items: [{ product_id: 'product-1', quantity: 1 }] }),
    }));
    expect(renderer.root.findAllByType(Text).some(text => text.props.children === '提交成功：INV-001')).toBe(true);
  });

  it('maps stock out, stocktake and transfer operations to backend payloads', async () => {
    const cases = [
      {
        operation: '出库',
        warehouse: 'warehouse-out',
        path: '/api/v1/stock-out/batch',
        body: { warehouse_id: 'warehouse-out', items: [{ product_id: 'product-1', quantity: 1 }] },
      },
      {
        operation: '盘点',
        warehouse: 'warehouse-count',
        path: '/api/v1/stocktake/batch',
        body: { warehouse_id: 'warehouse-count', items: [{ product_id: 'product-1', actual_quantity: 1 }] },
      },
      {
        operation: '调拨',
        warehouse: 'warehouse-from',
        toWarehouse: 'warehouse-to',
        path: '/api/v1/transfer/batch',
        body: {
          from_warehouse_id: 'warehouse-from',
          to_warehouse_id: 'warehouse-to',
          items: [{ product_id: 'product-1', quantity: 1 }],
        },
      },
    ];

    for (const scenario of cases) {
      const { renderer, request } = renderScreen();
      await submitSingleLine(renderer, scenario);

      expect(request).toHaveBeenCalledWith(scenario.path, expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(scenario.body),
      }));
    }
  });

  it('guards invalid and failed submissions', async () => {
    const request = jest.fn().mockRejectedValue(new Error('后端拒绝'));
    const { renderer } = renderScreen(request);

    press(renderer, '提交');
    expect(request).not.toHaveBeenCalled();

    await submitSingleLine(renderer, { warehouse: 'warehouse-1' });

    expect(renderer.root.findAllByType(Text).some(text => text.props.children === '后端拒绝')).toBe(true);
  });
});
