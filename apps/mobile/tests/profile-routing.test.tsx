import { render } from '@testing-library/react-native';

import Index from '@/app/index';

const mockAuth = { isInitializing: false, user: { id: 'me' } as { id: string } | null };
const mockProfile = { isPending: false, isError: false, data: undefined as { _onboardingCompleted: boolean } | undefined };
jest.mock('@/providers/auth-provider', () => ({ useAuth: () => mockAuth }));
jest.mock('@/hooks/use-domain-data', () => ({ useProfileQuery: () => mockProfile }));
jest.mock('@/components/ui/loader', () => ({ FullScreenLoader: () => null }));
jest.mock('@/components/profile-load-error', () => ({
  ProfileLoadError: () => { const { Text } = require('react-native'); return <Text>Retry profile load</Text>; },
}));
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => { const { Text } = require('react-native'); return <Text>{href}</Text>; },
}));

test('a failed startup profile load offers retry instead of entering onboarding', () => {
  mockProfile.isError = true;
  const screen = render(<Index />);
  expect(screen.getByText('Retry profile load')).toBeTruthy();
  expect(screen.queryByText('/(onboarding)/basics')).toBeNull();
});

test('a successful profile result determines whether onboarding is needed', () => {
  mockProfile.isError = false;
  mockProfile.data = { _onboardingCompleted: true };
  const screen = render(<Index />);
  expect(screen.getByText('/(tabs)')).toBeTruthy();
  mockProfile.data = { _onboardingCompleted: false };
  screen.rerender(<Index />);
  expect(screen.getByText('/(onboarding)/basics')).toBeTruthy();
});
