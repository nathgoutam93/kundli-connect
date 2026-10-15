import { colors } from '@/constants/theme';

import type { CheckoutAdapter } from './types';

/**
 * The subset of `react-native-razorpay` this adapter uses. Typed locally so the app builds
 * without the native SDK installed; see ./index.ts for how to enable it.
 */
export type RazorpayCheckoutModule = {
  open(options: Record<string, unknown>): Promise<{
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }>;
};

type RazorpaySession = {
  keyId: string;
  razorpayOrderId: string;
  amountMinor: number;
  currency: string;
  name: string;
  description: string;
};

function errorDescription(error: unknown) {
  if (error && typeof error === 'object' && 'description' in error) {
    return String((error as { description: unknown }).description);
  }
  return error instanceof Error ? error.message : 'Payment failed';
}

/** Razorpay Standard Checkout via the official React Native SDK. */
export function createRazorpayCheckoutAdapter(razorpay: RazorpayCheckoutModule): CheckoutAdapter {
  return {
    provider: 'razorpay',

    async pay(session, customer) {
      const checkout = session.checkout as RazorpaySession;

      try {
        const response = await razorpay.open({
          key: checkout.keyId,
          order_id: checkout.razorpayOrderId,
          amount: checkout.amountMinor,
          currency: checkout.currency,
          name: checkout.name,
          description: checkout.description,
          prefill: {
            name: customer.name ?? '',
            email: customer.email ?? '',
            contact: customer.phone ?? '',
          },
          theme: { color: colors.accent },
        });

        return { status: 'success', payload: { ...response } };
      } catch (error) {
        const description = errorDescription(error);
        // The SDK reports a closed sheet as an error; its codes differ by platform, the text does not.
        if (/cancel/i.test(description)) {
          return { status: 'cancelled' };
        }
        return { status: 'failed', reason: description };
      }
    },
  };
}
