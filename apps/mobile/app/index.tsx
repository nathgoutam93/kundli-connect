import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAppState } from '@/store/use-app-state';

export default function Index() {
  const { hasCompletedOnboarding, hydrateAuthSession, isAuthenticated, isHydrated, isServiceBusy } = useAppState();
  const hasHydratedAuthRef = useRef(false);
  const [hasCheckedAuthSession, setHasCheckedAuthSession] = useState(false);

  useEffect(() => {
    if (!isHydrated || hasHydratedAuthRef.current) {
      return;
    }

    hasHydratedAuthRef.current = true;
    hydrateAuthSession()
      .catch(() => undefined)
      .finally(() => setHasCheckedAuthSession(true));
  }, [hydrateAuthSession, isHydrated]);

  if (!isHydrated || !hasCheckedAuthSession || isServiceBusy) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#2D241E" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)/basics" />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F5F0',
  },
});
