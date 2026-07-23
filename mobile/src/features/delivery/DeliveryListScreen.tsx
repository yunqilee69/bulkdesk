import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../api/client';
import { listCurrentDeliveryTasks } from '../../api/delivery';
import { useApiClient } from '../../app/apiClientContext';

export function DeliveryListScreen({ apiClient }: { apiClient?: ApiClient }) {
  const client = useApiClient(apiClient);
  const deliveriesQuery = useQuery({
    enabled: Boolean(client),
    queryFn: () => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      return listCurrentDeliveryTasks(client);
    },
    queryKey: ['deliveries', 'current'],
  });
  const deliveries = deliveriesQuery.data?.flatMap(group => group.deliveries) ?? [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>我的配送任务</Text>
      <Text style={styles.subtitle}>支持签收、收款、异常和退货处理。</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>待签收任务</Text>
        <Text>进入详情后可采集照片、手写签名、收款凭证或登记异常。</Text>
        <Button title="刷新任务" disabled={!client || deliveriesQuery.isFetching} onPress={() => { deliveriesQuery.refetch().catch(() => undefined); }} />
      </View>
      {deliveriesQuery.error ? <Text style={styles.errorText}>{(deliveriesQuery.error as Error).message}</Text> : null}
      {deliveriesQuery.isLoading ? <Text style={styles.mutedText}>正在加载配送任务...</Text> : null}
      {deliveries.map(delivery => (
        <View key={delivery.id} style={styles.taskCard}>
          <Text style={styles.cardTitle}>{delivery.order_no}</Text>
          <Text>{delivery.customer_name}</Text>
          <Text>{`${delivery.recipient_name} · ${delivery.recipient_phone}`}</Text>
          <Text>{`商品数：${delivery.product_quantity} · 金额：${delivery.total_amount}`}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#f5f7fa', borderRadius: 12, gap: 8, marginTop: 16, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  container: { flex: 1, padding: 24 },
  errorText: { color: '#c00000', marginTop: 12 },
  mutedText: { color: '#667085', marginTop: 12 },
  subtitle: { color: '#667085', marginTop: 8 },
  taskCard: { borderColor: '#e4e7ec', borderRadius: 12, borderWidth: 1, gap: 4, marginTop: 12, padding: 12 },
  title: { fontSize: 22, fontWeight: '700' },
});
