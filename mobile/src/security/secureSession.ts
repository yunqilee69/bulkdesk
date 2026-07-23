import type { SecureStorageAdapter } from '../platform/contracts';

const TOKENS_KEY = 'bulkdesk.session.tokens';
const WORKSPACE_KEY = 'bulkdesk.session.workspace';

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export type WorkspaceKind = 'customer' | 'merchant';

export function createMemorySecureStorage(): SecureStorageAdapter {
  const store = new Map<string, string>();

  return {
    async getItem(key) {
      return store.get(key) ?? null;
    },
    async setItem(key, value) {
      store.set(key, value);
    },
    async removeItem(key) {
      store.delete(key);
    },
  };
}

export function createSecureSession(storage: SecureStorageAdapter) {
  if (!storage) {
    throw new Error('Secure storage adapter is required; plaintext fallback is not allowed.');
  }

  return {
    async setTokens(tokens: SessionTokens) {
      await storage.setItem(TOKENS_KEY, JSON.stringify(tokens));
    },
    async getTokens(): Promise<SessionTokens | null> {
      const value = await storage.getItem(TOKENS_KEY);
      return value ? (JSON.parse(value) as SessionTokens) : null;
    },
    async setWorkspace(workspace: WorkspaceKind) {
      await storage.setItem(WORKSPACE_KEY, workspace);
    },
    async getWorkspace(): Promise<WorkspaceKind | null> {
      return (await storage.getItem(WORKSPACE_KEY)) as WorkspaceKind | null;
    },
    async clear() {
      await storage.removeItem(TOKENS_KEY);
      await storage.removeItem(WORKSPACE_KEY);
    },
  };
}
