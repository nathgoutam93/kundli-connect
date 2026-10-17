import { Redirect } from 'expo-router';

import { FullScreenLoader } from '@/components/ui/loader';
import { ProfileLoadError } from '@/components/profile-load-error';
import { useProfileQuery } from '@/hooks/use-domain-data';
import { useAuth } from '@/providers/auth-provider';

export default function Index() {
  const { isInitializing, user } = useAuth();
  const profile = useProfileQuery();

  if (isInitializing || (user && profile.isPending)) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (profile.isError) return <ProfileLoadError onRetry={() => profile.refetch()} />;

  if (!profile.data?._onboardingCompleted) {
    return <Redirect href="/(onboarding)/basics" />;
  }

  return <Redirect href="/(tabs)" />;
}
