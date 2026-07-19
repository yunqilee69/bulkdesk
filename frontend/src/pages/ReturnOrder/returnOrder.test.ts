import { describe, expect, it } from 'vitest';
import {
  applyBatchCondition,
  applyBatchNoStockIn,
  applyBatchReason,
  applyBatchStockIn,
  buildReturnDraft,
  calculateReturnTotal,
  toReturnOrderRequest,
  validateReturnDraft,
} from './returnOrder';

const products = [
  { id: 'p1', name: '商品 A', barcode: 'A001', category_id: 'c1', unit: '件', cost_price: 5, standard_price: 12, status: 'active' },
  { id: 'p2', name: '商品 B', barcode: 'B001', category_id: 'c1', unit: '件', cost_price: 8, standard_price: 20, status: 'active' },
];

describe('return order draft helpers', () => {
  it('builds default rows and calculates totals', () => {
    const draft = buildReturnDraft(products);
    expect(draft[0]).toMatchObject({ product_id: 'p1', quantity: 1, unit_price: 12, condition: 'normal', should_stock_in: false });
    expect(calculateReturnTotal(draft)).toBe(32);
  });

  it('supports batch stock decisions, condition and reason updates', () => {
    let draft = buildReturnDraft(products);
    draft = applyBatchStockIn(draft, ['p1', 'p2'], 'w1');
    draft = applyBatchCondition(draft, ['p1'], 'expired');
    draft = applyBatchReason(draft, ['p1', 'p2'], '客户现场退货');
    draft = applyBatchNoStockIn(draft, ['p2']);

    expect(draft[0]).toMatchObject({ should_stock_in: true, warehouse_id: 'w1', condition: 'expired', return_reason: '客户现场退货' });
    expect(draft[1]).toMatchObject({ should_stock_in: false, warehouse_id: undefined, return_reason: '客户现场退货' });
  });

  it('validates and serializes the backend request', () => {
    let draft = buildReturnDraft(products.slice(0, 1));
    expect(validateReturnDraft(draft)).toBe('商品 A 还未填写退货原因');
    draft = applyBatchReason(draft, ['p1'], '客户拒收');
    draft = applyBatchStockIn(draft, ['p1'], 'w1');
    expect(validateReturnDraft(draft)).toBeUndefined();
    expect(toReturnOrderRequest('c1', draft, '备注')).toEqual({
      customer_id: 'c1',
      remark: '备注',
      items: [{
        product_id: 'p1', quantity: 1, unit_price: 12, condition: 'normal',
        return_reason: '客户拒收', remark: undefined, should_stock_in: true, warehouse_id: 'w1',
      }],
    });
  });
});
