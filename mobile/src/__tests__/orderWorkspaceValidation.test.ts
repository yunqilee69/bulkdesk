import { validateDraftSubmission } from '../features/orders/orderWorkspaceValidation';

describe('order workspace validation', () => {
  it('requires at least one item before submission', () => {
    expect(validateDraftSubmission({ items: [], version: 1 })).toBe('请至少添加一件商品');
  });

  it('rejects non-positive draft versions', () => {
    expect(validateDraftSubmission({ items: [{ productId: 'product-1', quantity: 1 }], version: 0 })).toBe('草稿版本无效');
    expect(validateDraftSubmission({ items: [{ productId: 'product-1', quantity: 1 }], version: -1 })).toBe('草稿版本无效');
  });

  it('accepts a draft with items and a positive version', () => {
    expect(validateDraftSubmission({ items: [{ productId: 'product-1', quantity: 1 }], version: 1 })).toBeNull();
  });
});
