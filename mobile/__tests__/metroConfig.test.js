const { execFileSync } = require('child_process');
const path = require('path');

describe('metro config', () => {
  it('preserves React Native initialization for non-Harmony bundles', () => {
    const output = execFileSync(
      process.execPath,
      [
        '-e',
        "const config = require('./metro.config'); console.log(JSON.stringify(config.serializer.getModulesRunBeforeMainModule()));",
      ],
      { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' },
    );

    expect(JSON.parse(output.trim())).toContain(
      require.resolve('react-native/Libraries/Core/InitializeCore'),
    );
  });
});
