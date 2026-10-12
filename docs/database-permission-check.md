# Database permission check (read only)

Four queries to run in the Supabase SQL Editor, and what the answers should look like. **Nothing here changes anything**: every query only reads. Run them and send me the results; I will tell you if anything needs fixing and, if so, give you a separate apply and rollback block.

Also open Supabase, **Advisors**, **Security Advisor**, press refresh, and send me what it lists (a screenshot is fine).

## Why

Every table holds private company data. Two things protect it: Row Level Security (RLS: the database checks, row by row, who may see or change it) and the list of who is allowed to call each database function. If either is loose, someone who is not signed in could reach data through the public API. The app never relies on that, but the database should be safe on its own.

## 1. Tables with Row Level Security switched off

```sql
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;
```

**Expect: no rows.** Any table listed here can be read by anyone with the public key.

## 2. Functions anyone can call without signing in

```sql
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as runs_with_owner_rights,
       has_function_privilege('anon', p.oid, 'execute') as signed_out_can_call,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_call
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by signed_out_can_call desc, p.proname;
```

**Expect:** the only functions a signed-out person can call are the three small access helpers that return true or false for the current login (`has_client_access`, `has_agency_access`, `has_agency_access_for_client`). They return nothing useful without a login, so they are harmless. **Any other function with `signed_out_can_call = true`, especially one with `runs_with_owner_rights = true`, needs a look.**

## 3. What a signed-out visitor is allowed to do to tables

```sql
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as signed_out_privileges
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
group by table_name
order by table_name;
```

**Expect:** Supabase grants these by default, and RLS then blocks every row. So a long list is normal **only if query 1 returned no rows**. The two answers must be read together.

## 4. Policies that let everyone through

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and (trim(qual) = 'true' or trim(with_check) = 'true')
order by tablename, policyname;
```

**Expect: no rows.** A policy that is simply `true` lets every matching person in, whichever company they belong to.

## What to send me

The rows from queries 1, 2 and 4 (and a note if query 3 looks odd), plus the Security Advisor list. If everything matches "Expect", we are done and I will record it as checked.
