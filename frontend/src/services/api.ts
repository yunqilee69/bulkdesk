import { request } from '@umijs/max';

export async function login(body: API.LoginParams) {
  return request<API.ResponseBase<API.LoginResult>>('/api/v1/auth/login', { method: 'POST', data: body, skipErrorHandler: true });
}

export async function logout() {
  return request<API.ResponseBase>('/api/v1/auth/logout', { method: 'POST' });
}

export async function currentUser() {
  const token = localStorage.getItem('access_token');
  if (!token) return undefined;
  try {
    JSON.parse(atob(token.split('.')[1]));
  } catch {
    localStorage.removeItem('access_token');
    return undefined;
  }
  try {
    const response = await request<API.ResponseBase<API.CurrentUser>>('/api/v1/auth/me', { method: 'GET' });
    if (response.code === 0 && response.data?.id) {
      return response.data;
    }
  } catch {
    localStorage.removeItem('access_token');
    return undefined;
  }
  localStorage.removeItem('access_token');
  return undefined;
}
