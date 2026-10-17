import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { StyleSheet, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { SparkleBurst } from '@/components/ui/sparkle-burst';
import { colors } from '@/constants/theme';
import { usePressAnimation } from '@/hooks/use-press-animation';
import { type HapticKind } from '@/lib/haptics';
import { AnimatedPressable, springs } from '@/lib/motion';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type IconButtonVariant = 'surface' | 'glass' | 'accent' | 'like' | 'plain';

/**
 * What the icon does when pressed:
 * - `pop`: quick scale-up and settle (confirmations, favourites).
 * - `wiggle`: a small shake (pass / dismiss).
 * - `burst`: pop plus a ring of sparkles (like).
 */
export type IconButtonEffect = 'none' | 'pop' | 'wiggle' | 'burst';

type IconButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  icon: IconName;
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  effect?: IconButtonEffect;
  /** Haptic on press. Defaults to a light tap; `false` for none. */
  haptic?: HapticKind | false;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

const VARIANTS: Record<IconButtonVariant, { bg: string; border: string; fg: string; pressed: string }> = {
  surface: { bg: colors.surface, border: colors.border, fg: colors.text, pressed: colors.surfaceRaised },
  glass: { bg: colors.glass, border: colors.glassBorder, fg: colors.text, pressed: colors.surfaceRaised },
  accent: { bg: colors.accent, border: colors.accent, fg: colors.onAccent, pressed: colors.accentPressed },
  like: { bg: colors.like, border: colors.like, fg: colors.onLike, pressed: colors.likePressed },
  plain: { bg: 'rgba(23, 23, 23, 0)', border: colors.transparent, fg: colors.text, pressed: colors.surface },
};

const DISABLED = { bg: colors.surfaceRaised, border: colors.border, fg: colors.textFaint, pressed: colors.surfaceRaised };

export function IconButton({
  icon,
  variant = 'surface',
  size = 44,
  iconSize,
  iconColor,
  effect = 'none',
  haptic = 'tap',
  disabled,
  style,
  children,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: IconButtonProps) {
  // Filled variants go neutral when disabled instead of dimming the brand color.
  const tone = disabled && (variant === 'accent' || variant === 'like') ? DISABLED : VARIANTS[variant];
  const iconScale = useSharedValue(1);
  const iconRotation = useSharedValue(0);
  const [burstCount, setBurstCount] = useState(0);

  function playEffect() {
    if (effect === 'pop' || effect === 'burst') {
      iconScale.value = withSequence(withTiming(1.28, { duration: 110 }), withSpring(1, springs.pop));
    }
    if (effect === 'wiggle') {
      iconRotation.value = withSequence(
        withTiming(-16, { duration: 60 }),
        withTiming(13, { duration: 80 }),
        withTiming(-8, { duration: 70 }),
        withSpring(0, springs.pop)
      );
    }
    if (effect === 'burst') {
      setBurstCount((count) => count + 1);
    }
  }

  const { animatedStyle, pressHandlers } = usePressAnimation({
    pressedScale: 0.9,
    backgroundColor: tone.bg,
    pressedBackgroundColor: tone.pressed,
    haptic,
    onPressIn,
    onPressOut,
    onPress: onPress
      ? (event: GestureResponderEvent) => {
          playEffect();
          onPress(event);
        }
      : undefined,
  });

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }, { rotate: `${iconRotation.value}deg` }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      hitSlop={8}
      disabled={disabled}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tone.bg,
          borderColor: tone.border,
        },
        disabled && tone !== DISABLED && styles.disabled,
        style,
        animatedStyle,
      ]}
      {...pressHandlers}
      {...rest}>
      {effect === 'burst' ? <SparkleBurst trigger={burstCount} radius={size * 0.85} /> : null}
      <Animated.View style={iconStyle}>
        <Ionicons name={icon} size={iconSize ?? Math.round(size * 0.45)} color={iconColor ?? tone.fg} />
      </Animated.View>
      {children}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.4,
  },
});
