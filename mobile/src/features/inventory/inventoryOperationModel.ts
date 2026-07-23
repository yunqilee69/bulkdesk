import type {
  BatchStockInInput,
  BatchStockOutInput,
  BatchStocktakeInput,
  BatchTransferInput,
} from '../../api/inventory';

export type InventoryOperationType = 'stock-in' | 'stock-out' | 'stocktake' | 'transfer';

export type ScannableInventoryProduct = {
  id?: string | null;
  name?: string | null;
  barcode?: string | null;
  availableQuantity?: number | null;
};

export type InventoryOperationItem = {
  productId: string;
  productName: string;
  barcode?: string | null;
  quantity: number;
  actualQuantity?: number;
  availableQuantity?: number | null;
};

export type InventoryOperationState = {
  type: InventoryOperationType;
  warehouseId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  supplierId: string | null;
  remark: string;
  submitting: boolean;
  items: InventoryOperationItem[];
};

export type StockInValidationInput = {
  warehouseId: string;
  supplierId?: string | null;
  items: InventoryOperationItem[];
};

export type StockOutValidationInput = {
  warehouseId: string;
  items: InventoryOperationItem[];
};

export type StocktakeValidationInput = {
  warehouseId: string;
  items: InventoryOperationItem[];
};

export type TransferValidationInput = {
  fromWarehouseId: string;
  toWarehouseId: string;
  items: InventoryOperationItem[];
};

export type InventoryBatchPayload = BatchStockInInput | BatchStockOutInput | BatchStocktakeInput | BatchTransferInput;

export function createInventoryOperation(type: InventoryOperationType): InventoryOperationState {
  return {
    type,
    warehouseId: '',
    fromWarehouseId: '',
    toWarehouseId: '',
    supplierId: null,
    remark: '',
    submitting: false,
    items: [],
  };
}

export function setInventoryOperationSubmitting(
  operation: InventoryOperationState,
  submitting: boolean,
): InventoryOperationState {
  return { ...operation, submitting };
}

function hasInvalidQuantity(items: InventoryOperationItem[]): boolean {
  return items.some(item => item.quantity <= 0);
}

function hasInvalidActualQuantity(items: InventoryOperationItem[]): boolean {
  return items.some(item => (item.actualQuantity ?? item.quantity) < 0);
}

function requireItems(items: InventoryOperationItem[]): string | null {
  return items.length ? null : '请先扫描商品';
}

export function addScannedItem(
  operation: InventoryOperationState,
  product: ScannableInventoryProduct | null | undefined,
  quantity = 1,
): InventoryOperationState {
  if (!product) {
    return operation;
  }
  const productId = product?.id?.trim();
  if (operation.submitting || !productId || quantity <= 0) {
    return operation;
  }

  const existing = operation.items.find(item => item.productId === productId);
  const nextItem: InventoryOperationItem = {
    availableQuantity: product.availableQuantity,
    barcode: product.barcode,
    productId,
    productName: product.name?.trim() || productId,
    quantity,
  };

  return {
    ...operation,
    items: existing
      ? operation.items.map(item => (item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item))
      : [...operation.items, nextItem],
  };
}

export function validateStockIn(input: StockInValidationInput): string | null {
  if (!input.warehouseId.trim()) {
    return '请选择入库仓库';
  }
  return requireItems(input.items) ?? (hasInvalidQuantity(input.items) ? '商品数量必须大于零' : null);
}

export function validateStockOut(input: StockOutValidationInput): string | null {
  if (!input.warehouseId.trim()) {
    return '请选择出库仓库';
  }
  return requireItems(input.items) ?? (hasInvalidQuantity(input.items) ? '商品数量必须大于零' : null);
}

export function validateStocktake(input: StocktakeValidationInput): string | null {
  if (!input.warehouseId.trim()) {
    return '请选择盘点仓库';
  }
  return requireItems(input.items) ?? (hasInvalidActualQuantity(input.items) ? '盘点数量不能小于零' : null);
}

export function validateTransfer(input: TransferValidationInput): string | null {
  if (!input.fromWarehouseId.trim()) {
    return '请选择来源仓库';
  }
  if (!input.toWarehouseId.trim()) {
    return '请选择目标仓库';
  }
  if (input.fromWarehouseId.trim() === input.toWarehouseId.trim()) {
    return '来源仓库和目标仓库不能相同';
  }
  return requireItems(input.items) ?? (hasInvalidQuantity(input.items) ? '商品数量必须大于零' : null);
}

export function validateInventoryOperation(operation: InventoryOperationState): string | null {
  if (operation.type === 'stock-in') {
    return validateStockIn({ warehouseId: operation.warehouseId, supplierId: operation.supplierId, items: operation.items });
  }
  if (operation.type === 'stock-out') {
    return validateStockOut({ warehouseId: operation.warehouseId, items: operation.items });
  }
  if (operation.type === 'stocktake') {
    return validateStocktake({ warehouseId: operation.warehouseId, items: operation.items });
  }
  return validateTransfer({ fromWarehouseId: operation.fromWarehouseId, toWarehouseId: operation.toWarehouseId, items: operation.items });
}

export function toInventoryBatchPayload(operation: InventoryOperationState): InventoryBatchPayload {
  const quantityItems = operation.items.map(item => ({ product_id: item.productId, quantity: item.quantity }));
  const stocktakeItems = operation.items.map(item => ({ product_id: item.productId, actual_quantity: item.actualQuantity ?? item.quantity }));

  if (operation.type === 'stock-in') {
    return {
      warehouse_id: operation.warehouseId,
      supplier_id: operation.supplierId,
      items: quantityItems,
      ...(operation.remark ? { remark: operation.remark } : {}),
    };
  }
  if (operation.type === 'stock-out') {
    return {
      warehouse_id: operation.warehouseId,
      items: quantityItems,
      ...(operation.remark ? { remark: operation.remark } : {}),
    };
  }
  if (operation.type === 'stocktake') {
    return {
      warehouse_id: operation.warehouseId,
      items: stocktakeItems,
      ...(operation.remark ? { remark: operation.remark } : {}),
    };
  }
  return {
    from_warehouse_id: operation.fromWarehouseId,
    to_warehouse_id: operation.toWarehouseId,
    items: quantityItems,
    ...(operation.remark ? { remark: operation.remark } : {}),
  };
}
