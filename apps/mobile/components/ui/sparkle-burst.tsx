import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { palette } from '@/constants/theme';
import { easings } from '@/lib/motion';

type SparkleBurstProps = {
  /** Increment to fire the burst. 0 never fires, so the first render stays still. */
  trigger: number;
  /** How far the sparkles travel from the center, in points. */
  radius?: number;
  /** Number of sparkles. */
  count?: number;
  duration?: number;
  colors?: readonly string[];
};

/**
 * A ring of tiny stars and dots that bursts out from the center of its parent and fades.
 * Purely decorative: it ignores touches and is skipped when the OS asks for reduced motion.
 */
export const SparkleBurst = memo(function SparkleBurst({
  trigger,
  radius = 44,
  count = 8,
  duration = 650,
  colors = [palette.gold300, palette.ember500],
}: SparkleBurstProps) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (trigger === 0 || reduceMotion) {
      return;
    }
    progress.value = 0;
    progress.value = withTiming(1, { duration, easing: easings.out });
  }, [duration, progress, reduceMotion, trigger]);

  if (reduceMotion) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.layer}>
      {Array.from({ length: count }, (_, index) => (
        <Particle
          key={index}
          progress={progress}
          angle={(index / count) * Math.PI * 2 - Math.PI / 2}
          distance={radius * (index % 2 === 0 ? 1 : 0.72)}
          color={colors[index % colors.length]}
          star={index % 2 === 0}
        />
      ))}
    </View>
  );
});

function Particle({
  progress,
  angle,
  distance,
  color,
  star,
}: {
  progress: SharedValue<number>;
  angle: number;
  distance: number;
  color: string;
  star: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const travelled = interpolate(p, [0, 1], [distance * 0.35, distance]);
    return {
      opacity: p === 0 || p === 1 ? 0 : interpolate(p, [0, 0.15, 0.6, 1], [0, 1, 0.9, 0]),
      transform: [
        { translateX: Math.cos(angle) * travelled },
        { translateY: Math.sin(angle) * travelled },
        { scale: interpolate(p, [0, 0.3, 1], [0.4, 1.1, 0.5]) },
        { rotate: `${interpolate(p, [0, 1], [0, 90])}deg` },
      ],
    };
  });

  return (
    <Animated.View style={[styles.particle, style]}>
      {star ? (
        <Ionicons name="star" size={9} color={color} />
      ) : (
        <View style={[styles.dot, { backgroundColor: color }]} />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
});
