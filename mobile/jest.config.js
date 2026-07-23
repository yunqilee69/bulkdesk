module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  modulePathIgnorePatterns: ['<rootDir>/harmony/oh_modules', '<rootDir>/harmony/.hvigor'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/harmony/oh_modules/',
    '<rootDir>/harmony/.hvigor/',
    '<rootDir>/harmony/entry/build/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation)/)',
  ],
};
