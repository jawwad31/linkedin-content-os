-- Calendar plan commits must name the plan revision the caller previewed.
--
-- Adds a five-argument commit_calendar_plan whose expected-revision argument has
-- no default. The revision is compared inside the existing calendar-row lock,
-- before any slot or reservation mutation, so a stale preview can no longer
-- replace a plan committed by another session.
--
-- Additive and forward-only: nothing is dropped, no data is touched. The previous
-- four-argument function is retained but its execute privilege is revoked from
-- every API role, so it is no longer reachable through the API as an unchecked
-- write path. Rollback: re-grant execute on the four-argument function (see
-- docs/calendar-plan-revision-check.md). Deploy this schema before the
-- application release; the application release must follow immediately because
-- the previously deployed application still calls the four-argument function.

create or replace function public.commit_calendar_plan(
  p_client_id uuid,
  p_calendar_id uuid,
  p_slots jsonb,
  p_replace boolean,
  p_expected_plan_revision integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_calendar public.content_calendars%rowtype;
  v_slot jsonb;
  v_source_id uuid;
  v_source_type text;
  v_bucket text;
  v_requested text;
  v_reason text;
  v_allow_reuse boolean;
  v_readiness text;
  v_active boolean;
  v_found boolean;
  v_unavailable jsonb := '[]'::jsonb;
  v_ids uuid[];
  v_free_indexes integer[];
  v_free_pos integer := 1;
  v_slot_count integer;
  v_released integer := 0;
  v_revision integer;
  v_usage_id uuid;
  v_new_slot_id uuid;
  v_status text;
begin
  select * into v_calendar
  from public.content_calendars
  where id = p_calendar_id and client_id = p_client_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- Optimistic concurrency, checked under the calendar-row lock taken above and
  -- before any validation, advisory lock, release or insert. A caller must name
  -- the plan revision it previewed; null is refused rather than skipped, and a
  -- stale revision changes nothing.
  if p_expected_plan_revision is null then
    return jsonb_build_object('ok', false, 'code', 'PLAN_REVISION_REQUIRED');
  end if;

  if v_calendar.plan_revision is distinct from p_expected_plan_revision then
    return jsonb_build_object(
      'ok', false,
      'code', 'PLAN_REVISION_CONFLICT',
      'current_plan_revision', v_calendar.plan_revision
    );
  end if;

  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
  end if;

  v_slot_count := jsonb_array_length(p_slots);

  -- Existing active slots: a plan must be replaced deliberately, never silently.
  if not p_replace and exists (
    select 1 from public.calendar_slots
    where calendar_id = p_calendar_id and client_id = p_client_id
      and status <> 'cancelled'
  ) then
    return jsonb_build_object('ok', false, 'code', 'PLAN_EXISTS');
  end if;

  -- Indexes still free once preserved (post-bearing) slots keep their place.
  select coalesce(array_agg(g.i order by g.i), '{}')
    into v_free_indexes
  from generate_series(1, v_calendar.post_count) as g(i)
  where not exists (
    select 1 from public.calendar_slots s
    where s.calendar_id = p_calendar_id
      and s.client_id = p_client_id
      and s.status <> 'cancelled'
      and (s.post_id is not null or s.status in ('queued','drafting'))
      and s.slot_index = g.i
  );

  if v_slot_count > coalesce(array_length(v_free_indexes, 1), 0) then
    return jsonb_build_object('ok', false, 'code', 'TOO_MANY_SLOTS');
  end if;

  -- Validate shape, bucket/source pairing, and duplicates.
  v_ids := '{}';
  for v_slot in select * from jsonb_array_elements(p_slots) loop
    v_bucket := v_slot->>'bucket';
    v_requested := v_slot->>'requested_bucket';
    v_reason := nullif(v_slot->>'shortage_reason', '');
    v_source_type := nullif(v_slot->>'source_type', '');

    if v_bucket is null
       or v_bucket not in ('experience', 'asset', 'evergreen', 'news')
       or v_requested is null
       or v_requested not in ('experience', 'asset', 'evergreen', 'news')
       or (v_reason is not null and v_reason not in ('fewer_selected', 'no_eligible_entries')) then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
    end if;

    if nullif(v_slot->>'source_id', '') is null then
      if v_source_type is not null or v_bucket in ('experience', 'asset') then
        return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
      end if;
    else
      begin
        v_source_id := (v_slot->>'source_id')::uuid;
      exception when invalid_text_representation then
        return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
      end;

      if not (
        (v_bucket = 'experience' and v_source_type = 'founder_experience')
        or (v_bucket = 'asset' and v_source_type = 'content_resource')
      ) then
        return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
      end if;

      if v_source_id = any (v_ids) then
        return jsonb_build_object('ok', false, 'code', 'DUPLICATE_SOURCE');
      end if;
      v_ids := v_ids || v_source_id;
    end if;
  end loop;

  -- Serialise against every other reservation of these entries, in a stable
  -- order so two planners selecting overlapping entries cannot deadlock.
  for v_source_id in select distinct u from unnest(v_ids) as u order by u loop
    perform pg_advisory_xact_lock(
      hashtextextended('content_bank_source:' || v_source_id::text, 0)
    );
  end loop;

  -- Availability. Reservations held by slots about to be replanned do not count.
  for v_slot in select * from jsonb_array_elements(p_slots) loop
    if nullif(v_slot->>'source_id', '') is null then
      continue;
    end if;

    v_source_id := (v_slot->>'source_id')::uuid;
    v_source_type := v_slot->>'source_type';

    if v_source_type = 'founder_experience' then
      select fe.allow_reuse, fe.readiness, true
        into v_allow_reuse, v_readiness, v_active
      from public.founder_experiences fe
      where fe.id = v_source_id and fe.client_id = p_client_id
        and fe.deleted_at is null;
    else
      select cr.allow_reuse, cr.readiness, coalesce(cr.active, true)
        into v_allow_reuse, v_readiness, v_active
      from public.content_resources cr
      where cr.id = v_source_id and cr.client_id = p_client_id
        and cr.deleted_at is null;
    end if;
    v_found := found;

    if not v_found or v_readiness is distinct from 'ready' or not v_active then
      v_unavailable := v_unavailable || jsonb_build_array(
        jsonb_build_object('source_id', v_source_id, 'reason', 'NOT_AVAILABLE')
      );
    elsif exists (
      select 1 from public.calendar_slots s
      where s.calendar_id = p_calendar_id and s.client_id = p_client_id
        and s.source_id = v_source_id and s.status <> 'cancelled'
        and (not p_replace or (s.post_id is not null or s.status in ('queued','drafting')))
    ) then
      v_unavailable := v_unavailable || jsonb_build_array(
        jsonb_build_object('source_id', v_source_id, 'reason', 'ALREADY_IN_CALENDAR')
      );
    elsif not coalesce(v_allow_reuse, false) and exists (
      select 1 from public.source_usage su
      where su.client_id = p_client_id and su.source_id = v_source_id
        and su.status in ('reserved', 'used', 'published')
        and not (
          p_replace and su.id in (
            select s.source_usage_id from public.calendar_slots s
            where s.calendar_id = p_calendar_id and s.client_id = p_client_id
              and s.status <> 'cancelled' and s.post_id is null and s.status not in ('queued','drafting')
              and s.source_usage_id is not null
          )
        )
    ) then
      v_unavailable := v_unavailable || jsonb_build_array(
        jsonb_build_object('source_id', v_source_id, 'reason', 'SINGLE_USE_CONFLICT')
      );
    end if;
  end loop;

  if jsonb_array_length(v_unavailable) > 0 then
    return jsonb_build_object(
      'ok', false, 'code', 'SOURCE_UNAVAILABLE', 'unavailable', v_unavailable
    );
  end if;

  -- All checks passed: release replanned slots, then write the new plan.
  if p_replace then
    update public.source_usage su
    set status = 'cancelled', updated_at = now()
    where su.client_id = p_client_id
      and su.status = 'reserved'
      and su.id in (
        select s.source_usage_id from public.calendar_slots s
        where s.calendar_id = p_calendar_id and s.client_id = p_client_id
          and s.status <> 'cancelled' and s.post_id is null and s.status not in ('queued','drafting')
          and s.source_usage_id is not null
      );

    update public.calendar_slots
    set status = 'cancelled', updated_at = now()
    where calendar_id = p_calendar_id and client_id = p_client_id
      and status <> 'cancelled' and post_id is null and status not in ('queued','drafting');
    get diagnostics v_released = row_count;
  end if;

  v_revision := v_calendar.plan_revision + 1;

  for v_slot in select * from jsonb_array_elements(p_slots) loop
    v_bucket := v_slot->>'bucket';
    v_requested := v_slot->>'requested_bucket';
    v_reason := nullif(v_slot->>'shortage_reason', '');
    v_source_id := nullif(v_slot->>'source_id', '')::uuid;
    v_source_type := nullif(v_slot->>'source_type', '');
    v_usage_id := null;

    if v_source_id is not null then
      v_status := 'reserved';
    elsif v_bucket = 'news' then
      v_status := 'placeholder';
    else
      v_status := 'planned';
    end if;

    if v_source_id is not null then
      insert into public.source_usage (
        client_id, source_id, source_type, channel, status
      )
      values (
        p_client_id, v_source_id, v_source_type, 'calendar_slot', 'reserved'
      )
      returning id into v_usage_id;
    end if;

    insert into public.calendar_slots (
      client_id, calendar_id, slot_index, bucket, requested_bucket,
      shortage_reason, status, source_id, source_type, source_usage_id,
      plan_revision
    )
    values (
      p_client_id, p_calendar_id, v_free_indexes[v_free_pos], v_bucket,
      v_requested, v_reason, v_status, v_source_id, v_source_type, v_usage_id,
      v_revision
    );
    v_free_pos := v_free_pos + 1;
  end loop;

  update public.content_calendars
  set plan_revision = v_revision,
      planned_at = now(),
      updated_by = auth.uid()
  where id = p_calendar_id and client_id = p_client_id;

  return jsonb_build_object(
    'ok', true,
    'plan_revision', v_revision,
    'slot_count', v_slot_count,
    'released', v_released
  );
end;
$$;

-- Default privileges give the API roles execute on new functions; make the grants
-- explicit so only signed-in users (and the service role) can commit a plan.
revoke all on function public.commit_calendar_plan(uuid, uuid, jsonb, boolean, integer)
  from public, anon;
grant execute on function public.commit_calendar_plan(uuid, uuid, jsonb, boolean, integer)
  to authenticated, service_role;

-- Retire the unchecked four-argument entry point without dropping it.
revoke all on function public.commit_calendar_plan(uuid, uuid, jsonb, boolean)
  from public, anon, authenticated, service_role;
