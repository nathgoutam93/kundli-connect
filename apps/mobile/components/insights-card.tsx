import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Card } from '@/components/ui/card';
import { colors, radius, space } from '@/constants/theme';
import { useInsightsQuery } from '@/hooks/use-domain-data';
import { listItemEntering } from '@/lib/list-motion';
import type { AstroInsight } from '@/services/insights-service';

const TONES: Record<AstroInsight['tone'], { icon: ComponentProps<typeof Ionicons>['name']; color: string; soft: string }> = {
  positive: { icon: 'sparkles', color: colors.success, soft: colors.successSoft },
  neutral: { icon: 'planet-outline', color: colors.accent, soft: colors.accentSoft },
  caution: { icon: 'moon-outline', color: colors.danger, soft: colors.dangerSoft },
};

/** This week's transit insights from the weekly job; hidden until there are some. */
export function InsightsCard() {
  const { data: insights = [] } = useInsightsQuery();

  if (insights.length === 0) {
    return null;
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="telescope-outline" size={16} color={colors.accent} />
        <AppText variant="overline" color={colors.accent}>
          This week in your chart
        </AppText>
      </View>
      {insights.map((insight, index) => {
        const tone = TONES[insight.tone] ?? TONES.neutral;
        return (
          <Animated.View key={insight.id} entering={listItemEntering(index)} style={[styles.item, index > 0 && styles.divider]}>
            <View style={[styles.icon, { backgroundColor: tone.soft }]}>
              <Ionicons name={tone.icon} size={16} color={tone.color} />
            </View>
            <View style={styles.text}>
              <AppText variant="headline">{insight.title}</AppText>
              <AppText variant="callout" color={colors.textMuted}>
                {insight.body}
              </AppText>
            </View>
          </Animated.View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    marginBottom: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  item: {
    flexDirection: 'row',
    gap: space.sm,
    paddingTop: space.sm,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
