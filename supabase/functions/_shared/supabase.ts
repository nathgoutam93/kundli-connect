import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.106.2";

import { HttpError, requiredEnv } from "./http.ts";

export type RequestContext = {
  userId: string;
  /** Acts as the calling user: RLS and auth.uid() apply. */
  userClient: SupabaseClient;
  /** Service role: bypasses RLS. Only use after authorization checks. */
  adminClient: SupabaseClient;
};

let adminClient: SupabaseClient | undefined;

export function getAdminClient() {
  adminClient ??= createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/**
 * A client that acts as the caller. Use when every query goes through RLS or an RPC that
 * checks auth.uid() itself, so no separate token verification round trip is needed.
 */
export function getUserClient(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    throw new HttpError(401, "Missing Authorization header");
  }

  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Maps errors raised by our SQL functions (see the errcodes they use) to HTTP statuses. */
export function rpcError(error: { code?: string; message: string }) {
  const status =
    error.code === "28000" || error.code === "PGRST301" ? 401
    : error.code === "P0002" ? 404
    : error.code === "22023" ? 400
    : 500;
  return new HttpError(status, error.message);
}

/**
 * Resolves the caller from the Authorization header. getClaims() verifies the JWT locally
 * against the project's cached JWKS when asymmetric signing keys are enabled, avoiding the
 * extra Auth-server round trip getUser() makes on every request.
 */
export async function getRequestContext(request: Request): Promise<RequestContext> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!authHeader || !token) {
    throw new HttpError(401, "Missing Authorization header");
  }

  const userClient = getUserClient(request);
  const { data, error } = await userClient.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) {
    throw new HttpError(401, "Unauthorized");
  }

  return { userId, userClient, adminClient: getAdminClient() };
}

export function orderedPair(firstUserId: string, secondUserId: string) {
  return firstUserId < secondUserId
    ? { userAId: firstUserId, userBId: secondUserId }
    : { userAId: secondUserId, userBId: firstUserId };
}

export async function getDisplayName(client: SupabaseClient, userId: string) {
  const { data } = await client
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle<{ display_name: string | null }>();
  return data?.display_name?.trim() || "Someone";
}
