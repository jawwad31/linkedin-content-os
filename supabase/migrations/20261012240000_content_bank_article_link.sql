-- Collected RSS articles can be saved to the Content Bank as a trend reaction.
--
-- Additive only: one nullable column and one partial unique index on
-- founder_experiences. No data is changed or removed, no policy is touched, and
-- no function is added: inserts keep using the existing
-- founder_experiences_insert_permitted_contributor policy (a trend_reaction row
-- needs research_contribute or an admin role).
--
-- source_article_id ties one Content Bank entry to the collected article it was
-- saved from. The unique index makes "Save to Content Bank" idempotent: saving
-- the same article twice cannot create a second live entry.

alter table public.founder_experiences
  add column if not exists source_article_id uuid
    references public.market_signal_items (id) on delete set null;

create unique index if not exists founder_experiences_one_entry_per_article
  on public.founder_experiences (client_id, source_article_id)
  where source_article_id is not null and deleted_at is null;
