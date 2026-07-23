import React from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';

export function CustomerPickerSheet({
  customerId,
  disabled = false,
  onChangeCustomerId,
  onOpenDraft,
}: {
  customerId: string;
  disabled?: boolean;
  onChangeCustomerId: (customerId: string) => void;
  onOpenDraft: () => void;
}) {
  return (
    <View style={styles.row}>
      <TextInput
        accessibilityLabel="客户ID"
        autoCapitalize="none"
        onChangeText={onChangeCustomerId}
        placeholder="客户 ID"
        style={styles.input}
        value={customerId}
      />
      <Button title="打开草稿" disabled={disabled} onPress={onOpenDraft} />
    </View>
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
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
});
