import {
  addCartCustomer,
  addCartItem,
  createCartState,
  groupCartLinesByBrand,
  removeCartCustomer,
  removeCartItem,
  selectedCartKindCount,
  selectedCartTotal,
  setCartItemQuantity,
  toggleCartItemSelected,
} from '../features/cart/cartModel';

describe('merchant cart model', () => {
  it('keeps one tab per customer and removes a long-pressed customer cart', () => {
    let state = createCartState();
    state = addCartCustomer(state, { customerId: 'customer-1', customerName: '海淀批发部' });
    state = addCartCustomer(state, { customerId: 'customer-2', customerName: '朝阳便利店' });
    state = addCartCustomer(state, { customerId: 'customer-1', customerName: '海淀批发部' });

    expect(state.customerTabs.map(tab => tab.customerName)).toEqual(['海淀批发部', '朝阳便利店']);
    expect(removeCartCustomer(state, 'customer-1').customerTabs.map(tab => tab.customerName)).toEqual(['朝阳便利店']);
  });

  it('groups active customer lines by brand instead of store name', () => {
    let state = addCartCustomer(createCartState(), { customerId: 'customer-1', customerName: '海淀批发部' });
    state = addCartItem(state, 'customer-1', { productId: 'p1', name: '东北大米', specification: '25kg/袋', brandId: 'b1', brandName: '金龙鱼', imageUrl: null, price: 128.5, standardPrice: 138.5 });
    state = addCartItem(state, 'customer-1', { productId: 'p2', name: '食用油', specification: '5L/桶', brandId: 'b1', brandName: '金龙鱼', imageUrl: null, price: 69, standardPrice: 79 });

    expect(groupCartLinesByBrand(state, 'customer-1')).toEqual([
      expect.objectContaining({ brandName: '金龙鱼', lines: [expect.objectContaining({ productId: 'p1' }), expect.objectContaining({ productId: 'p2' })] }),
    ]);
  });

  it('tracks selected product kinds and totals for checkout label', () => {
    let state = addCartCustomer(createCartState(), { customerId: 'customer-1', customerName: '海淀批发部' });
    state = addCartItem(state, 'customer-1', { productId: 'p1', name: '东北大米', specification: '25kg/袋', brandId: 'b1', brandName: '金龙鱼', imageUrl: null, price: 128.5, standardPrice: 138.5 });
    state = addCartItem(state, 'customer-1', { productId: 'p2', name: '牛奶', specification: '250ml×24', brandId: 'b2', brandName: '蒙牛', imageUrl: null, price: 49.9, standardPrice: 59.9 });
    state = setCartItemQuantity(state, 'customer-1', 'p2', 2);
    state = toggleCartItemSelected(state, 'customer-1', 'p2');

    expect(state.linesByCustomerId['customer-1'][0].selected).toBe(false);
    expect(selectedCartKindCount(state, 'customer-1')).toBe(1);
    expect(selectedCartTotal(state, 'customer-1')).toBe(99.8);
  });

  it('removes a swiped cart item', () => {
    let state = addCartCustomer(createCartState(), { customerId: 'customer-1', customerName: '海淀批发部' });
    state = addCartItem(state, 'customer-1', { productId: 'p1', name: '东北大米', specification: '25kg/袋', brandId: 'b1', brandName: '金龙鱼', imageUrl: null, price: 128.5, standardPrice: 138.5 });

    expect(removeCartItem(state, 'customer-1', 'p1').linesByCustomerId['customer-1']).toEqual([]);
  });
});
