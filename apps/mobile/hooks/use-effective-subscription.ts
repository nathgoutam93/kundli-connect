import { useEffect, useState } from 'react';
import type { SubscriptionState } from '@/constants/mock-data';

export function effectiveSubscription(subscription: SubscriptionState, now = Date.now()): SubscriptionState {
  return subscription.status === 'active' && (!Number.isFinite(subscription.expiresAt) || !subscription.expiresAt || subscription.expiresAt <= now)
    ? { ...subscription, status: 'expired' } : subscription;
}

/** Expire locally even if the expiration refresh cannot reach the server. */
export function useEffectiveSubscription(subscription: SubscriptionState) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (subscription.status !== 'active' || !subscription.expiresAt || subscription.expiresAt <= Date.now()) return;
    const timer = setTimeout(() => setTick((value) => value + 1), Math.min(subscription.expiresAt - Date.now() + 1, 2147483647));
    return () => clearTimeout(timer);
  }, [subscription.status, subscription.expiresAt, tick]);
  return effectiveSubscription(subscription);
}
