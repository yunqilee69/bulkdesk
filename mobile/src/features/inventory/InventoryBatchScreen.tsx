import { useMutation } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { type ApiClient } from '../../api/client';
import {
  submitBatchStockIn,
  submitBatchStockOut,
  submitBatchStocktake,
  submitBatchTransfer,
} from '../../api/inventory';
import { useApiClient } from '../../app/apiClientContext';
import {
  addInventoryLine,
  createInventoryBatch,
  type InventoryBatchState,
  type InventoryOperationKind,
  setInventorySubmitting,
  validateInventoryBatch,
} from './inventoryBatchModel';

const operations: Array<{ label: string; value: InventoryOperationKind }> = [
  { label: '入库', value: 'stock_in' },
  { label: '出库', value: 'stock_out' },
  { label: '盘点', value: 'stocktake' },
  { label: '调拨', value: 'transfer' },
];

type SubmitInput = {
  state: InventoryBatchState;
  warehouseId: string;
  toWarehouseId: string;
};

function submitInventoryBatch(client: ApiClient, input: SubmitInput) {
  const quantityItems = input.state.lines.map(line => ({ product_id: line.productId, quantity: line.quantity }));

  if (input.state.operation === 'stock_in') {
    return submitBatchStockIn(client, { warehouse_id: input.warehouseId, items: quantityItems });
  }
  if (input.state.operation === 'stock_out') {
    return submitBatchStockOut(client, { warehouse_id: input.warehouseId, items: quantityItems });
  }
  if (input.state.operation === 'stocktake') {
    return submitBatchStocktake(client, {
      warehouse_id: input.warehouseId,
      items: input.state.lines.map(line => ({ product_id: line.productId, actual_quantity: line.quantity })),
    });
  }

  return submitBatchTransfer(client, {
    from_warehouse_id: input.warehouseId,
    to_warehouse_id: input.toWarehouseId,
    items: quantityItems,
  });
}

function validateSubmission(state: InventoryBatchState, warehouseId: string, toWarehouseId: string): string[] {
  const errors = validateInventoryBatch(state);
  if (!warehouseId) {
    errors.push(state.operation === 'transfer' ? '请填写调出仓库' : '请填写仓库');
  }
  if (state.operation === 'transfer' && !toWarehouseId) {
    errors.push('请填写目标仓库');
  }
  if (state.operation === 'transfer' && warehouseId && warehouseId === toWarehouseId) {
    errors.push('调出仓库和目标仓库不能相同');
  }
  return errors;
}

export function InventoryBatchScreen() {
  const apiClient = useApiClient();
  const [state, setState] = useState(() => createInventoryBatch('stock_in'));
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('main');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [successOrderNo, setSuccessOrderNo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const trimmedWarehouseId = warehouseId.trim();
  const trimmedToWarehouseId = toWarehouseId.trim();
  const errors = validateSubmission(state, trimmedWarehouseId, trimmedToWarehouseId);
  const mutation = useMutation({
    mutationFn: (input: SubmitInput) => {
      if (!apiClient) {
        throw new Error('未连接 API');
      }
      return submitInventoryBatch(apiClient, input);
    },
    onSuccess: movement => {
      setSuccessOrderNo(movement.order_no);
    },
    onError: error => {
      setSubmitError(error instanceof Error ? error.message : '提交失败');
    },
    onSettled: () => {
      setState(current => setInventorySubmitting(current, false));
    },
  });
  const submitting = state.submitting || mutation.isPending;
  const canSubmit = !submitting && errors.length === 0 && Boolean(apiClient);

  function selectOperation(operation: InventoryOperationKind) {
    if (submitting) {
      return;
    }
    setState(createInventoryBatch(operation));
    setSuccessOrderNo(null);
    setSubmitError(null);
  }

  function addLine() {
    const product = productId.trim();
    if (!product || !trimmedWarehouseId || submitting) {
      return;
    }
    setState(current => addInventoryLine(current, { productId: product, warehouseId: trimmedWarehouseId, quantity: 1 }));
    setProductId('');
    setSuccessOrderNo(null);
    setSubmitError(null);
  }

  function submitBatch() {
    if (!canSubmit) {
      return;
    }
    setState(current => setInventorySubmitting(current, true));
    setSuccessOrderNo(null);
    setSubmitError(null);
    mutation.mutate({ state, warehouseId: trimmedWarehouseId, toWarehouseId: trimmedToWarehouseId });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>仓库扫码作业</Text>
      <Text style={styles.subtitle}>入库、出库、盘点、调拨共用批量清单模型。</Text>
      <View style={styles.row}>
        {operations.map(operation => (
          <Button
            disabled={submitting || state.operation === operation.value}
            key={operation.value}
            onPress={() => selectOperation(operation.value)}
            title={operation.label}
          />
        ))}
      </View>
      <TextInput accessibilityLabel="仓库" onChangeText={setWarehouseId} placeholder="仓库 ID" style={styles.input} value={warehouseId} />
      {state.operation === 'transfer' ? (
        <TextInput
          accessibilityLabel="目标仓库"
          onChangeText={setToWarehouseId}
          placeholder="目标仓库 ID"
          style={styles.input}
          value={toWarehouseId}
        />
      ) : null}
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="商品"
          autoCapitalize="none"
          onChangeText={setProductId}
          placeholder="扫码或输入商品 ID"
          style={styles.input}
          value={productId}
        />
        <Button disabled={submitting} title="加入" onPress={addLine} />
      </View>
      {state.lines.map(line => (
        <Text key={`${line.productId}-${line.warehouseId}`} style={styles.lineText}>
          {line.productId} @ {line.warehouseId} × {line.quantity}
        </Text>
      ))}
      {errors.map(error => <Text key={error} style={styles.errorText}>{error}</Text>)}
      {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}
      {successOrderNo ? <Text style={styles.successText}>{`提交成功：${successOrderNo}`}</Text> : null}
      <Button disabled={!canSubmit} title={submitting ? '提交中...' : '提交'} onPress={submitBatch} />
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
    marginTop: 12,
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
  successText: {
    color: '#008000',
    marginTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
});
