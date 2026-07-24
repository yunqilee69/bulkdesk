import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { getCurrentUser, login, type CurrentUser } from '../api/auth';
import { createApiClient } from '../api/client';
import { LoginScreen } from '../features/auth/LoginScreen';
import { CartProvider } from '../features/cart/cartStore';
import { createNativeSecureStorage } from '../security/nativeSecureStorage';
import { createSecureSession } from '../security/secureSession';
import { ApiClientContext } from './apiClientContext';
import { AppNavigator } from './AppNavigator';
import { getApiBaseUrl } from './config';

type SecureSession = ReturnType<typeof createSecureSession>;

export const SessionContext = createContext<SecureSession | null>(null);

export function AppProviders() {
  const queryClient = useMemo(() => new QueryClient({
    defaultOptions: __DEV__ ? { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } : undefined,
  }), []);
  const session = useMemo(() => createSecureSession(createNativeSecureStorage()), []);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const handleUnauthorized = useCallback(async () => {
    await session.clear();
    queryClient.clear();
    setCurrentUser(null);
  }, [queryClient, session]);

  const apiClient = useMemo(
    () =>
      createApiClient({
        baseUrl: getApiBaseUrl(),
        getAccessToken: async () => (await session.getTokens())?.accessToken ?? null,
        onUnauthorized: handleUnauthorized,
      }),
    [handleUnauthorized, session],
  );

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const tokens = await session.getTokens();
        if (!tokens) {
          return;
        }
        const user = await getCurrentUser(apiClient);
        if (!cancelled) {
          setCurrentUser(user);
        }
      } catch {
        await session.clear();
      } finally {
        if (!cancelled) {
          setRestoring(false);
        }
      }
    }

    restoreSession().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiClient, session]);

  async function handleLogin(username: string, password: string) {
    setAuthError(null);
    try {
      const tokens = await login(apiClient, { username, password });
      await session.setTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
      setCurrentUser(await getCurrentUser(apiClient));
      queryClient.clear();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '登录失败');
    }
  }

  async function handleLogout() {
    await handleUnauthorized();
  }

  let content: React.ReactNode;
  if (restoring) {
    content = (
      <View style={styles.screenFill}>
        <Text>正在恢复会话...</Text>
      </View>
    );
  } else if (!currentUser) {
    content = (
      <View style={styles.screenFill}>
        <LoginScreen onLogin={(username, password) => { handleLogin(username, password).catch(() => undefined); }} />
        {authError ? <Text>{authError}</Text> : null}
      </View>
    );
  } else {
    content = <AppNavigator roles={currentUser.roles} onLogout={() => { handleLogout().catch(() => undefined); }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar backgroundColor={styles.safeAreaFrame.backgroundColor} barStyle="dark-content" translucent={false} />
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider value={session}>
          <ApiClientContext.Provider value={apiClient}>
            <CartProvider>
              <SafeAreaView testID="MobileSafeAreaFrame" edges={['top']} style={styles.safeAreaFrame}>
                {content}
              </SafeAreaView>
            </CartProvider>
          </ApiClientContext.Provider>
        </SessionContext.Provider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeAreaFrame: {
    backgroundColor: '#f2f4f7',
    flex: 1,
  },
  screenFill: {
    flex: 1,
  },
});
