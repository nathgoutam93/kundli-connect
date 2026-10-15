import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { colors, fontFamily, gutter, palette, radius, space } from '@/constants/theme';
import { type SubscriptionPlan } from '@/constants/mock-data';
import { useAppData } from '@/hooks/use-app-data';

export default function SubscriptionsScreen() {
  const {
    creditHistory,
    creditsBalance,
    isServiceBusy,
    purchaseCredits,
    purchaseSubscription,
    restorePurchases,
    subscription,
    subscriptionPlans,
  } = useAppData();

  // Purchases are disabled on the server until real checkout ships; say so instead of failing silently.
  async function attempt(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      Alert.alert('Purchase unavailable', error instanceof Error ? error.message : 'Please try again later.');
    }
  }

  return (
    <Screen starSeed={31}>
      <ScreenHeader backIcon="close" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <AppText variant="overline" color={colors.accent}>
            Kundali Konnect Premium
          </AppText>
          <AppText variant="title1">Let the stars work harder for you</AppText>
        </View>

        <View style={styles.balanceCard}>
          <LinearGradient
            colors={[palette.midnight700, palette.midnight800]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.balanceCopy}>
            <AppText variant="overline" color={colors.textMuted}>
              Your credits
            </AppText>
            <View style={styles.balanceRow}>
              <Ionicons name="flash" size={22} color={colors.accent} />
              <AppText style={styles.balance}>{creditsBalance}</AppText>
            </View>
            <AppText variant="footnote" color={colors.textFaint}>
              1 credit per match score or like
            </AppText>
          </View>
          <Button
            label="Add 10"
            icon="add"
            size="md"
            fullWidth={false}
            disabled={isServiceBusy}
            onPress={() => attempt(() => purchaseCredits(10))}
          />
        </View>

        <View style={styles.plans}>
          {subscriptionPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              isActive={subscription.planId === plan.id}
              isBusy={isServiceBusy}
              onSelect={() => attempt(() => purchaseSubscription(plan.id))}
              plan={plan}
            />
          ))}
        </View>

        <Button
          label={
            subscription.restoredAt
              ? `Restored ${new Date(subscription.restoredAt).toLocaleTimeString()}`
              : 'Restore purchases'
          }
          variant="ghost"
          size="md"
          disabled={isServiceBusy}
          onPress={() => attempt(restorePurchases)}
        />

        {creditHistory.length > 0 ? (
          <View style={styles.historySection}>
            <AppText variant="overline" color={colors.textMuted} style={styles.sectionTitle}>
              Credit history
            </AppText>
            <View style={styles.history}>
              {creditHistory.map((item, index) => (
                <View key={item.id} style={[styles.historyRow, index > 0 && styles.historyDivider]}>
                  <View style={styles.historyText}>
                    <AppText variant="subhead">{item.title}</AppText>
                    <AppText variant="caption" color={colors.textFaint}>
                      Balance after: {item.balanceAfter}
                    </AppText>
                  </View>
                  <AppText variant="headline" color={item.amount > 0 ? colors.success : colors.textMuted}>
                    {item.amount > 0 ? '+' : ''}
                    {item.amount}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function PlanCard({
  isActive,
  isBusy,
  onSelect,
  plan,
}: {
  isActive: boolean;
  isBusy: boolean;
  onSelect: () => void;
  plan: SubscriptionPlan;
}) {
  const isFeatured = Boolean(plan.badge);

  return (
    <Card tone={isFeatured || isActive ? 'accent' : 'default'} style={styles.planCard}>
      <View style={styles.planHeader}>
        <View style={styles.planTitle}>
          <View style={styles.planNameRow}>
            <AppText variant="title3">{plan.name}</AppText>
            {plan.badge ? (
              <View style={styles.badge}>
                <AppText variant="caption" color={colors.onAccent}>
                  {plan.badge}
                </AppText>
              </View>
            ) : null}
          </View>
          <AppText>
            <AppText style={styles.price}>{plan.priceLabel}</AppText>
            <AppText variant="subhead" color={colors.textMuted}>
              {' '}
              / {plan.cadence}
            </AppText>
          </AppText>
        </View>
        {isActive ? <Ionicons name="checkmark-circle" size={26} color={colors.success} /> : null}
      </View>
      <View style={styles.features}>
        {plan.features.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Ionicons name="sparkles" size={14} color={colors.accent} />
            <AppText variant="callout">{feature}</AppText>
          </View>
        ))}
        {plan.creditBonus ? (
          <View style={styles.featureRow}>
            <Ionicons name="flash" size={14} color={colors.accent} />
            <AppText variant="callout">{plan.creditBonus} bonus credits</AppText>
          </View>
        ) : null}
      </View>
      <Button
        label={isActive ? 'Current plan' : `Choose ${plan.name}`}
        variant={isActive ? 'secondary' : isFeatured ? 'primary' : 'secondary'}
        disabled={isBusy || isActive}
        onPress={onSelect}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: gutter,
    paddingTop: space.md,
    paddingBottom: space.huge,
    gap: space.lg,
  },
  intro: {
    gap: space.xs,
  },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    overflow: 'hidden',
  },
  balanceCopy: {
    gap: 2,
    flexShrink: 1,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
  },
  balance: {
    fontFamily: fontFamily.display,
    fontSize: 40,
    lineHeight: 46,
    color: colors.text,
  },
  plans: {
    gap: space.md,
  },
  planCard: {
    gap: space.md,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  planTitle: {
    gap: space.xxs,
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  badge: {
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  price: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
  },
  features: {
    gap: space.xs,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  historySection: {
    gap: space.xs,
  },
  sectionTitle: {
    paddingHorizontal: space.xxs,
  },
  history: {
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  historyRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  historyDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  historyText: {
    flex: 1,
    gap: 2,
  },
});
