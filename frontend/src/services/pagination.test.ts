import { describe, expect, it, vi } from 'vitest';
import { collectPages, collectResponsePages } from './pagination';

describe('collectPages', () => {
  it('loads every page without exceeding the backend page size', async () => {
    const firstItems = Array.from({ length: 100 }, (_, index) => ({ id: `${index}` }));
    const lastItem = { id: 'last' };
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: firstItems, total: 101, page: 1, page_size: 100 })
      .mockResolvedValueOnce({ items: [lastItem], total: 101, page: 2, page_size: 100 });

    const items = await collectPages(fetchPage);

    expect(items).toHaveLength(101);
    expect(items.at(-1)).toEqual(lastItem);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 100);
  });

  it('stops when an inconsistent API returns an empty page', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: 'first' }], total: 2, page: 1, page_size: 100 })
      .mockResolvedValueOnce({ items: [], total: 2, page: 2, page_size: 100 });

    await expect(collectPages(fetchPage)).rejects.toThrow('分页数据不完整');
  });
});

describe('collectResponsePages', () => {
  it('collects successful common responses', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        code: 0,
        message: 'success',
        data: { items: [{ id: 'first' }], total: 2, page: 1, page_size: 100 },
      })
      .mockResolvedValueOnce({
        code: 0,
        message: 'success',
        data: { items: [{ id: 'second' }], total: 2, page: 2, page_size: 100 },
      });

    await expect(collectResponsePages(fetchPage)).resolves.toEqual([
      { id: 'first' },
      { id: 'second' },
    ]);
  });

  it('rejects a business error', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      code: 422,
      message: '参数错误',
      data: null,
    });

    await expect(collectResponsePages(fetchPage)).rejects.toThrow('参数错误');
  });
});
