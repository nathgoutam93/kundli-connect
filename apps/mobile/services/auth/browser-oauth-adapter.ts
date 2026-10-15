import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { getSupabaseClient } from '@/lib/supabase';

import type { SocialAuthAdapter, SocialProvider, SocialSignInResult } from './types';

// Completes a pending auth popup when the redirect lands back in a web build; no-op on native.
WebBrowser.maybeCompleteAuthSession();

/** Deep link Supabase redirects back to. Must be listed in Auth → URL Configuration. */
export const AUTH_CALLBACK_PATH = 'auth/callback';

export function getAuthRedirectUrl() {
  return Linking.createURL(AUTH_CALLBACK_PATH);
}

/**
 * Finishes an OAuth redirect: exchanges the PKCE `code` for a session, or reports the
 * provider's error. Shared by the adapter and the app/auth/callback route (used when the OS
 * delivers the redirect as a normal deep link instead of back to the auth session).
 */
export async function completeOAuthRedirect(url: string): Promise<SocialSignInResult> {
  const { queryParams } = Linking.parse(url);
  const param = (key: string) => {
    const value = queryParams?.[key];
    return typeof value === 'string' ? value : undefined;
  };

  const providerError = param('error_description') ?? param('error');
  if (providerError) {
    return /cancel|denied/i.test(providerError)
      ? { status: 'cancelled' }
      : { status: 'failed', reason: providerError };
  }

  const code = param('code');
  if (!code) {
    return { status: 'failed', reason: 'Sign-in did not return an authorization code.' };
  }

  const { error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
  return error ? { status: 'failed', reason: error.message } : { status: 'success' };
}

/**
 * Supabase-hosted OAuth in an in-app browser session (Custom Tabs / ASWebAuthenticationSession).
 * Works for every provider enabled in the Supabase dashboard without a native SDK.
 */
export function createBrowserOAuthAdapter(provider: SocialProvider): SocialAuthAdapter {
  return {
    provider,

    async signIn() {
      const redirectTo = getAuthRedirectUrl();
      const { data, error } = await getSupabaseClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });

      if (error || !data?.url) {
        return { status: 'failed', reason: error?.message ?? 'Could not start sign-in.' };
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') {
        return { status: 'cancelled' };
      }

      return completeOAuthRedirect(result.url);
    },
  };
}
