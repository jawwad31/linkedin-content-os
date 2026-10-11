# Dated calendar entries (backend for the Add to Calendar redesign)

Status (2026-10-11): **migration written and tested locally; not applied to production; the application does not use it yet.** Manual acceptance is deferred by Jawad to the end of the project.

Read AGENTS.md, security-access.md, design.md, feature-checklist.md and CONTRIBUTING.md in order, then `ui-reference/Claude Code handoff.md` and `ui-reference/Virel Phase 1 Wireframes.dc.html` (frames 1c, 1d, 5a).

## Why

The wireframes replace the monthly plan (settings, preview, confirm) with a dated calendar: pick an entry, pick a date this month or next, and the entry is reserved for that date. Any number of posts may share a day, but a day that already has posts asks first. "Replan month" moves several reserved entries to new dates at once. Existing slots had no date (positions 1..N in a month plan), so this needs a date column and two new functions.

## What the migration adds (`20261011172150_dated_calendar_entries.sql`)

Additive and forward-only. Nothing is dropped or rewritten; existing slots keep a null date; the earlier monthly-plan functions remain untouched and callable.

- `calendar_slots.scheduled_date date` (nullable) and a partial index on `(client_id, scheduled_date)`.
- `private.calendar_account_today(client_id)`: today's date in the account's calendar timezone (UTC if none or invalid).
- `public.add_calendar_entry(client_id, source_id, source_type, date, allow_same_day)`: SECURITY INVOKER. Requires an admin or `ideas_manage`. Refuses past dates and any month other than this or next. Creates the month row from the account defaults when missing (an internal bookkeeping snapshot of 60 posts and 100% experience when no defaults exist; nothing in the dated calendar reads it). Takes the same per-entry advisory lock as every other reservation path, checks the entry is ready, active, not already in that month and (if single-use) not held elsewhere, returns `DATE_HAS_POSTS` with the posts already on that date unless `allow_same_day` is true, then inserts one reserved slot and one `calendar_slot` reservation and advances the plan revision.
- `public.move_calendar_slots(client_id, calendar_id, moves, allow_same_day, expected_plan_revision)`: SECURITY INVOKER, same permission. Locks the calendar row, requires the previewed revision (null refused, stale returns `PLAN_REVISION_CONFLICT`, nothing changes), moves only plain `reserved` slots (not queued, drafting, drafted or backing a post), within that calendar's month and not into the past, asks before landing on a day that has posts or putting two moved entries on one day, changes dates only (reservations untouched), and advances the revision once.
- Grants: both functions revoked from `public` and `anon`, granted to `authenticated` and `service_role`.

Not changed: access rules (still admin or `ideas_manage`), source readiness and single-use rules, the one-active-slot-per-entry-per-month index, drafting state guards, account defaults, or any existing row.

Assumptions to confirm: Replan month moves entries only within their own month; the "monthly mix recalculated in the backend" has no effect in the dated model (only source-backed slots exist), so nothing recalculates it; a legacy undated slot can be given a date through `move_calendar_slots`.

## Validation (local, no paid calls)

`tests/dated-calendar-sql.test.ts`: 17 tests on the fully migrated database. Add: reserves with slot and reservation, account defaults used and untouched, Content Resource as an asset, today allowed and past or beyond-next-month refused, same-day ask then any number, already-in-month, held single-use, draft or foreign entry, reusable across months, capability and account scope, null or malformed arguments. Move: several at once with one revision step, stale or missing revision, same-day asks, swap needs no ask, unchanged dates move nothing, past or other-month dates, drafted or backed slots and other accounts refused, capability. Grants.

## Release (run by Jawad in the Supabase SQL Editor, when the application change is ready)

Apply the schema first. The currently deployed application never calls these functions, so applying early changes nothing for it, and there is no outage window.

1. **Preflight (read-only):**
```sql
-- Expect zero rows: neither function exists yet.
select p.oid::regprocedure from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('add_calendar_entry', 'move_calendar_slots');
-- Expect zero rows: the column does not exist yet.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'calendar_slots' and column_name = 'scheduled_date';
-- Context: how many slots exist (all will keep a null date).
select status, count(*) from public.calendar_slots group by 1 order by 1;
```
2. **Migration:** paste the complete contents of `supabase/migrations/20261011172150_dated_calendar_entries.sql` and run it once. It is rerunnable.
3. **Verify (read-only):**
```sql
select p.proname, p.prosecdef as security_definer, r.rolname as role,
       has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
from pg_proc p
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('add_calendar_entry', 'move_calendar_slots')
order by 1, 3;
-- Expect security_definer false; anon false; authenticated true; service_role true.
select count(*) as dated_slots from public.calendar_slots where scheduled_date is not null;  -- expect 0
```
4. **Register history:**
```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20261011172150', 'dated_calendar_entries')
on conflict (version) do nothing;
```
5. **Rollback (no data is changed by the migration):**
```sql
revoke execute on function public.add_calendar_entry(uuid, uuid, text, date, boolean) from authenticated, service_role;
revoke execute on function public.move_calendar_slots(uuid, uuid, jsonb, boolean, integer) from authenticated, service_role;
-- Only if you registered history and want to re-run later:
-- delete from supabase_migrations.schema_migrations where version = '20261011172150';
```
The column and helper function are harmless and may stay. Never drop either function without separate approval. Before the application uses these functions, any slots added through them carry a date; those slots remain valid if the functions are later revoked.

Backup: no verified backup or recorded waiver exists for this project. The migration adds a nullable column and functions and changes no rows; the decision stays with Jawad.

## Next

Step 2 builds the Add to Calendar screens on these functions (entry panel, month and date picker, same-day question, confirmation), then the month view and the Replan month dialog. The application change must not deploy before this migration is applied.
