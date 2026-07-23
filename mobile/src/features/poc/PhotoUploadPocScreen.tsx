import React, { useRef, useState } from 'react';
import { Button, Text, TextInput, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { createApiClient } from '../../api/client';
import { uploadProof } from '../../api/upload';
import { getApiBaseUrl } from '../../app/config';
import { createCapturedImageFromVisionPhoto } from '../../platform/camera/visionCameraAdapter';
import type { CapturedImage, UploadResult } from '../../platform/contracts';
import { validateUploadImage } from '../../platform/media/validateImage';
import { pocStyles } from './pocStyles';

export function PhotoUploadPocScreen() {
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraActive, setCameraActive] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(getApiBaseUrl());
  const [token, setToken] = useState('');
  const [photo, setPhoto] = useState<CapturedImage | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [status, setStatus] = useState('点击“打开相机”预览真机摄像头，然后拍照。');
  const [busy, setBusy] = useState(false);

  async function enableCamera() {
    if (!device) {
      setStatus('未发现后置摄像头，无法拍照。');
      return false;
    }

    const granted = hasPermission || (await requestPermission());

    if (!granted) {
      setStatus('相机权限未授权，请在系统设置中允许相机访问。');
      return false;
    }

    setCameraActive(true);
    setStatus('相机已打开，可点击“拍照”。');
    return true;
  }

  async function capturePhoto() {
    setBusy(true);
    setUploadResult(null);
    try {
      const ready = cameraActive || (await enableCamera());

      if (!ready || !cameraRef.current) {
        setStatus('相机尚未就绪，请稍后再试。');
        return;
      }

      const captured = createCapturedImageFromVisionPhoto(
        await cameraRef.current.takePhoto({ flash: 'off', enableShutterSound: true }),
      );
      const validation = validateUploadImage(captured);
      setPhoto(captured);
      setStatus(validation.ok ? '真实照片已通过上传前校验。' : `照片校验失败：${validation.reason}`);
    } catch (error) {
      setStatus(`拍照失败：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function discardPhoto() {
    setPhoto(null);
    setUploadResult(null);
    setStatus('已丢弃当前照片；相机临时文件会由系统清理。');
  }

  async function uploadPhoto() {
    if (!photo) {
      setStatus('请先拍照。');
      return;
    }
    if (!token.trim()) {
      setStatus('请输入 POC Bearer Token 后再测试真实上传。');
      return;
    }

    setBusy(true);
    try {
      const client = createApiClient({
        baseUrl: apiBaseUrl,
        getAccessToken: async () => token.trim(),
      });
      const result = await uploadProof(client, photo, 'mobile-poc/photos');
      setUploadResult(result);
      setStatus('照片上传成功，可按 key 清理 POC 对象。');
    } catch (error) {
      setStatus(`照片上传失败，可手动重试：${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={pocStyles.card}>
      <Text style={pocStyles.badge}>Photo Upload POC</Text>
      <Text style={pocStyles.sectionTitle}>拍照凭证 / 上传</Text>
      <Text style={pocStyles.body}>状态：{status}</Text>
      {cameraActive && hasPermission && device ? (
        <View style={pocStyles.cameraPreview}>
          <Camera ref={cameraRef} device={device} isActive={cameraActive} photo resizeMode="cover" style={pocStyles.cameraPreview} />
        </View>
      ) : (
        <Text style={pocStyles.body}>相机尚未开启；本页会生成真实相机 JPEG，而不是 fixture。</Text>
      )}
      <TextInput
        value={apiBaseUrl}
        onChangeText={setApiBaseUrl}
        autoCapitalize="none"
        style={pocStyles.input}
        placeholder="API Base URL"
      />
      <TextInput
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        secureTextEntry
        style={pocStyles.input}
        placeholder="Bearer token（不会写日志）"
      />
      <Text style={pocStyles.mono}>{photo ? JSON.stringify(photo, null, 2) : '尚未拍照'}</Text>
      <Text style={pocStyles.mono}>{uploadResult ? JSON.stringify(uploadResult, null, 2) : '尚未上传'}</Text>
      <View style={pocStyles.buttonRow}>
        <Button title={cameraActive ? '相机已打开' : '打开相机'} onPress={enableCamera} disabled={busy || cameraActive} />
        <Button title="拍照" onPress={capturePhoto} disabled={busy} />
        <Button title="上传照片" onPress={uploadPhoto} disabled={busy || !photo} />
        <Button title="丢弃照片" onPress={discardPhoto} disabled={busy || !photo} />
      </View>
    </View>
  );
}
