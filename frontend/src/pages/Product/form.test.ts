import { Upload } from 'antd';
import type { UploadFile } from 'antd';
import { describe, expect, it } from 'vitest';

import {
  extractUploadedImageUrls,
  findProductImagePreviewIndex,
  getProductListImageUrl,
  getProductImagePreviewUrl,
  MAX_PRODUCT_IMAGES,
  normalizeCostPrice,
  normalizePriceChange,
  normalizeProductCreatePrices,
  normalizeSalePrice,
  validateProductImage,
} from './form';

function imageFile(
  status: UploadFile<{ url?: string }>['status'],
  response?: { url?: string },
): UploadFile<{ url?: string }> {
  return { uid: `${status}-${response?.url ?? 'none'}`, name: 'image.png', status, response };
}

describe('product form helpers', () => {
  it('extracts only URLs from completed uploads', () => {
    expect(
      extractUploadedImageUrls([
        imageFile('done', { url: 'https://example.com/a.png' }),
        imageFile('uploading'),
        imageFile('error', { url: 'https://example.com/b.png' }),
        imageFile('done', {}),
        imageFile('removed', { url: 'https://example.com/c.png' }),
      ]),
    ).toEqual(['https://example.com/a.png']);
  });

  it('allows image files up to 10MB', () => {
    expect(
      validateProductImage({ type: 'image/png', size: 10 * 1024 * 1024 } as File),
    ).toBe(true);
  });

  it('rejects non-image and oversized files', () => {
    expect(validateProductImage({ type: 'application/pdf', size: 1024 } as File)).toBe(
      Upload.LIST_IGNORE,
    );
    expect(
      validateProductImage({ type: 'image/png', size: 10 * 1024 * 1024 + 1 } as File),
    ).toBe(Upload.LIST_IGNORE);
  });

  it('limits product images to nine files', () => {
    expect(MAX_PRODUCT_IMAGES).toBe(9);
  });

  it('uses completed upload URLs for previews', () => {
    expect(getProductImagePreviewUrl(imageFile('done', { url: 'https://example.com/a.png' }))).toBe(
      'https://example.com/a.png',
    );
    const existingImage = imageFile('done');
    existingImage.url = 'https://example.com/existing.png';
    expect(getProductImagePreviewUrl(existingImage)).toBe('https://example.com/existing.png');
    expect(getProductImagePreviewUrl(imageFile('uploading', { url: 'https://example.com/a.png' }))).toBeUndefined();
  });

  it('finds the clicked image in the preview list', () => {
    const files = [
      imageFile('done', { url: 'https://example.com/a.png' }),
      imageFile('done', { url: 'https://example.com/b.png' }),
    ];

    expect(findProductImagePreviewIndex(files, files[1])).toBe(1);
  });

  it('uses only the first product image for list thumbnails', () => {
    expect(
      getProductListImageUrl([
        'https://example.com/first.png',
        'https://example.com/second.png',
      ]),
    ).toBe('https://example.com/first.png');
    expect(getProductListImageUrl()).toBeUndefined();
  });

  it('rejects zero sale prices while allowing zero cost prices', () => {
    expect(() => normalizeSalePrice(0)).toThrow('售价必须大于0');
    expect(normalizeCostPrice(0)).toBe(0);
  });

  it('rejects zero sale prices before product creation requests', () => {
    expect(() => normalizeProductCreatePrices({ standard_price: 0, cost_price: 0 })).toThrow(
      '售价必须大于0',
    );
  });

  it('rejects zero standard-price adjustments while allowing zero cost-price adjustments', () => {
    expect(() => normalizePriceChange('standard_price', 0)).toThrow('售价必须大于0');
    expect(normalizePriceChange('cost_price', 0)).toBe(0);
  });
});
