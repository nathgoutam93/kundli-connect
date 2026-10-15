import { getSupabaseClient } from '@/lib/supabase';

import { dummyCheckoutAdapter } from './dummy-adapter';
import type {
  CheckoutAdapter,
  CheckoutAdapterResult,
  CheckoutCustomer,
  CheckoutSession,
  ProductType,
  PurchaseOutcome,
} from './types';

export * from './types';
export { formatAmount } from './dummy-adapter';

/**
 * Checkout adapters by provider name. The server picks the provider (PAYMENT_PROVIDER secret);
 * the app just needs an adapter for it.
 *
 * To enable Razorpay once the account is ready:
 *   1. npx expo install react-native-razorpay   (then rebuild the dev/production app)
 *   2. Add here:
 *        import RazorpayCheckout from 'react-native-razorpay';
 *        import { createRazorpayCheckoutAdapter } from './razorpay-adapter';
 *        ...
 *        razorpay: createRazorpayCheckoutAdapter(RazorpayCheckout),
 *   3. Set PAYMENT_PROVIDER=razorpay and the RAZORPAY_* secrets on Supabase.
 */
export const checkoutAdapters: Record<string, CheckoutAdapter> = {
  dummy: dummyCheckoutAdapter,
};

type InvokeFunction = <T>(name: string, body: Record<string, unknown>) => Promise<T>;

async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>) {
  const { data, error } = await getSupabaseClient().functions.invoke<T>(name, { body });
  if (error) {
    // Surface the function's own error message (e.g. "Payments are not available yet.").
    const context = (error as { context?: Response }).context;
    const message = await context?.json?.().then((json: { error?: string }) => json.error).catch(() => undefined);
    throw new Error(message || error.message);
  }
  if (!data) {
    throw new Error(`${name} returned no data.`);
  }
  return data;
}

/**
 * Runs a purchase end to end: create the order on the server, show the provider's payment UI,
 * then let the server verify and fulfil it. Dependencies are injectable for tests.
 */
export async function purchaseProduct(
  product: { type: ProductType; id: string },
  customer: CheckoutCustomer,
  deps: { invoke?: InvokeFunction; adapters?: Record<string, CheckoutAdapter> } = {}
): Promise<PurchaseOutcome> {
  const invoke = deps.invoke ?? invokeEdgeFunction;
  const adapters = deps.adapters ?? checkoutAdapters;

  const session = await invoke<CheckoutSession>('create-checkout', {
    productType: product.type,
    productId: product.id,
  });

  const adapter = adapters[session.provider];
  let result: CheckoutAdapterResult;
  if (!adapter) {
    result = { status: 'failed', reason: `This app version cannot pay with ${session.provider}. Please update.` };
  } else {
    try {
      result = await adapter.pay(session, customer);
    } catch (error) {
      result = { status: 'failed', reason: error instanceof Error ? error.message : 'Payment failed' };
    }
  }

  // Always report back, so cancelled and failed orders are closed on the server too.
  const confirmation = await invoke<{ status: PurchaseOutcome['status']; reason?: string }>('confirm-checkout', {
    orderId: session.orderId,
    result,
  });

  if (confirmation.status === 'failed') {
    return {
      status: 'failed',
      orderId: session.orderId,
      reason: confirmation.reason ?? (result.status === 'failed' ? result.reason : 'Payment failed'),
    };
  }

  return { status: confirmation.status, orderId: session.orderId } as PurchaseOutcome;
}
