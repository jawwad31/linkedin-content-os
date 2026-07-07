-- Reshape market_signals into trend_cards.
--
-- Product decision: adopt the TrendCard model from the original
-- aixelerate-content-layer research workflow. The table is renamed (data
-- preserved) and its columns reshaped to the TrendCard field layout:
--
--   signal_summary  -> shift            (narrative: what is changing)
--   why_buyers_care -> why_it_matters
--   proof_notes     -> evidence
--   content_angles  -> content_angle    (jsonb array flattened to text)
--   + relevance_to_icp, founder_pov     (new, filled by future synthesis runs)
--   + week_of                           (weekly grouping, backfilled)
--
-- founder_experiences additionally learns to represent a "trend reaction":
-- a founder's structured response to one TrendCard (agreement /
-- contradiction / gap / observation), linked via source_trend_card_id.
--
-- RLS posture is unchanged: select-only for authenticated users with
-- accepted access; all writes stay server-side via the service role
-- (Feature 18 security correction carries over to the renamed table).

alter table public.market_signals rename to trend_cards;

alter table public.trend_cards rename column signal_summary to shift;
alter table public.trend_cards rename column why_buyers_care to why_it_matters;
alter table public.trend_cards rename column proof_notes to evidence;

alter table public.trend_cards add column relevance_to_icp text;
alter table public.trend_cards add column founder_pov text;
alter table public.trend_cards add column content_angle text;
alter table public.trend_cards add column week_of date;

-- Flatten the existing content_angles jsonb array into one text block, one
-- angle per line, matching the TrendCard single-angle presentation.
update public.trend_cards
set content_angle = nullif(
  (
    select string_agg(value, e'\n')
    from jsonb_array_elements_text(content_angles)
  ),
  ''
)
where jsonb_typeof(content_angles) = 'array';

alter table public.trend_cards drop column content_angles;

-- Backfill week_of from creation time (Monday of that ISO week), then lock
-- it down — every TrendCard belongs to exactly one week.
update public.trend_cards
set week_of = (date_trunc('week', created_at at time zone 'utc'))::date
where week_of is null;

alter table public.trend_cards alter column week_of set not null;

-- Rename the objects that kept their market_signals_* names through the
-- table rename, so nothing misleading lingers in the catalog.
alter table public.trend_cards
  rename constraint market_signals_pkey to trend_cards_pkey;
alter table public.trend_cards
  rename constraint market_signals_confidence_score_check
  to trend_cards_confidence_score_check;
alter table public.trend_cards
  rename constraint market_signals_client_id_fkey to trend_cards_client_id_fkey;

alter index public.market_signals_client_id_approved_idx
  rename to trend_cards_client_id_approved_idx;

alter policy market_signals_select_accepted_access
  on public.trend_cards
  rename to trend_cards_select_accepted_access;

create index trend_cards_client_id_week_of_idx
  on public.trend_cards (client_id, week_of desc);

-- ---------------------------------------------------------------------------
-- founder_experiences: trend reactions
-- ---------------------------------------------------------------------------

alter table public.founder_experiences
  add column entry_type text not null default 'work_log'
    check (entry_type in ('work_log', 'trend_reaction'));

alter table public.founder_experiences
  add column reaction_type text
    check (
      reaction_type is null
      or reaction_type in ('agreement', 'contradiction', 'gap', 'observation')
    );

alter table public.founder_experiences
  add column source_trend_card_id uuid
    references public.trend_cards (id) on delete set null;

create index founder_experiences_client_trend_card_idx
  on public.founder_experiences (client_id, source_trend_card_id)
  where source_trend_card_id is not null;
