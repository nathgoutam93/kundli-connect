import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { OnboardingStep } from '@/components/onboarding-step';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { ChoiceRow } from '@/components/ui/choice';
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
  const { completeOnboarding, profile } = useAppData();
  const [isRegistering, setIsRegistering] = useState(false);
  const [birthConfirmed, setBirthConfirmed] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completionError, setCompletionError] = useState('');

  async function handleContinue() {
    if (!birthConfirmed || isCompleting) return;
    setIsCompleting(true);
    setCompletionError('');
    try {
      await completeOnboarding();
      router.replace('/(tabs)');
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : 'Could not finish setup. Please try again.');
    } finally {
      setIsCompleting(false);
    }
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
      error={completionError}
      footer={
        <>
          <Button
            label="Turn on notifications"
            icon="notifications"
            loading={isRegistering || isCompleting}
            disabled={!birthConfirmed}
            onPress={handleEnableNotifications}
          />
          <Button label="Not now" variant="ghost" size="md" disabled={isRegistering || isCompleting || !birthConfirmed} onPress={handleContinue} />
        </>
      }>
      <Card style={styles.card}>
        <AppText variant="headline">Check your birth details</AppText>
        <AppText>{profile.dateOfBirth} · {profile.timeOfBirth}</AppText>
        <AppText>{profile.birthPlace}</AppText>
        <AppText variant="footnote">These details will be locked when you finish setup. Go back to correct them first.</AppText>
        <ChoiceRow label="I confirm these birth details are correct" selected={birthConfirmed}
          indicator="check" onPress={() => setBirthConfirmed((value) => !value)} />
      </Card>
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
