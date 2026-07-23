export type ValidQrPayload = {
  kind: 'temporary-order';
  id: string;
  expiresAt: string;
};

export type InvalidQrPayload = {
  kind: 'invalid';
  reason: 'unsupported-scheme' | 'missing-id' | 'missing-expiry' | 'invalid-expiry' | 'expired';
};

export type QrPayload = ValidQrPayload | InvalidQrPayload;

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function readQueryParam(query: string, name: string): string | null {
  for (const pair of query.split('&')) {
    const [rawKey, rawValue = ''] = pair.split('=');
    const key = safeDecode(rawKey);
    if (key === name) {
      return safeDecode(rawValue.replace(/\+/g, ' '));
    }
  }

  return null;
}

export function validateQrPayload(value: string, now: Date = new Date()): QrPayload {
  const prefix = 'bulkdesk://temporary-order/';
  if (!value.startsWith(prefix)) {
    return { kind: 'invalid', reason: 'unsupported-scheme' };
  }

  const [rawPath, query = ''] = value.slice(prefix.length).split('?', 2);
  const decodedPath = safeDecode(rawPath);
  if (!decodedPath) {
    return { kind: 'invalid', reason: 'unsupported-scheme' };
  }

  const id = decodedPath.trim();

  if (!id) {
    return { kind: 'invalid', reason: 'missing-id' };
  }

  const expires = readQueryParam(query, 'expires');
  if (!expires) {
    return { kind: 'invalid', reason: 'missing-expiry' };
  }

  const expiresAt = new Date(expires);
  if (Number.isNaN(expiresAt.getTime())) {
    return { kind: 'invalid', reason: 'invalid-expiry' };
  }

  if (expiresAt.getTime() <= now.getTime()) {
    return { kind: 'invalid', reason: 'expired' };
  }

  return { kind: 'temporary-order', id, expiresAt: expiresAt.toISOString() };
}
