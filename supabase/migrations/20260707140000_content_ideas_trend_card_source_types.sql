-- Align Content Idea source_type values with the TrendCard rename.
-- Data is preserved: old Market Signal names are migrated before the check
-- constraint is tightened to the three supported Planning Agent modes.

update public.content_ideas
set source_type = 'trend_card'
where source_type = 'market_signal';

update public.content_ideas
set source_type = 'trend_reaction'
where source_type = 'signal_reaction';

alter table public.content_ideas
  drop constraint if exists content_ideas_source_type_check;

alter table public.content_ideas
  add constraint content_ideas_source_type_check
  check (source_type in ('founder_experience', 'trend_card', 'trend_reaction'));
