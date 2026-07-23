const fs = require('fs');
const path = require('path');

describe('iOS glog configuration', () => {
  it('defines the pthread and Google namespace macros required by the iOS build', () => {
    const config = fs.readFileSync(path.resolve(__dirname, '../ios/glog-config.h'), 'utf8');

    expect(config).toContain('#define GOOGLE_NAMESPACE google');
    expect(config).toContain('#define HAVE_PTHREAD 1');
    expect(config).toContain('#define HAVE_RWLOCK 1');
  });
});
