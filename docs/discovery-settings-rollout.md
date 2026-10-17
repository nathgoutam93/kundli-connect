# Discovery, read state and account reliability

Implemented locally on 17 October 2026. No hosted migrations, functions or app releases have been deployed. This batch follows the [safety](safety-fixes-rollout.md) and [photo/billing](photo-billing-rollout.md) batches.

## Changes

- Discover applies both members’ gender preferences before its result limit. “Everyone” and the app’s two non-binary labels are recognized. Empty legacy preferences require an explicit choice; they do not silently mean everyone.
- Skipped cards come from a separate authorized, paginated RPC with a deterministic timestamp/ID cursor. The review button is reachable, and blocking, incoming likes and preference changes invalidate this cache too.
- Current city is an explicit onboarding field, separate from birthplace and device location. The client no longer defaults to India. The migration clears only the exact trimmed legacy value `India`; other saved locations remain intact. Returning users with a missing city get an Edit profile prompt. New onboarding completion requires a city. City entry is free text and does not use GPS or alter birth coordinates.
- Incoming likes carry persisted recipient-owned read timestamps. Only cards visible in the focused list are marked read; cards behind an open preview are excluded. Failed writes preserve unread state and offer retry. New arrivals remain unread until viewed.
- Settings save only changed fields through a row-locked RPC. Writes serialize per account, independent switches can be changed while another is saving, and a failed switch returns to its saved value with an error. Unloaded settings cannot be changed.
- Phone sign-in shows distinct safe messages for incorrect/expired codes, throttling, invalid phone numbers and connectivity failures. Request, verification and resend paths handle rejected promises.
- Logout removes persisted credentials and emits the SDK’s signed-out event before network cleanup. A refresh already in flight cannot write the old session back. Cached queries still clear on sign-out. Remote revocation uses the current-session scope so other devices remain signed in.
- Push cleanup is installation- and account-scoped, persisted for retry, and checks the registration timestamp so delayed cleanup cannot remove a newer sign-in’s registration. A native token lookup finishing after logout cannot register; a registration already being written is queued for cleanup after its response. A server RPC rejects registration for a different session owner.
- Discover, Likes, Chats and Settings expose their own load failures with retry. Cached list content remains visible on refresh errors; an unsuccessful empty read does not display “No likes yet” or “No matches yet.”

## Rollout

1. Complete the earlier batches’ deployment prerequisites. Inventory active client versions and back up affected rows. Before clearing placeholder cities, export the affected profile IDs/locations for the rollout audit. Do not infer a city from birthplace or GPS.
2. Apply `supabase/migrations/20261017090000_discovery_and_settings.sql`. It adds read state, replaces the incoming-likes result signature, introduces skipped-profile/settings/push RPCs, and revokes direct settings insert/update from authenticated clients.
3. Release the matching mobile build and require supported versions for settings writes. Older clients submit whole-row settings upserts, which this migration intentionally denies. The new client must not be released before these RPCs exist. No additional Edge Function deployment is needed specifically for this batch.
4. Confirm returning users keep their completed onboarding state and other profile fields. Test existing empty preferences, placeholder cities, real cities and saved notification/privacy settings. Existing pending likes start unread; the migration does not guess which ones were historically seen.
5. On Android and iOS, verify mutually eligible/ineligible discovery, multiple skipped pages, scrolling/read badges across restart, rapid independent switches and failures, wrong/expired OTPs, resend throttling, and list loading offline.
6. Test logout offline, logout during token lookup/registration/refresh, restart while signed out, and signing into a different account on the same installation. Ensure another installation remains registered. Returning users with notification permission refresh their registration when entering the tabs.

Offline logout cannot contact the server to revoke credentials or retire a push token immediately. Local sign-out completes; cleanup uses the captured session when reachable, and failed token cleanup remains queued for that account’s next sign-in. Registering the same Expo token for a different account moves its ownership through the existing server upsert. Already delivered notifications and server-issued access tokens remain subject to the provider’s normal lifetime until remote cleanup succeeds. No extra account is authorized to delete another account’s registrations.

## Verification

Run mobile Jest with `--watchman=false`, TypeScript and Expo lint, plus the Deno suite. Run all standalone SQL regressions against a disposable migrated database:

```sh
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/safety_regression.sql
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/photo_billing_regression.sql
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/discovery_settings_regression.sql
```

The migration chain and all three scripts passed in embedded PostgreSQL with Auth/Storage scaffolding, both fresh and with legacy rows seeded immediately before this migration. The upgrade rehearsal checks that real cities, existing settings, onboarding completion and likes survive. SQL tests exercise actual role permissions, mutual preferences, privacy/blocks, cursor ties, read ownership and patch validation. Mobile tests include the installed Supabase SDK’s offline/expired-session/in-flight-refresh logout behavior, queued settings writes and push-registration races.

This does not replace staging verification against hosted Supabase Auth/Realtime/Storage, simultaneous database connections, or physical devices. Historical duplicate chat/credit repairs, atomic/idempotent score charging and message retries, verified email/contact separation, name/bio limits, remaining query bounds/indexes, legacy credits removal, icebreaker drafts and public-card preview parity remain in the [remediation plan](code-review-remediation-plan.md).
