import { describe, expect, it } from 'vitest';
import { getDashboardTotals } from './totals';

describe('getDashboardTotals', () => {
  it('reads every overview count from dashboard stats', () => {
    const stats = {
      customer_total: 11,
      product_total: 22,
      order_total: 33,
      employee_total: 4,
      order_trend: [],
      customer_ranking: [],
      inventory_alerts: [],
      product_sales: [],
    };

    expect(getDashboardTotals(stats)).toEqual({
      customerTotal: 11,
      productTotal: 22,
      orderTotal: 33,
      employeeTotal: 4,
    });
  });

  it('uses zero while stats are loading', () => {
    expect(getDashboardTotals(undefined)).toEqual({
      customerTotal: 0,
      productTotal: 0,
      orderTotal: 0,
      employeeTotal: 0,
    });
  });
});
