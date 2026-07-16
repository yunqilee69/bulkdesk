import { Upload } from 'antd';
import type { UploadFile } from 'antd';
import { describe, expect, it } from 'vitest';

import { extractUploadedImageUrls, MAX_PRODUCT_IMAGES, validateProductImage } from './form';

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
});
