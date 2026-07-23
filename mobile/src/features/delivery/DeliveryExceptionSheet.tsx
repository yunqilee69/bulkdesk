import { useMutation } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiClient } from '../../api/client';
import { createDeliveryException } from '../../api/delivery';
import { useApiClient } from '../../app/apiClientContext';
import type { DeliveryExceptionType } from '../../api/delivery';

const defaultExceptionType: DeliveryExceptionType = 'customer_absent';

export function DeliveryExceptionSheet({
  apiClient,
  defaultExceptionType: initialExceptionType = defaultExceptionType,
  deliveryId,
  onSubmit,
}: {
  apiClient?: ApiClient;
  defaultExceptionType?: DeliveryExceptionType;
  deliveryId?: string;
  onSubmit?: (value: { exception_type: DeliveryExceptionType; remark?: string | null }) => void;
}) {
  const client = useApiClient(apiClient);
  const [remark, setRemark] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const exceptionMutation = useMutation({
    mutationFn: (value: { exception_type: DeliveryExceptionType; remark?: string | null }) => {
      if (!client || !deliveryId) {
        throw new Error('配送任务未选择');
      }
      return createDeliveryException(client, deliveryId, value);
    },
    onError: error => setMessage(error instanceof Error ? error.message : '异常提交失败'),
    onSuccess: () => setMessage('异常已提交'),
  });
  const trimmedRemark = remark.trim();
  const disabled = exceptionMutation.isPending || (initialExceptionType === 'other' && !trimmedRemark);

  function submit() {
    const value = { exception_type: initialExceptionType, remark: trimmedRemark || null };
    onSubmit?.(value);
    if (deliveryId && client) {
      exceptionMutation.mutate(value);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>配送异常</Text>
      <Text>{`异常类型：${initialExceptionType === 'other' ? '其他' : '客户不在'}`}</Text>
      <TextInput
        accessibilityLabel="异常说明"
        onChangeText={setRemark}
        placeholder="填写异常说明"
        style={styles.input}
        value={remark}
      />
      {message ? <Text style={message === '异常已提交' ? styles.successText : styles.errorText}>{message}</Text> : null}
      <Button title="提交异常" disabled={disabled} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 24 },
  errorText: { color: '#c00000' },
  input: { borderColor: '#d9d9d9', borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  successText: { color: '#027a48' },
  title: { fontSize: 20, fontWeight: '700' },
});
