import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, radius, space } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type ChoiceRowProps = {
  label: string;
  description?: string;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
  /** `radio` shows a ring, `check` shows a checkbox for multi-select lists. */
  indicator?: 'radio' | 'check';
};

/** Full-width selectable option used in onboarding and settings lists. */
export function ChoiceRow({ label, description, icon, selected, onPress, indicator = 'radio' }: ChoiceRowProps) {
  return (
    <Pressable
      accessibilityRole={indicator === 'check' ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.rowPressed]}>
      {icon ? (
        <Ionicons name={icon} size={20} color={selected ? colors.accent : colors.textMuted} />
      ) : null}
      <View style={styles.rowText}>
        <AppText variant="bodyStrong">{label}</AppText>
        {description ? (
          <AppText variant="footnote" color={colors.textMuted}>
            {description}
          </AppText>
        ) : null}
      </View>
      <View
        style={[
          indicator === 'check' ? styles.check : styles.radio,
          selected && (indicator === 'check' ? styles.checkOn : styles.radioOn),
        ]}>
        {selected ? (
          indicator === 'check' ? (
            <Ionicons name="checkmark" size={14} color={colors.onAccent} />
          ) : (
            <View style={styles.radioDot} />
          )
        ) : null}
      </View>
    </Pressable>
  );
}

type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
};

/** Compact pill option for dense multi-select groups. */
export function ChoiceChip({ label, selected, onPress, icon }: ChoiceChipProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.rowPressed]}>
      {icon ? <Ionicons name={icon} size={15} color={selected ? colors.onAccent : colors.textMuted} /> : null}
      <AppText variant="subhead" color={selected ? colors.onAccent : colors.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  chip: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
});
