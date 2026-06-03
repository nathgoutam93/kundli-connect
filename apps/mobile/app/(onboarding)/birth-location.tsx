import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, type MapPressEvent, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppState } from '@/store/use-app-state';

const googlePlacesApiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

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
  const { profile, updateProfile, generateKundli, isServiceBusy } = useAppState();
  const placesSessionTokenRef = useRef(createPlacesSessionToken());
  const initialCoordinate = useMemo(
    () => getInitialCoordinate(profile.birthLatitude, profile.birthLongitude),
    [profile.birthLatitude, profile.birthLongitude]
  );
  const [birthPlace, setBirthPlace] = useState(profile.birthPlace);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isFetchingPlaces, setIsFetchingPlaces] = useState(false);
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

        const location =
          (await Location.getLastKnownPositionAsync()) ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));

        if (!isMounted) {
          return;
        }

        updateSelectedCoordinate({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      } catch (error) {
        if (__DEV__) {
          console.info('Current location unavailable for birth location map; using fallback coordinate.', error);
        }
      }
    }

    loadCurrentLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!googlePlacesApiKey) {
      return;
    }

    const query = birthPlace.trim();

    if (query.length < 3 || hasSelectedSuggestion) {
      setPlaceSuggestions([]);
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
          status?: string;
          predictions?: { description: string; place_id: string }[];
        };

        if (!isMounted) {
          return;
        }

        if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
          setPlaceSuggestions([]);
          return;
        }

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

  function updateSelectedCoordinate(coordinate: Coordinate) {
    setSelectedCoordinate(coordinate);
    setMapRegion((region) => ({
      ...region,
      ...coordinate,
    }));
  }

  function handleMapPress(event: MapPressEvent) {
    updateSelectedCoordinate(event.nativeEvent.coordinate);
  }

  function handleBirthPlaceChange(value: string) {
    setBirthPlace(value);
    setHasSelectedSuggestion(false);
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={27} color="#111111" />
        </Pressable>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View>
            <Text style={styles.title}>Birth Location</Text>
            <Text style={styles.subtitle}>These coordinates are used only to generate your kundli.</Text>
          </View>

          <View style={styles.panel}>
            <View style={styles.section}>
              <Text style={styles.heading}>Place Of Birth</Text>
              <TextInput
                value={birthPlace}
                onChangeText={handleBirthPlaceChange}
                placeholder="City, Country"
                placeholderTextColor="#9C9CA4"
                style={styles.lineInput}
                autoCapitalize="words"
                returnKeyType="next"
              />
              {placeSuggestions.length > 0 ? (
                <View style={styles.suggestionList}>
                  {placeSuggestions.map((suggestion) => (
                    <Pressable
                      key={suggestion.placeId}
                      style={styles.suggestionItem}
                      onPress={() => selectPlaceSuggestion(suggestion)}>
                      <Ionicons name="location-outline" size={18} color="#6C5A30" />
                      <Text style={styles.suggestionText}>{suggestion.description}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {isFetchingPlaces ? <Text style={styles.lookupText}>Finding places...</Text> : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.heading}>Pick On Map</Text>
              <Text style={styles.subheading}>Tap the map or drag the pin to your birth location.</Text>
              <View style={styles.mapShell}>
                <MapView
                  style={styles.map}
                  region={mapRegion}
                  onRegionChangeComplete={setMapRegion}
                  zoomEnabled
                  scrollEnabled
                  onPress={handleMapPress}>
                  <Marker
                    coordinate={selectedCoordinate}
                    draggable
                    title={birthPlace.trim() || 'Birth location'}
                    onDragEnd={(event) => updateSelectedCoordinate(event.nativeEvent.coordinate)}
                  />
                </MapView>
                <View style={styles.mapControls}>
                  <Pressable
                    style={styles.mapControlButton}
                    accessibilityLabel="Zoom out map"
                    onPress={() => zoomMap(2)}>
                    <Ionicons name="remove" size={21} color="#2A2230" />
                  </Pressable>
                  <Pressable
                    style={styles.mapControlButton}
                    accessibilityLabel="Zoom in map"
                    onPress={() => zoomMap(0.5)}>
                    <Ionicons name="add" size={21} color="#2A2230" />
                  </Pressable>
                </View>
              </View>
              <View style={styles.coordinateSummary}>
                <Text style={styles.coordinateSummaryText}>
                  {selectedCoordinate.latitude.toFixed(4)}, {selectedCoordinate.longitude.toFixed(4)}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.heading}>Timezone</Text>
              <Text style={styles.subheading}>Use UTC offset in hours, for example 5.5 for India.</Text>
              <TextInput
                value={birthTimezone}
                onChangeText={setBirthTimezone}
                placeholder="5.5"
                placeholderTextColor="#9C9CA4"
                style={styles.lineInput}
                keyboardType="numbers-and-punctuation"
                returnKeyType="done"
              />
            </View>

            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          </View>
        </ScrollView>

        <Pressable
          style={[styles.nextButton, (!isFormValid || isServiceBusy) && styles.nextButtonDisabled]}
          onPress={handleContinue}
          disabled={!isFormValid || isServiceBusy}>
          {isServiceBusy ? (
            <Text style={styles.generatingText}>Generating</Text>
          ) : (
            <Ionicons name="chevron-forward" size={31} color="#FFFFFF" />
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  keyboardContainer: {
    flex: 1,
    paddingHorizontal: 26,
    paddingTop: 22,
    paddingBottom: 34,
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F2B53B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 13,
    elevation: 3,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    marginTop: 22,
    paddingBottom: 34,
    gap: 29,
  },
  title: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '600',
    color: '#070707',
  },
  subtitle: {
    marginTop: 8,
    maxWidth: 340,
    fontSize: 17,
    lineHeight: 23,
    color: '#92929A',
  },
  panel: {
    backgroundColor: '#FFFFFF',
    gap: 32,
  },
  section: {
    gap: 10,
  },
  heading: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '700',
    color: '#080808',
  },
  subheading: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: '#66666D',
  },
  lineInput: {
    minHeight: 54,
    fontSize: 23,
    lineHeight: 30,
    color: '#111111',
    borderBottomWidth: 1,
    borderBottomColor: '#373737',
    paddingVertical: 8,
  },
  suggestionList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EFE2BE',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  suggestionItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F4EDD9',
  },
  suggestionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: '#2A2230',
  },
  lookupText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    color: '#8A7A56',
  },
  mapShell: {
    height: 260,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#EFEFEF',
  },
  map: {
    flex: 1,
  },
  mapControls: {
    position: 'absolute',
    right: 12,
    top: 12,
    gap: 8,
  },
  mapControlButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 3,
  },
  coordinateSummary: {
    minHeight: 38,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E1E1E5',
  },
  coordinateSummaryText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: '#66666D',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 18,
    color: '#B42318',
  },
  nextButton: {
    alignSelf: 'flex-end',
    minWidth: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#FCAD00',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  nextButtonDisabled: {
    opacity: 0.45,
  },
  generatingText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
