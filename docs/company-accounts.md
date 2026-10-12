# Accounts: who exists, how to create one, how to delete one

One account is one company, with a team. There is no agency above it and no public sign-up: nobody can create an account or a company from the login page. Accounts and people are added on purpose.

## The two levels

| Level | What they can do |
| --- | --- |
| **Account Admin** | Every capability in the account. Manages Business Settings, Team access, research and the operational logs. |
| **Account User** | Only the capabilities an admin ticks: Research, Manage experiences, Manage ideas, Draft posts, Review, Publish. |

Capabilities are the per-user switches under Account User, not a level.

The database still has an internal "agency" record that every company hangs from, because removing it would be a destructive change that nothing needs. It has no screen and no role in the app any more. You never type or see its id.

## How people get in

1. An Account Admin opens **Settings, Team access**, and presses **Invite member**.
2. The form creates the login with a temporary password. The person must change it the first time they sign in.
3. In the Supabase dashboard, under Authentication, Providers, Email, switch **off "Allow new users to sign up"**. That closes the last way a stranger could create a login through the API, not only the missing page. (A dashboard setting, not code. Please confirm it is off.)

A person who belongs to one account goes straight into it when they sign in. A person who belongs to several (you, today) sees a short Companies list first, with no switcher inside an account; to return to it, go to `/clients`. Someone with no account sees "Access unavailable".

An Account Admin can reset the password of a member who belongs only to that account. A member who also belongs to another account has to be handled in the Supabase dashboard.

## Passwords

- **Change your own (new):** in the app, sidebar footer (and the phone menu), **Change password**. It asks for the current password, then the new one twice (12 or more characters with upper and lower case, a number and a symbol). A wrong current password changes nothing. Passwords are never stored by this app: the new one goes to Supabase Auth, which keeps only a salted bcrypt hash of it (`auth.users.encrypted_password`), so nobody, including you, can read a password from the database.
- **A team member's:** Settings, Team access, row menu, reset password (sets a temporary one and forces a change at next sign-in). Works for people who belong only to this account.
- **If you forget your own:** there is no "Forgot password" email yet (it needs email sending set up in Supabase). Reset it from the Supabase SQL Editor with the statements in the answer given in the session (set `auth.users.encrypted_password` with `extensions.crypt(..., extensions.gen_salt('bf'))` and `profiles.must_change_password = true`), then sign in with the temporary password and change it.

## Move existing Agency Admins to Account Admins (one-off)

Migration: `supabase/migrations/20261012230000_account_admins_replace_agency.sql`. It does two things, both additive (nothing is dropped or deleted):

- Gives every person who administered the agency an ordinary **Account Admin** row in each company under it. The app no longer looks at agency membership, so without this you would lose access.
- Lets **Account Admins** read their own company's operational logs (before, only Agency Admins could).

The agency tables and the agency member rows are left exactly as they are, unused.

**Preflight (read only):**

```sql
-- Who administered the agency, and which companies they will become Account Admin of
select am.user_id, u.email, c.id as company_id, c.name as company
from public.agency_members am
join auth.users u on u.id = am.user_id
join public.clients c on c.agency_id = am.agency_id and c.deleted_at is null
where am.role = 'agency_admin' and am.invitation_status = 'accepted'
order by u.email, c.name;
```

**Apply:** run the migration file as it is.

**Verify (read only):** every row from the preflight should now show as an accepted Account Admin.

```sql
select u.email, c.name as company, ca.role, ca.invitation_status
from public.agency_members am
join auth.users u on u.id = am.user_id
join public.clients c on c.agency_id = am.agency_id and c.deleted_at is null
left join public.client_access ca on ca.client_id = c.id and ca.user_id = am.user_id and ca.invitation_status = 'accepted'
where am.role = 'agency_admin' and am.invitation_status = 'accepted'
order by u.email, c.name;
-- expect role = client_admin and invitation_status = accepted on every line

select policyname from pg_policies
where schemaname = 'public' and tablename in ('audit_logs', 'llm_logs') and policyname like '%account_admin';
-- expect two rows
```

**Rollback:** only the two log policies can be undone cleanly. The Account Admin rows are harmless to leave in place.

```sql
drop policy if exists audit_logs_select_account_admin on public.audit_logs;
drop policy if exists llm_logs_select_account_admin on public.llm_logs;
```

Apply this **before** the app version that stops reading agency membership goes live. If the app goes first, you lose access to your companies until you apply it.

## Create an account

Script: `supabase/admin-scripts/create-company.sql`. Run it in the Supabase SQL Editor.

1. The first admin needs a login. In Supabase, Authentication, Users, **Add user**, with their email and a temporary password (tick auto-confirm). Share the password securely; they should change it after signing in.
2. Open the script, replace `__COMPANY_NAME__` and `__ADMIN_EMAIL__`, and run it. It returns the new company's id and the first admin. An empty result means nothing was created: check the email has a login and the name is 2 to 200 characters.
3. That person signs in, fills in Business Settings, and adds their team under **Settings, Team access, Invite member**.

## Delete an account (permanent)

Script: `supabase/admin-scripts/delete-company.sql`. **This cannot be undone.** It removes the company and everything under it: posts, ideas, Content Bank entries and resources, documents (database rows), calendar, research, newsletters, logs, audit history and who had access. The people's logins and profiles are kept.

Do the steps in order.

1. **Back up.** Take a Supabase backup (or at least export what you may need) before you start.
2. **Preflight (read only).** Replace `<COMPANY ID>` and check the numbers are what you expect:

```sql
select id, name, created_at from public.clients where id = '<COMPANY ID>';

select 'posts' as what, count(*) from public.posts where client_id = '<COMPANY ID>'
union all select 'content ideas', count(*) from public.content_ideas where client_id = '<COMPANY ID>'
union all select 'experiences and reactions', count(*) from public.founder_experiences where client_id = '<COMPANY ID>'
union all select 'resources', count(*) from public.content_resources where client_id = '<COMPANY ID>'
union all select 'documents', count(*) from public.client_documents where client_id = '<COMPANY ID>'
union all select 'newsletter editions', count(*) from public.newsletter_editions where client_id = '<COMPANY ID>'
union all select 'people with access', count(*) from public.client_access where client_id = '<COMPANY ID>';

-- Files and search-index entries that live outside the database (see "What it does not remove")
select filename, storage_path, vector_store_file_id from public.client_documents
where client_id = '<COMPANY ID>' and (storage_path is not null or vector_store_file_id is not null);
```

3. **Run the delete.** Open the script, replace `__COMPANY_ID__` and `__COMPANY_NAME__` (the name must be typed exactly as saved, which is the check that stops you deleting the wrong company), and run the whole block. It is all-or-nothing: if anything fails, or a row is left behind in any table, everything is rolled back and nothing is deleted. The error message says why.
4. **Verify (read only):**

```sql
select count(*) as company_rows from public.clients where id = '<COMPANY ID>';   -- expect 0
select count(*) as left_over from public.client_access where client_id = '<COMPANY ID>';   -- expect 0
```

### What it does not remove

- **Logins.** People who only belonged to this company still have a login but no access (they see "Access unavailable"). Remove them in Supabase, Authentication, Users, if you want them gone.
- **Files outside the database.** If the preflight listed a `storage_path` or a `vector_store_file_id`, those files live in Supabase Storage or the retrieval index; delete them there by hand.

## What was tested

- `tests/account-admins-sql.test.ts` runs the migration on a throwaway PostgreSQL (PGlite) with every migration applied: an Account Admin reads their own company's logs and not another company's; an Account User reads none; each accepted Agency Admin becomes an Account Admin of every company under the agency (a narrower existing row is upgraded, a revoked one is ignored, and a second run changes nothing). Both halves were mutation-checked.
- `tests/company-scripts-sql.test.ts`: a seeded company with rows in about twenty tables is deleted completely while a second company and all logins are untouched; a wrong name or unknown id deletes nothing; a table the script does not know about makes the whole thing roll back; creating an account adds one company with the person as its only Account Admin (and nothing for an unknown email or a one-letter name). The delete and create tests were mutation-checked.
- Run against the real database, none of this has been tried: use the preflight and a backup.
