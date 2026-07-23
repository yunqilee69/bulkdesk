export type ScanFormat = 'qr' | 'ean-13' | 'code-128' | 'code-39' | 'unknown';

export type ScanKind = 'barcode' | 'qr';

export interface ScanResult {
  value: string;
  format: ScanFormat;
  kind: ScanKind;
  scannedAt: string;
}

export interface PendingScanResult {
  value: string;
  format: ScanFormat;
  kind: ScanKind;
}

export interface UploadableImage {
  uri: string;
  filename: string;
  contentType: string;
  size: number;
}

export type CapturedImage = UploadableImage & {
  width?: number;
  height?: number;
  source: 'camera' | 'gallery' | 'fixture';
};

export type SignatureImage = UploadableImage & {
  strokeCount: number;
};

export interface UploadResult {
  key: string;
  url: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface Scanner {
  scanOnce(): Promise<ScanResult>;
}

export interface MediaCapture {
  capturePhoto(): Promise<CapturedImage>;
  removeLocalFile(uri: string): Promise<void>;
}

export interface SecureStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type CapabilityName = 'scanner' | 'media' | 'signature' | 'upload' | 'session' | 'api';

export class PlatformCapabilityError extends Error {
  readonly capability: CapabilityName;
  readonly code: string;
  readonly recoverable: boolean;

  constructor(params: {
    capability: CapabilityName;
    code: string;
    message: string;
    recoverable?: boolean;
  }) {
    super(params.message);
    this.name = 'PlatformCapabilityError';
    this.capability = params.capability;
    this.code = params.code;
    this.recoverable = params.recoverable ?? true;
  }
}

export interface RedactedDiagnostic {
  platform: string;
  capability: CapabilityName;
  errorClass: string;
  elapsedMs: number;
  recoverable: boolean;
}
