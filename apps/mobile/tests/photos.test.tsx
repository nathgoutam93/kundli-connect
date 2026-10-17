import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';

import PhotosScreen from '@/app/(onboarding)/photos';
import { DEFAULT_PROFILE } from '@/constants/mock-data';

const mockAdd = jest.fn();
const mockData = { profile: { ...DEFAULT_PROFILE }, addProfilePhotos: mockAdd, removeProfilePhoto: jest.fn(), isServiceBusy: false };
jest.mock('@/hooks/use-app-data', () => ({ useAppData: () => mockData }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('@/components/profile-image', () => ({ ProfileImage: () => null }));
jest.mock('@/components/ui/toast', () => ({ toast: { warning: jest.fn() } }));
jest.mock('@/components/onboarding-step', () => ({ OnboardingStep: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@/components/ui/button', () => ({ Button: ({ label, ...props }: { label: string }) => {
  const { Button } = require('react-native'); return <Button title={label} {...props} />;
} }));

test('a partial batch retains saved photos and retries only failed selections', async () => {
  mockData.profile = { ...DEFAULT_PROFILE };
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({ granted: true } as Awaited<ReturnType<typeof ImagePicker.requestMediaLibraryPermissionsAsync>>);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({ canceled: false, assets: [
    { uri: 'file://first.jpg', width: 100, height: 100 }, { uri: 'file://second.jpg', width: 100, height: 100 },
  ] });
  mockAdd.mockImplementationOnce(async () => {
    mockData.profile = { ...DEFAULT_PROFILE, photoUris: ['profile-photo://me/first.jpg'] };
    return [{ localUri: 'file://first.jpg', photoUri: 'profile-photo://me/first.jpg' }, { localUri: 'file://second.jpg', error: 'Offline' }];
  }).mockImplementationOnce(async () => {
    mockData.profile = { ...DEFAULT_PROFILE, photoUris: ['profile-photo://me/first.jpg','profile-photo://me/second.jpg'] };
    return [{ localUri: 'file://second.jpg', photoUri: 'profile-photo://me/second.jpg' }];
  });
  const screen = render(<PhotosScreen />);
  fireEvent.press(screen.getAllByLabelText('Add photo')[0]);
  fireEvent.press(await screen.findByText('Retry 1 failed photos'));
  await waitFor(() => expect(mockAdd).toHaveBeenCalledTimes(2));
  expect(mockAdd).toHaveBeenNthCalledWith(1,['file://first.jpg','file://second.jpg']);
  expect(mockAdd).toHaveBeenNthCalledWith(2,['file://second.jpg']);
  await waitFor(() => expect(screen.queryByText('Retry 1 failed photos')).toBeNull());
});
