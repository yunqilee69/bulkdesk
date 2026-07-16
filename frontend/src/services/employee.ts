import { request } from '@umijs/max';
export async function listEmployees(params?: { keyword?: string; page?: number; page_size?: number }) {
  return request<API.ResponseBase<API.PaginatedData>>('/api/v1/employees', { method: 'GET', params });
}
export async function getEmployee(id: string) {
  return request<API.ResponseBase>(`/api/v1/employees/${id}`, { method: 'GET' });
}
export async function createEmployee(data: { username: string; password: string; name: string; phone?: string; role: string }) {
  return request<API.ResponseBase>('/api/v1/employees', { method: 'POST', data });
}
export async function updateEmployee(id: string, data: { name?: string; phone?: string; role?: string }) {
  return request<API.ResponseBase>(`/api/v1/employees/${id}`, { method: 'PUT', data });
}
export async function disableEmployee(id: string) {
  return request<API.ResponseBase>(`/api/v1/employees/${id}/disable`, { method: 'PUT' });
}
export async function enableEmployee(id: string) {
  return request<API.ResponseBase>(`/api/v1/employees/${id}/enable`, { method: 'PUT' });
}
export async function resetPassword(id: string, data: { new_password: string }) {
  return request<API.ResponseBase>(`/api/v1/employees/${id}/reset-password`, { method: 'PUT', data });
}
