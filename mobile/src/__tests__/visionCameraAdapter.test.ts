import { createCapturedImageFromVisionPhoto, createPendingScanFromVisionCode } from '../platform/camera/visionCameraAdapter';

describe('vision camera adapter', () => {
  it('maps real VisionCamera QR/barcode callbacks into scanner contracts', () => {
    expect(createPendingScanFromVisionCode({ type: 'qr', value: 'bulkdesk://temporary-order/POC' })).toEqual({
      kind: 'qr',
      format: 'qr',
      value: 'bulkdesk://temporary-order/POC',
    });

    expect(createPendingScanFromVisionCode({ type: 'code-128', value: 'ORDER-001' })).toEqual({
      kind: 'barcode',
      format: 'code-128',
      value: 'ORDER-001',
    });
  });

  it('ignores empty camera scan callbacks', () => {
    expect(createPendingScanFromVisionCode({ type: 'qr' })).toBeNull();
    expect(createPendingScanFromVisionCode({ type: 'ean-13', value: '' })).toBeNull();
  });

  it('normalizes captured camera photos into uploadable JPEG metadata', () => {
    expect(
      createCapturedImageFromVisionPhoto({
        path: '/tmp/bulkdesk-photo.jpg',
        width: 1280,
        height: 960,
      }),
    ).toEqual({
      uri: 'file:///tmp/bulkdesk-photo.jpg',
      filename: 'bulkdesk-photo.jpg',
      contentType: 'image/jpeg',
      size: 0,
      width: 1280,
      height: 960,
      source: 'camera',
    });
  });
});
