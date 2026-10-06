-- Migration: Content Bank and Explicit Source Usage Tracking
-- Product: Virel
-- Phase: P02

-- 1. Extend founder_experiences with Content Bank metadata
alter table public.founder_experiences
  add column if not exists category text default 'observation',
  add column if not exists readiness text default 'ready',
  add column if not exists allow_reuse boolean not null default false,
  add column if not exists raw_notes text,
  add column if not exists takeaway text;

-- Add check constraint for founder_experiences readiness
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'founder_experiences_readiness_check'
  ) then
    alter table public.founder_experiences
      add constraint founder_experiences_readiness_check
      check (readiness in ('draft', 'ready', 'archived'));
  end if;
end $$;

-- 2. Extend content_resources with Content Bank metadata
alter table public.content_resources
  add column if not exists category text default 'lead_magnet',
  add column if not exists readiness text default 'ready',
  add column if not exists allow_reuse boolean not null default false,
  add column if not exists raw_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'content_resources_readiness_check'
  ) then
    alter table public.content_resources
      add constraint content_resources_readiness_check
      check (readiness in ('draft', 'ready', 'archived'));
  end if;
end $$;

-- 3. Create shared source_usage table for tracking reservations and explicit reuse
create table if not exists public.source_usage (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source_id uuid not null,
  source_type text not null check (source_type in ('founder_experience', 'content_resource')),
  channel text not null default 'linkedin_post' check (channel in ('linkedin_post', 'newsletter', 'calendar_slot')),
  status text not null default 'reserved' check (status in ('reserved', 'used', 'published', 'cancelled')),
  content_idea_id uuid references public.content_ideas(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  angle text,
  takeaway text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists source_usage_client_source_idx on public.source_usage(client_id, source_id);
create index if not exists source_usage_post_idx on public.source_usage(post_id);
create index if not exists source_usage_status_idx on public.source_usage(status);

-- Enable RLS on source_usage
alter table public.source_usage enable row level security;

-- Read policy: accepted workspace members
create policy "Accepted workspace users can read source usage"
  on public.source_usage for select
  using (
    exists (
      select 1 from public.client_access ca
      where ca.client_id = source_usage.client_id
      and ca.user_id = auth.uid()
      and ca.invitation_status = 'accepted'
    )
    or exists (
      select 1 from public.agency_members am
      join public.clients c on c.agency_id = am.agency_id
      where c.id = source_usage.client_id
      and am.user_id = auth.uid()
      and am.role = 'agency_admin'
    )
  );

-- Write policies: admin or users with ideas/posts permissions
create policy "Authorized users can insert source usage"
  on public.source_usage for insert
  with check (
    public.has_client_access(source_usage.client_id, array['agency_admin', 'client_admin'])
    or exists (
      select 1 from public.client_access ca
      where ca.client_id = source_usage.client_id
      and ca.user_id = auth.uid()
      and ca.invitation_status = 'accepted'
      and (
        ca.permissions ? 'ideas_manage'
        or ca.permissions ? 'posts_draft'
        or ca.permissions ? 'posts_publish'
      )
    )
  );

create policy "Authorized users can update source usage"
  on public.source_usage for update
  using (
    public.has_client_access(source_usage.client_id, array['agency_admin', 'client_admin'])
    or exists (
      select 1 from public.client_access ca
      where ca.client_id = source_usage.client_id
      and ca.user_id = auth.uid()
      and ca.invitation_status = 'accepted'
      and (
        ca.permissions ? 'ideas_manage'
        or ca.permissions ? 'posts_draft'
        or ca.permissions ? 'posts_publish'
      )
    )
  );

-- Backfill usage from existing ideas and posts
-- For founder experiences:
insert into public.source_usage (client_id, source_id, source_type, channel, status, content_idea_id, post_id, angle)
select
  ci.client_id,
  fe.id as source_id,
  'founder_experience' as source_type,
  'linkedin_post' as channel,
  case when p.status = 'published' then 'published' else 'used' end as status,
  ci.id as content_idea_id,
  p.id as post_id,
  ci.angle
from public.content_ideas ci
join public.founder_experiences fe on fe.id::text = (
  case
    when jsonb_typeof(ci.source_ids_json) = 'array' and jsonb_array_length(ci.source_ids_json) > 0
    then ci.source_ids_json->>0
    else null
  end
)
left join public.posts p on p.content_idea_id = ci.id and p.deleted_at is null
where ci.deleted_at is null
and not exists (
  select 1 from public.source_usage su
  where su.source_id = fe.id and su.content_idea_id = ci.id
);

-- For content resources:
insert into public.source_usage (client_id, source_id, source_type, channel, status, content_idea_id, post_id, angle)
select
  p.client_id,
  cr.id as source_id,
  'content_resource' as source_type,
  'linkedin_post' as channel,
  case when p.status = 'published' then 'published' else 'used' end as status,
  p.content_idea_id,
  p.id as post_id,
  p.title as angle
from public.posts p
join public.content_resources cr on cr.id = p.selected_resource_id
where p.deleted_at is null
and not exists (
  select 1 from public.source_usage su
  where su.source_id = cr.id and su.post_id = p.id
);
