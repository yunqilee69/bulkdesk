import { useMutation } from '@tanstack/react-query';
import React, { useRef, useState } from 'react';
import { Button, type GestureResponderEvent, StyleSheet, Text, TextInput, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { ApiClient } from '../../api/client';
import { signDeliveryTask } from '../../api/delivery';
import { uploadProof } from '../../api/upload';
import { useApiClient } from '../../app/apiClientContext';
import type { MediaCapture, SignatureImage, UploadResult } from '../../platform/contracts';
import { createFixtureMediaCapture } from '../../platform/media/createMediaCapture';
import { prepareUploadImage } from '../../platform/media/prepareUploadImage';
import { createSignatureImageFromUri } from '../../platform/signature/createSignatureExporter';
import { addStroke, appendPointToSignature, createEmptySignature, createSignatureStroke, type SignaturePoint, type SignatureState } from '../../platform/signature/signatureModel';
import { canSubmitDeliverySign, createDeliverySignState, toDeliverySignInput } from './deliverySignModel';

type UploadProofFn = typeof uploadProof;
type SignatureExporterFn = (signature: SignatureState, signaturePadRef: React.RefObject<View | null>) => Promise<SignatureImage>;

async function createDefaultSignature(signature: SignatureState, signaturePadRef: React.RefObject<View | null>): Promise<SignatureImage> {
  if (!signaturePadRef.current) {
    throw new Error('签名区域尚未就绪');
  }
  const uri = await captureRef(signaturePadRef, { format: 'png', quality: 1, result: 'tmpfile' });
  return createSignatureImageFromUri(signature, uri, { size: 1024 });
}

export function DeliverySignScreen({
  apiClient,
  deliveryId,
  mediaCapture = createFixtureMediaCapture(),
  onSigned,
  signatureExporter = createDefaultSignature,
  uploadProofFn = uploadProof,
}: {
  apiClient?: ApiClient;
  deliveryId?: string;
  mediaCapture?: MediaCapture;
  onSigned?: () => void;
  signatureExporter?: SignatureExporterFn;
  uploadProofFn?: UploadProofFn;
}) {
  const client = useApiClient(apiClient);
  const signaturePadRef = useRef<View>(null);
  const activeStrokeIdRef = useRef<string | null>(null);
  const strokeSequenceRef = useRef(0);
  const [state, setState] = useState(createDeliverySignState);
  const [signature, setSignature] = useState(() => createEmptySignature());
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const signMutation = useMutation({
    mutationFn: () => {
      if (!client || !deliveryId) {
        throw new Error('配送任务未选择');
      }
      return signDeliveryTask(client, deliveryId, toDeliverySignInput(state));
    },
    onError: error => setMessage(error instanceof Error ? error.message : '签收失败'),
    onSuccess: () => {
      setMessage('签收已完成');
      onSigned?.();
    },
  });
  const canSubmit = Boolean(deliveryId && canSubmitDeliverySign(state));

  function pointFromEvent(event: GestureResponderEvent): SignaturePoint {
    return {
      x: event.nativeEvent.locationX,
      y: event.nativeEvent.locationY,
      timestamp: Date.now(),
    };
  }

  function beginSignatureStroke(event: GestureResponderEvent) {
    const strokeId = `delivery-signature-${Date.now()}-${strokeSequenceRef.current++}`;
    activeStrokeIdRef.current = strokeId;
    setState(current => ({ ...current, signatureImageUrl: null }));
    setSignature(current => addStroke(current, createSignatureStroke(strokeId, pointFromEvent(event))));
    setMessage('正在手写签名');
  }

  function moveSignatureStroke(event: GestureResponderEvent) {
    const strokeId = activeStrokeIdRef.current;
    if (!strokeId) {
      return;
    }
    setSignature(current => appendPointToSignature(current, strokeId, pointFromEvent(event)));
  }

  function endSignatureStroke() {
    activeStrokeIdRef.current = null;
    setMessage('签名已记录，请上传签名');
  }

  async function uploadImage(image: Parameters<UploadProofFn>[1], prefix: Parameters<UploadProofFn>[2]): Promise<UploadResult> {
    if (!client) {
      throw new Error('API 客户端未连接');
    }
    return uploadProofFn(client, await prepareUploadImage(image), prefix);
  }

  async function captureProofPhoto() {
    setUploading(true);
    setMessage(null);
    try {
      const photo = await mediaCapture.capturePhoto();
      const result = await uploadImage(photo, 'delivery-proofs');
      setState(current => ({ ...current, proofImageUrls: [...current.proofImageUrls, result.url] }));
      setMessage('现场照片已上传');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '现场照片上传失败');
    } finally {
      setUploading(false);
    }
  }

  function startSignature() {
    setMessage('请在签名区域连续手写签名');
  }

  async function uploadSignature() {
    setUploading(true);
    setMessage(null);
    try {
      const signatureImage = await signatureExporter(signature, signaturePadRef);
      const result = await uploadImage(signatureImage, 'delivery-signatures');
      setState(current => ({ ...current, signatureImageUrl: result.url }));
      setMessage('签名已上传');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '签名上传失败');
    } finally {
      setUploading(false);
    }
  }

  function toggleCollectPayment() {
    setState(current => ({
      ...current,
      collectPayment: !current.collectPayment,
      paidAmount: current.collectPayment ? undefined : current.paidAmount,
      paymentProofImageUrls: current.collectPayment ? [] : current.paymentProofImageUrls,
    }));
  }

  async function capturePaymentProof() {
    setUploading(true);
    setMessage(null);
    try {
      const photo = await mediaCapture.capturePhoto();
      const result = await uploadImage(photo, 'payment-proofs');
      setState(current => ({ ...current, paymentProofImageUrls: [...current.paymentProofImageUrls, result.url] }));
      setMessage('付款凭证已上传');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '付款凭证上传失败');
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>签收闭环</Text>
      <TextInput
        accessibilityLabel="签收人"
        onChangeText={signerName => setState(current => ({ ...current, signerName }))}
        placeholder="签收人"
        style={styles.input}
        value={state.signerName}
      />
      <Text>{`现场照片：${state.proofImageUrls.length}`}</Text>
      <Button title="拍摄现场照片" disabled={!client || uploading} onPress={() => { captureProofPhoto().catch(() => undefined); }} />
      <Text>{`签名：${state.signatureImageUrl ? '已上传' : signature.strokes.length ? '待上传' : '未开始'}`}</Text>
      <View
        ref={signaturePadRef}
        collapsable={false}
        testID="DeliverySignaturePad"
        style={styles.signaturePad}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={beginSignatureStroke}
        onResponderMove={moveSignatureStroke}
        onResponderRelease={endSignatureStroke}
        onResponderTerminate={endSignatureStroke}
        onStartShouldSetResponder={() => true}
      >
        {signature.strokes.length ? null : <Text style={styles.signaturePlaceholder}>在这里手写签名</Text>}
        {signature.strokes.flatMap(stroke =>
          stroke.points.map((point, index) => (
            <View
              key={`${stroke.id}-${index}`}
              pointerEvents="none"
              style={[styles.signatureDot, { left: point.x - 2, top: point.y - 2 }]}
            />
          )),
        )}
      </View>
      <Button title="开始手写签名" disabled={uploading} onPress={startSignature} />
      <Button title="上传签名" disabled={!signature.strokes.length || !client || uploading} onPress={() => { uploadSignature().catch(() => undefined); }} />
      <Button title={state.collectPayment ? '取消收款' : '开启收款'} disabled={uploading} onPress={toggleCollectPayment} />
      {state.collectPayment ? (
        <>
          <TextInput
            accessibilityLabel="实收金额"
            keyboardType="decimal-pad"
            onChangeText={value => setState(current => ({ ...current, paidAmount: Number(value) || undefined }))}
            placeholder="实收金额"
            style={styles.input}
            value={state.paidAmount?.toString() ?? ''}
          />
          <Text>{`付款凭证：${state.paymentProofImageUrls.length}`}</Text>
          <Button title="拍摄付款凭证" disabled={!client || uploading} onPress={() => { capturePaymentProof().catch(() => undefined); }} />
        </>
      ) : null}
      {message ? <Text style={message === '签收已完成' ? styles.successText : styles.errorText}>{message}</Text> : null}
      <Button title="确认签收" disabled={!canSubmit || uploading || signMutation.isPending} onPress={() => signMutation.mutate()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12, padding: 24 },
  errorText: { color: '#c00000' },
  input: { borderColor: '#d9d9d9', borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  signatureDot: { backgroundColor: '#111827', borderRadius: 2, height: 4, position: 'absolute', width: 4 },
  signaturePad: { borderColor: '#98a2b3', borderRadius: 12, borderWidth: 1, height: 140, overflow: 'hidden' },
  signaturePlaceholder: { color: '#98a2b3', padding: 12 },
  successText: { color: '#027a48' },
  title: { fontSize: 22, fontWeight: '700' },
});
