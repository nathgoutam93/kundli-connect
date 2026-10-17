import * as SecureStore from 'expo-secure-store';
import type { SupabaseClient } from '@supabase/supabase-js';
import { waitFor } from '@testing-library/react-native';

jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

const stored = new Map<string,string>();
const storageKey = 'sb-logout-test-auth-token';
let client: SupabaseClient;
let clearSession: typeof import('./supabase').clearLocalAuthSession;
let originalFetch: typeof fetch;
const offlineFetch = jest.fn().mockRejectedValue(new Error('Offline'));

beforeAll(async () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://logout-test.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => stored.get(key) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (key,value) => { stored.set(key,value); });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => { stored.delete(key); });
  stored.set(storageKey, JSON.stringify({ access_token: 'old-access', refresh_token: 'old-refresh', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'me' } }));
  originalFetch = global.fetch;
  global.fetch = offlineFetch;
  // Exercise the installed SDK's session lifecycle, not a mocked signOut implementation.
  const module = require('./supabase') as typeof import('./supabase');
  client = module.getSupabaseClient();
  clearSession = module.clearLocalAuthSession;
  await client.auth.getSession();
});

afterAll(async () => { await client?.auth.stopAutoRefresh(); global.fetch = originalFetch; });

test('offline logout clears persisted credentials, emits SIGNED_OUT and never calls the network', async () => {
  stored.set(`${storageKey}-code-verifier`, 'old-verifier');
  stored.set(`${storageKey}-user`, 'old-user');
  const events: string[] = [];
  const { data } = client.auth.onAuthStateChange((event) => { events.push(event); });
  expect((await client.auth.getSession()).data.session?.user.id).toBe('me');
  expect(await clearSession()).toBe('old-access');
  expect(stored.has(storageKey)).toBe(false);
  expect(stored.has(`${storageKey}-code-verifier`)).toBe(false);
  expect(stored.has(`${storageKey}-user`)).toBe(false);
  expect((await client.auth.getSession()).data.session).toBeNull();
  expect(events).toContain('SIGNED_OUT');
  expect(offlineFetch).not.toHaveBeenCalled();
  data.subscription.unsubscribe();
});

test('an expired persisted session can be removed without attempting an offline refresh', async () => {
  stored.set(storageKey, JSON.stringify({ access_token: 'expired-access', refresh_token: 'old-refresh', expires_at: 1, user: { id: 'me' } }));
  offlineFetch.mockClear();
  expect(await clearSession()).toBe('expired-access');
  expect((await client.auth.getSession()).data.session).toBeNull();
  expect(offlineFetch).not.toHaveBeenCalled();
});

test('a refresh already in flight cannot persist the session again after logout', async () => {
  stored.set(storageKey, JSON.stringify({ access_token: 'old-access', refresh_token: 'old-refresh', expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'me' } }));
  let release!: (response: Response) => void;
  offlineFetch.mockClear().mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; }));
  const refreshing = client.auth.refreshSession({ refresh_token: 'old-refresh' });
  await waitFor(() => expect(offlineFetch).toHaveBeenCalledTimes(1));
  const deleting = clearSession();
  await waitFor(() => expect(stored.has(storageKey)).toBe(false));
  release(new Response(JSON.stringify({ access_token: 'late-access', refresh_token: 'late-refresh', expires_in: 3600, token_type: 'bearer', user: { id: 'me' } }), { headers: { 'Content-Type': 'application/json' } }));
  await Promise.all([refreshing,deleting]);
  expect(stored.has(storageKey)).toBe(false);
  expect((await client.auth.getSession()).data.session).toBeNull();
  expect(offlineFetch).toHaveBeenCalledTimes(1);
});
