// deno-lint-ignore-file require-await -- minimal async fakes standing in for Supabase/Expo/Razorpay
import { createHmac } from "node:crypto";
import { getActivePaymentProvider, getProviderByName } from "../_shared/payments/index.ts";
import { razorpayProvider } from "../_shared/payments/razorpay.ts";
import { dummyProvider } from "../_shared/payments/dummy.ts";
import { HttpError } from "../_shared/http.ts";

Deno.env.set("RAZORPAY_KEY_ID", "rzp_test_key");
Deno.env.set("RAZORPAY_KEY_SECRET", "key_secret");
Deno.env.set("RAZORPAY_WEBHOOK_SECRET", "hook_secret");
const sign = (secret: string, msg: string) => createHmac("sha256", secret).update(msg).digest("hex");
async function status(fn: () => Promise<unknown>) { try { await fn(); return 200; } catch (e) { return e instanceof HttpError ? e.status : 500; } }

let requests: { url: string; init: RequestInit }[] = [];
let paymentResponse: Record<string, unknown> = {};
globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
  requests.push({ url, init });
  if (url.endsWith("/orders")) return Response.json({ id: "order_RZP123" });
  if (url.includes("/payments/")) return Response.json(paymentResponse);
  return new Response("{}", { status: 404 });
}) as typeof fetch;

Deno.test("razorpay createOrder sends amount, receipt and basic auth; no secret to client", async () => {
  requests = [];
  const order = await razorpayProvider.createOrder({ id: "6f1c2a9e-1111-4222-8333-444455556666", userId: "u", productName: "25 credits", amountMinor: 19900, currency: "INR" });
  const body = JSON.parse(requests[0].init.body as string);
  const auth = (requests[0].init.headers as Record<string, string>).Authorization;
  if (body.amount !== 19900 || body.receipt.length > 40 || body.receipt.includes("-")) throw new Error(JSON.stringify(body));
  if (auth !== `Basic ${btoa("rzp_test_key:key_secret")}`) throw new Error("auth header");
  if (order.providerOrderId !== "order_RZP123" || JSON.stringify(order.checkout).includes("key_secret")) throw new Error("checkout payload");
});

Deno.test("razorpay verifyCheckout: signature, order binding, capture and amount", async () => {
  const order = { providerOrderId: "order_RZP123", amountMinor: 19900 };
  const good = { razorpay_order_id: "order_RZP123", razorpay_payment_id: "pay_1", razorpay_signature: sign("key_secret", "order_RZP123|pay_1") };
  if (await status(() => razorpayProvider.verifyCheckout(order, { ...good, razorpay_signature: "f".repeat(64) })) !== 400) throw new Error("bad sig accepted");
  if (await status(() => razorpayProvider.verifyCheckout(order, { ...good, razorpay_order_id: "order_OTHER" })) !== 400) throw new Error("other order accepted");
  if (await status(() => razorpayProvider.verifyCheckout(order, {})) !== 400) throw new Error("empty accepted");
  paymentResponse = { status: "captured", amount: 100, order_id: "order_RZP123" };
  if (await status(() => razorpayProvider.verifyCheckout(order, good)) !== 400) throw new Error("amount mismatch accepted");
  paymentResponse = { status: "authorized", amount: 19900, order_id: "order_RZP123" };
  if ((await razorpayProvider.verifyCheckout(order, good)).status !== "pending") throw new Error("authorized should be pending");
  paymentResponse = { status: "captured", amount: 19900, order_id: "order_RZP123" };
  const paid = await razorpayProvider.verifyCheckout(order, good);
  if (paid.status !== "paid" || paid.providerPaymentId !== "pay_1") throw new Error(JSON.stringify(paid));
});

Deno.test("razorpay webhook: signature required, events normalised", async () => {
  const raw = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_9", order_id: "order_RZP123", amount: 19900 } } } });
  const headers = (sig: string) => new Headers({ "x-razorpay-signature": sig, "x-razorpay-event-id": "evt_1" });
  if (await status(() => razorpayProvider.parseWebhook!(raw, headers(sign("wrong", raw)))) !== 401) throw new Error("bad webhook sig accepted");
  const event = await razorpayProvider.parseWebhook!(raw, headers(sign("hook_secret", raw)));
  if (event.eventId !== "evt_1" || event.payment?.providerPaymentId !== "pay_9" || event.payment.amountMinor !== 19900) throw new Error(JSON.stringify(event));
  const failedRaw = JSON.stringify({ event: "payment.failed", payload: { payment: { entity: { id: "pay_x", order_id: "order_RZP123", amount: 19900, error_description: "Card declined" } } } });
  const failed = await razorpayProvider.parseWebhook!(failedRaw, headers(sign("hook_secret", failedRaw)));
  if (failed.failure?.reason !== "Card declined" || failed.payment) throw new Error(JSON.stringify(failed));
});

Deno.test("dummy provider and provider selection", async () => {
  const created = await dummyProvider.createOrder({ id: "o", userId: "u", productName: "p", amountMinor: 9900, currency: "INR" });
  if (created.checkout.testMode !== true) throw new Error("test mode flag");
  if ((await dummyProvider.verifyCheckout({ providerOrderId: "x", amountMinor: 9900 }, { outcome: "success" })).status !== "paid") throw new Error("success");
  if ((await dummyProvider.verifyCheckout({ providerOrderId: "x", amountMinor: 9900 }, { outcome: "nope" })).status !== "failed") throw new Error("failure");

  Deno.env.delete("PAYMENT_PROVIDER"); Deno.env.delete("PAYMENTS_ALLOW_DUMMY");
  if (await status(async () => getActivePaymentProvider()) !== 503) throw new Error("dummy must be off by default");
  Deno.env.set("PAYMENTS_ALLOW_DUMMY", "true");
  if (getActivePaymentProvider().name !== "dummy") throw new Error("dummy when allowed");
  Deno.env.set("PAYMENT_PROVIDER", "razorpay");
  if (getActivePaymentProvider().name !== "razorpay") throw new Error("switch to razorpay");
  Deno.env.delete("PAYMENTS_ALLOW_DUMMY");
  if (await status(async () => getProviderByName("dummy")) !== 503) throw new Error("old dummy orders must not confirm once disabled");
  if (await status(async () => getProviderByName("stripe")) !== 400) throw new Error("unknown provider");
});
