-- Feature 17 — Research Agent Classification
--
-- market_signal_items already has everything this feature needs: status
-- (new | relevant | irrelevant | used), relevance_score, and
-- classification_reason (Feature 03). No changes to that table.
--
-- research_runs only tracks collection counters today (Feature 15). This
-- adds minimal, non-destructive classification summary columns so a run
-- that also classifies can report those counts the same way — integers,
-- default 0, no destructive changes to existing rows/values.

alter table public.research_runs
  add column classified_count integer not null default 0,
  add column relevant_count integer not null default 0,
  add column irrelevant_count integer not null default 0,
  add column classification_error_count integer not null default 0;
