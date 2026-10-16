import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { backgroundGradient, palette } from '@/constants/theme';

type CelestialBackgroundProps = {
  /** Number of stars to scatter. Use fewer on content-heavy screens. */
  stars?: number;
  /** Changes the star layout so neighbouring screens don't look identical. */
  seed?: number;
};

/** Deterministic PRNG so the sky is stable across renders. */
function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Midnight gradient with a sparse starfield that gently twinkles. Sits behind screen content. */
export const CelestialBackground = memo(function CelestialBackground({
  stars = 36,
  seed = 7,
}: CelestialBackgroundProps) {
  const points = useMemo(() => {
    const random = mulberry32(seed);
    return Array.from({ length: stars }, (_, index) => {
      const size = random() < 0.12 ? 2.5 : random() < 0.5 ? 1.5 : 1;
      return {
        key: index,
        left: `${(random() * 100).toFixed(2)}%` as `${number}%`,
        // Bias stars toward the top of the screen, like a horizon.
        top: `${(Math.pow(random(), 1.6) * 100).toFixed(2)}%` as `${number}%`,
        size,
        opacity: 0.25 + random() * 0.55,
        gold: random() < 0.15,
        // About a third of the sky twinkles, each star on its own slow rhythm.
        twinkle: random() < 0.35 ? { delay: random() * 4000, duration: 1600 + random() * 2400 } : null,
      };
    });
  }, [seed, stars]);
  const reduceMotion = useReducedMotion();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={backgroundGradient} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      {points.map((star) => {
        const style: ViewStyle = {
          left: star.left,
          top: star.top,
          width: star.size,
          height: star.size,
          borderRadius: star.size,
          opacity: star.opacity,
          backgroundColor: star.gold ? palette.gold300 : palette.moon100,
        };
        return star.twinkle && !reduceMotion ? (
          <TwinklingStar key={star.key} style={style} baseOpacity={star.opacity} {...star.twinkle} />
        ) : (
          <View key={star.key} style={[styles.star, style]} />
        );
      })}
    </View>
  );
});

function TwinklingStar({
  style,
  baseOpacity,
  delay,
  duration,
}: {
  style: ViewStyle;
  baseOpacity: number;
  delay: number;
  duration: number;
}) {
  const glow = useSharedValue(baseOpacity);

  useEffect(() => {
    glow.value = withDelay(
      delay,
      withRepeat(withTiming(Math.min(baseOpacity + 0.45, 1), { duration, easing: Easing.inOut(Easing.sin) }), -1, true)
    );
    return () => cancelAnimation(glow);
  }, [baseOpacity, delay, duration, glow]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  return <Animated.View style={[styles.star, style, animatedStyle]} />;
}

const styles = StyleSheet.create({
  star: {
    position: 'absolute',
  },
});
