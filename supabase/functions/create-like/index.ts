import {
  assertCanInteract,
  MAX_OPENING_MESSAGE_LENGTH,
  refundCredit,
  requireText,
  requireUuid,
  spendCredit,
} from "../_shared/guards.ts";
import { HttpError, jsonResponse, readJson, runInBackground, servePost } from "../_shared/http.ts";
import { sendPushToUser } from "../_shared/push.ts";
import { getDisplayName, getRequestContext, orderedPair } from "../_shared/supabase.ts";

const likeColumns = "id, from_user_id, to_user_id, opening_message, match_score_id, status, created_at";

servePost(async (request) => {
  const body = await readJson<{ targetProfileId?: string; openingMessage?: string }>(request);
  const targetProfileId = requireUuid(body.targetProfileId, "targetProfileId");
  const openingMessage = requireText(body.openingMessage, "openingMessage", MAX_OPENING_MESSAGE_LENGTH);

  const { userId, adminClient } = await getRequestContext(request);

  const pair = orderedPair(userId, targetProfileId);
  const [, matchScoreResult, existingLikeResult, senderName] = await Promise.all([
    assertCanInteract(adminClient, userId, targetProfileId),
    adminClient
      .from("match_scores")
      .select("id")
      .eq("user_a_id", pair.userAId)
      .eq("user_b_id", pair.userBId)
      .maybeSingle<{ id: string }>(),
    adminClient
      .from("likes")
      .select(likeColumns)
      .eq("from_user_id", userId)
      .eq("to_user_id", targetProfileId)
      .maybeSingle(),
    getDisplayName(adminClient, userId),
  ]);

  if (matchScoreResult.error) throw matchScoreResult.error;
  if (existingLikeResult.error) throw existingLikeResult.error;

  if (existingLikeResult.data) {
    return jsonResponse({ like: existingLikeResult.data, existing: true });
  }

  if (!matchScoreResult.data) {
    throw new HttpError(400, "Generate a match score before sending a like.");
  }

  const { transactionId } = await spendCredit(adminClient, userId, `Sent a like to ${targetProfileId}`);

  const { data: like, error: likeError } = await adminClient
    .from("likes")
    .insert({
      from_user_id: userId,
      to_user_id: targetProfileId,
      opening_message: openingMessage,
      match_score_id: matchScoreResult.data.id,
      status: "pending",
    })
    .select(likeColumns)
    .single();

  if (likeError) {
    await refundCredit(adminClient, transactionId);
    // A concurrent request for the same pair won the unique constraint; that like stands.
    if (likeError.code === "23505") throw new HttpError(409, "Like already sent.");
    throw likeError;
  }

  const { error: activityError } = await adminClient.from("activity_events").insert([
    {
      user_id: userId,
      event_type: "like",
      title: "You sent a like",
      description: openingMessage,
      metadata: { likeId: like.id, targetProfileId },
    },
    {
      user_id: targetProfileId,
      event_type: "like",
      title: `${senderName} liked your profile`,
      description: openingMessage,
      metadata: { likeId: like.id, fromUserId: userId },
    },
  ]);
  if (activityError) console.error("Failed to record like activity.", activityError);

  runInBackground("Like notification", () =>
    sendPushToUser(adminClient, {
      recipientUserId: targetProfileId,
      title: "New like",
      body: `${senderName} sent you a like.`,
      data: { type: "like", likeId: like.id, fromUserId: userId },
    })
  );

  return jsonResponse({ like });
});
