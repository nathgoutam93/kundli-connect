import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '@/constants/theme';
import { usePressAnimation } from '@/hooks/use-press-animation';
import { AnimatedPressable } from '@/lib/motion';

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
      <PressableCard
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        style={[styles.base, toneStyle, padded && styles.padded, style]}
        background={tone === 'raised' ? colors.surfaceRaised : colors.surface}>
        {children}
      </PressableCard>
    );
  }

  return <View style={[styles.base, toneStyle, padded && styles.padded, style]}>{children}</View>;
}

function PressableCard({
  children,
  onPress,
  accessibilityLabel,
  style,
  background,
}: {
  children: ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  style: StyleProp<ViewStyle>;
  background: string;
}) {
  // Cards are navigation, so they get the press spring but no haptic (buttons and toggles do).
  const { animatedStyle, pressHandlers } = usePressAnimation({
    pressedScale: 0.985,
    backgroundColor: background,
    pressedBackgroundColor: background === colors.surfaceRaised ? colors.surface : colors.surfaceRaised,
    haptic: false,
    onPress,
  });

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={[style, animatedStyle]}
      {...pressHandlers}>
      {children}
    </AnimatedPressable>
  );
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
});
