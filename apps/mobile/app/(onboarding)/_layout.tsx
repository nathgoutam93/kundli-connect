import { Redirect, Stack } from 'expo-router';

import { FullScreenLoader } from '@/components/ui/loader';
import { ProfileLoadError } from '@/components/profile-load-error';
import { colors } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

export default function OnboardingLayout() {
  const { isHydrated, isAuthenticated, profileError, refreshProfile, hasCompletedOnboarding } = useAppData();

  if (!isHydrated) {
    return <FullScreenLoader />;
  }

  if (isAuthenticated && profileError) return <ProfileLoadError onRetry={refreshProfile} />;

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (hasCompletedOnboarding) {
    return <Redirect href="/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
