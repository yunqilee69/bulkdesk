import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { createApiClient } from '../api/client';
import { ApiClientContext } from '../app/apiClientContext';
import { CartProvider } from '../features/cart/cartStore';
import { ProductCard } from '../features/products/ProductCard';
import { ProductHomeScreen } from '../features/products/ProductHomeScreen';
import type { Scanner } from '../platform/contracts';

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ code: 0, message: 'ok', data }) } as Response;
}

function createCatalogFetchMock() {
  return jest.fn((input: string) => {
    if (input.includes('/api/v1/mobile/product-categories')) {
      return Promise.resolve(jsonResponse([{ id: 'category-1', name: '粮油' }]));
    }
    if (input.includes('/api/v1/mobile/products')) {
      return Promise.resolve(jsonResponse({
        items: [
          {
            id: 'product-1',
            name: '东北大米 25kg',
            barcode: '6901000000010',
            category_id: 'category-1',
            category_name: '粮油',
            brand_id: 'brand-1',
            brand_name: '金龙鱼',
            unit: '袋',
            image_url: 'https://cdn.example.test/rice.jpg',
            standard_price: 128.5,
            display_price: 128.5,
            price_source: 'standard',
            status: 'active',
            available_quantity: 12,
          },
          {
            id: 'product-2',
            name: '纯牛奶 250ml×24盒',
            barcode: '6901000000027',
            category_id: 'category-1',
            category_name: '粮油',
            brand_id: 'brand-2',
            brand_name: '蒙牛',
            unit: '箱',
            image_url: null,
            standard_price: 59.9,
            display_price: 49.9,
            price_source: 'member',
            status: 'active',
            available_quantity: 6,
          },
        ],
        total: 2,
        page: 1,
        page_size: 20,
      }));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

async function renderScreen(scanner?: Scanner) {
  const fetchMock = createCatalogFetchMock();
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
          <CartProvider>
            <ProductHomeScreen scanner={scanner} />
          </CartProvider>
        </ApiClientContext.Provider>
      </QueryClientProvider>,
    );
  });

  return { fetchMock, queryClient, renderer };
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

describe('mobile product home screen', () => {
  it('renders two-column catalog cards with icon search and no top title row', async () => {
    const { queryClient, renderer } = await renderScreen();

    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('东北大米 25kg');
    });

    const tree = JSON.stringify(renderer.toJSON());
    expect(tree).toContain('推荐');
    expect(tree).toContain('粮油');
    expect(tree).not.toContain('children":["商品"]');
    expect(tree).not.toContain('购物车 0');
    expect(renderer.root.findByProps({ testID: 'product-two-column-list' }).props.numColumns).toBe(2);
    expect(renderer.root.findByProps({ testID: 'product-two-column-list' }).props.showsVerticalScrollIndicator).toBe(false);
    expect(renderer.root.findAllByProps({ accessibilityLabel: '商品卡片列' }).length).toBeGreaterThanOrEqual(2);
    expect(renderer.root.findByProps({ accessibilityLabel: '扫码搜索' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: '搜索' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: '品牌 金龙鱼' })).toBeTruthy();
    expect(tree).toContain('¥128.50');
    expect(tree).not.toContain('推荐商品');
    expect(tree).not.toContain('recommend=true');

    await cleanup(queryClient, renderer);
  });

  it('shows a bottom message after adding a product to cart', async () => {
    const { queryClient, renderer } = await renderScreen();

    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('东北大米 25kg');
    });

    jest.useFakeTimers();
    try {
      await ReactTestRenderer.act(async () => {
        const firstCard = renderer.root.findAllByType(ProductCard)[0];
        firstCard.props.onAdd(firstCard.props.product);
      });
      expect(JSON.stringify(renderer.toJSON())).toContain('已加入购物车');

      await ReactTestRenderer.act(async () => {
        jest.advanceTimersByTime(1600);
      });
      expect(JSON.stringify(renderer.toJSON())).not.toContain('已加入购物车');
    } finally {
      jest.useRealTimers();
    }
    await cleanup(queryClient, renderer);
  });

  it('uses injected scanner for scan search', async () => {
    const scanner: Scanner = {
      scanOnce: jest.fn().mockResolvedValue({
        value: '6901000000010',
        format: 'ean-13',
        kind: 'barcode',
        scannedAt: '2026-07-23T00:00:00.000Z',
      }),
    };
    const { queryClient, renderer } = await renderScreen(scanner);

    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: '扫码搜索' }).props.onPress();
    });

    expect(scanner.scanOnce).toHaveBeenCalledTimes(1);
    await cleanup(queryClient, renderer);
  });

  it('opens the real camera scanner by default and submits scanned barcode', async () => {
    const { queryClient, renderer } = await renderScreen();

    await ReactTestRenderer.act(async () => {
      await renderer.root.findByProps({ accessibilityLabel: '扫码搜索' }).props.onPress();
    });

    const camera = renderer.root.findByProps({ testID: 'VisionCamera' });
    expect(camera.props.isActive).toBe(true);

    await ReactTestRenderer.act(async () => {
      camera.props.codeScanner.onCodeScanned([{ type: 'ean-13', value: '6901000000010' }]);
    });

    expect(renderer.root.findByProps({ accessibilityLabel: '商品搜索关键字' }).props.value).toBe('6901000000010');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('相机扫码中');

    await cleanup(queryClient, renderer);
  });
});
