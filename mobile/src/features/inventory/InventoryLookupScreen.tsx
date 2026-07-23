import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { listInventory, listSuppliers, listWarehouses } from '../../api/inventory';
import { useApiClient } from '../../app/apiClientContext';

export function InventoryLookupScreen() {
  const apiClient = useApiClient();
  const [warehouseId, setWarehouseId] = useState('');
  const [submittedWarehouseId, setSubmittedWarehouseId] = useState('');
  const trimmedWarehouseId = submittedWarehouseId.trim();
  const inventoryQuery = useQuery({
    enabled: Boolean(apiClient),
    queryFn: () => {
      if (!apiClient) {
        throw new Error('未连接 API');
      }
      return listInventory(apiClient, { warehouseId: trimmedWarehouseId || undefined, pageSize: 20 });
    },
    queryKey: ['inventoryLookup', trimmedWarehouseId],
  });
  const warehousesQuery = useQuery({
    enabled: Boolean(apiClient),
    queryFn: () => {
      if (!apiClient) {
        throw new Error('未连接 API');
      }
      return listWarehouses(apiClient, { pageSize: 100 });
    },
    queryKey: ['warehouseLookup'],
  });
  const suppliersQuery = useQuery({
    enabled: Boolean(apiClient),
    queryFn: () => {
      if (!apiClient) {
        throw new Error('未连接 API');
      }
      return listSuppliers(apiClient, { pageSize: 100 });
    },
    queryKey: ['supplierLookup'],
  });
  const error = inventoryQuery.error ?? warehousesQuery.error ?? suppliersQuery.error;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>库存查询</Text>
      <Text style={styles.subtitle}>查询现有库存、仓库和供应商，用于扫码作业前核对。</Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="查询仓库"
          autoCapitalize="none"
          onChangeText={setWarehouseId}
          placeholder="仓库 ID（可选）"
          style={styles.input}
          value={warehouseId}
        />
        <Button title="查询" onPress={() => setSubmittedWarehouseId(warehouseId)} />
      </View>
      <Text style={styles.summary}>{`仓库 ${warehousesQuery.data?.items.length ?? 0} 个 · 供应商 ${suppliersQuery.data?.items.length ?? 0} 个`}</Text>
      {inventoryQuery.data?.items.map(item => (
        <Text key={item.id} style={styles.lineText}>{`${item.product_info ?? item.product_id} @ ${item.warehouse_name ?? item.warehouse_id} 可用 ${item.available_quantity}`}</Text>
      ))}
      {error instanceof Error ? <Text style={styles.errorText}>{error.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  errorText: {
    color: '#c00000',
    marginTop: 8,
  },
  input: {
    borderColor: '#d9d9d9',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  lineText: {
    marginTop: 8,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  subtitle: {
    color: '#667085',
    marginTop: 8,
  },
  summary: {
    color: '#475467',
    marginTop: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
});
