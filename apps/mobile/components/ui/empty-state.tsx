import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { OrbitLoader } from '@/components/ui/orbit-loader';
import { colors, space } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type EmptyStateProps = {
  icon?: IconName;
  title: string;
  message?: string;
  loading?: boolean;
  action?: ReactNode;
};

export function EmptyState({ icon = 'sparkles-outline', title, message, loading, action }: EmptyStateProps) {
  const reduceMotion = useReducedMotion();
  const float = useSharedValue(0);

  // The halo drifts up and down slowly, like something floating in the night sky.
  useEffect(() => {
    if (reduceMotion || loading) {
      return;
    }
    float.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(float);
  }, [float, loading, reduceMotion]);

  const haloStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -5 * float.value }] }));

  return (
    <Animated.View entering={FadeInDown.duration(450)} style={styles.container}>
      {loading ? (
        <View style={styles.loader}>
          <OrbitLoader size={56} />
        </View>
      ) : (
        <Animated.View style={[styles.halo, haloStyle]}>
          <Ionicons name={icon} size={28} color={colors.accent} />
        </Animated.View>
      )}
      <AppText variant="title3" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="callout" color={colors.textMuted} align="center" style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxl,
    gap: space.xs,
  },
  halo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentLine,
    marginBottom: space.sm,
  },
  loader: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  message: {
    maxWidth: 300,
  },
  action: {
    marginTop: space.lg,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
});
