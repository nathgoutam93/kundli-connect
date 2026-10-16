import { useCallback } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptics, type HapticKind } from '@/lib/haptics';
import { springs } from '@/lib/motion';

type PressAnimationOptions = {
  /** Scale while held down. */
  pressedScale?: number;
  /** Background colors to cross-fade between while pressed. Both must be set. */
  backgroundColor?: string;
  pressedBackgroundColor?: string;
  /** Haptic fired when the press completes; `false` for none. */
  haptic?: HapticKind | false;
  onPressIn?: ((event: GestureResponderEvent) => void) | null;
  onPressOut?: ((event: GestureResponderEvent) => void) | null;
  onPress?: ((event: GestureResponderEvent) => void) | null;
};

/**
 * Spring press feedback for any `AnimatedPressable`: shrinks on touch, springs back with a
 * little overshoot on release, optionally cross-fades the background, and fires a haptic when
 * the press completes (not on touch, so scrolling across buttons stays silent).
 */
export function usePressAnimation({
  pressedScale = 0.96,
  backgroundColor,
  pressedBackgroundColor,
  haptic = 'tap',
  onPressIn,
  onPressOut,
  onPress,
}: PressAnimationOptions) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(pressed.value, [0, 1], [1, pressedScale]);
    if (backgroundColor && pressedBackgroundColor) {
      return {
        transform: [{ scale }],
        backgroundColor: interpolateColor(Math.min(Math.max(pressed.value, 0), 1), [0, 1], [backgroundColor, pressedBackgroundColor]),
      };
    }
    return { transform: [{ scale }] };
  });

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      pressed.value = withSpring(1, springs.press);
      onPressIn?.(event);
    },
    [onPressIn, pressed]
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      pressed.value = withSpring(0, springs.release);
      onPressOut?.(event);
    },
    [onPressOut, pressed]
  );

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (haptic) {
        haptics[haptic]();
      }
      onPress?.(event);
    },
    [haptic, onPress]
  );

  return {
    animatedStyle,
    pressHandlers: {
      onPressIn: handlePressIn,
      onPressOut: handlePressOut,
      onPress: onPress ? handlePress : undefined,
    },
  };
}
