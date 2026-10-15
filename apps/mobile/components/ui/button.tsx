import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, palette, radius, space } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'like' | 'danger' | 'light';
export type ButtonSize = 'lg' | 'md' | 'sm';

type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: 'leading' | 'trailing';
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Optional content rendered before the label, e.g. a brand logo. */
  leading?: ReactNode;
};

const VARIANTS: Record<ButtonVariant, { bg: string; pressed: string; fg: string; border: string }> = {
  primary: { bg: colors.accent, pressed: colors.accentPressed, fg: colors.onAccent, border: colors.accent },
  secondary: { bg: colors.surfaceRaised, pressed: colors.surface, fg: colors.text, border: colors.borderStrong },
  ghost: { bg: colors.transparent, pressed: colors.surface, fg: colors.text, border: colors.transparent },
  like: { bg: colors.like, pressed: colors.likePressed, fg: colors.onLike, border: colors.like },
  danger: { bg: colors.dangerSoft, pressed: colors.surface, fg: colors.danger, border: colors.danger },
  light: { bg: colors.text, pressed: palette.moon200, fg: colors.backgroundDeep, border: colors.text },
};

const DISABLED = { bg: colors.surfaceRaised, pressed: colors.surfaceRaised, fg: colors.textFaint, border: colors.border };

const SIZES: Record<ButtonSize, { height: number; paddingX: number; icon: number; text: 'headline' | 'subhead' }> = {
  lg: { height: 56, paddingX: space.xl, icon: 20, text: 'headline' },
  md: { height: 48, paddingX: space.lg, icon: 18, text: 'headline' },
  sm: { height: 36, paddingX: space.md, icon: 16, text: 'subhead' },
};

export function Button({
  label,
  variant = 'primary',
  size = 'lg',
  icon,
  iconPosition = 'leading',
  loading = false,
  fullWidth = true,
  disabled,
  style,
  leading,
  ...rest
}: ButtonProps) {
  const dims = SIZES[size];
  const isDisabled = disabled || loading;
  // Loading keeps the brand tone; a plain disabled state goes neutral rather than dimming the color.
  const tone = disabled && !loading && variant !== 'ghost' ? DISABLED : VARIANTS[variant];
  const iconNode = icon ? <Ionicons name={icon} size={dims.icon} color={tone.fg} /> : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled), busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: dims.height,
          paddingHorizontal: dims.paddingX,
          backgroundColor: pressed ? tone.pressed : tone.bg,
          borderColor: tone.border,
        },
        fullWidth ? styles.fullWidth : styles.inline,
        disabled && variant === 'ghost' && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={tone.fg} />
      ) : (
        <View style={styles.row}>
          {leading}
          {iconPosition === 'leading' ? iconNode : null}
          <AppText variant={dims.text} color={tone.fg} numberOfLines={1}>
            {label}
          </AppText>
          {iconPosition === 'trailing' ? iconNode : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  inline: {
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
