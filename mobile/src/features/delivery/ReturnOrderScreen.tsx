import { useMutation, useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiClient } from '../../api/client';
import { createReturnOrder, listReturnableItems, type ReturnOrderItemInput } from '../../api/delivery';
import { useApiClient } from '../../app/apiClientContext';

type ReturnCondition = NonNullable<ReturnOrderItemInput['condition']>;

const conditionOptions: { label: string; value: ReturnCondition }[] = [
  { label: '正常', value: 'normal' },
  { label: '过期', value: 'expired' },
  { label: '破损', value: 'damaged' },
  { label: '其他', value: 'other' },
];

export function ReturnOrderScreen({
  apiClient,
  deliveryId,
  onSubmit,
}: {
  apiClient?: ApiClient;
  deliveryId?: string;
  onSubmit?: (remark: string) => void;
}) {
  const client = useApiClient(apiClient);
  const [remark, setRemark] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [condition, setCondition] = useState<ReturnCondition>('normal');
  const [shouldStockIn, setShouldStockIn] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const returnableQuery = useQuery({
    enabled: Boolean(client && deliveryId),
    queryFn: () => {
      if (!client || !deliveryId) {
        throw new Error('配送任务未选择');
      }
      return listReturnableItems(client, deliveryId);
    },
    queryKey: ['deliveryReturnableItems', deliveryId],
  });
  const firstReturnableItem = returnableQuery.data?.find(item => item.returnable_quantity > 0);
  const parsedQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
  const createReturnMutation = useMutation({
    mutationFn: (returnReason: string) => {
      if (!client || !deliveryId || !firstReturnableItem) {
        throw new Error('没有可退商品');
      }
      if (parsedQuantity <= 0 || parsedQuantity > firstReturnableItem.returnable_quantity) {
        throw new Error('退货数量无效');
      }
      if (shouldStockIn && !warehouseId.trim()) {
        throw new Error('请选择入库仓库');
      }
      return createReturnOrder(client, {
        handling_delivery_id: deliveryId,
        items: [{
          condition,
          quantity: parsedQuantity,
          return_reason: returnReason,
          should_stock_in: shouldStockIn,
          source_order_item_id: firstReturnableItem.source_order_item_id,
          warehouse_id: shouldStockIn ? warehouseId.trim() : null,
        }],
        remark: returnReason,
      });
    },
    onError: error => setMessage(error instanceof Error ? error.message : '退货提交失败'),
    onSuccess: returnOrder => setMessage(`退货已提交：${returnOrder.return_no}`),
  });

  function submit() {
    const trimmedRemark = remark.trim();
    onSubmit?.(trimmedRemark);
    if (client && deliveryId) {
      createReturnMutation.mutate(trimmedRemark);
    }
  }

  const submitDisabled = createReturnMutation.isPending || !remark.trim() || !firstReturnableItem || parsedQuantity <= 0 || (shouldStockIn && !warehouseId.trim());

  return (
    <View style={styles.container}>
      <Text style={styles.title}>现场退货</Text>
      <Text style={styles.subtitle}>退货商品以配送可退清单为准，提交后由后端事务处理库存和金额。</Text>
      <TextInput
        accessibilityLabel="退货说明"
        onChangeText={setRemark}
        placeholder="填写退货原因"
        style={styles.input}
        value={remark}
      />
      <TextInput
        accessibilityLabel="退货数量"
        keyboardType="number-pad"
        onChangeText={setQuantity}
        placeholder="退货数量"
        style={styles.input}
        value={quantity}
      />
      <View style={styles.row}>
        {conditionOptions.map(option => (
          <Button key={option.value} title={option.label} disabled={condition === option.value} onPress={() => setCondition(option.value)} />
        ))}
      </View>
      <Button title={shouldStockIn ? '取消入库' : '退货入库'} onPress={() => setShouldStockIn(current => !current)} />
      {shouldStockIn ? (
        <TextInput
          accessibilityLabel="入库仓库"
          autoCapitalize="none"
          onChangeText={setWarehouseId}
          placeholder="入库仓库 ID"
          style={styles.input}
          value={warehouseId}
        />
      ) : null}
      {returnableQuery.isLoading ? <Text style={styles.mutedText}>正在加载可退商品...</Text> : null}
      {returnableQuery.error ? <Text style={styles.errorText}>{(returnableQuery.error as Error).message}</Text> : null}
      {returnableQuery.data?.map(item => (
        <Text key={item.source_order_item_id}>{`${item.product_name} · 可退 ${item.returnable_quantity}`}</Text>
      ))}
      {message ? <Text style={message.startsWith('退货已提交') ? styles.successText : styles.errorText}>{message}</Text> : null}
      <Button title="提交退货" disabled={submitDisabled} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12, padding: 24 },
  errorText: { color: '#c00000' },
  input: { borderColor: '#d9d9d9', borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  mutedText: { color: '#667085' },
  row: { flexDirection: 'row', gap: 8 },
  subtitle: { color: '#667085' },
  successText: { color: '#027a48' },
  title: { fontSize: 22, fontWeight: '700' },
});
