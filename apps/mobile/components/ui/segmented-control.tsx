import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, radius, space } from '@/constants/theme';

type SegmentedControlProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

export function SegmentedControl<T extends string>({ options, value, onChange, style }: SegmentedControlProps<T>) {
  return (
    <View style={[styles.track, style]} accessibilityRole="tablist">
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, isSelected && styles.segmentSelected]}>
            <AppText variant="subhead" color={isSelected ? colors.onAccent : colors.textMuted}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: space.xxs,
    gap: space.xxs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
  },
  segmentSelected: {
    backgroundColor: colors.accent,
  },
});
