import { Ionicons } from '@expo/vector-icons';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { BirthLocationMap } from '@/components/birth-location-map';
import { OnboardingStep } from '@/components/onboarding-step';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { TextField } from '@/components/ui/text-field';
import { WheelPicker } from '@/components/ui/wheel-picker';
import { colors, fontFamily, radius, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';
import { formatUtcOffset, isNumericOffset, MANUAL_OFFSETS, offsetForLocalTime, zoneForCoordinate } from '@/lib/timezone';
import { geocoder, type PlaceResult } from '@/services/geocoding';

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const hasExpoMapsNativeModule =
  Platform.OS === 'web' || Boolean(requireOptionalNativeModule('ExpoMaps'));

const DEFAULT_BIRTH_COORDINATE = {
  latitude: 28.6139,
  longitude: 77.209,
};

const MIN_MAP_DELTA = 0.01;
const MAX_MAP_DELTA = 80;
const SELECTED_PLACE_MAP_DELTA = 0.25;
/** Wait for a pause in typing before searching: keeps us well inside Photon's fair use. */
const SEARCH_DEBOUNCE_MS = 400;
const OFFSET_OPTIONS = MANUAL_OFFSETS.map((hours) => ({ value: String(hours), label: formatUtcOffset(hours) }));

type Coordinate = {
  latitude: number;
  longitude: number;
};

type Region = Coordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};

function getInitialCoordinate(latitude: string, longitude: string): Coordinate {
  // Number('') is 0, which would drop new users' pin in the Atlantic at 0,0.
  if (!latitude.trim() || !longitude.trim()) {
    return DEFAULT_BIRTH_COORDINATE;
  }
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

export default function BirthLocationScreen() {
  const { profile, updateProfile, generateKundli, isServiceBusy } = useAppData();
  const initialCoordinate = useMemo(
    () => getInitialCoordinate(profile.birthLatitude, profile.birthLongitude),
    [profile.birthLatitude, profile.birthLongitude]
  );
  const [birthPlace, setBirthPlace] = useState(profile.birthPlace);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceResult[]>([]);
  const [isFetchingPlaces, setIsFetchingPlaces] = useState(false);
  const [placesError, setPlacesError] = useState('');
  const [hasSelectedSuggestion, setHasSelectedSuggestion] = useState(Boolean(profile.birthPlace));
  const [selectedCoordinate, setSelectedCoordinate] = useState<Coordinate>(initialCoordinate);
  const [mapRegion, setMapRegion] = useState<Region>(() => coordinateToRegion(initialCoordinate));
  // The timezone normally comes from the pin; a manual UTC offset is the fallback for spots where
  // it can't be detected (and older profiles that stored one).
  const [manualOffset, setManualOffset] = useState<string | null>(() =>
    isNumericOffset(profile.birthTimezone) ? profile.birthTimezone.trim() : null
  );
  const [isOffsetPickerOpen, setIsOffsetPickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const detectedZone = useMemo(
    () => zoneForCoordinate(selectedCoordinate.latitude, selectedCoordinate.longitude),
    [selectedCoordinate.latitude, selectedCoordinate.longitude]
  );
  const birthTimezone = manualOffset ?? detectedZone;
  const hasBirthMoment = Boolean(profile.dateOfBirth && profile.timeOfBirth);
  const previewOffset = useMemo(() => {
    if (manualOffset) {
      return Number(manualOffset);
    }
    if (!detectedZone) {
      return null;
    }
    if (hasBirthMoment) {
      return offsetForLocalTime(detectedZone, profile.dateOfBirth, profile.timeOfBirth);
    }
    const now = new Date();
    return offsetForLocalTime(detectedZone, now.toISOString().slice(0, 10), `${now.getUTCHours()}:${now.getUTCMinutes()}`);
  }, [detectedZone, hasBirthMoment, manualOffset, profile.dateOfBirth, profile.timeOfBirth]);

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
    const query = birthPlace.trim();

    if (query.length < 3 || hasSelectedSuggestion) {
      setPlaceSuggestions([]);
      setPlacesError('');
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setIsFetchingPlaces(true);
        const results = await geocoder.search(query, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setPlacesError(results.length === 0 ? 'No matching places. Try the nearest town or city.' : '');
        setPlaceSuggestions(results);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        if (__DEV__) {
          console.info('Place search failed.', error);
        }
        setPlaceSuggestions([]);
        setPlacesError('Place search is unavailable right now. Drop a pin on the map instead.');
      } finally {
        if (!controller.signal.aborted) {
          setIsFetchingPlaces(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
      setIsFetchingPlaces(false);
    };
  }, [birthPlace, hasSelectedSuggestion]);

  const isFormValid = useMemo(
    () =>
      Boolean(birthPlace.trim()) &&
      selectedCoordinate.latitude >= -90 &&
      selectedCoordinate.latitude <= 90 &&
      selectedCoordinate.longitude >= -180 &&
      selectedCoordinate.longitude <= 180 &&
      Boolean(birthTimezone),
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

  /** A pin moved by hand: detect the timezone afresh for the new spot. */
  function handleMapCoordinateChange(coordinate: Coordinate) {
    updateSelectedCoordinate(coordinate);
    setManualOffset(null);
    setIsOffsetPickerOpen(false);
  }

  function handleBirthPlaceChange(value: string) {
    setBirthPlace(value);
    setHasSelectedSuggestion(false);
    setPlacesError('');
  }

  function selectPlaceSuggestion(place: PlaceResult) {
    const nextCoordinate = { latitude: place.latitude, longitude: place.longitude };
    setBirthPlace(place.label);
    setHasSelectedSuggestion(true);
    setPlaceSuggestions([]);
    setSelectedCoordinate(nextCoordinate);
    setMapRegion({
      ...nextCoordinate,
      latitudeDelta: SELECTED_PLACE_MAP_DELTA,
      longitudeDelta: SELECTED_PLACE_MAP_DELTA,
    });
    setManualOffset(null);
    setIsOffsetPickerOpen(false);
  }

  async function handleContinue() {
    if (!isFormValid || !birthTimezone || isServiceBusy) {
      return;
    }

    setErrorMessage('');

    await updateProfile({
      birthPlace: birthPlace.trim(),
      birthLatitude: selectedCoordinate.latitude.toFixed(6),
      birthLongitude: selectedCoordinate.longitude.toFixed(6),
      birthTimezone,
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
                key={suggestion.id}
                style={({ pressed }) => [
                  styles.suggestionItem,
                  index > 0 && styles.suggestionDivider,
                  pressed && styles.suggestionPressed,
                ]}
                onPress={() => selectPlaceSuggestion(suggestion)}>
                <Ionicons name="location-outline" size={18} color={colors.accent} />
                <AppText variant="callout" style={styles.suggestionText}>
                  {suggestion.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
        {!placesError ? (
          <AppText variant="caption" color={colors.textFaint}>
            {geocoder.attribution}
          </AppText>
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
                onCoordinateChange={handleMapCoordinateChange}
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

      <View style={styles.section}>
        <View style={styles.timezoneCard}>
          <View style={styles.timezoneIcon}>
            <Ionicons name="time-outline" size={18} color={colors.accent} />
          </View>
          <View style={styles.timezoneText}>
            <AppText variant="overline" color={colors.textMuted}>
              Timezone
            </AppText>
            <AppText variant="bodyStrong">
              {manualOffset
                ? `${formatUtcOffset(Number(manualOffset))}, set manually`
                : detectedZone
                  ? detectedZone.replace(/_/g, ' ')
                  : 'Couldn’t detect for this spot'}
            </AppText>
            <AppText variant="footnote" color={colors.textMuted}>
              {manualOffset
                ? 'Used as chosen. Pick a place to detect it automatically.'
                : detectedZone && previewOffset !== null
                  ? `${formatUtcOffset(previewOffset)} ${hasBirthMoment ? 'at your time of birth' : 'today'} · detected from your birthplace`
                  : detectedZone
                    ? 'Detected from your birthplace'
                    : 'Move the pin onto land, or set the UTC offset yourself.'}
            </AppText>
          </View>
        </View>
        <View style={styles.timezoneActions}>
          <Button
            label={isOffsetPickerOpen ? 'Done' : manualOffset ? 'Change offset' : 'Set offset manually'}
            variant="ghost"
            size="sm"
            fullWidth={false}
            onPress={() => {
              if (!isOffsetPickerOpen && !manualOffset) {
                setManualOffset(String(previewOffset ?? 5.5));
              }
              setIsOffsetPickerOpen((open) => !open);
            }}
          />
          {manualOffset && detectedZone ? (
            <Button
              label="Use detected timezone"
              variant="ghost"
              size="sm"
              fullWidth={false}
              onPress={() => {
                setManualOffset(null);
                setIsOffsetPickerOpen(false);
              }}
            />
          ) : null}
        </View>
        {isOffsetPickerOpen ? (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.offsetPicker}>
            <WheelPicker
              data={OFFSET_OPTIONS}
              value={manualOffset ?? '5.5'}
              itemHeight={44}
              visibleItemCount={5}
              enableScrollByTapOnItem
              onValueChanged={setManualOffset}
              width="100%"
              itemTextStyle={styles.offsetText}
              overlayItemStyle={styles.offsetSelection}
            />
          </Animated.View>
        ) : null}
      </View>
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
  timezoneCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  timezoneIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  timezoneText: {
    flex: 1,
    gap: 2,
  },
  timezoneActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  offsetPicker: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  offsetText: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 18,
    color: colors.text,
  },
  offsetSelection: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
  },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
});
