import { describe, expect, it } from 'vitest';

import {
  productKeywordSearchConfig,
  productListSearchConfig,
  toProductListParams,
} from './searchFilters';

describe('toProductListParams', () => {
  it('keeps all product search fields visible by default', () => {
    expect(productListSearchConfig).toEqual({ defaultCollapsed: false, labelWidth: 112 });
  });

  it('keeps the product keyword input within one search field column', () => {
    expect(productKeywordSearchConfig).toEqual({
      colSize: 1,
      fieldProps: { style: { width: '100%' } },
    });
  });

  it('maps independent keyword, barcode, and inclusive price ranges to API parameters', () => {
    expect(
      toProductListParams({
        keyword: '茉莉',
        barcode: '6900',
        category_id: 'category-1',
        brand_id: 'brand-1',
        status: 'active',
        cost_price: [10, 20],
        standard_price: [30, 40],
        current: 2,
        pageSize: 50,
      }),
    ).toEqual({
      keyword: '茉莉',
      barcode: '6900',
      category_id: 'category-1',
      brand_id: 'brand-1',
      status: 'active',
      min_cost_price: 10,
      max_cost_price: 20,
      min_standard_price: 30,
      max_standard_price: 40,
      page: 2,
      page_size: 50,
    });
  });
});
