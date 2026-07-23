import { buildProductListQuery, formatProductPrice, getProductImageUrl, productCardTitle } from '../features/products/productHomeModel';

describe('product home model', () => {
  it('formats RMB prices with up to two decimals', () => {
    expect(formatProductPrice(35)).toBe('¥35');
    expect(formatProductPrice(179.1)).toBe('¥179.10');
  });

  it('uses backend image_url as the first card image', () => {
    expect(getProductImageUrl({ image_url: 'https://cdn.example.test/rice.jpg' })).toBe('https://cdn.example.test/rice.jpg');
    expect(getProductImageUrl({ image_url: null })).toBeNull();
  });

  it('keeps brand and product name on one display line', () => {
    expect(productCardTitle({ brand_name: '金龙鱼', name: '东北大米 25kg' })).toBe('金龙鱼 东北大米 25kg');
  });

  it('builds recommend query when the recommend tab is active', () => {
    expect(buildProductListQuery({ activeCategoryId: 'recommend', keyword: '大米', page: 1 })).toEqual({
      page: 1,
      pageSize: 20,
      keyword: '大米',
      recommend: true,
    });
  });
});
