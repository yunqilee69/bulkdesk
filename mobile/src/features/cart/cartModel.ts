export type CartCustomerTab = { customerId: string; customerName: string };

export type CartLineInput = {
  productId: string;
  name: string;
  specification?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  imageUrl?: string | null;
  price: number;
  standardPrice?: number | null;
};

export type CartLine = CartLineInput & {
  quantity: number;
  selected: boolean;
};

export type CartBrandGroup = {
  brandId: string;
  brandName: string;
  lines: CartLine[];
};

export type CartState = {
  activeCustomerId: string | null;
  customerTabs: CartCustomerTab[];
  linesByCustomerId: Record<string, CartLine[]>;
};

export const DEFAULT_CART_CUSTOMER: CartCustomerTab = {
  customerId: 'default-customer',
  customerName: '默认客户',
};

export function createCartState(): CartState {
  return {
    activeCustomerId: null,
    customerTabs: [],
    linesByCustomerId: {},
  };
}

export function addCartCustomer(state: CartState, customer: CartCustomerTab): CartState {
  const exists = state.customerTabs.some(tab => tab.customerId === customer.customerId);
  return {
    activeCustomerId: customer.customerId,
    customerTabs: exists ? state.customerTabs : [...state.customerTabs, customer],
    linesByCustomerId: {
      ...state.linesByCustomerId,
      [customer.customerId]: state.linesByCustomerId[customer.customerId] ?? [],
    },
  };
}

export function selectCartCustomer(state: CartState, customerId: string): CartState {
  if (!state.customerTabs.some(tab => tab.customerId === customerId)) {
    return state;
  }
  return { ...state, activeCustomerId: customerId };
}

export function removeCartCustomer(state: CartState, customerId: string): CartState {
  const customerTabs = state.customerTabs.filter(tab => tab.customerId !== customerId);
  const linesByCustomerId = { ...state.linesByCustomerId };
  delete linesByCustomerId[customerId];
  const activeCustomerId = state.activeCustomerId === customerId ? customerTabs[0]?.customerId ?? null : state.activeCustomerId;
  return { activeCustomerId, customerTabs, linesByCustomerId };
}

export function addCartItem(state: CartState, customerId: string, input: CartLineInput): CartState {
  const lines = state.linesByCustomerId[customerId] ?? [];
  const nextLines = lines.some(line => line.productId === input.productId)
    ? lines.map(line => (line.productId === input.productId ? { ...line, quantity: line.quantity + 1 } : line))
    : [...lines, { ...input, quantity: 1, selected: false }];
  return {
    ...state,
    activeCustomerId: customerId,
    linesByCustomerId: {
      ...state.linesByCustomerId,
      [customerId]: nextLines,
    },
  };
}

export function setCartItemQuantity(state: CartState, customerId: string, productId: string, quantity: number): CartState {
  const clampedQuantity = Math.max(1, Math.floor(quantity));
  return {
    ...state,
    linesByCustomerId: {
      ...state.linesByCustomerId,
      [customerId]: (state.linesByCustomerId[customerId] ?? []).map(line => (
        line.productId === productId ? { ...line, quantity: clampedQuantity } : line
      )),
    },
  };
}

export function toggleCartItemSelected(state: CartState, customerId: string, productId: string): CartState {
  return {
    ...state,
    linesByCustomerId: {
      ...state.linesByCustomerId,
      [customerId]: (state.linesByCustomerId[customerId] ?? []).map(line => (
        line.productId === productId ? { ...line, selected: !line.selected } : line
      )),
    },
  };
}

export function toggleAllCartItems(state: CartState, customerId: string, selected: boolean): CartState {
  return {
    ...state,
    linesByCustomerId: {
      ...state.linesByCustomerId,
      [customerId]: (state.linesByCustomerId[customerId] ?? []).map(line => ({ ...line, selected })),
    },
  };
}

export function removeCartItem(state: CartState, customerId: string, productId: string): CartState {
  return {
    ...state,
    linesByCustomerId: {
      ...state.linesByCustomerId,
      [customerId]: (state.linesByCustomerId[customerId] ?? []).filter(line => line.productId !== productId),
    },
  };
}

export function groupCartLinesByBrand(state: CartState, customerId: string): CartBrandGroup[] {
  const groupsByBrandId = new Map<string, CartBrandGroup>();
  for (const line of state.linesByCustomerId[customerId] ?? []) {
    const brandId = line.brandId || 'unknown';
    const brandName = line.brandName || '其他品牌';
    const existingGroup = groupsByBrandId.get(brandId);
    if (existingGroup) {
      existingGroup.lines.push(line);
    } else {
      groupsByBrandId.set(brandId, { brandId, brandName, lines: [line] });
    }
  }
  return Array.from(groupsByBrandId.values());
}

export function selectedCartKindCount(state: CartState, customerId: string): number {
  return (state.linesByCustomerId[customerId] ?? []).filter(line => line.selected).length;
}

export function selectedCartTotal(state: CartState, customerId: string): number {
  return (state.linesByCustomerId[customerId] ?? []).reduce(
    (total, line) => total + (line.selected ? line.price * line.quantity : 0),
    0,
  );
}

export function totalCartQuantity(state: CartState): number {
  return Object.values(state.linesByCustomerId).flat().reduce((total, line) => total + line.quantity, 0);
}
