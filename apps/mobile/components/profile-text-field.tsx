import { StyleSheet, View } from 'react-native';

import { AppSwitch } from '@/components/ui/app-switch';
import { AppText } from '@/components/ui/app-text';
import { ChoiceChip } from '@/components/ui/choice';
import { TextField } from '@/components/ui/text-field';
import { colors, space } from '@/constants/theme';

export const PREFER_NOT_TO_SAY = 'Prefer not to say';

type ProfileTextFieldProps = {
  question: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  preferNotToSay: boolean;
  onTogglePreferNotToSay: () => void;
  visibleOnProfile: boolean;
  onVisibleOnProfileChange: (value: boolean) => void;
  returnKeyType?: 'next' | 'done';
};

/** Free-text profile answer with "prefer not to say" and a profile-visibility switch. */
export function ProfileTextField({
  question,
  value,
  onChangeText,
  placeholder = 'In your words',
  preferNotToSay,
  onTogglePreferNotToSay,
  visibleOnProfile,
  onVisibleOnProfileChange,
  returnKeyType = 'next',
}: ProfileTextFieldProps) {
  return (
    <View style={styles.container}>
      <AppText variant="title3">{question}</AppText>
      <TextField
        value={preferNotToSay ? PREFER_NOT_TO_SAY : value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        returnKeyType={returnKeyType}
        editable={!preferNotToSay}
        style={preferNotToSay ? styles.inputMuted : undefined}
      />
      <View style={styles.controls}>
        <ChoiceChip label={PREFER_NOT_TO_SAY} selected={preferNotToSay} onPress={onTogglePreferNotToSay} />
        <View style={[styles.visibility, preferNotToSay && styles.disabled]}>
          <AppText variant="footnote" color={colors.textMuted}>
            Show on profile
          </AppText>
          <AppSwitch
            value={visibleOnProfile}
            onValueChange={onVisibleOnProfileChange}
            disabled={preferNotToSay}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space.sm,
  },
  inputMuted: {
    color: colors.textFaint,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  visibility: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  disabled: {
    opacity: 0.4,
  },
});
