import { describe, expect, it, vi } from 'vitest';
import { loadInventoryQuantities } from './inventoryState';

describe('loadInventoryQuantities', () => {
  it('maps the complete inventory response by 商品', async () => {
    const load = vi.fn().mockResolvedValue([
      { id: '1', product_id: 'product-1', warehouse_id: 'warehouse-1', quantity: 12, locked: 2 },
      { id: '2', product_id: 'product-2', warehouse_id: 'warehouse-1', quantity: 5, locked: 0 },
    ]);

    const quantities = await loadInventoryQuantities('warehouse-1', load);

    expect(quantities).toEqual({ 'product-1': 12, 'product-2': 5 });
    expect(load).toHaveBeenCalledWith('warehouse-1');
  });

  it('propagates loading failures instead of inventing zero stock', async () => {
    const load = vi.fn().mockRejectedValue(new Error('库存加载失败'));

    await expect(loadInventoryQuantities('warehouse-1', load)).rejects.toThrow('库存加载失败');
  });
});
