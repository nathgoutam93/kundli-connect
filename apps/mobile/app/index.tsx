import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useProfileQuery } from '@/hooks/use-domain-data';
import { useAuth } from '@/providers/auth-provider';

export default function Index() {
  const { isInitializing, user } = useAuth();
  const profile = useProfileQuery();

  if (isInitializing || (user && profile.isPending)) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#2D241E" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!profile.data?._onboardingCompleted) {
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
