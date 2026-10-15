import { HttpError, requiredEnv } from "../http.ts";
import type { PaymentProvider, WebhookEvent } from "./types.ts";

// Razorpay Orders + Standard Checkout.
// Docs: https://razorpay.com/docs/payments/server-integration/
//
// Required secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET for the
// payment-webhook function. Point the dashboard webhook at
//   https://<project>.supabase.co/functions/v1/payment-webhook?provider=razorpay
// with the events payment.captured, order.paid and payment.failed.

const apiBase = Deno.env.get("RAZORPAY_API_BASE") ?? "https://api.razorpay.com/v1";
const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison so signature checks do not leak timing information. */
export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function authHeader() {
  return `Basic ${btoa(`${requiredEnv("RAZORPAY_KEY_ID")}:${requiredEnv("RAZORPAY_KEY_SECRET")}`)}`;
}

async function razorpayRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const description = (body as { error?: { description?: string } }).error?.description;
    throw new HttpError(502, `Razorpay request failed: ${description ?? response.status}`);
  }
  return body as T;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export const razorpayProvider: PaymentProvider = {
  name: "razorpay",

  async createOrder(order) {
    const created = await razorpayRequest<{ id: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: order.amountMinor,
        currency: order.currency,
        // Razorpay receipts are limited to 40 characters; a dashless UUID is 32.
        receipt: order.id.replaceAll("-", ""),
        notes: { orderId: order.id, userId: order.userId },
      }),
    });

    return {
      providerOrderId: created.id,
      checkout: {
        keyId: requiredEnv("RAZORPAY_KEY_ID"),
        razorpayOrderId: created.id,
        amountMinor: order.amountMinor,
        currency: order.currency,
        name: "Kundali Konnect",
        description: order.productName,
      },
    };
  },

  async verifyCheckout(order, payload) {
    const razorpayOrderId = asString(payload.razorpay_order_id);
    const paymentId = asString(payload.razorpay_payment_id);
    const signature = asString(payload.razorpay_signature);

    if (!razorpayOrderId || !paymentId || !signature) {
      throw new HttpError(400, "Incomplete Razorpay payment response.");
    }
    if (razorpayOrderId !== order.providerOrderId) {
      throw new HttpError(400, "Payment does not belong to this order.");
    }

    const expected = await hmacSha256Hex(requiredEnv("RAZORPAY_KEY_SECRET"), `${razorpayOrderId}|${paymentId}`);
    if (!timingSafeEqual(expected, signature)) {
      throw new HttpError(400, "Invalid payment signature.");
    }

    // The signature proves Razorpay issued this payment for this order; also confirm it was
    // captured for the full amount before granting anything.
    const payment = await razorpayRequest<{ status: string; amount: number; order_id: string }>(
      `/payments/${encodeURIComponent(paymentId)}`,
    );

    if (payment.order_id !== razorpayOrderId || payment.amount !== order.amountMinor) {
      throw new HttpError(400, "Payment does not match the order.");
    }
    if (payment.status === "captured") {
      return { status: "paid", providerPaymentId: paymentId, amountMinor: payment.amount };
    }
    if (payment.status === "authorized") {
      return { status: "pending" };
    }
    return { status: "failed", reason: `Payment ${payment.status}` };
  },

  async parseWebhook(rawBody, headers) {
    const signature = headers.get("x-razorpay-signature") ?? "";
    const expected = await hmacSha256Hex(requiredEnv("RAZORPAY_WEBHOOK_SECRET"), rawBody);
    if (!signature || !timingSafeEqual(expected, signature)) {
      throw new HttpError(401, "Invalid webhook signature.");
    }

    const body = JSON.parse(rawBody) as {
      event: string;
      payload?: {
        payment?: { entity?: { id: string; order_id: string; amount: number; error_description?: string } };
        order?: { entity?: { id: string } };
      };
    };
    const payment = body.payload?.payment?.entity;
    const event: WebhookEvent = {
      eventId: headers.get("x-razorpay-event-id") ?? `${body.event}:${payment?.id ?? body.payload?.order?.entity?.id ?? ""}`,
      eventType: body.event,
    };

    if ((body.event === "payment.captured" || body.event === "order.paid") && payment?.order_id) {
      event.payment = { providerOrderId: payment.order_id, providerPaymentId: payment.id, amountMinor: payment.amount };
    } else if (body.event === "payment.failed" && payment?.order_id) {
      event.failure = { providerOrderId: payment.order_id, reason: payment.error_description ?? "Payment failed" };
    }

    return event;
  },
};
