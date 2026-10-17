export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

/** Thrown inside handlers to short-circuit with a specific status code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new HttpError(500, `Missing ${name} secret.`);
  }
  return value;
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

/** Wraps a POST handler with CORS preflight, method checks and uniform error responses. */
export function servePost(handler: (request: Request) => Promise<Response>) {
  Deno.serve(async (request) => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.status < 500) return jsonResponse({ error: error.message, ...error.details }, error.status);
        console.error(error);
        return jsonResponse({ error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" }, error.status);
      }
      console.error(error);
      return jsonResponse({ error: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" }, 500);
    }
  });
}

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

/**
 * Keeps work running after the response is sent (push notifications, logging). Falls back
 * to fire-and-forget when the Edge Runtime API is unavailable, e.g. in local tests.
 */
export function runInBackground(label: string, task: () => Promise<unknown>) {
  const promise = task().catch((error) => console.error(`${label} failed.`, error));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(promise);
  }
}
