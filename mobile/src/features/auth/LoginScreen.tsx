import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export function LoginScreen({ onLogin }: { onLogin?: (username: string, password: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <View style={styles.safeArea}>
      <View testID="LoginScreenContainer" style={[styles.container]}>
        <View testID="LoginFormCard" style={[styles.card]}>
          <Text style={styles.title}>BulkDesk 登录</Text>
          <Text style={styles.subtitle}>现场移动工作台</Text>
          <TextInput
            accessibilityLabel="用户名"
            autoCapitalize="none"
            onChangeText={setUsername}
            placeholder="用户名"
            placeholderTextColor="#98a2b3"
            style={styles.input}
            value={username}
          />
          <TextInput
            accessibilityLabel="密码"
            onChangeText={setPassword}
            placeholder="密码"
            placeholderTextColor="#98a2b3"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="登录"
            hitSlop={8}
            testID="LoginButton"
            style={styles.loginButton}
            onPress={() => onLogin?.(username.trim(), password)}
          >
            <Text style={styles.loginButtonText}>登录</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    gap: 14,
    maxWidth: 360,
    width: '100%',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  input: {
    borderColor: '#d9d9d9',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    height: 48,
    paddingHorizontal: 12,
  },
  loginButton: {
    alignItems: 'center',
    backgroundColor: '#1677ff',
    borderRadius: 10,
    height: 48,
    justifyContent: 'center',
    marginTop: 4,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  safeArea: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  subtitle: {
    color: '#667085',
    marginBottom: 8,
    textAlign: 'center',
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
});
