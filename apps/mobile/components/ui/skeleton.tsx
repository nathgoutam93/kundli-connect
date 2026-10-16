import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  type SharedValue,
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, gutter, radius, space } from '@/constants/theme';

const ShimmerContext = createContext<SharedValue<number> | null>(null);

/** Drives one shared shimmer for every block inside it, so they sweep in unison. */
function SkeletonGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const progress = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    progress.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);

  return (
    <ShimmerContext.Provider value={progress}>
      <View
        style={style}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Loading"
        accessibilityState={{ busy: true }}>
        {children}
      </View>
    </ShimmerContext.Provider>
  );
}

type SkeletonProps = {
  width?: DimensionValue;
  height: DimensionValue;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
};

/** Placeholder block with a soft gold-tinted light sweeping across it. */
export function Skeleton({ width = '100%', height, rounded = radius.sm, style }: SkeletonProps) {
  const progress = useContext(ShimmerContext);
  const [blockWidth, setBlockWidth] = useState(0);

  const sweepStyle = useAnimatedStyle(() => {
    const p = progress?.value ?? 0;
    const band = blockWidth * 0.7;
    return { width: band, transform: [{ translateX: -band + p * (blockWidth + band) }] };
  });

  return (
    <View
      onLayout={(event: LayoutChangeEvent) => setBlockWidth(event.nativeEvent.layout.width)}
      style={[styles.block, { width, height, borderRadius: rounded }, style]}>
      {progress && blockWidth > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
          <LinearGradient
            colors={['rgba(244, 238, 223, 0)', 'rgba(244, 238, 223, 0.07)', 'rgba(244, 238, 223, 0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Mirrors the Discover profile card: hero photo, name, chips and a bio paragraph. */
export function DiscoverSkeleton() {
  return (
    <SkeletonGroup style={styles.discover}>
      <Skeleton height={440} rounded={radius.xl} />
      <View style={styles.stack}>
        <Skeleton width="55%" height={30} />
        <Skeleton width="35%" height={16} />
      </View>
      <View style={styles.chips}>
        <Skeleton width={96} height={34} rounded={radius.pill} />
        <Skeleton width={120} height={34} rounded={radius.pill} />
        <Skeleton width={84} height={34} rounded={radius.pill} />
      </View>
      <View style={styles.stack}>
        <Skeleton height={14} />
        <Skeleton width="88%" height={14} />
        <Skeleton width="64%" height={14} />
      </View>
    </SkeletonGroup>
  );
}

/** Mirrors the Likes list: identity row, quote and footer per card. */
export function LikesSkeleton() {
  return (
    <SkeletonGroup style={styles.list}>
      {[0, 1, 2].map((key) => (
        <View key={key} style={styles.card}>
          <View style={styles.row}>
            <Skeleton width={52} height={52} rounded={26} />
            <View style={styles.rowText}>
              <Skeleton width="60%" height={18} />
              <Skeleton width="40%" height={13} />
            </View>
            <Skeleton width={56} height={44} rounded={radius.sm} />
          </View>
          <Skeleton height={16} />
          <Skeleton width="70%" height={16} />
        </View>
      ))}
    </SkeletonGroup>
  );
}

/** Mirrors the Chats list: avatar, name and last message per row. */
export function ChatsSkeleton() {
  return (
    <SkeletonGroup style={styles.list}>
      <Skeleton width={140} height={12} style={styles.sectionLabel} />
      <View style={styles.chatList}>
        {[0, 1, 2, 3, 4].map((key) => (
          <View key={key} style={[styles.row, styles.chatRow, key > 0 && styles.divider]}>
            <Skeleton width={56} height={56} rounded={28} />
            <View style={styles.rowText}>
              <Skeleton width="45%" height={18} />
              <Skeleton width="75%" height={14} />
            </View>
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  block: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  discover: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingTop: space.xxs,
    gap: space.md,
  },
  stack: {
    gap: space.xs,
  },
  chips: {
    flexDirection: 'row',
    gap: space.xs,
  },
  list: {
    paddingHorizontal: gutter,
    paddingTop: space.xs,
    gap: space.sm,
  },
  card: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  rowText: {
    flex: 1,
    gap: space.xs,
  },
  sectionLabel: {
    marginVertical: space.xs,
  },
  chatList: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  chatRow: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
