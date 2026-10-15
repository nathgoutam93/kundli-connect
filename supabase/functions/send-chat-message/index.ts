import { HttpError, jsonResponse, readJson, runInBackground, servePost } from "../_shared/http.ts";
import { sendPushToUser } from "../_shared/push.ts";
import { getAdminClient, getUserClient, rpcError } from "../_shared/supabase.ts";

type SentChatMessageResult = {
  id: string;
  createdAt: string;
  senderId: "me";
  text: string;
  status: "sent" | "read";
  senderUserId: string;
  recipientId: string | null;
  senderName: string | null;
};

servePost(async (request) => {
  const body = await readJson<{ chatId?: string; text?: string }>(request);
  const chatId = body.chatId?.trim();
  const text = body.text?.trim();

  if (!chatId) throw new HttpError(400, "Missing chatId");
  if (!text) throw new HttpError(400, "Missing text");

  // send_chat_message checks membership via auth.uid() and writes the message, chat
  // timestamps and the recipient's activity entry in one transaction.
  const { data, error } = await getUserClient(request).rpc("send_chat_message", {
    p_chat_id: chatId,
    p_body: text,
  });

  if (error) throw rpcError(error);
  const message = data as SentChatMessageResult | null;
  if (!message) throw new HttpError(500, "Message send did not return a message record.");

  const recipientId = message.recipientId;
  if (recipientId) {
    runInBackground("Message notification", () =>
      sendPushToUser(getAdminClient(), {
        recipientUserId: recipientId,
        title: "New message",
        body: `${message.senderName || "Someone"}: ${text}`,
        data: { type: "message", chatId, messageId: message.id, fromUserId: message.senderUserId },
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
    },
  });
});
