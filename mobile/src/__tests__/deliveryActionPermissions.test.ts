import { getDeliveryActions } from '../features/delivery/deliveryActionPermissions';

describe('delivery action permissions', () => {
  it('allows delivery owners to sign and report exceptions while delivering', () => {
    expect(getDeliveryActions(['delivery'], true, 'delivering')).toEqual(['sign', 'exception', 'return']);
  });

  it('hides delivery actions for non-owners and signed tasks', () => {
    expect(getDeliveryActions(['delivery'], false, 'delivering')).toEqual([]);
    expect(getDeliveryActions(['delivery'], true, 'signed')).toEqual([]);
  });

  it('allows admins to inspect current delivery action entry points', () => {
    expect(getDeliveryActions(['admin'], false, 'delivering')).toEqual(['sign', 'exception', 'return']);
  });
});
