-- SMTP-free administrator provisioning, granular Account User permissions,
-- and first-login password-change state.

alter table public.client_access
  add column if not exists permissions text[] not null default '{}'::text[];

update public.client_access
set permissions = case
  when role = 'client_user' then array[
    'research_contribute',
    'founder_experience_manage',
    'ideas_manage',
    'posts_draft'
  ]::text[]
  else '{}'::text[]
end;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_access_permissions_check'
      and conrelid = 'public.client_access'::regclass
  ) then
    alter table public.client_access
      add constraint client_access_permissions_check
      check (
        (
          role = 'client_admin'
          and cardinality(permissions) = 0
        )
        or (
          role = 'client_user'
          and cardinality(permissions) between 1 and 6
          and permissions <@ array[
            'research_contribute',
            'founder_experience_manage',
            'ideas_manage',
            'posts_draft',
            'posts_review',
            'posts_publish'
          ]::text[]
        )
      );
  end if;
end $$;

comment on column public.client_access.permissions is
  'Allowlisted Account User capabilities. Account and Agency Admins receive implicit full access.';

alter table public.profiles
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_changed_at timestamptz;

comment on column public.profiles.must_change_password is
  'Server-managed first-login gate after administrator creation or password reset.';

create schema if not exists private;

create or replace function private.protect_profile_security_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
    and (
      new.must_change_password is distinct from old.must_change_password
      or new.password_changed_at is distinct from old.password_changed_at
    )
  then
    raise exception 'Profile security fields are server-managed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_security_fields on public.profiles;

create trigger protect_profile_security_fields
  before update on public.profiles
  for each row
  execute function private.protect_profile_security_fields();

create or replace function private.has_client_permission(
  p_client_id uuid,
  p_permission text
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.client_access ca
    where ca.client_id = p_client_id
      and ca.user_id = (select auth.uid())
      and ca.role = 'client_user'
      and ca.invitation_status = 'accepted'
      and p_permission = any (ca.permissions)
  );
$$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on function private.has_client_permission(uuid, text)
  from public, anon;
grant execute on function private.has_client_permission(uuid, text)
  to authenticated;

-- The email-claim invitation flow is retired. Existing pending records are
-- revoked rather than silently converted into users.
update public.client_access
set invitation_status = 'revoked',
    revoked_at = coalesce(revoked_at, now())
where invitation_status = 'pending';

update public.agency_members
set invitation_status = 'revoked'
where invitation_status = 'pending';

alter table public.client_access
  alter column invitation_status set default 'accepted';

drop index if exists public.client_access_pending_invite_key;

drop policy if exists client_access_select_pending_by_email
  on public.client_access;
drop policy if exists client_access_update_claim_pending_by_email
  on public.client_access;
drop policy if exists client_access_update_self_accept_pending
  on public.client_access;

-- Research contribution.
drop policy if exists market_signal_items_insert_workflow_contributor
  on public.market_signal_items;
drop policy if exists market_signal_items_update_workflow_contributor
  on public.market_signal_items;

create policy market_signal_items_insert_permitted_contributor
  on public.market_signal_items
  for insert
  to authenticated
  with check (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or (select private.has_client_permission(client_id, 'research_contribute'))
  );

create policy market_signal_items_update_permitted_contributor
  on public.market_signal_items
  for update
  to authenticated
  using (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or (select private.has_client_permission(client_id, 'research_contribute'))
  )
  with check (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or (select private.has_client_permission(client_id, 'research_contribute'))
  );

-- Founder Experience editing and Trend Reaction creation.
drop policy if exists founder_experiences_insert_workflow_contributor
  on public.founder_experiences;
drop policy if exists founder_experiences_update_workflow_contributor
  on public.founder_experiences;

create policy founder_experiences_insert_permitted_contributor
  on public.founder_experiences
  for insert
  to authenticated
  with check (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or (
      entry_type = 'work_log'
      and (select private.has_client_permission(client_id, 'founder_experience_manage'))
    )
    or (
      entry_type = 'trend_reaction'
      and (select private.has_client_permission(client_id, 'research_contribute'))
    )
  );

create policy founder_experiences_update_permitted_contributor
  on public.founder_experiences
  for update
  to authenticated
  using (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or (select private.has_client_permission(client_id, 'founder_experience_manage'))
  )
  with check (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or (select private.has_client_permission(client_id, 'founder_experience_manage'))
  );

-- Content Idea management.
drop policy if exists content_ideas_insert_workflow_contributor
  on public.content_ideas;
drop policy if exists content_ideas_update_workflow_contributor
  on public.content_ideas;

create policy content_ideas_insert_permitted_contributor
  on public.content_ideas
  for insert
  to authenticated
  with check (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or (select private.has_client_permission(client_id, 'ideas_manage'))
  );

create policy content_ideas_update_permitted_contributor
  on public.content_ideas
  for update
  to authenticated
  using (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or (select private.has_client_permission(client_id, 'ideas_manage'))
  )
  with check (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or (select private.has_client_permission(client_id, 'ideas_manage'))
  );

-- Post drafting, human review, and publishing are independently grantable.
drop policy if exists posts_insert_workflow_contributor on public.posts;
drop policy if exists posts_update_workspace_admin on public.posts;

create policy posts_insert_permitted_drafter
  on public.posts
  for insert
  to authenticated
  with check (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or (select private.has_client_permission(client_id, 'posts_draft'))
  );

create policy posts_update_workspace_admin
  on public.posts
  for update
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin']))
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

create policy posts_update_permitted_drafter
  on public.posts
  for update
  to authenticated
  using (
    status in ('review', 'needs_edit')
    and (select private.has_client_permission(client_id, 'posts_draft'))
  )
  with check (
    status in ('review', 'needs_edit')
    and (select private.has_client_permission(client_id, 'posts_draft'))
  );

create policy posts_update_permitted_reviewer
  on public.posts
  for update
  to authenticated
  using (
    status in ('review', 'needs_edit')
    and (select private.has_client_permission(client_id, 'posts_review'))
  )
  with check (
    status in ('review', 'needs_edit', 'approved', 'rejected')
    and (select private.has_client_permission(client_id, 'posts_review'))
  );

create policy posts_update_permitted_publisher
  on public.posts
  for update
  to authenticated
  using (
    status = 'approved'
    and (select private.has_client_permission(client_id, 'posts_publish'))
  )
  with check (
    status in ('approved', 'published')
    and (select private.has_client_permission(client_id, 'posts_publish'))
  );
