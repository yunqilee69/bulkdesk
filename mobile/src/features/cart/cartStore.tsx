import React, { createContext, useContext, useMemo, useReducer } from 'react';

import {
  addCartCustomer,
  addCartItem,
  createCartState,
  DEFAULT_CART_CUSTOMER,
  groupCartLinesByBrand,
  removeCartCustomer,
  removeCartItem,
  selectCartCustomer,
  selectedCartKindCount,
  selectedCartTotal,
  setCartItemQuantity,
  toggleAllCartItems,
  toggleCartItemSelected,
  totalCartQuantity,
  type CartBrandGroup,
  type CartCustomerTab,
  type CartLine,
  type CartLineInput,
  type CartState,
} from './cartModel';

export type CartContextValue = {
  state: CartState;
  activeCustomerId: string | null;
  activeLines: CartLine[];
  brandGroups: CartBrandGroup[];
  selectedKindCount: number;
  selectedTotal: number;
  totalQuantity: number;
  addCustomer(customer: CartCustomerTab): void;
  removeCustomer(customerId: string): void;
  selectCustomer(customerId: string): void;
  addItem(customerId: string, input: CartLineInput): void;
  setQuantity(customerId: string, productId: string, quantity: number): void;
  toggleItem(customerId: string, productId: string): void;
  toggleAll(customerId: string, selected: boolean): void;
  removeItem(customerId: string, productId: string): void;
};

type CartAction =
  | { type: 'addCustomer'; customer: CartCustomerTab }
  | { type: 'removeCustomer'; customerId: string }
  | { type: 'selectCustomer'; customerId: string }
  | { type: 'addItem'; customerId: string; input: CartLineInput }
  | { type: 'setQuantity'; customerId: string; productId: string; quantity: number }
  | { type: 'toggleItem'; customerId: string; productId: string }
  | { type: 'toggleAll'; customerId: string; selected: boolean }
  | { type: 'removeItem'; customerId: string; productId: string };

const CartContext = createContext<CartContextValue | null>(null);

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'addCustomer':
      return addCartCustomer(state, action.customer);
    case 'removeCustomer':
      return removeCartCustomer(state, action.customerId);
    case 'selectCustomer':
      return selectCartCustomer(state, action.customerId);
    case 'addItem':
      return addCartItem(state, action.customerId, action.input);
    case 'setQuantity':
      return setCartItemQuantity(state, action.customerId, action.productId, action.quantity);
    case 'toggleItem':
      return toggleCartItemSelected(state, action.customerId, action.productId);
    case 'toggleAll':
      return toggleAllCartItems(state, action.customerId, action.selected);
    case 'removeItem':
      return removeCartItem(state, action.customerId, action.productId);
    default:
      return state;
  }
}

function createInitialCartState(): CartState {
  return addCartCustomer(createCartState(), DEFAULT_CART_CUSTOMER);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, undefined, createInitialCartState);
  const activeCustomerId = state.activeCustomerId;
  const activeLines = useMemo(
    () => (activeCustomerId ? state.linesByCustomerId[activeCustomerId] ?? [] : []),
    [activeCustomerId, state.linesByCustomerId],
  );
  const value = useMemo<CartContextValue>(() => ({
    state,
    activeCustomerId,
    activeLines,
    brandGroups: activeCustomerId ? groupCartLinesByBrand(state, activeCustomerId) : [],
    selectedKindCount: activeCustomerId ? selectedCartKindCount(state, activeCustomerId) : 0,
    selectedTotal: activeCustomerId ? selectedCartTotal(state, activeCustomerId) : 0,
    totalQuantity: totalCartQuantity(state),
    addCustomer: customer => dispatch({ type: 'addCustomer', customer }),
    removeCustomer: customerId => dispatch({ type: 'removeCustomer', customerId }),
    selectCustomer: customerId => dispatch({ type: 'selectCustomer', customerId }),
    addItem: (customerId, input) => dispatch({ type: 'addItem', customerId, input }),
    setQuantity: (customerId, productId, quantity) => dispatch({ type: 'setQuantity', customerId, productId, quantity }),
    toggleItem: (customerId, productId) => dispatch({ type: 'toggleItem', customerId, productId }),
    toggleAll: (customerId, selected) => dispatch({ type: 'toggleAll', customerId, selected }),
    removeItem: (customerId, productId) => dispatch({ type: 'removeItem', customerId, productId }),
  }), [activeCustomerId, activeLines, state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('购物车上下文未初始化');
  }
  return context;
}
