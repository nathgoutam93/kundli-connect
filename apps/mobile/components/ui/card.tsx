import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '@/constants/theme';

type CardProps = {
  children: ReactNode;
  tone?: 'default' | 'raised' | 'accent';
  padded?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, tone = 'default', padded = true, onPress, accessibilityLabel, style }: CardProps) {
  const toneStyle = tone === 'raised' ? styles.raised : tone === 'accent' ? styles.accent : null;

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.base, toneStyle, padded && styles.padded, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }

  return <View style={[styles.base, toneStyle, padded && styles.padded, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  raised: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
  },
  accent: {
    backgroundColor: colors.surface,
    borderColor: colors.accentLine,
  },
  padded: {
    padding: space.lg,
  },
  pressed: {
    backgroundColor: colors.surfaceRaised,
  },
});
