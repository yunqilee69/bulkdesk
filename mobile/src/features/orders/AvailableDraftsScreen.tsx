import React from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';

import type { OrderDraft } from '../../api/orderDrafts';

export function AvailableDraftsScreen({
  drafts,
  onTakeOver,
  takingOver = false,
}: {
  drafts: OrderDraft[];
  onTakeOver: (draft: OrderDraft) => void;
  takingOver?: boolean;
}) {
  return (
    <View style={styles.availablePanel}>
      <Text style={styles.mutedText}>{`可接手草稿：${drafts.length}`}</Text>
      {drafts.map(draft => (
        <View key={draft.id} style={styles.availableDraft}>
          <Text style={styles.itemText}>{`${draft.id} · ${draft.customer_id} · 版本：${draft.version}`}</Text>
          <Button title="接手草稿" disabled={takingOver} onPress={() => onTakeOver(draft)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  availableDraft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  availablePanel: {
    marginTop: 8,
  },
  itemText: {
    marginTop: 8,
  },
  mutedText: {
    color: '#667085',
    marginTop: 8,
  },
});
