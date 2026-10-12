# Company accounts: who exists, how to create one, how to delete one

There is no public sign-up. Nobody can create an account or a company from the login page. People and companies are added on purpose, by someone who already has the right level.

## The three levels

| Level | Belongs to | What they can do |
| --- | --- | --- |
| **Agency Admin** | The agency, above all companies | Opens every company under the agency, with every capability. Sees the Companies list when there is more than one company. This is you. |
| **Account Admin** | One company | Every capability inside that company. Manages Business Settings, Team access, research and logs. |
| **Account User** | One company | Only the capabilities an admin ticks: Research, Manage experiences, Manage ideas, Draft posts, Review, Publish. |

Capabilities are the per-user switches under Account User, not a level. There is no screen for managing Agency Admins; that is done in SQL (the `agency_members` table).

## How people get in

1. An Agency Admin or Account Admin opens **Settings, Team access**, and presses **Invite member**.
2. The form creates the login with a temporary password. The person must change it the first time they sign in.
3. In the Supabase dashboard, under Authentication, Providers, Email, switch **off "Allow new users to sign up"**. That closes the last way a stranger could create a login through the API, not only the missing page. (This is a dashboard setting, not code. Please confirm it is off.)

A person with exactly one company goes straight into it when they sign in. An Agency Admin with several companies lands on the **Companies** list, opens one, and has no switcher inside it (to return to the list, go to `/clients`). Someone with no company sees "Access unavailable".

## Create a company

Script: `supabase/admin-scripts/create-company.sql`. Run it in the Supabase SQL Editor.

1. Find your agency id:

```sql
select id, name from public.agencies;
```

2. Open the script, replace `__AGENCY_ID__` and `__COMPANY_NAME__`, and run it. It returns the new company's id.
3. Sign in, open `/clients`, open the new company, then **Settings, Team access, Invite member** to add its first Account Admin. Then fill in Business Settings.

## Delete a company (permanent)

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

`tests/company-scripts-sql.test.ts` runs both scripts on a throwaway PostgreSQL (PGlite) with every migration applied: a seeded company with rows in about twenty tables is deleted completely while a second company and all logins are untouched; a wrong name or unknown id deletes nothing; a table the script does not know about makes the whole thing roll back; creating a company adds one empty company, and nothing for an unknown agency. The delete test was mutation-checked (removing two delete lines makes it fail). Run against the real database, none of this has been tried: use the preflight and a backup.
