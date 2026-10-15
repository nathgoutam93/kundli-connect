import { Platform, StyleSheet, Switch, View, type SwitchProps } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, space } from '@/constants/theme';

/** Platform switch with brand colors. */
export function AppSwitch({ value, ...rest }: SwitchProps) {
  return (
    <Switch
      value={value}
      trackColor={{ false: colors.border, true: colors.accent }}
      thumbColor={value ? colors.text : colors.textMuted}
      ios_backgroundColor={colors.border}
      // react-native-web ignores thumbColor for the "on" state and needs its own prop.
      {...(Platform.OS === 'web' ? ({ activeThumbColor: colors.text } as object) : null)}
      {...rest}
    />
  );
}

type SwitchRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

/** Label + switch on one line, for settings and "show on profile" toggles. */
export function SwitchRow({ label, description, value, onValueChange, disabled }: SwitchRowProps) {
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <View style={styles.text}>
        <AppText variant="subhead">{label}</AppText>
        {description ? (
          <AppText variant="footnote" color={colors.textMuted}>
            {description}
          </AppText>
        ) : null}
      </View>
      <AppSwitch value={value} onValueChange={onValueChange} disabled={disabled} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  disabled: {
    opacity: 0.4,
  },
});
