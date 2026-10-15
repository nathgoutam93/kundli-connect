import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { FullScreenLoader } from '@/components/ui/loader';
import { queryClient } from '@/lib/query-client';
import { getSupabaseClient } from '@/lib/supabase';
import { completeOAuthRedirect } from '@/services/auth';
import { ensureCurrentUserProfile } from '@/services/supabase-auth-service';

/**
 * Landing route for kundalikonnect://auth/callback. Normally the in-app browser session hands
 * the redirect straight back to the sign-in adapter; this covers the cases where the OS opens
 * the app with the link instead (e.g. Android killed the app during sign-in).
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<Record<string, string>>();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) {
      return;
    }
    handledRef.current = true;

    async function finish() {
      const url = Linking.createURL('auth/callback', { queryParams: params });
      const result = await completeOAuthRedirect(url);
      // The adapter may already have exchanged this code; an existing session means we're done.
      const { data } = await getSupabaseClient().auth.getSession();

      if (result.status === 'success' || data.session) {
        await ensureCurrentUserProfile();
        await queryClient.invalidateQueries();
        router.replace('/');
        return;
      }

      if (result.status === 'failed') {
        Alert.alert('Sign-in failed', result.reason);
      }
      router.replace('/(auth)/welcome');
    }

    finish().catch((error) => {
      Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Please try again.');
      router.replace('/(auth)/welcome');
    });
  }, [params]);

  return <FullScreenLoader label="Signing you in" />;
}
