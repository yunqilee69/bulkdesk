import {
  addInventoryLine,
  createInventoryBatch,
  removeInventoryLine,
  setInventorySubmitting,
  updateInventoryLineQuantity,
  validateInventoryBatch,
} from '../features/inventory/inventoryBatchModel';

describe('inventory batch model', () => {
  it('merges scanned product and warehouse lines', () => {
    let state = createInventoryBatch('stock_in');
    state = addInventoryLine(state, { productId: 'product-1', warehouseId: 'warehouse-1', quantity: 2 });
    state = addInventoryLine(state, { productId: 'product-1', warehouseId: 'warehouse-1', quantity: 3 });

    expect(state.lines).toEqual([{ productId: 'product-1', warehouseId: 'warehouse-1', quantity: 5 }]);
  });

  it('updates, removes and validates lines', () => {
    let state = createInventoryBatch('stock_out');
    state = addInventoryLine(state, { productId: 'product-1', warehouseId: 'warehouse-1', quantity: 2 });
    state = updateInventoryLineQuantity(state, 'product-1', 'warehouse-1', 0);
    expect(validateInventoryBatch(state)).toContain('数量必须大于 0');

    state = removeInventoryLine(state, 'product-1', 'warehouse-1');
    expect(validateInventoryBatch(state)).toContain('请先扫描商品');
  });

  it('protects the list while submitting', () => {
    let state = createInventoryBatch('transfer');
    state = addInventoryLine(state, { productId: 'product-1', warehouseId: 'warehouse-1', quantity: 2 });
    state = setInventorySubmitting(state, true);
    state = addInventoryLine(state, { productId: 'product-2', warehouseId: 'warehouse-1', quantity: 1 });

    expect(state.lines).toHaveLength(1);
  });
});
