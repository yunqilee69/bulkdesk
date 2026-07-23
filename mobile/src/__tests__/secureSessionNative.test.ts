import { createNativeSecureStorage } from '../security/nativeSecureStorage';
import { createSecureSession } from '../security/secureSession';

type MockedKeychain = {
  getGenericPassword: jest.Mock;
  resetGenericPassword: jest.Mock;
  setGenericPassword: jest.Mock;
};

const mockedKeychain = require('react-native-keychain') as MockedKeychain;

describe('native secure session storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedKeychain.getGenericPassword.mockResolvedValue(false);
    mockedKeychain.setGenericPassword.mockResolvedValue(true);
    mockedKeychain.resetGenericPassword.mockResolvedValue(true);
  });

  it('stores session tokens through react-native-keychain', async () => {
    const storage = createNativeSecureStorage();
    const session = createSecureSession(storage);

    await session.setTokens({ accessToken: 'token', refreshToken: 'refresh-token' });

    expect(mockedKeychain.setGenericPassword).toHaveBeenCalledWith(
      'bulkdesk.session.tokens',
      JSON.stringify({ accessToken: 'token', refreshToken: 'refresh-token' }),
      expect.objectContaining({
        accessible: 'WhenUnlockedThisDeviceOnly',
        service: 'bulkdesk.session.tokens',
      }),
    );
  });

  it('restores session tokens from react-native-keychain', async () => {
    const storage = createNativeSecureStorage();
    const session = createSecureSession(storage);
    mockedKeychain.getGenericPassword.mockResolvedValue({
      password: JSON.stringify({ accessToken: 'token', refreshToken: 'refresh-token' }),
      service: 'bulkdesk.session.tokens',
      storage: 'keychain',
      username: 'bulkdesk.session.tokens',
    });

    await expect(session.getTokens()).resolves.toEqual({ accessToken: 'token', refreshToken: 'refresh-token' });
    expect(mockedKeychain.getGenericPassword).toHaveBeenCalledWith({ service: 'bulkdesk.session.tokens' });
  });

  it('clears session values from react-native-keychain without plaintext fallback', async () => {
    const storage = createNativeSecureStorage();
    const session = createSecureSession(storage);

    await session.clear();

    expect(mockedKeychain.resetGenericPassword).toHaveBeenCalledWith({ service: 'bulkdesk.session.tokens' });
    expect(mockedKeychain.resetGenericPassword).toHaveBeenCalledWith({ service: 'bulkdesk.session.workspace' });
  });
});
