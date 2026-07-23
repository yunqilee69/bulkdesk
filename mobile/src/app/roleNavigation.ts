export type MobileRole = 'admin' | 'warehouse_manager' | 'delivery' | 'finance';

export type MobileNavigationMode = 'merchant' | 'customer';

export type MobileRouteKey =
  | 'products'
  | 'dashboard'
  | 'customers'
  | 'orders'
  | 'inventory'
  | 'delivery'
  | 'payments'
  | 'cart'
  | 'profile';

const routeOrder: MobileRouteKey[] = [
  'products',
  'dashboard',
  'customers',
  'orders',
  'inventory',
  'delivery',
  'payments',
  'cart',
  'profile',
];

const routesByRole: Record<MobileRole, MobileRouteKey[]> = {
  admin: ['products', 'inventory', 'delivery', 'cart', 'profile'],
  warehouse_manager: ['products', 'inventory', 'delivery', 'cart', 'profile'],
  delivery: ['products', 'inventory', 'delivery', 'cart', 'profile'],
  finance: ['products', 'cart', 'profile'],
};

export function buildNavigation(
  roles: readonly string[],
  mode: MobileNavigationMode = 'merchant',
): MobileRouteKey[] {
  if (mode === 'customer') {
    return ['products', 'cart', 'profile'];
  }

  const routeSet = new Set<MobileRouteKey>();

  for (const role of roles) {
    const roleRoutes = routesByRole[role as MobileRole];
    if (!roleRoutes) {
      continue;
    }
    for (const route of roleRoutes) {
      routeSet.add(route);
    }
  }

  if (!routeSet.size) {
    routeSet.add('products');
    routeSet.add('cart');
    routeSet.add('profile');
  }

  return routeOrder.filter(route => routeSet.has(route));
}
