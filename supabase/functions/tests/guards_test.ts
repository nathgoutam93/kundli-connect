// deno-lint-ignore-file no-explicit-any require-await -- minimal async fakes standing in for Supabase/Expo/Razorpay
import { assertCanInteract, refundCredit, requireText, requireUuid, spendCredit } from "../_shared/guards.ts";
import { HttpError } from "../_shared/http.ts";

const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002";
async function status(fn: () => unknown) { try { await fn(); return 200; } catch (e) { return e instanceof HttpError ? e.status : 500; } }
function client(profile: unknown, connections: number, rpcData?: unknown) {
  const calls: string[] = [];
  return { calls, c: {
    from: (_table: string) => { const q: any = { select: () => q, eq: () => q, or: () => Promise.resolve({ count: connections, error: null }),
      maybeSingle: async () => ({ data: profile, error: null }) }; return q; },
    rpc: async (name: string) => { calls.push(name); return { data: rpcData, error: null }; },
  } as any };
}

Deno.test("validates ids and text", async () => {
  if (requireUuid(` ${A} `, "id") !== A) throw new Error("trim");
  if (await status(() => requireUuid("1 or 1=1", "id")) !== 400) throw new Error("bad uuid accepted");
  if (await status(() => requireText("x".repeat(301), "msg", 300)) !== 400) throw new Error("long text accepted");
  if (await status(() => requireText("   ", "msg", 300)) !== 400) throw new Error("blank accepted");
});

Deno.test("interaction rules", async () => {
  const visible = { onboarding_completed: true, is_discoverable: true }, hidden = { onboarding_completed: true, is_discoverable: false };
  if (await status(() => assertCanInteract(client(visible, 0).c, A, B)) !== 200) throw new Error("visible blocked");
  if (await status(() => assertCanInteract(client(hidden, 0).c, A, B)) !== 404) throw new Error("hidden allowed");
  if (await status(() => assertCanInteract(client(hidden, 1).c, A, B)) !== 200) throw new Error("connected blocked");
  if (await status(() => assertCanInteract(client(null, 0).c, A, B)) !== 404) throw new Error("missing allowed");
  if (await status(() => assertCanInteract(client(visible, 0).c, A, A)) !== 400) throw new Error("self allowed");
});

Deno.test("credit spend and refund", async () => {
  const ok = client(null, 0, [{ allowed: true, transaction_id: "tx" }]);
  if ((await spendCredit(ok.c, A, "r")).transactionId !== "tx") throw new Error("tx id");
  if (await status(() => spendCredit(client(null, 0, [{ allowed: false, transaction_id: null }]).c, A, "r")) !== 402) throw new Error("402");
  const sub = client(null, 0);
  await refundCredit(sub.c, null);
  if (sub.calls.length) throw new Error("refunded a subscriber");
});
