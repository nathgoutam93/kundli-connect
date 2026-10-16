import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { colors, fontFamily, palette, radius, space } from '@/constants/theme';
import { durations, easings } from '@/lib/motion';

type TextFieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  /** Rendered inside the field before the input, e.g. a country code. */
  leading?: ReactNode;
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, leading, trailing, containerStyle, style, multiline, onFocus, onBlur, ...rest },
  ref
) {
  const [isFocused, setIsFocused] = useState(false);
  const focus = useSharedValue(0);

  useEffect(() => {
    focus.value = withTiming(isFocused ? 1 : 0, { duration: durations.base, easing: easings.out });
  }, [focus, isFocused]);

  // The border warms to gold on focus, with a soft glow where the platform supports shadows.
  const focusStyle = useAnimatedStyle(() =>
    error
      ? { borderColor: colors.danger }
      : {
          borderColor: interpolateColor(focus.value, [0, 1], [colors.border, colors.accent]),
          shadowOpacity: focus.value * 0.35,
        }
  );

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <AppText variant="overline" color={colors.textMuted}>
          {label}
        </AppText>
      ) : null}
      <Animated.View style={[styles.field, multiline && styles.fieldMultiline, focusStyle]}>
        {leading}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          multiline={multiline}
          style={[styles.input, multiline && styles.inputMultiline, style]}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
          {...rest}
        />
        {trailing}
      </Animated.View>
      {error ? (
        <AppText variant="footnote" color={colors.danger}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="footnote" color={colors.textFaint}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: space.xs,
  },
  field: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
    shadowColor: palette.gold500,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
    shadowOpacity: 0,
  },
  fieldMultiline: {
    alignItems: 'flex-start',
    paddingVertical: space.sm,
  },
  input: {
    flex: 1,
    minHeight: 54,
    color: colors.text,
    fontFamily: fontFamily.body,
    fontSize: 17,
    ...Platform.select({ web: { outlineWidth: 0 } }),
  },
  inputMultiline: {
    minHeight: 120,
    textAlignVertical: 'top',
    lineHeight: 24,
  },
});
