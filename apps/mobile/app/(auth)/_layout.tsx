import { Redirect, Stack } from 'expo-router';

import { FullScreenLoader } from '@/components/ui/loader';
import { ProfileLoadError } from '@/components/profile-load-error';
import { colors } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

export default function AuthLayout() {
  const { isHydrated, isAuthenticated, profileError, refreshProfile, hasCompletedOnboarding } = useAppData();

  if (!isHydrated) {
    return <FullScreenLoader />;
  }

  if (isAuthenticated && profileError) return <ProfileLoadError onRetry={refreshProfile} />;

  if (isAuthenticated && hasCompletedOnboarding) {
    return <Redirect href="/(tabs)" />;
  }

  if (isAuthenticated && !hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)/basics" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
