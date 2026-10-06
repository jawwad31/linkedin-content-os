-- Migration: Shared Standalone Writer and Editorial Controls
-- Product: Virel
-- Phase: P04

-- 1. Extend posts with allocation bucket, post type, funnel stage, reader, and approval invalidation
alter table public.posts
  add column if not exists allocation_bucket text default 'experience',
  add column if not exists post_type text default 'framework',
  add column if not exists funnel_stage text default 'Depth',
  add column if not exists intended_reader text,
  add column if not exists primary_takeaway text,
  add column if not exists content_pillar text,
  add column if not exists brief_overrides jsonb default '{}'::jsonb,
  add column if not exists draft_version integer not null default 1,
  add column if not exists approved_draft_version integer;

-- Check constraints for allocation_bucket, post_type, funnel_stage
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_allocation_bucket_check') then
    alter table public.posts
      add constraint posts_allocation_bucket_check
      check (allocation_bucket in ('experience', 'asset', 'evergreen', 'news'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_post_type_check') then
    alter table public.posts
      add constraint posts_post_type_check
      check (post_type in ('framework', 'case_study', 'contrarian_take', 'how_to', 'teardown', 'listicle', 'story', 'lead_magnet_offer'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_funnel_stage_check') then
    alter table public.posts
      add constraint posts_funnel_stage_check
      check (funnel_stage in ('Discovery', 'Depth', 'Authority', 'Commercial'));
  end if;
end $$;

-- 2. Extend content_ideas with allocation bucket, post type, funnel stage
alter table public.content_ideas
  add column if not exists allocation_bucket text default 'experience',
  add column if not exists post_type text default 'framework',
  add column if not exists funnel_stage text default 'Depth',
  add column if not exists intended_reader text,
  add column if not exists primary_takeaway text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_ideas_allocation_bucket_check') then
    alter table public.content_ideas
      add constraint content_ideas_allocation_bucket_check
      check (allocation_bucket in ('experience', 'asset', 'evergreen', 'news'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'content_ideas_funnel_stage_check') then
    alter table public.content_ideas
      add constraint content_ideas_funnel_stage_check
      check (funnel_stage in ('Discovery', 'Depth', 'Authority', 'Commercial'));
  end if;
end $$;
