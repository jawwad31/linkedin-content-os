# Current handoff

Updated: 2026-10-07

- Active editor: Claude (Sonnet 5.5)
- Current phase: P05 complete (migrations applied to production and manual checks reported passed by Jawad, 2026-10-07). P06 in progress.
- Repository: jawwad31/linkedin-content-os, main.
- Baseline commit: 01ff201 (feat: unify source based drafting and editorial controls)
- Product name: Virel.

## Read this first: migration state

The P02 and P03 migrations as originally committed could not apply to PostgreSQL, and the Supabase CLI stops at the first failing file, so **nothing after them (P04's migration and P05's) could have been applied by an ordered run**. Found by applying every migration in order to a PostgreSQL 18 instance (PGlite):

- `20261006160000_content_bank_and_source_usage.sql` and `20261006170000_documents_and_retrieval.sql` used `ca.permissions ? '...'`, a jsonb-only operator. `client_access.permissions` is `text[]`, so both failed with `operator does not exist: text[] ? unknown`.
- `20261006160000` also backfilled content-resource usage from `posts.selected_resource_id` and `posts.title`, which do not exist (they are on `content_ideas`).

Both are fixed in commit e9fd7b1 (before P05). **Action for Jawad before relying on any of P02-P05 in production:** check which of `20261006150000` to `20261006190000` are actually recorded as applied in the target database (`supabase_migrations.schema_migrations` or the Supabase dashboard). If `source_usage`, `documents` tables or the P04 `posts` columns are missing, they have never been applied. If a hand-patched version of either file was applied manually, the repository file now matches the intent, but compare before re-running. Apply in filename order. P05 migration: `supabase/migrations/20261006190000_monthly_calendar_allocation.sql`.

Until the P05 migration is applied the web app still works: the Calendar page shows "Calendar is not available yet", and standalone drafting falls back to the previous (non-atomic) reservation path. Remove that fallback (`reserveSourceEntryWithoutLock` in `src/features/content-bank/usage-service.ts`) once the migration is confirmed in every environment.

## P05 deliverables

- **Two save scopes.** *Save for this month* writes only that month's snapshot (`content_calendars`). *Save as default* (admin only) writes only `calendar_defaults` and bumps its `version`. Neither touches the other; a new month copies the defaults at the moment it is first saved and records `defaults_version`. *Reset this month to the current defaults* is a separate explicit action. Stale-revision saves are rejected, not overwritten.
- **Settings.** Posts per month (1-60), IANA timezone, four source shares (integers, sum 100), news cap. Shares above the news cap must be resolved before saving. No allocation numbers are hardcoded; a month with no saved defaults starts blank.
- **Deterministic allocation** (`src/features/calendar/allocation.ts`): integer-exact largest-remainder, ties in order experience, asset, evergreen, news. News is clamped to `floor(postCount x cap / 100)` and the excess is re-apportioned across the other buckets by share.
- **Source selection.** Eligible Content Bank entries are counted from the database (ready, not archived/deleted, resource active, not held by a preserved slot, and either reusable or free of any active reservation/use), ranked least-used then most recent. The user selects entries; nothing is selected or reused to hit a percentage. Fewer selected than needed becomes evergreen slots with a recorded reason (`fewer_selected` or `no_eligible_entries`). News slots are unfinished placeholders.
- **Atomic reservation.** SQL functions `reserve_content_bank_source`, `commit_calendar_plan`, `cancel_calendar_slots` (all SECURITY INVOKER). A per-entry transaction advisory lock serialises every reservation of an entry across calendar and standalone paths. A plan commit validates every entry first and writes nothing unless all are available. Standalone drafting (`reserveSourceEntry`) now uses the same function.
- **Replan.** Preview, then explicit confirmation. Only slots with no post are cancelled (their reservations released); slots carrying a post are preserved. An entry can appear once per calendar.
- **Cancellation** releases reservations of unfinished slots; slots with a post are never cancelled.
- **Dependencies.** `calendar_slots.post_id` references `posts` with no cascade, so deleting a post still slotted returns the existing `DEPENDENCY_CONFLICT`. Hard-deleting a founder experience that an active slot plans is blocked with `DEPENDENCY_CONFLICT`; if the calendar table does not exist yet (migration pending) that check passes rather than blocking every deletion. Slots are cancelled, never deleted.
- **Rollout safety note.** The existence/dependency checks use a plain GET with `limit(1)`, not `head: true`: postgrest-js turns a failed HEAD request with an empty body (what a missing table returns) into `error: null`, which would hide the failure. Prefer GET for any check whose error must be seen.
- **Permissions.** Defaults: Account/Agency Admin only. Month settings, selection, replan, cancel: `ideas_manage` or scoped admin. Viewing: any accepted member. Enforced in services and RLS; no delete policies or grants on the new tables.
- **UI.** New Calendar nav item and `/client/[client_id]/calendar` (month navigation, settings with inline validation, requested-versus-planned table, candidate checklists, plan preview, slot cards, per-slot and bulk cancel).

## Files changed

New: `supabase/migrations/20261006190000_monthly_calendar_allocation.sql`; `src/features/calendar/{allocation,months,schemas,queries,service,actions}.ts`, `calendar-panel.tsx`, `calendar-plan-view.tsx`; `src/app/client/[client_id]/calendar/page.tsx`; `src/lib/supabase/schema-errors.ts`; `tests/calendar-{allocation,service,sql,panel,queries}.test.ts`, `tests/founder-experience-delete.test.ts`; `tests/support/pg-harness.ts`.

Modified: `src/features/content-bank/usage-service.ts`, `src/features/founder-experiences/service.ts`, `src/components/app-shell/nav-items.ts`, `tests/content-bank.test.ts`, `package.json` and `package-lock.json` (devDependency `@electric-sql/pglite`), `security-access.md`, `feature-checklist.md`, this file.

Separate earlier commit e9fd7b1: the two P02/P03 migration fixes above.

## Validation

- `npm test`: 24 files, 216 tests passed (baseline 18 files, 115 tests).
- `npm run lint`: clean. `npm run build`: succeeded; `/client/[client_id]/calendar` in the route table. `git diff --check`: line-ending notices only.
- Migrations: all 23 apply in order to PostgreSQL 18 (PGlite) with minimal Supabase stubs (auth schema, roles, `auth.uid()`). `tests/calendar-sql.test.ts` runs this chain on every `npm test`, so a migration that cannot apply now fails the suite.
- Mutation checks performed: disabling the single-use check in `commit_calendar_plan` fails two contention tests; weakening the admin gate fails the defaults-permission test.
- Covered: month-only versus default saves (table-level separation), new month copying defaults version, small counts, rounding, news cap floor (swept over 1-60 posts and seven share sets), zero eligible entries, 12 requested / 8 selected (actual 8/3/16/3), reuse, archived/draft/missing/other-account entries, bucket/source mismatch, duplicate entries, plan-exists, replan preserving slots with posts, cancellation and release, RLS (planner, drafter, admin, other account), post-dependency block, raw database errors not exposed.

## Not verified (be honest about these)

- **True concurrency.** PGlite is single-connection, so two simultaneous transactions were not run. Sequential contention is tested, and a test confirms the advisory lock is held for the transaction and released after. Please run the "two browsers, one single-use entry" check after deployment.
- **No live UI check.** The panel was server-rendered in tests and compiled in the build, but not opened in a browser against Supabase, and not checked at 375/768/desktop widths or with a keyboard.
- **Pre-existing, not fixed:** `tsc --noEmit` reports one error in `tests/profiles.test.ts` (committed in P01; `archetypes` is not in `StrategyCompatibility`). `next build` still succeeds.
- Calendar view (as opposed to list) is not built: slots have no dates in P05.
- Standalone posts become part of a calendar only when assigned to a slot; the assignment path (setting `calendar_slots.post_id`) arrives with P06 drafting. The preserve-on-replan rule is already enforced in SQL and covered by tests.

## Behavior preserved

Standalone drafting, one active post per idea, approval invalidation, post deletion tombstones, Team Access/capability model, agency isolation, manual publication.

## Environment variables

None added.

## Deployment state

Committed and pushed to main; no migration applied by this session (no database access). Web deploy status not verified. Post-deploy checks pending: apply migrations; create two different months; change account defaults; confirm the first month is unchanged; check shortage counts and the entry references on the plan; run the two-browser contention check.

## Next step

1. Jawad applies the migrations and confirms P05 post-deploy checks.
2. Then P06 — Resumable calendar draft batches (`feat: add resumable calendar drafting`).

## Blockers

P05 completion and P06 start depend on the migration being applied to the real database and on deployment/manual checks only Jawad can run.
