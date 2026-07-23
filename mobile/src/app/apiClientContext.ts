import { createContext, useContext } from 'react';

import type { ApiClient } from '../api/client';

export const ApiClientContext = createContext<ApiClient | null>(null);

export function useApiClient(providedClient?: ApiClient): ApiClient | null {
  const contextClient = useContext(ApiClientContext);
  return providedClient ?? contextClient;
}
