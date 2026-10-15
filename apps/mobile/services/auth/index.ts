import { createBrowserOAuthAdapter } from './browser-oauth-adapter';
import type { SocialAuthAdapter, SocialProvider, SocialSignInResult } from './types';

export * from './types';
export { completeOAuthRedirect, getAuthRedirectUrl } from './browser-oauth-adapter';

const SUPPORTED_PROVIDERS: readonly SocialProvider[] = ['google', 'facebook', 'apple'];

/**
 * Adapter per provider. All use the browser OAuth flow by default, which only needs the
 * provider enabled in Supabase (Authentication → Providers).
 *
 * Optional native Google account picker:
 *   1. npx expo install @react-native-google-signin/google-signin   (then rebuild the app)
 *   2. Add here:
 *        import { GoogleSignin } from '@react-native-google-signin/google-signin';
 *        import { createGoogleNativeAdapter } from './google-native-adapter';
 *        ...
 *        google: createGoogleNativeAdapter(GoogleSignin, {
 *          webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!,
 *          iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
 *        }),
 */
export const socialAuthAdapters: Record<SocialProvider, SocialAuthAdapter> = {
  google: createBrowserOAuthAdapter('google'),
  facebook: createBrowserOAuthAdapter('facebook'),
  apple: createBrowserOAuthAdapter('apple'),
};

/**
 * Providers shown on the welcome screen, from EXPO_PUBLIC_SOCIAL_AUTH_PROVIDERS
 * (comma-separated, e.g. "google,facebook"). Empty by default so no button appears for a
 * provider that is not configured in Supabase yet.
 */
export function parseEnabledProviders(value: string | undefined): SocialProvider[] {
  const requested = (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return SUPPORTED_PROVIDERS.filter((provider) => requested.includes(provider));
}

export const enabledSocialProviders = parseEnabledProviders(process.env.EXPO_PUBLIC_SOCIAL_AUTH_PROVIDERS);

export async function signInWithSocialProvider(
  provider: SocialProvider,
  adapters: Record<SocialProvider, SocialAuthAdapter> = socialAuthAdapters
): Promise<SocialSignInResult> {
  try {
    return await adapters[provider].signIn();
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message : 'Sign-in failed.' };
  }
}
