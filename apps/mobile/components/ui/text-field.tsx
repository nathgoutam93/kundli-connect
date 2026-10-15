import { forwardRef, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { colors, fontFamily, radius, space } from '@/constants/theme';

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

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <AppText variant="overline" color={colors.textMuted}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          multiline && styles.fieldMultiline,
          isFocused && styles.fieldFocused,
          error ? styles.fieldError : null,
        ]}>
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
      </View>
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
  },
  fieldMultiline: {
    alignItems: 'flex-start',
    paddingVertical: space.sm,
  },
  fieldFocused: {
    borderColor: colors.accent,
  },
  fieldError: {
    borderColor: colors.danger,
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
