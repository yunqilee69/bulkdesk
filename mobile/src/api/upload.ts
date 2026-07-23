import { PlatformCapabilityError, type UploadResult, type UploadableImage } from '../platform/contracts';
import { validateUploadImage } from '../platform/media/validateImage';
import type { ApiClient } from './client';

type UploadResponse = {
  key: string;
  url: string;
  filename: string;
  content_type?: string;
  contentType?: string;
  size: number;
};

function createMultipartBody(image: UploadableImage): FormData {
  const form = new FormData();
  form.append('file', {
    uri: image.uri,
    name: image.filename,
    type: image.contentType,
  } as unknown as Blob);
  return form;
}

export async function uploadProof(
  client: ApiClient,
  image: UploadableImage,
  prefix: 'mobile-poc/photos' | 'mobile-poc/signatures' | 'delivery-proofs' | 'delivery-signatures' | 'payment-proofs',
): Promise<UploadResult> {
  const validation = validateUploadImage(image);
  if (!validation.ok) {
    throw new PlatformCapabilityError({
      capability: 'upload',
      code: validation.reason,
      message: `文件不满足上传要求：${validation.reason}`,
    });
  }

  const response = await client.request<UploadResponse>(
    `/api/v1/upload?prefix=${encodeURIComponent(prefix)}`,
    {
      method: 'POST',
      body: createMultipartBody(image),
    },
  );

  return {
    key: response.key,
    url: response.url,
    filename: response.filename,
    contentType: response.content_type ?? response.contentType ?? image.contentType,
    size: response.size,
  };
}
