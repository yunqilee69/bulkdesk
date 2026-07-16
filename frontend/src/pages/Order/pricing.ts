type PriceRow = {
  product_id: string;
  default_price: number;
  unit_price: number;
};

export function applyMemberPrices<T extends PriceRow>(
  rows: T[],
  prices: Record<string, number>,
): T[] {
  return rows.map((row) => ({
    ...row,
    unit_price: prices[row.product_id] ?? row.default_price,
  }));
}
