-- Feature 04 — RLS Policies
--
-- Enables Row-Level Security on every table from the Feature 03 schema and
-- adds policies for authenticated users only. The anon role has no policies
-- on any of these tables, so unauthenticated access is denied by default.
--
-- Access model (per security-access.md):
--   authenticated user
--   -> matching client_access row
--   -> invitation_status = 'accepted'
--   -> role allows the action
--   -> record belongs to the same client_id
--
-- Hard delete is intentionally not exposed: business tables are soft-deleted
-- via UPDATE (deleted_at). No DELETE policies are added for those tables, so
-- row deletion remains blocked for the authenticated role.
--
-- Client and initial-owner provisioning (INSERT on clients / the first
-- client_access row for a client) is not covered by these policies. There is
-- no self-serve "create client" flow in v1 (no public signup); that
-- provisioning happens through the service-role key outside RLS. Only
-- inviting additional collaborators to an already-provisioned client is
-- covered here.

-- ---------------------------------------------------------------------------
-- Helper: has_client_access
--
-- Checks whether the current authenticated user has an accepted
-- client_access row for the given client, optionally restricted to a set of
-- roles. security definer so it can read client_access consistently even
-- though client_access itself has RLS enabled.
-- ---------------------------------------------------------------------------

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
  select exists (
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
-- profiles
--
-- Users can read and update their own profile only. Role cannot be
-- self-elevated: the WITH CHECK requires the new role to match the role
-- already stored for that row.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy profiles_update_own_no_self_elevate
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role is not distinct from (
      select p.role from public.profiles p where p.id = profiles.id
    )
  );

-- No insert/delete policies. Profile provisioning on signup is handled by a
-- trusted server-side mechanism in a later feature, not by the authenticated
-- role directly.

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------

alter table public.clients enable row level security;

create policy clients_select_accepted_access
  on public.clients
  for select
  to authenticated
  using (public.has_client_access(id));

create policy clients_update_owner_editor
  on public.clients
  for update
  to authenticated
  using (public.has_client_access(id, array['owner', 'editor']))
  with check (public.has_client_access(id, array['owner', 'editor']));

-- No insert/delete policies. See header note on client provisioning.

-- ---------------------------------------------------------------------------
-- client_access
--
-- Owners manage access for their client (invite, change role, revoke).
-- Any user can see their own access rows. A user may self-accept their own
-- pending invitation only (pending -> accepted), never change their own
-- role, and cannot touch an already-accepted or revoked row of their own —
-- reinstating revoked access requires an owner.
-- ---------------------------------------------------------------------------

alter table public.client_access enable row level security;

create policy client_access_select_own_or_owner
  on public.client_access
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_client_access(client_id, array['owner'])
  );

create policy client_access_insert_owner_only
  on public.client_access
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['owner']));

create policy client_access_update_owner_manages
  on public.client_access
  for update
  to authenticated
  using (public.has_client_access(client_id, array['owner']))
  with check (public.has_client_access(client_id, array['owner']));

create policy client_access_update_self_accept_pending
  on public.client_access
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and invitation_status = 'pending'
  )
  with check (
    user_id = auth.uid()
    and invitation_status = 'accepted'
    and role is not distinct from (
      select ca.role from public.client_access ca where ca.id = client_access.id
    )
  );

-- No delete policy. Revocation is an update (invitation_status = 'revoked'),
-- not a row delete.

-- ---------------------------------------------------------------------------
-- rss_sources
-- ---------------------------------------------------------------------------

alter table public.rss_sources enable row level security;

create policy rss_sources_select_accepted_access
  on public.rss_sources
  for select
  to authenticated
  using (public.has_client_access(client_id));

create policy rss_sources_insert_owner_editor
  on public.rss_sources
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['owner', 'editor']));

create policy rss_sources_update_owner_editor
  on public.rss_sources
  for update
  to authenticated
  using (public.has_client_access(client_id, array['owner', 'editor']))
  with check (public.has_client_access(client_id, array['owner', 'editor']));

-- ---------------------------------------------------------------------------
-- market_signal_items
-- ---------------------------------------------------------------------------

alter table public.market_signal_items enable row level security;

create policy market_signal_items_select_accepted_access
  on public.market_signal_items
  for select
  to authenticated
  using (public.has_client_access(client_id));

create policy market_signal_items_insert_owner_editor
  on public.market_signal_items
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['owner', 'editor']));

create policy market_signal_items_update_owner_editor
  on public.market_signal_items
  for update
  to authenticated
  using (public.has_client_access(client_id, array['owner', 'editor']))
  with check (public.has_client_access(client_id, array['owner', 'editor']));

-- ---------------------------------------------------------------------------
-- market_signals
-- ---------------------------------------------------------------------------

alter table public.market_signals enable row level security;

create policy market_signals_select_accepted_access
  on public.market_signals
  for select
  to authenticated
  using (public.has_client_access(client_id));

create policy market_signals_insert_owner_editor
  on public.market_signals
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['owner', 'editor']));

create policy market_signals_update_owner_editor
  on public.market_signals
  for update
  to authenticated
  using (public.has_client_access(client_id, array['owner', 'editor']))
  with check (public.has_client_access(client_id, array['owner', 'editor']));

-- ---------------------------------------------------------------------------
-- founder_experiences
-- ---------------------------------------------------------------------------

alter table public.founder_experiences enable row level security;

create policy founder_experiences_select_accepted_access
  on public.founder_experiences
  for select
  to authenticated
  using (public.has_client_access(client_id));

create policy founder_experiences_insert_owner_editor
  on public.founder_experiences
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['owner', 'editor']));

create policy founder_experiences_update_owner_editor
  on public.founder_experiences
  for update
  to authenticated
  using (public.has_client_access(client_id, array['owner', 'editor']))
  with check (public.has_client_access(client_id, array['owner', 'editor']));

-- ---------------------------------------------------------------------------
-- content_ideas
-- ---------------------------------------------------------------------------

alter table public.content_ideas enable row level security;

create policy content_ideas_select_accepted_access
  on public.content_ideas
  for select
  to authenticated
  using (public.has_client_access(client_id));

create policy content_ideas_insert_owner_editor
  on public.content_ideas
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['owner', 'editor']));

create policy content_ideas_update_owner_editor
  on public.content_ideas
  for update
  to authenticated
  using (public.has_client_access(client_id, array['owner', 'editor']))
  with check (public.has_client_access(client_id, array['owner', 'editor']));

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------

alter table public.posts enable row level security;

create policy posts_select_accepted_access
  on public.posts
  for select
  to authenticated
  using (public.has_client_access(client_id));

create policy posts_insert_owner_editor
  on public.posts
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['owner', 'editor']));

create policy posts_update_owner_editor
  on public.posts
  for update
  to authenticated
  using (public.has_client_access(client_id, array['owner', 'editor']))
  with check (public.has_client_access(client_id, array['owner', 'editor']));

-- ---------------------------------------------------------------------------
-- research_runs
-- ---------------------------------------------------------------------------

alter table public.research_runs enable row level security;

create policy research_runs_select_accepted_access
  on public.research_runs
  for select
  to authenticated
  using (public.has_client_access(client_id));

create policy research_runs_insert_owner_editor
  on public.research_runs
  for insert
  to authenticated
  with check (public.has_client_access(client_id, array['owner', 'editor']));

create policy research_runs_update_owner_editor
  on public.research_runs
  for update
  to authenticated
  using (public.has_client_access(client_id, array['owner', 'editor']))
  with check (public.has_client_access(client_id, array['owner', 'editor']));

-- ---------------------------------------------------------------------------
-- llm_logs
--
-- Read-only for accepted client access. No insert/update/delete policies:
-- these logs are written by trusted server-side/worker code using the
-- service role, which bypasses RLS entirely.
-- ---------------------------------------------------------------------------

alter table public.llm_logs enable row level security;

create policy llm_logs_select_accepted_access
  on public.llm_logs
  for select
  to authenticated
  using (client_id is not null and public.has_client_access(client_id));

-- ---------------------------------------------------------------------------
-- audit_logs
--
-- Read-only for accepted client access. No insert/update/delete policies:
-- audit entries are written by trusted server-side code using the service
-- role, which bypasses RLS entirely.
-- ---------------------------------------------------------------------------

alter table public.audit_logs enable row level security;

create policy audit_logs_select_accepted_access
  on public.audit_logs
  for select
  to authenticated
  using (client_id is not null and public.has_client_access(client_id));
