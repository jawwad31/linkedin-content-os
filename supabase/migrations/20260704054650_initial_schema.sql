-- Feature 03 — Database Schema
--
-- Creates the initial AIXelerate Content OS schema: tables, constraints,
-- indexes, and updated_at triggers only.
--
-- IMPORTANT: Row-Level Security is intentionally NOT enabled or configured
-- in this migration. That is Feature 04. Do not insert real client/business
-- data until RLS policies are in place.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared trigger function: keeps updated_at current on every row update.
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  name text,
  role text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles (email);

create trigger set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users (id),
  name text not null,
  founder_name text,
  industry text,
  business_description text,
  primary_icp text,
  main_offer text,
  core_pov text,
  content_pillars jsonb not null default '[]'::jsonb,
  research_keywords jsonb not null default '[]'::jsonb,
  banned_topics jsonb not null default '[]'::jsonb,
  founder_voice_sample text,
  phrases_to_use jsonb not null default '[]'::jsonb,
  phrases_to_avoid jsonb not null default '[]'::jsonb,
  approved_proof jsonb not null default '[]'::jsonb,
  reference_material jsonb not null default '[]'::jsonb,
  publishing_preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index clients_owner_user_id_idx on public.clients (owner_user_id);

create trigger set_updated_at
  before update on public.clients
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- client_access
-- ---------------------------------------------------------------------------

create table public.client_access (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  invited_email text,
  invitation_status text not null default 'pending'
    check (invitation_status in ('pending', 'accepted', 'revoked')),
  invited_by_user_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index client_access_client_id_idx on public.client_access (client_id);
create index client_access_user_id_idx on public.client_access (user_id);
create index client_access_client_id_user_id_idx
  on public.client_access (client_id, user_id);

-- One accepted access row per client/user.
create unique index client_access_accepted_client_user_key
  on public.client_access (client_id, user_id)
  where user_id is not null and invitation_status = 'accepted';

-- One pending invitation per client/invited_email.
create unique index client_access_pending_invite_key
  on public.client_access (client_id, invited_email)
  where invitation_status = 'pending' and invited_email is not null;

create trigger set_updated_at
  before update on public.client_access
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- rss_sources
-- ---------------------------------------------------------------------------

create table public.rss_sources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  source_name text not null,
  feed_url text not null,
  category text,
  active boolean not null default true,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index rss_sources_client_id_idx on public.rss_sources (client_id);

create trigger set_updated_at
  before update on public.rss_sources
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- market_signal_items
-- ---------------------------------------------------------------------------

create table public.market_signal_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  rss_source_id uuid references public.rss_sources (id) on delete set null,
  title text not null,
  url text not null,
  summary text,
  published_at timestamptz,
  collected_at timestamptz not null default now(),
  content_hash text not null,
  source_name text,
  status text not null default 'new'
    check (status in ('new', 'relevant', 'irrelevant', 'used')),
  relevance_score integer,
  classification_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint market_signal_items_client_content_hash_key
    unique (client_id, content_hash)
);

create index market_signal_items_client_id_status_idx
  on public.market_signal_items (client_id, status);

create trigger set_updated_at
  before update on public.market_signal_items
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- market_signals
-- ---------------------------------------------------------------------------

create table public.market_signals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  signal_summary text,
  why_buyers_care text,
  content_angles jsonb not null default '[]'::jsonb,
  proof_notes text,
  source_item_ids_json jsonb not null default '[]'::jsonb,
  confidence_score integer,
  founder_take text,
  approved_for_ideas boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint market_signals_confidence_score_check
    check (confidence_score is null or confidence_score between 1 and 10)
);

create index market_signals_client_id_approved_idx
  on public.market_signals (client_id, approved_for_ideas);

create trigger set_updated_at
  before update on public.market_signals
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- founder_experiences
-- ---------------------------------------------------------------------------

create table public.founder_experiences (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null,
  what_happened text,
  what_was_learned text,
  what_changed text,
  why_it_matters text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index founder_experiences_client_id_idx
  on public.founder_experiences (client_id);

create trigger set_updated_at
  before update on public.founder_experiences
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- content_ideas
--
-- source_type is intentionally limited to the three Planning Agent modes.
-- Do not add business_context_only, research_reactions, or trend_only.
-- ---------------------------------------------------------------------------

create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  source_type text not null
    check (source_type in ('founder_experience', 'market_signal', 'signal_reaction')),
  source_ids_json jsonb not null default '[]'::jsonb,
  angle text not null,
  buyer_pain text,
  commercial_relevance text,
  content_pillar text,
  belief_shift text,
  angle_boundary text,
  source_context jsonb not null default '{}'::jsonb,
  proof_notes text,
  founder_direction text,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'used', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index content_ideas_client_id_source_type_status_idx
  on public.content_ideas (client_id, source_type, status);

create trigger set_updated_at
  before update on public.content_ideas
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  content_idea_id uuid references public.content_ideas (id) on delete set null,
  final_post text not null,
  buyer_belief_shift text,
  proof_notes text,
  risk_notes text,
  cta_intent text,
  source_context_used jsonb not null default '{}'::jsonb,
  status text not null default 'review'
    check (status in ('review', 'needs_edit', 'approved', 'published', 'rejected')),
  edit_note text,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index posts_client_id_status_idx on public.posts (client_id, status);

create trigger set_updated_at
  before update on public.posts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- research_runs
-- ---------------------------------------------------------------------------

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  triggered_by_user_id uuid references auth.users (id),
  trigger_type text not null check (trigger_type in ('manual', 'worker')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'success', 'failed', 'cancelled')),
  stage text,
  error_message text,
  lock_key text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index research_runs_client_id_status_idx
  on public.research_runs (client_id, status);

create trigger set_updated_at
  before update on public.research_runs
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- llm_logs
--
-- Safe metadata only. Never store raw prompts or business context here.
-- ---------------------------------------------------------------------------

create table public.llm_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  user_id uuid references auth.users (id),
  provider text,
  model text,
  feature text,
  status text,
  token_input_count integer,
  token_output_count integer,
  estimated_cost numeric,
  error_type text,
  created_at timestamptz not null default now()
);

create index llm_logs_client_id_feature_status_idx
  on public.llm_logs (client_id, feature, status);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  user_id uuid references auth.users (id),
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_client_id_created_at_idx
  on public.audit_logs (client_id, created_at);
