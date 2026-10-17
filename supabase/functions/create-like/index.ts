import { MAX_OPENING_MESSAGE_LENGTH, requireText, requireUuid } from "../_shared/guards.ts";
import { HttpError, jsonResponse, readJson, runInBackground, servePost } from "../_shared/http.ts";
import { sendPushToUser } from "../_shared/push.ts";
import { getDisplayName, getRequestContext, rpcError } from "../_shared/supabase.ts";

servePost(async (request) => {
  const body = await readJson<{ targetProfileId?: string; openingMessage?: string }>(request);
  const targetProfileId = requireUuid(body.targetProfileId, "targetProfileId");
  const openingMessage = requireText(body.openingMessage, "openingMessage", MAX_OPENING_MESSAGE_LENGTH);

  const { userId, adminClient, userClient } = await getRequestContext(request);

  const { data, error } = await userClient.rpc("create_like", {
    p_target_profile_id: targetProfileId,
    p_opening_message: openingMessage,
  });
  if (error) throw rpcError(error);
  const result = data as { like: { id: string }; existing: boolean } | null;
  if (!result?.like?.id) throw new HttpError(500, "Like creation did not return a record.");
  if (result.existing) return jsonResponse(result);
  const like = result.like;
  const senderName = await getDisplayName(adminClient, userId);

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
      senderUserId: userId,
      recipientUserId: targetProfileId,
      title: "New like",
      body: `${senderName} sent you a like.`,
      data: { type: "like", likeId: like.id, fromUserId: userId },
    })
  );

  return jsonResponse({ like });
});
