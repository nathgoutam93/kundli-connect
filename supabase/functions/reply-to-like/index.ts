import { MAX_MESSAGE_LENGTH, requireText, requireUuid } from "../_shared/guards.ts";
import { HttpError, jsonResponse, readJson, runInBackground, servePost } from "../_shared/http.ts";
import { sendPushToUser } from "../_shared/push.ts";
import { getAdminClient, getUserClient, rpcError } from "../_shared/supabase.ts";

type ReplyResult = {
  chatId: string;
  recipientId: string;
  replierName: string | null;
  replierId: string;
  isNewMatch: boolean;
  cached: boolean;
};

servePost(async (request) => {
  const body = await readJson<{ likeId?: string; message?: string; requestId?: string; expectedUserId?: string }>(request);
  const likeId = requireUuid(body.likeId, "likeId");
  const message = requireText(body.message, "message", MAX_MESSAGE_LENGTH);
  const requestId = requireUuid(body.requestId, "requestId");
  const expectedUserId = requireUuid(body.expectedUserId, "expectedUserId");

  // reply_to_like verifies the caller is the like's recipient and creates the chat,
  // participants, opening messages and activity atomically.
  const { data, error } = await getUserClient(request).rpc("reply_to_like_once", {
    p_like_id: likeId,
    p_message: message,
    p_request_id: requestId,
    p_expected_user_id: expectedUserId,
  });

  if (error) throw rpcError(error);
  const result = data as ReplyResult | null;
  if (!result?.chatId) throw new HttpError(500, "Reply did not return a chat.");

  const replierName = result.replierName || "Someone";
  if (!result.cached) runInBackground("Match notification", () =>
    sendPushToUser(getAdminClient(), {
      senderUserId: result.replierId,
      recipientUserId: result.recipientId,
      title: result.isNewMatch ? "It's a match" : "New message",
      body: result.isNewMatch ? `${replierName} replied to your like.` : `${replierName}: ${message}`,
      data: result.isNewMatch
        ? { type: "match", likeId, chatId: result.chatId }
        : { type: "message", chatId: result.chatId },
    })
  );

  // `chat.id` keeps builds that predate `chatId` working.
  return jsonResponse({ chatId: result.chatId, requestId, isNewMatch: result.isNewMatch, chat: { id: result.chatId } });
});
