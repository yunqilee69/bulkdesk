import { ApiClientError, createApiClient } from '../api/client';

describe('api client', () => {
  it('adds Bearer token and unwraps BulkDesk response envelopes', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, message: 'ok', data: { ok: true } }),
    });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'access-token',
      fetchImpl: fetchMock,
    });

    await expect(client.request('/api/v1/ping')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/ping',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    );
  });

  it('maps 401 responses into ApiClientError', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'expired-token',
      fetchImpl: jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: 401, message: 'unauthorized', data: null }),
      }),
    });

    await expect(client.request('/api/v1/upload')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('invokes unauthorized cleanup before surfacing 401 errors', async () => {
    const onUnauthorized = jest.fn().mockResolvedValue(undefined);
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'expired-token',
      fetchImpl: jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ code: 401, message: 'unauthorized', data: null }),
      }),
      onUnauthorized,
    });

    await expect(client.request('/api/v1/mobile/dashboard')).rejects.toBeInstanceOf(ApiClientError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
