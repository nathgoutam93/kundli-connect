import { HttpError, jsonResponse, readJson, servePost } from "../_shared/http.ts";
import { getActivePaymentProvider } from "../_shared/payments/index.ts";
import { getRequestContext, rpcError } from "../_shared/supabase.ts";

type PaymentOrderRow = {
  id: string;
  user_id: string;
  product_name: string;
  amount_minor: number;
  currency: string;
};

const productTypes = new Set(["credit_pack", "subscription"]);

// Starts a purchase: snapshots the catalog price into a payment order, creates the matching
// order with the active provider and returns what the app's checkout adapter needs.
servePost(async (request) => {
  const body = await readJson<{ productType?: string; productId?: string }>(request);
  const productType = body.productType ?? "";
  const productId = body.productId?.trim() ?? "";

  if (!productTypes.has(productType)) throw new HttpError(400, "Invalid productType");
  if (!/^[a-z0-9-]{1,64}$/.test(productId)) throw new HttpError(400, "Invalid productId");

  const provider = getActivePaymentProvider();
  const { userId, adminClient } = await getRequestContext(request);

  const { data, error } = await adminClient.rpc("create_payment_order", {
    p_user_id: userId,
    p_product_type: productType,
    p_product_id: productId,
    p_provider: provider.name,
  });
  if (error) throw rpcError(error);
  const order = data as PaymentOrderRow;

  try {
    const providerOrder = await provider.createOrder({
      id: order.id,
      userId,
      productName: order.product_name,
      amountMinor: order.amount_minor,
      currency: order.currency,
    });

    const { error: updateError } = await adminClient
      .from("payment_orders")
      .update({ provider_order_id: providerOrder.providerOrderId })
      .eq("id", order.id);
    if (updateError) throw updateError;

    return jsonResponse({
      orderId: order.id,
      provider: provider.name,
      productName: order.product_name,
      amountMinor: order.amount_minor,
      currency: order.currency,
      checkout: providerOrder.checkout,
    });
  } catch (error) {
    await adminClient.rpc("fail_payment_order", {
      p_order_id: order.id,
      p_reason: error instanceof Error ? error.message : "Could not start checkout",
    });
    throw error instanceof HttpError ? error : new HttpError(502, "Could not start checkout.");
  }
});
