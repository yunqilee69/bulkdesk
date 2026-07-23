import { ApiClientError, createApiClient } from '../api/client';
import {
  abandonOrderDraft,
  createOrderDraft,
  getOrderDraft,
  listAvailableOrderDrafts,
  listMyOrderDrafts,
  saveOrderDraft,
  submitOrderDraft,
  takeOverOrderDraft,
} from '../api/orderDrafts';

function jsonResponse(data: unknown, status = 200, code = 0): Response {
  return {
    ok: status < 400,
    status,
    json: async () => ({ code, message: code === 0 ? 'ok' : 'conflict', data }),
  } as Response;
}

function client(fetchMock: jest.Mock) {
  return createApiClient({
    baseUrl: 'https://api.example.test',
    getAccessToken: async () => 'token',
    fetchImpl: fetchMock,
  });
}

const draft = {
  id: 'draft-1',
  customer_id: 'customer-1',
  owner_employee_id: 'employee-1',
  status: 'editing',
  version: 1,
  created_at: '2026-07-23 10:00:00',
  updated_at: '2026-07-23 10:00:00',
  items: [],
  events: [],
};

describe('order drafts api', () => {
  it('uses exact order draft endpoints and methods', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(draft));
    const api = client(fetchMock);

    await createOrderDraft(api, { customer_id: 'customer-1' });
    await listMyOrderDrafts(api);
    await listAvailableOrderDrafts(api);
    await getOrderDraft(api, 'draft-1');
    await saveOrderDraft(api, 'draft-1', { version: 1, items: [{ product_id: 'product-1', quantity: 2 }] });
    await takeOverOrderDraft(api, 'draft-1', { version: 1 });
    await abandonOrderDraft(api, 'draft-1', { version: 1 });

    expect(fetchMock.mock.calls.map(call => [call[0], call[1].method])).toEqual([
      ['https://api.example.test/api/v1/order-drafts/', 'POST'],
      ['https://api.example.test/api/v1/order-drafts/', 'GET'],
      ['https://api.example.test/api/v1/order-drafts/available', 'GET'],
      ['https://api.example.test/api/v1/order-drafts/draft-1', 'GET'],
      ['https://api.example.test/api/v1/order-drafts/draft-1', 'PUT'],
      ['https://api.example.test/api/v1/order-drafts/draft-1/takeover', 'POST'],
      ['https://api.example.test/api/v1/order-drafts/draft-1/abandon', 'POST'],
    ]);
  });

  it('submits with an Idempotency-Key header', async () => {
    const submitResult = { draft, order_id: 'order-1', submission_id: 'submission-1' };
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(submitResult));

    await expect(submitOrderDraft(client(fetchMock), 'draft-1', { version: 1 }, 'idem-1')).resolves.toEqual(submitResult);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/order-drafts/draft-1/submit',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'idem-1' }),
        method: 'POST',
      }),
    );
  });

  it('surfaces version conflicts as ApiClientError 409', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({ actual_version: 2 }, 409, 409));

    await expect(saveOrderDraft(client(fetchMock), 'draft-1', { version: 1, items: [] })).rejects.toMatchObject({
      code: 409,
      status: 409,
    } satisfies Partial<ApiClientError>);
  });
});
