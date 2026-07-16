import { describe, expect, it } from 'vitest';

import { toPriceChartData } from './priceChart';

describe('price chart helpers', () => {
  it('creates independent series for standard, cost, and member prices in time order', () => {
    expect(
      toPriceChartData([
        { price_type: 'member_price', level_name: '黄金会员', new_value: 90, created_at: '2026-07-16T10:02:00' },
        { price_type: 'standard_price', new_value: 100, created_at: '2026-07-16T10:00:00' },
        { price_type: 'cost_price', new_value: 50, created_at: '2026-07-16T10:01:00' },
        { price_type: 'member_price', level_name: '普通会员', new_value: 80, created_at: '2026-07-16T10:03:00' },
      ]),
    ).toEqual([
      { changedAt: '2026-07-16T10:00:00', series: '标准售价', price: 100 },
      { changedAt: '2026-07-16T10:01:00', series: '成本价', price: 50 },
      { changedAt: '2026-07-16T10:02:00', series: '黄金会员会员价', price: 90 },
      { changedAt: '2026-07-16T10:03:00', series: '普通会员会员价', price: 80 },
    ]);
  });
});
