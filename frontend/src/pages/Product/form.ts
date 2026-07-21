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

export function getProductImagePreviewUrl(file: UploadFile<UploadedImageResponse>) {
  if (file.status !== 'done') return undefined;
  return file.response?.url ?? file.url;
}

export function getProductListImageUrl(imageUrls?: string[]) {
  return imageUrls?.[0];
}

export function normalizeSalePrice(value: number): number {
  if (value <= 0) throw new Error('售价必须大于0');
  return value;
}

export function normalizeCostPrice(value: number): number {
  if (value < 0) throw new Error('成本价不能小于0');
  return value;
}

export function normalizeProductCreatePrices<T extends { standard_price: number; cost_price: number }>(
  values: T,
): T {
  return {
    ...values,
    standard_price: normalizeSalePrice(values.standard_price),
    cost_price: normalizeCostPrice(values.cost_price),
  };
}

export function normalizePriceChange(
  kind: 'standard_price' | 'cost_price',
  value: number,
): number {
  return kind === 'standard_price' ? normalizeSalePrice(value) : normalizeCostPrice(value);
}

export function findProductImagePreviewIndex(
  fileList: UploadFile<UploadedImageResponse>[],
  file: UploadFile<UploadedImageResponse>,
) {
  const previewUrl = getProductImagePreviewUrl(file);
  if (!previewUrl) return -1;
  return fileList
    .map(getProductImagePreviewUrl)
    .filter((url): url is string => Boolean(url))
    .indexOf(previewUrl);
}
