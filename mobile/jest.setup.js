/* global jest */

jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  const Camera = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePhoto: jest.fn(async () => ({
        path: '/tmp/bulkdesk-camera-test.jpg',
        width: 1280,
        height: 960,
        isRawPhoto: false,
        orientation: 'portrait',
        isMirrored: false,
      })),
    }));

    return React.createElement(View, { ...props, testID: 'VisionCamera' });
  });

  return {
    Camera,
    useCameraDevice: jest.fn(() => ({ id: 'back', position: 'back' })),
    useCameraPermission: jest.fn(() => ({ hasPermission: true, requestPermission: jest.fn(async () => true) })),
    useCodeScanner: jest.fn(scanner => scanner),
  };
});

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn(async () => 'file:///tmp/bulkdesk-signature-test.png'),
}));

jest.mock('react-native-image-resizer', () => ({
  __esModule: true,
  default: {
    createResizedImage: jest.fn(async (uri, _width, _height, _format, _quality) => ({
      uri,
      path: uri,
      name: 'resized-image.jpg',
      size: 1024,
      width: 1280,
      height: 960,
    })),
  },
}));

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly',
  },
  getGenericPassword: jest.fn(async () => false),
  resetGenericPassword: jest.fn(async () => true),
  setGenericPassword: jest.fn(async () => true),
}));

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationContainer: ({ children }) => React.createElement(React.Fragment, null, children),
    useNavigation: () => ({ navigate: jest.fn() }),
  };
});

jest.mock('@react-navigation/native-stack', () => {
  const React = require('react');

  return {
    createNativeStackNavigator: () => ({
      Navigator: ({ children }) => React.createElement(React.Fragment, null, children),
      Screen: ({ children, component: Component }) => {
        if (children) {
          return children();
        }
        return Component ? React.createElement(Component) : null;
      },
    }),
  };
});

jest.mock('@react-navigation/bottom-tabs', () => {
  const React = require('react');

  return {
    createBottomTabNavigator: () => ({
      Navigator: ({ children }) => React.createElement(React.Fragment, null, children),
      Screen: ({ component: Component }) => React.createElement(Component),
    }),
  };
});
