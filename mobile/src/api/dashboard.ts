import type { ApiClient } from './client';

export type MobileDashboardAction = {
  key: string;
  title: string;
  path: string;
};

export type MobileDashboard = {
  actions: MobileDashboardAction[];
  summary: Record<string, number | string>;
  alerts: string[];
};

export async function getMobileDashboard(client: ApiClient): Promise<MobileDashboard> {
  return client.request<MobileDashboard>('/api/v1/mobile/dashboard', { method: 'GET' });
}
