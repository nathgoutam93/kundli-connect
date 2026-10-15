import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { colors, fontFamily, palette, radius, space } from '@/constants/theme';
import { type CompatibilityBreakdown, type CompatibilityResult } from '@/constants/mock-data';

/** The astrology API's narrative report, when present in the raw compatibility payload. */
export function getMatchReport(compatibility?: Pick<CompatibilityResult, 'raw'>): string | undefined {
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

/** Two avatars joined by an orbit, with the overall score in the middle. */
export function CompatibilityHero({
  score,
  viewerName,
  viewerPhotoUri,
  partnerName,
  partnerPhotoUri,
  label = 'Kundli match',
}: CompatibilityHeroProps) {
  return (
    <View style={styles.hero}>
      <View style={styles.orbit} />
      <View style={styles.heroRow}>
        <Avatar uri={viewerPhotoUri} name={viewerName} size={76} ring={colors.accent} />
        <View style={styles.dial}>
          <AppText color={colors.accent} style={styles.dialScore}>
            {score}
            <AppText color={colors.accent} style={styles.dialPercent}>
              %
            </AppText>
          </AppText>
          <AppText variant="overline" color={colors.textMuted}>
            {label}
          </AppText>
        </View>
        <Avatar uri={partnerPhotoUri} name={partnerName} size={76} ring={colors.like} />
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
          {breakdown.map((row) => {
            const value = Math.max(0, Math.min(100, row.value));

            return (
              <View key={row.label} style={styles.scoreRow}>
                <View style={styles.scoreRowHeader}>
                  <AppText variant="subhead">{row.label}</AppText>
                  <AppText variant="subhead" color={colors.accent}>
                    {row.value}%
                  </AppText>
                </View>
                <View style={styles.track}>
                  <LinearGradient
                    colors={[palette.gold600, palette.gold300]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.fill, { width: `${value}%` }]}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}
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
    width: 132,
    height: 132,
    borderRadius: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.accentLine,
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
  },
});
