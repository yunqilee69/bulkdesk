import * as Keychain from 'react-native-keychain';

import type { SecureStorageAdapter } from '../platform/contracts';

const accessible = Keychain.ACCESSIBLE?.WHEN_UNLOCKED_THIS_DEVICE_ONLY;

export function createNativeSecureStorage(): SecureStorageAdapter {
  return {
    async getItem(key) {
      const credentials = await Keychain.getGenericPassword({ service: key });
      return credentials ? credentials.password : null;
    },
    async setItem(key, value) {
      await Keychain.setGenericPassword(key, value, {
        accessible,
        service: key,
      });
    },
    async removeItem(key) {
      await Keychain.resetGenericPassword({ service: key });
    },
  };
}
