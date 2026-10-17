import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY;

const memoryStorage = new Map<string, string>();
let clearingSession = false;
const authStorageKey = supabaseUrl ? `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token` : '';
const isSessionKey = (key: string) => key === authStorageKey || key.startsWith(`${authStorageKey}-`);

function warnSecureStoreFallback(operation: string, error: unknown) {
  if (__DEV__) {
    console.warn(`SecureStore ${operation} failed; using in-memory auth storage fallback.`, error);
  }
}

const safeAuthStorage = {
  getItem: async (key: string) => {
    if (clearingSession && isSessionKey(key)) return null;
    try {
      const value = await SecureStore.getItemAsync(key);
      return clearingSession && isSessionKey(key) ? null : value;
    } catch (error) {
      warnSecureStoreFallback('getItem', error);
      return memoryStorage.get(key) ?? null;
    }
  },
  setItem: async (key: string, value: string) => {
    // Ignore a refresh that was already running when logout began.
    if (clearingSession && isSessionKey(key)) return;
    memoryStorage.set(key, value);

    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      warnSecureStoreFallback('setItem', error);
    }
  },
  removeItem: async (key: string) => {
    memoryStorage.delete(key);

    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      warnSecureStoreFallback('removeItem', error);
    }
  },
};

let client: SupabaseClient | undefined;

export function getSupabaseClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Missing Supabase environment variables in apps/mobile/.env.');
  }

  client ??= createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      storage: safeAuthStorage,
      storageKey: authStorageKey,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // OAuth (Google/Facebook/Apple) returns a one-time code that is exchanged on-device
      // with a verifier kept in secure storage, instead of putting tokens in the redirect URL.
      flowType: 'pkce',
    },
  });

  return client;
}

/** Remove persisted credentials before calling the SDK, so it never refreshes/revokes over the network to log out. */
export async function clearLocalAuthSession() {
  const supabase = getSupabaseClient();
  const stored = await safeAuthStorage.getItem(authStorageKey);
  let accessToken: string | undefined;
  try { accessToken = stored ? JSON.parse(stored).access_token : undefined; } catch { /* Invalid sessions are removed too. */ }
  clearingSession = true;
  try {
    await supabase.auth.stopAutoRefresh();
    await Promise.all([authStorageKey, `${authStorageKey}-user`, `${authStorageKey}-code-verifier`].map((key) => safeAuthStorage.removeItem(key)));
    // The SDK reads an empty session and emits SIGNED_OUT through its public API.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  } finally {
    clearingSession = false;
    // Keep automatic refresh available for the next sign-in in this app process.
    await supabase.auth.startAutoRefresh();
  }
  return accessToken;
}
