import { Redirect, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';

import { FullScreenLoader } from '@/components/ui/loader';
import { ProfileLoadError } from '@/components/profile-load-error';
import { colors } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';

export default function AuthLayout() {
  const { isHydrated, isAuthenticated, profileError, refreshProfile, hasCompletedOnboarding } = useAppData();
  const hasShownScreens = useRef(false);
  const showScreens = isHydrated && !isAuthenticated;

  useEffect(() => {
    if (showScreens) hasShownScreens.current = true;
  }, [showScreens]);

  const screens = <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;

  if (!isHydrated) {
    // Right after sign-in the session arrives before the profile does. Keep the sign-in screen
    // (and its "Verifying" state) mounted until then: swapping the whole navigator for a loader
    // while the code field is focused and the keyboard is closing could crash the native stack.
    return hasShownScreens.current ? screens : <FullScreenLoader />;
  }

  if (isAuthenticated && profileError) return <ProfileLoadError onRetry={refreshProfile} />;

  // These redirects are the only navigation after signing in; the sign-in screens don't navigate.
  if (isAuthenticated && hasCompletedOnboarding) {
    return <Redirect href="/(tabs)" />;
  }

  if (isAuthenticated && !hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)/basics" />;
  }

  return screens;
}
