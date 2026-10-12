# RSS articles into the Content Bank: apply guide

Migration: `supabase/migrations/20261012240000_content_bank_article_link.sql`

It is additive only. It adds one empty column and one index to `founder_experiences`. No row is changed or removed, no policy is touched.

- `source_article_id`: which collected RSS article a Content Bank entry was saved from (blank for every existing entry).
- A unique index so the same article can only have one live Content Bank entry. Pressing "Save to Content Bank" twice cannot create a duplicate.

**Apply this before the new version goes live.** The Content Bank list reads the new column, so deploying first would break it.

## 1. Preflight (read only)

Nothing to find first. Run this to confirm the column does not exist yet (expect no rows):

```sql
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'founder_experiences' and column_name = 'source_article_id';
```

## 2. Apply

Run the migration file as it is.

## 3. Verify (read only)

```sql
-- expect one row: source_article_id
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'founder_experiences' and column_name = 'source_article_id';

-- expect one row: founder_experiences_one_entry_per_article
select indexname from pg_indexes
where schemaname = 'public' and indexname = 'founder_experiences_one_entry_per_article';

-- expect 0: no existing entry was touched
select count(*) from public.founder_experiences where source_article_id is not null;
```

## 4. Rollback (only if something went wrong)

Run this only if you need to undo it. It is safe while no entry has been saved from an article. Once some have, dropping the column loses that link (the entries stay, but forget which article they came from).

```sql
drop index if exists public.founder_experiences_one_entry_per_article;
alter table public.founder_experiences drop column if exists source_article_id;
```

## What changes in the app

- **Research page, three tabs:** Web research, RSS feeds, Run history. The old tab links (`focus`, `articles`, `trendcards`) land on RSS feeds.
- **Web research tab:** the button is **Run web research**. The schedule and the imported article links are plain sections, not under Advanced.
- **RSS feeds tab:** your feeds, **Run RSS feeds**, Research Focus and the list of collected articles. Each article has **Save to Content Bank**. After saving it shows Create post, Add to Calendar and Open Content Bank, the same as a saved finding.
- **Run RSS feeds** fetches new articles and marks each one relevant or not. It no longer builds TrendCards. The background worker (when `RESEARCH_PIPELINE_FULL=true`) does the same.
- **Existing TrendCards** stay in the database and any Content Bank entries made from them keep working. There is no longer a screen for them.
- **Web research still reads the recent collected articles** as background (up to 20, plus up to 4 imported links), as before. A manual Run web research does not fetch the feeds itself; press Run RSS feeds first for the freshest articles. The scheduled run fetches the feeds first.
- **A failed web research run now says why** on the card, and the provider's exact reply goes to the server log (Railway) instead of the page.
