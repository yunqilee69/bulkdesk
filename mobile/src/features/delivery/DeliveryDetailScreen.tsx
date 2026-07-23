import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { Button, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '../../api/client';
import { getDeliveryTaskDetail, type DeliveryDetail } from '../../api/delivery';
import { useApiClient } from '../../app/apiClientContext';
import { getDeliveryActions } from './deliveryActionPermissions';

function defaultOpenMap(address: string) {
  const url = `https://maps.apple.com/?q=${encodeURIComponent(address)}`;
  Linking.openURL(url).catch(() => undefined);
}

export function DeliveryDetailScreen({
  apiClient,
  detail,
  deliveryId,
  openMap = defaultOpenMap,
  onException,
  onReturn,
  onSign,
  ownsTask = true,
  roles = ['delivery'],
}: {
  apiClient?: ApiClient;
  detail?: DeliveryDetail;
  deliveryId?: string;
  openMap?: (address: string) => void;
  onException?: () => void;
  onReturn?: () => void;
  onSign?: () => void;
  ownsTask?: boolean;
  roles?: readonly string[];
}) {
  const client = useApiClient(apiClient);
  const detailQuery = useQuery({
    enabled: Boolean(client && deliveryId),
    queryFn: () => {
      if (!client || !deliveryId) {
        throw new Error('配送任务未选择');
      }
      return getDeliveryTaskDetail(client, deliveryId);
    },
    queryKey: ['deliveryDetail', deliveryId],
  });
  const visibleDetail = detailQuery.data ?? detail;
  const actions = visibleDetail ? getDeliveryActions(roles, ownsTask, visibleDetail.status) : [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{visibleDetail?.order_no ?? '配送详情'}</Text>
      {detailQuery.isLoading ? <Text style={styles.mutedText}>正在加载配送详情...</Text> : null}
      {detailQuery.error ? <Text style={styles.errorText}>{(detailQuery.error as Error).message}</Text> : null}
      <Text>客户：{visibleDetail?.customer_name ?? '-'}</Text>
      <Text>收货：{visibleDetail ? `${visibleDetail.recipient_name} ${visibleDetail.recipient_phone}` : '-'}</Text>
      <Text>地址：{visibleDetail?.delivery_address ?? '-'}</Text>
      <Text>签名：{visibleDetail?.signature_image_url ? '已采集' : '未采集'}</Text>
      <View style={styles.actions}>
        <Button title="导航" disabled={!visibleDetail?.delivery_address} onPress={() => visibleDetail?.delivery_address ? openMap(visibleDetail.delivery_address) : undefined} />
        <Button title="签收" disabled={!actions.includes('sign')} onPress={onSign} />
        <Button title="异常" disabled={!actions.includes('exception')} onPress={onException} />
        <Button title="退货" disabled={!actions.includes('return')} onPress={onReturn} />
      </View>
      {visibleDetail?.items.map(item => (
        <Text key={item.product_id} style={styles.itemText}>
          {item.product_name} · {item.barcode} × {item.quantity}
        </Text>
      ))}
      {visibleDetail?.events?.map(event => (
        <Text key={event.id} style={styles.eventText}>
          {event.exception_type ?? event.event_type}：{event.remark ?? '-'}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  container: { padding: 24 },
  errorText: { color: '#c00000', marginBottom: 8 },
  eventText: { color: '#b54708', marginTop: 8 },
  itemText: { marginTop: 8 },
  mutedText: { color: '#667085', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
});
