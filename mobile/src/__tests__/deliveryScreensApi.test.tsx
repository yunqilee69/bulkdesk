import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { createApiClient } from '../api/client';
import { ApiClientContext } from '../app/apiClientContext';
import { DeliveryExceptionSheet } from '../features/delivery/DeliveryExceptionSheet';
import { DeliveryDetailScreen } from '../features/delivery/DeliveryDetailScreen';
import { DeliveryListScreen } from '../features/delivery/DeliveryListScreen';
import { DeliverySignScreen } from '../features/delivery/DeliverySignScreen';
import { ReturnOrderScreen } from '../features/delivery/ReturnOrderScreen';

function jsonResponse(data: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => ({ code: status < 400 ? 0 : status, message: 'ok', data }) } as Response;
}

async function renderWithApi(element: React.ReactElement, fetchMock: jest.Mock) {
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    getAccessToken: async () => 'token',
    fetchImpl: fetchMock,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false }, mutations: { gcTime: Infinity, retry: false } } });
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <ApiClientContext.Provider value={client}>{element}</ApiClientContext.Provider>
      </QueryClientProvider>,
    );
  });
  return { queryClient, renderer };
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

async function cleanup(queryClient: QueryClient, renderer: ReactTestRenderer.ReactTestRenderer) {
  queryClient.clear();
  await ReactTestRenderer.act(async () => {
    renderer.unmount();
  });
}

describe('delivery api screens', () => {
  it('loads current delivery tasks from the backend', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse([
        {
          delivery_employee_id: 'employee-1',
          delivery_employee_name: '王五',
          order_count: 1,
          customer_count: 1,
          product_quantity: 2,
          total_amount: 88,
          exception_order_count: 0,
          deliveries: [
            {
              id: 'delivery-1',
              order_id: 'order-1',
              order_no: 'ORD-001',
              customer_id: 'customer-1',
              customer_name: '海淀批发部',
              status: 'delivering',
              recipient_name: '李四',
              recipient_phone: '13800000000',
              delivery_address: '北京市海淀区',
              total_amount: 88,
              product_quantity: 2,
            },
          ],
        },
      ]),
    );

    const { queryClient, renderer } = await renderWithApi(<DeliveryListScreen />, fetchMock);

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/api/v1/deliveries/current',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(JSON.stringify(renderer.toJSON())).toContain('ORD-001');
      expect(JSON.stringify(renderer.toJSON())).toContain('海淀批发部');
    });

    await cleanup(queryClient, renderer);
  });

  it('loads delivery detail, exception history and map navigation entry', async () => {
    const openMap = jest.fn();
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({
        id: 'delivery-1',
        order_id: 'order-1',
        order_no: 'ORD-001',
        customer_id: 'customer-1',
        customer_name: '海淀批发部',
        status: 'delivering',
        recipient_name: '李四',
        recipient_phone: '13800000000',
        delivery_address: '北京市海淀区中关村大街1号',
        total_amount: 88,
        product_quantity: 2,
        proof_image_urls: [],
        items: [{ product_id: 'product-1', product_name: '茉莉花茶', barcode: '6901234567890', quantity: 2 }],
        events: [{ id: 'event-1', event_type: 'exception_reported', exception_type: 'customer_absent', remark: '客户不在', created_at: '2026-07-23T10:00:00Z' }],
      }),
    );

    const { queryClient, renderer } = await renderWithApi(
      <DeliveryDetailScreen deliveryId="delivery-1" ownsTask roles={['delivery']} openMap={openMap} />,
      fetchMock,
    );

    await waitForAssertion(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.test/api/v1/deliveries/delivery-1',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(JSON.stringify(renderer.toJSON())).toContain('茉莉花茶');
      expect(JSON.stringify(renderer.toJSON())).toContain('客户不在');
      expect(renderer.root.findByProps({ title: '签收' }).props.disabled).toBe(false);
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '导航' }).props.onPress();
    });
    expect(openMap).toHaveBeenCalledWith('北京市海淀区中关村大街1号');

    await cleanup(queryClient, renderer);
  });

  it('uploads proof and signature media before signing a delivery', async () => {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/upload?prefix=delivery-proofs')) {
        return jsonResponse({ key: 'proof-key', url: 'https://cdn.example.test/proof.jpg', filename: 'proof.jpg', content_type: 'image/jpeg', size: 1024 });
      }
      if (url.endsWith('/api/v1/upload?prefix=delivery-signatures')) {
        return jsonResponse({ key: 'sign-key', url: 'https://cdn.example.test/sign.png', filename: 'sign.png', content_type: 'image/png', size: 512 });
      }
      if (url.endsWith('/api/v1/deliveries/delivery-1/sign') && init?.method === 'PUT') {
        return jsonResponse({ id: 'delivery-1', order_no: 'ORD-001', items: [] });
      }
      throw new Error(`Unexpected request ${init?.method ?? 'GET'} ${url}`);
    });
    const { queryClient, renderer } = await renderWithApi(<DeliverySignScreen deliveryId="delivery-1" />, fetchMock);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '签收人' }).props.onChangeText('张三');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '拍摄现场照片' }).props.onPress();
    });
    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('现场照片：1');
    });
    await ReactTestRenderer.act(async () => {
      const signaturePad = renderer.root.findByProps({ testID: 'DeliverySignaturePad' });
      signaturePad.props.onResponderGrant({ nativeEvent: { locationX: 10, locationY: 12 } });
      signaturePad.props.onResponderMove({ nativeEvent: { locationX: 42, locationY: 24 } });
      signaturePad.props.onResponderRelease();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '上传签名' }).props.onPress();
    });
    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('签名：已上传');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '确认签收' }).props.onPress();
    });

    await waitForAssertion(() => {
      const signCall = fetchMock.mock.calls.find(call => call[0] === 'https://api.example.test/api/v1/deliveries/delivery-1/sign');
      if (!signCall) {
        throw new Error('sign call not found');
      }
      const signOptions = signCall[1] as RequestInit;
      expect(signOptions).toMatchObject({ method: 'PUT' });
      expect(JSON.parse(signOptions.body as string)).toMatchObject({
        proof_image_urls: ['https://cdn.example.test/proof.jpg'],
        signature_image_url: 'https://cdn.example.test/sign.png',
        signer_name: '张三',
      });
      expect(JSON.stringify(renderer.toJSON())).toContain('签收已完成');
    });

    await cleanup(queryClient, renderer);
  });

  it('requires remarks for other exceptions and submits them online', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ id: 'delivery-1' }));
    const { queryClient, renderer } = await renderWithApi(
      <DeliveryExceptionSheet deliveryId="delivery-1" defaultExceptionType="other" />,
      fetchMock,
    );

    expect(renderer.root.findByProps({ title: '提交异常' }).props.disabled).toBe(true);
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '异常说明' }).props.onChangeText('门店临时停业');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '提交异常' }).props.onPress();
    });

    await waitForAssertion(() => {
      const exceptionCall = fetchMock.mock.calls.find(call => call[0] === 'https://api.example.test/api/v1/deliveries/delivery-1/exceptions');
      if (!exceptionCall) {
        throw new Error('exception call not found');
      }
      const exceptionOptions = exceptionCall[1] as RequestInit;
      expect(exceptionOptions).toMatchObject({ method: 'POST' });
      expect(JSON.parse(exceptionOptions.body as string)).toEqual({ exception_type: 'other', remark: '门店临时停业' });
      expect(JSON.stringify(renderer.toJSON())).toContain('异常已提交');
    });

    await cleanup(queryClient, renderer);
  });

  it('loads returnable items and submits a return order', async () => {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/deliveries/delivery-1/returnable-items')) {
        return jsonResponse([
          {
            source_order_item_id: 'order-item-1',
            order_id: 'order-1',
            order_no: 'ORD-001',
            product_id: 'product-1',
            product_name: '茉莉花茶',
            barcode: '6901234567890',
            unit_price: 39.9,
            sold_quantity: 2,
            returned_quantity: 0,
            returnable_quantity: 2,
          },
        ]);
      }
      if (url.endsWith('/api/v1/return-orders') && init?.method === 'POST') {
        return jsonResponse({ id: 'return-1', return_no: 'RET-001' }, 201);
      }
      throw new Error(`Unexpected request ${init?.method ?? 'GET'} ${url}`);
    });
    const { queryClient, renderer } = await renderWithApi(<ReturnOrderScreen deliveryId="delivery-1" />, fetchMock);

    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('茉莉花茶');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '退货数量' }).props.onChangeText('2');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '破损' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '退货入库' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '入库仓库' }).props.onChangeText('warehouse-1');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '退货说明' }).props.onChangeText('包装破损');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '提交退货' }).props.onPress();
    });

    await waitForAssertion(() => {
      const returnCall = fetchMock.mock.calls.find(call => call[0] === 'https://api.example.test/api/v1/return-orders');
      if (!returnCall) {
        throw new Error('return call not found');
      }
      const returnOptions = returnCall[1] as RequestInit;
      expect(returnOptions).toMatchObject({ method: 'POST' });
      expect(JSON.parse(returnOptions.body as string)).toMatchObject({
        handling_delivery_id: 'delivery-1',
        items: [{
          source_order_item_id: 'order-item-1',
          quantity: 2,
          condition: 'damaged',
          return_reason: '包装破损',
          should_stock_in: true,
          warehouse_id: 'warehouse-1',
        }],
      });
      expect(JSON.stringify(renderer.toJSON())).toContain('退货已提交：RET-001');
    });

    await cleanup(queryClient, renderer);
  });
});
