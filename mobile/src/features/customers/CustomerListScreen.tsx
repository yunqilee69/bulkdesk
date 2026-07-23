import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiClient } from '../../api/client';
import { searchCustomers } from '../../api/customers';
import { useApiClient } from '../../app/apiClientContext';

export function CustomerListScreen({
  apiClient,
  onSearch,
}: {
  apiClient?: ApiClient;
  onSearch?: (keyword: string) => void;
}) {
  const client = useApiClient(apiClient);
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const customersQuery = useQuery({
    enabled: Boolean(client && submittedKeyword),
    queryFn: () => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      return searchCustomers(client, submittedKeyword);
    },
    queryKey: ['mobile', 'customers', { keyword: submittedKeyword }],
  });

  function search() {
    const trimmedKeyword = keyword.trim();
    onSearch?.(trimmedKeyword);
    setSubmittedKeyword(trimmedKeyword);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>客户查询</Text>
      <TextInput
        accessibilityLabel="客户关键字"
        onChangeText={setKeyword}
        placeholder="输入客户名称或手机号"
        style={styles.input}
        value={keyword}
      />
      <Button title="搜索客户" onPress={search} />
      {customersQuery.isFetching ? <Text style={styles.mutedText}>正在搜索客户...</Text> : null}
      {customersQuery.error ? <Text style={styles.errorText}>{(customersQuery.error as Error).message}</Text> : null}
      {customersQuery.data?.items.map(customer => (
        <View key={customer.id} style={styles.customerCard}>
          <Text style={styles.customerName}>{customer.name}</Text>
          <Text>{customer.contact_name} · {customer.contact_phone}</Text>
          <Text>等级：{customer.level_name ?? '-'}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
    padding: 24,
  },
  customerCard: {
    backgroundColor: '#f5f7fa',
    borderRadius: 12,
    gap: 4,
    padding: 12,
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#c00000',
  },
  input: {
    borderColor: '#d9d9d9',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mutedText: {
    color: '#667085',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
});
