import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner, type Code } from 'react-native-vision-camera';
import { createPendingScanFromVisionCode } from '../../platform/camera/visionCameraAdapter';
import type { PendingScanResult, ScanResult } from '../../platform/contracts';
import { completeScanResult, createScanDeduplicator } from '../../platform/scanner/scanResult';
import { validateQrPayload } from '../../platform/scanner/validateQrPayload';
import { pocStyles } from './pocStyles';

function describeScan(scan: ScanResult | null) {
  if (!scan) {
    return '等待真实相机扫码。支持 QR、EAN-13、Code 128、Code 39。';
  }

  if (scan.kind === 'qr') {
    return JSON.stringify(
      {
        format: 'qr',
        value: scan.value,
        bulkdeskPayload: validateQrPayload(scan.value),
      },
      null,
      2,
    );
  }

  return `${scan.format} / ${scan.value} / ${scan.scannedAt}`;
}

export function ScannerPocScreen() {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const deduplicator = useMemo(() => createScanDeduplicator({ windowMs: 1500 }), []);
  const [cameraActive, setCameraActive] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [status, setStatus] = useState('点击“开启相机扫码”调用真机摄像头。');
  const lastAcceptedAtRef = useRef(0);

  const acceptCameraScan = useCallback(
    (scan: PendingScanResult) => {
      const scannedAt = Date.now();
      const accepted = deduplicator.shouldAcceptScan(scan, scannedAt);

      if (!accepted) {
        setStatus('重复扫码已抑制（1,500 ms 窗口）。');
        return;
      }

      lastAcceptedAtRef.current = scannedAt;
      setStatus('已从真实相机接受扫码结果。');
      setResult(completeScanResult(scan, new Date(scannedAt)));
    },
    [deduplicator],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr', 'ean-13', 'code-128', 'code-39'],
    onCodeScanned: (codes: Code[]) => {
      const pendingScan = codes.map(createPendingScanFromVisionCode).find((scan): scan is PendingScanResult => scan !== null);

      if (pendingScan) {
        acceptCameraScan(pendingScan);
      }
    },
  });

  async function enableCameraScan() {
    if (!device) {
      setStatus('未发现后置摄像头，无法进行扫码。');
      return;
    }

    const granted = hasPermission || (await requestPermission());

    if (!granted) {
      setStatus('相机权限未授权，请在系统设置中允许相机访问。');
      return;
    }

    setCameraActive(true);
    setStatus('相机扫码中，请将二维码/条码放入取景框。');
  }

  function reset() {
    deduplicator.reset();
    lastAcceptedAtRef.current = 0;
    setResult(null);
    setStatus(cameraActive ? '已重置，可继续真实扫码。' : '已重置，点击开启相机扫码。');
  }

  return (
    <View style={pocStyles.card}>
      <Text style={pocStyles.badge}>Scanner POC</Text>
      <Text style={pocStyles.sectionTitle}>扫码 / 二维码验证</Text>
      <Text style={pocStyles.body}>状态：{status}</Text>
      <Text style={pocStyles.body}>任意二维码都会显示原始内容；BulkDesk 临时订单二维码会额外完成业务 payload 校验。</Text>
      {cameraActive && hasPermission && device ? (
        <View style={pocStyles.cameraPreview}>
          <Camera device={device} isActive={cameraActive} codeScanner={codeScanner} resizeMode="cover" style={pocStyles.cameraPreview} />
        </View>
      ) : (
        <Text style={pocStyles.body}>相机尚未开启；本页将调用真机摄像头而不是 fixture。</Text>
      )}
      <Text style={pocStyles.mono}>{describeScan(result)}</Text>
      <View style={pocStyles.buttonRow}>
        <Button title={cameraActive ? '扫码中' : '开启相机扫码'} onPress={enableCameraScan} disabled={cameraActive} />
        <Button title="暂停相机" onPress={() => setCameraActive(false)} disabled={!cameraActive} />
        <Button title="重置扫码状态" onPress={reset} />
      </View>
    </View>
  );
}
