import { request } from '@umijs/max';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listPriceChangeLogs, listProducts, updateProductWarningQuantity } from './product';

vi.mock('@umijs/max', () => ({ request: vi.fn() }));

const mockedRequest = vi.mocked(request);

describe('listPriceChangeLogs', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  it('uses the global price-log endpoint when no product filter is set', async () => {
    mockedRequest.mockResolvedValue({ code: 0, message: 'success', data: null });

    await listPriceChangeLogs({ page: 1, page_size: 20 });

    expect(mockedRequest).toHaveBeenCalledWith('/api/v1/products/price-change-logs', {
      method: 'GET',
      params: { page: 1, page_size: 20 },
    });
  });
});

describe('listProducts', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  it('passes every product search filter to the list endpoint', async () => {
    mockedRequest.mockResolvedValue({ code: 0, message: 'success', data: null });
    const params = {
      keyword: '茉莉',
      barcode: '6900',
      category_id: 'category-1',
      brand_id: 'brand-1',
      status: 'active',
      min_cost_price: 10,
      max_cost_price: 20,
      min_standard_price: 30,
      max_standard_price: 40,
      page: 1,
      page_size: 20,
    };

    await listProducts(params);

    expect(mockedRequest).toHaveBeenCalledWith('/api/v1/products', {
      method: 'GET',
      params,
    });
  });
});

describe('updateProductWarningQuantity', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  it('updates the warning quantity through the product endpoint', async () => {
    mockedRequest.mockResolvedValue({ code: 0, message: 'success', data: null });

    await updateProductWarningQuantity('product-1', 8);

    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/v1/products/product-1/warning-quantity',
      { method: 'PATCH', data: { warning_quantity: 8 } },
    );
  });
});
