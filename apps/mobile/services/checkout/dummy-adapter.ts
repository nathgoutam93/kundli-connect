import { Alert } from 'react-native';

import type { CheckoutAdapter } from './types';

export function formatAmount(amountMinor: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(
      amountMinor / 100
    );
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(0)}`;
  }
}

/**
 * Test checkout: asks which outcome to simulate. No money moves, and the server only accepts
 * it when PAYMENTS_ALLOW_DUMMY=true.
 */
export const dummyCheckoutAdapter: CheckoutAdapter = {
  provider: 'dummy',

  pay(session) {
    return new Promise((resolve) => {
      Alert.alert(
        'Test payment',
        `${session.productName} · ${formatAmount(session.amountMinor, session.currency)}\n\nNo real money is charged.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve({ status: 'cancelled' }) },
          {
            text: 'Fail',
            style: 'destructive',
            onPress: () => resolve({ status: 'success', payload: { outcome: 'failure' } }),
          },
          { text: 'Pay', onPress: () => resolve({ status: 'success', payload: { outcome: 'success' } }) },
        ],
        { cancelable: true, onDismiss: () => resolve({ status: 'cancelled' }) }
      );
    });
  },
};
