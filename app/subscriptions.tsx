import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type SubscriptionPlan } from '@/constants/mock-data';
import { useAppState } from '@/store/use-app-state';

export default function SubscriptionsScreen() {
  const insets = useSafeAreaInsets();
  const {
    creditHistory,
    creditsBalance,
    isServiceBusy,
    purchaseCredits,
    purchaseSubscription,
    restorePurchases,
    subscription,
    subscriptionPlans,
  } = useAppState();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top + 18, 42), paddingBottom: insets.bottom + 34 },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Billing mock</Text>
          <Text style={styles.title}>Premium</Text>
        </View>
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color="#2D241E" />
        </Pressable>
      </View>

      <View style={styles.balanceCard}>
        <View>
          <Text style={styles.balanceLabel}>Credits</Text>
          <Text style={styles.balance}>{creditsBalance}</Text>
        </View>
        <Pressable disabled={isServiceBusy} style={styles.creditButton} onPress={() => purchaseCredits(10)}>
          <Ionicons name="add" size={18} color="#2D241E" />
          <Text style={styles.creditButtonText}>10</Text>
        </Pressable>
      </View>

      <View style={styles.plans}>
        {subscriptionPlans.map((plan) => (
          <PlanCard
            key={plan.id}
            isActive={subscription.planId === plan.id}
            isBusy={isServiceBusy}
            onSelect={() => purchaseSubscription(plan.id)}
            plan={plan}
          />
        ))}
      </View>

      <Pressable disabled={isServiceBusy} style={styles.restoreButton} onPress={restorePurchases}>
        <Text style={styles.restoreText}>
          {subscription.restoredAt ? `Restored ${new Date(subscription.restoredAt).toLocaleTimeString()}` : 'Restore purchases'}
        </Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Credit history</Text>
      <View style={styles.history}>
        {creditHistory.map((item) => (
          <View key={item.id} style={styles.historyRow}>
            <View style={styles.historyText}>
              <Text style={styles.historyTitle}>{item.title}</Text>
              <Text style={styles.historyMeta}>Balance after: {item.balanceAfter}</Text>
            </View>
            <Text style={[styles.amount, item.amount > 0 ? styles.amountPositive : styles.amountNegative]}>
              {item.amount > 0 ? '+' : ''}
              {item.amount}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
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
  return (
    <View style={[styles.planCard, isActive && styles.planCardActive]}>
      <View style={styles.planHeader}>
        <View>
          <View style={styles.planNameRow}>
            <Text style={styles.planName}>{plan.name}</Text>
            {plan.badge ? <Text style={styles.badge}>{plan.badge}</Text> : null}
          </View>
          <Text style={styles.price}>
            {plan.priceLabel} <Text style={styles.cadence}>/ {plan.cadence}</Text>
          </Text>
        </View>
        {isActive ? <Ionicons name="checkmark-circle" size={24} color="#1F8F5F" /> : null}
      </View>
      <View style={styles.features}>
        {plan.features.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <Ionicons name="checkmark" size={16} color="#1F8F5F" />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>
      <Pressable disabled={isBusy || isActive} style={[styles.planButton, isActive && styles.planButtonActive]} onPress={onSelect}>
        <Text style={[styles.planButtonText, isActive && styles.planButtonActiveText]}>
          {isActive ? 'Current plan' : 'Choose plan'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 22,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  eyebrow: {
    color: '#8A7B70',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#171412',
    fontSize: 30,
    fontWeight: '800',
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#F5F1EC',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  balanceCard: {
    alignItems: 'center',
    backgroundColor: '#2D241E',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
  },
  balanceLabel: {
    color: '#D8D0C8',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  balance: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '900',
    marginTop: 4,
  },
  creditButton: {
    alignItems: 'center',
    backgroundColor: '#F6D36B',
    borderRadius: 22,
    flexDirection: 'row',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  creditButtonText: {
    color: '#2D241E',
    fontSize: 15,
    fontWeight: '900',
  },
  plans: {
    gap: 14,
    marginTop: 18,
  },
  planCard: {
    borderColor: '#EEE5DA',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  planCardActive: {
    borderColor: '#7D2B76',
  },
  planHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  planNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  planName: {
    color: '#201C19',
    fontSize: 22,
    fontWeight: '900',
  },
  badge: {
    backgroundColor: '#F6D36B',
    borderRadius: 10,
    color: '#2D241E',
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  price: {
    color: '#201C19',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 8,
  },
  cadence: {
    color: '#756A61',
    fontSize: 13,
    fontWeight: '700',
  },
  features: {
    gap: 8,
    marginTop: 16,
  },
  featureRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  featureText: {
    color: '#4D443D',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  planButton: {
    alignItems: 'center',
    backgroundColor: '#2D241E',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 46,
  },
  planButtonActive: {
    backgroundColor: '#F5F1EC',
  },
  planButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  planButtonActiveText: {
    color: '#2D241E',
  },
  restoreButton: {
    alignItems: 'center',
    borderColor: '#D8CEC4',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 48,
  },
  restoreText: {
    color: '#2D241E',
    fontSize: 15,
    fontWeight: '900',
  },
  sectionTitle: {
    color: '#2D241E',
    fontSize: 16,
    fontWeight: '900',
    marginBottom: 10,
    marginTop: 24,
  },
  history: {
    borderColor: '#EEE5DA',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  historyRow: {
    alignItems: 'center',
    borderBottomColor: '#EEE5DA',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
    paddingHorizontal: 14,
  },
  historyText: {
    flex: 1,
    minWidth: 0,
  },
  historyTitle: {
    color: '#27221E',
    fontSize: 14,
    fontWeight: '800',
  },
  historyMeta: {
    color: '#766B62',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  amount: {
    fontSize: 15,
    fontWeight: '900',
    marginLeft: 12,
  },
  amountPositive: {
    color: '#1F8F5F',
  },
  amountNegative: {
    color: '#A83B30',
  },
});
