# Safety and data-loss fixes: first implementation batch

This batch addresses the six Tier 1 findings, plus reciprocal duplicate likes/charges, basic like/message throttling, consumed notification replay, visible Edit Profile save errors and sanitized server errors. It does not complete the remaining remediation plan. No hosted database or Edge Functions have been deployed.

## Changes

- Profile load errors display retry instead of entering onboarding. All onboarding saves are awaited and submission errors stay on the step.
- Profile edits use an allowlisted, serialized database operation with an expected `updated_at` value. Direct authenticated table updates are revoked, so older whole-profile clients fail instead of overwriting data. Edit Profile retains drafts when saving fails.
- Block/unmatch invalidates both directions of the relationship. SQL writes check blocks and suspension after acquiring a shared pair lock; a matched like without an active chat cannot create another one. Social push dispatch checks authorization again.
- Like creation and its credit debit are one transaction. Opposite-direction and repeated likes reuse the existing interaction. A database insert guard also protects older service-role insert paths against new reciprocal duplicates. Existing duplicate conversations are preserved for a separate audited repair.
- Successful likes are limited to 20 per minute per user; messages and first replies share 30 per minute per user, including subscribers. These are initial backend thresholds, not paid-plan limits. Scoring limits, per-chat limits and durable message retry IDs remain follow-up work.
- Birth date/time require explicit confirmation; typed location text requires a selected suggestion or deliberate map pin. Device location only centers the viewport. Onboarding shows a final birth-detail review. Chart writes and onboarding completion validate a server birth-input revision.
- Notification-opened threads fetch their own preview, independent of list loading. Mark-read leaves absent cache data absent. Native notification responses are consumed and persisted, and newly generated pushes identify their intended account.

## Deployment sequence

1. Back up the database and record deployed client/function versions. Rehearse the migrations and tests against a representative snapshot. Audit historical duplicate chats/likes and incorrect locked birth details separately; this batch does not guess corrections or refund historical debits.
2. Arrange a brief maintenance window for interaction/profile writes. Apply these forward migrations in order:
   - `20261016090000_relationship_safety.sql`
   - `20261016091000_birth_input_revisions.sql`
   - `20261016092000_profile_field_updates.sql`
3. Deploy `create-like`, `reply-to-like`, `send-chat-message` and `generate-kundli`. Redeploy every Edge Function that imports the updated shared HTTP/push helpers, including weekly insights and the push endpoint. Do not run mixed old/new social push callers: social pushes now require a sender ID and a referenced active interaction.
4. Release the updated mobile client. Require an update before older builds may edit profiles or finish onboarding: their direct profile writes are intentionally rejected. Existing unlocked onboarding users will need their chart regenerated using the new input revision before completion.
5. Verify signup, returning-user startup under failed networking, onboarding, scoring/liking, two-device chat, both block directions, unmatch, notification cold start and logout/login. Then reopen writes and monitor errors and charge counts.

Keep the safety restrictions if a rollback is necessary; roll forward with a compatible client/function fix. Restoring broad profile update grants or the old reply implementation would restore the vulnerabilities.

## Verification

Mobile: Jest, TypeScript and Expo lint. Backend: Deno tests plus type checks for the four changed function entrypoints. The standalone SQL script below exercises real PostgreSQL functions and authenticated-role permissions:

```sh
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/safety_regression.sql
```

Use only a disposable local/staging database. The SQL script wraps its fixtures in a transaction and rolls them back. It verifies repeated/reciprocal likes and credit balances, block/unmatch/unblock, direct RPC authorization, suspension, throttling, stale chart revisions, field-patch preservation, stale profile edits and rejection of legacy table updates.

During implementation, the full migration chain and this script were also executed in a temporary embedded PostgreSQL instance with minimal Auth/Storage scaffolding. This checks SQL execution and RLS, but does not replace testing Supabase Storage, Realtime, actual concurrent database connections or push delivery on devices. Docker was not running in the workspace.

The workspace now declares React types at the repository root as well as in the mobile package so hoisted React Native dependencies can resolve them. Existing npm dependencies were restored from the lockfile. Jest was run with `--watchman=false` because Watchman’s state directory was outside the workspace permissions.

## Remaining work

Continue with the [remediation plan](code-review-remediation-plan.md): private photo delivery and upload lifecycle; real-only compatibility; effective subscriptions/credits; mutual discovery preferences/current city/skipped profiles; settings and offline auth behavior; likes read state; remaining display fixes; query limits/indexes and legacy credit cleanup. Existing-data correction/merge/refund tooling and production/device verification remain required before a release is considered safe.

Update: the second local batch implements photo privacy/upload lifecycle and compatibility/plan/credit display fixes. See [photo-billing-rollout.md](photo-billing-rollout.md) for the current scope and its additional cutover requirements.
