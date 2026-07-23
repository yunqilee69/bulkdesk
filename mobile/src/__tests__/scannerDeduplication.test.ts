import { scanFixtures } from '../features/poc/scanFixtures';
import { createScanDeduplicator } from '../platform/scanner/scanResult';

describe('scan duplicate suppression', () => {
  it('suppresses repeated EAN-13 reads within 1,500 ms', () => {
    const deduplicator = createScanDeduplicator({ windowMs: 1500 });

    expect(
      deduplicator.shouldAcceptScan(
        { value: scanFixtures.ean13, format: 'ean-13', kind: 'barcode' },
        1000,
      ),
    ).toBe(true);
    expect(
      deduplicator.shouldAcceptScan(
        { value: scanFixtures.ean13, format: 'ean-13', kind: 'barcode' },
        2000,
      ),
    ).toBe(false);
  });

  it('allows the same value after the suppression window', () => {
    const deduplicator = createScanDeduplicator({ windowMs: 1500 });

    deduplicator.shouldAcceptScan(
      { value: scanFixtures.code128, format: 'code-128', kind: 'barcode' },
      1000,
    );

    expect(
      deduplicator.shouldAcceptScan(
        { value: scanFixtures.code128, format: 'code-128', kind: 'barcode' },
        2600,
      ),
    ).toBe(true);
  });
});
