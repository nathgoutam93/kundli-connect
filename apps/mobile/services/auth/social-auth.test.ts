import * as WebBrowser from 'expo-web-browser';

import { createBrowserOAuthAdapter } from '@/services/auth/browser-oauth-adapter';
import { createGoogleNativeAdapter } from '@/services/auth/google-native-adapter';
import { parseEnabledProviders, signInWithSocialProvider, type SocialAuthAdapter } from '@/services/auth';
import { ensureCurrentUserProfile } from '@/services/supabase-auth-service';

const mockAuth = {
  signInWithOAuth: jest.fn(),
  exchangeCodeForSession: jest.fn(),
  signInWithIdToken: jest.fn(),
  getSession: jest.fn(),
};
const mockUpsert = jest.fn();

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => ({ auth: mockAuth, from: () => ({ upsert: mockUpsert }) }),
}));
jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-notifications', () => ({}));
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `kundalikonnect://${path}`,
  parse: (url: string) => ({
    queryParams: Object.fromEntries(new URL(url.replace(/^[a-z]+:\/\//, 'https://app/')).searchParams),
  }),
}));

const openAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://project.supabase.co/auth/v1/authorize?provider=google' }, error: null });
  mockAuth.exchangeCodeForSession.mockResolvedValue({ error: null });
});

describe('browser OAuth adapter', () => {
  it('opens the provider in an auth session and exchanges the returned code', async () => {
    openAuthSession.mockResolvedValue({ type: 'success', url: 'kundalikonnect://auth/callback?code=abc123' });

    const result = await createBrowserOAuthAdapter('google').signIn();

    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'kundalikonnect://auth/callback', skipBrowserRedirect: true },
    });
    expect(openAuthSession).toHaveBeenCalledWith(expect.stringContaining('provider=google'), 'kundalikonnect://auth/callback');
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('abc123');
    expect(result).toEqual({ status: 'success' });
  });

  it('treats a closed browser or a denied consent screen as cancelled', async () => {
    openAuthSession.mockResolvedValueOnce({ type: 'cancel' });
    expect(await createBrowserOAuthAdapter('facebook').signIn()).toEqual({ status: 'cancelled' });

    openAuthSession.mockResolvedValueOnce({
      type: 'success',
      url: 'kundalikonnect://auth/callback?error=access_denied&error_description=User+denied+access',
    });
    expect(await createBrowserOAuthAdapter('facebook').signIn()).toEqual({ status: 'cancelled' });
    expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it('reports provider and exchange errors', async () => {
    mockAuth.signInWithOAuth.mockResolvedValueOnce({ data: { url: null }, error: { message: 'Provider is not enabled' } });
    expect(await createBrowserOAuthAdapter('google').signIn()).toEqual({ status: 'failed', reason: 'Provider is not enabled' });

    openAuthSession.mockResolvedValueOnce({ type: 'success', url: 'kundalikonnect://auth/callback?code=used' });
    mockAuth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: 'invalid flow state' } });
    expect(await createBrowserOAuthAdapter('google').signIn()).toEqual({ status: 'failed', reason: 'invalid flow state' });
  });
});

describe('native Google adapter', () => {
  const sdk = () => ({ configure: jest.fn(), hasPlayServices: jest.fn(async () => true), signIn: jest.fn() });

  it('signs in to Supabase with the Google ID token (current and legacy SDK shapes)', async () => {
    mockAuth.signInWithIdToken.mockResolvedValue({ error: null });
    const google = sdk();
    const adapter = createGoogleNativeAdapter(google, { webClientId: 'web-id' });

    google.signIn.mockResolvedValueOnce({ type: 'success', data: { idToken: 'token-v13' } });
    expect(await adapter.signIn()).toEqual({ status: 'success' });
    google.signIn.mockResolvedValueOnce({ idToken: 'token-legacy' });
    expect(await adapter.signIn()).toEqual({ status: 'success' });

    expect(google.configure).toHaveBeenCalledTimes(1);
    expect(mockAuth.signInWithIdToken).toHaveBeenNthCalledWith(1, { provider: 'google', token: 'token-v13' });
    expect(mockAuth.signInWithIdToken).toHaveBeenNthCalledWith(2, { provider: 'google', token: 'token-legacy' });
  });

  it('maps both cancellation styles to cancelled', async () => {
    const google = sdk();
    const adapter = createGoogleNativeAdapter(google, { webClientId: 'web-id' });

    google.signIn.mockResolvedValueOnce({ type: 'cancelled', data: null });
    expect(await adapter.signIn()).toEqual({ status: 'cancelled' });
    google.signIn.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code: 'SIGN_IN_CANCELLED' }));
    expect(await adapter.signIn()).toEqual({ status: 'cancelled' });
    expect(mockAuth.signInWithIdToken).not.toHaveBeenCalled();
  });
});

describe('provider configuration', () => {
  it('only enables known providers listed in the env var', () => {
    expect(parseEnabledProviders(undefined)).toEqual([]);
    expect(parseEnabledProviders(' Facebook, google ,twitter')).toEqual(['google', 'facebook']);
  });

  it('turns adapter exceptions into a failed result', async () => {
    const throwing: SocialAuthAdapter = { provider: 'google', signIn: jest.fn(async () => Promise.reject(new Error('boom'))) };
    const adapters = { google: throwing, facebook: throwing, apple: throwing };
    expect(await signInWithSocialProvider('google', adapters)).toEqual({ status: 'failed', reason: 'boom' });
  });
});

describe('profile creation after social sign-in', () => {
  const user = { id: 'user-1', email: 'asha@example.com', user_metadata: { full_name: ' Asha Rao ' } };

  beforeEach(() => {
    mockAuth.getSession.mockResolvedValue({ data: { session: { user } }, error: null });
  });

  it('prefills name and email from the provider', async () => {
    mockUpsert.mockResolvedValue({ error: null });
    await ensureCurrentUserProfile();
    expect(mockUpsert).toHaveBeenCalledWith(
      { id: 'user-1', email: 'asha@example.com', display_name: 'Asha Rao' },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  });

  it('preserves contact information without reserving an email identity', async () => {
    mockUpsert.mockResolvedValueOnce({ error: null });
    await ensureCurrentUserProfile();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenLastCalledWith(
      { id: 'user-1', email: 'asha@example.com', display_name: 'Asha Rao' },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  });
});
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
