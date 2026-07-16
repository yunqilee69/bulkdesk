import { describe, expect, it } from 'vitest';
import { applyMemberPrices } from './pricing';

describe('applyMemberPrices', () => {
  const rows = [
    { product_id: 'product-1', default_price: 100, unit_price: 100 },
    { product_id: 'product-2', default_price: 80, unit_price: 80 },
  ];

  it('uses the exact 商品 member price when present', () => {
    expect(applyMemberPrices(rows, { 'product-1': 76.5 })).toEqual([
      { product_id: 'product-1', default_price: 100, unit_price: 76.5 },
      { product_id: 'product-2', default_price: 80, unit_price: 80 },
    ]);
  });

  it('restores default prices when the customer has no member price', () => {
    const discounted = applyMemberPrices(rows, { 'product-1': 76.5 });

    expect(applyMemberPrices(discounted, {})).toEqual(rows);
  });
});
