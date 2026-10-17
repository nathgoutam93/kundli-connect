# Lists, profile preview and icebreaker rollout

Implemented locally on 17 October 2026. Nothing in this guide establishes hosted deployment status.

## Behavior

- Match-screen icebreakers open the authorized chat with an editable composer draft. They do not send a message. The route seed is consumed once, existing text is retained, changing chats clears the visible draft, and the combined 2,000-character cap reports a rejected seed.
- “How others see you” reads the owner's row from `profile_cards` and uses the same mapper and `ProfileView` as Discover. Hidden work, education, family and lifestyle fields remain hidden; empty biographies remain empty. Saves, photo changes and privacy changes invalidate the preview. Loading failures show retry and retain an available cached card.
- Incoming likes, sent likes, chat previews and blocked people use bounded keyset pages. Messages use the same timestamp-and-UUID cursor, so equal timestamps do not skip rows. The app displays 30 rows per page and requests one lookahead row; the server clamps every page to 1–100 rows. Legacy no-argument list RPCs return at most 50 rows.
- Likes, chats and blocked people expose Load more. Failed subsequent pages retain existing rows and show retry. Loaded-page overlaps caused by moving chat timestamps are deduplicated. This is a live feed, not a fixed snapshot: refreshing reconciles activity that occurs while paging.
- Opening a chat by ID filters on the server before limiting. It works when the chat is outside loaded list pages and never installs an empty list cache. Optimistic reads and realtime updates preserve infinite-query cursors.
- Badges use account-wide unread aggregates, including rows outside loaded pages. Hidden, blocked and ended conversations do not contribute. Read writes, relationship changes and realtime events refresh those aggregates.

## Migration and indexes

Apply `20261017110000_bounded_social_lists.sql` after the earlier remediation migrations, then ship the matching client. It adds no columns that old builds must write. Older list RPCs remain available with bounded results; older clients need the updated build to browse beyond their first 50 rows.

The migration replaces the timestamp-only message index with `(chat_id, created_at DESC, id DESC)` and the existing partial discovery index with `(created_at DESC, id DESC)`. It adds incoming/sent-like cursors, a partial unread-like index, a blocked-user cursor index and chat update ordering. Existing participant, unread-message, photo and pair indexes remain in use.

Local PostgreSQL `EXPLAIN (ANALYZE, FORMAT JSON)` checks on the regression fixture, under the authenticated role, selected `messages_chat_cursor_idx` for tied-message paging and latest-message lookup, `chats_updated_cursor_idx` for chat ordering, and the existing participant/unread indexes. The planner used a sequential scan for the tiny incoming-like fixture. These checks show usable access paths, not production capacity. Repeat plans with representative account sizes and distributions before release; retain or remove indexes based on those plans. SQL functions set `search_path`, so outer EXPLAIN can show only a Function Scan; inspect their SQL bodies with typed parameter values or use nested-statement profiling in staging.

## Retiring the legacy credit shim

Repository searches of `apps/mobile` and `supabase/functions` found no `spend_credit` callers. Current scoring and liking use their atomic database paths; the supported service-only primitive is `spend_user_credit(uuid,text)`.

The concrete removal is [`supabase/rollout/20261017111000_retire_legacy_credit.sql`](../supabase/rollout/20261017111000_retire_legacy_credit.sql). It revokes execution and drops only `spend_credit(text)` in one transaction, refuses cascading dependency deletion, verifies the supported primitive remains and can be rerun. It is deliberately outside automatic migrations until deployed consumers have been inventoried.

Before applying it, inventory hosted Edge Function source/versions, scheduled jobs and supported client builds for calls to `spend_credit`; update remaining callers. Database catalog dependencies alone cannot discover dynamically constructed calls or external functions. Apply the script to staging with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/rollout/20261017111000_retire_legacy_credit.sql`, run the SQL suites again, and smoke-test likes, scores, purchases and refunds. Promote the reviewed script through the normal production database release, then confirm `to_regprocedure('public.spend_credit(text)')` is null. Hosted retirement has not been performed here.

## Verification

Run the mobile tests, typecheck and lint and the Deno function tests. Against a disposable local Supabase database with all migrations applied, run these as an administrator with `psql -v ON_ERROR_STOP=1 -f …`:

1. `supabase/tests/safety_regression.sql`
2. `supabase/tests/photo_billing_regression.sql`
3. `supabase/tests/discovery_settings_regression.sql`
4. `supabase/tests/score_message_identity_regression.sql`
5. `supabase/tests/pagination_preview_regression.sql`

The new suite rolls fixtures back and checks equal-timestamp page boundaries, global unread/read/hidden counts, redacted own/viewer cards, a direct lookup beyond the first 30 chats, foreign-account denial, blocked/ended relationships and the hard 100-message cap. Existing suites cover the previous batches.

Local results: 116 mobile tests across 29 suites, mobile typecheck/lint, 40 Deno function tests and `git diff --check` passed. All five SQL suites passed in embedded PostgreSQL (PGlite) on fresh and seeded-upgrade databases. Retirement and its idempotent repeat passed locally. PGlite uses minimal Auth/Storage scaffolding; these results do not replace native-device QA, concurrent transaction tests or hosted Supabase API verification. Docker was unavailable for a full local Supabase stack.

Device/staging checks still required: paginate 60+ likes/chats while new activity arrives, retry a failed second page, open an older conversation from a cold-start notification, verify unread counts after reads/blocks/hiding, and tap/edit/send each icebreaker. Compare the preview against a second account after every visibility switch and photo reorder. Verify long lists on a low-memory Android device.

## Remaining review work

All remaining display/list code changes in this batch are implemented locally. The follow-up [data-repair batch](data-repair-rollout.md) adds read-only inventory and reviewed dry-run/apply tools. A subsequent [birth-correction batch](birth-correction-rollout.md) implements the support correction path locally. Actual production audits/repairs, recovery from backups, deployment, hosted shim retirement and staging/device/concurrency release checks remain. Do not treat the completed local code batches as a completed production rollout.
