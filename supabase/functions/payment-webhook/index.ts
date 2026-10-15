import { HttpError, jsonResponse, servePost } from "../_shared/http.ts";
import { getProviderByName } from "../_shared/payments/index.ts";
import { getAdminClient, rpcError } from "../_shared/supabase.ts";

// Provider → us notifications (deployed with --no-verify-jwt; the provider signs each request).
// URL: /functions/v1/payment-webhook?provider=razorpay
// Fulfilment is idempotent, so a webhook racing the app's confirm call is harmless.
servePost(async (request) => {
  const providerName = new URL(request.url).searchParams.get("provider") ?? "";
  const provider = getProviderByName(providerName);
  if (!provider.parseWebhook) {
    throw new HttpError(404, "This provider does not use webhooks.");
  }

  const rawBody = await request.text();
  const event = await provider.parseWebhook(rawBody, request.headers);
  const adminClient = getAdminClient();

  const { data: seen } = await adminClient
    .from("payment_webhook_events")
    .select("event_id")
    .eq("provider", provider.name)
    .eq("event_id", event.eventId)
    .maybeSingle();
  if (seen) {
    return jsonResponse({ received: true, duplicate: true });
  }

  const providerOrderId = event.payment?.providerOrderId ?? event.failure?.providerOrderId;
  if (providerOrderId) {
    const { data: order, error } = await adminClient
      .from("payment_orders")
      .select("id")
      .eq("provider", provider.name)
      .eq("provider_order_id", providerOrderId)
      .maybeSingle<{ id: string }>();
    if (error) throw error;

    if (order && event.payment) {
      const { error: fulfillError } = await adminClient.rpc("fulfill_payment_order", {
        p_order_id: order.id,
        p_provider_payment_id: event.payment.providerPaymentId,
        p_amount_minor: event.payment.amountMinor,
      });
      // Throwing makes the provider retry; the event is only recorded once handled.
      if (fulfillError) throw rpcError(fulfillError);
    } else if (order && event.failure) {
      await adminClient.rpc("fail_payment_order", { p_order_id: order.id, p_reason: event.failure.reason });
    }
  }

  await adminClient
    .from("payment_webhook_events")
    .upsert(
      { provider: provider.name, event_id: event.eventId, event_type: event.eventType, payload: JSON.parse(rawBody) },
      { onConflict: "provider,event_id", ignoreDuplicates: true },
    );

  return jsonResponse({ received: true });
});
