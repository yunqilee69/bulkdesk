import { describe, expect, it } from 'vitest';
import routes from '../../config/routes';

describe('main menu routes', () => {
  it('keeps the requested top-level menu order', () => {
    const mainMenuPaths = [
      '/dashboard',
      '/product',
      '/inventory',
      '/order',
      '/customer',
      '/level',
      '/employee',
    ];
    const mainRoutes = routes.filter((route) => mainMenuPaths.includes(route.path ?? ''));

    expect(mainRoutes.map((route) => route.path)).toEqual([
      ...mainMenuPaths,
    ]);
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
