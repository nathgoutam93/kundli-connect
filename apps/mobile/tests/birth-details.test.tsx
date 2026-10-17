import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';

import BirthLocationScreen from '@/app/(onboarding)/birth-location';
import KundliDetailsScreen from '@/app/(onboarding)/kundli-details';
import { DEFAULT_PROFILE } from '@/constants/mock-data';
import { geocoder } from '@/services/geocoding';

const mockUpdate = jest.fn(async () => undefined);
const mockGenerate = jest.fn(async () => undefined);
const mockData = { profile: { ...DEFAULT_PROFILE }, updateProfile: mockUpdate, generateKundli: mockGenerate, isServiceBusy: false };
jest.mock('@/hooks/use-app-data', () => ({ useAppData: () => mockData }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-location', () => ({
  PermissionStatus: { GRANTED: 'granted' },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getLastKnownPositionAsync: jest.fn(async () => null),
}));
jest.mock('expo-modules-core', () => ({ ...jest.requireActual('expo-modules-core'), requireOptionalNativeModule: () => null }));
jest.mock('@/services/geocoding', () => ({ geocoder: { search: jest.fn() } }));
jest.mock('@/lib/timezone', () => ({
  isNumericOffset: () => false, zoneForCoordinate: () => 'Asia/Kolkata', offsetForLocalTime: () => 5.5,
  MANUAL_OFFSETS: [5.5], formatUtcOffset: () => '+05:30',
}));
jest.mock('@/components/onboarding-step', () => ({
  OnboardingStep: ({ children, canContinue, onContinue }: { children: React.ReactNode; canContinue: boolean; onContinue: () => void }) => {
    const { View, Button } = require('react-native');
    return <View>{children}<Button title="Continue" disabled={!canContinue} onPress={onContinue} /></View>;
  },
}));
jest.mock('@/components/ui/button', () => ({ Button: ({ label, ...props }: { label: string }) => {
  const { Button } = require('react-native'); return <Button title={label} {...props} />;
} }));
jest.mock('@/components/ui/text-field', () => ({ TextField: (props: object) => {
  const { TextInput } = require('react-native'); return <TextInput testID="place-input" {...props} />;
} }));
jest.mock('@/components/ui/bottom-sheet', () => ({ BottomSheet: () => null }));
jest.mock('@/components/ui/wheel-picker', () => ({ WheelPicker: () => null }));
jest.mock('@/components/ui/icon-button', () => ({ IconButton: () => null }));
jest.mock('@/components/birth-location-map', () => ({ BirthLocationMap: () => null }));

beforeEach(() => {
  mockData.profile = { ...DEFAULT_PROFILE };
  mockUpdate.mockClear();
  mockGenerate.mockClear();
});

test('picker defaults require explicit confirmation of both date and time', async () => {
  const screen = render(<KundliDetailsScreen />);
  fireEvent.press(screen.getByText('Continue'));
  expect(mockUpdate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Confirm 01 Jan 2000'));
  fireEvent.press(screen.getByText('Continue'));
  expect(mockUpdate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Confirm 00:00:00'));
  await act(async () => { fireEvent.press(screen.getByText('Continue')); });
  expect(mockUpdate).toHaveBeenCalledWith({ dateOfBirth: '01-01-2000', timeOfBirth: '00:00:00' });
});

test('typing a city cannot save device coordinates as its birthplace', () => {
  const screen = render(<BirthLocationScreen />);
  fireEvent.changeText(screen.getByTestId('place-input'), 'Mumbai');
  fireEvent.press(screen.getByText('Continue'));
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('a delayed device location cannot replace a selected suggestion', async () => {
  let resolveLocation!: () => void;
  jest.mocked(Location.getLastKnownPositionAsync).mockImplementationOnce(() => new Promise((resolve) => {
    resolveLocation = () => resolve({ timestamp: Date.now(), coords: {
      latitude: 22.5726, longitude: 88.3639, altitude: null, accuracy: 1, altitudeAccuracy: null, heading: null, speed: null,
    } });
  }));
  jest.mocked(geocoder.search).mockResolvedValue([{ id: 'mumbai', label: 'Mumbai, India', latitude: 19.076, longitude: 72.8777 }]);
  const screen = render(<BirthLocationScreen />);
  await waitFor(() => expect(resolveLocation).toBeDefined());
  fireEvent.changeText(screen.getByTestId('place-input'), 'Mumbai');
  fireEvent.press(await screen.findByText('Mumbai, India'));
  await act(async () => { resolveLocation(); });
  await act(async () => { fireEvent.press(screen.getByText('Continue')); });
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ birthPlace: 'Mumbai, India', birthLatitude: '19.076000', birthLongitude: '72.877700' }));
});

test('revisiting preserves saved coordinates without requesting device location', async () => {
  mockData.profile = { ...DEFAULT_PROFILE, birthPlace: 'Mumbai, India', birthLatitude: '19.076', birthLongitude: '72.8777', birthTimezone: 'Asia/Kolkata' };
  jest.mocked(Location.requestForegroundPermissionsAsync).mockClear();
  const screen = render(<BirthLocationScreen />);
  await act(async () => { fireEvent.press(screen.getByText('Continue')); });
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ birthLatitude: '19.076000', birthLongitude: '72.877700' }));
});
