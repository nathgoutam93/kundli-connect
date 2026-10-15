import { getSupabaseClient } from '@/lib/supabase';

import type { SocialAuthAdapter } from './types';

/**
 * The subset of `@react-native-google-signin/google-signin` this adapter uses, typed locally so
 * the app builds without the native SDK. Supports both the v13+ result shape
 * ({ type, data: { idToken } }) and older versions (idToken on the result, cancel as an error).
 */
export type GoogleSignInModule = {
  configure(options: { webClientId: string; iosClientId?: string; scopes?: string[] }): void;
  hasPlayServices(options?: { showPlayServicesUpdateDialog?: boolean }): Promise<boolean>;
  signIn(): Promise<{
    type?: 'success' | 'cancelled';
    data?: { idToken?: string | null } | null;
    idToken?: string | null;
  }>;
};

function isCancellation(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
  return code === 'SIGN_IN_CANCELLED' || code === '-5' || code === '12501';
}

/**
 * Native Google account picker → Google ID token → Supabase session. Smoother than the browser
 * flow on Android; needs OAuth client ids from Google Cloud (see services/auth/index.ts).
 */
export function createGoogleNativeAdapter(
  google: GoogleSignInModule,
  config: { webClientId: string; iosClientId?: string }
): SocialAuthAdapter {
  let configured = false;

  return {
    provider: 'google',

    async signIn() {
      try {
        if (!configured) {
          google.configure({ webClientId: config.webClientId, iosClientId: config.iosClientId });
          configured = true;
        }

        await google.hasPlayServices({ showPlayServicesUpdateDialog: true });
        const response = await google.signIn();
        if (response.type === 'cancelled') {
          return { status: 'cancelled' };
        }

        const idToken = response.data?.idToken ?? response.idToken;
        if (!idToken) {
          return { status: 'failed', reason: 'Google did not return an ID token.' };
        }

        const { error } = await getSupabaseClient().auth.signInWithIdToken({ provider: 'google', token: idToken });
        return error ? { status: 'failed', reason: error.message } : { status: 'success' };
      } catch (error) {
        if (isCancellation(error)) {
          return { status: 'cancelled' };
        }
        return { status: 'failed', reason: error instanceof Error ? error.message : 'Google sign-in failed.' };
      }
    },
  };
}
