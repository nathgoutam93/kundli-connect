# Atomic score billing, message retries and profile identity

Implemented locally on 17 October 2026. Hosted changes have not been deployed. This batch follows the [safety](safety-fixes-rollout.md), [photo/billing](photo-billing-rollout.md) and [discovery/settings](discovery-settings-rollout.md) batches.

## Resulting behavior

- Compatibility calculation uses a service-only preparation RPC, limited to 10 requests per user per 60-second window, including subscribers and cached reads. Birth inputs never pass through an authenticated client RPC.
- Saving a score, spending its credit and recording ledger metadata now use one database transaction. A per-pair lock serializes opposite/concurrent requests; a second successful commit returns the saved report without another debit. A save failure rolls back its debit too. The existing per-user credit lock and effective subscription checks remain authoritative.
- Commit rechecks blocks, suspension, target visibility/active connection, birth-input revisions, gender and score-engine version. Changed inputs fail before charging. The fallback bride/groom assignment uses canonical participant order so either requester calculates the same result.
- A report refresh for an existing pair is free, including the first refresh of a historical report without an input signature. It preserves the score ID and existing like references. This avoids charging again when historical payment evidence is incomplete; the migration does not infer or refund historical duplicate charges.
- Messages and replies require a UUID request ID. The app persists only the ID and a fingerprint scoped to the account, action, target and trimmed text. A lost response or app restart reuses that ID; a confirmed success clears it so another intentional message with identical text gets a new ID.
- Server receipts, message insertion, chat/read timestamps, activity and message-rate consumption commit together. A matching retry rechecks current authorization and returns its original result without another message, activity entry, rate-limit charge or push attempt. Reusing an ID for a different payload fails. Receipts store a SHA-256 body fingerprint and response metadata, not a duplicate message body; account deletion cascades them.
- Optimistic message reconciliation uses request IDs, so identical text from another request cannot replace the wrong bubble. Sends, replies and score requests bind to the account that started them.
- The editable `profiles.email` column remains contact information for receipts and is no longer unique. It is not used for sign-in, account linking, ownership or verification. Existing addresses remain intact. New `verified_email`/`email_verified_at` fields are derived exclusively from the owning Supabase Auth row's confirmed email, including later Auth changes. Client metadata and editable profile fields cannot establish verification. Both contact and verified email stay out of public cards.
- Name and bio writes are capped at 80 and 500 Unicode code points; newly changed contact emails are validated and capped at 254. Both client and database enforce these rules. Existing oversized/invalid legacy values are preserved until reviewed, and unrelated edits remain possible. Edit profile compares against its saved form baseline and sends only the fields the user actually changed.

## Before deployment

Complete the earlier batches' prerequisites and inventory installed clients, deployed functions and database rows. Back up affected data and preserve an audit export. Do not merge accounts, mark a contact email verified or change ownership based on a matching profile address.

Read-only inventory examples, run before applying this batch:

```sql
select id, char_length(display_name) as name_length, char_length(bio) as bio_length,
       char_length(email) as contact_email_length
from public.profiles
where char_length(display_name) > 80 or char_length(bio) > 500
   or char_length(email) > 254
   or (email is not null and email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

select count(*) as contact_addresses_without_confirmed_auth_email
from public.profiles p join auth.users u on u.id = p.id
where p.email is not null and u.email_confirmed_at is null;
```

Oversized text needs an explicit user/admin correction process before adding fully validated table checks. No automatic truncation is included. Historical duplicated conversations and debit/refund reconciliation remain separate audited repairs.

## Coordinated cutover

1. Prepare and test the matching mobile build. It reads `verified_email`, sends account bindings and request IDs, and uses the new retry journal. Older builds are unsupported for message/reply/score writes after this cutover.
2. Under the earlier batches' controlled write pause, apply these forward migrations in order:
   - `20261017100000_atomic_match_scores.sql`
   - `20261017101000_idempotent_messages.sql`
   - `20261017102000_profile_identity_and_limits.sql`
3. Deploy `generate-match-score`, `send-chat-message` and `reply-to-like`, including their updated shared modules. Do not leave an old score function serving traffic: its separate spend/upsert implementation would bypass the new atomic path.
4. Release/require the matching app build before reopening writes. The updated Edge Functions require request IDs/account bindings; the migration revokes authenticated execution of the old two-argument message/reply RPCs. Raw callers must use `send_chat_message_once`/`reply_to_like_once`. Older clients must fail safely until upgraded.
5. Check same-pair requests from both devices with one credit remaining, simultaneous requests against different pairs, subscriber rate limits, induced report-save failure and an interrupted response after commit. Verify one applicable debit/report and no orphan debit.
6. Check initial reply and ordinary message retries after a lost response and an app restart, two intentional identical messages, changed payloads under one request ID, account switching, block/unmatch races and push counts. A retry after a block/unmatch must still fail authorization.
7. Confirm an unverified contact address cannot prevent the verified owner's profile from being created. Confirm Auth email confirmation/change/removal updates only that owner's verified fields, and public card RPCs expose neither address. Verify legacy text remains intact and can be corrected explicitly.

Do not restore authenticated access to legacy message writes or bring back separate score debit/upsert calls as a rollback shortcut. Keep the enforced authorization and billing boundaries and roll forward with compatible clients/functions.

## Validation and limits

Run mobile Jest (`--watchman=false`), TypeScript, Expo lint, Deno tests and Deno checks for the three changed functions. Run all SQL scripts against a disposable migrated database:

```sh
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/safety_regression.sql
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/photo_billing_regression.sql
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/discovery_settings_regression.sql
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/score_message_identity_regression.sql
```

The full migration chain and all four scripts were exercised in embedded PostgreSQL with Auth/Storage scaffolding, fresh and with legacy rows seeded immediately before this batch. The upgrade rehearsal preserves historical messages, oversized text, contact addresses, score IDs/references and ledger entries, verifies confirmed-email backfill, and refreshes a legacy report without another debit. Tests inject report/receipt failures and exercise real database role permissions. Mobile tests exercise retry-journal persistence across module restart, lost responses, distinct identical-text intents, account bindings, cache reconciliation and form-field preservation.

The local Docker daemon is unavailable, so the embedded runs do not establish simultaneous-connection behavior or hosted Supabase integration. Two-connection and device/network checks above remain staging release gates. Push scheduling remains best effort after commit: receipts prevent duplicate push attempts on retries, but do not provide a durable notification-delivery outbox. The retry journal survives logout for the same account and stores no message body.

The follow-up [list/display batch](lists-preview-rollout.md) implements icebreaker drafts, public-card preview parity, bounded lists and indexes, and prepares the legacy-credit retirement script. Hosted legacy retirement, audited historical repairs, deployment and release/device verification remain.
