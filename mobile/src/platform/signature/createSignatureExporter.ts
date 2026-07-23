import type { SignatureImage } from '../contracts';
import { PlatformCapabilityError } from '../contracts';
import { canSubmitSignature, type SignatureState } from './signatureModel';

const ONE_BY_ONE_TRANSPARENT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function formatTimestampForFilename(date: Date): string {
  return date.toISOString().replace(/[-:.]/g, '');
}

function byteSizeFromBase64(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function ensureFileUri(uri: string): string {
  return uri.startsWith('file://') || uri.startsWith('data:') ? uri : `file://${uri}`;
}

export function createSignatureImageFromUri(
  signature: SignatureState,
  uri: string,
  options: { now?: () => Date; size?: number } = {},
): SignatureImage {
  if (!canSubmitSignature(signature)) {
    throw new PlatformCapabilityError({
      capability: 'signature',
      code: 'signature-empty',
      message: '请先完成签名后再上传。',
    });
  }

  const now = options.now?.() ?? new Date();

  return {
    uri: ensureFileUri(uri),
    filename: `signature-${formatTimestampForFilename(now)}.png`,
    contentType: 'image/png',
    size: options.size ?? 0,
    strokeCount: signature.strokes.length,
  };
}

export async function exportSignature(
  signature: SignatureState,
  options: { now?: () => Date } = {},
): Promise<SignatureImage> {
  if (!canSubmitSignature(signature)) {
    throw new PlatformCapabilityError({
      capability: 'signature',
      code: 'signature-empty',
      message: '请先完成签名后再上传。',
    });
  }

  const now = options.now?.() ?? new Date();

  return createSignatureImageFromUri(signature, `data:image/png;base64,${ONE_BY_ONE_TRANSPARENT_PNG_BASE64}`, {
    now: () => now,
    size: byteSizeFromBase64(ONE_BY_ONE_TRANSPARENT_PNG_BASE64),
  });
}
