import type { SupabaseClient } from "npm:@supabase/supabase-js@2.106.2";

const expoPushEndpoint = "https://exp.host/--/api/v2/push/send";

export type NotificationType = "likes" | "matches" | "messages" | "astrologyReports";

export type PushPayload = {
  recipientUserId: string;
  senderUserId?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  notificationType?: NotificationType;
};

type ExpoPushTicket = {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

const settingColumnByType: Record<NotificationType, string> = {
  likes: "notify_likes",
  matches: "notify_matches",
  messages: "notify_messages",
  astrologyReports: "notify_astrology_reports",
};

const typeByDataType: Record<string, NotificationType> = {
  like: "likes",
  match: "matches",
  message: "messages",
};

/**
 * With Expo "Enhanced push security" turned on for the project, Expo only accepts sends that carry
 * this access token, so a push token that leaked from a device can't be used by anyone else.
 */
export function expoPushHeaders(accessToken = Deno.env.get("EXPO_ACCESS_TOKEN")?.trim()) {
  return {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

function isExpoPushToken(token: string) {
  return /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

/**
 * Sends an Expo push to every registered device of a user, honouring their notification
 * settings and pruning tokens Expo reports as unregistered. Called directly by the Edge
 * Functions (usually via runInBackground) instead of a function-to-function HTTP hop.
 */
export async function sendPushToUser(adminClient: SupabaseClient, payload: PushPayload) {
  const notificationType =
    payload.notificationType ??
    (typeof payload.data?.type === "string" ? typeByDataType[payload.data.type] : undefined);
  const settingColumn = notificationType ? settingColumnByType[notificationType] : undefined;

  const [settingsResult, tokensResult] = await Promise.all([
    settingColumn
      ? adminClient
          .from("user_settings")
          .select(settingColumn)
          .eq("user_id", payload.recipientUserId)
          .maybeSingle<Record<string, boolean>>()
      : Promise.resolve({ data: null, error: null }),
    adminClient
      .from("push_tokens")
      .select("id, token")
      .eq("user_id", payload.recipientUserId)
      .eq("token_type", "expo")
      .returns<{ id: string; token: string }[]>(),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (tokensResult.error) throw tokensResult.error;

  if (settingColumn && settingsResult.data?.[settingColumn] === false) {
    return { sent: 0, tickets: [] as ExpoPushTicket[], invalidTokens: 0, disabledBySettings: true };
  }

  const tokens = (tokensResult.data ?? []).filter((row) => isExpoPushToken(row.token));
  if (tokens.length === 0) {
    return { sent: 0, tickets: [] as ExpoPushTicket[], invalidTokens: 0 };
  }

  // Check after token/settings reads, as close to dispatch as possible. Fail closed.
  if (notificationType && ["likes", "matches", "messages"].includes(notificationType)) {
    if (!payload.senderUserId) return { sent: 0, tickets: [] as ExpoPushTicket[], invalidTokens: 0, suppressed: true };
    const { data: allowed, error } = await adminClient.rpc("can_deliver_social_push", {
      p_sender: payload.senderUserId,
      p_recipient: payload.recipientUserId,
      p_chat: typeof payload.data?.chatId === "string" ? payload.data.chatId : null,
      p_like: typeof payload.data?.likeId === "string" ? payload.data.likeId : null,
    });
    if (error) throw error;
    if (!allowed) return { sent: 0, tickets: [] as ExpoPushTicket[], invalidTokens: 0, suppressed: true };
  }

  const expoResponse = await fetch(expoPushEndpoint, {
    method: "POST",
    headers: expoPushHeaders(),
    body: JSON.stringify(
      tokens.map((row) => ({
        to: row.token,
        sound: "default",
        title: payload.title,
        body: payload.body,
        data: { ...payload.data, recipientUserId: payload.recipientUserId },
      })),
    ),
  });

  if (!expoResponse.ok) {
    throw new Error(`Expo push request failed: ${await expoResponse.text()}`);
  }

  const tickets = ((await expoResponse.json()) as { data?: ExpoPushTicket[] }).data ?? [];
  const invalidTokenIds = tickets
    .map((ticket, index) =>
      ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered" ? tokens[index]?.id : null
    )
    .filter((id): id is string => Boolean(id));

  if (invalidTokenIds.length > 0) {
    const { error } = await adminClient.from("push_tokens").delete().in("id", invalidTokenIds);
    if (error) throw error;
  }

  return {
    sent: tickets.filter((ticket) => ticket.status === "ok").length,
    tickets,
    invalidTokens: invalidTokenIds.length,
  };
}
