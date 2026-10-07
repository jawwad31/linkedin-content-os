# Current handoff

Updated: 2026-10-07

- Active editor: none (Claude Sonnet 5.5 finished P05 and stopped at the user's request). Next editor: any tool; read the five canonical files first, one phase at a time.
- Current phase: **P05 complete. P06 not started.** The user works one prompt at a time and starts P06 only when they say so.
- Repository: jawwad31/linkedin-content-os, main.
- Current commit: `fb7f67f` (pushed). P05 feature commit: `4160ec1`. Migration fix commit: `e9fd7b1`. Previous phase baseline: `01ff201`.
- Product name: Virel.

## Commit history of this session

1. `e9fd7b1` fix: correct permission array checks and resource backfill in P02/P03 migrations
2. `4160ec1` feat: add monthly calendar allocation and defaults (P05)
3. `fb7f67f` docs: record P05 completion
4. (this handoff correction, if committed after `fb7f67f`)

## Database state

All migrations `20261006150000` to `20261006190000` were applied to production by Jawad on 2026-10-07 using a combined single-transaction script (since deleted). Jawad reported the P05 manual checks as passed; the individual results, including the two-browser contention check, were not itemised.

Why that was needed: the P02 and P03 migrations as first committed could not apply (`text[] ? text` is not a Postgres operator; a backfill read non-existent `posts` columns). Fixed in `e9fd7b1`. Nothing after them had ever been applied.

## P05 summary

- Two save scopes: *Save for this month* writes only that month's snapshot (`content_calendars`); *Save as default* (admin only) writes only `calendar_defaults` and bumps its version. New months copy the defaults and record `defaults_version`; reset-to-defaults is a separate explicit action; stale revisions are rejected.
- Allocation (`src/features/calendar/allocation.ts`): integer-exact largest-remainder, ties experience, asset, evergreen, news; news clamped to `floor(postCount x cap / 100)`; shortages become evergreen slots with a reason; news slots are placeholders.
- SQL functions (SECURITY INVOKER): `reserve_content_bank_source`, `commit_calendar_plan`, `cancel_calendar_slots`. A per-entry transaction advisory lock serialises reservations across calendar and standalone drafting; a plan commit writes nothing unless every selected entry is available. Replan only touches slots with no post attached.
- UI: Calendar nav item and `/client/[client_id]/calendar`. Shows "Calendar is not available yet" if the migration is missing.
- Permissions: defaults are admin only; month settings, selection, replan, cancel need `ideas_manage` or scoped admin; any accepted member can view.
- Deleting a founder experience that an active slot plans is blocked (`DEPENDENCY_CONFLICT`); a missing calendar table does not block deletion.

Key files: `supabase/migrations/20261006190000_monthly_calendar_allocation.sql`; `src/features/calendar/*`; `src/app/client/[client_id]/calendar/page.tsx`; `src/features/content-bank/usage-service.ts` (reserve via RPC, with a fallback to the old non-atomic path until the migration is confirmed everywhere; remove `reserveSourceEntryWithoutLock` once it is); `tests/support/pg-harness.ts`.

## Validation at P05 completion

`npm test`: 24 files, 216 tests (baseline 18 files, 115). `npm run lint` clean. `npm run build` succeeds. The SQL tests run every migration on PostgreSQL 18 via PGlite (devDependency `@electric-sql/pglite`), so a migration that cannot apply fails `npm test`. Mutation checks confirmed the contention and admin-gate tests fail when the logic is weakened.

## Known limits and gotchas

- PGlite is single-connection: true simultaneous transactions were not tested in CI; sequential contention and advisory-lock acquisition/release are.
- **postgrest-js turns a failed HEAD request with an empty body into `error: null`.** Do not use `head: true` for existence or dependency checks whose error matters; use a GET with `limit(1)`. Existing code (for example the `content_ideas` check in `deleteFounderExperience`, and P02 queries) still uses `head: true`; not changed.
- `tsc --noEmit` reports one pre-existing error in `tests/profiles.test.ts` (`archetypes` not in `StrategyCompatibility`, from P01). `next build` still succeeds.
- No calendar (grid) view: slots have no dates yet. Standalone posts join a calendar only when assigned to a slot; that assignment (`calendar_slots.post_id`) arrives with P06.
- Pre-existing deletion paths and tombstones, one-active-post-per-idea, approval invalidation, and the capability model are unchanged.

## P04 source-type correction (2026-10-07)

The source-type constraint failure was reproduced on PostgreSQL via PGlite before fixing it. Forward migration `20261007060000_standalone_source_modes.sql` preserves legacy ideas and accepts all seven `SOURCE_MODES`. Initial drafting and redrafting now share scoped source resolution: assets must be active and account-owned, selected documents must be ready/account-owned, profile-led drafts use current profile context, and supplied inline notes are retained in protected `source_context` records. Missing sources fail closed.

Validation: 26 files / 222 tests pass; lint and production build pass. Production migration and connected source-path manual checks remain unverified. No production database connection is configured in this cloud task. Baseline for the correction is `498edb1`; Codex is the active editor. P06 is authorized next, and later phases remain outside this task.

## P06 design notes (nothing is implemented)

Findings from reading the code, to avoid repeating the investigation:

- The existing worker (`src/worker/scheduler.ts`) is an hours-interval RSS loop. It cannot import the writer: `produceReviewedPost` calls `createClient()` (Next request cookies), and the worker's own comments say importing `next/headers`-dependent modules breaks its module graph. So executing the writer in the worker needs a larger refactor.
- Proposed design: user-triggered pump in the web process. SQL functions with leases (`FOR UPDATE SKIP LOCKED`, lease token, attempts cap), a job table with idempotency key and one active job per calendar, slot columns for draft state and a small brief (topic, pillar, post type, funnel stage), executor written against injectable ports so interruption, cancellation, lease loss and mixed success are unit-testable, and a Calendar UI that drafts a bounded batch and shows per-slot state with retry.
- Extract the drafting core out of `generateStandalonePost` so slots reuse an existing reservation (do not reserve again). Reuse a per-slot backing `content_ideas` row so a retry after a crash cannot create a second post (the unique active-post-per-idea index guards it).
- P05's `commit_calendar_plan` and `cancel_calendar_slots` treat `post_id is not null` as locked; P06 must also lock slots in `drafting` state (forward migration with `create or replace`).
- QA is advisory in this codebase: a draft is always created with warnings, so a "QA-blocked" slot does not exist; failures are generation or configuration failures. Posts need both `ideas_manage` and `posts_draft` to be drafted from an assignment (`security-access.md`).
- The in-memory rate limiter works on `Request`s only, so it does not apply to server actions; bound jobs structurally in the database.

## Deployment state

`4160ec1` and `fb7f67f` pushed to main; web deployment of these was not verified by me. No environment variables were added.

## Next step

1. Jawad decides when to start P06 (one prompt at a time).
2. Apply the P04 corrective migration and verify connected source-path drafting/redrafting.
3. Then P06: `feat: add resumable calendar drafting`. P07 to P10 remain planned and must not be started until their predecessors meet their gates.

## Blockers

P04 correction is implemented; its production migration/manual checks are pending.
