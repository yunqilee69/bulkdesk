import type { UploadableImage } from '../contracts';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const SUPPORTED_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type ImageValidationResult =
  | { ok: true }
  | { ok: false; reason: 'missing-uri' | 'missing-filename' | 'unsupported-content-type' | 'file-too-large' | 'empty-file' };

export function validateUploadImage(image: UploadableImage): ImageValidationResult {
  if (!image.uri) {
    return { ok: false, reason: 'missing-uri' };
  }

  if (!image.filename) {
    return { ok: false, reason: 'missing-filename' };
  }

  if (image.size <= 0) {
    return { ok: false, reason: 'empty-file' };
  }

  if (!SUPPORTED_IMAGE_CONTENT_TYPES.includes(image.contentType as (typeof SUPPORTED_IMAGE_CONTENT_TYPES)[number])) {
    return { ok: false, reason: 'unsupported-content-type' };
  }

  if (image.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'file-too-large' };
  }

  return { ok: true };
}
