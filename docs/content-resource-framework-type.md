# Content Resource "Framework" type

Status (2026-10-11): **implemented and validated locally; uncommitted, migration not applied to production, not deployed.** Manual acceptance is deferred by Jawad to the end of the project.

Read AGENTS.md, security-access.md, design.md, feature-checklist.md and CONTRIBUTING.md in order, then the P02 sections of IMPLEMENTATION-PLAN.md and `docs/handoffs/CURRENT.md`.

## Why

The product specification lists framework among the lead-magnet subtypes. The Content Bank schema already accepted it, but the legacy type list and the database check allowed only seven types, so a framework could not be saved. `docs/content-bank-management-parity.md` recorded this as the one remaining Content Bank gap.

## What changed

- `RESOURCE_TYPES` in `src/lib/ai/playbooks/taxonomies.ts` gains `framework`. That list drives the Content Bank form, the legacy Content Resources form and the legacy resource schema, so all three now offer it, and it now matches the Content Bank schema's `LEAD_MAGNET_TYPES`.
- Migration `supabase/migrations/20261011095112_content_resource_framework_type.sql` widens `content_resources_type_check` to eight types in one `ALTER TABLE` statement (drop and add together), so the table is never unconstrained. Existing rows are untouched and all still satisfy the wider check.
- Two user-facing sentences list "frameworks" among resource examples.
- No playbook change was needed: the resource type reaches the planning and writing prompts only as a plain display string, and no playbook enumerates the types. `resources/context/business-context.md` is a loaded prompt file and was deliberately not edited.
- Tests: `tests/content-resource-types.test.ts` (type lists agree, legacy schema accepts framework and rejects unknown types, the database stores every type, an unsupported type is still rejected by the same constraint, the constraint is named and includes framework).

Preserved: legacy `/resources` route and navigation, account isolation, admin-only resource management, comment-gate approval and delivery validation, reservation and usage ledgers. No new permission, table, function or grant.

## Production release (run by Jawad in the Supabase SQL Editor)

Order: apply the schema first, then deploy the application. If the application were deployed first, choosing Framework would fail at the database with a constraint error (safe, but confusing). The currently deployed application never sends `framework`, so applying the schema first changes nothing for it, and there is no outage window.

### 1. Preflight (read-only)

```sql
-- Current constraint (expect seven types, no 'framework').
select pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'content_resources_type_check'
  and conrelid = 'public.content_resources'::regclass;

-- Every existing row must already fit the wider list. Expect ZERO rows.
select resource_type, count(*)
from public.content_resources
where resource_type not in ('guide','template','checklist','framework','report','worksheet','tool','other')
group by 1;

-- Context only: how many resources exist per type.
select resource_type, count(*) from public.content_resources group by 1 order by 1;
```

Save the first result; it is your rollback reference.

### 2. Migration (copy exactly)

```sql
alter table public.content_resources
  drop constraint if exists content_resources_type_check,
  add constraint content_resources_type_check
    check (
      resource_type in (
        'guide',
        'template',
        'checklist',
        'framework',
        'report',
        'worksheet',
        'tool',
        'other'
      )
    );
```

It takes a brief exclusive lock on `content_resources` while the existing rows are checked; with the few rows this table holds that is momentary. It is rerunnable. The leading comment block in the migration file is explanatory only and may be omitted when pasting.

### 3. Verify (read-only)

```sql
-- Expect eight types including 'framework'.
select pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'content_resources_type_check'
  and conrelid = 'public.content_resources'::regclass;
```

### 4. Register history

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20261011095112', 'content_resource_framework_type')
on conflict (version) do nothing;
```

### 5. Rollback

Only meaningful while no resource uses the new type. Check first:

```sql
select count(*) as framework_rows from public.content_resources where resource_type = 'framework';
```

If it is `0`, restore the previous constraint:

```sql
alter table public.content_resources
  drop constraint if exists content_resources_type_check,
  add constraint content_resources_type_check
    check (resource_type in ('guide','template','checklist','report','worksheet','tool','other'));
```

If it is not `0`, the statement fails safely and changes nothing (the existing rows are validated). Do not reclassify or delete those resources without explicit approval. An application rollback (`git revert`) alone is enough to stop offering Framework; leaving the wider constraint in place is harmless. Never drop the column or table.

### Backup

The migration changes no rows. As with the plan-revision migration, no verified backup or recorded waiver exists for this project; that decision remains Jawad's, and the saved constraint definition from preflight step 1 is the recovery reference for this change.

## Manual acceptance (deferred to the end)

Create a Framework in Content Bank (admin) and through the legacy Content Resources page; edit it and change its type to and from Framework; confirm it appears in Content Bank with its type, is usable for Create post and Add to Calendar as a resource, and that a non-admin still cannot manage resources; confirm existing resources of every older type still load and save. Keep every earlier P00-P10 gate pending.
