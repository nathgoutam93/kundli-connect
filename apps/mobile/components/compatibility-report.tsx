import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { colors, fontFamily, palette, radius, space } from '@/constants/theme';
import { type CompatibilityBreakdown, type CompatibilityResult } from '@/constants/mock-data';
import { useCountUp } from '@/hooks/use-count-up';
import { durations, easings, springs } from '@/lib/motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const DIAL_SIZE = 132;
const RING_STROKE = 4;
const RING_RADIUS = (DIAL_SIZE - RING_STROKE) / 2 - 3;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** The narrative match report, when present in the raw compatibility payload. */
export function getMatchReport(compatibility?: Pick<CompatibilityResult, 'raw'> | null): string | undefined {
  const conclusion = compatibility?.raw?.conclusion;
  if (conclusion && typeof conclusion === 'object' && 'match_report' in conclusion) {
    const report = (conclusion as { match_report?: unknown }).match_report;
    return typeof report === 'string' && report.trim() ? report : undefined;
  }
  return undefined;
}

type CompatibilityHeroProps = {
  score: number;
  viewerName?: string;
  viewerPhotoUri?: string;
  partnerName?: string;
  partnerPhotoUri?: string;
  label?: string;
};

/**
 * Two avatars joined by an orbit, with the overall score in the middle. On mount the avatars
 * drift in, the score counts up and a gold ring fills to the score.
 */
export function CompatibilityHero({
  score,
  viewerName,
  viewerPhotoUri,
  partnerName,
  partnerPhotoUri,
  label = 'Kundli match',
}: CompatibilityHeroProps) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score || 0)));
  const displayed = useCountUp(safeScore, { delay: 150 });
  const fill = useSharedValue(0);
  const arrival = useSharedValue(0);

  useEffect(() => {
    arrival.value = withSpring(1, springs.settle);
    fill.value = withDelay(150, withTiming(safeScore / 100, { duration: durations.reveal, easing: easings.out }));
  }, [arrival, fill, safeScore]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - fill.value),
  }));
  const leftStyle = useAnimatedStyle(() => ({
    opacity: Math.min(arrival.value, 1),
    transform: [{ translateX: (1 - arrival.value) * -24 }],
  }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: Math.min(arrival.value, 1),
    transform: [{ translateX: (1 - arrival.value) * 24 }],
  }));
  const dialStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.9 + 0.1 * arrival.value }],
  }));

  return (
    <View style={styles.hero}>
      <View style={styles.orbit} />
      <View style={styles.heroRow}>
        <Animated.View style={leftStyle}>
          <Avatar uri={viewerPhotoUri} name={viewerName} size={76} ring={colors.accent} />
        </Animated.View>
        <Animated.View style={[styles.dial, dialStyle]} accessible accessibilityLabel={`${safeScore}% ${label}`}>
          <Svg width={DIAL_SIZE} height={DIAL_SIZE} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgGradient id="dialRing" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={palette.gold300} />
                <Stop offset="1" stopColor={palette.gold600} />
              </SvgGradient>
            </Defs>
            <Circle
              cx={DIAL_SIZE / 2}
              cy={DIAL_SIZE / 2}
              r={RING_RADIUS}
              stroke={colors.border}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            <AnimatedCircle
              cx={DIAL_SIZE / 2}
              cy={DIAL_SIZE / 2}
              r={RING_RADIUS}
              stroke="url(#dialRing)"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              fill="none"
              transform={`rotate(-90 ${DIAL_SIZE / 2} ${DIAL_SIZE / 2})`}
              animatedProps={ringProps}
            />
          </Svg>
          <AppText color={colors.accent} style={styles.dialScore}>
            {displayed}
            <AppText color={colors.accent} style={styles.dialPercent}>
              %
            </AppText>
          </AppText>
          <AppText variant="overline" color={colors.textMuted}>
            {label}
          </AppText>
        </Animated.View>
        <Animated.View style={rightStyle}>
          <Avatar uri={partnerPhotoUri} name={partnerName} size={76} ring={colors.like} />
        </Animated.View>
      </View>
    </View>
  );
}

type CompatibilityReportProps = {
  summary: string;
  yogas: string[];
  doshas: string[];
  breakdown: CompatibilityBreakdown[];
};

/** Narrative summary, yogas/doshas and per-koota breakdown. */
export function CompatibilityReport({ summary, yogas, doshas, breakdown }: CompatibilityReportProps) {
  return (
    <View style={styles.report}>
      <Card tone="accent" style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Ionicons name="sparkles" size={16} color={colors.accent} />
          <AppText variant="overline" color={colors.accent}>
            What the stars say
          </AppText>
        </View>
        <AppText variant="body" style={styles.summaryText}>
          {summary}
        </AppText>
      </Card>

      {yogas.length > 0 || doshas.length > 0 ? (
        <Card style={styles.section}>
          {yogas.length > 0 ? (
            <View style={styles.group}>
              <AppText variant="overline" color={colors.textMuted}>
                Yogas · auspicious
              </AppText>
              <View style={styles.chipRow}>
                {yogas.map((yoga) => (
                  <AstroChip key={yoga} icon="flower-outline" label={yoga} tone="good" />
                ))}
              </View>
            </View>
          ) : null}
          {doshas.length > 0 ? (
            <View style={styles.group}>
              <AppText variant="overline" color={colors.textMuted}>
                Doshas · watch for
              </AppText>
              <View style={styles.chipRow}>
                {doshas.map((dosha) => (
                  <AstroChip key={dosha} icon="moon-outline" label={dosha} tone="caution" />
                ))}
              </View>
            </View>
          ) : null}
        </Card>
      ) : null}

      {breakdown.length > 0 ? (
        <Card style={styles.section}>
          <AppText variant="title3">Guna breakdown</AppText>
          {breakdown.map((row, index) => (
            <View key={row.label} style={styles.scoreRow}>
              <View style={styles.scoreRowHeader}>
                <AppText variant="subhead">{row.label}</AppText>
                <AppText variant="subhead" color={colors.accent}>
                  {row.value}%
                </AppText>
              </View>
              <ScoreBar value={row.value} delay={300 + index * 90} />
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

/** Gold progress bar that grows to its value after `delay` ms. */
function ScoreBar({ value, delay }: { value: number; delay: number }) {
  const target = Math.max(0, Math.min(100, value));
  const width = useSharedValue(0);

  useEffect(() => {
    width.value = withDelay(delay, withTiming(target, { duration: durations.slow * 2, easing: easings.out }));
  }, [delay, target, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }));

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fillStyle]}>
        <LinearGradient
          colors={[palette.gold600, palette.gold300]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

function AstroChip({
  icon,
  label,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: 'good' | 'caution';
}) {
  const color = tone === 'good' ? colors.accent : colors.like;

  return (
    <View
      style={[
        styles.chip,
        { borderColor: tone === 'good' ? colors.accentLine : colors.like, backgroundColor: tone === 'good' ? colors.accentSoft : colors.likeSoft },
      ]}>
      <Ionicons name={icon} size={15} color={color} />
      <AppText variant="subhead" color={color}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.lg,
  },
  orbit: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dialScore: {
    fontFamily: fontFamily.display,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1,
  },
  dialPercent: {
    fontFamily: fontFamily.display,
    fontSize: 22,
    lineHeight: 28,
  },
  report: {
    gap: space.md,
  },
  summaryCard: {
    gap: space.xs,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  summaryText: {
    fontFamily: fontFamily.displayRegular,
    fontSize: 17,
    lineHeight: 26,
  },
  section: {
    gap: space.md,
  },
  group: {
    gap: space.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  scoreRow: {
    gap: 6,
  },
  scoreRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
