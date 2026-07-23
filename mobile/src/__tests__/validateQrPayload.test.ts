import { scanFixtures } from '../features/poc/scanFixtures';
import { validateQrPayload } from '../platform/scanner/validateQrPayload';

describe('validateQrPayload', () => {
  it('accepts a valid BulkDesk temporary-order QR payload', () => {
    expect(validateQrPayload(scanFixtures.validTemporaryOrderQr)).toEqual({
      kind: 'temporary-order',
      id: 'poc-valid-v1',
      expiresAt: '2099-12-31T23:59:59.000Z',
    });
  });

  it('rejects expired temporary-order QR payloads', () => {
    expect(validateQrPayload(scanFixtures.expiredTemporaryOrderQr)).toEqual({
      kind: 'invalid',
      reason: 'expired',
    });
  });

  it('rejects external or unsupported QR payloads', () => {
    expect(validateQrPayload(scanFixtures.invalidExternalQr)).toEqual({
      kind: 'invalid',
      reason: 'unsupported-scheme',
    });
  });

  it('rejects malformed encoded payloads without throwing', () => {
    expect(validateQrPayload('bulkdesk://temporary-order/%E0%A4%A?expires=%E0%A4%A')).toEqual({
      kind: 'invalid',
      reason: 'unsupported-scheme',
    });
  });
});
