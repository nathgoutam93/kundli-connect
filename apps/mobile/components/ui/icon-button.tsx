import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type IconButtonVariant = 'surface' | 'glass' | 'accent' | 'like' | 'plain';

type IconButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  icon: IconName;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

const VARIANTS: Record<IconButtonVariant, { bg: string; border: string; fg: string }> = {
  surface: { bg: colors.surface, border: colors.border, fg: colors.text },
  glass: { bg: colors.glass, border: colors.glassBorder, fg: colors.text },
  accent: { bg: colors.accent, border: colors.accent, fg: colors.onAccent },
  like: { bg: colors.like, border: colors.like, fg: colors.onLike },
  plain: { bg: colors.transparent, border: colors.transparent, fg: colors.text },
};

const DISABLED = { bg: colors.surfaceRaised, border: colors.border, fg: colors.textFaint };

export function IconButton({
  icon,
  variant = 'surface',
  size = 44,
  iconSize,
  iconColor,
  disabled,
  style,
  children,
  ...rest
}: IconButtonProps) {
  // Filled variants go neutral when disabled instead of dimming the brand color.
  const tone = disabled && (variant === 'accent' || variant === 'like') ? DISABLED : VARIANTS[variant];

  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tone.bg,
          borderColor: tone.border,
        },
        pressed && styles.pressed,
        disabled && tone !== DISABLED && styles.disabled,
        style,
      ]}
      {...rest}>
      <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.45)} color={iconColor ?? tone.fg} />
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.94 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
