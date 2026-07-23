import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { createApiClient } from '../api/client';
import { ApiClientContext } from '../app/apiClientContext';
import { DeliverySignScreen } from '../features/delivery/DeliverySignScreen';
import type { MediaCapture, SignatureImage } from '../platform/contracts';

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ code: 0, message: 'ok', data }) } as Response;
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

function renderSignScreen(fetchMock: jest.Mock) {
  const apiClient = createApiClient({ baseUrl: 'https://api.example.test', getAccessToken: async () => 'token', fetchImpl: fetchMock });
  const queryClient = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity, retry: false }, queries: { gcTime: Infinity, retry: false } } });
  const mediaCapture: MediaCapture = {
    capturePhoto: async () => ({ contentType: 'image/jpeg', filename: 'proof.jpg', size: 1024, source: 'fixture', uri: 'file:///tmp/proof.jpg' }),
    removeLocalFile: async () => undefined,
  };
  const signatureExporter = async (): Promise<SignatureImage> => ({
    contentType: 'image/png',
    filename: 'signature.png',
    size: 512,
    strokeCount: 1,
    uri: 'file:///tmp/signature.png',
  });
  let renderer!: ReactTestRenderer.ReactTestRenderer;

  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <QueryClientProvider client={queryClient}>
        <ApiClientContext.Provider value={apiClient}>
          <DeliverySignScreen deliveryId="delivery-1" mediaCapture={mediaCapture} signatureExporter={signatureExporter} />
        </ApiClientContext.Provider>
      </QueryClientProvider>,
    );
  });
  return { queryClient, renderer };
}

describe('DeliverySignScreen', () => {
  it('requires signature inputs and submits payment proof payloads', async () => {
    const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/upload?prefix=delivery-proofs')) {
        return jsonResponse({ key: 'proof-key', url: 'https://cdn.example.test/proof.jpg', filename: 'proof.jpg', content_type: 'image/jpeg', size: 1024 });
      }
      if (url.endsWith('/api/v1/upload?prefix=delivery-signatures')) {
        return jsonResponse({ key: 'signature-key', url: 'https://cdn.example.test/sign.png', filename: 'signature.png', content_type: 'image/png', size: 512 });
      }
      if (url.endsWith('/api/v1/upload?prefix=payment-proofs')) {
        return jsonResponse({ key: 'payment-key', url: 'https://cdn.example.test/pay.jpg', filename: 'pay.jpg', content_type: 'image/jpeg', size: 1024 });
      }
      if (url.endsWith('/api/v1/deliveries/delivery-1/sign') && init?.method === 'PUT') {
        return jsonResponse({ id: 'delivery-1', order_no: 'ORD-001', items: [] });
      }
      throw new Error(`Unexpected request ${init?.method ?? 'GET'} ${url}`);
    });
    const { queryClient, renderer } = renderSignScreen(fetchMock);

    expect(renderer.root.findByProps({ title: '开始手写签名' })).toBeTruthy();
    expect(renderer.root.findByProps({ title: '确认签收' }).props.disabled).toBe(true);

    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ accessibilityLabel: '签收人' }).props.onChangeText('张三');
      renderer.root.findByProps({ title: '拍摄现场照片' }).props.onPress();
    });
    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('现场照片：1');
    });
    await ReactTestRenderer.act(async () => {
      const signaturePad = renderer.root.findByProps({ testID: 'DeliverySignaturePad' });
      signaturePad.props.onResponderGrant({ nativeEvent: { locationX: 10, locationY: 10 } });
      signaturePad.props.onResponderMove({ nativeEvent: { locationX: 40, locationY: 20 } });
      signaturePad.props.onResponderRelease();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '上传签名' }).props.onPress();
    });
    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('签名：已上传');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '开启收款' }).props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === '实收金额')?.props.onChangeText('88.5');
      renderer.root.findByProps({ title: '拍摄付款凭证' }).props.onPress();
    });
    await waitForAssertion(() => {
      expect(JSON.stringify(renderer.toJSON())).toContain('付款凭证：1');
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({ title: '确认签收' }).props.onPress();
    });

    await waitForAssertion(() => {
      const signCall = fetchMock.mock.calls.find(call => call[0] === 'https://api.example.test/api/v1/deliveries/delivery-1/sign');
      if (!signCall) {
        throw new Error('sign call not found');
      }
      expect(JSON.parse((signCall[1] as RequestInit).body as string)).toMatchObject({
        collect_payment: true,
        paid_amount: 88.5,
        payment_proof_image_urls: ['https://cdn.example.test/pay.jpg'],
        proof_image_urls: ['https://cdn.example.test/proof.jpg'],
        signature_image_url: 'https://cdn.example.test/sign.png',
        signer_name: '张三',
      });
    });

    queryClient.clear();
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });
  });
});
