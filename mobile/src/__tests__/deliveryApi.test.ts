import { createApiClient } from '../api/client';
import { createDeliveryException, getDeliveryTaskDetail, listCurrentDeliveryTasks, signDeliveryTask } from '../api/delivery';

function jsonResponse(data: unknown): Response {
  return { ok: true, status: 200, json: async () => ({ code: 0, message: 'ok', data }) } as Response;
}

function client(fetchMock: jest.Mock) {
  return createApiClient({ baseUrl: 'https://api.example.test', getAccessToken: async () => 'token', fetchImpl: fetchMock });
}

describe('delivery api', () => {
  it('uses delivery task endpoints and sends signature url on sign', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ id: 'delivery-1' }));
    const api = client(fetchMock);

    await listCurrentDeliveryTasks(api);
    await getDeliveryTaskDetail(api, 'delivery-1');
    await signDeliveryTask(api, 'delivery-1', { signer_name: '张三', signature_image_url: 'https://storage/signature.png' });
    await createDeliveryException(api, 'delivery-1', { exception_type: 'customer_absent', remark: '客户不在' });

    expect(fetchMock.mock.calls.map(call => [call[0], call[1].method])).toEqual([
      ['https://api.example.test/api/v1/deliveries/current', 'GET'],
      ['https://api.example.test/api/v1/deliveries/delivery-1', 'GET'],
      ['https://api.example.test/api/v1/deliveries/delivery-1/sign', 'PUT'],
      ['https://api.example.test/api/v1/deliveries/delivery-1/exceptions', 'POST'],
    ]);
    expect(fetchMock.mock.calls[2][1].body).toContain('signature_image_url');
  });
});
