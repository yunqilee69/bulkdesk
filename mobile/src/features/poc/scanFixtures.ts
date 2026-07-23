export const scanFixtures = {
  ean13: '6901234567892',
  code128: 'BD-POC-CODE128-0001',
  code39: 'BDPOC39',
  validTemporaryOrderQr:
    'bulkdesk://temporary-order/poc-valid-v1?expires=2099-12-31T23%3A59%3A59.000Z',
  expiredTemporaryOrderQr:
    'bulkdesk://temporary-order/poc-expired-v1?expires=2020-01-01T00%3A00%3A00.000Z',
  invalidExternalQr: 'https://example.invalid/not-a-bulkdesk-order',
} as const;

export const scannerFixtureRows = [
  { label: 'EAN-13', value: scanFixtures.ean13, format: 'ean-13' as const, kind: 'barcode' as const },
  { label: 'Code 128', value: scanFixtures.code128, format: 'code-128' as const, kind: 'barcode' as const },
  { label: 'Code 39', value: scanFixtures.code39, format: 'code-39' as const, kind: 'barcode' as const },
  { label: '有效临时订单 QR', value: scanFixtures.validTemporaryOrderQr, format: 'qr' as const, kind: 'qr' as const },
  { label: '过期临时订单 QR', value: scanFixtures.expiredTemporaryOrderQr, format: 'qr' as const, kind: 'qr' as const },
  { label: '外部无效 QR', value: scanFixtures.invalidExternalQr, format: 'qr' as const, kind: 'qr' as const },
];
