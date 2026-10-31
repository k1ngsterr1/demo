const { withAndroidManifest, withPodfileProperties, withGradleProperties } = require('expo/config-plugins');
module.exports = config => {
  config = withPodfileProperties(config, result => {
    result.modResults.EX_DEV_CLIENT_NETWORK_INSPECTOR = 'false';
    return result;
  });
  config = withGradleProperties(config, result => {
    result.modResults = result.modResults.filter(entry => entry.key !== 'EX_DEV_CLIENT_NETWORK_INSPECTOR');
    result.modResults.push({ type: 'property', key: 'EX_DEV_CLIENT_NETWORK_INSPECTOR', value: 'false' });
    return result;
  });
  return withAndroidManifest(config, result => {
  const application = result.modResults.manifest.application[0].$;
  application['android:usesCleartextTraffic'] = 'true';
  application['android:allowBackup'] = 'false';
  return result;
  });
};
