import AsyncStorage from '@react-native-async-storage/async-storage';
import { acknowledgePushRetirement, queuePushRetirement, reconcilePushRetirements, rememberPushRegistration } from './push-registration-cleanup';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
const mockFilters: [string,string][] = [];
const mockDelete = jest.fn();
jest.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ rpc: (_name: string, args: { p_expected_user_id: string; p_token: string; p_updated_at: string | null }) => {
  mockFilters.push(['user_id',args.p_expected_user_id],['token',args.p_token]);
  if (args.p_updated_at) mockFilters.push(['updated_at',args.p_updated_at]);
  return { abortSignal: () => mockDelete() };
} }) }));

beforeEach(async () => { await AsyncStorage.clear(); mockFilters.length = 0; mockDelete.mockReset().mockResolvedValue({ error: null }); });

test('retirement survives failures and retries only this installation and account', async () => {
  await rememberPushRegistration({ userId: 'old', token: 'this-device' });
  expect(await queuePushRetirement()).toEqual({ userId: 'old', token: 'this-device' });
  await reconcilePushRetirements('other');
  expect(mockDelete).not.toHaveBeenCalled();
  mockDelete.mockResolvedValueOnce({ error: new Error('Offline') });
  await expect(reconcilePushRetirements('old')).rejects.toThrow('Offline');
  await reconcilePushRetirements('old');
  expect(mockFilters).toEqual([['user_id','old'],['token','this-device'],['user_id','old'],['token','this-device']]);
  await reconcilePushRetirements('old');
  expect(mockDelete).toHaveBeenCalledTimes(2);
});

test('acknowledging an old cleanup cannot erase a newer account registration', async () => {
  const old = { userId: 'old', token: 'device' };
  const current = { userId: 'current', token: 'device' };
  await rememberPushRegistration(old);
  await queuePushRetirement();
  await rememberPushRegistration(current);
  await acknowledgePushRetirement(old);
  expect(await queuePushRetirement()).toEqual(current);
  await reconcilePushRetirements('current');
  expect(mockFilters).toEqual([['user_id','current'],['token','device']]);
});

test('a delayed retirement is scoped to its registration version after signing back in', async () => {
  await rememberPushRegistration({ userId: 'me', token: 'device', updatedAt: '2026-10-17T00:00:00Z' });
  await queuePushRetirement();
  await rememberPushRegistration({ userId: 'me', token: 'device', updatedAt: '2026-10-17T00:01:00Z' });
  await reconcilePushRetirements('me');
  expect(mockFilters).toEqual([['user_id','me'],['token','device'],['updated_at','2026-10-17T00:00:00Z']]);
  expect(await queuePushRetirement()).toMatchObject({ updatedAt: '2026-10-17T00:01:00Z' });
});
