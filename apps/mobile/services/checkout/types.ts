export type ProductType = 'credit_pack' | 'subscription';

/** Returned by the create-checkout Edge Function. */
export type CheckoutSession = {
  orderId: string;
  /** Chosen by the server (PAYMENT_PROVIDER); the app picks the matching adapter. */
  provider: string;
  productName: string;
  amountMinor: number;
  currency: string;
  /** Provider-specific data for the adapter (e.g. Razorpay key id and order id). */
  checkout: Record<string, unknown>;
};

/** What a provider's payment UI produced. The server verifies `payload` before fulfilling. */
export type CheckoutAdapterResult =
  | { status: 'success'; payload: Record<string, unknown> }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

export type CheckoutCustomer = {
  name?: string;
  email?: string;
  phone?: string;
};

/**
 * Presents one provider's payment UI. Adapters never decide whether a payment succeeded; they
 * hand the provider's response to confirm-checkout, which verifies it server-side.
 */
export interface CheckoutAdapter {
  readonly provider: string;
  pay(session: CheckoutSession, customer: CheckoutCustomer): Promise<CheckoutAdapterResult>;
}

export type PurchaseOutcome =
  | { status: 'paid'; orderId: string }
  /** Payment authorised but not captured yet; credits arrive when the provider confirms. */
  | { status: 'pending'; orderId: string }
  | { status: 'cancelled'; orderId: string }
  | { status: 'failed'; orderId?: string; reason: string };
