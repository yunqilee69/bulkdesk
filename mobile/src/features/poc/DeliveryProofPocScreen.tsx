import React, { useState } from 'react';
import { Button, Text, View } from 'react-native';
import type { CapturedImage, SignatureImage } from '../../platform/contracts';
import { createFixtureMediaCapture } from '../../platform/media/createMediaCapture';
import { completeScanResult } from '../../platform/scanner/scanResult';
import { validateQrPayload } from '../../platform/scanner/validateQrPayload';
import { exportSignature } from '../../platform/signature/createSignatureExporter';
import { addStroke, createEmptySignature, sampleStroke } from '../../platform/signature/signatureModel';
import { pocStyles } from './pocStyles';
import { scanFixtures } from './scanFixtures';

export function DeliveryProofPocScreen() {
  const [photo, setPhoto] = useState<CapturedImage | null>(null);
  const [signature, setSignature] = useState<SignatureImage | null>(null);
  const [status, setStatus] = useState('真机扫码、拍照与手写签名请先在前三个页面完成验证；这里保留 contracts 的组合演示。');

  function scanQr() {
    const scan = completeScanResult({
      value: scanFixtures.validTemporaryOrderQr,
      format: 'qr',
      kind: 'qr',
    });
    const payload = validateQrPayload(scan.value);
    setStatus(`QR 已解析：${JSON.stringify(payload)}`);
  }

  async function capturePhoto() {
    const captured = await createFixtureMediaCapture().capturePhoto();
    setPhoto(captured);
    setStatus('组合流照片 payload 已准备。');
  }

  async function captureSignature() {
    const signed = addStroke(createEmptySignature(), sampleStroke);
    setSignature(await exportSignature(signed));
    setStatus('组合流签名 PNG payload 已准备。');
  }

  function reset() {
    setPhoto(null);
    setSignature(null);
    setStatus('已重置 delivery proof POC。');
  }

  return (
    <View style={pocStyles.card}>
      <Text style={pocStyles.badge}>Integrated POC</Text>
      <Text style={pocStyles.sectionTitle}>配送凭证组合流</Text>
      <Text style={pocStyles.body}>{status}</Text>
      <Text style={pocStyles.mono}>photo={photo?.filename ?? 'pending'}</Text>
      <Text style={pocStyles.mono}>signature={signature?.filename ?? 'pending'}</Text>
      <View style={pocStyles.buttonRow}>
        <Button title="解析测试 QR" onPress={scanQr} />
        <Button title="准备照片" onPress={capturePhoto} />
        <Button title="准备签名" onPress={captureSignature} />
        <Button title="重置" onPress={reset} />
      </View>
    </View>
  );
}
