export default function access(initialState: { currentUser?: API.CurrentUser } | undefined) {
  const roles = new Set(initialState?.currentUser?.roles ?? []);
  const admin = roles.has('admin');
  return {
    canAdmin: admin,
    canWarehouse: admin || roles.has('warehouse_manager'),
    canDelivery: admin || roles.has('delivery'),
    canFinance: admin || roles.has('finance'),
    canCustomerRead: admin || roles.has('warehouse_manager') || roles.has('finance'),
  };
}
