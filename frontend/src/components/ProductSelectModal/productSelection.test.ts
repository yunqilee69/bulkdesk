import { describe, expect, it } from 'vitest';
import {
  filterSelectableProducts,
  mergeSelectedProducts,
  toProductSelectQuery,
  toSelectedProducts,
  type SelectableProduct,
} from './productSelection';

const products: SelectableProduct[] = [
  {
    id: 'product-1',
    name: '茉莉花茶',
    short_name: '茉莉茶',
    barcode: '690000000001',
    category_id: 'tea',
    category_name: '茶饮',
    brand_id: 'brand-a',
    brand_name: '春山',
    unit: '盒',
    cost_price: 18,
    standard_price: 28,
    status: 'active',
  },
  {
    id: 'product-2',
    name: '原味苏打水',
    short_name: '苏打',
    barcode: '690000000002',
    category_id: 'water',
    category_name: '饮用水',
    brand_id: 'brand-b',
    brand_name: '山泉',
    unit: '瓶',
    cost_price: 2,
    standard_price: 4,
    status: 'active',
  },
  {
    id: 'product-3',
    name: '停用红茶',
    barcode: '690000000003',
    category_id: 'tea',
    category_name: '茶饮',
    brand_id: 'brand-a',
    brand_name: '春山',
    unit: '盒',
    cost_price: 15,
    standard_price: 24,
    status: 'inactive',
  },
];

describe('ProductSelectModal selection helpers', () => {
  it('maps independent keyword and barcode inputs to an active product query', () => {
    expect(
      toProductSelectQuery({
        keyword: '茉莉',
        barcode: '6900',
        categoryId: 'tea',
        brandId: 'brand-a',
        current: 2,
      }),
    ).toEqual({
      keyword: '茉莉',
      barcode: '6900',
      category_id: 'tea',
      brand_id: 'brand-a',
      status: 'active',
      page: 2,
      page_size: 10,
    });
  });

  it('keeps selected products when the current product page changes', () => {
    expect(mergeSelectedProducts([products[0]], [products[1], products[0]])).toEqual([
      products[0],
      products[1],
    ]);
  });

  it('filters active products by category, keyword, and brand', () => {
    expect(
      filterSelectableProducts(products, {
        categoryId: 'tea',
        keyword: '茉莉茶',
        brandId: 'brand-a',
      }),
    ).toEqual([products[0]]);

    expect(
      filterSelectableProducts(products, {
        categoryId: undefined,
        keyword: '000002',
        brandId: undefined,
      }),
    ).toEqual([products[1]]);
  });

  it('keeps selected products when the visible category changes', () => {
    expect(toSelectedProducts(products, ['product-2', 'product-1'])).toEqual([
      products[0],
      products[1],
    ]);
  });
});
