import { Upload } from 'antd';
import type { UploadFile } from 'antd';

export const MAX_PRODUCT_IMAGES = 9;
const MAX_PRODUCT_IMAGE_SIZE = 10 * 1024 * 1024;

type UploadedImageResponse = {
  url?: string;
};

export function validateProductImage(file: File) {
  return file.type.startsWith('image/') && file.size <= MAX_PRODUCT_IMAGE_SIZE
    ? true
    : Upload.LIST_IGNORE;
}

export function extractUploadedImageUrls(fileList: UploadFile<UploadedImageResponse>[]) {
  return fileList.flatMap((file) =>
    file.status === 'done' && file.response?.url ? [file.response.url] : [],
  );
}
