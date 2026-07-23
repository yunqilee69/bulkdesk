import { createApiClient } from '../api/client';
import { uploadProof } from '../api/upload';
import type { UploadableImage } from '../platform/contracts';

const photo: UploadableImage = {
  uri: 'file:///tmp/photo.jpg',
  filename: 'photo.jpg',
  contentType: 'image/jpeg',
  size: 1024,
};

describe('uploadProof', () => {
  it('uploads a camera JPEG to the photo POC prefix', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        message: 'ok',
        data: {
          key: 'mobile-poc/photos/photo.jpg',
          url: 'https://cdn.example.test/photo.jpg',
          filename: 'photo.jpg',
          content_type: 'image/jpeg',
          size: 1024,
        },
      }),
    });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'access-token',
      fetchImpl: fetchMock,
    });

    const result = await uploadProof(client, photo, 'mobile-poc/photos');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/upload?prefix=mobile-poc%2Fphotos'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ key: expect.any(String), url: expect.any(String), contentType: 'image/jpeg' }),
    );
  });

  it('uploads WebP delivery signatures to the delivery signatures prefix', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        message: 'ok',
        data: {
          key: 'delivery-signatures/signature.webp',
          url: 'https://cdn.example.test/signature.webp',
          filename: 'signature.webp',
          content_type: 'image/webp',
          size: 1024,
        },
      }),
    });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'access-token',
      fetchImpl: fetchMock,
    });

    const result = await uploadProof(
      client,
      { ...photo, contentType: 'image/webp', filename: 'signature.webp' },
      'delivery-signatures',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/upload?prefix=delivery-signatures'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual(expect.objectContaining({ contentType: 'image/webp' }));
  });

  it('rejects unsupported images before transfer', async () => {
    const fetchMock = jest.fn();
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      getAccessToken: async () => 'access-token',
      fetchImpl: fetchMock,
    });

    await expect(
      uploadProof(
        client,
        { ...photo, contentType: 'image/gif', filename: 'photo.gif' },
        'mobile-poc/photos',
      ),
    ).rejects.toMatchObject({ code: 'unsupported-content-type' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
