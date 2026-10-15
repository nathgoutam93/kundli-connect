import { HttpError, jsonResponse, readJson, requiredEnv, servePost } from "../_shared/http.ts";
import { type PushPayload, sendPushToUser } from "../_shared/push.ts";
import { getAdminClient, getRequestContext } from "../_shared/supabase.ts";

// Deployed with --no-verify-jwt so it also accepts the service role key. The other functions
// now call sendPushToUser directly; this endpoint remains for server-side jobs and for a
// signed-in user sending a test notification to themselves.
servePost(async (request) => {
  const body = await readJson<Partial<PushPayload>>(request);
  const recipientUserId = body.recipientUserId?.trim();
  const title = body.title?.trim();
  const notificationBody = body.body?.trim();

  if (!recipientUserId) throw new HttpError(400, "Missing recipientUserId");
  if (!title) throw new HttpError(400, "Missing title");
  if (!notificationBody) throw new HttpError(400, "Missing body");

  const isServiceRoleRequest =
    request.headers.get("Authorization") === `Bearer ${requiredEnv("SUPABASE_SERVICE_ROLE_KEY")}`;

  if (!isServiceRoleRequest) {
    const { userId } = await getRequestContext(request);
    if (userId !== recipientUserId) {
      throw new HttpError(403, "Client requests can only send notifications to the current user.");
    }
  }

  const result = await sendPushToUser(getAdminClient(), {
    recipientUserId,
    title,
    body: notificationBody,
    data: body.data,
    notificationType: body.notificationType,
  });

  return jsonResponse(result);
});
