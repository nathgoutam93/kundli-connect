import { useEffect } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  type SharedValue,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { colors, radius, space, type } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

type SegmentedControlProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

const TRACK_PADDING = space.xxs;
const GAP = space.xxs;
const TRACK_BORDER = 1;
const PILL_SPRING = { damping: 20, stiffness: 300, mass: 0.8 };

/** Pill tabs with a gold thumb that slides to the selected option. */
export function SegmentedControl<T extends string>({ options, value, onChange, style }: SegmentedControlProps<T>) {
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );
  const position = useSharedValue(selectedIndex);
  const segmentWidth = useSharedValue(0);

  useEffect(() => {
    position.value = withSpring(selectedIndex, PILL_SPRING);
  }, [position, selectedIndex]);

  function handleLayout(event: LayoutChangeEvent) {
    const inner = event.nativeEvent.layout.width - TRACK_BORDER * 2 - TRACK_PADDING * 2 - GAP * (options.length - 1);
    segmentWidth.value = inner / options.length;
  }

  const pillStyle = useAnimatedStyle(() => ({
    width: segmentWidth.value,
    opacity: segmentWidth.value > 0 ? 1 : 0,
    transform: [{ translateX: position.value * (segmentWidth.value + GAP) }],
  }));

  return (
    <View style={[styles.track, style]} accessibilityRole="tablist" onLayout={handleLayout}>
      <Animated.View pointerEvents="none" style={[styles.pill, pillStyle]} />
      {options.map((option, index) => (
        <Segment
          key={option.value}
          label={option.label}
          index={index}
          position={position}
          selected={index === selectedIndex}
          onPress={() => {
            if (option.value !== value) {
              haptics.select();
              onChange(option.value);
            }
          }}
        />
      ))}
    </View>
  );
}

function Segment({
  label,
  index,
  position,
  selected,
  onPress,
}: {
  label: string;
  index: number;
  position: SharedValue<number>;
  selected: boolean;
  onPress: () => void;
}) {
  // The label turns dark as the thumb passes under it, so text and thumb stay in step.
  const labelStyle = useAnimatedStyle(() => {
    const coverage = Math.max(0, 1 - Math.abs(position.value - index));
    return { color: interpolateColor(coverage, [0, 1], [colors.textMuted, colors.onAccent]) };
  });

  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={styles.segment}>
      <Animated.Text style={[type.subhead, labelStyle]}>{label}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: TRACK_PADDING,
    gap: GAP,
    borderRadius: radius.pill,
    borderWidth: TRACK_BORDER,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
  },
  pill: {
    position: 'absolute',
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
  },
});
