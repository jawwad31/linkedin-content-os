# Content Bank: save a research finding as a trend reaction (database change)

Migration file: `supabase/migrations/20261012210000_content_bank_research_finding_link.sql`. **Not applied yet.** Apply it before the code that uses it goes live (before the next push to `main`), because the Content Bank list reads the new column.

Additive only: one nullable column and one partial unique index on `public.founder_experiences`. No row is changed or removed, no policy or function is touched, and no table is dropped. Saving a finding uses the signed-in person's own session and the existing insert policy (`founder_experiences_insert_permitted_contributor`: a `trend_reaction` row needs `research_contribute` or an admin role).

What it does:

1. Adds `source_research_finding_id` (uuid, nullable) with a foreign key to `research_findings(id)`, `on delete set null`.
2. Adds a unique index so one finding has at most one live Content Bank entry per account. This makes "Save to Content Bank" safe to repeat or double-click.

Run in the Supabase SQL Editor, one block at a time, in this order.

## Preflight (read only)

```sql
-- The column must not exist yet, and the index name must be free
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'founder_experiences'
  and column_name = 'source_research_finding_id';

select indexname from pg_indexes
where schemaname = 'public' and indexname = 'founder_experiences_one_entry_per_finding';

-- research_findings must exist with its primary key
select count(*) as findings from public.research_findings;
```

Expected: the first two queries return no rows (if either returns a row, the migration was already applied; skip to Verify). The third returns a number.

## Apply

```sql
alter table public.founder_experiences
  add column if not exists source_research_finding_id uuid
    references public.research_findings (id) on delete set null;

create unique index if not exists founder_experiences_one_entry_per_finding
  on public.founder_experiences (client_id, source_research_finding_id)
  where source_research_finding_id is not null and deleted_at is null;
```

## Verify (read only)

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'founder_experiences'
  and column_name = 'source_research_finding_id';

select indexdef from pg_indexes
where schemaname = 'public' and indexname = 'founder_experiences_one_entry_per_finding';

-- Every existing entry is untouched: this must be 0
select count(*) as entries_with_a_finding
from public.founder_experiences where source_research_finding_id is not null;
```

Expected: one row (`uuid`, `YES`); one index row mentioning `WHERE ((source_research_finding_id IS NOT NULL) AND (deleted_at IS NULL))`; `entries_with_a_finding` is 0 until someone saves a finding.

## Rollback

Only if you need to undo it. Run this only while no entry has been saved from a finding, or accept that those entries lose their research link (the entries themselves stay, but they can no longer be used for a post, because the app needs the link).

```sql
drop index if exists public.founder_experiences_one_entry_per_finding;
alter table public.founder_experiences drop column if exists source_research_finding_id;
```

## Tests

`tests/content-bank-finding-sql.test.ts` applies every migration to a throwaway PostgreSQL (PGlite) and checks the column, the one-live-entry rule, that a deleted entry frees the finding, that removing a finding keeps the entry, and that the existing row policy still refuses members without the research capability. It was mutation-checked: with the index made non-unique the duplicate test fails.
