import type { SelectableProduct } from '@/components/ProductSelectModal/productSelection';

export type ReturnProductCondition = 'normal' | 'expired' | 'damaged' | 'other';

export interface ReturnItemDraft {
  product_id: string;
  product_name: string;
  barcode: string;
  quantity: number;
  unit_price: number;
  condition: ReturnProductCondition;
  return_reason: string;
  remark?: string;
  should_stock_in: boolean;
  warehouse_id?: string;
}

export function buildReturnDraft(
  products: SelectableProduct[],
  existing: ReturnItemDraft[] = [],
): ReturnItemDraft[] {
  const existingMap = new Map(existing.map((item) => [item.product_id, item]));
  return products.map((product) => existingMap.get(product.id) ?? ({
    product_id: product.id,
    product_name: product.short_name || product.name,
    barcode: product.barcode,
    quantity: 1,
    unit_price: product.standard_price,
    condition: 'normal',
    return_reason: '',
    should_stock_in: false,
  }));
}

function applySelected(
  items: ReturnItemDraft[],
  productIds: string[],
  update: (item: ReturnItemDraft) => ReturnItemDraft,
) {
  const selected = new Set(productIds);
  return items.map((item) => selected.has(item.product_id) ? update(item) : item);
}

export function applyBatchStockIn(items: ReturnItemDraft[], productIds: string[], warehouseId: string) {
  return applySelected(items, productIds, (item) => ({ ...item, should_stock_in: true, warehouse_id: warehouseId }));
}

export function applyBatchNoStockIn(items: ReturnItemDraft[], productIds: string[]) {
  return applySelected(items, productIds, (item) => ({ ...item, should_stock_in: false, warehouse_id: undefined }));
}

export function applyBatchCondition(items: ReturnItemDraft[], productIds: string[], condition: ReturnProductCondition) {
  return applySelected(items, productIds, (item) => ({ ...item, condition }));
}

export function applyBatchReason(items: ReturnItemDraft[], productIds: string[], returnReason: string) {
  return applySelected(items, productIds, (item) => ({ ...item, return_reason: returnReason }));
}

export function calculateReturnTotal(items: ReturnItemDraft[]) {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
}

export function validateReturnDraft(items: ReturnItemDraft[]): string | undefined {
  if (items.length === 0) return '请至少选择一个退货商品';
  for (const item of items) {
    if (item.quantity < 1) return `${item.product_name} 的退货数量必须大于 0`;
    if (item.unit_price <= 0) return `${item.product_name} 的退货单价必须大于 0`;
    if (!item.return_reason.trim()) return `${item.product_name} 还未填写退货原因`;
    if (item.should_stock_in && !item.warehouse_id) return `${item.product_name} 还未选择入库仓库`;
    if (!item.should_stock_in && item.warehouse_id) return `${item.product_name} 不入库时不得保留仓库`;
  }
  return undefined;
}

export function toReturnOrderRequest(customerId: string, items: ReturnItemDraft[], remark?: string) {
  return {
    customer_id: customerId,
    remark: remark || undefined,
    items: items.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      condition: item.condition,
      return_reason: item.return_reason.trim(),
      remark: item.remark || undefined,
      should_stock_in: item.should_stock_in,
      warehouse_id: item.should_stock_in ? item.warehouse_id : undefined,
    })),
  };
}
