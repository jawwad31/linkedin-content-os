-- Phase 1 - Agency access model
--
-- Adds Agency as the parent account for Client Workspaces while preserving
-- the existing clients table. Agency admins get implicit access to every
-- Client Workspace in their Agency; they are intentionally not duplicated
-- into client_access rows.
--
-- Legacy viewer read-only semantics were retired before onboarding real
-- clients. Existing viewer rows are test/dev-era access and are mapped to
-- client_user.

-- ---------------------------------------------------------------------------
-- agencies
-- ---------------------------------------------------------------------------

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

drop trigger if exists set_updated_at on public.agencies;

create trigger set_updated_at
  before update on public.agencies
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- agency_members
-- ---------------------------------------------------------------------------

create table if not exists public.agency_members (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('agency_admin')),
  invitation_status text not null default 'accepted'
    check (invitation_status in ('pending', 'accepted', 'revoked')),
  invited_email text,
  invited_by_user_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agency_members_agency_id_idx
  on public.agency_members (agency_id);
create index if not exists agency_members_user_id_idx
  on public.agency_members (user_id);
create unique index if not exists agency_members_accepted_agency_user_key
  on public.agency_members (agency_id, user_id)
  where invitation_status = 'accepted';

drop trigger if exists set_updated_at on public.agency_members;

create trigger set_updated_at
  before update on public.agency_members
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- clients.agency_id + safe backfill
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists agency_id uuid references public.agencies (id);

create index if not exists clients_agency_id_idx
  on public.clients (agency_id);

with default_agency as (
  insert into public.agencies (name)
  select 'Default Agency'
  where exists (select 1 from public.clients where agency_id is null)
    and not exists (select 1 from public.agencies where name = 'Default Agency')
  returning id
),
agency_choice as (
  select id from default_agency
  union all
  select id from public.agencies where name = 'Default Agency'
  order by id
  limit 1
)
update public.clients c
set agency_id = (select id from agency_choice)
where c.agency_id is null
  and exists (select 1 from agency_choice);

-- Private-MVP backfill: legacy owners become agency admins so the previous
-- top-level owner behavior, including operational log visibility, is not
-- stranded. There are no real external clients or production client users at
-- this stage, so the broader default-agency membership is acceptable.
insert into public.agency_members (agency_id, user_id, role, invitation_status)
select distinct c.agency_id, ca.user_id, 'agency_admin', 'accepted'
from public.clients c
join public.client_access ca on ca.client_id = c.id
where c.agency_id is not null
  and ca.user_id is not null
  and ca.role = 'owner'
  and ca.invitation_status = 'accepted'
on conflict do nothing;

insert into public.agency_members (agency_id, user_id, role, invitation_status)
select distinct c.agency_id, c.owner_user_id, 'agency_admin', 'accepted'
from public.clients c
where c.agency_id is not null
  and c.owner_user_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- client_access role migration
-- ---------------------------------------------------------------------------

alter table public.client_access
  drop constraint if exists client_access_role_check;

update public.client_access
set role = case role
  when 'owner' then 'client_admin'
  when 'editor' then 'client_user'
  when 'viewer' then 'client_user'
  else role
end
where role in ('owner', 'editor', 'viewer');

alter table public.client_access
  add constraint client_access_role_check
  check (role in ('client_admin', 'client_user'));

alter table public.clients
  alter column agency_id set not null;

-- ---------------------------------------------------------------------------
-- Agency-aware RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.has_agency_access(
  p_agency_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.agency_members am
    where am.agency_id = p_agency_id
      and am.user_id = auth.uid()
      and am.invitation_status = 'accepted'
      and (p_roles is null or am.role = any (p_roles))
  );
$$;

grant execute on function public.has_agency_access(uuid, text[]) to authenticated, anon;

create or replace function public.has_agency_access_for_client(
  p_client_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.clients c
    join public.agency_members am on am.agency_id = c.agency_id
    where c.id = p_client_id
      and c.deleted_at is null
      and am.user_id = auth.uid()
      and am.invitation_status = 'accepted'
      and (p_roles is null or am.role = any (p_roles))
  );
$$;

grant execute on function public.has_agency_access_for_client(uuid, text[]) to authenticated, anon;

create or replace function public.has_client_access(
  p_client_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    public.has_agency_access_for_client(
      p_client_id,
      case
        when p_roles is null or 'agency_admin' = any (p_roles)
          then array['agency_admin']
        else array[]::text[]
      end
    )
    or exists (
      select 1
      from public.client_access ca
      where ca.client_id = p_client_id
        and ca.user_id = auth.uid()
        and ca.invitation_status = 'accepted'
        and (p_roles is null or ca.role = any (p_roles))
    );
$$;

grant execute on function public.has_client_access(uuid, text[]) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- RLS for agencies and agency_members
-- ---------------------------------------------------------------------------

alter table public.agencies enable row level security;
alter table public.agency_members enable row level security;

create policy agencies_select_agency_admin
  on public.agencies
  for select
  to authenticated
  using (public.has_agency_access(id, array['agency_admin']));

create policy agencies_update_agency_admin
  on public.agencies
  for update
  to authenticated
  using (public.has_agency_access(id, array['agency_admin']))
  with check (public.has_agency_access(id, array['agency_admin']));

create policy agency_members_select_self_or_agency_admin
  on public.agency_members
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_agency_access(agency_id, array['agency_admin'])
  );

create policy agency_members_insert_agency_admin
  on public.agency_members
  for insert
  to authenticated
  with check (public.has_agency_access(agency_id, array['agency_admin']));

create policy agency_members_update_agency_admin
  on public.agency_members
  for update
  to authenticated
  using (public.has_agency_access(agency_id, array['agency_admin']))
  with check (public.has_agency_access(agency_id, array['agency_admin']));

-- ---------------------------------------------------------------------------
-- Updated client/workspace RLS policies
-- ---------------------------------------------------------------------------

drop policy if exists clients_select_accepted_access on public.clients;
drop policy if exists clients_update_owner_editor on public.clients;

create policy clients_select_workspace_access
  on public.clients
  for select
  to authenticated
  using (public.has_client_access(id));

create policy clients_update_workspace_admin
  on public.clients
  for update
  to authenticated
  using (public.has_client_access(id, array['agency_admin', 'client_admin']))
  with check (public.has_client_access(id, array['agency_admin', 'client_admin']));

drop policy if exists client_access_select_own_or_owner on public.client_access;
drop policy if exists client_access_insert_owner_only on public.client_access;
drop policy if exists client_access_update_owner_manages on public.client_access;

create policy client_access_select_own_or_workspace_admin
  on public.client_access
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_client_access(client_id, array['agency_admin', 'client_admin'])
  );

create policy client_access_insert_workspace_admin
  on public.client_access
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

create policy client_access_update_workspace_admin
  on public.client_access
  for update
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin']))
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

-- Self-accept policies from earlier migrations stay in place. They now carry
-- client_admin/client_user values only because the role constraint has changed.

drop policy if exists rss_sources_insert_owner_editor on public.rss_sources;
drop policy if exists rss_sources_update_owner_editor on public.rss_sources;

create policy rss_sources_insert_workspace_admin
  on public.rss_sources
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

create policy rss_sources_update_workspace_admin
  on public.rss_sources
  for update
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin']))
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

drop policy if exists market_signal_items_insert_owner_editor on public.market_signal_items;
drop policy if exists market_signal_items_update_owner_editor on public.market_signal_items;

create policy market_signal_items_insert_workflow_contributor
  on public.market_signal_items
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']));

create policy market_signal_items_update_workflow_contributor
  on public.market_signal_items
  for update
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']))
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']));

drop policy if exists founder_experiences_insert_owner_editor on public.founder_experiences;
drop policy if exists founder_experiences_update_owner_editor on public.founder_experiences;

create policy founder_experiences_insert_workflow_contributor
  on public.founder_experiences
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']));

create policy founder_experiences_update_workflow_contributor
  on public.founder_experiences
  for update
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']))
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']));

drop policy if exists content_ideas_insert_owner_editor on public.content_ideas;
drop policy if exists content_ideas_update_owner_editor on public.content_ideas;

create policy content_ideas_insert_workflow_contributor
  on public.content_ideas
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']));

create policy content_ideas_update_workflow_contributor
  on public.content_ideas
  for update
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']))
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']));

drop policy if exists posts_insert_owner_editor on public.posts;
drop policy if exists posts_update_owner_editor on public.posts;

create policy posts_insert_workflow_contributor
  on public.posts
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']));

create policy posts_update_workspace_admin
  on public.posts
  for update
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin']))
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

drop policy if exists audit_logs_select_owner_access on public.audit_logs;
drop policy if exists llm_logs_select_owner_access on public.llm_logs;

create policy audit_logs_select_agency_admin
  on public.audit_logs
  for select
  to authenticated
  using (
    client_id is not null
    and public.has_agency_access_for_client(client_id, array['agency_admin'])
  );

create policy llm_logs_select_agency_admin
  on public.llm_logs
  for select
  to authenticated
  using (
    client_id is not null
    and public.has_agency_access_for_client(client_id, array['agency_admin'])
  );
