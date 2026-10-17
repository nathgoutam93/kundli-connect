import * as Notifications from 'expo-notifications';
import { waitFor } from '@testing-library/react-native';
import { registerCurrentUserPushToken, signOut } from './supabase-auth-service';
import { finishRemoteLogout, queueRegistrationRetirement } from './push-registration-cleanup';
jest.mock('./message-attempts', () => ({}));

let mockSession: { user: { id: string }; access_token: string } | null;
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: mockSession }, error: null }) }, rpc: mockRpc }),
  clearLocalAuthSession: async () => { mockSession = null; return 'old-access'; },
}));
jest.mock('./push-registration-cleanup', () => ({
  finishRemoteLogout: jest.fn(), queuePushRetirement: jest.fn().mockResolvedValue(null),
  rememberPushRegistration: jest.fn().mockResolvedValue(undefined),
  reconcilePushRetirements: jest.fn().mockResolvedValue(undefined),
  queueRegistrationRetirement: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  getExpoPushTokenAsync: jest.fn(), clearLastNotificationResponseAsync: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  mockSession = { user: { id: 'old-account' }, access_token: 'old-access' };
  jest.clearAllMocks();
  mockRpc.mockReset();
});

test('logout during native token lookup prevents a late registration', async () => {
  let release!: (value: Notifications.ExpoPushToken) => void;
  jest.mocked(Notifications.getExpoPushTokenAsync).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const registration = registerCurrentUserPushToken({ requestPermission: false });
  // Let permission and pending-cleanup reads reach the native token lookup.
  await waitFor(() => expect(release).toBeDefined());
  await signOut();
  release({ data: 'device-token', type: 'expo' });
  expect(await registration).toBeNull();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('logout during registration queues cleanup after the write finishes using the original session', async () => {
  let release!: (value: { error: null }) => void;
  jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValueOnce({ data: 'device-token', type: 'expo' });
  mockRpc.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  const registration = registerCurrentUserPushToken({ requestPermission: false });
  await waitFor(() => expect(release).toBeDefined());
  expect(mockRpc).toHaveBeenCalledWith('register_push_token_for_session', expect.objectContaining({ p_expected_user_id: 'old-account' }));
  await signOut();
  release({ error: null });
  expect(await registration).toBeNull();
  expect(queueRegistrationRetirement).toHaveBeenCalledWith({ userId: 'old-account', token: 'device-token', updatedAt: expect.any(String) });
  expect(finishRemoteLogout).toHaveBeenLastCalledWith('old-access', { userId: 'old-account', token: 'device-token', updatedAt: expect.any(String) });
});
