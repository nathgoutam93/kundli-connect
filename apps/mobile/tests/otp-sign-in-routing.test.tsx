import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { useSyncExternalStore } from 'react';
import { Text } from 'react-native';

import AuthLayout from '@/app/(auth)/_layout';
import PhoneScreen from '@/app/(auth)/phone';
import Index from '@/app/index';

// One shared store stands in for the auth session and profile query, so every screen and layout
// re-renders together the way they do when Supabase emits SIGNED_IN.
type AppState = { user: { id: string } | null; profilePending: boolean; onboarded: boolean };
let state: AppState = { user: null, profilePending: false, onboarded: false };
const listeners = new Set<() => void>();
function setState(next: Partial<AppState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}
const mockStore = {
  useAppState() {
    return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => state);
  },
};

let finishSignIn: (onboarded?: boolean) => void = () => undefined;
const mockCompleteOtpLogin = jest.fn(
  () =>
    new Promise<void>((resolve) => {
      // verifyOtp succeeded: the session arrives and the cache is cleared, so the profile reloads.
      setState({ user: { id: 'me' }, profilePending: true });
      finishSignIn = (onboarded = true) => {
        setState({ profilePending: false, onboarded });
        resolve();
      };
    })
);

jest.mock('@/hooks/use-app-data', () => ({
  useAppData: () => {
    const current = mockStore.useAppState();
    return {
      isHydrated: !(current.user && current.profilePending),
      isAuthenticated: Boolean(current.user),
      hasCompletedOnboarding: current.onboarded,
      profileError: null,
      refreshProfile: jest.fn(),
      completeOtpLogin: mockCompleteOtpLogin,
      requestOtp: jest.fn(async () => undefined),
      setPhoneNumber: jest.fn(),
      isServiceBusy: false,
      serviceError: null,
      profile: { phoneNumber: '' },
    };
  },
}));
jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => ({ isInitializing: false, user: mockStore.useAppState().user }),
}));
jest.mock('@/hooks/use-domain-data', () => ({
  useProfileQuery: () => {
    const current = mockStore.useAppState();
    return { isPending: Boolean(current.user) && current.profilePending, isError: false, data: { _onboardingCompleted: current.onboarded }, refetch: jest.fn() };
  },
}));
jest.mock('react-native-keyboard-controller', () => ({ KeyboardAvoidingView: require('react-native').View }));
jest.mock('@/components/ui/screen', () => ({ Screen: require('react-native').View }));
jest.mock('@/components/ui/screen-header', () => ({ ScreenHeader: () => null }));
jest.mock('@/components/ui/button', () => ({
  Button: ({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) => {
    const { Pressable, Text } = require('react-native');
    return <Pressable onPress={disabled ? undefined : onPress}><Text>{label}</Text></Pressable>;
  },
}));
jest.mock('@/components/ui/text-field', () => {
  const { forwardRef } = require('react');
  const { TextInput } = require('react-native');
  return { TextField: forwardRef(function MockTextField(props: object, ref: unknown) { return <TextInput ref={ref} {...props} />; }) };
});
jest.mock('react-native-country-picker-modal', () => () => null);
jest.mock('@/components/ui/loader', () => ({ FullScreenLoader: () => { const { Text } = require('react-native'); return <Text>Loading</Text>; } }));

beforeEach(() => {
  state = { user: null, profilePending: false, onboarded: false };
  mockCompleteOtpLogin.mockClear();
});

const routes = {
  index: Index,
  '(auth)/_layout': AuthLayout,
  '(auth)/phone': PhoneScreen,
  '(tabs)/index': () => <Text>Discover</Text>,
  '(onboarding)/basics': () => <Text>Onboarding</Text>,
};

async function enterCode() {
  fireEvent.changeText(screen.getByPlaceholderText('Phone number'), '9876543210');
  await act(async () => { fireEvent.press(screen.getByText('Send code')); });
  await act(async () => { fireEvent.changeText(screen.getByDisplayValue(''), '123456'); });
}

test('a returning user lands on Discover after the code is accepted, without tearing down the sign-in screen', async () => {
  const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  renderRouter(routes, { initialUrl: '/phone' });
  await enterCode();
  expect(mockCompleteOtpLogin).toHaveBeenCalledTimes(1);

  // The session has arrived but the profile is still loading: the phone screen stays mounted
  // with its spinner instead of the whole auth navigator being swapped for a loader.
  expect(screen.getByText('Verifying code')).toBeTruthy();
  expect(screen.queryByText('Loading')).toBeNull();

  await act(async () => { finishSignIn(true); });
  expect(await screen.findByText('Discover')).toBeTruthy();
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

test('a new user goes to onboarding once their profile has loaded', async () => {
  renderRouter(routes, { initialUrl: '/phone' });
  await enterCode();
  await act(async () => { finishSignIn(false); });
  expect(await screen.findByText('Onboarding')).toBeTruthy();
});

test('a wrong code keeps the user on the code screen with an error', async () => {
  mockCompleteOtpLogin.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('Token has expired or is invalid'), { status: 403 })));
  renderRouter(routes, { initialUrl: '/phone' });
  await enterCode();
  expect(screen.getByText('Enter the code we sent')).toBeTruthy();
  expect(screen.queryByText('Verifying code')).toBeNull();
  expect(screen.queryByText('Discover')).toBeNull();
});
