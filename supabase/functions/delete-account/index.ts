import { HttpError, jsonResponse, readJson, servePost } from "../_shared/http.ts";
import { removeUserFolder } from "../_shared/storage.ts";
import { getRequestContext, rpcError } from "../_shared/supabase.ts";

/**
 * Permanently deletes the caller's account. The app asks the person to type DELETE first and
 * sends it as `confirm`, so a stray request can't wipe an account.
 *
 * Order matters: files first (they aren't covered by database cascades), then the person's
 * chats, then the auth user, whose deletion cascades to the profile and everything that
 * references it (photos, Kundli, likes, messages, credits, settings, push tokens, orders).
 * Reports about or by the person are kept, anonymised, for moderation history.
 */
servePost(async (request) => {
  const body = await readJson<{ confirm?: string }>(request);
  if (body.confirm !== "DELETE") {
    throw new HttpError(400, "Type DELETE to confirm.");
  }

  const { userId, adminClient } = await getRequestContext(request);

  await removeUserFolder(adminClient, "profile-photos", userId);
  await removeUserFolder(adminClient, "kundli-charts", userId);

  const { error: dataError } = await adminClient.rpc("delete_user_account_data", { p_user_id: userId });
  if (dataError) throw rpcError(dataError);

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
  if (deleteError) throw new HttpError(500, `Could not delete the account: ${deleteError.message}`);

  return jsonResponse({ deleted: true });
});
