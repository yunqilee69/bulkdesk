import type { CapturedImage, PendingScanResult, ScanFormat, ScanKind } from '../contracts';

type VisionCodeLike = {
  type?: string;
  value?: string | null;
};

type VisionPhotoLike = {
  path: string;
  width?: number;
  height?: number;
};

const supportedFormats = new Set<ScanFormat>(['qr', 'ean-13', 'code-128', 'code-39']);

function normalizeScanFormat(type?: string): ScanFormat {
  if (type && supportedFormats.has(type as ScanFormat)) {
    return type as ScanFormat;
  }

  return 'unknown';
}

function scanKindForFormat(format: ScanFormat): ScanKind {
  return format === 'qr' ? 'qr' : 'barcode';
}

function ensureFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

function filenameFromPath(path: string): string {
  const cleanPath = path.split('?')[0];
  const lastSegment = cleanPath.split('/').filter(Boolean).pop();
  return lastSegment || `bulkdesk-photo-${Date.now()}.jpg`;
}

export function createPendingScanFromVisionCode(code: VisionCodeLike): PendingScanResult | null {
  const value = code.value?.trim();

  if (!value) {
    return null;
  }

  const format = normalizeScanFormat(code.type);

  return {
    value,
    format,
    kind: scanKindForFormat(format),
  };
}

export function createCapturedImageFromVisionPhoto(photo: VisionPhotoLike): CapturedImage {
  return {
    uri: ensureFileUri(photo.path),
    filename: filenameFromPath(photo.path),
    contentType: 'image/jpeg',
    size: 0,
    width: photo.width,
    height: photo.height,
    source: 'camera',
  };
}
