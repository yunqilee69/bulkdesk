const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const {
  createHarmonyMetroConfig,
} = require('@react-native-oh/react-native-harmony/metro.config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

const defaultConfig = getDefaultConfig(__dirname);
const harmonyConfig = createHarmonyMetroConfig({
  reactNativeHarmonyPackageName: '@react-native-oh/react-native-harmony',
});
const mergedConfig = mergeConfig(defaultConfig, harmonyConfig, config);

module.exports = {
  ...mergedConfig,
  serializer: {
    ...mergedConfig.serializer,
    getModulesRunBeforeMainModule: () => {
      const harmonyModules = harmonyConfig.serializer?.getModulesRunBeforeMainModule?.() ?? [];
      if (harmonyModules.length > 0) {
        return harmonyModules;
      }

      return defaultConfig.serializer?.getModulesRunBeforeMainModule?.() ?? [];
    },
  },
};
