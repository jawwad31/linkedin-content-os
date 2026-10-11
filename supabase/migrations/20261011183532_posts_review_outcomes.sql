-- Posts: who decided, and a rejection that frees the entry.
--
-- Adds three nullable columns to posts (who approved a version, who last edited it,
-- and the LinkedIn URL recorded when it is marked published) and a reject_post
-- function. Rejecting a post now records the reviewer's note and, in the same
-- transaction, releases the post's unpublished reservation so a single-use Content
-- Bank entry becomes available again. Published usage is never released.
--
-- reject_post is SECURITY DEFINER because a reviewer may not hold the capability that
-- updates source_usage. It is narrow: it re-checks sign-in, an active profile with no
-- pending password change, and admin or posts_review for that account, touches only
-- the named post and that post's own reservations, and has a fixed search path.
--
-- Additive and forward-only: nothing is dropped or rewritten and existing posts keep
-- null values. Rollback: stop calling reject_post and revoke its execute privilege
-- (see docs/posts-review-outcomes.md). The columns may stay.

alter table public.posts
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_edited_by uuid references public.profiles(id) on delete set null,
  add column if not exists linkedin_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_linkedin_url_length_check') then
    alter table public.posts
      add constraint posts_linkedin_url_length_check
      check (linkedin_url is null or char_length(linkedin_url) <= 2000);
  end if;
end $$;

create or replace function private.post_review_allowed(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.clients c
      where c.id = p_client_id and c.deleted_at is null
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active and not p.must_change_password
    )
    and (
      public.has_client_access(p_client_id, array['agency_admin', 'client_admin'])
      or private.has_client_permission(p_client_id, 'posts_review')
    );
$$;

revoke all on function private.post_review_allowed(uuid) from public, anon;
grant execute on function private.post_review_allowed(uuid) to authenticated;

create or replace function public.reject_post(
  p_client_id uuid,
  p_post_id uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_note text;
  v_freed integer := 0;
begin
  if p_client_id is null or p_post_id is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
  end if;

  if not private.post_review_allowed(p_client_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null or char_length(v_note) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
  end if;

  select p.status into v_status
  from public.posts p
  where p.id = p_post_id and p.client_id = p_client_id and p.deleted_at is null
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- Only a post still under review can be rejected; an approved or published post
  -- keeps its status and its usage history.
  if v_status not in ('review', 'needs_edit') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;

  update public.posts
  set status = 'rejected', edit_note = v_note, updated_at = now()
  where id = p_post_id and client_id = p_client_id;

  update public.source_usage
  set status = 'cancelled', updated_at = now()
  where client_id = p_client_id
    and post_id = p_post_id
    and status in ('reserved', 'used');
  get diagnostics v_freed = row_count;

  return jsonb_build_object('ok', true, 'freed', v_freed);
end;
$$;

revoke all on function public.reject_post(uuid, uuid, text) from public, anon;
grant execute on function public.reject_post(uuid, uuid, text) to authenticated, service_role;
