# Posts: Needs you, exact-version review, reject frees the entry, publish handoff

Status (2026-10-11): **implemented and validated locally; uncommitted. The migration is not applied to production.** Manual acceptance is deferred by Jawad to the end of the project.

Read AGENTS.md, security-access.md, design.md, feature-checklist.md and CONTRIBUTING.md in order, then `ui-reference/Claude Code handoff.md` and the wireframes (frames 1a H1, 1e d1 to d5, 1h).

## What changed

**Posts opens on "Needs you"** (a toggle with "All posts", which is the previous list). Three groups: Review (oldest first, with "Review next post"), Ready to publish, and In progress (entries a calendar draft is being written for). It replaces the Overview page's job; the Overview and Publish pages are removed later, when the sidebar changes.

**Review** (`/posts/[id]/review`):
- **Approve version N** names the exact version read. The request carries that version, the server refuses if the draft moved on (`STALE_VERSION`), and the write itself only matches while `draft_version` is still N, so a stale window can never approve a newer draft. It also records who approved.
- **Request edits** and **Reject** each ask for a one-line note.
- **Reject** is now one database transaction (`reject_post`): the post becomes rejected with the note, and its unpublished reservation is cancelled, so a single-use entry is available again. Published usage is never released.
- **Edit** is a new screen (plain text). The editor names the version it opened; saving creates the next version, withdraws any approval, records the editor, and is refused (`STALE_VERSION`) if a newer version exists. Published and rejected posts cannot be edited. This also adds the first UI for the previously unused edit service.
- The header shows "Version N · Edited by X · Approved by Y, date".

**Publish is the last step of a post:** an approved post shows three manual steps (copy the approved text, open LinkedIn, record the post's date and optional LinkedIn link, then Mark as published). The link must be https on linkedin.com or lnkd.in; the date cannot be in the future. The old Publish page still works until it is retired with the sidebar change.

## Migration `20261011183532_posts_review_outcomes.sql`

Additive and forward-only. Adds nullable `posts.approved_by`, `posts.last_edited_by`, `posts.linkedin_url` (with a 2,000-character check), the helper `private.post_review_allowed`, and `public.reject_post(client, post, note)`.

`reject_post` is SECURITY DEFINER with a fixed empty search path, because a reviewer may not hold the capability that updates reservations. It re-checks sign-in, an active profile with no pending password change, and admin or `posts_review` for that account; it touches only the named post and that post's own reservations; it refuses anything but a post under review; and it is revoked from `public` and `anon`.

Deploy order: **apply this SQL before the application is deployed.** The application tolerates the columns being absent (reads fall back, writes drop the new column) so a mistaken order does not break pages, but rejecting a post needs the function and will fail until it exists.

## Release (run by Jawad in the Supabase SQL Editor)

Copy with **Ctrl+C, never Ctrl+X**, and run the whole file as one query. If the editor will not take it, run these three line ranges of the file, each copied whole, in order: lines 18 to 30, then lines 32 to 55, then lines 57 to 116.

1. **Preflight (read-only):**
```sql
-- Expect zero rows: none of these exist yet.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'posts'
  and column_name in ('approved_by', 'last_edited_by', 'linkedin_url');
select p.oid::regprocedure from pg_proc p
where p.proname in ('reject_post', 'post_review_allowed');
-- Context: posts by status (nothing here is changed).
select status, count(*) from public.posts group by 1 order by 1;
```
2. **Migration:** the complete contents of `supabase/migrations/20261011183532_posts_review_outcomes.sql`.
3. **Verify (read-only):**
```sql
select p.proname, p.prosecdef as security_definer, r.rolname as role,
       has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
from pg_proc p
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
  and p.proname in ('reject_post', 'post_review_allowed')
order by 1, 3;
-- Expect reject_post: security_definer true, anon false, authenticated true, service_role true.
-- Expect post_review_allowed: security_definer true, anon false, authenticated true.
select column_name, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'posts'
  and column_name in ('approved_by', 'last_edited_by', 'linkedin_url') order by 1;
-- Expect three rows, all YES.
```
4. **Register history:**
```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20261011183532', 'posts_review_outcomes')
on conflict (version) do nothing;
```
5. **Rollback (no data is changed by the migration):**
```sql
revoke execute on function public.reject_post(uuid, uuid, text) from authenticated, service_role;
-- Only if you registered history and want to re-run later:
-- delete from supabase_migrations.schema_migrations where version = '20261011183532';
```
The columns and helper may stay. Do not drop either function without separate approval. After this rollback, rejecting a post would fail until the function is re-granted or the application is reverted (`git revert`).

Backup: none is verified or waived for this project. The migration adds nullable columns and two functions and changes no rows.

## Validation (local, no paid calls)

`tests/post-review-outcomes-sql.test.ts` (9, on the fully migrated database): a reviewer without Manage ideas rejects and frees a single-use entry; the entry can be reserved again; admin allowed; planner and drafter refused; other account refused; pending password change refused; a note is required; approved, published and already rejected posts are not rejected and published usage is kept; only that post's reservations are released; grants and nullable columns.
`tests/post-review-service.test.ts` (44): exact-version approval (refused when stale, atomic on the version, who recorded, works before the column exists), rejection through the database function, publishing with a validated date and LinkedIn link, version-checked editing.
`tests/posts-needs-you.test.ts` (10): titles, status lines, grouping, order, permissions, the decision bar and the publish handoff.

## Deferred manual checks

Open Posts and see Needs you; Review next post goes to the oldest; approve names the version; open a post in two windows, edit in one and approve in the other, and confirm the approval is refused; request edits and reject need notes; reject a post that holds a single-use entry and confirm the entry is available again in Content Bank; a reviewer without Manage ideas can reject; edit an approved post and confirm approval is withdrawn; publish an approved post by hand with and without a link; non-reviewers and non-publishers see dimmed actions with a reason. A calendar slot whose post is rejected still shows the slot as Drafted; decide whether rejection should also release the slot.
