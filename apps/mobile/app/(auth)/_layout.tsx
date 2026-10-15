import { Redirect, Stack } from 'expo-router';

import { FullScreenLoader } from '@/components/ui/loader';
import { colors } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

export default function AuthLayout() {
  const { isHydrated, isAuthenticated, hasCompletedOnboarding } = useAppData();

  if (!isHydrated) {
    return <FullScreenLoader />;
  }

  if (isAuthenticated && hasCompletedOnboarding) {
    return <Redirect href="/(tabs)" />;
  }

  if (isAuthenticated && !hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)/basics" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
