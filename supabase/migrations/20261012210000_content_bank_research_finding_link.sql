-- Research findings can be saved to the Content Bank as a trend reaction.
--
-- Additive only: one nullable column and one partial unique index on
-- founder_experiences. No data is changed or removed, no policy is touched, and
-- no function is added: inserts keep using the existing
-- founder_experiences_insert_permitted_contributor policy (a trend_reaction row
-- needs research_contribute or an admin role).
--
-- source_research_finding_id ties one Content Bank entry to the research finding
-- it was saved from. The unique index makes "Save to Content Bank" idempotent:
-- saving the same finding twice cannot create a second live entry.

alter table public.founder_experiences
  add column if not exists source_research_finding_id uuid
    references public.research_findings (id) on delete set null;

create unique index if not exists founder_experiences_one_entry_per_finding
  on public.founder_experiences (client_id, source_research_finding_id)
  where source_research_finding_id is not null and deleted_at is null;
