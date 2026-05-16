module.exports = {
  preset: 'react-native',
  // `ratex-react-native` is linked from `../../platforms/react-native`, which may contain its own
  // `node_modules/react-native` (devDependency). Force Jest to use this app's RN copy.
  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react',
    '^react/(.*)$': '<rootDir>/node_modules/react/$1',
    '^react-native$': '<rootDir>/node_modules/react-native',
    '^react-native/(.*)$': '<rootDir>/node_modules/react-native/$1',
  },
};
