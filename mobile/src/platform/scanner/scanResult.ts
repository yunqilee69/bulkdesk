import type { PendingScanResult, ScanResult } from '../contracts';

export function completeScanResult(scan: PendingScanResult, now: Date = new Date()): ScanResult {
  return {
    ...scan,
    scannedAt: now.toISOString(),
  };
}

export function scanIdentity(scan: Pick<PendingScanResult, 'value' | 'format'>): string {
  return `${scan.format}:${scan.value}`;
}

export function createScanDeduplicator(options: { windowMs: number }) {
  const acceptedAtByIdentity = new Map<string, number>();

  return {
    shouldAcceptScan(scan: PendingScanResult, timestampMs: number = Date.now()) {
      const identity = scanIdentity(scan);
      const previousAcceptedAt = acceptedAtByIdentity.get(identity);

      if (previousAcceptedAt !== undefined && timestampMs - previousAcceptedAt < options.windowMs) {
        return false;
      }

      acceptedAtByIdentity.set(identity, timestampMs);
      return true;
    },
    reset() {
      acceptedAtByIdentity.clear();
    },
  };
}
