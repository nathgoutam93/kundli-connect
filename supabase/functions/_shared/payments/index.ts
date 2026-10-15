import { HttpError } from "../http.ts";
import { dummyProvider } from "./dummy.ts";
import { razorpayProvider } from "./razorpay.ts";
import type { PaymentProvider, ProviderName } from "./types.ts";

export type * from "./types.ts";

const providers: Record<ProviderName, PaymentProvider> = {
  dummy: dummyProvider,
  razorpay: razorpayProvider,
};

function isDummyAllowed() {
  return Deno.env.get("PAYMENTS_ALLOW_DUMMY") === "true";
}

/**
 * Provider for an existing order (confirm / webhook). Orders are always verified by the
 * provider that created them, and dummy orders stop working once the dummy is disabled.
 */
export function getProviderByName(name: string): PaymentProvider {
  const provider = providers[name as ProviderName];
  if (!provider) {
    throw new HttpError(400, `Unknown payment provider: ${name}`);
  }
  if (provider.name === "dummy" && !isDummyAllowed()) {
    throw new HttpError(503, "Payments are not available yet.");
  }
  return provider;
}

/**
 * Provider for new checkouts, chosen by the PAYMENT_PROVIDER secret (default "dummy").
 * Switching to Razorpay is: set PAYMENT_PROVIDER=razorpay plus the RAZORPAY_* secrets.
 */
export function getActivePaymentProvider(): PaymentProvider {
  return getProviderByName(Deno.env.get("PAYMENT_PROVIDER") ?? "dummy");
}
