import {
  addScannedItem,
  createInventoryOperation,
  setInventoryOperationSubmitting,
  toInventoryBatchPayload,
  validateStockIn,
  validateStockOut,
  validateStocktake,
  validateTransfer,
} from '../features/inventory/inventoryOperationModel';

const product = {
  id: 'product-1',
  name: '牙刷',
  barcode: '6901234567890',
  availableQuantity: 8,
};

describe('inventory operation model', () => {
  it('merges repeated scans and preserves product metadata', () => {
    let operation = createInventoryOperation('stock-in');
    operation = addScannedItem(operation, product, 2);
    operation = addScannedItem(operation, product, 3);

    expect(operation.items).toEqual([
      {
        availableQuantity: 8,
        barcode: '6901234567890',
        productId: 'product-1',
        productName: '牙刷',
        quantity: 5,
      },
    ]);
  });

  it('ignores unknown scanner results and locks edits during submission', () => {
    let operation = createInventoryOperation('stock-out');

    operation = addScannedItem(operation, null, 1);
    expect(operation.items).toHaveLength(0);

    operation = addScannedItem(operation, product, 1);
    operation = setInventoryOperationSubmitting(operation, true);

    expect(addScannedItem(operation, { ...product, id: 'product-2' }, 1).items).toHaveLength(1);
  });

  it('validates operation-specific warehouse and quantity rules', () => {
    const item = addScannedItem(createInventoryOperation('stock-out'), product, 1).items[0];
    const zeroQuantityItem = { ...item, quantity: 0 };

    expect(validateStockIn({ warehouseId: '', supplierId: null, items: [item] })).toBe('请选择入库仓库');
    expect(validateStockOut({ warehouseId: 'warehouse-1', items: [zeroQuantityItem] })).toBe('商品数量必须大于零');
    expect(validateStocktake({ warehouseId: 'warehouse-1', items: [{ ...item, actualQuantity: -1 }] })).toBe('盘点数量不能小于零');
    expect(validateTransfer({ fromWarehouseId: 'warehouse-1', toWarehouseId: 'warehouse-1', items: [item] })).toBe(
      '来源仓库和目标仓库不能相同',
    );
  });

  it('builds backend batch payloads for all operation types', () => {
    const base = addScannedItem(createInventoryOperation('stocktake'), product, 4);

    expect(toInventoryBatchPayload({ ...base, type: 'stock-in', warehouseId: 'warehouse-1', supplierId: 'supplier-1' })).toEqual({
      warehouse_id: 'warehouse-1',
      supplier_id: 'supplier-1',
      items: [{ product_id: 'product-1', quantity: 4 }],
    });
    expect(toInventoryBatchPayload({ ...base, type: 'stock-out', warehouseId: 'warehouse-1' })).toEqual({
      warehouse_id: 'warehouse-1',
      items: [{ product_id: 'product-1', quantity: 4 }],
    });
    expect(toInventoryBatchPayload({ ...base, type: 'stocktake', warehouseId: 'warehouse-1' })).toEqual({
      warehouse_id: 'warehouse-1',
      items: [{ product_id: 'product-1', actual_quantity: 4 }],
    });
    expect(toInventoryBatchPayload({ ...base, type: 'transfer', fromWarehouseId: 'warehouse-1', toWarehouseId: 'warehouse-2' })).toEqual({
      from_warehouse_id: 'warehouse-1',
      to_warehouse_id: 'warehouse-2',
      items: [{ product_id: 'product-1', quantity: 4 }],
    });
  });
});
