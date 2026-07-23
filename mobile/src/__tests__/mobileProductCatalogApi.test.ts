import { createApiClient } from '../api/client';
import { listMobileProductCategories, listMobileProducts } from '../api/products';

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ code: 0, message: 'ok', data }) } as Response;
}

function createTestClient(fetchMock: jest.Mock) {
  return createApiClient({
    baseUrl: 'https://api.example.test',
    getAccessToken: async () => 'mobile-token',
    fetchImpl: fetchMock,
  });
}

describe('mobile product catalog api', () => {
  it('loads mobile product categories', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse([{ id: 'category-1', name: '粮油' }]));

    await expect(listMobileProductCategories(createTestClient(fetchMock))).resolves.toEqual([
      { id: 'category-1', name: '粮油' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/mobile/product-categories',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('serializes recommend keyword and pagination product queries', async () => {
    const result = { items: [], total: 0, page: 2, page_size: 20 };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(result));

    await expect(listMobileProducts(createTestClient(fetchMock), {
      page: 2,
      pageSize: 20,
      keyword: '大米',
      categoryId: 'category-1',
      recommend: true,
    })).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/mobile/products?page=2&page_size=20&keyword=%E5%A4%A7%E7%B1%B3&category_id=category-1&recommend=true',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
