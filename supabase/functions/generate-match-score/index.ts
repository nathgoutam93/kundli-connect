import { calculateCompatibility, MATCH_SCORE_ENGINE_VERSION, type ProfileBirthDetails } from "../_shared/compatibility.ts";
import { requireUuid } from "../_shared/guards.ts";
import { HttpError, jsonResponse, readJson, servePost } from "../_shared/http.ts";
import { getRequestContext, rpcError } from "../_shared/supabase.ts";

servePost(async (request) => {
  const body = await readJson<{ targetProfileId?: string; expectedUserId?: string }>(request);
  const target = requireUuid(body.targetProfileId, "targetProfileId");
  const expectedUserId = requireUuid(body.expectedUserId, "expectedUserId");
  const { userId, adminClient } = await getRequestContext(request);
  if (userId !== expectedUserId) throw new HttpError(403, "Your session changed. Please try again.");
  const args = { p_user: userId, p_target: target, p_engine: MATCH_SCORE_ENGINE_VERSION };
  const { data: prepared, error } = await adminClient.rpc("prepare_match_score", args);
  if (error) throw rpcError(error);
  if (prepared?.cached) return jsonResponse(prepared);
  if (!prepared?.signature || !prepared?.profiles) throw new HttpError(500, "Missing match inputs");

  let compatibility;
  try { compatibility = calculateCompatibility(prepared.profiles as ProfileBirthDetails[]); }
  catch { throw new HttpError(400, "Both profiles need complete, valid birth details to calculate compatibility."); }

  // Authorization, current input revisions, debit, report and ledger metadata commit together.
  const { data: committed, error: commitError } = await adminClient.rpc("commit_match_score", {
    ...args, p_signature: prepared.signature, p_report: compatibility,
  });
  if (commitError) throw rpcError(commitError);
  if (!committed?.compatibility) throw new HttpError(500, "Missing saved report");
  return jsonResponse(committed);
});
