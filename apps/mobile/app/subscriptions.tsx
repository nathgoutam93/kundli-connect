import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ScreenHeader } from '@/components/ui/screen-header';
import { colors, fontFamily, gutter, palette, radius, space } from '@/constants/theme';
import { type CreditPack, type SubscriptionPlan } from '@/constants/mock-data';
import { useAppData } from '@/hooks/use-app-data';
import { formatAmount, type PurchaseOutcome } from '@/services/checkout';

export default function SubscriptionsScreen() {
  const {
    creditHistory,
    creditPacks,
    creditsBalance,
    purchaseCreditPack,
    purchaseSubscription,
    restorePurchases,
    subscription,
    subscriptionPlans,
  } = useAppData();

  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const isBusy = busyProductId !== null;

  async function buy(productId: string, purchase: () => Promise<PurchaseOutcome>) {
    setBusyProductId(productId);
    try {
      const outcome = await purchase();
      if (outcome.status === 'paid') {
        Alert.alert('Payment successful', 'Your purchase has been added to your account.');
      } else if (outcome.status === 'pending') {
        Alert.alert('Payment processing', 'We will add your purchase as soon as the payment is confirmed.');
      } else if (outcome.status === 'failed') {
        Alert.alert('Payment failed', outcome.reason);
      }
    } catch (error) {
      Alert.alert('Purchase unavailable', error instanceof Error ? error.message : 'Please try again later.');
    } finally {
      setBusyProductId(null);
    }
  }

  async function restore() {
    setBusyProductId('restore');
    try {
      await restorePurchases();
    } finally {
      setBusyProductId(null);
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
        </View>

        {creditPacks.length > 0 ? (
          <View style={styles.packs}>
            {creditPacks.map((pack) => (
              <CreditPackTile
                key={pack.id}
                pack={pack}
                isLoading={busyProductId === pack.id}
                disabled={isBusy}
                onPress={() => buy(pack.id, () => purchaseCreditPack(pack.id))}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.plans}>
          {subscriptionPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              isActive={subscription.status === 'active' && subscription.planId === plan.id}
              isBusy={isBusy}
              isLoading={busyProductId === plan.id}
              onSelect={() => buy(plan.id, () => purchaseSubscription(plan.id))}
              plan={plan}
            />
          ))}
        </View>

        <Button
          label="Restore purchases"
          variant="ghost"
          size="md"
          loading={busyProductId === 'restore'}
          disabled={isBusy}
          onPress={restore}
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

function CreditPackTile({
  pack,
  isLoading,
  disabled,
  onPress,
}: {
  pack: CreditPack;
  isLoading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Buy ${pack.name} for ${formatAmount(pack.priceMinor, pack.currency)}`}
      accessibilityState={{ disabled, busy: isLoading }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.pack, pressed && styles.packPressed, disabled && !isLoading && styles.packDisabled]}>
      <View style={styles.packCredits}>
        <Ionicons name="flash" size={14} color={colors.accent} />
        <AppText style={styles.packValue}>{pack.credits}</AppText>
      </View>
      <AppText variant="caption" color={colors.textMuted}>
        credits
      </AppText>
      <View style={styles.packPrice}>
        <AppText variant="subhead" color={colors.onAccent}>
          {isLoading ? '…' : formatAmount(pack.priceMinor, pack.currency)}
        </AppText>
      </View>
    </Pressable>
  );
}

function PlanCard({
  isActive,
  isBusy,
  isLoading,
  onSelect,
  plan,
}: {
  isActive: boolean;
  isBusy: boolean;
  isLoading: boolean;
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
            <AppText style={styles.price}>
              {plan.priceMinor ? formatAmount(plan.priceMinor, plan.currency) : plan.priceLabel}
            </AppText>
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
        label={isActive ? 'Current plan · renew' : `Choose ${plan.name}`}
        variant={isActive ? 'secondary' : isFeatured ? 'primary' : 'secondary'}
        disabled={isBusy || isActive || !plan.priceMinor}
        loading={isLoading}
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
  packs: {
    flexDirection: 'row',
    gap: space.sm,
  },
  pack: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingTop: space.md,
    paddingBottom: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  packPressed: {
    borderColor: colors.accent,
  },
  packDisabled: {
    opacity: 0.5,
  },
  packCredits: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  packValue: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    color: colors.text,
  },
  packPrice: {
    marginTop: space.xs,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
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
