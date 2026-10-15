import { Ionicons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { BirthLocationMap } from '@/components/birth-location-map';
import { OnboardingStep } from '@/components/onboarding-step';
import { AppText } from '@/components/ui/app-text';
import { IconButton } from '@/components/ui/icon-button';
import { TextField } from '@/components/ui/text-field';
import { colors, radius, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const googlePlacesApiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? googleMapsApiKey;
const hasExpoMapsNativeModule =
  Platform.OS === 'web' || Boolean(requireOptionalNativeModule('ExpoMaps'));

const DEFAULT_BIRTH_COORDINATE = {
  latitude: 28.6139,
  longitude: 77.209,
};

const MIN_MAP_DELTA = 0.01;
const MAX_MAP_DELTA = 80;
const SELECTED_PLACE_MAP_DELTA = 0.25;

type Coordinate = {
  latitude: number;
  longitude: number;
};

type Region = Coordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};

type PlaceSuggestion = {
  description: string;
  placeId: string;
};

function isInRange(value: string, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max;
}

function getInitialCoordinate(latitude: string, longitude: string): Coordinate {
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);

  if (
    Number.isFinite(parsedLatitude) &&
    Number.isFinite(parsedLongitude) &&
    parsedLatitude >= -90 &&
    parsedLatitude <= 90 &&
    parsedLongitude >= -180 &&
    parsedLongitude <= 180
  ) {
    return {
      latitude: parsedLatitude,
      longitude: parsedLongitude,
    };
  }

  return DEFAULT_BIRTH_COORDINATE;
}

function coordinateToRegion(coordinate: Coordinate): Region {
  return {
    ...coordinate,
    latitudeDelta: 0.35,
    longitudeDelta: 0.35,
  };
}

function createPlacesSessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function BirthLocationScreen() {
  const { profile, updateProfile, generateKundli, isServiceBusy } = useAppData();
  const placesSessionTokenRef = useRef(createPlacesSessionToken());
  const initialCoordinate = useMemo(
    () => getInitialCoordinate(profile.birthLatitude, profile.birthLongitude),
    [profile.birthLatitude, profile.birthLongitude]
  );
  const [birthPlace, setBirthPlace] = useState(profile.birthPlace);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isFetchingPlaces, setIsFetchingPlaces] = useState(false);
  const [placesError, setPlacesError] = useState('');
  const [hasSelectedSuggestion, setHasSelectedSuggestion] = useState(Boolean(profile.birthPlace));
  const [selectedCoordinate, setSelectedCoordinate] = useState<Coordinate>(initialCoordinate);
  const [mapRegion, setMapRegion] = useState<Region>(() => coordinateToRegion(initialCoordinate));
  const [birthTimezone, setBirthTimezone] = useState(profile.birthTimezone || '5.5');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentLocation() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== Location.PermissionStatus.GRANTED) {
          return;
        }

        const servicesEnabled = await Location.hasServicesEnabledAsync();

        if (!servicesEnabled) {
          return;
        }

        const location = await Location.getLastKnownPositionAsync();

        if (!isMounted || !location) {
          return;
        }

        updateSelectedCoordinate({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      } catch {
        // Current location is optional; keep the fallback coordinate when unavailable.
      }
    }

    loadCurrentLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!googlePlacesApiKey) {
      setPlacesError('Google Places API key is not configured.');
      return;
    }

    const query = birthPlace.trim();

    if (query.length < 3 || hasSelectedSuggestion) {
      setPlaceSuggestions([]);
      setPlacesError('');
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        setIsFetchingPlaces(true);
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/place/autocomplete/json?${[
            `input=${encodeURIComponent(query)}`,
            `key=${encodeURIComponent(googlePlacesApiKey)}`,
            `sessiontoken=${encodeURIComponent(placesSessionTokenRef.current)}`,
            'types=geocode',
          ].join('&')}`
        );
        const data = (await response.json()) as {
          error_message?: string;
          status?: string;
          predictions?: { description: string; place_id: string }[];
        };

        if (!isMounted) {
          return;
        }

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
          setPlaceSuggestions([]);
          setPlacesError(
            data.error_message || `Place suggestions unavailable (${data.status ?? 'unknown error'}).`
          );
          return;
        }

        setPlacesError('');
        setPlaceSuggestions(
          (data.predictions ?? []).slice(0, 5).map((prediction) => ({
            description: prediction.description,
            placeId: prediction.place_id,
          }))
        );
      } catch (error) {
        if (__DEV__) {
          console.info('Google Places autocomplete failed.', error);
        }
        if (isMounted) {
          setPlaceSuggestions([]);
          setPlacesError('Place suggestions unavailable. Check your connection and API configuration.');
        }
      } finally {
        if (isMounted) {
          setIsFetchingPlaces(false);
        }
      }
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [birthPlace, hasSelectedSuggestion]);

  const isFormValid = useMemo(
    () =>
      Boolean(birthPlace.trim()) &&
      selectedCoordinate.latitude >= -90 &&
      selectedCoordinate.latitude <= 90 &&
      selectedCoordinate.longitude >= -180 &&
      selectedCoordinate.longitude <= 180 &&
      isInRange(birthTimezone, -12, 14),
    [birthPlace, birthTimezone, selectedCoordinate.latitude, selectedCoordinate.longitude]
  );
  const canRenderMap =
    hasExpoMapsNativeModule &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
    Platform.OS !== 'web' &&
    (Platform.OS !== 'android' || Boolean(googleMapsApiKey));

  function updateSelectedCoordinate(coordinate: Coordinate) {
    setSelectedCoordinate(coordinate);
    setMapRegion((region) => ({
      ...region,
      ...coordinate,
    }));
  }

  function handleBirthPlaceChange(value: string) {
    setBirthPlace(value);
    setHasSelectedSuggestion(false);
    setPlacesError('');
  }

  async function selectPlaceSuggestion(suggestion: PlaceSuggestion) {
    if (!googlePlacesApiKey) {
      return;
    }

    setBirthPlace(suggestion.description);
    setHasSelectedSuggestion(true);
    setPlaceSuggestions([]);

    try {
      setIsFetchingPlaces(true);
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${[
          `place_id=${encodeURIComponent(suggestion.placeId)}`,
          `key=${encodeURIComponent(googlePlacesApiKey)}`,
          `sessiontoken=${encodeURIComponent(placesSessionTokenRef.current)}`,
          'fields=formatted_address,geometry,utc_offset',
        ].join('&')}`
      );
      const data = (await response.json()) as {
        status?: string;
        result?: {
          formatted_address?: string;
          utc_offset?: number;
          geometry?: {
            location?: {
              lat: number;
              lng: number;
            };
          };
        };
      };
      const location = data.result?.geometry?.location;

      if (data.status !== 'OK' || !location) {
        return;
      }

      const nextCoordinate = {
        latitude: location.lat,
        longitude: location.lng,
      };

      setBirthPlace(data.result?.formatted_address || suggestion.description);
      setSelectedCoordinate(nextCoordinate);
      setMapRegion({
        ...nextCoordinate,
        latitudeDelta: SELECTED_PLACE_MAP_DELTA,
        longitudeDelta: SELECTED_PLACE_MAP_DELTA,
      });

      if (typeof data.result?.utc_offset === 'number') {
        setBirthTimezone(String(data.result.utc_offset / 60));
      }

      placesSessionTokenRef.current = createPlacesSessionToken();
    } catch (error) {
      if (__DEV__) {
        console.info('Google Place details lookup failed.', error);
      }
    } finally {
      setIsFetchingPlaces(false);
    }
  }

  async function handleContinue() {
    if (!isFormValid || isServiceBusy) {
      return;
    }

    setErrorMessage('');

    await updateProfile({
      birthPlace: birthPlace.trim(),
      birthLatitude: selectedCoordinate.latitude.toFixed(6),
      birthLongitude: selectedCoordinate.longitude.toFixed(6),
      birthTimezone: birthTimezone.trim(),
      kundliStatus: 'pending',
    });

    try {
      await generateKundli();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Kundli generation failed.';
      setErrorMessage(message);
    }

    router.push('/(onboarding)/cosmic-chart');
  }

  function zoomMap(multiplier: number) {
    setMapRegion((region) => ({
      ...region,
      latitudeDelta: Math.min(Math.max(region.latitudeDelta * multiplier, MIN_MAP_DELTA), MAX_MAP_DELTA),
      longitudeDelta: Math.min(Math.max(region.longitudeDelta * multiplier, MIN_MAP_DELTA), MAX_MAP_DELTA),
    }));
  }

  return (
    <OnboardingStep
      step="birth-location"
      title="Where were you born?"
      subtitle="Used only to calculate your Kundli. It never appears on your profile."
      onContinue={handleContinue}
      continueLabel={isServiceBusy ? 'Generating your Kundli' : 'Generate my Kundli'}
      canContinue={isFormValid}
      isBusy={isServiceBusy}
      error={errorMessage}>
      <View style={styles.section}>
        <TextField
          label="Place of birth"
          value={birthPlace}
          onChangeText={handleBirthPlaceChange}
          placeholder="City, country"
          autoCapitalize="words"
          returnKeyType="next"
          error={placesError || null}
          leading={<Ionicons name="search" size={18} color={colors.textFaint} />}
          trailing={isFetchingPlaces ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        />
        {placeSuggestions.length > 0 ? (
          <View style={styles.suggestionList}>
            {placeSuggestions.map((suggestion, index) => (
              <Pressable
                key={suggestion.placeId}
                style={({ pressed }) => [
                  styles.suggestionItem,
                  index > 0 && styles.suggestionDivider,
                  pressed && styles.suggestionPressed,
                ]}
                onPress={() => selectPlaceSuggestion(suggestion)}>
                <Ionicons name="location-outline" size={18} color={colors.accent} />
                <AppText variant="callout" style={styles.suggestionText}>
                  {suggestion.description}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <AppText variant="overline" color={colors.textMuted}>
            Pin on map
          </AppText>
          <AppText variant="caption" color={colors.textFaint}>
            {selectedCoordinate.latitude.toFixed(4)}, {selectedCoordinate.longitude.toFixed(4)}
          </AppText>
        </View>
        <View style={styles.mapShell}>
          {canRenderMap ? (
            <>
              <BirthLocationMap
                style={styles.map}
                region={mapRegion}
                coordinate={selectedCoordinate}
                markerTitle={birthPlace.trim() || 'Birth location'}
                onCoordinateChange={updateSelectedCoordinate}
              />
              <View style={styles.mapControls}>
                <IconButton icon="remove" variant="glass" size={36} accessibilityLabel="Zoom out map" onPress={() => zoomMap(2)} />
                <IconButton icon="add" variant="glass" size={36} accessibilityLabel="Zoom in map" onPress={() => zoomMap(0.5)} />
              </View>
            </>
          ) : (
            <View style={styles.mapFallback}>
              <Ionicons name="map-outline" size={26} color={colors.textFaint} />
              <AppText variant="footnote" color={colors.textMuted}>
                Map unavailable in this build.
              </AppText>
            </View>
          )}
        </View>
        <AppText variant="footnote" color={colors.textFaint}>
          Tap the map to fine-tune the exact spot.
        </AppText>
      </View>

      <TextField
        label="Timezone (UTC offset)"
        value={birthTimezone}
        onChangeText={setBirthTimezone}
        placeholder="5.5"
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
        hint="Hours from UTC, e.g. 5.5 for India. Filled in automatically when you pick a place."
      />
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestionList: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  suggestionDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  suggestionPressed: {
    backgroundColor: colors.surfaceRaised,
  },
  suggestionText: {
    flex: 1,
  },
  mapShell: {
    height: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  map: {
    flex: 1,
  },
  mapControls: {
    position: 'absolute',
    right: space.sm,
    bottom: space.sm,
    gap: space.xs,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
});
