import React, { useMemo, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { CartLine } from './cartModel';

type CartItemRowProps = {
  line: CartLine;
  isQuantityEditing?: boolean;
  onDelete: (productId: string) => void;
  onDetail: (productId: string) => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  onQuantityPress: (productId: string) => void;
  onToggleSelected: (productId: string) => void;
};

function formatPrice(price: number): string {
  return Number.isInteger(price) ? `¥${price}` : `¥${price.toFixed(2)}`;
}

export function CartItemRow({
  line,
  isQuantityEditing = false,
  onDelete,
  onDetail,
  onQuantityChange,
  onQuantityPress,
  onToggleSelected,
}: CartItemRowProps) {
  const [deleteVisible, setDeleteVisible] = useState(false);
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gestureState) => Math.abs(gestureState.dx) > 20,
    onPanResponderRelease: (_event, gestureState) => {
      if (gestureState.dx < -20) {
        setDeleteVisible(true);
      }
    },
  }), []);
  const initial = (line.brandName ?? line.name).slice(0, 1);
  const showOriginalPrice = line.standardPrice != null && line.standardPrice !== line.price;

  return (
    <View style={styles.wrapper}>
      {deleteVisible ? (
        <Pressable accessibilityLabel={`删除 ${line.name}`} onPress={() => onDelete(line.productId)} style={styles.deleteButton}>
          <Text style={styles.deleteText}>删除</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityActions={[{ name: 'delete', label: '删除' }]}
        accessibilityLabel={`购物车商品 ${line.name}`}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'delete') {
            onDelete(line.productId);
          }
        }}
        onPress={() => onDetail(line.productId)}
        style={styles.row}
        {...panResponder.panHandlers}
      >
        <Pressable accessibilityLabel={`选择 ${line.name}`} onPress={() => onToggleSelected(line.productId)} style={styles.checkbox}>
          <Text>{line.selected ? '✓' : ''}</Text>
        </Pressable>
        {line.imageUrl ? (
          <Image source={{ uri: line.imageUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Text style={styles.placeholderText}>{initial}</Text>
          </View>
        )}
        <View style={styles.content}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>{line.name}</Text>
            {isQuantityEditing ? (
              <View accessibilityLabel={`数量编辑 ${line.name}`} style={styles.quantityEditor}>
                <Pressable accessibilityLabel={`减少数量 ${line.name}`} onPress={() => onQuantityChange(line.productId, line.quantity - 1)} style={styles.quantityStepButton}>
                  <Text style={styles.quantityStepText}>-</Text>
                </Pressable>
                <TextInput
                  accessibilityLabel={`数量输入 ${line.name}`}
                  keyboardType="number-pad"
                  onChangeText={value => {
                    const quantity = Number.parseInt(value, 10);
                    if (Number.isFinite(quantity)) {
                      onQuantityChange(line.productId, quantity);
                    }
                  }}
                  style={styles.quantityInput}
                  value={String(line.quantity)}
                />
                <Pressable accessibilityLabel={`增加数量 ${line.name}`} onPress={() => onQuantityChange(line.productId, line.quantity + 1)} style={styles.quantityStepButton}>
                  <Text style={styles.quantityStepText}>+</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityLabel={`修改数量 ${line.name}`} onPress={() => onQuantityPress(line.productId)} style={styles.quantityChip}>
                <Text>{`×${line.quantity}`}</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.specification}>{line.specification ?? '默认规格'}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatPrice(line.price)}</Text>
            {showOriginalPrice ? <Text style={styles.originalPrice}>{formatPrice(line.standardPrice ?? 0)}</Text> : null}
            <Pressable accessibilityLabel={`详情 ${line.name}`} onPress={() => onDetail(line.productId)}>
              <Text style={styles.detail}>详情</Text>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  checkbox: {
    alignItems: 'center',
    borderColor: '#98a2b3',
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    marginRight: 10,
    width: 20,
  },
  content: {
    flex: 1,
  },
  deleteButton: {
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#e5484d',
    borderRadius: 10,
    marginBottom: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  deleteText: {
    color: '#fff',
    fontWeight: '700',
  },
  detail: {
    color: '#1677ff',
    fontWeight: '700',
    marginLeft: 12,
  },
  image: {
    borderRadius: 10,
    height: 56,
    marginRight: 10,
    width: 56,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  originalPrice: {
    color: '#98a2b3',
    fontSize: 12,
    marginLeft: 8,
    textDecorationLine: 'line-through',
  },
  placeholder: {
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#667085',
    fontWeight: '700',
  },
  price: {
    color: '#e5484d',
    fontWeight: '800',
  },
  priceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 6,
  },
  quantityChip: {
    backgroundColor: '#f2f4f7',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  quantityEditor: {
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  quantityInput: {
    minWidth: 32,
    paddingHorizontal: 4,
    paddingVertical: 2,
    textAlign: 'center',
  },
  quantityStepButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  quantityStepText: {
    color: '#1677ff',
    fontSize: 16,
    fontWeight: '800',
  },
  row: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    flexDirection: 'row',
    padding: 12,
  },
  specification: {
    color: '#667085',
    marginTop: 4,
  },
  wrapper: {
    marginBottom: 10,
  },
});
