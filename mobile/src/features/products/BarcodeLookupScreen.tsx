import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useRef, useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner, type Code } from 'react-native-vision-camera';

import type { ApiClient } from '../../api/client';
import { getMobileProductByBarcode } from '../../api/products';
import { useApiClient } from '../../app/apiClientContext';
import { createPendingScanFromVisionCode } from '../../platform/camera/visionCameraAdapter';
import type { PendingScanResult, Scanner } from '../../platform/contracts';

export function BarcodeLookupScreen({
  apiClient,
  onLookup,
  scanner,
}: {
  apiClient?: ApiClient;
  onLookup?: (barcode: string) => void;
  scanner?: Scanner;
}) {
  const client = useApiClient(apiClient);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const scanAcceptedRef = useRef(false);
  const [barcode, setBarcode] = useState('');
  const [submittedBarcode, setSubmittedBarcode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const productQuery = useQuery({
    enabled: Boolean(client && submittedBarcode),
    queryFn: () => {
      if (!client) {
        throw new Error('API 客户端未连接');
      }
      return getMobileProductByBarcode(client, submittedBarcode);
    },
    queryKey: ['mobile', 'barcodeProduct', { barcode: submittedBarcode }],
  });

  function lookup() {
    const trimmedBarcode = barcode.trim();
    setScannerError(null);
    onLookup?.(trimmedBarcode);
    setSubmittedBarcode(trimmedBarcode);
  }

  const acceptCameraScan = useCallback((scan: PendingScanResult) => {
    if (scanAcceptedRef.current) {
      return;
    }

    scanAcceptedRef.current = true;
    const scannedBarcode = scan.value.trim();
    setBarcode(scannedBarcode);
    onLookup?.(scannedBarcode);
    setSubmittedBarcode(scannedBarcode);
    setCameraActive(false);
    setScannerError(null);
  }, [onLookup]);

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
      setScannerError('未发现后置摄像头，无法扫码，请手动输入条码');
      return;
    }

    const granted = hasPermission || (await requestPermission());

    if (!granted) {
      setScannerError('相机权限未授权，请在系统设置中允许相机访问，或手动输入条码');
      return;
    }

    scanAcceptedRef.current = false;
    setCameraActive(true);
    setScannerError(null);
  }

  function closeCameraScanner() {
    scanAcceptedRef.current = true;
    setCameraActive(false);
  }

  async function scanBarcode() {
    setScannerError(null);

    if (!scanner) {
      await openCameraScanner();
      return;
    }

    try {
      const scanResult = await scanner.scanOnce();
      const scannedBarcode = scanResult.value.trim();
      setBarcode(scannedBarcode);
      onLookup?.(scannedBarcode);
      setSubmittedBarcode(scannedBarcode);
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : '扫描失败';
      setScannerError(`${message}，请重试或手动输入条码`);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>条码查询</Text>
      <TextInput
        accessibilityLabel="商品条码"
        autoCapitalize="none"
        onChangeText={setBarcode}
        placeholder="扫描或输入条码"
        style={styles.input}
        value={barcode}
      />
      <Button title="扫描条码" onPress={scanBarcode} />
      <Button title="查询商品" onPress={lookup} />
      {scannerError ? <Text style={styles.errorText}>{scannerError}</Text> : null}
      {cameraActive && hasPermission && device ? (
        <View style={styles.cameraPanel}>
          <Camera device={device} isActive={cameraActive} codeScanner={codeScanner} resizeMode="cover" style={styles.cameraPreview} />
          <Text style={styles.cameraHint}>相机扫码中，请将条码放入取景框</Text>
          <Button title="取消扫码" onPress={closeCameraScanner} />
        </View>
      ) : null}
      {productQuery.isFetching ? <Text style={styles.mutedText}>正在查询商品...</Text> : null}
      {productQuery.error ? <Text style={styles.errorText}>{(productQuery.error as Error).message}</Text> : null}
      {productQuery.data ? (
        <View style={styles.productCard}>
          <Text style={styles.productName}>{productQuery.data.name}</Text>
          <Text>{productQuery.data.barcode} · {productQuery.data.unit} · ¥{productQuery.data.standard_price}</Text>
          {productQuery.data.warehouses.map(warehouse => (
            <Text key={warehouse.warehouse_id}>{`${warehouse.warehouse_name} 可用 ${warehouse.available_quantity}`}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cameraHint: {
    color: '#fff',
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  cameraPanel: {
    backgroundColor: '#101828',
    borderRadius: 12,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  cameraPreview: {
    height: 220,
  },
  container: {
    flex: 1,
    gap: 12,
    padding: 24,
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
  productCard: {
    backgroundColor: '#f5f7fa',
    borderRadius: 12,
    gap: 4,
    padding: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
});
