import type { CapturedImage, MediaCapture } from '../contracts';

export function createFixtureMediaCapture(): MediaCapture {
  const removedUris = new Set<string>();

  return {
    async capturePhoto(): Promise<CapturedImage> {
      return {
        uri: 'file:///bulkdesk-poc/photo-fixture.jpg',
        filename: 'photo-fixture.jpg',
        contentType: 'image/jpeg',
        size: 128 * 1024,
        width: 1280,
        height: 960,
        source: 'fixture',
      };
    },
    async removeLocalFile(uri: string): Promise<void> {
      removedUris.add(uri);
    },
  };
}
