import type { ApiClient } from './client';

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

export type CurrentUser = {
  id: string;
  username: string;
  roles: string[];
};

export async function login(client: ApiClient, request: LoginRequest): Promise<LoginTokenResponse> {
  return client.request<LoginTokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
}

export async function getCurrentUser(client: ApiClient): Promise<CurrentUser> {
  return client.request<CurrentUser>('/api/v1/auth/me', { method: 'GET' });
}

export async function logout(client: ApiClient): Promise<void> {
  await client.request('/api/v1/auth/logout', { method: 'POST' });
}
