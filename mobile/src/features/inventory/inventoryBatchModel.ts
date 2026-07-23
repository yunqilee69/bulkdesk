export type InventoryOperationKind = 'stock_in' | 'stock_out' | 'stocktake' | 'transfer';

export type InventoryBatchLine = {
  productId: string;
  warehouseId: string;
  quantity: number;
};

export type InventoryBatchState = {
  operation: InventoryOperationKind;
  submitting: boolean;
  lines: InventoryBatchLine[];
};

export function createInventoryBatch(operation: InventoryOperationKind): InventoryBatchState {
  return { operation, submitting: false, lines: [] };
}

function keyOf(line: Pick<InventoryBatchLine, 'productId' | 'warehouseId'>): string {
  return `${line.productId}::${line.warehouseId}`;
}

export function addInventoryLine(state: InventoryBatchState, line: InventoryBatchLine): InventoryBatchState {
  if (state.submitting) {
    return state;
  }
  const lineKey = keyOf(line);
  const existing = state.lines.find(item => keyOf(item) === lineKey);
  return {
    ...state,
    lines: existing
      ? state.lines.map(item => (keyOf(item) === lineKey ? { ...item, quantity: item.quantity + line.quantity } : item))
      : [...state.lines, line],
  };
}

export function updateInventoryLineQuantity(
  state: InventoryBatchState,
  productId: string,
  warehouseId: string,
  quantity: number,
): InventoryBatchState {
  if (state.submitting) {
    return state;
  }
  return {
    ...state,
    lines: state.lines.map(line => (line.productId === productId && line.warehouseId === warehouseId ? { ...line, quantity } : line)),
  };
}

export function removeInventoryLine(state: InventoryBatchState, productId: string, warehouseId: string): InventoryBatchState {
  if (state.submitting) {
    return state;
  }
  return {
    ...state,
    lines: state.lines.filter(line => !(line.productId === productId && line.warehouseId === warehouseId)),
  };
}

export function setInventorySubmitting(state: InventoryBatchState, submitting: boolean): InventoryBatchState {
  return { ...state, submitting };
}

export function validateInventoryBatch(state: InventoryBatchState): string[] {
  const errors: string[] = [];
  if (!state.lines.length) {
    errors.push('请先扫描商品');
  }
  if (state.lines.some(line => line.quantity <= 0)) {
    errors.push('数量必须大于 0');
  }
  return errors;
}
