import { exportSignature } from '../platform/signature/createSignatureExporter';
import { addStroke, createEmptySignature, sampleStroke } from '../platform/signature/signatureModel';

describe('signature export', () => {
  it('exports a completed signature as a PNG upload payload', async () => {
    const image = await exportSignature(addStroke(createEmptySignature(), sampleStroke), {
      now: () => new Date('2026-07-22T00:00:00.000Z'),
    });

    expect(image).toEqual(
      expect.objectContaining({
        contentType: 'image/png',
        filename: 'signature-20260722T000000000Z.png',
        size: expect.any(Number),
        uri: expect.stringMatching(/^data:image\/png;base64,/),
      }),
    );
    expect(image.size).toBeGreaterThan(0);
  });

  it('rejects blank signatures', async () => {
    await expect(exportSignature(createEmptySignature())).rejects.toMatchObject({
      code: 'signature-empty',
    });
  });
});
