import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner, type Code } from 'react-native-vision-camera';

import type { ApiClient } from '../../api/client';
import {
  listMobileProductCategories,
  listMobileProducts,
  type MobileProductListItem,
  type MobileProductListResult,
} from '../../api/products';
import { useApiClient } from '../../app/apiClientContext';
import { createPendingScanFromVisionCode } from '../../platform/camera/visionCameraAdapter';
import type { PendingScanResult, Scanner } from '../../platform/contracts';
import { DEFAULT_CART_CUSTOMER } from '../cart/cartModel';
import { useCart } from '../cart/cartStore';
import { ProductCard } from './ProductCard';
import {
  buildProductListQuery,
  flattenProductPages,
  RECOMMEND_CATEGORY_ID,
} from './productHomeModel';

export function ProductHomeScreen({ apiClient, scanner }: { apiClient?: ApiClient; scanner?: Scanner }) {
  const client = useApiClient(apiClient);
  const cart = useCart();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const scanAcceptedRef = useRef(false);
  const [activeCategoryId, setActiveCategoryId] = useState(RECOMMEND_CATEGORY_ID);
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastVersion, setToastVersion] = useState(0);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeout = setTimeout(() => setToastMessage(null), 1600);
    return () => clearTimeout(timeout);
  }, [toastMessage, toastVersion]);

  const categoriesQuery = useQuery({
    enabled: Boolean(client),
    queryFn: () => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      return listMobileProductCategories(client);
    },
    queryKey: ['mobile', 'productCategories'],
  });

  const productsQuery = useInfiniteQuery<
    MobileProductListResult,
    Error,
    InfiniteData<MobileProductListResult, number>,
    readonly [string, string, string, string],
    number
  >({
    enabled: Boolean(client),
    getNextPageParam: lastPage => {
      const loaded = lastPage.page * lastPage.page_size;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      return listMobileProducts(client, buildProductListQuery({
        activeCategoryId,
        keyword: submittedKeyword,
        page: pageParam,
      }));
    },
    queryKey: ['mobile', 'products', activeCategoryId, submittedKeyword] as const,
  });

  const products = flattenProductPages(productsQuery.data?.pages);
  const categoryTabs = [
    { id: RECOMMEND_CATEGORY_ID, name: '推荐' },
    ...(categoriesQuery.data ?? []),
  ];

  function submitSearch() {
    setScanError(null);
    setToastMessage(null);
    setSubmittedKeyword(keyword.trim());
  }

  const acceptCameraScan = useCallback((scan: PendingScanResult) => {
    if (scanAcceptedRef.current) {
      return;
    }

    scanAcceptedRef.current = true;
    const value = scan.value.trim();
    setKeyword(value);
    setSubmittedKeyword(value);
    setCameraActive(false);
    setScanError(null);
  }, []);

  const codeScanner = useCodeScanner({
    codeTypes: ['qr', 'ean-13', 'code-128', 'code-39'],
    onCodeScanned: (codes: Code[]) => {
      const pendingScan = codes.map(createPendingScanFromVisionCode).find((scan): scan is PendingScanResult => scan !== null);

      if (pendingScan) {
        acceptCameraScan(pendingScan);
      }
    },
  });

  async function openCameraScanner() {
    if (!device) {
      setScanError('未发现后置摄像头，无法扫码');
      return;
    }

    const granted = hasPermission || (await requestPermission());

    if (!granted) {
      setScanError('相机权限未授权，请在系统设置中允许相机访问');
      return;
    }

    scanAcceptedRef.current = false;
    setCameraActive(true);
    setScanError(null);
  }

  function closeCameraScanner() {
    scanAcceptedRef.current = true;
    setCameraActive(false);
  }

  async function scanSearch() {
    setScanError(null);
    setToastMessage(null);

    if (!scanner) {
      await openCameraScanner();
      return;
    }

    try {
      const result = await scanner.scanOnce();
      const value = result.value.trim();
      setKeyword(value);
      setSubmittedKeyword(value);
    } catch (error) {
      setScanError(error instanceof Error && error.message ? error.message : '扫码失败');
    }
  }

  function addProduct(product: MobileProductListItem) {
    const customerId = cart.activeCustomerId ?? DEFAULT_CART_CUSTOMER.customerId;
    if (!cart.activeCustomerId) {
      cart.addCustomer(DEFAULT_CART_CUSTOMER);
    }
    cart.addItem(customerId, {
      productId: product.id,
      name: product.name,
      specification: product.short_name ?? product.unit,
      brandId: product.brand_id ?? null,
      brandName: product.brand_name ?? null,
      price: product.display_price,
      standardPrice: product.standard_price,
      imageUrl: product.image_url ?? null,
    });
    setToastMessage('已加入购物车');
    setToastVersion(version => version + 1);
  }

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryBar}>
        {categoryTabs.map(category => (
          <Pressable
            key={category.id}
            onPress={() => setActiveCategoryId(category.id)}
            style={[styles.categoryTab, activeCategoryId === category.id ? styles.categoryTabActive : null]}
          >
            <Text style={activeCategoryId === category.id ? styles.categoryTextActive : styles.categoryText}>{category.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.searchBox}>
        <Pressable accessibilityLabel="扫码搜索" accessibilityRole="button" onPress={scanSearch} style={styles.searchIconButton}>
          <Text style={styles.searchIcon}>⌗</Text>
        </Pressable>
        <TextInput
          accessibilityLabel="商品搜索关键字"
          onChangeText={setKeyword}
          placeholder="输入商品名或条码"
          style={styles.searchInput}
          value={keyword}
        />
        <Pressable accessibilityLabel="搜索" accessibilityRole="button" onPress={submitSearch} style={styles.searchIconButton}>
          <Text style={styles.searchIcon}>🔍</Text>
        </Pressable>
      </View>
      {scanError ? <Text style={styles.errorText}>{scanError}</Text> : null}
      {cameraActive && hasPermission && device ? (
        <View style={styles.cameraPanel}>
          <Camera device={device} isActive={cameraActive} codeScanner={codeScanner} resizeMode="cover" style={styles.cameraPreview} />
          <View style={styles.cameraFooter}>
            <Text style={styles.cameraHint}>相机扫码中，请将条码放入取景框</Text>
            <Pressable accessibilityLabel="取消扫码" accessibilityRole="button" onPress={closeCameraScanner} style={styles.cameraCancelButton}>
              <Text style={styles.cameraCancelText}>取消</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {productsQuery.isFetching && products.length === 0 ? <Text style={styles.mutedText}>正在加载商品...</Text> : null}
      {productsQuery.error ? <Text style={styles.errorText}>{(productsQuery.error as Error).message}</Text> : null}
      <FlatList
        accessibilityLabel="商品双列列表"
        contentContainerStyle={styles.listContent}
        data={products}
        keyExtractor={item => item.id}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        testID="product-two-column-list"
        onEndReached={() => {
          if (productsQuery.hasNextPage && !productsQuery.isFetchingNextPage) {
            productsQuery.fetchNextPage().catch(() => undefined);
          }
        }}
        columnWrapperStyle={styles.productRow}
        renderItem={({ item }) => (
          <View accessibilityLabel="商品卡片列" style={styles.productColumn}>
            <ProductCard product={item} onAdd={addProduct} />
          </View>
        )}
      />
      {toastMessage ? (
        <View style={styles.bottomToast}>
          <Text style={styles.bottomToastText}>{toastMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cameraCancelButton: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cameraCancelText: {
    color: '#1677ff',
    fontWeight: '700',
  },
  cameraFooter: {
    alignItems: 'center',
    backgroundColor: 'rgba(16, 24, 40, 0.72)',
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    padding: 10,
    position: 'absolute',
    right: 0,
  },
  cameraHint: {
    color: '#fff',
    flex: 1,
    fontWeight: '700',
    marginRight: 12,
  },
  cameraPanel: {
    backgroundColor: '#101828',
    borderRadius: 18,
    height: 220,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cameraPreview: {
    flex: 1,
  },
  categoryBar: {
    flexGrow: 0,
    marginBottom: 12,
  },
  categoryTab: {
    backgroundColor: '#f2f4f7',
    borderRadius: 16,
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryTabActive: {
    backgroundColor: '#1677ff',
  },
  categoryText: {
    color: '#344054',
  },
  categoryTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  container: {
    backgroundColor: '#f7f8fb',
    flex: 1,
    padding: 16,
  },
  errorText: {
    color: '#c00000',
    marginBottom: 8,
  },
  bottomToast: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(16, 24, 40, 0.88)',
    borderRadius: 18,
    bottom: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    position: 'absolute',
  },
  bottomToastText: {
    color: '#fff',
    fontWeight: '700',
  },
  mutedText: {
    color: '#667085',
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 64,
  },
  productColumn: {
    width: '50%',
  },
  productRow: {
    alignItems: 'stretch',
  },
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#d0d5dd',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  searchIcon: {
    color: '#667085',
    fontSize: 18,
    fontWeight: '800',
  },
  searchIconButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
});
