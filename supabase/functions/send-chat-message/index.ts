import { MAX_MESSAGE_LENGTH, requireText, requireUuid } from "../_shared/guards.ts";
import { HttpError, jsonResponse, readJson, runInBackground, servePost } from "../_shared/http.ts";
import { sendPushToUser } from "../_shared/push.ts";
import { getAdminClient, getUserClient, rpcError } from "../_shared/supabase.ts";

type SentChatMessageResult = {
  chatId?: string;
  id: string;
  createdAt: string;
  senderId: "me";
  text: string;
  status: "sent" | "read";
  senderUserId: string;
  recipientId: string | null;
  senderName: string | null;
  clientRequestId: string;
  cached: boolean;
};

servePost(async (request) => {
  const body = await readJson<{ chatId?: string; text?: string; requestId?: string; expectedUserId?: string }>(request);
  const chatId = requireUuid(body.chatId, "chatId");
  const text = requireText(body.text, "text", MAX_MESSAGE_LENGTH);
  const requestId = requireUuid(body.requestId, "requestId");
  const expectedUserId = requireUuid(body.expectedUserId, "expectedUserId");

  // send_chat_message checks membership via auth.uid() and writes the message, chat
  // timestamps and the recipient's activity entry in one transaction.
  const { data, error } = await getUserClient(request).rpc("send_chat_message_once", {
    p_chat_id: chatId,
    p_body: text,
    p_request_id: requestId,
    p_expected_user_id: expectedUserId,
  });

  if (error) throw rpcError(error);
  const message = data as SentChatMessageResult | null;
  if (!message) throw new HttpError(500, "Message send did not return a message record.");

  const recipientId = message.recipientId;
  if (recipientId && !message.cached) {
    runInBackground("Message notification", () =>
      sendPushToUser(getAdminClient(), {
        senderUserId: message.senderUserId,
        recipientUserId: recipientId,
        title: "New message",
        body: `${message.senderName || "Someone"}: ${text}`,
        data: { type: "message", chatId: message.chatId ?? chatId, messageId: message.id, fromUserId: message.senderUserId },
      })
    );
  }

  return jsonResponse({
    message: {
      id: message.id,
      createdAt: message.createdAt,
      senderId: "me",
      text: message.text,
      status: message.status,
      clientRequestId: message.clientRequestId,
    },
  });
});
