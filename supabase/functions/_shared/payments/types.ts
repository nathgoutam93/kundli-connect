export type ProviderName = "dummy" | "razorpay";

/** The internal order as a provider needs to see it. Amounts are in minor units (paise). */
export type CheckoutOrder = {
  id: string;
  userId: string;
  productName: string;
  amountMinor: number;
  currency: string;
};

export type ProviderOrder = {
  providerOrderId: string;
  /**
   * Everything the app's checkout adapter needs to show the provider's payment UI. Sent to
   * the client, so it must never contain secrets.
   */
  checkout: Record<string, unknown>;
};

export type PaymentVerification =
  | { status: "paid"; providerPaymentId: string; amountMinor: number }
  /** Authorised but not yet captured; the webhook completes it. */
  | { status: "pending" }
  | { status: "failed"; reason: string };

export type WebhookEvent = {
  eventId: string;
  eventType: string;
  payment?: { providerOrderId: string; providerPaymentId: string; amountMinor: number };
  failure?: { providerOrderId: string; reason: string };
};

/**
 * A payment provider. To add one, implement this interface and register it in index.ts; the
 * Edge Functions and the database never deal with provider specifics.
 */
export interface PaymentProvider {
  readonly name: ProviderName;
  /** Creates the provider-side order for an internal order. */
  createOrder(order: CheckoutOrder): Promise<ProviderOrder>;
  /**
   * Verifies the result the app's checkout adapter sent back. Must not trust the client: check
   * signatures and/or ask the provider. Throws HttpError(400) for tampered payloads.
   */
  verifyCheckout(
    order: { providerOrderId: string; amountMinor: number },
    payload: Record<string, unknown>,
  ): Promise<PaymentVerification>;
  /** Authenticates and normalises a webhook delivery. Throws HttpError(401) on a bad signature. */
  parseWebhook?(rawBody: string, headers: Headers): Promise<WebhookEvent>;
}
