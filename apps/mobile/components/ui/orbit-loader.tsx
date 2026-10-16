import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, palette } from '@/constants/theme';

/**
 * The app's loading indicator: a gold star circling a faint orbit, with a smaller moon going
 * the other way. Falls back to the platform spinner when reduced motion is on.
 */
export function OrbitLoader({ size = 44 }: { size?: number }) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    turn.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduceMotion, turn]);

  const outerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const innerStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-turn.value * 540}deg` }] }));

  if (reduceMotion) {
    return <ActivityIndicator color={colors.accent} />;
  }

  const inner = size * 0.56;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.orbit, { width: size, height: size, borderRadius: size / 2 }]} />
      <Animated.View style={[StyleSheet.absoluteFill, outerStyle]}>
        <View style={[styles.star, { left: size / 2 - 4 }]} />
      </Animated.View>
      <Animated.View style={[{ width: inner, height: inner }, innerStyle]}>
        <View style={[styles.moon, { left: inner / 2 - 2.5 }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  orbit: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: colors.accentLine,
  },
  star: {
    position: 'absolute',
    top: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.gold300,
    shadowColor: palette.gold500,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  moon: {
    position: 'absolute',
    top: -2.5,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.moon100,
    opacity: 0.8,
  },
});
