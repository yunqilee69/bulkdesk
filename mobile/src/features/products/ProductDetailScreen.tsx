import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type ProductDetailScreenProps = {
  route?: {
    params?: {
      productId?: string;
    };
  };
  productId?: string;
};

export function ProductDetailScreen({ route, productId }: ProductDetailScreenProps) {
  const resolvedProductId = productId ?? route?.params?.productId ?? '';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>商品详情</Text>
      <Text>{resolvedProductId}</Text>
      <Text style={styles.note}>详情接口待接入</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
    padding: 24,
  },
  note: {
    color: '#667085',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
});
