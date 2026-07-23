import React from 'react';
import { TextInput } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { LoginScreen } from '../features/auth/LoginScreen';

describe('LoginScreen', () => {
  it('renders centered inputs with a prominent login button and submits trimmed credentials', () => {
    const onLogin = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<LoginScreen onLogin={onLogin} />);
    });

    const screen = renderer.root.findByProps({ testID: 'LoginScreenContainer' });
    const card = renderer.root.findByProps({ testID: 'LoginFormCard' });
    const button = renderer.root.findByProps({ testID: 'LoginButton' });

    expect(screen.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ justifyContent: 'center' })]));
    expect(card.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ alignSelf: 'center' })]));
    expect(button.props.accessibilityRole).toBe('button');

    ReactTestRenderer.act(() => {
      renderer.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === '用户名')?.props.onChangeText(' admin ');
      renderer.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === '密码')?.props.onChangeText('secret');
    });
    button.props.onPress();

    expect(onLogin).toHaveBeenCalledWith('admin', 'secret');
  });
});
