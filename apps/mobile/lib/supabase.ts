import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY;

const memoryStorage = new Map<string, string>();

function warnSecureStoreFallback(operation: string, error: unknown) {
  if (__DEV__) {
    console.warn(`SecureStore ${operation} failed; using in-memory auth storage fallback.`, error);
  }
}

const safeAuthStorage = {
  getItem: async (key: string) => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      warnSecureStoreFallback('getItem', error);
      return memoryStorage.get(key) ?? null;
    }
  },
  setItem: async (key: string, value: string) => {
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
