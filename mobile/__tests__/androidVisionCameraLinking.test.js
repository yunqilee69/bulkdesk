const fs = require('fs');
const path = require('path');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

describe('Android Vision Camera native linking', () => {
  it('manually registers the Vision Camera native package when autolinking omits it', () => {
    const settings = readProjectFile('android/settings.gradle');
    const appBuild = readProjectFile('android/app/build.gradle');
    const mainApplication = readProjectFile('android/app/src/main/java/com/bulkdesk/mobilepoc/MainApplication.kt');

    expect(settings).toContain("include ':react-native-vision-camera'");
    expect(settings).toContain('../node_modules/react-native-vision-camera/android');
    expect(appBuild).toContain("implementation project(':react-native-vision-camera')");
    expect(mainApplication).toContain('import com.mrousavy.camera.react.CameraPackage');
    expect(mainApplication).toContain('add(CameraPackage())');
  });
});
