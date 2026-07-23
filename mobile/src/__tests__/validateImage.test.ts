import { validateUploadImage } from '../platform/media/validateImage';

describe('validateUploadImage', () => {
  it('accepts JPEG, PNG and WebP files up to 10 MB', () => {
    expect(
      validateUploadImage({
        uri: 'file:///tmp/photo.jpg',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        size: 10 * 1024 * 1024,
      }),
    ).toEqual({ ok: true });

    expect(
      validateUploadImage({
        uri: 'file:///tmp/signature.png',
        filename: 'signature.png',
        contentType: 'image/png',
        size: 42,
      }),
    ).toEqual({ ok: true });

    expect(
      validateUploadImage({
        uri: 'file:///tmp/photo.webp',
        filename: 'photo.webp',
        contentType: 'image/webp',
        size: 100,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects unsupported MIME types and oversized files', () => {
    expect(
      validateUploadImage({
        uri: 'file:///tmp/photo.gif',
        filename: 'photo.gif',
        contentType: 'image/gif',
        size: 100,
      }),
    ).toEqual({ ok: false, reason: 'unsupported-content-type' });

    expect(
      validateUploadImage({
        uri: 'file:///tmp/photo.jpg',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        size: 10 * 1024 * 1024 + 1,
      }),
    ).toEqual({ ok: false, reason: 'file-too-large' });
  });
});
