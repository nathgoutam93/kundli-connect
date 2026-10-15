import { AppleMaps, GoogleMaps } from 'expo-maps';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/constants/theme';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type Region = Coordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};

type BirthLocationMapProps = {
  style: StyleProp<ViewStyle>;
  region: Region;
  coordinate: Coordinate;
  markerTitle: string;
  onCoordinateChange: (coordinate: Coordinate) => void;
};

function regionToCameraPosition(region: Region) {
  return {
    coordinates: {
      latitude: region.latitude,
      longitude: region.longitude,
    },
    zoom: Math.max(1, Math.min(20, Math.log2(360 / region.longitudeDelta))),
  };
}

function hasCoordinate(coordinate: { latitude?: number; longitude?: number }): coordinate is Coordinate {
  return typeof coordinate.latitude === 'number' && typeof coordinate.longitude === 'number';
}

function getCameraKey(region: Region) {
  return [region.latitude, region.longitude, region.latitudeDelta, region.longitudeDelta].join(':');
}

function GoogleBirthLocationMap({
  style,
  region,
  coordinate,
  markerTitle,
  onCoordinateChange,
}: BirthLocationMapProps) {
  return (
    <GoogleMaps.View
      key={getCameraKey(region)}
      style={style}
      cameraPosition={regionToCameraPosition(region)}
      markers={[
        {
          id: 'birth-location',
          coordinates: coordinate,
          title: markerTitle,
        },
      ]}
      uiSettings={{
        scrollGesturesEnabled: true,
        zoomGesturesEnabled: true,
        zoomControlsEnabled: false,
      }}
      onMapClick={({ coordinates }) => {
        if (hasCoordinate(coordinates)) {
          onCoordinateChange(coordinates);
        }
      }}
    />
  );
}

function AppleBirthLocationMap({
  style,
  region,
  coordinate,
  markerTitle,
  onCoordinateChange,
}: BirthLocationMapProps) {
  return (
    <AppleMaps.View
      key={getCameraKey(region)}
      style={style}
      cameraPosition={regionToCameraPosition(region)}
      markers={[
        {
          id: 'birth-location',
          coordinates: coordinate,
          title: markerTitle,
          tintColor: colors.accent,
        },
      ]}
      onMapClick={({ coordinates }) => {
        if (hasCoordinate(coordinates)) {
          onCoordinateChange(coordinates);
        }
      }}
    />
  );
}

export function BirthLocationMap(props: BirthLocationMapProps) {
  return Platform.OS === 'ios' ? <AppleBirthLocationMap {...props} /> : <GoogleBirthLocationMap {...props} />;
}
