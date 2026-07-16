import { request } from '@umijs/max';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listAllInventory } from './inventory';

vi.mock('@umijs/max', () => ({ request: vi.fn() }));

const mockedRequest = vi.mocked(request);

describe('listAllInventory', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
  });

  it('collects inventory with the supported page size', async () => {
    const firstItems = Array.from({ length: 100 }, (_, index) => ({
      id: `${index}`,
      product_id: `product-${index}`,
      warehouse_id: 'warehouse-1',
      quantity: 10,
      locked: 0,
    }));
    mockedRequest
      .mockResolvedValueOnce({
        code: 0,
        message: 'success',
        data: { items: firstItems, total: 101, page: 1, page_size: 100 },
      })
      .mockResolvedValueOnce({
        code: 0,
        message: 'success',
        data: {
          items: [
            {
              id: 'last',
              product_id: 'product-last',
              warehouse_id: 'warehouse-1',
              quantity: 8,
              locked: 2,
            },
          ],
          total: 101,
          page: 2,
          page_size: 100,
        },
      });

    const items = await listAllInventory('warehouse-1');

    expect(items).toHaveLength(101);
    expect(mockedRequest).toHaveBeenNthCalledWith(1, '/api/v1/inventory', {
      method: 'GET',
      params: { warehouse_id: 'warehouse-1', page: 1, page_size: 100 },
    });
    expect(mockedRequest).toHaveBeenNthCalledWith(2, '/api/v1/inventory', {
      method: 'GET',
      params: { warehouse_id: 'warehouse-1', page: 2, page_size: 100 },
    });
  });

  it('rejects a business error instead of returning empty stock', async () => {
    mockedRequest.mockResolvedValue({ code: 422, message: '参数错误', data: null });

    await expect(listAllInventory('warehouse-1')).rejects.toThrow('参数错误');
  });
});
