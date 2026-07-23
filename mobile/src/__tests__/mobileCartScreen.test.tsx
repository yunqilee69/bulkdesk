import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { CartProvider, useCart } from '../features/cart/cartStore';
import { CartScreen } from '../features/cart/CartScreen';

type SeedCartProps = {
  onNavigateProductDetail?: (productId: string) => void;
};

function SeedCart({ onNavigateProductDetail }: SeedCartProps) {
  const cart = useCart();
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (seededRef.current) {
      return;
    }
    seededRef.current = true;
    cart.addCustomer({ customerId: 'customer-1', customerName: '海淀批发部' });
    cart.addCustomer({ customerId: 'customer-2', customerName: '朝阳便利店' });
    cart.addItem('customer-1', { productId: 'p1', name: '东北大米', specification: '25kg/袋', brandId: 'brand-1', brandName: '金龙鱼', imageUrl: null, price: 128.5, standardPrice: 138.5 });
    cart.addItem('customer-1', { productId: 'p2', name: '纯牛奶', specification: '250ml×24盒', brandId: 'brand-2', brandName: '蒙牛', imageUrl: null, price: 49.9, standardPrice: 59.9 });
  }, [cart]);
  return <CartScreen onNavigateProductDetail={onNavigateProductDetail} />;
}

async function renderCart(onNavigateProductDetail?: (productId: string) => void) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<CartProvider><SeedCart onNavigateProductDetail={onNavigateProductDetail} /></CartProvider>);
  });
  return renderer;
}

async function waitForAssertion(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await ReactTestRenderer.act(async () => {
        await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
      });
    }
  }
  throw lastError;
}

describe('merchant cart screen', () => {
  it('renders customer tabs brand groups cart rows and selected checkout kind count', async () => {
    const renderer = await renderCart();

    await waitForAssertion(() => {
      const output = JSON.stringify(renderer.toJSON());
      expect(output).toContain('购物车');
      expect(output).toContain('海淀批发部');
      expect(output).toContain('朝阳便利店');
      expect(output).toContain('品牌 金龙鱼');
      expect(output).toContain('东北大米');
      expect(output).toContain('25kg/袋');
      expect(output).toContain('¥128.50');
      expect(output).toContain('¥138.50');
      expect(output).toContain('详情');
      expect(output).toContain('结算(0种)');
      expect(output).not.toContain('天猫超市 · 单品包邮');
      expect(output).not.toContain('筛选');
    });
  });

  it('selects cart rows manually for checkout', async () => {
    const renderer = await renderCart();

    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('结算(0种)');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '选择 东北大米' }).props.onPress();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('结算(1种)');
  });

  it('opens customer picker and remove customer action', async () => {
    const renderer = await renderCart();

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '+' }).props.onPress();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('选择客户');

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '客户 海淀批发部' }).props.onLongPress();
    });
    expect(JSON.stringify(renderer.toJSON())).toContain('删除客户购物车');
  });

  it('removes a cart row through the row delete action', async () => {
    const renderer = await renderCart();

    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('东北大米');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '购物车商品 东北大米' }).props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } });
    });
    expect(JSON.stringify(renderer.toJSON())).not.toContain('东北大米');
  });

  it('switches quantity chip to inline stepper editor', async () => {
    const renderer = await renderCart();

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '修改数量 东北大米' }).props.onPress();
    });
    expect(renderer.root.findByProps({ accessibilityLabel: '减少数量 东北大米' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: '增加数量 东北大米' })).toBeTruthy();

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '增加数量 东北大米' }).props.onPress();
    });
    expect(renderer.root.findByProps({ accessibilityLabel: '数量输入 东北大米' }).props.value).toBe('2');
  });

  it('requests product detail navigation from row detail', async () => {
    const navigateProductDetail = jest.fn();
    const renderer = await renderCart(navigateProductDetail);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '详情 东北大米' }).props.onPress();
    });
    expect(navigateProductDetail).toHaveBeenCalledWith('p1');
  });
});
