import { buildNavigation } from '../app/roleNavigation';

describe('customer permission view', () => {
  it('does not include customer list navigation for delivery roles', () => {
    const routes = buildNavigation(['delivery']);

    expect(routes).toEqual(['products', 'inventory', 'delivery', 'cart', 'profile']);
    expect(routes).not.toContain('customers');
  });
});
