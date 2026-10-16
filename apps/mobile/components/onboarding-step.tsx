import { router } from 'expo-router';
import { type ReactNode, useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Screen } from '@/components/ui/screen';
import { colors, gutter, radius, space } from '@/constants/theme';
import { durations, easings } from '@/lib/motion';

/** Order of the onboarding flow; drives the progress bar. */
export const ONBOARDING_STEPS = [
  'basics',
  'kundli-details',
  'birth-location',
  'cosmic-chart',
  'gender',
  'height',
  'work',
  'education',
  'religion',
  'drink-smoke',
  'photos',
  'bio',
  'gender-preferences',
  'family-planning',
  'notifications',
] as const;

export type OnboardingStepName = (typeof ONBOARDING_STEPS)[number];

type OnboardingStepProps = {
  step: OnboardingStepName;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Primary action. Omit to render your own footer via `footer`. */
  onContinue?: () => void;
  continueLabel?: string;
  canContinue?: boolean;
  isBusy?: boolean;
  /** Secondary action shown under the primary button, e.g. "Skip". */
  secondaryAction?: { label: string; onPress: () => void };
  footer?: ReactNode;
  error?: string | null;
  showBack?: boolean;
  /** Set false when children manage their own scrolling (maps, pickers). */
  scrollable?: boolean;
};

export function OnboardingStep({
  step,
  title,
  subtitle,
  children,
  onContinue,
  continueLabel = 'Continue',
  canContinue = true,
  isBusy = false,
  secondaryAction,
  footer,
  error,
  showBack = true,
  scrollable = true,
}: OnboardingStepProps) {
  const insets = useSafeAreaInsets();
  const index = ONBOARDING_STEPS.indexOf(step);
  const progress = (index + 1) / ONBOARDING_STEPS.length;
  // Each step is its own screen, so the bar grows from where the previous step left it.
  const fill = useSharedValue(index / ONBOARDING_STEPS.length);

  useEffect(() => {
    fill.value = withDelay(150, withTiming(progress, { duration: durations.slow * 2, easing: easings.out }));
  }, [fill, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  const heading = (
    <Animated.View entering={FadeInDown.duration(420)} style={styles.heading}>
      <AppText variant="title1">{title}</AppText>
      {subtitle ? (
        <AppText variant="callout" color={colors.textMuted}>
          {subtitle}
        </AppText>
      ) : null}
    </Animated.View>
  );

  return (
    <Screen starSeed={index + 3}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <View style={styles.topBar}>
          {showBack && router.canGoBack() ? (
            <IconButton icon="chevron-back" accessibilityLabel="Go back" onPress={() => router.back()} size={40} />
          ) : (
            <View style={styles.backPlaceholder} />
          )}
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: ONBOARDING_STEPS.length, now: index + 1 }}>
            <Animated.View style={[styles.fill, fillStyle]} />
          </View>
          <AppText variant="caption" color={colors.textFaint} style={styles.counter}>
            {index + 1}/{ONBOARDING_STEPS.length}
          </AppText>
        </View>

        {scrollable ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {heading}
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, styles.staticContent]}>
            {heading}
            {children}
          </View>
        )}

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space.md) + space.xs }]}>
          {error ? (
            <AppText variant="footnote" color={colors.danger} align="center">
              {error}
            </AppText>
          ) : null}
          {footer}
          {onContinue ? (
            <Button
              label={continueLabel}
              icon="arrow-forward"
              iconPosition="trailing"
              onPress={onContinue}
              disabled={!canContinue}
              loading={isBusy}
            />
          ) : null}
          {secondaryAction ? (
            <Button label={secondaryAction.label} variant="ghost" size="md" onPress={secondaryAction.onPress} />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: gutter,
    paddingTop: space.xs,
    paddingBottom: space.md,
  },
  backPlaceholder: {
    width: 40,
    height: 40,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  counter: {
    minWidth: 32,
    textAlign: 'right',
  },
  scrollContent: {
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    paddingBottom: space.xxl,
    gap: space.xl,
  },
  staticContent: {
    paddingHorizontal: gutter,
    paddingTop: space.lg,
    gap: space.xl,
  },
  heading: {
    gap: space.xs,
  },
  footer: {
    paddingHorizontal: gutter,
    paddingTop: space.sm,
    gap: space.xs,
  },
});
