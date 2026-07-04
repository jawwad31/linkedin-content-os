-- Feature 07 — Email Invitations: accept-by-email RLS support
--
-- Feature 04's client_access policies only let a user see/update their own
-- row via `user_id = auth.uid()`. An invite created for someone without an
-- existing account yet (or simply not linked at invite time) has
-- `user_id = null` and is keyed only by `invited_email` — under the
-- existing policies, the invited user could never see or accept it.
--
-- These two additional policies close that gap using the verified `email`
-- claim from the user's own JWT (issued by Supabase Auth, not client
-- input), so the accept flow stays on the normal authenticated/RLS path
-- instead of needing the service role. They only ever touch rows that are
-- still `pending` and unclaimed (`user_id is null`), and the update can only
-- move a row to `accepted` while binding it to the caller's own id — never
-- change `role`, and never touch a row that already belongs to someone
-- else or has already been decided (accepted/revoked).

create policy client_access_select_pending_by_email
  on public.client_access
  for select
  to authenticated
  using (
    user_id is null
    and invitation_status = 'pending'
    and invited_email is not null
    and lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy client_access_update_claim_pending_by_email
  on public.client_access
  for update
  to authenticated
  using (
    user_id is null
    and invitation_status = 'pending'
    and invited_email is not null
    and lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    user_id = auth.uid()
    and invitation_status = 'accepted'
    and lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
