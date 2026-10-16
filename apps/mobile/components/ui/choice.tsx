import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { colors, radius, space, type } from '@/constants/theme';
import { usePressAnimation } from '@/hooks/use-press-animation';
import { AnimatedPressable, durations, easings, springs } from '@/lib/motion';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** 0 → 1 as an option becomes selected; starts at the current value so nothing animates on mount. */
function useSelection(selected: boolean) {
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: durations.fast, easing: easings.out });
  }, [progress, selected]);
  return progress;
}

type ChoiceRowProps = {
  label: string;
  description?: string;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
  /** `radio` shows a ring, `check` shows a checkbox for multi-select lists. */
  indicator?: 'radio' | 'check';
};

/** Full-width selectable option used in onboarding and settings lists. */
export function ChoiceRow({ label, description, icon, selected, onPress, indicator = 'radio' }: ChoiceRowProps) {
  const progress = useSelection(selected);
  const { animatedStyle, pressHandlers } = usePressAnimation({ pressedScale: 0.98, haptic: 'select', onPress });

  const rowStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [colors.border, colors.accent]),
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surface, colors.surfaceRaised]),
  }));

  return (
    <AnimatedPressable
      accessibilityRole={indicator === 'check' ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, selected }}
      style={[styles.row, rowStyle, animatedStyle]}
      {...pressHandlers}>
      {icon ? <Ionicons name={icon} size={20} color={selected ? colors.accent : colors.textMuted} /> : null}
      <View style={styles.rowText}>
        <AppText variant="bodyStrong">{label}</AppText>
        {description ? (
          <AppText variant="footnote" color={colors.textMuted}>
            {description}
          </AppText>
        ) : null}
      </View>
      {indicator === 'check' ? <CheckIndicator progress={progress} selected={selected} /> : <RadioIndicator progress={progress} selected={selected} />}
    </AnimatedPressable>
  );
}

function RadioIndicator({ progress, selected }: { progress: SharedValue<number>; selected: boolean }) {
  const dotScale = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    dotScale.value = selected ? withSpring(1, springs.pop) : withTiming(0, { duration: durations.fast });
  }, [dotScale, selected]);

  const ringStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [colors.borderStrong, colors.accent]),
  }));
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: dotScale.value }] }));

  return (
    <Animated.View style={[styles.radio, ringStyle]}>
      <Animated.View style={[styles.radioDot, dotStyle]} />
    </Animated.View>
  );
}

function CheckIndicator({ progress, selected }: { progress: SharedValue<number>; selected: boolean }) {
  const checkScale = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    checkScale.value = selected ? withSpring(1, springs.pop) : withTiming(0, { duration: durations.fast });
  }, [checkScale, selected]);

  const boxStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [colors.borderStrong, colors.accent]),
    backgroundColor: interpolateColor(progress.value, [0, 1], ['rgba(233, 185, 73, 0)', colors.accent]),
  }));
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: checkScale.value }] }));

  return (
    <Animated.View style={[styles.check, boxStyle]}>
      <Animated.View style={checkStyle}>
        <Ionicons name="checkmark" size={14} color={colors.onAccent} />
      </Animated.View>
    </Animated.View>
  );
}

type ChoiceChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
};

/** Compact pill option for dense multi-select groups. */
export function ChoiceChip({ label, selected, onPress, icon }: ChoiceChipProps) {
  const progress = useSelection(selected);
  const { animatedStyle, pressHandlers } = usePressAnimation({ pressedScale: 0.94, haptic: 'select', onPress });

  const chipStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], [colors.border, colors.accent]),
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surface, colors.accent]),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [colors.text, colors.onAccent]),
  }));

  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={[styles.chip, chipStyle, animatedStyle]}
      {...pressHandlers}>
      {icon ? <Ionicons name={icon} size={15} color={selected ? colors.onAccent : colors.textMuted} /> : null}
      <Animated.Text style={[type.subhead, labelStyle]}>{label}</Animated.Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
