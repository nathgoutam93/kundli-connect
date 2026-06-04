import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

type SentChatMessageResult = {
  id: string;
  createdAt: string;
  senderId: "me";
  text: string;
  status?: "sent" | "read";
};

declare const EdgeRuntime:
  | {
      waitUntil?: (promise: Promise<unknown>) => void;
    }
  | undefined;

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

async function sendPushNotification(
  supabaseUrl: string,
  serviceRoleKey: string,
  payload: {
    recipientUserId: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  },
) {
  const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
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

  let body: { chatId?: string; text?: string };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const chatId = body.chatId?.trim();
  const text = body.text?.trim();

  if (!chatId) {
    return jsonResponse({ error: "Missing chatId" }, 400);
  }

  if (!text) {
    return jsonResponse({ error: "Missing text" }, 400);
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

  const { data: message, error: messageError } = await authClient.rpc(
    "send_chat_message",
    {
      p_chat_id: chatId,
      p_body: text,
    },
  );

  if (messageError) {
    return jsonResponse({ error: messageError.message }, 500);
  }

  if (!message) {
    return jsonResponse({ error: "Message send did not return a message record." }, 500);
  }

  const { data: participant, error: participantError } = await adminClient
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chatId)
    .neq("user_id", user.id)
    .limit(1)
    .maybeSingle<{ user_id: string }>();

  if (participantError) {
    return jsonResponse({ error: participantError.message }, 500);
  }

  if (participant) {
    const { data: senderProfile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle<{ display_name: string | null }>();

    const pushPromise = sendPushNotification(supabaseUrl, supabaseServiceRoleKey, {
      recipientUserId: participant.user_id,
      title: "New message",
      body: `${senderProfile?.display_name?.trim() || "Someone"}: ${text}`,
      data: {
        type: "message",
        chatId,
        messageId: (message as SentChatMessageResult).id,
        fromUserId: user.id,
      },
    })
      .catch((error) => {
        console.error("Failed to send message notification.", error);
      });

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(pushPromise);
    }
  }

  return jsonResponse({ message: message as SentChatMessageResult });
});
