import { buildNavigation } from '../app/roleNavigation';

describe('role navigation', () => {
  it('builds the admin merchant navigation', () => {
    expect(buildNavigation(['admin'])).toEqual(['products', 'inventory', 'delivery', 'cart', 'profile']);
  });

  it('builds the warehouse manager merchant navigation', () => {
    expect(buildNavigation(['warehouse_manager'])).toEqual(['products', 'inventory', 'delivery', 'cart', 'profile']);
  });

  it('builds the delivery merchant navigation', () => {
    expect(buildNavigation(['delivery'])).toEqual(['products', 'inventory', 'delivery', 'cart', 'profile']);
  });

  it('builds the customer navigation seam', () => {
    expect(buildNavigation([], 'customer')).toEqual(['products', 'cart', 'profile']);
  });
});
