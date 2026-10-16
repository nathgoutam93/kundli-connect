import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { TextField } from '@/components/ui/text-field';
import { toast } from '@/components/ui/toast';
import { colors, gutter, space } from '@/constants/theme';
import { useSafetyActions } from '@/hooks/use-safety-actions';
import { haptics } from '@/lib/haptics';

const CONFIRM_WORD = 'DELETE';

const WHAT_IS_DELETED: { icon: ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  { icon: 'person-outline', text: 'Your profile, photos and birth details' },
  { icon: 'planet-outline', text: 'Your Kundli and every match score' },
  { icon: 'chatbubbles-outline', text: 'Your likes, matches and messages (chats end for the other person too)' },
  { icon: 'flash-outline', text: 'Remaining credits and any active plan, which can’t be refunded' },
];

/** Permanent account deletion, required by the App Store and Google Play. */
export default function DeleteAccountScreen() {
  const { deleteAccount } = useSafetyActions();
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const isConfirmed = confirmation.trim().toUpperCase() === CONFIRM_WORD;

  async function handleDelete() {
    if (!isConfirmed || isDeleting) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteAccount();
      haptics.success();
      toast.info('Your account and data have been deleted.', 'Account deleted');
      router.replace('/(auth)/welcome');
    } catch (error) {
      haptics.error();
      Alert.alert('Account not deleted', error instanceof Error ? error.message : 'Please try again.');
      setIsDeleting(false);
    }
  }

  return (
    <Screen starSeed={33}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader title="Delete account" />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.heading}>
            <View style={styles.warningIcon}>
              <Ionicons name="warning-outline" size={26} color={colors.danger} />
            </View>
            <AppText variant="title2">This can’t be undone</AppText>
            <AppText variant="callout" color={colors.textMuted}>
              Deleting your account removes it permanently. If you only want a break, you can turn off
              “Discoverable profile” in Settings instead.
            </AppText>
          </View>

          <Card style={styles.list}>
            <AppText variant="overline" color={colors.textMuted}>
              What gets deleted
            </AppText>
            {WHAT_IS_DELETED.map((item) => (
              <View key={item.text} style={styles.item}>
                <Ionicons name={item.icon} size={18} color={colors.danger} />
                <AppText variant="callout" style={styles.itemText}>
                  {item.text}
                </AppText>
              </View>
            ))}
          </Card>

          <AppText variant="footnote" color={colors.textFaint}>
            Reports you’ve made, or that were made about your account, are kept without your details so we can keep
            the community safe. Payment records held by our payment provider aren’t affected.
          </AppText>

          <TextField
            label={`Type ${CONFIRM_WORD} to confirm`}
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={CONFIRM_WORD}
            editable={!isDeleting}
          />

          <Button
            label="Delete my account"
            icon="trash-outline"
            variant="danger"
            haptic="warning"
            loading={isDeleting}
            disabled={!isConfirmed}
            onPress={handleDelete}
          />
          <Button label="Keep my account" variant="ghost" disabled={isDeleting} onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: gutter,
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  heading: {
    gap: space.xs,
  },
  warningIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
    marginBottom: space.xs,
  },
  list: {
    gap: space.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  itemText: {
    flex: 1,
  },
});
