/** Supabase Auth provider ids (Meta's provider is called "facebook" in Supabase). */
export type SocialProvider = 'google' | 'facebook' | 'apple';

export type SocialSignInResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

/**
 * Signs in with one social provider and leaves a Supabase session behind on success. Profile
 * creation and cache refresh happen afterwards in signInWithSocialProvider, the same for
 * every adapter.
 */
export interface SocialAuthAdapter {
  readonly provider: SocialProvider;
  signIn(): Promise<SocialSignInResult>;
}
