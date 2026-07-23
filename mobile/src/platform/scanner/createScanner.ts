import { scannerFixtureRows } from '../../features/poc/scanFixtures';
import type { Scanner, ScanResult } from '../contracts';
import { completeScanResult } from './scanResult';

export function createFixtureScanner(sequence = scannerFixtureRows): Scanner {
  let index = 0;

  return {
    async scanOnce(): Promise<ScanResult> {
      const fixture = sequence[index % sequence.length];
      index += 1;

      return completeScanResult({
        value: fixture.value,
        format: fixture.format,
        kind: fixture.kind,
      });
    },
  };
}
