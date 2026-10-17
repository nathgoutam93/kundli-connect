# Support correction of locked birth details

Implemented locally on 17 October 2026. No hosted database was inspected or changed. This extends the [data-repair tooling](data-repair-rollout.md) with an administrative path for a member-confirmed correction after onboarding.

## Behavior and access

A correction changes exactly the six birth fields and installs a replacement Kundli in one transaction. It advances the birth revision once, preserves onboarding completion, bio, photos, visibility and suspension, and retains original chart/report data in a restricted archive. A failed validation, stale inspection, chart write or audit/archive insert rolls the entire correction back. There is no intermediate committed state with corrected inputs and an old chart.

The preparer uses the same calculation module as ordinary Kundli generation. It binds the generated chart to the confirmed inputs, expected revision, user and reviewed fingerprint. The database checks those bindings and the chart structure; it trusts the privileged operator's locally generated artifact for the astronomical calculation. It does not accept this artifact from app clients or an API service key.

- The general `maintenance.repair_actions` entry contains hashes and provenance, not birth inputs.
- `maintenance.birth_corrections` stores the previous/corrected birth fields, previous Kundli and previous match reports. It has RLS enabled and no app/API service-role access. Its private records cascade away when the owning profile is deleted; the redacted general action record remains.
- A committed repair key can replay only the identical artifact. Repreparing a changed correction requires fresh review; failed/unapplied keys can be reused with a newly reviewed artifact.
- The ordinary profile RPC still rejects changes to locked birth fields. Corrections do not reset onboarding or relax blocks/unmatches.

All affected match-score rows are marked invalid, retaining their IDs and original reports for administrative history. Authenticated raw-table reads, Likes/Chats joins and the public-card view suppress those reports. Existing likes keep their score references and conversations/messages remain intact. A new like requires a current score. A later authorized score refresh reuses the stored score ID and costs no additional score credit.

A queued chart/score calculation based on the previous revision fails its commit. Scoring, chart commits and corrections coordinate through ordered birth-input locks; report and cache-counter updates also acquire rows in a consistent order. PostgreSQL guards remain authoritative; device/concurrent-connection checks are still required before production.

Weekly insights are revision-bound too. Old rows remain stored but hidden after a correction. The updated job tags its computations, skips stale inserts and checks the revision again before handing off a push. Previously unversioned insight rows are hidden after this migration until the updated job fills the current version. Existing pushes already handed to the provider cannot be recalled.

## Deployment order

1. Apply `supabase/migrations/20261017130000_birth_correction_consistency.sql` in staging after the previous remediation migrations. It adds invalidation metadata/policies, cache-version events and insight revision guards. It does not correct anyone's birth fields.
2. Deploy `generate-kundli`, `generate-match-score` and `send-astro-insights`, including their shared modules. The weekly job's conflict key now includes `input_revision`; do not leave an old job serving the new schema. Old unversioned job inserts are skipped safely.
3. Release the matching app build. Authenticated `user_data_versions` events clear the affected chart/profile/report caches for the owner and score counterparts, then reload current values. Open message caches and editable drafts are retained. Reconnect/refresh retrieves current server data; offline/downloaded copies cannot be remotely taken back.
4. Install the administrative tooling separately through a database-owner connection:

   ```sh
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/maintenance/install.sql
   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/maintenance/install-birth-corrections.sql
   ```

   Both installers are repeatable. Keep the `maintenance` schema out of the API schema list.
5. Run the updated insight job for the current week to replace unversioned display data, then verify it produces no duplicate current-revision rows or pushes on a repeat. After a correction, the member's insights remain unavailable until that version is recalculated by the job; the replacement Kundli itself is already available immediately.

## Inspect and confirm

Verify the authenticated account's ownership through the existing verified sign-in/support process. An editable contact email is not proof of ownership. Record the member's confirmation of the date, exact local time, birthplace, selected coordinates/map pin and timezone in the support evidence referenced by this repair.

The audit's midnight/January 2000 flags are review signals, not proof of an error. A real midnight birth and 1 January 2000 date remain valid. Do not infer a corrected place from GPS, a current city or the old default. This workflow accepts adult dates from 1900 onward; escalate underage or unsupported records for separate handling rather than making them appear eligible.

Inspect one account with a stable statement:

```sql
select maintenance.birth_snapshot('<reviewed-user-uuid>') as inspected_state,
       maintenance.fingerprint(maintenance.birth_snapshot('<reviewed-user-uuid>')) as expected_fingerprint;
```

Record `birthRevision` and the SHA-256 fingerprint from this inspection. The snapshot includes a hash of the birth inputs, profile state and chart/report provenance, not raw birth fields. An intervening profile edit or report/chart change makes the prepared action stale; it must be inspected again. Do not recalculate the expected fingerprint automatically at apply time.

## Prepare a private dry-run script

Use `supabase/maintenance/private/` for local inputs/output; it is ignored by Git. Keep this folder and exported artifacts in restricted support storage. The generated SQL contains birth data, so treat the file and any database statement logs accordingly. The CLI creates a new output file with mode `0600` and refuses to overwrite an existing file.

Start with this template and fill every field from the reviewed account and member-confirmed details. Set both confirmation flags to true only after that confirmation:

```json
{
  "repairKey": "SUPPORT-123-birth",
  "evidenceRef": "SUPPORT-123",
  "userId": "<reviewed-user-uuid>",
  "expectedRevision": 0,
  "expectedFingerprint": "<recorded-64-character-sha256>",
  "memberConfirmed": false,
  "placeConfirmed": false,
  "birth": {
    "date_of_birth": "<YYYY-MM-DD>",
    "time_of_birth": "<HH:MM:SS>",
    "birth_place": "<confirmed-place>",
    "birth_latitude": null,
    "birth_longitude": null,
    "birth_timezone": "<IANA-timezone>"
  }
}
```

The preparer validates dates/times, adult eligibility, finite coordinate ranges, a nonempty place and a valid timezone. Coordinates use at most six decimal places. It rejects nonexistent local DST times and ambiguous folds, including half-hour transitions; an ambiguous time needs the member-confirmed fixed UTC offset (for example `-4`) instead. It never selects an offset or pin silently to resolve ambiguity.

With Deno dependencies already cached by the normal Deno checks, run offline:

```sh
DENO_NO_PACKAGE_JSON=1 deno run --cached-only --node-modules-dir=none \
  --allow-read=supabase/maintenance/private/input.json \
  --allow-write=supabase/maintenance/private/preview.sql \
  supabase/maintenance/prepare-birth-correction.ts \
  supabase/maintenance/private/input.json supabase/maintenance/private/preview.sql
```

The command uses no database credentials or network access. It prints only preparation status. Its output contains the computed replacement chart and a default read-only transaction:

```sh
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/maintenance/private/preview.sql
```

The result is a redacted preview: user/key, new revision, affected report count and chart/state hashes. It writes no profile, chart, invalidation event or audit row. Review the result and the original evidence before applying the identical file with `-v apply=true`:

```sh
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -v apply=true -f supabase/maintenance/private/preview.sql
```

Reusing the identical committed script returns its original outcome without another revision advance or chart/report change. A stale fingerprint raises `40001`; inspect and prepare a new file instead of bypassing the guard. Engine mismatch also refuses apply. Keep the installer's accepted engine (`local-1`) in sync with `KUNDLI_ENGINE_VERSION` when releasing an engine change.

## Verification and remaining gates

Local results: 121 mobile tests across 30 suites, typecheck/lint, 47 Deno tests, changed entrypoint checks and all seven SQL regression suites passed on fresh and legacy-seeded embedded PostgreSQL databases. The rehearsal generated a genuine chart using the offline CLI, executed its read-only preview, applied/replayed its SQL, checked private output permissions and verified that apostrophes/backslashes/SQL-like place text remain literal data.

`supabase/tests/birth_correction_regression.sql` checks stale fingerprints, confirmation/input/chart bindings, archive-failure rollback, revision increments, preservation of unrelated fields/conversations, private archive/role permissions, raw/table/card/list suppression of stale reports, rejection of queued old chart/score/insight work, free score refresh with stable IDs/references and archive cleanup on account deletion. Its structural chart fixture tests SQL atomicity/binding; Deno tests and the CLI rehearsal test the actual calculation.

PGlite uses minimal Auth/Storage scaffolding. Before production, verify the entire chain in Supabase staging with two connections/devices: simultaneous corrections/scoring/profile saves, a queued old calculation, report suppression through raw API and all screens, cache events to both participants, continued messaging, current-week insight regeneration and account deletion. Confirm the archive is unavailable through the app/service role and rehearse a backup restore. Keep actual production changes tied to a concrete reviewed artifact.

No hosted correction, deployment or backup recovery has been performed. Remaining work is production inventory and repair execution, recovery of overwritten text from actual backups, full Supabase concurrency/API testing, device QA and the coordinated release/legacy-credit retirement.
