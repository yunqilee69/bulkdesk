import React, { useMemo, useRef, useState } from 'react';
import { Button, PanResponder, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { SignatureImage } from '../../platform/contracts';
import { createSignatureImageFromUri } from '../../platform/signature/createSignatureExporter';
import {
  addStroke,
  appendPointToSignature,
  canSubmitSignature,
  clearSignature,
  createEmptySignature,
  createSignatureStroke,
  resizeSignatureCanvas,
  undoStroke,
  type SignaturePoint,
  type SignatureState,
  type SignatureStroke,
} from '../../platform/signature/signatureModel';
import { pocStyles } from './pocStyles';

function SignatureStrokeView({ stroke }: { stroke: SignatureStroke }) {
  if (stroke.points.length === 1) {
    const [point] = stroke.points;
    return <View style={[pocStyles.signatureStrokeDot, { left: point.x - 3, top: point.y - 3 }]} />;
  }

  return (
    <>
      {stroke.points.slice(1).map((point, index) => {
        const previous = stroke.points[index];
        const length = Math.hypot(point.x - previous.x, point.y - previous.y);
        const angle = Math.atan2(point.y - previous.y, point.x - previous.x);

        return (
          <View
            key={`${stroke.id}-${index}`}
            style={[
              pocStyles.signatureStroke,
              {
                left: (point.x + previous.x) / 2 - length / 2,
                top: (point.y + previous.y) / 2 - 2,
                transform: [{ rotateZ: `${angle}rad` }],
                width: length,
              },
            ]}
          />
        );
      })}
    </>
  );
}

export function SignaturePocScreen() {
  const signaturePadRef = useRef<View>(null);
  const activeStrokeIdRef = useRef<string | null>(null);
  const strokeSequenceRef = useRef(0);
  const canvasSizeRef = useRef({ width: 320, height: 160 });
  const [signature, setSignature] = useState<SignatureState>(() => createEmptySignature());
  const [exported, setExported] = useState<SignatureImage | null>(null);
  const [status, setStatus] = useState('在签名区域按住并拖动，可连续手写签名。');

  function pointFromEvent(event: GestureResponderEvent): SignaturePoint {
    const { locationX, locationY } = event.nativeEvent;
    const { width, height } = canvasSizeRef.current;

    return {
      x: Math.max(0, Math.min(width, locationX)),
      y: Math.max(0, Math.min(height, locationY)),
      timestamp: Date.now(),
    };
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: event => {
          const strokeId = `stroke-${Date.now()}-${strokeSequenceRef.current++}`;
          activeStrokeIdRef.current = strokeId;
          setExported(null);
          setSignature(current => addStroke(current, createSignatureStroke(strokeId, pointFromEvent(event))));
          setStatus('正在手写签名……');
        },
        onPanResponderMove: event => {
          const strokeId = activeStrokeIdRef.current;

          if (!strokeId) {
            return;
          }

          setSignature(current => appendPointToSignature(current, strokeId, pointFromEvent(event)));
        },
        onPanResponderRelease: () => {
          activeStrokeIdRef.current = null;
          setStatus('已记录手写签名，可继续书写或导出 PNG。');
        },
        onPanResponderTerminate: () => {
          activeStrokeIdRef.current = null;
          setStatus('签名手势已中断，可继续书写。');
        },
      }),
    [],
  );

  function handlePadLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    canvasSizeRef.current = { width, height };
    setSignature(current => resizeSignatureCanvas(current, width, height));
  }

  function clearPad() {
    activeStrokeIdRef.current = null;
    setSignature(current => clearSignature(current));
    setExported(null);
    setStatus('已清空签名，可重新手写。');
  }

  function undoLastStroke() {
    activeStrokeIdRef.current = null;
    setSignature(current => undoStroke(current));
    setExported(null);
    setStatus('已撤销最后一笔。');
  }

  async function exportPng() {
    try {
      if (!signaturePadRef.current) {
        setStatus('签名区域尚未就绪。');
        return;
      }

      const uri = await captureRef(signaturePadRef, { format: 'png', quality: 1, result: 'tmpfile' });
      const image = createSignatureImageFromUri(signature, uri);
      setExported(image);
      setStatus('签名已按当前手写内容导出为 PNG 上传 payload。');
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  return (
    <View style={pocStyles.card}>
      <Text style={pocStyles.badge}>Signature POC</Text>
      <Text style={pocStyles.sectionTitle}>手写签名 / PNG 导出</Text>
      <Text style={pocStyles.body}>状态：{status}</Text>
      <View
        ref={signaturePadRef}
        collapsable={false}
        style={pocStyles.signaturePad}
        onLayout={handlePadLayout}
        {...panResponder.panHandlers}
      >
        {!canSubmitSignature(signature) ? (
          <View pointerEvents="none" style={pocStyles.signaturePlaceholder}>
            <Text style={pocStyles.body}>在这里直接手写签名</Text>
            <Text style={pocStyles.body}>空白不可上传</Text>
          </View>
        ) : null}
        {signature.strokes.map(stroke => (
          <SignatureStrokeView key={stroke.id} stroke={stroke} />
        ))}
      </View>
      <Text style={pocStyles.body}>签名区域：{signature.strokes.length} 笔</Text>
      <Text style={pocStyles.mono}>{exported ? JSON.stringify(exported, null, 2) : '尚未导出 PNG'}</Text>
      <View style={pocStyles.buttonRow}>
        <Button title="撤销" onPress={undoLastStroke} disabled={!canSubmitSignature(signature)} />
        <Button title="清空" onPress={clearPad} disabled={!canSubmitSignature(signature)} />
        <Button title="导出 PNG" onPress={exportPng} disabled={!canSubmitSignature(signature)} />
      </View>
    </View>
  );
}
