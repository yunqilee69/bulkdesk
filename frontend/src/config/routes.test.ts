import { describe, expect, it } from 'vitest';
import routes from '../../config/routes';
import menu from '../locales/zh-CN/menu';

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

  it('exposes delivery management to authenticated employees', () => {
    expect(routes.find((route) => route.path === '/delivery')).toMatchObject({
      name: 'delivery',
      component: './Delivery',
    });
    expect(routes.find((route) => route.path === '/delivery')).not.toHaveProperty('access');
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
    const customerRoute = routes.find((route) => route.path === '/customer');

    expect(customerRoute).toMatchObject({
      name: 'customer',
      component: './Customer',
    });
    expect(customerRoute).not.toHaveProperty('routes');
    expect(routes.find((route) => route.path === '/level')).toMatchObject({
      name: 'level',
      component: './Level',
    });
    expect(routes.find((route) => route.path === '/employee')).toMatchObject({
      name: 'employee',
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
  });
});
