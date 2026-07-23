import { getApiBaseUrl } from '../app/config';

describe('app config', () => {
  it('uses the LAN dev backend by default and trims injected api base url', () => {
    expect(getApiBaseUrl()).toBe('http://192.168.1.11:9000');
    expect(getApiBaseUrl({ BULKDESK_API_BASE_URL: 'https://api.example.test/' })).toBe('https://api.example.test');
  });
});
