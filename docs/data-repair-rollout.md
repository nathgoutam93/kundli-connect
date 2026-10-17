# Existing-data audit and repair tooling

Implemented locally on 17 October 2026. No hosted database was inspected or changed. This batch prepares executable tooling; it does not establish whether any production account needs a repair.

## Files and installation

- `supabase/migrations/20261017120000_repaired_chat_aliases.sql` adds authorized redirects for merged chats and preserves message retry semantics across those redirects.
- `supabase/maintenance/install.sql` installs administrative audit, snapshot and repair functions and an audit table in the separate `maintenance` schema. Installation is repeatable. The schema is not exposed through PostgREST; anonymous users, authenticated app users and the API service role have no schema/function/table privileges. The audit table has RLS enabled.
- `supabase/maintenance/audit.sql` runs the inventory in a repeatable-read, read-only transaction, returning summary counts and candidate rows.
- `supabase/maintenance/run-repair.sql` is a psql driver. Dry run is its default and uses a read-only transaction. Apply requires an explicit `-v apply=true`.
- `supabase/tests/maintenance_regression.sql` exercises the real database functions and role permissions on rollback-only fixtures.

Apply the migration in staging, deploy the updated `send-chat-message` Edge Function and release the matching mobile client before performing chat merges. The client resolves historical links, uses the canonical thread for messages/read state/realtime and retains the routed source ID for its persisted send-retry journal. Pushes from new sends use the canonical chat ID. Earlier clients may fail to open a merged source link; require a supported build before merging production conversations.

Install the tools through an administrative database connection, not an API service key:

```sh
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/maintenance/install.sql
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/maintenance/audit.sql
```

`DATABASE_URL` is supplied by the operator; these scripts do not load application env files or print credentials. Keep the existing Supabase API schema list unchanged; do not expose `maintenance`. Only the database owner/operator should run repairs. Retain audit exports and repair evidence in restricted support storage.

## What the audit identifies

The report returns IDs, counts, state flags and photo paths, not message bodies, names, biographies, email addresses or full birth inputs.

| Candidate | Interpretation |
| --- | --- |
| Duplicate live pair | More than one active like or unresolved chat for the same unordered pair. Previously merged source chats are excluded from unresolved chat counts. |
| Blocked active like / ended or invalid chat / matched like without chat | Review the full pair and its block/end evidence. Invalid membership and unlinked chats need manual investigation. |
| Repeated debit candidate | Multiple metadata-attributed debits for the same account, action and target, with associated refunds listed. A like and a score are distinct actions. This is not a finding that a refund is owed. |
| Unattributed debit | The old ledger lacks sufficient structured action/target metadata. Amounts and timing alone are insufficient proof of duplicate billing. |
| Expired active plan | An active row whose expiration has passed or is missing. Effective entitlement already treats it as expired. |
| Photo count / missing object / orphan object | Investigate counts, references, storage timestamps, live reservations and existing cleanup jobs. Do not delete references merely to make counts pass. |
| Legacy city / oversized text | Prompt explicit city completion or text correction. Never infer the city from birthplace or silently truncate text. |
| Birth details / chart or score revision review | Check user confirmation and chart provenance. A real 1 January 2000 birthday or midnight birth is valid; the flags do not prove the inputs are wrong. No date, time, coordinate or chart is changed by the audit. |

The report targets the current schema after all remediation migrations. Preserve a pre-deployment export as well: earlier migrations already dismiss known blocked/stale likes and clear the exact legacy city placeholder. Those changes can remove a current-state signal without repairing historical messages or charges. The inventory scans the database; rehearse its runtime on representative data and schedule it appropriately.

## Review one action, then preview it

Every action takes a stable repair key, structured arguments, an evidence/ticket reference and the SHA-256 fingerprint of the reviewed state. First inspect a snapshot and record its fingerprint. For example, replace the bracketed UUIDs with the reviewed pair and canonical chat:

```sql
select maintenance.snapshot('merge_chats',
  '{"userA":"<first-user-uuid>","userB":"<second-user-uuid>","canonicalChatId":"<canonical-chat-uuid>"}'::jsonb);
select maintenance.fingerprint(maintenance.snapshot('merge_chats',
  '{"userA":"<first-user-uuid>","userB":"<second-user-uuid>","canonicalChatId":"<canonical-chat-uuid>"}'::jsonb));
```

Pair snapshots retain message IDs, hashes, timestamps, read state, participants and event metadata, with message/opening text removed. They are administrative records, not public exports. Keep the reviewed args and fingerprint together; read them from the same inspection rather than silently recalculating the expected fingerprint during apply.

With `repair_args` set to that reviewed JSON and `reviewed_sha256` set to its recorded fingerprint:

```sh
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v repair_key=historical-pair-001 -v kind=merge_chats \
  -v args="$repair_args" -v expected="$reviewed_sha256" -v evidence=SUPPORT-123 \
  -f supabase/maintenance/run-repair.sql
```

This returns the intended destination, source chat IDs and message counts without changing application data or writing an audit row. Review the result and supporting evidence before using the same command with `-v apply=true`. Each apply is one atomic action. It acquires the relevant application advisory locks and row locks, rechecks the fingerprint and records before/after state, outcome, operator, timestamp and transaction ID in `maintenance.repair_actions`. If either repair or audit insertion fails, the entire action rolls back.

A changed fingerprint raises `40001` and requires fresh inspection. Do not bypass it or automatically rebase a reviewed repair onto newer data. Reusing a committed key with the identical request returns its previous outcome. Reusing that key with different args, evidence or expected fingerprint is rejected.

## Available repairs

| Kind | Required arguments | Behavior and boundaries |
| --- | --- | --- |
| `merge_chats` | `userA`, `userB`, `canonicalChatId` | Requires at least two unresolved, mutually matched chats with exactly the expected two participants and no foreign message senders. Refuses blocked, suspended, ended or unlinked relationships. The canonical chat must be explicitly selected. |
| `end_relationship` | `userA`, `userB` | Requires current block/suspension/end evidence or a matched like without a chat. Dismisses all pair likes while preserving chats/messages for audit. It does not delete history or permit an implicit rematch. |
| `refund_debit` | `debitId`, `keepDebitId` | Requires two equal negative debits for the same account and retains one. Conflicting action/target metadata and an already-refunded retained debit are rejected. Restores only the unrefunded remainder of the selected debit, under the existing per-user credit lock, with `refundOf`, repair key and retained debit metadata. Does not alter/delete either debit or purchase history. |
| `expire_plan` | `userId`, `asOf` | Updates only an active plan expired at a finite, nonfuture reviewed cutoff to `expired`. Keeps plan ID, expiration and purchase/credit history. |
| `clear_placeholder_city` | `userId` | Clears only the exact trimmed legacy `India` value. Keeps onboarding completion and all other profile fields. Missing cities require an explicit user answer. |
| `queue_orphan_photo` | `path` | Requires an existing owning profile, an object at least 24 hours old, no profile reference and no live reservation. Adds the path to the existing cleanup queue; deletion uses the existing Storage API worker. Never deletes `storage.objects` rows or registered photos in SQL. |

A duplicate-debit candidate still requires independent evidence of an extra charge, including existing refunds and the legitimate action being retained. Where metadata is absent, the operator must reconcile backups, request/payment logs and ledger history; the function cannot infer intent. No bulk “refund all candidates” operation is provided. A fully refunded debit produces zero additional credit even with another repair key.

A merge moves original message rows without changing IDs, bodies, request IDs, timestamps or read receipts. It conservatively ORs hidden flags and retains the oldest participant read cursor, including NULL. Source chat and participant records remain stored, source likes are dismissed, activity links are updated and source IDs redirect to the canonical chat. Retry receipts remain unchanged. Send retries against the source or canonical destination return the original message after current authorization checks. Replies to dismissed source likes remain denied. Blocks, unmatches and suspension make historical redirects unavailable.

Run production applies only after a backup/restore rehearsal and a dry run against a representative snapshot. Pause relevant writes for chat consolidation and confirm the inspected rows remain unchanged. Row/advisory locks do not replace the release's two-connection and device race tests. Preserve source and audit records; use a reviewed forward correction if an operator selects the wrong canonical thread. Do not disable app authorization or constraints as an undo mechanism.

## Verification and remaining work

Local validation passed: 120 mobile tests across 30 suites, mobile typecheck/lint, 40 Deno tests, the changed Edge Function entrypoint check and all six SQL regression suites on fresh and legacy-seeded embedded PostgreSQL databases. Repeated tool installation and a real read-only audit/default preview also passed.

The follow-up [birth-correction batch](birth-correction-rollout.md) adds a seventh SQL suite. After all migrations, install both maintenance tool files in the disposable test database before running the full suite:

```sh
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/maintenance/install.sql
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/maintenance/install-birth-corrections.sql
for test_file in supabase/tests/*_regression.sql; do
  psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$test_file" || exit 1
done
```

`TEST_DATABASE_URL` must identify a disposable test database, never production. `maintenance_regression.sql` seeds historical reciprocal likes by temporarily disabling the insert guard inside its rollback-only test transaction; no production repair disables triggers.

The suite covers dry runs, a real post-inspection edit, idempotent keys, audit-failure rollback, content/read/request preservation, old/canonical send retries, ended-relationship refusal, unrelated-account denial, partial refunds, different-action refusal, expiry/city repair and recent/reserved-photo protection. The local rehearsal also executes the audit and default dry run inside a real read-only transaction, repeats installation, and applies the full migration chain to fresh and legacy-seeded embedded PostgreSQL databases.

Also run mobile tests/typecheck/lint, Deno tests and the `send-chat-message` entrypoint check. PGlite uses minimal Auth/Storage scaffolding and does not prove concurrent-connection or hosted API behavior. Verify those in staging, including two simultaneous repairs/refunds, a competing send/block/read, canonical realtime updates, source-link navigation and push destinations on two devices.

The follow-up [birth-correction workflow](birth-correction-rollout.md) implements locked-input correction, chart regeneration and dependent-report invalidation locally. Recovery of overwritten profile fields from actual backups, production inventory/reconciliation, deployment, hosted legacy-credit retirement and the earlier device/concurrency release gates remain. The tooling neither guesses missing profile text nor silently “corrects” legitimate birth defaults.
