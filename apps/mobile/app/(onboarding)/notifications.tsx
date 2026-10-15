import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { colors, space } from '@/constants/theme';
import { useAppData } from '@/hooks/use-app-data';
import { registerCurrentUserPushToken } from '@/services/supabase-auth-service';

const NOTIFICATION_TYPES = [
  { icon: 'heart', label: 'When someone likes you' },
  { icon: 'sparkles', label: 'When it’s a match' },
  { icon: 'chatbubble-ellipses', label: 'New messages' },
] as const;

export default function NotificationsScreen() {
  const { completeOnboarding } = useAppData();
  const [isRegistering, setIsRegistering] = useState(false);

  async function handleContinue() {
    await completeOnboarding();
    router.replace('/(tabs)');
  }

  async function handleEnableNotifications() {
    if (isRegistering) {
      return;
    }

    setIsRegistering(true);

    try {
      const registration = await registerCurrentUserPushToken({ requestPermission: true });

      if (!registration) {
        Alert.alert(
          'Notifications are off',
          'You can enable notifications later from your device settings.'
        );
      }

      await handleContinue();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to enable notifications.';
      Alert.alert('Unable to enable notifications', message);
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <OnboardingStep
      step="notifications"
      title="Don’t miss your destiny"
      subtitle="Your match might message at any moment. We’ll only notify you about what matters."
      footer={
        <>
          <Button
            label="Turn on notifications"
            icon="notifications"
            loading={isRegistering}
            onPress={handleEnableNotifications}
          />
          <Button label="Not now" variant="ghost" size="md" disabled={isRegistering} onPress={handleContinue} />
        </>
      }>
      <Card style={styles.card}>
        {NOTIFICATION_TYPES.map((item) => (
          <View key={item.label} style={styles.row}>
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={18} color={colors.accent} />
            </View>
            <AppText variant="bodyStrong">{item.label}</AppText>
          </View>
        ))}
      </Card>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
});
