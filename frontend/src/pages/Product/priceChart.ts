export type PriceChangeLogItem = {
  price_type: 'standard_price' | 'cost_price' | 'member_price';
  level_name?: string | null;
  new_value: number;
  created_at: string;
};

export type PriceChartPoint = {
  changedAt: string;
  series: string;
  price: number;
};

function getPriceSeriesName(log: PriceChangeLogItem) {
  if (log.price_type === 'standard_price') return '标准售价';
  if (log.price_type === 'cost_price') return '成本价';
  return `${log.level_name || '会员'}会员价`;
}

export function toPriceChartData(logs: PriceChangeLogItem[]) {
  return [...logs]
    .sort((left, right) => left.created_at.localeCompare(right.created_at))
    .map((log) => ({
      changedAt: log.created_at,
      series: getPriceSeriesName(log),
      price: log.new_value,
    }));
}
