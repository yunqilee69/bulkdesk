import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../api/client';
import { getMobileCustomerSummary } from '../../api/customers';
import { useApiClient } from '../../app/apiClientContext';

export type CustomerSummaryView = {
  name: string;
  contact_name: string;
  contact_phone: string;
  level_name?: string | null;
  total_spent?: number;
  order_count?: number;
  open_order_count?: number;
  delivering_order_count?: number;
};

export function CustomerDetailScreen({
  apiClient,
  customer,
  customerId,
}: {
  apiClient?: ApiClient;
  customer?: CustomerSummaryView;
  customerId?: string;
}) {
  const client = useApiClient(apiClient);
  const summaryQuery = useQuery({
    enabled: Boolean(client && customerId),
    queryFn: () => {
      if (!client || !customerId) {
        throw new Error('客户查询参数不完整');
      }
      return getMobileCustomerSummary(client, customerId);
    },
    queryKey: ['mobile', 'customerSummary', { customerId }],
  });
  const visibleCustomer = summaryQuery.data ?? customer;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{visibleCustomer?.name ?? '客户详情'}</Text>
      {summaryQuery.isLoading ? <Text style={styles.mutedText}>正在加载客户详情...</Text> : null}
      {summaryQuery.error ? <Text style={styles.errorText}>{(summaryQuery.error as Error).message}</Text> : null}
      <Text>联系人：{visibleCustomer?.contact_name ?? '-'}</Text>
      <Text>电话：{visibleCustomer?.contact_phone ?? '-'}</Text>
      <Text>等级：{visibleCustomer?.level_name ?? '-'}</Text>
      <Text>{`累计消费：${visibleCustomer?.total_spent ?? 0}`}</Text>
      <Text>{`订单数：${visibleCustomer?.order_count ?? 0}`}</Text>
      <Text>{`待处理订单：${visibleCustomer?.open_order_count ?? 0}`}</Text>
      <Text>{`配送中订单：${visibleCustomer?.delivering_order_count ?? 0}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 8,
    padding: 24,
  },
  errorText: {
    color: '#c00000',
  },
  mutedText: {
    color: '#667085',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
});
