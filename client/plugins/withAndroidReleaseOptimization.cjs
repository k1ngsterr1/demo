const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

module.exports = function withAndroidReleaseOptimization(config) {
  // AGP 8.12 requires this opt-in; AGP 9 enables it by default.
  config = withGradleProperties(config, result => {
    const key = 'android.r8.optimizedResourceShrinking';
    result.modResults = result.modResults.filter(entry => entry.key !== key);
    result.modResults.push({ type: 'property', key, value: 'true' });
    return result;
  });

  return withAppBuildGradle(config, result => {
    const { contents } = result.modResults;
    const defaultRules = /getDefaultProguardFile\((["'])proguard-android\.txt\1\)/g;
    const optimizedRules = /getDefaultProguardFile\((["'])proguard-android-optimize\.txt\1\)/;

    // Fail visibly if a future Expo template changes this hook.
    if (!defaultRules.test(contents) && !optimizedRules.test(contents)) {
      throw new Error('Android release optimization: default ProGuard configuration not found.');
    }

    result.modResults.contents = contents.replace(
      defaultRules,
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );
    return result;
  });
};
