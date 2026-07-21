import { describe, expect, it } from 'vitest';

import access from './access';

describe('multi-role access', () => {
  it('unions employee roles', () => {
    expect(access({ currentUser: { roles: ['warehouse_manager', 'delivery'] } as API.CurrentUser })).toMatchObject({
      canDelivery: true,
      canWarehouse: true,
      canAdmin: false,
    });
  });

  it('grants every business capability to admin', () => {
    expect(access({ currentUser: { roles: ['admin'] } as API.CurrentUser })).toMatchObject({
      canAdmin: true,
      canWarehouse: true,
      canDelivery: true,
      canFinance: true,
      canCustomerRead: true,
    });
  });

  it('does not expose customer menu access to delivery-only users', () => {
    expect(access({ currentUser: { roles: ['delivery'] } as API.CurrentUser })).toMatchObject({
      canDelivery: true,
      canCustomerRead: false,
      canWarehouse: false,
    });
  });

  it('allows warehouse and finance users to read customer data without admin writes', () => {
    expect(access({ currentUser: { roles: ['warehouse_manager'] } as API.CurrentUser })).toMatchObject({
      canCustomerRead: true,
      canAdmin: false,
    });
    expect(access({ currentUser: { roles: ['finance'] } as API.CurrentUser })).toMatchObject({
      canCustomerRead: true,
      canAdmin: false,
    });
  });
});
