/**
 * Explicit platform roots for React Native CLI (iOS/Android live under `ios/`
 * and `android/`; macOS app is generated under `macos/`).
 */
module.exports = {
  project: {
    ios: {
      sourceDir: './ios',
    },
    android: {
      sourceDir: './android',
    },
    macos: {
      sourceDir: './macos',
    },
  },
};
