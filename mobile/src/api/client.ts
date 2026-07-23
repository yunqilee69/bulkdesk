type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: number | string;
  readonly recoverable: boolean;

  constructor(params: { status: number; code: number | string; message: string; recoverable?: boolean }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.status = params.status;
    this.code = params.code;
    this.recoverable = params.recoverable ?? params.status >= 500;
  }
}

export type ApiClientOptions = {
  baseUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetchImpl?: FetchLike;
  onUnauthorized?: () => Promise<void> | void;
  timeoutMs?: number;
};

export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
};

type BulkDeskEnvelope<T> = {
  code?: number;
  message?: string;
  data: T;
};

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

async function parseJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async request<T>(path: string, requestOptions: ApiRequestOptions = {}): Promise<T> {
      const token = await options.getAccessToken();
      const controller = new AbortController();
      const timeoutMs = requestOptions.timeoutMs ?? options.timeoutMs ?? 15_000;
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const headers: Record<string, string> = {
        ...(requestOptions.headers as Record<string, string> | undefined),
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      try {
        const response = await fetchImpl(joinUrl(options.baseUrl, path), {
          ...requestOptions,
          headers,
          signal: requestOptions.signal ?? controller.signal,
        });
        const payload = (await parseJsonSafely(response)) as BulkDeskEnvelope<T> | null;

        if (!response.ok) {
          if (response.status === 401) {
            await options.onUnauthorized?.();
          }
          throw new ApiClientError({
            status: response.status,
            code: payload?.code ?? response.status,
            message: payload?.message ?? `HTTP ${response.status}`,
            recoverable: response.status >= 500 || response.status === 408,
          });
        }

        if (payload && typeof payload.code === 'number' && ![0, 200].includes(payload.code)) {
          throw new ApiClientError({
            status: response.status,
            code: payload.code,
            message: payload.message ?? 'BulkDesk API error',
          });
        }

        return payload && 'data' in payload ? payload.data : (payload as T);
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new ApiClientError({ status: 0, code: 'timeout', message: '请求超时', recoverable: true });
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
