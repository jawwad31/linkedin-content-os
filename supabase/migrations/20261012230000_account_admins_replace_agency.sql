-- The agency level is retired. A person belongs to an account (one company) as an
-- Account Admin or an Account User. Nothing is dropped: the agencies and
-- agency_members tables stay in place, dormant.
--
-- 1. Everyone who administered an agency becomes an ordinary Account Admin of each
--    company under it, so they keep working access once the app stops looking at
--    agency membership.
-- 2. Account Admins may read their own company's operational logs (until now only
--    Agency Admins could).

insert into public.client_access (
  client_id, user_id, role, invitation_status, permissions, accepted_at
)
select c.id, am.user_id, 'client_admin', 'accepted', '{}'::text[], now()
from public.agency_members am
join public.clients c on c.agency_id = am.agency_id
where am.role = 'agency_admin'
  and am.invitation_status = 'accepted'
  and c.deleted_at is null
on conflict (client_id, user_id)
  where user_id is not null and invitation_status = 'accepted'
do update set role = 'client_admin', permissions = '{}'::text[];

drop policy if exists audit_logs_select_account_admin on public.audit_logs;
create policy audit_logs_select_account_admin
  on public.audit_logs
  for select
  to authenticated
  using (
    client_id is not null
    and public.has_client_access(client_id, array['client_admin'])
  );

drop policy if exists llm_logs_select_account_admin on public.llm_logs;
create policy llm_logs_select_account_admin
  on public.llm_logs
  for select
  to authenticated
  using (
    client_id is not null
    and public.has_client_access(client_id, array['client_admin'])
  );
