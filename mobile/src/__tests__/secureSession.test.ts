import { createMemorySecureStorage, createSecureSession } from '../security/secureSession';

describe('secure session', () => {
  it('stores tokens through an injected secure storage adapter', async () => {
    const storage = createMemorySecureStorage();
    const session = createSecureSession(storage);

    await session.setTokens({ accessToken: 'access-token', refreshToken: 'refresh-token' });

    expect(await storage.getItem('bulkdesk.session.tokens')).toContain('access-token');
    expect(await session.getTokens()).toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });
  });

  it('clears session and workspace-scoped cache on logout or workspace switch', async () => {
    const storage = createMemorySecureStorage();
    const session = createSecureSession(storage);

    await session.setTokens({ accessToken: 'access-token', refreshToken: 'refresh-token' });
    await session.setWorkspace('merchant');
    await session.clear();

    expect(await session.getTokens()).toBeNull();
    expect(await session.getWorkspace()).toBeNull();
  });
});
