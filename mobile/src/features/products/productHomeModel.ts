import type { MobileProductListItem, MobileProductListQuery, MobileProductListResult } from '../../api/products';

export const RECOMMEND_CATEGORY_ID = 'recommend';
export const PRODUCT_HOME_PAGE_SIZE = 20;

type ProductListQueryInput = {
  activeCategoryId: string;
  keyword?: string;
  page?: number;
};

export function formatProductPrice(price: number): string {
  return Number.isInteger(price) ? `¥${price}` : `¥${price.toFixed(2)}`;
}

export function getProductImageUrl(product: Pick<MobileProductListItem, 'image_url'>): string | null {
  return product.image_url ?? null;
}

export function productCardTitle(product: Pick<MobileProductListItem, 'brand_name' | 'name'>): string {
  return [product.brand_name, product.name].filter(Boolean).join(' ');
}

export function buildProductListQuery(input: ProductListQueryInput): MobileProductListQuery {
  const query: MobileProductListQuery = {
    page: input.page ?? 1,
    pageSize: PRODUCT_HOME_PAGE_SIZE,
  };
  const keyword = input.keyword?.trim();
  if (keyword) {
    query.keyword = keyword;
  }
  if (input.activeCategoryId === RECOMMEND_CATEGORY_ID) {
    query.recommend = true;
  } else if (input.activeCategoryId) {
    query.categoryId = input.activeCategoryId;
  }
  return query;
}

export function flattenProductPages(pages: MobileProductListResult[] | undefined): MobileProductListItem[] {
  return pages?.flatMap(page => page.items) ?? [];
}
