# Calendar plan-revision check

Status (2026-10-11): **migration applied to production manually; application release committed and pushed; deployment verification and manual acceptance pending.** Until the matching application is live, plan commits on the previously deployed application fail (the old four-argument function is revoked).

Read AGENTS.md, security-access.md, design.md, feature-checklist.md and CONTRIBUTING.md in order, then the P05 section of IMPLEMENTATION-PLAN.md and `docs/handoffs/CURRENT.md`.

## The problem

`commitCalendarPlan` ([service.ts](../src/features/calendar/service.ts)) built its plan from separate reads and then called `commit_calendar_plan`, which locked the calendar row and rechecked source availability but never checked that the plan it replaced was the plan the user previewed. Another session could replan in between, and this commit would replace that newer plan and release reservations the user was never shown. Source contention itself was already safe: the advisory locks and availability checks stop two commits reserving one single-use entry.

## What was implemented

Migration `supabase/migrations/20261010013333_calendar_plan_revision_check.sql` (generated with the Supabase CLI; forward-only, additive, no data touched, nothing dropped):

- **New five-argument function** `public.commit_calendar_plan(p_client_id uuid, p_calendar_id uuid, p_slots jsonb, p_replace boolean, p_expected_plan_revision integer)`. No argument has a default, so a caller cannot omit the revision. The body is the previous function unchanged, plus a check immediately after the existing `for update` row lock and `NOT_FOUND` return and before any validation, advisory lock, release or insert:
  - `null` revision returns `PLAN_REVISION_REQUIRED` (refused, never skipped).
  - A different revision returns `PLAN_REVISION_CONFLICT` with `current_plan_revision`, changing nothing.
- **Grants:** the new function is revoked from `public` and `anon` and granted to `authenticated` and `service_role`. It remains `security invoker` with `search_path = public`.
- **Old four-argument function retained, not dropped**, with execute revoked from `public`, `anon`, `authenticated` and `service_role`. It is no longer reachable through the API as an unchecked write path. The previous migration only granted, and Supabase default privileges grant new functions to the API roles, so the revoke names each role explicitly.
- Because the signatures differ, PostgREST resolves a five-named-argument call to the new function only; no overload ambiguity.

Application changes (same release as the migration):

- `PlanPreview.planRevision` carries the revision read when the preview was built; the calendar row is read before the slots, so a race can only make the stored revision newer than the one named, which the database rejects.
- `commitCalendarPlanAction` / `commitCalendarPlan` require `expectedPlanRevision`; it is validated as a nonnegative integer (otherwise `PLAN_REVISION_REQUIRED`, no database call) and is never defaulted from a fresh read.
- The panel sends `preview.planRevision`. `PLAN_REVISION_CONFLICT` and `PLAN_REVISION_REQUIRED` are stale-plan codes: the preview is cleared, data is reloaded and the user is told "This month's plan changed after you previewed it. Nothing was changed. Reload, review the latest plan and preview again."
- A double submit applies once: the second request names the old revision and is a conflict, not a second reservation.

## Limits (unchanged by this work)

`plan_revision` is incremented only by `commit_calendar_plan`. `cancel_calendar_slots`, drafting transitions (queued, drafting, post attached) and month settings saves do not change it and are not covered by the check. Those paths are already safe at commit time in a narrower way: queued/drafting/post-bearing slots are never replaced, fewer free slot indexes returns `TOO_MANY_SLOTS`, and a cancelled slot's source simply stays available. Extending the revision to them would change the cancel and drafting RPCs and the panel remount key; it is not part of this change.

## Local validation (2026-10-10)

Run with no paid model calls:

- `npx tsc --noEmit`: clean (after fixing two pre-existing type errors in the uncommitted Posts page and a test fixture).
- `npm run lint`: clean.
- Full suite: **40 files / 360 tests passed.** Focused additions: matching revision; stale revision leaves slots, reservations and revision unchanged; revision ahead; `null` refused; duplicate submission applies once; check precedes validation; other-account calendar and single-use contention unchanged; grants (old function unreachable by `anon`, `authenticated`, `service_role`; new function reachable only by `authenticated` and `service_role`); service forwards the previewed revision and refuses a missing/invalid one without a database call; conflict is surfaced safely with no audit entry; new readiness-scoping loader test.
- `npm run build`: passes. `git diff --check`: clean.
- The SQL tests run in PGlite as a single connection, so "concurrent" updates are two sequential commits naming the same preview revision. True two-session lock contention is not exercised locally; it needs the production two-window check below.

## Production result

Jawad applied the migration manually through the Supabase SQL Editor on production project `iphivwufbnmgbuqhicjn`: Stage 1 (five-argument function and its grants) then Stage 2 (revoke on the four-argument function). Reported results, seen as screenshots: privilege matrix with the four-argument function `false` for `anon`, `authenticated` and `service_role`, and the five-argument function `false` for `anon` and `true` for `authenticated` and `service_role`; a call as `authenticated` to the five-argument function with a nonexistent calendar returned `{"ok":false,"code":"NOT_FOUND"}`; a call to the new function as `anon` and a call to the old function (earlier) both returned `42501 permission denied for function commit_calendar_plan`. The migration-history table accepts `(version, name)` (all other columns nullable). Not reported and therefore not claimed: the PUBLIC pseudo-role check, preflight outputs, security advisors, the two-window conflict, and history registration.

## Production readiness (original blockers, now superseded where noted)

**Superseded: the migration was applied manually by Jawad; the blockers below were the reason this session did not apply it itself.** This session had no Supabase MCP or authenticated CLI, no database connection string and no Railway CLI. The local service-role key can read and write rows through the API but cannot run DDL, list grants or show backups. Per the release instructions, production was not touched.

Blockers for Jawad:

1. **Backup.** Earlier records state this project is on a plan without verified backups, and the backup waiver granted for P08 covered that migration only. This migration changes no data, but CONTRIBUTING.md still requires a recoverable backup or an explicit, recorded decision for this operation. Options: confirm a recent Supabase backup exists (dashboard, Database, Backups), take a manual dump before applying (for example `supabase db dump` for schema and the calendar and usage tables, stored outside Git), or explicitly waive for this migration.
2. **Database access** for whoever applies it (Supabase MCP, or CLI login plus the project's database password).

### Pre-flight checks to run on production first

```sql
-- 1. Expect exactly the four-argument function and no five-argument one yet.
select oid::regprocedure from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'commit_calendar_plan';
-- 2. Record current grants (to confirm the revoke afterwards).
select r.rolname, has_function_privilege(r.rolname, 'public.commit_calendar_plan(uuid,uuid,jsonb,boolean)'::regprocedure, 'execute')
from pg_roles r where r.rolname in ('anon','authenticated','service_role');
-- 3. Confirm the function body matches 20261007070000 (compare md5 of prosrc).
-- 4. content_calendars.plan_revision exists and is integer not null.
```

### Release order

1. Resolve the blockers; verify the target project ref is the production project (`iphivwufbnmgbuqhicjn`).
2. Apply the migration. **From this moment until step 4 completes, plan commits fail** for users on the old application, because it still calls the four-argument function that is now revoked. Preview, settings, cancel and all other pages are unaffected. Keep the window to minutes: have the commit ready and push immediately.
3. Verify: the five-argument function exists with the grants above, the four-argument function is not executable by any API role, an unauthenticated call is denied, security advisors show no new finding.
4. Commit the application and migration together and push to `origin main`; confirm web and worker deployments at the exact SHA.
5. Smoke checks in a dedicated test workspace (never in customer calendars), including the two-window stale-plan conflict.

### Rollback

- **Application only:** `git revert` the release commit and push. The reverted application calls the four-argument function, so also re-grant it (below) or the old behavior stays unreachable.
- **Re-open the old function** (instant, no DDL): `grant execute on function public.commit_calendar_plan(uuid, uuid, jsonb, boolean) to authenticated, service_role;`. The five-argument function can stay; it is unused.
- **Do not drop either function** without separate explicit approval. Reverting application code does not reverse the migration; any removal is a forward migration.
- **Restore:** because no table or row changes, a data restore is not expected to be needed. If a restore is ever required, use the backup verified in the blocker above (point-in-time or dump) and re-run the pre-flight checks afterward.

## Manual acceptance still required

See the cumulative backlog in `docs/p10-release-validation.md`. In particular, the two-window stale-plan conflict, lost-response recovery and duplicate requests must be run against production after deployment and recorded; none of those has been run.
