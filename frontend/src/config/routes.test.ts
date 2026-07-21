import { describe, expect, it } from 'vitest';
import routes from '../../config/routes';
import menu from '../locales/zh-CN/menu';
import access from '../access';

type RouteWithAccess = {
  access?: keyof ReturnType<typeof access>;
};

function findRoute(path: string) {
  for (const route of routes) {
    if (route.path === path) return route;
    const child = route.routes?.find((item) => item.path === path);
    if (child) return child;
  }
  return undefined;
}

function routeVisibleFor(path: string, currentUser: API.CurrentUser) {
  const route = findRoute(path) as RouteWithAccess | undefined;
  if (!route?.access) return true;
  return Boolean(access({ currentUser })[route.access]);
}

describe('main menu routes', () => {
  it('keeps the requested top-level menu order', () => {
    const mainMenuPaths = [
      '/dashboard',
      '/product',
      '/inventory',
      '/order',
      '/delivery',
      '/customer',
      '/level',
      '/employee',
    ];
    const mainRoutes = routes.filter((route) => mainMenuPaths.includes(route.path ?? ''));

    expect(mainRoutes.map((route) => route.path)).toEqual([
      ...mainMenuPaths,
    ]);
  });

  it('exposes delivery management to delivery-capable employees', () => {
    expect(findRoute('/delivery')).toMatchObject({
      name: 'delivery',
      access: 'canDelivery',
      component: './Delivery',
    });
    expect(menu['menu.delivery']).toBe('配送管理');
  });

  it('registers the order detail page as a hidden child route', () => {
    const orderRoute = routes.find((route) => route.path === '/order');

    expect(orderRoute?.routes?.find((route) => route.path === '/order/detail/:id')).toMatchObject({
      component: './Order/Detail',
      hideInMenu: true,
    });
  });

  it('exposes customer, level, and employee management as direct top-level pages', () => {
    const customerRoute = findRoute('/customer');

    expect(customerRoute).toMatchObject({
      name: 'customer',
      access: 'canCustomerRead',
      component: './Customer',
    });
    expect(customerRoute).not.toHaveProperty('routes');
    expect(findRoute('/level')).toMatchObject({
      name: 'level',
      access: 'canAdmin',
      component: './Level',
    });
    expect(findRoute('/employee')).toMatchObject({
      name: 'employee',
      access: 'canAdmin',
      component: './Employee',
    });
  });

  it('keeps inventory child menus in the requested order', () => {
    const inventoryRoute = routes.find((route) => route.path === '/inventory');

    expect(inventoryRoute?.routes?.map((route) => route.path)).toEqual([
      '/inventory',
      '/inventory/stock',
      '/inventory/operations',
      '/inventory/movements',
      '/inventory/warehouses',
      '/inventory/suppliers',
    ]);
    expect(inventoryRoute?.routes?.find((route) => route.path === '/inventory/operations')).toMatchObject({ access: 'canWarehouse' });
    expect(inventoryRoute?.routes?.find((route) => route.path === '/inventory/warehouses')).toMatchObject({ access: 'canWarehouse' });
    expect(inventoryRoute?.routes?.find((route) => route.path === '/inventory/suppliers')).toMatchObject({ access: 'canWarehouse' });
  });

  it('hides product, inventory, order, and customer routes from delivery-only users', () => {
    const deliveryUser = {
      id: 'employee-1',
      username: 'delivery',
      name: '配送员',
      roles: ['delivery'],
    } as API.CurrentUser;

    expect(routeVisibleFor('/delivery', deliveryUser)).toBe(true);
    expect(routeVisibleFor('/product', deliveryUser)).toBe(false);
    expect(routeVisibleFor('/product/list', deliveryUser)).toBe(false);
    expect(routeVisibleFor('/inventory', deliveryUser)).toBe(false);
    expect(routeVisibleFor('/inventory/stock', deliveryUser)).toBe(false);
    expect(routeVisibleFor('/order', deliveryUser)).toBe(false);
    expect(routeVisibleFor('/order/list', deliveryUser)).toBe(false);
    expect(routeVisibleFor('/customer', deliveryUser)).toBe(false);
  });

  it('gates employee and customer level routes to admins', () => {
    expect(findRoute('/employee')).toMatchObject({ access: 'canAdmin' });
    expect(findRoute('/level')).toMatchObject({ access: 'canAdmin' });
  });

  it('gates product, inventory, and order routes to warehouse users', () => {
    const warehousePaths = [
      '/product',
      '/product/list',
      '/product/categories',
      '/product/brands',
      '/product/price-logs',
      '/inventory',
      '/inventory/stock',
      '/inventory/operations',
      '/inventory/movements',
      '/inventory/warehouses',
      '/inventory/suppliers',
      '/order',
      '/order/list',
      '/order/detail/:id',
      '/order/returns',
    ];

    expect(warehousePaths.map((path) => [path, (findRoute(path) as RouteWithAccess | undefined)?.access])).toEqual(
      warehousePaths.map((path) => [path, 'canWarehouse']),
    );
  });
});
