import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient } from '@/lib/supabase';

export type Registration = { userId: string; token: string; updatedAt?: string };
const activeKey = 'push-registration-v1';
const pendingKey = 'push-retirements-v1';
let pendingWrites = Promise.resolve();

function serialize<T>(work: () => Promise<T>) {
  const result = pendingWrites.then(work);
  pendingWrites = result.then(() => undefined, () => undefined);
  return result;
}

export function rememberPushRegistration(registration: Registration) {
  return serialize(() => AsyncStorage.setItem(activeKey, JSON.stringify(registration)));
}

async function appendRetirement(registration: Registration) {
  const pending = JSON.parse(await AsyncStorage.getItem(pendingKey) ?? '[]') as Registration[];
  if (!pending.some((entry) => entry.userId === registration.userId && entry.token === registration.token && entry.updatedAt === registration.updatedAt)) pending.push(registration);
  await AsyncStorage.setItem(pendingKey, JSON.stringify(pending));
}

export function queueRegistrationRetirement(registration: Registration) {
  return serialize(() => appendRetirement(registration));
}

export function queuePushRetirement() {
  return serialize(async () => {
    const stored = await AsyncStorage.getItem(activeKey);
    if (!stored) return null;
    const registration = JSON.parse(stored) as Registration;
    await appendRetirement(registration);
    await AsyncStorage.removeItem(activeKey);
    return registration;
  });
}

export function acknowledgePushRetirement(registration: Registration) {
  return serialize(async () => {
    const pending = JSON.parse(await AsyncStorage.getItem(pendingKey) ?? '[]') as Registration[];
    await AsyncStorage.setItem(pendingKey, JSON.stringify(pending.filter((entry) => entry.userId !== registration.userId || entry.token !== registration.token || entry.updatedAt !== registration.updatedAt)));
  });
}

/** Only the signed-in owner's queued tokens can be retired through RLS. Other devices are untouched. */
export async function reconcilePushRetirements(userId: string) {
  const pending = await serialize(async () => JSON.parse(await AsyncStorage.getItem(pendingKey) ?? '[]') as Registration[]);
  for (const registration of pending.filter((entry) => entry.userId === userId)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const { error } = await getSupabaseClient().rpc('retire_own_push_registration', {
        p_token: registration.token, p_updated_at: registration.updatedAt ?? null, p_expected_user_id: userId,
      }).abortSignal(controller.signal);
      if (error) throw error;
      await acknowledgePushRetirement(registration);
    } finally { clearTimeout(timeout); }
  }
}

/** Uses the captured session solely for cleanup; it never restores it to the client. */
export async function finishRemoteLogout(accessToken: string, registration: Registration | null) {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_KEY;
  if (!base || !key) return;
  const headers = { Authorization: `Bearer ${accessToken}`, apikey: key };
  const boundedFetch = async (url: URL, method: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try { return await fetch(url.toString(), { method, headers, signal: controller.signal }); }
    finally { clearTimeout(timeout); }
  };
  if (registration) {
    const url = new URL('/rest/v1/push_tokens', base);
    url.searchParams.set('user_id', `eq.${registration.userId}`);
    url.searchParams.set('token', `eq.${registration.token}`);
    if (registration.updatedAt) url.searchParams.set('updated_at', `eq.${registration.updatedAt}`);
    try {
      const response = await boundedFetch(url, 'DELETE');
      if (response.ok) await acknowledgePushRetirement(registration);
    } catch { /* The durable record is retried at the next sign-in for this account. */ }
  }
  try {
    await boundedFetch(new URL('/auth/v1/logout?scope=local', base), 'POST');
  } catch { /* Local credentials are already gone. */ }
}
