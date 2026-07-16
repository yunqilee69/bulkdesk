import { request } from '@umijs/max';

export async function getDashboardStats(params?: { period?: string }) {
  return request<API.ResponseBase<API.DashboardStats>>('/api/v1/dashboard/stats', { method: 'GET', params });
}
