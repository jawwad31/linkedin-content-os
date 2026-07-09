-- Feature 25 - Owner-only operational log visibility
--
-- audit_logs and llm_logs are written by trusted server-side code through the
-- service role. Reads are now owner-only so editors/viewers cannot inspect
-- operational metadata through the browser Data API.

drop policy if exists audit_logs_select_accepted_access on public.audit_logs;
drop policy if exists llm_logs_select_accepted_access on public.llm_logs;

create policy audit_logs_select_owner_access
  on public.audit_logs
  for select
  to authenticated
  using (
    client_id is not null
    and public.has_client_access(client_id, array['owner'])
  );

create policy llm_logs_select_owner_access
  on public.llm_logs
  for select
  to authenticated
  using (
    client_id is not null
    and public.has_client_access(client_id, array['owner'])
  );
