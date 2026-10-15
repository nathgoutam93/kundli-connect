import { requireUuid } from "../_shared/guards.ts";
import { HttpError, jsonResponse, readJson, servePost } from "../_shared/http.ts";
import { getProviderByName } from "../_shared/payments/index.ts";
import { getRequestContext, rpcError } from "../_shared/supabase.ts";

type CheckoutResult = {
  status?: "success" | "cancelled" | "failed";
  payload?: Record<string, unknown>;
  reason?: string;
};

type OrderRow = {
  id: string;
  status: "created" | "paid" | "failed";
  provider: string;
  provider_order_id: string | null;
  amount_minor: number;
};

// Called by the app after the provider's payment UI closes. The provider verifies the result
// (never trusting the client) before the order is fulfilled.
servePost(async (request) => {
  const body = await readJson<{ orderId?: string; result?: CheckoutResult }>(request);
  const orderId = requireUuid(body.orderId, "orderId");
  const result = body.result ?? {};

  const { userId, adminClient } = await getRequestContext(request);

  const { data: order, error } = await adminClient
    .from("payment_orders")
    .select("id, status, provider, provider_order_id, amount_minor")
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle<OrderRow>();
  if (error) throw error;
  if (!order) throw new HttpError(404, "Order not found.");

  if (order.status === "paid") {
    return jsonResponse({ orderId, status: "paid", alreadyFulfilled: true });
  }

  if (result.status !== "success") {
    const reason = result.status === "cancelled" ? "Cancelled by user" : (result.reason || "Payment failed");
    await adminClient.rpc("fail_payment_order", { p_order_id: orderId, p_reason: reason });
    return jsonResponse({ orderId, status: result.status === "cancelled" ? "cancelled" : "failed", reason });
  }

  if (!order.provider_order_id) throw new HttpError(409, "Checkout was not started for this order.");

  const provider = getProviderByName(order.provider);
  const verification = await provider.verifyCheckout(
    { providerOrderId: order.provider_order_id, amountMinor: order.amount_minor },
    result.payload ?? {},
  );

  if (verification.status === "pending") {
    return jsonResponse({ orderId, status: "pending" });
  }

  if (verification.status === "failed") {
    await adminClient.rpc("fail_payment_order", { p_order_id: orderId, p_reason: verification.reason });
    return jsonResponse({ orderId, status: "failed", reason: verification.reason });
  }

  const { data: fulfillment, error: fulfillError } = await adminClient.rpc("fulfill_payment_order", {
    p_order_id: orderId,
    p_provider_payment_id: verification.providerPaymentId,
    p_amount_minor: verification.amountMinor,
  });
  if (fulfillError) throw rpcError(fulfillError);

  return jsonResponse({ orderId, status: "paid", fulfillment });
});
