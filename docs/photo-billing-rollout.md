# Photo privacy, upload reliability and truthful reports: second batch

Implemented locally after the first safety batch. Nothing has been deployed to a hosted project.

## Behavior

- Photos use stable `profile-photo://` references. The mobile image component fetches through `profile-photo`, which checks the caller’s visibility/block access before and after downloading the private object. It returns no reusable Storage token and disables response/image caching. Other viewers cannot read Storage directly or mint their own signed links. Owners retain access to their own photos; the blocked-users list shows names without requesting blocked photos.
- The database reserves upload paths and serializes reservations, commits, removal and reorder operations per profile. Registered photos are capped at six; completed profiles cannot delete below four. Replacements atomically swap the reference at the same position, including when there are already six photos. Retired objects go into a cleanup queue.
- Uploads run sequentially, resize the longest edge to at most 1600 pixels without upscaling, convert to JPEG, and reject processed files above 2 MiB before allocating base64. Temporary files are deleted. A persisted per-account operation ID lets retries reconcile the same uploaded file and database commit. Both photo screens offer retries; a failed batch retains successful items and retries failed items only.
- Empty/incomplete compatibility reports remain unavailable. The deterministic fake score generator, invented Guna breakdowns/yogas and invented biographies are removed. Stored basic scores remain usable without inventing a detailed report, and real zero scores are preserved. Discover receives only the requesting pair’s stored report.
- Premium state comes from the server’s active/expiration rule. A deadline based on the server’s remaining duration removes Premium locally even offline; foreground refresh and purchase reconciliation refresh the source. Unsupported plan features are removed from the catalog. Credit balances refresh after scoring, including ambiguous failures, and HTTP 402 opens the credits/plans prompt. History hides raw UUIDs and settings formats the plan date.

## Deployment order

1. Complete the first batch’s [rollout prerequisites](safety-fixes-rollout.md). Inventory existing photo counts, orphaned objects, expired plans and installed app versions. Preserve existing data; this batch does not silently truncate oversized photo libraries or remove unknown historical files.
2. Prepare a new native build with `expo-image-manipulator` and `expo-crypto`, using the versions listed for Expo SDK 54. Test it on Android/iOS before the cutover. Older builds depend on public URLs and direct photo writes and must be upgraded before reopening these features.
3. During a coordinated maintenance window, apply:
   - `20261016100000_private_profile_photos.sql`
   - `20261016101000_real_reports_and_entitlements.sql`
4. Deploy `profile-photo`, `cleanup-profile-photos --no-verify-jwt` and `generate-match-score`. The existing deployment script includes the new functions. The cleanup worker checks its own secret; it is not a client endpoint.
5. Configure and schedule cleanup before reopening uploads. Verify an actual Storage upload, proxy image request and queued deletion. Inspect the queue after a deliberately failed worker run; files must remain eligible for retry, and registered photos must never be removed.
6. Verify old public photo URLs no longer serve through the CDN. Use provider cache invalidation controls and verify propagation rather than assuming the private-bucket toggle immediately purges previously cached public responses. Content someone already downloaded cannot be revoked.
7. Roll out the new build, require supported versions, and smoke test both block directions, private image requests, four/six-photo boundaries, replacement, interrupted upload/retry, expired subscriptions and insufficient-credit prompts. Then reopen writes and monitor queue age, failed uploads and image authorization errors.

Do not restore public bucket access or direct photo writes as a rollback shortcut. Roll forward with compatible functions/clients while keeping privacy and quota restrictions.

## Cleanup schedule

Set a long random `PHOTO_CLEANUP_SECRET` as an Edge Function secret. Store that value and the function URL in Vault as `photo_cleanup_secret` and `photo_cleanup_url`. Reuse the project’s existing `pg_cron`/`pg_net` setup, then schedule:

```sql
select cron.schedule('photo-cleanup', '*/5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'photo_cleanup_url'),
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'photo_cleanup_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);
```

Each run expires up to 100 abandoned reservations and removes up to 100 queued paths through the Storage API. Failed deletion/acknowledgment leaves work retryable. Monitor backlog and increase worker frequency as volume grows. Expired/cancelled paths cannot later become active references. Existing untracked orphans require a separate audited inventory/repair; this worker handles tracked uploads and retired photos.

## Checks and limits

Run the mobile Jest suite with `--watchman=false`, TypeScript, Expo lint, Deno tests, and Deno checks for `profile-photo`, `cleanup-profile-photos` and `generate-match-score`. Run both standalone SQL scripts against a disposable migrated database:

```sh
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/safety_regression.sql
psql "$LOCAL_SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/photo_billing_regression.sql
```

The full migration chain and both scripts were exercised in embedded PostgreSQL with Auth/Storage scaffolding. The tests cover real SQL/RLS authorization, quotas, replacement, retry idempotency, cleanup eligibility, real report scoping, and plan expiration. Unit/component tests cover compression before base64, lost responses, partial-batch retries, missing reports, credit invalidation and local subscription expiry.

Actual Supabase Storage/CDN, concurrent connections, native image memory use and two-device behavior still need staging/device verification. Existing already locked birth-detail corrections, historical duplicate chat/credit repair and the other [remediation work](code-review-remediation-plan.md) remain separate.
