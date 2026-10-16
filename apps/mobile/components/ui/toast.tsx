import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeOutUp, LinearTransition, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { colors, gutter, radius, shadow, space } from '@/constants/theme';
import { haptics } from '@/lib/haptics';
import { durations } from '@/lib/motion';

// Slides down and settles without overshoot: a firm, near-critically damped spring, clamped.
const TOAST_ENTERING = SlideInUp.springify().damping(26).stiffness(240).overshootClamping(1);

type IconName = ComponentProps<typeof Ionicons>['name'];
export type ToastTone = 'success' | 'info' | 'warning';

type ToastInput = {
  message: string;
  title?: string;
  tone?: ToastTone;
  icon?: IconName;
  /** How long it stays up, in ms. */
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

const TONES: Record<ToastTone, { icon: IconName; color: string; soft: string }> = {
  success: { icon: 'checkmark', color: colors.success, soft: colors.successSoft },
  info: { icon: 'sparkles', color: colors.accent, soft: colors.accentSoft },
  warning: { icon: 'alert', color: colors.like, soft: colors.likeSoft },
};

let showListener: ((item: ToastItem) => void) | null = null;
let nextId = 1;

/**
 * Non-blocking, self-dismissing messages ("Like sent", "Payment successful"). Errors that need
 * the user to act should stay as alerts. Callable from anywhere once <ToastHost /> is mounted.
 */
export const toast = {
  show(input: ToastInput) {
    showListener?.({ id: nextId++, ...input });
  },
  success(message: string, title?: string) {
    toast.show({ message, title, tone: 'success' });
  },
  info(message: string, title?: string) {
    toast.show({ message, title, tone: 'info' });
  },
  warning(message: string, title?: string) {
    toast.show({ message, title, tone: 'warning' });
  },
};

/** Renders the current toast at the top of the screen. Mount once, near the app root. */
export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    showListener = (item) => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
      setCurrent(item);
      if (item.tone === 'success') {
        haptics.success();
      } else if (item.tone === 'warning') {
        haptics.warning();
      }
      timer.current = setTimeout(() => setCurrent(null), item.duration ?? 2600);
    };
    return () => {
      showListener = null;
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  const tone = TONES[current?.tone ?? 'info'];

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + space.xs }]}>
      {current ? (
        <Animated.View
          key={current.id}
          entering={TOAST_ENTERING}
          exiting={FadeOutUp.duration(durations.base)}
          layout={LinearTransition}
          style={styles.toast}>
          <Pressable
            accessibilityRole="alert"
            accessibilityLabel={current.title ? `${current.title}. ${current.message}` : current.message}
            onPress={() => setCurrent(null)}
            style={styles.row}>
            <View style={[styles.icon, { backgroundColor: tone.soft, borderColor: tone.color }]}>
              <Ionicons name={current.icon ?? tone.icon} size={16} color={tone.color} />
            </View>
            <View style={styles.text}>
              {current.title ? <AppText variant="headline">{current.title}</AppText> : null}
              <AppText variant={current.title ? 'footnote' : 'subhead'} color={current.title ? colors.textMuted : colors.text}>
                {current.message}
              </AppText>
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: gutter,
    right: gutter,
    alignItems: 'center',
  },
  toast: {
    alignSelf: 'stretch',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceRaised,
    ...shadow.soft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  icon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 1,
  },
});
