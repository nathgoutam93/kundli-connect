// deno-lint-ignore-file no-explicit-any require-await -- minimal async fakes standing in for Supabase/Expo/Razorpay
import { sendPushToUser } from "../_shared/push.ts";
import { rpcError } from "../_shared/supabase.ts";

function fakeClient(opts: { settings?: Record<string, boolean> | null; tokens: { id: string; token: string }[] }) {
  const deleted: string[] = [];
  const builder = (_table: string) => {
    const q: any = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: opts.settings ?? null, error: null }),
      returns: async () => ({ data: opts.tokens, error: null }),
      delete: () => ({ in: async (_c: string, ids: string[]) => { deleted.push(...ids); return { error: null }; } }),
    };
    return q;
  };
  return { client: { from: builder } as any, deleted };
}

const sent: unknown[] = [];
globalThis.fetch = (async (_url: string, init: RequestInit) => {
  const messages = JSON.parse(init.body as string);
  sent.push(...messages);
  return new Response(JSON.stringify({ data: messages.map((m: any) => m.to.includes("dead")
    ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "t" }) }), { status: 200 });
}) as typeof fetch;

Deno.test("sends to valid tokens and prunes unregistered ones", async () => {
  const { client, deleted } = fakeClient({ tokens: [
    { id: "1", token: "ExponentPushToken[abc]" }, { id: "2", token: "ExponentPushToken[dead]" }, { id: "3", token: "garbage" } ] });
  const result = await sendPushToUser(client, { recipientUserId: "u", title: "t", body: "b", data: { type: "message" } });
  if (result.sent !== 1 || result.invalidTokens !== 1 || deleted.join() !== "2") throw new Error(JSON.stringify({ result, deleted }));
});

Deno.test("respects disabled notification settings", async () => {
  const before = sent.length;
  const { client } = fakeClient({ settings: { notify_messages: false }, tokens: [{ id: "1", token: "ExponentPushToken[abc]" }] });
  const result = await sendPushToUser(client, { recipientUserId: "u", title: "t", body: "b", data: { type: "message" } });
  if (!("disabledBySettings" in result) || sent.length !== before) throw new Error("should not send");
});

Deno.test("maps SQL errcodes to HTTP statuses", () => {
  const cases: [string, number][] = [["P0002", 404], ["22023", 400], ["28000", 401], ["XX000", 500]];
  for (const [code, status] of cases) {
    if (rpcError({ code, message: "x" }).status !== status) throw new Error(`${code} -> ${status}`);
  }
});
