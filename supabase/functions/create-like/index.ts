import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

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

function orderedPair(firstUserId: string, secondUserId: string) {
  return firstUserId < secondUserId
    ? { userAId: firstUserId, userBId: secondUserId }
    : { userAId: secondUserId, userBId: firstUserId };
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

  let body: { targetProfileId?: string; openingMessage?: string };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const targetProfileId = body.targetProfileId?.trim();
  const openingMessage = body.openingMessage?.trim();

  if (!targetProfileId) {
    return jsonResponse({ error: "Missing targetProfileId" }, 400);
  }

  if (!openingMessage) {
    return jsonResponse({ error: "Missing openingMessage" }, 400);
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

  if (user.id === targetProfileId) {
    return jsonResponse({ error: "Cannot like your own profile." }, 400);
  }

  const pair = orderedPair(user.id, targetProfileId);
  const { data: matchScore, error: matchScoreError } = await adminClient
    .from("match_scores")
    .select("id")
    .eq("user_a_id", pair.userAId)
    .eq("user_b_id", pair.userBId)
    .maybeSingle<{ id: string }>();

  if (matchScoreError) {
    return jsonResponse({ error: matchScoreError.message }, 500);
  }

  if (!matchScore) {
    return jsonResponse(
      { error: "Generate a match score before sending a like." },
      400,
    );
  }

  const likeColumns =
    "id, from_user_id, to_user_id, opening_message, match_score_id, status, created_at";
  const { data: existingLike, error: existingLikeError } = await adminClient
    .from("likes")
    .select(likeColumns)
    .eq("from_user_id", user.id)
    .eq("to_user_id", targetProfileId)
    .maybeSingle();

  if (existingLikeError) {
    return jsonResponse({ error: existingLikeError.message }, 500);
  }

  if (existingLike) {
    return jsonResponse({ like: existingLike, existing: true });
  }

  const { data: like, error: likeError } = await adminClient
    .from("likes")
    .insert({
      from_user_id: user.id,
      to_user_id: targetProfileId,
      opening_message: openingMessage,
      match_score_id: matchScore.id,
      status: "pending",
    })
    .select(likeColumns)
    .single();

  if (likeError) {
    return jsonResponse({ error: likeError.message }, 500);
  }

  const { data: senderProfile } = await adminClient
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle<{ display_name: string | null }>();

  try {
    await sendPushNotification(supabaseUrl, supabaseServiceRoleKey, {
      recipientUserId: targetProfileId,
      title: "New like",
      body: `${senderProfile?.display_name?.trim() || "Someone"} sent you a like.`,
      data: { type: "like", likeId: like.id, fromUserId: user.id },
    });
  } catch (error) {
    console.error("Failed to send like notification.", error);
  }

  return jsonResponse({ like });
});
