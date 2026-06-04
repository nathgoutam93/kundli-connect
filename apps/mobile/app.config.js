const appJson = require('./app.json');

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

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
