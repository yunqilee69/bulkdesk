import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.hoisted(() => vi.fn());
vi.mock('@umijs/max', () => ({ request: requestMock }));

import { currentUser } from './api';

function token(payload: Record<string, unknown>) {
  return `x.${btoa(JSON.stringify(payload))}.x`;
}

describe('currentUser', () => {
  beforeEach(() => {
    requestMock.mockReset();
    localStorage.clear();
  });

  it('loads employee identity and role set from the server for a valid token', async () => {
    localStorage.setItem('access_token', token({ sub: 'warehouse-user' }));
    requestMock.mockResolvedValue({ code: 0, data: { id: 'employee-1', username: 'warehouse-user', name: '仓管甲', roles: ['warehouse_manager'] } });

    await expect(currentUser()).resolves.toMatchObject({ id: 'employee-1', username: 'warehouse-user', roles: ['warehouse_manager'] });
    expect(requestMock).toHaveBeenCalledWith('/api/v1/auth/me', { method: 'GET' });
  });

  it.each([
    ['401', () => Promise.reject(new Error('401'))],
    ['403', () => Promise.reject(new Error('403'))],
    ['network', () => Promise.reject(new Error('network'))],
    ['malformed', () => Promise.resolve({ code: 0, data: { username: 'warehouse-user', roles: ['warehouse_manager'] } })],
  ])('fails closed when identity lookup returns %s', async (_case, response) => {
    localStorage.setItem('access_token', token({ sub: 'warehouse-user', employee_id: 'untrusted-id' }));
    requestMock.mockImplementation(response);

    await expect(currentUser()).resolves.toBeUndefined();
    expect(localStorage.getItem('access_token')).toBeNull();
  });
});
