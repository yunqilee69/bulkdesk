type DashboardTotals = {
  customerTotal: number;
  productTotal: number;
  orderTotal: number;
  employeeTotal: number;
};

export function getDashboardTotals(
  stats: API.DashboardStats | undefined,
): DashboardTotals {
  return {
    customerTotal: stats?.customer_total ?? 0,
    productTotal: stats?.product_total ?? 0,
    orderTotal: stats?.order_total ?? 0,
    employeeTotal: stats?.employee_total ?? 0,
  };
}
