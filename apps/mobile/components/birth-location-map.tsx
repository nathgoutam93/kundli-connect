import type { StyleProp, ViewStyle } from 'react-native';

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

export function BirthLocationMap(_props: BirthLocationMapProps) {
  return null;
}
