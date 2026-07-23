import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiClientError, type ApiClient } from '../../api/client';
import {
  abandonOrderDraft,
  createOrderDraft,
  listAvailableOrderDrafts,
  listMyOrderDrafts,
  saveOrderDraft,
  submitOrderDraft,
  takeOverOrderDraft,
  type OrderDraft,
  type OrderDraftSaveInput,
} from '../../api/orderDrafts';
import { getMobileProductByBarcode } from '../../api/products';
import { useApiClient } from '../../app/apiClientContext';
import { AvailableDraftsScreen } from './AvailableDraftsScreen';
import { CustomerPickerSheet } from './CustomerPickerSheet';
import {
  addDraftItem,
  closeDraftTab,
  createDraftWorkspace,
  markDraftSaved,
  openDraftTab,
  selectDraftTab,
  type DraftWorkspaceTab,
  type DraftWorkspaceState,
} from './draftWorkspaceModel';
import { validateDraftSubmission } from './orderWorkspaceValidation';
import { ProductPickerSheet } from './ProductPickerSheet';

function activeTab(state: DraftWorkspaceState) {
  return state.tabs.find(tab => tab.draftId === state.activeDraftId) ?? null;
}

function draftToTab(draft: OrderDraft) {
  return {
    customerId: draft.customer_id,
    customerName: draft.customer_id,
    dirty: false,
    draftId: draft.id,
    items: draft.items.map(item => ({
      productId: item.product_id,
      quantity: item.quantity,
      remark: item.remark ?? null,
    })),
    status: draft.status,
    version: draft.version,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  return error instanceof Error ? error.message : '操作失败';
}

function createIdempotencyKey(): string {
  const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return crypto?.randomUUID?.() ?? `idem-${Date.now()}`;
}

function buildDraftSaveInput(tab: DraftWorkspaceTab): OrderDraftSaveInput {
  return {
    items: tab.items.map(item => ({ product_id: item.productId, quantity: item.quantity, remark: item.remark ?? null })),
    remark: null,
    version: tab.version,
  };
}

export function OrdersWorkspaceScreen({ apiClient }: { apiClient?: ApiClient }) {
  const client = useApiClient(apiClient);
  const queryClient = useQueryClient();
  const [state, setState] = useState(() => createDraftWorkspace());
  const [customerId, setCustomerId] = useState('');
  const [barcode, setBarcode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const autosaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const submitKeysRef = useRef<Record<string, string>>({});
  const selectedTab = activeTab(state);
  const totalQuantity = useMemo(
    () => selectedTab?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    [selectedTab],
  );

  const draftsQuery = useQuery({
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      return listMyOrderDrafts(client);
    },
    queryKey: ['orderDrafts', 'mine'],
  });

  const availableDraftsQuery = useQuery({
    enabled: Boolean(client),
    queryFn: async () => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      return listAvailableOrderDrafts(client);
    },
    queryKey: ['orderDrafts', 'available'],
  });

  function refreshDraftLists() {
    queryClient.invalidateQueries({ queryKey: ['orderDrafts'] }).catch(() => undefined);
  }

  const createMutation = useMutation({
    mutationFn: (input: { customerId: string }) => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      return createOrderDraft(client, { customer_id: input.customerId });
    },
    onError: error => setMessage(errorMessage(error)),
    onSuccess: draft => {
      setState(current => openDraftTab(current, draftToTab(draft)));
      setCustomerId('');
      setMessage(null);
      refreshDraftLists();
    },
  });

  const saveMutation = useMutation({
    mutationFn: (input: { draftId: string }) => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      const tab = state.tabs.find(item => item.draftId === input.draftId);
      if (!tab) {
        throw new Error('草稿不存在');
      }
      return saveOrderDraft(client, tab.draftId, buildDraftSaveInput(tab));
    },
    onError: error => setMessage(errorMessage(error)),
    onSuccess: draft => {
      setState(current => markDraftSaved(current, draft.id, draft.version));
      setMessage('草稿已保存');
      refreshDraftLists();
    },
  });

  const submitMutation = useMutation({
    mutationFn: (input: { draftId: string }) => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      const tab = state.tabs.find(item => item.draftId === input.draftId);
      if (!tab) {
        throw new Error('草稿不存在');
      }
      const validationMessage = validateDraftSubmission(tab);
      if (validationMessage) {
        throw new Error(validationMessage);
      }
      const idempotencyKey = submitKeysRef.current[tab.draftId] ?? createIdempotencyKey();
      submitKeysRef.current[tab.draftId] = idempotencyKey;
      return submitOrderDraft(client, tab.draftId, { version: tab.version }, idempotencyKey);
    },
    onError: error => setMessage(errorMessage(error)),
    onSuccess: result => {
      delete submitKeysRef.current[result.draft.id];
      setState(current => closeDraftTab(current, result.draft.id));
      setMessage(`已提交订单：${result.order_id}`);
      refreshDraftLists();
    },
  });

  const takeoverMutation = useMutation({
    mutationFn: (input: { draftId: string; version: number }) => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      return takeOverOrderDraft(client, input.draftId, { version: input.version });
    },
    onError: error => setMessage(errorMessage(error)),
    onSuccess: result => {
      setState(current => openDraftTab(current, draftToTab(result.draft)));
      setMessage(`已接手：${result.previous_owner_employee_name}`);
      refreshDraftLists();
    },
  });

  const abandonMutation = useMutation({
    mutationFn: (input: { draftId: string }) => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      const tab = state.tabs.find(item => item.draftId === input.draftId);
      if (!tab) {
        throw new Error('草稿不存在');
      }
      return abandonOrderDraft(client, tab.draftId, { version: tab.version });
    },
    onError: error => setMessage(errorMessage(error)),
    onSuccess: draft => {
      delete submitKeysRef.current[draft.id];
      setState(current => closeDraftTab(current, draft.id));
      setMessage('草稿已作废');
      refreshDraftLists();
    },
  });

  useEffect(() => {
    if (!client) {
      return undefined;
    }

    const autosaveTimers = autosaveTimersRef.current;
    const scheduledDraftIds: string[] = [];
    for (const tab of state.tabs) {
      const existingTimer = autosaveTimers[tab.draftId];
      if (existingTimer) {
        clearTimeout(existingTimer);
        delete autosaveTimers[tab.draftId];
      }
      if (!tab.dirty || tab.status !== 'editing') {
        continue;
      }
      scheduledDraftIds.push(tab.draftId);
      autosaveTimers[tab.draftId] = setTimeout(() => {
        saveOrderDraft(client, tab.draftId, buildDraftSaveInput(tab))
          .then(draft => {
            setState(current => markDraftSaved(current, draft.id, draft.version));
            setMessage('草稿已自动保存');
            queryClient.invalidateQueries({ queryKey: ['orderDrafts'] }).catch(() => undefined);
          })
          .catch(error => setMessage(errorMessage(error)))
          .finally(() => {
            delete autosaveTimers[tab.draftId];
          });
      }, 500);
    }

    return () => {
      for (const draftId of scheduledDraftIds) {
        const timer = autosaveTimers[draftId];
        if (timer) {
          clearTimeout(timer);
          delete autosaveTimers[draftId];
        }
      }
    };
  }, [client, queryClient, state.tabs]);

  function openCustomerDraft() {
    const trimmedCustomerId = customerId.trim();
    if (!trimmedCustomerId || createMutation.isPending) {
      return;
    }
    createMutation.mutate({ customerId: trimmedCustomerId });
  }

  async function addScannedItem() {
    const productBarcode = barcode.trim();
    if (!selectedTab || !productBarcode) {
      return;
    }
    if (!client) {
      setMessage('API 客户端未连接');
      return;
    }
    try {
      const product = await getMobileProductByBarcode(client, productBarcode);
      setState(current => addDraftItem(current, selectedTab.draftId, { productId: product.id, quantity: 1 }));
      setBarcode('');
      setMessage(null);
    } catch (error) {
      setMessage(errorMessage(error));
    }
  }

  function submitSelectedDraft() {
    if (!selectedTab || submitMutation.isPending) {
      return;
    }
    const validationMessage = validateDraftSubmission(selectedTab);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }
    submitMutation.mutate({ draftId: selectedTab.draftId });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>多客户草稿下单</Text>
      <CustomerPickerSheet
        customerId={customerId}
        disabled={!client || createMutation.isPending}
        onChangeCustomerId={setCustomerId}
        onOpenDraft={openCustomerDraft}
      />
      {draftsQuery.data ? <Text style={styles.mutedText}>{`我的草稿：${draftsQuery.data.length}`}</Text> : null}
      {draftsQuery.error ? <Text style={styles.errorText}>{errorMessage(draftsQuery.error)}</Text> : null}
      {availableDraftsQuery.data ? (
        <AvailableDraftsScreen
          drafts={availableDraftsQuery.data}
          onTakeOver={draft => takeoverMutation.mutate({ draftId: draft.id, version: draft.version })}
          takingOver={takeoverMutation.isPending}
        />
      ) : null}
      {availableDraftsQuery.error ? <Text style={styles.errorText}>{errorMessage(availableDraftsQuery.error)}</Text> : null}
      {message ? <Text style={styles.mutedText}>{message}</Text> : null}
      <ScrollView horizontal style={styles.tabs}>
        {state.tabs.map(tab => (
          <View key={tab.draftId} style={styles.tabButton}>
            <Button title={tab.customerName} onPress={() => setState(current => selectDraftTab(current, tab.draftId))} />
            <Button title="×" onPress={() => setState(current => closeDraftTab(current, tab.draftId))} />
          </View>
        ))}
      </ScrollView>
      {selectedTab ? (
        <View style={styles.panel}>
          <Text style={styles.subtitle}>{selectedTab.customerName}</Text>
          <Text>{`版本：${selectedTab.version} · 商品数量：${totalQuantity}`}</Text>
          <ProductPickerSheet
            barcode={barcode}
            items={selectedTab.items}
            onAddItem={() => { addScannedItem().catch(error => setMessage(errorMessage(error))); }}
            onChangeBarcode={setBarcode}
          />
          <View style={styles.actions}>
            <Button title="保存草稿" disabled={!selectedTab.dirty || saveMutation.isPending} onPress={() => saveMutation.mutate({ draftId: selectedTab.draftId })} />
            <Button title="作废草稿" disabled={abandonMutation.isPending} onPress={() => abandonMutation.mutate({ draftId: selectedTab.draftId })} />
            <Button title="提交" disabled={submitMutation.isPending} onPress={submitSelectedDraft} />
          </View>
        </View>
      ) : (
        <Text style={styles.empty}>请选择或打开一个客户草稿。</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  container: {
    flex: 1,
    padding: 24,
  },
  empty: {
    color: '#667085',
    marginTop: 24,
  },
  errorText: {
    color: '#c00000',
    marginTop: 8,
  },
  mutedText: {
    color: '#667085',
    marginTop: 8,
  },
  panel: {
    marginTop: 16,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  tabButton: {
    flexDirection: 'row',
    marginRight: 8,
  },
  tabs: {
    marginTop: 12,
    maxHeight: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
});
