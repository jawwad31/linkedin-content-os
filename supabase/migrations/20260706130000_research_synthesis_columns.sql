-- Feature 18 — Market Signal Synthesis
--
-- market_signals already has everything this feature needs: title,
-- signal_summary, why_buyers_care, content_angles, proof_notes,
-- source_item_ids_json, confidence_score, founder_take, approved_for_ideas
-- (Feature 03). No changes to that table.
--
-- research_runs only tracks collection + classification summary columns
-- today (Features 15/17). This adds minimal, non-destructive synthesis
-- summary columns so a run that also synthesizes Market Signals can report
-- those counts the same way — integers, default 0, no destructive changes
-- to existing rows/values.

alter table public.research_runs
  add column signals_created integer not null default 0,
  add column synthesis_error_count integer not null default 0;
