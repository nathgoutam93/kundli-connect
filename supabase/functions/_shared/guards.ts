import type { SupabaseClient } from "npm:@supabase/supabase-js@2.106.2";

import { HttpError } from "./http.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Matches the length checks on likes.opening_message and messages.body. */
export const MAX_OPENING_MESSAGE_LENGTH = 300;
export const MAX_MESSAGE_LENGTH = 2000;

export function requireUuid(value: unknown, field: string) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) throw new HttpError(400, `Missing ${field}`);
  if (!uuidPattern.test(id)) throw new HttpError(400, `Invalid ${field}`);
  return id;
}

export function requireText(value: unknown, field: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new HttpError(400, `Missing ${field}`);
  if (text.length > maxLength) {
    throw new HttpError(400, `${field} must be ${maxLength} characters or fewer`);
  }
  return text;
}

/**
 * A user may score or like a profile only if it is completed and discoverable, or the two are
 * already connected through a like, and never when either has blocked the other or the profile
 * is suspended. Stops spending credits and astrology calls on hidden or unfinished profiles, and
 * probing profiles by guessing ids.
 */
export async function assertCanInteract(adminClient: SupabaseClient, viewerId: string, targetId: string) {
  if (viewerId === targetId) {
    throw new HttpError(400, "You cannot do this with your own profile.");
  }

  const [targetResult, connectionResult, blockResult] = await Promise.all([
    adminClient
      .from("profiles")
      .select("onboarding_completed, is_discoverable, suspended_at")
      .eq("id", targetId)
      .maybeSingle<{ onboarding_completed: boolean; is_discoverable: boolean; suspended_at: string | null }>(),
    adminClient
      .from("likes")
      .select("id", { count: "exact", head: true })
      .or(
        `and(from_user_id.eq.${viewerId},to_user_id.eq.${targetId}),and(from_user_id.eq.${targetId},to_user_id.eq.${viewerId})`,
      ),
    adminClient
      .from("user_blocks")
      .select("blocker_id", { count: "exact", head: true })
      .or(
        `and(blocker_id.eq.${viewerId},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${viewerId})`,
      ),
  ]);

  if (targetResult.error) throw targetResult.error;
  if (connectionResult.error) throw connectionResult.error;
  if (blockResult.error) throw blockResult.error;

  const target = targetResult.data;
  const isVisible = Boolean(target?.onboarding_completed && target.is_discoverable);
  // Blocked and suspended look the same as missing, so neither can be probed.
  if (!target || target.suspended_at || blockResult.count || (!isVisible && !connectionResult.count)) {
    throw new HttpError(404, "Profile not found.");
  }
}

/**
 * Spends one credit via the service-only SQL function (serialised per user). Active
 * subscribers are allowed without a debit, in which case transactionId is null.
 */
export async function spendCredit(adminClient: SupabaseClient, userId: string, reason: string) {
  const { data, error } = await adminClient.rpc("spend_user_credit", {
    p_user_id: userId,
    p_reason: reason,
  });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as
    | { allowed: boolean; transaction_id: string | null }
    | null;
  if (!row?.allowed) throw new HttpError(402, "Credits needed");
  return { transactionId: row.transaction_id };
}

/** Reverses a debit from spendCredit at most once; a no-op for subscribers (no debit). */
export async function refundCredit(adminClient: SupabaseClient, transactionId: string | null) {
  if (!transactionId) return;
  const { error } = await adminClient.rpc("refund_credit_transaction", {
    p_transaction_id: transactionId,
  });
  if (error) console.error("Failed to refund credit.", error);
}
