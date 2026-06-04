import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

type PushTokenRow = {
  id: string;
  token: string;
  token_type: "expo";
};

type ExpoPushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
};

type SendPushBody = {
  recipientUserId?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
};

const expoPushEndpoint = "https://exp.host/--/api/v2/push/send";

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

function isExpoPushToken(token: string) {
  return /^ExponentPushToken\[[A-Za-z0-9_-]+\]$|^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(
    token,
  );
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

  let body: SendPushBody;

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const recipientUserId = body.recipientUserId?.trim();
  const title = body.title?.trim();
  const notificationBody = body.body?.trim();

  if (!recipientUserId) {
    return jsonResponse({ error: "Missing recipientUserId" }, 400);
  }

  if (!title) {
    return jsonResponse({ error: "Missing title" }, 400);
  }

  if (!notificationBody) {
    return jsonResponse({ error: "Missing body" }, 400);
  }

  const isServiceRoleRequest = authHeader === `Bearer ${supabaseServiceRoleKey}`;
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  if (!isServiceRoleRequest) {
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    if (user.id !== recipientUserId) {
      return jsonResponse(
        { error: "Client requests can only send notifications to the current user." },
        403,
      );
    }
  }

  const { data: tokenRows, error: tokenError } = await adminClient
    .from("push_tokens")
    .select("id, token, token_type")
    .eq("user_id", recipientUserId)
    .eq("token_type", "expo")
    .returns<PushTokenRow[]>();

  if (tokenError) {
    return jsonResponse({ error: tokenError.message }, 500);
  }

  const tokens = (tokenRows ?? []).filter((row) => isExpoPushToken(row.token));

  if (tokens.length === 0) {
    return jsonResponse({ sent: 0, tickets: [], invalidTokens: 0 });
  }

  const messages = tokens.map((row) => ({
    to: row.token,
    sound: "default",
    title,
    body: notificationBody,
    data: body.data ?? {},
  }));

  const expoResponse = await fetch(expoPushEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!expoResponse.ok) {
    const message = await expoResponse.text();
    return jsonResponse(
      { error: "Expo push request failed.", details: message },
      502,
    );
  }

  const expoPayload = (await expoResponse.json()) as { data?: ExpoPushTicket[] };
  const tickets = expoPayload.data ?? [];
  const invalidTokenIds = tickets
    .map((ticket, index) =>
      ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered"
        ? tokens[index]?.id
        : null
    )
    .filter((id): id is string => Boolean(id));

  if (invalidTokenIds.length > 0) {
    const { error: deleteError } = await adminClient
      .from("push_tokens")
      .delete()
      .in("id", invalidTokenIds);

    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }
  }

  return jsonResponse({
    sent: tickets.filter((ticket) => ticket.status === "ok").length,
    tickets,
    invalidTokens: invalidTokenIds.length,
  });
});
