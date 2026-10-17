# Code review remediation plan

Prepared 16 October 2026; updated 17 October 2026. Scope: all findings in the supplied review. This is an implementation plan based on repository inspection; it does not establish what is currently deployed. Local implementation status and deployment requirements are recorded in [safety-fixes-rollout.md](safety-fixes-rollout.md), [photo-billing-rollout.md](photo-billing-rollout.md), [discovery-settings-rollout.md](discovery-settings-rollout.md), [billing-message-identity-rollout.md](billing-message-identity-rollout.md), [lists-preview-rollout.md](lists-preview-rollout.md), [data-repair-rollout.md](data-repair-rollout.md) and [birth-correction-rollout.md](birth-correction-rollout.md). Hosted changes have not been deployed.

## Release order

Treat work packages 1–5 as release blockers. Fix fabricated scores and misleading paid-plan claims before accepting further purchases. Ship small changes with their regression checks, rather than waiting for one large rewrite.

| Order | Work package | Depends on | Completion evidence |
| --- | --- | --- | --- |
| 1 | Relationship safety, duplicate charges, interaction limits | Existing schema inventory | Old likes cannot reopen ended relationships; concurrent actions produce one connection and one applicable charge |
| 2 | Profile loading and lossless saving | None | Failed loads cannot enter onboarding; delayed saves/refetches cannot erase answers |
| 3 | Explicit birth details and chart consistency | 2 | Confirmed place, coordinates, date and time remain consistent through generation and final locking |
| 4 | Chat loading and notification lifecycle | None | Cold-start notification opens the thread without creating an empty chat cache; consumed taps do not replay |
| 5 | Private, block-aware photo delivery | Stable photo identifiers; relationship authorization from 1 | Anonymous and blocked users cannot fetch photos through new requests |
| 6 | Real compatibility and accurate plan/credit state | Shared error contract; 2 | No fabricated reports; expiration and credit state agree with the server |
| 7 | Mutual discovery preferences, current city, skipped profiles | 2 | Feed honors both people’s preferences and provides a real skipped-profile flow |
| 8 | Bounded, recoverable photo lifecycle | 2, 5 | Four-to-six photo rule survives concurrency, failures, retries and replacements |
| 9 | Auth, settings and visible failure handling | 2; shared error contract | Offline logout, wrong OTPs, failed loads and overlapping settings edits have explicit outcomes |
| 10 | Likes read state and remaining display fixes | 6, 7, 9 | Badges clear correctly; chips work; preview matches the public card; dates/history are readable |
| 11 | Database limits, constraints and legacy cleanup | Relevant write paths deployed | Direct API bypass attempts fail; query plans and bounded pagination verified; old credit shim removed |

These are reviewable change boundaries, not a requirement to complete every detail in one pull request. Promote error codes, rate limits and database constraints into the earlier package that needs them.

## 1. Relationship safety and transaction integrity

Primary code: `supabase/migrations/20260606090000_backend_performance_and_realtime.sql`, `20260610090000_safety_blocks_reports_deletion.sql`, `functions/create-like/index.ts`, `functions/reply-to-like/index.ts`, `functions/send-chat-message/index.ts`, and `functions/_shared/push.ts`.

The source confirms that replies reject dismissed likes but accept matched likes whose chat was deleted. Blocking dismisses only pending likes; unmatching deletes the chat without terminating the like. Message writes check membership but lack an explicit block check.

- Make block/unmatch close the underlying relationship and invalidate its likes in both directions. An unblock must not restore an old chat or make old likes actionable. Initial policy: no implicit rematch; a future rematch feature would require fresh mutual consent.
- Enforce block, suspension, membership and relationship state inside database write functions. A matched like without its original active chat must fail, rather than creating another chat. Edge Function checks alone are insufficient because authenticated callers can invoke the SQL functions directly.
- Serialize likes, replies, messages, blocks and unmatches using the same canonical user-pair lock and a consistent lock order. Recheck authorization after acquiring locks so a concurrent block cannot be bypassed.
- Represent a pair in canonical order and enforce one relationship/active chat per unordered pair. Move like creation, existing-pair detection and any credit debit into one database transaction. An opposite-direction like must reuse the existing interaction without a second debit or duplicate chat; preserve the explicit reply/consent flow.
- Add request IDs to retryable like/message/reply writes. Enforce uniqueness so a timeout followed by retry cannot create a second message or charge. Preserve existing client double-tap guards.
- Add database-backed limits shared across function instances: per-user like/scoring quotas and per-user/per-chat message throttles, including first replies. Limits apply to subscribers and direct RPC calls. Choose configurable thresholds and return `RATE_LIMITED` with a retry delay.
- Before dispatching a social push, recheck blocks and the referenced relationship/message. Suppress jobs for relationships that have ended. Pushes already handed to the provider cannot be recalled; old notification taps must still fail authorization safely.

Acceptance: test both block directions, unmatch, unblock, old like IDs, direct RPC calls, a suspended participant, simultaneous reciprocal likes, repeated request IDs and block-versus-send/reply races. Rejected writes must create no chat, message, debit, activity event or push job.

## 2. Profile loading and lossless saving

Primary code: `app/index.tsx`, onboarding/auth/tab route guards, `hooks/use-app-data.ts`, `hooks/use-domain-data.ts`, `services/supabase-auth-service.ts`, all onboarding steps, and `app/edit-profile.tsx`.

- Distinguish loading, failed load, confirmed missing profile, incomplete profile and completed profile. Only a successful missing/incomplete result may lead to onboarding. Show a retry screen for failed startup loads and enforce the same rule for deep links and authenticated layouts.
- Separate idempotent profile creation from profile editing. Replace whole-profile upserts with allowlisted field patches; omitted fields stay untouched and explicit empty values clear only the intended field. Return the saved server representation.
- Cancel relevant in-flight queries before optimistic writes. Serialize profile mutations per user, merge into the latest cache, preserve `_onboardingCompleted`, and reconcile server responses without overwriting pending edits. Use a server revision check to detect stale same-field edits from another device.
- Await saves before advancing onboarding; retain the local answer and offer retry on failure. Apply the same behavior to every step, including height, religion and birth details. Completing onboarding should be a dedicated validated operation, not another whole-profile write.
- On Edit Profile failure, retain the draft, restore the confirmed cached profile and display a clear save error. Navigate back only after success. Prevent late results from a previous account from updating the current session’s cache.

Acceptance: inject a startup profile error and verify zero writes; use delayed/out-of-order refetches and rapid step changes; retry a failed save; simulate a second-device conflict; verify unrelated fields and onboarding status remain unchanged. Save an explicit empty bio and confirm that it stays empty.

## 3. Birth details and chart consistency

Primary code: onboarding `kundli-details.tsx`, `birth-location.tsx`, `cosmic-chart.tsx`, `functions/generate-kundli/index.ts`, and the latest `protect_profile_columns` trigger.

- Keep persisted birth date/time empty until explicitly chosen or confirmed. A picker may have an initial scroll position, but that position must not count as an answer. Midnight is valid when explicitly selected.
- Store a confirmed place selection as one value: label, coordinates, timezone and selection source. Editing the search text invalidates the selection. Allow a selected search result or an explicitly confirmed map pin.
- Use device location only to position the map viewport until the user explicitly chooses it. Never replace a saved or newly selected birthplace when an asynchronous location request finishes.
- Validate finite coordinate ranges, date/time, timezone and place confirmation on the server. Require a review of date, time, place and map pin before final onboarding completion locks them. Preserve the age gate and existing server-owned-column protections.
- Tie generation results to a birth-input revision/signature; a generation request based on older inputs must not mark a newer profile as generated. Prevent final locking against a mismatched chart. Keep generation errors visible with retry.
- Provide an audited support correction path for already locked incorrect details. Regenerate the Kundli and invalidate/version dependent match reports and like references; do not silently keep compatibility based on the previous inputs.

Acceptance: typed city without selection cannot continue; a delayed device-location result cannot move the saved pin; revisiting preserves all inputs; unchanged picker defaults cannot pass; an explicitly selected midnight can pass; changing birth inputs while generation is running cannot install a stale chart.

## 4. Chat loading and notification lifecycle

Primary code: `hooks/use-domain-data.ts` (`markRead`), `app/chat/[chatId].tsx`, `hooks/use-notification-routing.ts`, and `lib/chat-cache.ts`.

- Do not call `setQueryData` with a fabricated empty array when previews are absent. Optimistic mark-read should update an existing cache only, with appropriate rollback and reconciliation.
- Mark read after the thread is authorized and loaded. Refetch/invalidate previews after success when needed. Fetch a thread by ID independently of whether it is currently in the preview list or a paginated first page.
- Distinguish loading, retryable error, missing/deleted chat and genuinely empty chats. Handle errors from the mark-read effect.
- Consume and clear the native last-notification response after handling it. Keep deduplication across remounts, clear pending responses on logout, and check the intended recipient/current session before routing. Revalidate old or blocked chat targets.

Acceptance: cold-start a message notification with an empty cache and delayed preview request; the list must still load normally. Log out/in and switch accounts after a tap; the old action must not run again. A new notification must still work.

## 5. Photo privacy

Primary code: storage migrations/policies, `services/supabase-auth-service.ts` (`profilePhotoUrl`, upload/delete/reorder), safety screens, and photo rendering components.

- Store immutable photo IDs/paths separately from delivery URLs. Remove public-URL parsing from photo ownership, deletion and reorder operations.
- Make `profile-photos` private and enforce owner/public-card visibility plus blocks and suspension on every authorized photo read. Preserve folder ownership rules for writes and special owner/moderation access. Avoid policy recursion between card/photo queries.
- Use authenticated image reads with authorization rechecked for each network fetch. A reusable signed URL remains usable until expiry, so it cannot provide immediate block revocation by itself.
- Stage updated clients before the bucket cutover; require a supported client version at cutover if older builds depend on public URLs. Verify old public URLs fail; address any CDN copies with invalidation or path rotation as required. Clear relevant app image/query caches on block/logout.
- State the practical boundary accurately: access can be denied for future requests, but an image already downloaded or saved by another person cannot be taken back.

Acceptance: test owner, eligible viewer, anonymous viewer, either block direction, suspended profile and direct object requests. Test both existing public URL forms and the new authorized route, including caching behavior on actual devices.

## 6. Compatibility, plans and credits

Primary code: `constants/mock-data.ts`, service profile/like/chat mappers, chat report fallbacks, `components/compatibility-report.tsx`, `hooks/use-domain-data.ts`, `services/supabase-domain-service.ts`, plans/settings/profile/discover screens, and plan seed data.

- Remove `createCompatibility` and all invented breakdown/report fallbacks, including the chat screen. Model compatibility as absent, loading, available or failed. Show a generation action or unavailable state when no real report exists; preserve a real zero score.
- Carry the real report ID/version through Discover, Likes, Chats and the match screen. Invalidate affected report caches when generation succeeds.
- Return effective entitlement from the server using the same active-status and future-expiration rule as credit spending. Render all Premium indicators from it. Refresh on app foreground, purchases and expiration; do not rely on a five-minute stale status.
- After scoring, invalidate credits/history even when the caller never sends a like. After an ambiguous timeout, reconcile with the server before encouraging retry. Preserve payment fulfillment idempotency.
- Introduce stable errors such as `CREDITS_REQUIRED`, `RATE_LIMITED` and `INTERACTION_UNAVAILABLE`. Parse Edge Function error responses in one client helper. Open the credit purchase prompt for insufficient credits instead of depending on a false return value that never occurs.
- Remove “Priority likes inbox”, “Advanced compatibility reports” and “Profile boost every week” from the existing database catalog as well as seeds until implemented. Do not expand scope to build these features as part of remediation. Check advertised credit bonuses against actual fulfillment.

Acceptance: missing reports display no score/yogas/breakdown anywhere; an expired active row renders free and is charged consistently; expiry while the app is open refreshes correctly; zero credits opens the intended prompt; scoring refreshes the balance; checkout callbacks still grant entitlements exactly once.

## 7. Discovery, current city and skipped profiles

Primary code: `get_discover_profiles`, `discovery_passes`, onboarding basics/preferences, profile editing, `hooks/use-app-data.ts`, and Discover.

- Normalize gender/preference values, including current non-binary labels and `Everyone`. Enforce mutual eligibility in the server query before pagination. Define legacy empty preferences as needing an explicit choice; do not infer them as Everyone.
- Add a separate current-city field/step backed by an explicit location choice. Keep current city distinct from birthplace. Remove the `India` placeholder and profile-card fallback; show no city until it is supplied. Prompt existing affected users to add their city rather than guessing it.
- Query skipped profiles from `discovery_passes` instead of filtering the Discover result that already excludes them. Add bounded pagination and an explicit revisit action. Reapply current preferences, blocks, suspension, visibility and existing-interaction exclusions.

Acceptance: verify both preference directions, Everyone, non-binary and legacy empty preferences; ensure filtering is correct across pages. With all eligible profiles skipped, the review button appears and opens the authorized skipped list.

## 8. Photo count, resizing and failed uploads

Primary code: onboarding photos, Edit Profile, `addPhotos` mutation, upload service and photo/storage write policies.

The UI already caps selection at six. Individual upload failures attempt object cleanup. The remaining work is server enforcement and reliable handling of partial batch success.

- Use the existing four minimum/six maximum product rule consistently. Enforce maximum registration/reservations atomically per user; enforce the minimum on onboarding completion and completed-profile deletion. Incomplete profiles may have fewer than four.
- Route deletion through an operation that checks the minimum before removing the reference/object. A Save-button check is too late because current removal happens immediately. Support replacement with a bounded staging reservation and an atomic reference swap before old-object cleanup.
- Resize/compress before base64 decoding/upload, use bounded upload concurrency and remove temporary files. Start with a configurable 1600-pixel longest edge and roughly 1 MB target; verify visual quality and memory use on a low-memory Android phone. Keep server MIME/byte limits.
- Track each batch item separately with a stable upload ID/path. Retain successful items in the UI, retry failed items only, and reconcile unknown outcomes by ID. Cleanup must not delete an item whose registration actually succeeded.
- Restrict object creation to valid upload reservations and expire abandoned reservations. Add bounded orphan cleanup so failed cleanup requests do not leave untracked storage forever.

Acceptance: concurrent uploads cannot exceed six; failure on the second item does not duplicate the first on retry; retry after a response timeout reuses the same item; removal at four is rejected before deletion; replacement at four/six works; account deletion still removes everything.

## 9. Authentication, settings and failure handling

Primary code: auth service/provider, phone sign-in, settings service/mutations, query consumers, `functions/_shared/http.ts`, and `functions/_shared/supabase.ts`.

- Add the shared typed error contract early. Allowlist public validation/business messages; return a generic message and correlation ID for unexpected/5xx failures, including errors wrapped by `rpcError`. Keep technical details in server logs.
- Show actionable wrong/expired OTP, resend/rate-limit and network errors. Honor server retry delays; keep existing submission guards.
- Ensure logout always removes the local session and cached data even when remote revocation is offline. Retire only this installation’s push registration, rather than all devices. If deregistration cannot reach the server, retain a durable device-scoped cleanup record and reconcile it before registering another account. Document that remote revocation/cleanup can be delayed offline.
- Patch only changed settings columns; create default settings separately. Serialize/version updates where needed, update the cache from the latest state, and roll back failed switches. Rapid notification and privacy toggles must not overwrite each other.
- Expose query-specific loading/error states to Discover, Likes, Chats, profile/account and settings screens. Preserve previously loaded content with a retry indicator on refresh errors; show empty states only after successful empty reads.
- Separate editable contact email from verified identity email. If profile email is only contact information, do not let it reserve an identity via uniqueness. If it is an identity field, accept it only through a verified Auth flow and server-controlled synchronization. Inventory/backfill existing addresses without linking accounts based on an unverified profile value.

Acceptance: offline logout ends the local session; another device remains registered; wrong OTP and throttled resend show different errors; two rapid toggles both persist; failed list requests never claim there are no matches; arbitrary profile email writes cannot claim someone else’s identity.

## 10. Read state and display behavior

- Persist recipient-owned like read timestamps and include them in the incoming-likes RPC. Mark the likes actually displayed as read on successful viewing; newly arriving likes remain unread. The badge must stay cleared after restarting.
- Make match icebreakers insert text into the chat composer for review before sending. Preserve normal authorization, credits policy and message throttles.
- Build “How others see you” from the same sanitized card model, visibility rules and rendering as the real public card. Leave empty bios empty. Do not substitute opening messages, last messages or invented text as someone’s biography.
- Store credit transaction action/target metadata and render a readable action with an authorized display name when available. Use a generic label for deleted/hidden targets. Backfill known legacy reason formats; never show a raw UUID or expose an otherwise hidden profile just to label history.
- Format plan dates in the user’s locale and use “valid until” unless automatic renewal is actually implemented.

Acceptance: view/restart/new-like badge sequence works; tapping an icebreaker opens an editable draft; preview and public card agree with every visibility toggle; history and dates are readable for existing and deleted targets.

## 11. Database housekeeping

- Add matching client/server constraints for name and bio, proposed at 80 and 500 characters. Audit existing oversized values first; do not silently truncate them. Apply earlier in the profile work where feasible.
- Add indexes based on actual query plans for the changed pair, discovery, unread and pagination queries. Several indexes already exist; do not duplicate them. Verify deterministic cursor ordering, including messages with identical timestamps.
- Bound/paginate incoming likes, chat previews, sent likes, blocked users and skipped profiles. The Discover query already caps results and credit history already limits to 50; retain those protections. Paginated chat lists must not break direct thread loading.
- Once every deployed consumer uses the supported atomic credit paths, revoke and drop `spend_credit(text)` using the prepared transactional retirement script. Verify deployed functions and old-client compatibility first; remove the stale README rollout instruction afterward.
- Add new forward migrations rather than editing applied migration history. Keep RLS, owner-folder protections, server visibility rules, credit serialization/refunds and client double-tap guards intact.

## Existing-data repair and rollout

1. Inventory deployed migrations/functions, client versions, storage settings and actual affected rows. The repository’s older production checklist says deployment was pending when written; treat that as historical, not current deployment evidence. Back up data and confirm restoration before repair.
2. Prepare read-only reports for reciprocal duplicate likes/chats, extra debit candidates, blocked/unmatched stale likes, expired subscriptions, orphan photos, photo counts, placeholder cities and suspect birth defaults. Do not classify a real 1 January 2000 birthday or midnight birth as wrong solely from its value.
3. Under a controlled write pause, terminate invalid connections, then merge duplicate live conversations into one canonical thread while preserving messages, participants, hidden state and read receipts. Keep an old-to-new chat ID mapping so existing links resolve only after authorization. Repair references before adding uniqueness constraints.
4. Reconcile duplicate charges from transaction evidence, including prior refunds. Use idempotent compensating credits with repair identifiers; do not delete ledger entries or refund legitimate distinct score/like actions.
5. Correct expired plan state without changing purchase/credit history. Offer city completion and an audited birth-detail correction flow; overwritten profile text can only be recovered from available backups/history, never reconstructed reliably from current rows.
6. Stage backend-compatible changes, then updated clients, then required version/storage cutovers and final legacy removal. Audit old clients that can still perform whole-profile upserts: either support their writes safely or require an update before profile/onboarding writes resume. Do not leave that data-loss path open after the fix.
7. Dry-run repairs against a production-like snapshot, record before/after counts and validate all constraints. Keep an audit of merges, mappings and credits. Prefer a corrective forward migration over restoring the entire database after users have created new data; a full restore can lose those writes. Privacy/security protections must not be relaxed as a rollback shortcut.

## Verification and release gates

Extend the existing Jest cache/service/notification tests and Deno guard/push tests. Add local Supabase integration tests using real authenticated users and database roles; mocked service tests cannot prove SQL authorization or concurrency safety. No new tests are needed solely for date formatting or static copy.

For the implemented changes, run:

```sh
npm --prefix apps/mobile test
npm --prefix apps/mobile run typecheck
npm run mobile:lint
npm run supabase:functions:test
```

Also apply migrations to a fresh local database and an upgraded seeded database, and run authenticated SQL/API/concurrency tests. Run two-device QA on Android and iOS for notification cold starts, blocks, message delivery and account switching; include slow/offline networking, permission denial and low-memory photo uploads.

Release gate: packages 1–5 pass their negative and race cases, existing-data repairs are reconciled, paid surfaces make no unsupported claims, and no tested failure path creates success-looking or empty-looking data. Observe save failures, denied interactions, duplicate/conflict rates, credit reconciliation and orphan counts after rollout, without logging message bodies, OTPs or birth details.

## Planning estimate

For one engineer familiar with this repository, allow roughly 1–2 engineering weeks for the release blockers and another 2–3 weeks for the remaining work, migration rehearsals and device QA. This is a planning range, not a delivery commitment; actual deployed-data cleanup, storage cache behavior and old-client support are the largest uncertainties. Re-estimate after the initial deployment/data inventory.
