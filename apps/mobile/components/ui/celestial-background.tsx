import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

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

/** Midnight gradient with a sparse, static starfield. Sits behind screen content. */
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
      };
    });
  }, [seed, stars]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={backgroundGradient} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      {points.map((star) => (
        <View
          key={star.key}
          style={[
            styles.star,
            {
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              borderRadius: star.size,
              opacity: star.opacity,
              backgroundColor: star.gold ? palette.gold300 : palette.moon100,
            },
          ]}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  star: {
    position: 'absolute',
  },
});
