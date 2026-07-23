import React, { useMemo, useState } from 'react';
import { Button, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CartItemRow } from './CartItemRow';
import { useCart } from './cartStore';

export type CartScreenProps = {
  onNavigateProductDetail?: (productId: string) => void;
};

function formatPrice(price: number): string {
  return Number.isInteger(price) ? `¥${price}` : `¥${price.toFixed(2)}`;
}

export function CartScreen({ onNavigateProductDetail }: CartScreenProps) {
  const cart = useCart();
  const [customerPickerVisible, setCustomerPickerVisible] = useState(false);
  const [removeCustomerId, setRemoveCustomerId] = useState<string | null>(null);
  const [quantityProductId, setQuantityProductId] = useState<string | null>(null);
  const quantityLine = useMemo(
    () => cart.activeLines.find(line => line.productId === quantityProductId) ?? null,
    [cart.activeLines, quantityProductId],
  );
  const activeCustomerId = cart.activeCustomerId;

  function removeCustomer() {
    if (removeCustomerId) {
      cart.removeCustomer(removeCustomerId);
      setRemoveCustomerId(null);
    }
  }

  function navigateProductDetail(productId: string) {
    onNavigateProductDetail?.(productId);
  }

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{`购物车 ${cart.totalQuantity}`}</Text>
        <View style={styles.customerActions}>
          <Text style={styles.customerArea}>客户</Text>
          <Button title="+" onPress={() => setCustomerPickerVisible(true)} />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.customerTabs}>
        {cart.state.customerTabs.map(tab => (
          <Pressable
            accessibilityLabel={`客户 ${tab.customerName}`}
            key={tab.customerId}
            onLongPress={() => setRemoveCustomerId(tab.customerId)}
            onPress={() => cart.selectCustomer(tab.customerId)}
            style={[styles.customerTab, tab.customerId === activeCustomerId ? styles.customerTabActive : null]}
          >
            <Text style={tab.customerId === activeCustomerId ? styles.customerTabTextActive : styles.customerTabText}>{tab.customerName}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {customerPickerVisible ? <Text style={styles.panelText}>选择客户</Text> : null}
      {removeCustomerId ? (
        <Pressable accessibilityLabel="确认删除客户购物车" onPress={removeCustomer} style={styles.removeCustomerAction}>
          <Text style={styles.removeCustomerText}>删除客户购物车</Text>
        </Pressable>
      ) : null}
      <ScrollView contentContainerStyle={styles.listContent}>
        {!cart.activeLines.length ? <Text style={styles.empty}>购物车暂无商品</Text> : null}
        {cart.brandGroups.map(group => (
          <View key={group.brandId} style={styles.brandGroup}>
            <Text style={styles.brandTitle}>{`品牌 ${group.brandName}`}</Text>
            {group.lines.map(line => (
              <CartItemRow
                key={line.productId}
                isQuantityEditing={quantityLine?.productId === line.productId}
                line={line}
                onDelete={productId => activeCustomerId && cart.removeItem(activeCustomerId, productId)}
                onDetail={navigateProductDetail}
                onQuantityChange={(productId, quantity) => activeCustomerId && cart.setQuantity(activeCustomerId, productId, quantity)}
                onQuantityPress={setQuantityProductId}
                onToggleSelected={productId => activeCustomerId && cart.toggleItem(activeCustomerId, productId)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
      <View style={styles.checkoutBar}>
        <Pressable
          accessibilityLabel="全选购物车商品"
          onPress={() => activeCustomerId && cart.toggleAll(activeCustomerId, cart.selectedKindCount !== cart.activeLines.length)}
          style={styles.allSelect}
        >
          <Text>{cart.activeLines.length > 0 && cart.selectedKindCount === cart.activeLines.length ? '✓' : ''}</Text>
        </Pressable>
        <Text style={styles.total}>{`合计：${formatPrice(cart.selectedTotal)}`}</Text>
        <Pressable style={styles.checkoutButton}>
          <Text style={styles.checkoutText}>{`结算(${cart.selectedKindCount}种)`}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  allSelect: {
    alignItems: 'center',
    borderColor: '#98a2b3',
    borderRadius: 10,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  brandGroup: {
    marginBottom: 14,
  },
  brandTitle: {
    color: '#344054',
    fontWeight: '800',
    marginBottom: 8,
  },
  checkoutBar: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderTopColor: '#eaecf0',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  checkoutButton: {
    backgroundColor: '#1677ff',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  checkoutText: {
    color: '#fff',
    fontWeight: '800',
  },
  container: {
    backgroundColor: '#f7f8fb',
    flex: 1,
  },
  customerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  customerArea: {
    color: '#667085',
  },
  customerTab: {
    backgroundColor: '#f2f4f7',
    borderRadius: 16,
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  customerTabActive: {
    backgroundColor: '#1677ff',
  },
  customerTabText: {
    color: '#344054',
  },
  customerTabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  customerTabs: {
    flexGrow: 0,
    paddingHorizontal: 16,
  },
  empty: {
    color: '#667085',
    marginTop: 24,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 96,
  },
  panelText: {
    color: '#1677ff',
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  removeCustomerAction: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  removeCustomerText: {
    color: '#e5484d',
    fontWeight: '800',
  },
  title: {
    color: '#101828',
    fontSize: 24,
    fontWeight: '800',
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  total: {
    flex: 1,
    fontWeight: '800',
  },
});
