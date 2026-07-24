import React from 'react';
import { StatusBar } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { AppProviders } from '../app/AppProviders';

jest.mock('react-native-safe-area-context', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');

  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactMock.createElement(View, { testID: 'SafeAreaProvider' }, children),
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) => ReactMock.createElement(View, props, children),
  };
});

describe('mobile status bar safe area', () => {
  it('wraps rendered app content with a top safe area frame', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<AppProviders />);
    });

    const safeAreaFrames = renderer.root.findAllByProps({ testID: 'MobileSafeAreaFrame' })
      .filter(node => node.props.edges);

    expect(safeAreaFrames.length).toBeGreaterThanOrEqual(1);
    expect(safeAreaFrames[0].props.edges).toEqual(['top']);
    expect(safeAreaFrames[0].props.style).toEqual(expect.objectContaining({ flex: 1 }));

    const statusBar = renderer.root.findByType(StatusBar);
    expect(statusBar.props.translucent).toBe(false);
    expect(statusBar.props.barStyle).toBe('dark-content');
  });
});
