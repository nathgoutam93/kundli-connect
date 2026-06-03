import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

type LikeRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  opening_message: string | null;
  match_score_id: string | null;
  status: "pending" | "matched" | "dismissed";
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type ProfilePhotoRow = {
  storage_path: string;
};

type MatchScoreRow = {
  compatibility_report: { overallScore?: number } | null;
};

type ChatRow = {
  id: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  created_at: string;
  sender_id: string;
  body: string;
  status: "sent" | "read";
  read_at: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: corsHeaders,
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name} secret.`);
  }
  return value;
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let supabaseUrl: string;
  let supabaseAnonKey: string;
  let supabaseServiceRoleKey: string;

  try {
    supabaseUrl = requiredEnv("SUPABASE_URL");
    supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
    supabaseServiceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Missing Edge Function secret.";
    return jsonResponse({ error: message }, 500);
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  let body: { likeId?: string; message?: string };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const likeId = body.likeId?.trim();
  const replyMessage = body.message?.trim();

  if (!likeId) {
    return jsonResponse({ error: "Missing likeId" }, 400);
  }

  if (!replyMessage) {
    return jsonResponse({ error: "Missing message" }, 400);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: like, error: likeError } = await adminClient
    .from("likes")
    .select(
      "id, from_user_id, to_user_id, opening_message, match_score_id, status, created_at",
    )
    .eq("id", likeId)
    .eq("to_user_id", user.id)
    .maybeSingle<LikeRow>();

  if (likeError) {
    return jsonResponse({ error: likeError.message }, 500);
  }

  if (!like) {
    return jsonResponse({ error: "Like not found." }, 404);
  }

  if (like.status === "dismissed") {
    return jsonResponse({ error: "Cannot reply to a dismissed like." }, 400);
  }

  const now = new Date().toISOString();

  const { data: existingChat, error: existingChatError } = await adminClient
    .from("chats")
    .select("id, created_at, updated_at")
    .eq("like_id", like.id)
    .maybeSingle<ChatRow>();

  if (existingChatError) {
    return jsonResponse({ error: existingChatError.message }, 500);
  }

  let chat = existingChat;

  if (!chat) {
    const { data: newChat, error: chatError } = await adminClient
      .from("chats")
      .insert({
        like_id: like.id,
        created_at: now,
        updated_at: now,
      })
      .select("id, created_at, updated_at")
      .single<ChatRow>();

    if (chatError) {
      return jsonResponse({ error: chatError.message }, 500);
    }

    chat = newChat;
  }

  const { error: participantError } = await adminClient
    .from("chat_participants")
    .upsert(
      [
        { chat_id: chat.id, user_id: like.from_user_id, last_read_at: null },
        { chat_id: chat.id, user_id: user.id, last_read_at: now },
      ],
      { onConflict: "chat_id,user_id" },
    );

  if (participantError) {
    return jsonResponse({ error: participantError.message }, 500);
  }

  const { error: updateLikeError } = await adminClient
    .from("likes")
    .update({ status: "matched" })
    .eq("id", like.id);

  if (updateLikeError) {
    return jsonResponse({ error: updateLikeError.message }, 500);
  }

  const { data: existingMessages, error: existingMessagesError } =
    await adminClient
      .from("messages")
      .select("id, created_at, sender_id, body, status, read_at")
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: true })
      .returns<MessageRow[]>();

  if (existingMessagesError) {
    return jsonResponse({ error: existingMessagesError.message }, 500);
  }

  let messages = existingMessages ?? [];

  if (messages.length === 0) {
    const openingMessage = like.opening_message?.trim() || "Sent you a like.";
    const { data: insertedMessages, error: messageError } = await adminClient
      .from("messages")
      .insert([
        {
          chat_id: chat.id,
          sender_id: like.from_user_id,
          body: openingMessage,
          created_at: like.created_at,
          status: "read",
          read_at: now,
        },
        {
          chat_id: chat.id,
          sender_id: user.id,
          body: replyMessage,
          created_at: now,
          status: "sent",
        },
      ])
      .select("id, created_at, sender_id, body, status, read_at")
      .order("created_at", { ascending: true })
      .returns<MessageRow[]>();

    if (messageError) {
      return jsonResponse({ error: messageError.message }, 500);
    }

    messages = insertedMessages ?? [];
  }

  const { data: updatedChat, error: updatedChatError } = await adminClient
    .from("chats")
    .update({ updated_at: now })
    .eq("id", chat.id)
    .select("id, created_at, updated_at")
    .single<ChatRow>();

  if (updatedChatError) {
    return jsonResponse({ error: updatedChatError.message }, 500);
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, display_name")
    .eq("id", like.from_user_id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    return jsonResponse({ error: profileError.message }, 500);
  }

  const { data: photoRows, error: photoError } = await adminClient
    .from("profile_photos")
    .select("storage_path")
    .eq("user_id", like.from_user_id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .returns<ProfilePhotoRow[]>();

  if (photoError) {
    return jsonResponse({ error: photoError.message }, 500);
  }

  const { data: matchScore, error: matchScoreError } = like.match_score_id
    ? await adminClient
        .from("match_scores")
        .select("compatibility_report")
        .eq("id", like.match_score_id)
        .maybeSingle<MatchScoreRow>()
    : { data: null, error: null };

  if (matchScoreError) {
    return jsonResponse({ error: matchScoreError.message }, 500);
  }

  const firstPhoto = photoRows?.[0]?.storage_path;
  const avatarUrl = firstPhoto
    ? adminClient.storage.from("profile-photos").getPublicUrl(firstPhoto).data
        .publicUrl
    : "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=85";

  return jsonResponse({
    chat: {
      id: updatedChat.id,
      createdAt: updatedChat.created_at,
      updatedAt: updatedChat.updated_at,
      participantId: like.from_user_id,
      name: profile?.display_name?.trim() || "KundaliKonnect Member",
      avatarUrl,
      lastMessage: messages.at(-1)?.body ?? replyMessage,
      unreadCount: 0,
      compatibilityScore:
        matchScore?.compatibility_report?.overallScore ?? 75,
      messages: messages.map((message) => {
        const isMine = message.sender_id === user.id;

        return {
          id: message.id,
          createdAt: message.created_at,
          senderId: isMine ? "me" : message.sender_id,
          text: message.body,
          status: message.status,
          ...(isMine && message.status === "read" && message.read_at
            ? { seenAt: message.read_at }
            : {}),
          ...(!isMine && message.read_at ? { readAt: message.read_at } : {}),
        };
      }),
    },
  });
});
