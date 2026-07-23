import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../api/client';
import { getMobileDashboard, type MobileDashboardAction } from '../../api/dashboard';
import { useApiClient } from '../../app/apiClientContext';

export type DashboardAction = Pick<MobileDashboardAction, 'key' | 'title'>;

export function DashboardScreen({ actions = [], apiClient }: { actions?: DashboardAction[]; apiClient?: ApiClient }) {
  const client = useApiClient(apiClient);
  const dashboardQuery = useQuery({
    enabled: Boolean(client),
    queryFn: () => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      return getMobileDashboard(client);
    },
    queryKey: ['mobile', 'dashboard'],
  });
  const visibleActions = dashboardQuery.data?.actions ?? actions;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>现场工作台</Text>
      <Text style={styles.subtitle}>按后端授权动作展示移动端入口。</Text>
      {dashboardQuery.isLoading ? <Text style={styles.mutedText}>正在加载工作台...</Text> : null}
      {dashboardQuery.error ? <Text style={styles.errorText}>{(dashboardQuery.error as Error).message}</Text> : null}
      <View style={styles.actionList}>
        {visibleActions.length ? (
          visibleActions.map(action => (
            <View key={action.key} style={styles.actionCard}>
              <Text style={styles.actionTitle}>{action.title}</Text>
            </View>
          ))
        ) : (
          <Text>暂无可用动作</Text>
        )}
      </View>
      {dashboardQuery.data?.alerts.length ? (
        <View style={styles.alertList}>
          {dashboardQuery.data.alerts.map(alert => <Text key={alert} style={styles.alertText}>{alert}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actionCard: {
    backgroundColor: '#eef6ff',
    borderRadius: 12,
    padding: 16,
  },
  actionList: {
    gap: 12,
    marginTop: 16,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  alertList: {
    gap: 8,
    marginTop: 16,
  },
  alertText: {
    color: '#b42318',
  },
  container: {
    flex: 1,
    padding: 24,
  },
  errorText: {
    color: '#c00000',
    marginTop: 12,
  },
  mutedText: {
    color: '#667085',
    marginTop: 12,
  },
  subtitle: {
    color: '#667085',
    marginTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
});
