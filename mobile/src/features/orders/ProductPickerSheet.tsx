import React from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';

import type { DraftWorkspaceItem } from './draftWorkspaceModel';

export function ProductPickerSheet({
  barcode,
  items,
  onAddItem,
  onChangeBarcode,
}: {
  barcode: string;
  items: DraftWorkspaceItem[];
  onAddItem: () => void;
  onChangeBarcode: (barcode: string) => void;
}) {
  return (
    <>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="商品条码"
          autoCapitalize="none"
          onChangeText={onChangeBarcode}
          placeholder="扫码或输入商品条码"
          style={styles.input}
          value={barcode}
        />
        <Button title="加购" onPress={onAddItem} />
      </View>
      {items.map(item => (
        <Text key={item.productId} style={styles.itemText}>
          {item.productId} × {item.quantity}
        </Text>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    borderColor: '#d9d9d9',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemText: {
    marginTop: 8,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
});
