import type { UploadableImage } from '../contracts';
import ImageResizer, { type ResizeFormat } from 'react-native-image-resizer';

import { validateUploadImage } from './validateImage';

type ResizeResponse = {
  uri: string;
  name: string;
  size: number;
};

export type ResizeImageFn = (
  uri: string,
  width: number,
  height: number,
  format: ResizeFormat,
  quality: number,
) => Promise<ResizeResponse>;

export type PrepareUploadImageOptions = {
  resizeImage?: ResizeImageFn;
};

function resizeFormatFor(contentType: string): ResizeFormat {
  switch (contentType) {
    case 'image/png':
      return 'PNG';
    case 'image/webp':
      return 'WEBP';
    default:
      return 'JPEG';
  }
}

const defaultResizeImage: ResizeImageFn = (uri, width, height, format, quality) =>
  ImageResizer.createResizedImage(uri, width, height, format, quality);

export async function prepareUploadImage(
  image: UploadableImage,
  options: PrepareUploadImageOptions = {},
): Promise<UploadableImage> {
  const validation = validateUploadImage(image);
  if (validation.ok) {
    return image;
  }
  if (validation.reason !== 'file-too-large') {
    throw new Error(`图片不满足上传要求：${validation.reason}`);
  }

  let resized: ResizeResponse;
  try {
    resized = await (options.resizeImage ?? defaultResizeImage)(image.uri, 1600, 1600, resizeFormatFor(image.contentType), 85);
  } catch (error) {
    throw new Error(`图片压缩失败：${error instanceof Error ? error.message : '未知错误'}`);
  }

  const prepared = {
    uri: resized.uri,
    filename: resized.name,
    contentType: image.contentType,
    size: resized.size,
  } satisfies UploadableImage;
  const compressedValidation = validateUploadImage(prepared);
  if (!compressedValidation.ok) {
    throw new Error(`图片压缩后仍不满足上传要求：${compressedValidation.reason}`);
  }
  return prepared;
}
