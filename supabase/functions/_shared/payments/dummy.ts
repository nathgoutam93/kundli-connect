import type { PaymentProvider } from "./types.ts";

/**
 * Test-only provider: no money moves. The app shows a "test payment" prompt and reports the
 * chosen outcome. Only enabled when PAYMENTS_ALLOW_DUMMY=true (see index.ts).
 */
export const dummyProvider: PaymentProvider = {
  name: "dummy",

  createOrder(order) {
    return Promise.resolve({
      providerOrderId: `dummy_order_${crypto.randomUUID()}`,
      checkout: {
        testMode: true,
        productName: order.productName,
        amountMinor: order.amountMinor,
        currency: order.currency,
      },
    });
  },

  verifyCheckout(order, payload) {
    if (payload.outcome === "success") {
      return Promise.resolve({
        status: "paid",
        providerPaymentId: `dummy_payment_${crypto.randomUUID()}`,
        amountMinor: order.amountMinor,
      });
    }

    return Promise.resolve({ status: "failed", reason: "Test payment declined" });
  },
};
