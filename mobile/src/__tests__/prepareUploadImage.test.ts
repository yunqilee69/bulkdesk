import { MAX_UPLOAD_BYTES } from '../platform/media/validateImage';
import { prepareUploadImage } from '../platform/media/prepareUploadImage';

describe('prepareUploadImage', () => {
  it('returns already valid images without resizing', async () => {
    const image = { uri: 'file:///tmp/photo.jpg', filename: 'photo.jpg', contentType: 'image/jpeg', size: 1024 };
    const resizeImage = jest.fn();

    await expect(prepareUploadImage(image, { resizeImage })).resolves.toBe(image);
    expect(resizeImage).not.toHaveBeenCalled();
  });

  it('compresses oversized images and validates the compressed result', async () => {
    const resizeImage = jest.fn().mockResolvedValue({
      uri: 'file:///tmp/photo-small.jpg',
      name: 'photo-small.jpg',
      size: 512 * 1024,
      width: 1280,
      height: 960,
    });

    await expect(
      prepareUploadImage(
        { uri: 'file:///tmp/photo.jpg', filename: 'photo.jpg', contentType: 'image/jpeg', size: MAX_UPLOAD_BYTES + 1 },
        { resizeImage },
      ),
    ).resolves.toEqual({
      uri: 'file:///tmp/photo-small.jpg',
      filename: 'photo-small.jpg',
      contentType: 'image/jpeg',
      size: 512 * 1024,
    });
    expect(resizeImage).toHaveBeenCalledWith('file:///tmp/photo.jpg', 1600, 1600, 'JPEG', 85);
  });

  it('rejects when compression still leaves the image too large', async () => {
    const resizeImage = jest.fn().mockResolvedValue({
      uri: 'file:///tmp/photo-large.jpg',
      name: 'photo-large.jpg',
      size: MAX_UPLOAD_BYTES + 1,
      width: 2000,
      height: 1500,
    });

    await expect(
      prepareUploadImage(
        { uri: 'file:///tmp/photo.jpg', filename: 'photo.jpg', contentType: 'image/jpeg', size: MAX_UPLOAD_BYTES + 1 },
        { resizeImage },
      ),
    ).rejects.toThrow('图片压缩后仍不满足上传要求：file-too-large');
  });
});
