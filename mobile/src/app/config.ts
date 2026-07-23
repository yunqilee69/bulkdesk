const DEFAULT_API_BASE_URL = 'http://192.168.1.11:9000';

type EnvWithApiBaseUrl = {
  BULKDESK_API_BASE_URL?: string;
};

export function getApiBaseUrl(env: EnvWithApiBaseUrl = {}): string {
  return env.BULKDESK_API_BASE_URL?.replace(/\/$/, '') || DEFAULT_API_BASE_URL;
}
