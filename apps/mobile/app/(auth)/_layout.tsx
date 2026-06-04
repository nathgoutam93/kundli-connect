import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAppData } from '@/hooks/use-app-data';

export default function AuthLayout() {
  const { isHydrated, isAuthenticated, hasCompletedOnboarding } = useAppData();

  if (!isHydrated) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#2D241E" />
      </View>
    );
  }

  if (isAuthenticated && hasCompletedOnboarding) {
    return <Redirect href="/(tabs)" />;
  }

  if (isAuthenticated && !hasCompletedOnboarding) {
    return <Redirect href="/(onboarding)/basics" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F5F0',
  },
});
