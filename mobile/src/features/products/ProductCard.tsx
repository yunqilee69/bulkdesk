import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { MobileProductListItem } from '../../api/products';
import { formatProductPrice, getProductImageUrl, productCardTitle } from './productHomeModel';

type ProductCardProps = {
  product: MobileProductListItem;
  onAdd: (product: MobileProductListItem) => void;
};

export function ProductCard({ product, onAdd }: ProductCardProps) {
  const imageUrl = getProductImageUrl(product);
  const placeholder = (product.brand_name ?? product.name).slice(0, 1);

  return (
    <View style={styles.card}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Text style={styles.placeholderText}>{placeholder}</Text>
        </View>
      )}
      <View accessibilityLabel={productCardTitle(product)} style={styles.titleRow}>
        {product.brand_name ? (
          <View accessibilityLabel={`品牌 ${product.brand_name}`} style={styles.brandPill}>
            <Text numberOfLines={1} style={styles.brandText}>{product.brand_name}</Text>
          </View>
        ) : null}
        <Text numberOfLines={1} style={styles.title}>{product.name}</Text>
      </View>
      <View style={styles.footer}>
        <Text style={styles.price}>{formatProductPrice(product.display_price)}</Text>
        <Pressable
          accessibilityLabel={`加入购物车 ${product.name}`}
          accessibilityRole="button"
          onPress={() => onAdd(product)}
          style={styles.plusButton}
        >
          <Text style={styles.plusText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  brandPill: {
    backgroundColor: '#eef4ff',
    borderRadius: 999,
    marginRight: 6,
    maxWidth: 64,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  brandText: {
    color: '#1677ff',
    fontSize: 11,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    elevation: 1,
    margin: 6,
    padding: 10,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  image: {
    aspectRatio: 1,
    borderRadius: 12,
    width: '100%',
  },
  placeholder: {
    alignItems: 'center',
    backgroundColor: '#f2f4f7',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#667085',
    fontSize: 32,
    fontWeight: '700',
  },
  plusButton: {
    alignItems: 'center',
    backgroundColor: '#1677ff',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  plusText: {
    color: '#fff',
    fontSize: 22,
    lineHeight: 24,
  },
  price: {
    color: '#e5484d',
    fontSize: 16,
    fontWeight: '700',
  },
  title: {
    color: '#1d2939',
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 8,
  },
});
