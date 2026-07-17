type ProductListSearchValues = {
  keyword?: string;
  barcode?: string;
  category_id?: string;
  brand_id?: string;
  status?: string;
  cost_price?: [number | undefined, number | undefined];
  standard_price?: [number | undefined, number | undefined];
  current?: number;
  pageSize?: number;
};

export const productListSearchConfig = { defaultCollapsed: false, labelWidth: 112 };
export const productKeywordSearchConfig = {
  colSize: 1,
  fieldProps: { style: { width: '100%' } },
};

export function toProductListParams({
  cost_price,
  standard_price,
  current,
  pageSize,
  ...filters
}: ProductListSearchValues) {
  const [min_cost_price, max_cost_price] = cost_price ?? [];
  const [min_standard_price, max_standard_price] = standard_price ?? [];

  return {
    ...filters,
    ...(min_cost_price === undefined ? {} : { min_cost_price }),
    ...(max_cost_price === undefined ? {} : { max_cost_price }),
    ...(min_standard_price === undefined ? {} : { min_standard_price }),
    ...(max_standard_price === undefined ? {} : { max_standard_price }),
    ...(current === undefined ? {} : { page: current }),
    ...(pageSize === undefined ? {} : { page_size: pageSize }),
  };
}
