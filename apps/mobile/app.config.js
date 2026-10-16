const appJson = require('./app.json');

// Only the Android map needs a Google key (iOS uses Apple Maps; place search uses Photon).
const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const appConfig = appJson.expo;

module.exports = {
  ...appConfig,
  ios: {
    ...appConfig.ios,
    config: {
      ...appConfig.ios?.config,
      ...(googleMapsApiKey ? { googleMapsApiKey } : {}),
    },
  },
  android: {
    ...appConfig.android,
    config: {
      ...appConfig.android?.config,
      ...(googleMapsApiKey
        ? {
            googleMaps: {
              ...appConfig.android?.config?.googleMaps,
              apiKey: googleMapsApiKey,
            },
          }
        : {}),
    },
  },
};
