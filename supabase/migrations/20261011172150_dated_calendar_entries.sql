-- Calendar: reserve a Content Bank entry on a date.
--
-- The calendar becomes a set of dated entries instead of a monthly plan. This adds a
-- nullable date to calendar slots and two SECURITY INVOKER functions:
--   add_calendar_entry    reserves one entry on one date (this month or next).
--   move_calendar_slots   moves several reserved entries to new dates at once,
--                         checked against the plan revision the caller saw.
-- Additive and forward-only: nothing is dropped or rewritten, existing slots keep a
-- null date, and the previous monthly plan functions remain in place unchanged.
-- Rollback: stop calling the new functions and, if wanted, revoke their execute
-- privilege (see docs/dated-calendar-entries.md). The column may stay.

alter table public.calendar_slots
  add column if not exists scheduled_date date;

create index if not exists calendar_slots_client_date_idx
  on public.calendar_slots (client_id, scheduled_date)
  where scheduled_date is not null and status <> 'cancelled';

-- Today's date in the account's calendar timezone (UTC when none is saved or the
-- saved name is not a valid zone).
create or replace function private.calendar_account_today(p_client_id uuid)
returns date
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_timezone text;
begin
  select d.timezone into v_timezone
  from public.calendar_defaults d
  where d.client_id = p_client_id;

  begin
    return (now() at time zone coalesce(v_timezone, 'UTC'))::date;
  exception when others then
    return (now() at time zone 'UTC')::date;
  end;
end;
$$;

revoke all on function private.calendar_account_today(uuid) from public, anon;
grant execute on function private.calendar_account_today(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- add_calendar_entry
-- ---------------------------------------------------------------------------

create or replace function public.add_calendar_entry(
  p_client_id uuid,
  p_source_id uuid,
  p_source_type text,
  p_date date,
  p_allow_same_day boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today date;
  v_month date;
  v_this_month date;
  v_calendar public.content_calendars%rowtype;
  v_defaults public.calendar_defaults%rowtype;
  v_allow_reuse boolean;
  v_readiness text;
  v_active boolean;
  v_found boolean;
  v_bucket text;
  v_same_day jsonb;
  v_usage_id uuid;
  v_slot_id uuid;
  v_index integer;
  v_revision integer;
begin
  if p_client_id is null or p_source_id is null or p_date is null
     or p_allow_same_day is null
     or p_source_type is null
     or p_source_type not in ('founder_experience', 'content_resource') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
  end if;

  if not (
    public.has_client_access(p_client_id, array['agency_admin', 'client_admin'])
    or private.has_client_permission(p_client_id, 'ideas_manage')
  ) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  v_today := private.calendar_account_today(p_client_id);
  if p_date < v_today then
    return jsonb_build_object('ok', false, 'code', 'DATE_IN_PAST');
  end if;

  v_month := date_trunc('month', p_date)::date;
  v_this_month := date_trunc('month', v_today)::date;
  if v_month not in (v_this_month, (v_this_month + interval '1 month')::date) then
    return jsonb_build_object('ok', false, 'code', 'DATE_OUT_OF_RANGE');
  end if;

  -- The month row holds the slots. Create it from the account defaults when it does
  -- not exist yet; with no defaults saved, use an internal bookkeeping snapshot
  -- (not a product default; nothing in the dated calendar reads it).
  select * into v_calendar
  from public.content_calendars
  where client_id = p_client_id and month = v_month
  for update;

  if not found then
    select * into v_defaults
    from public.calendar_defaults
    where client_id = p_client_id;

    if found then
      insert into public.content_calendars (
        client_id, month, timezone, post_count, share_experience, share_asset,
        share_evergreen, share_news, news_cap_percent, defaults_version,
        created_by, updated_by
      )
      values (
        p_client_id, v_month, v_defaults.timezone, v_defaults.post_count,
        v_defaults.share_experience, v_defaults.share_asset,
        v_defaults.share_evergreen, v_defaults.share_news,
        v_defaults.news_cap_percent, v_defaults.version, auth.uid(), auth.uid()
      )
      on conflict (client_id, month) do nothing;
    else
      insert into public.content_calendars (
        client_id, month, timezone, post_count, share_experience, share_asset,
        share_evergreen, share_news, news_cap_percent, created_by, updated_by
      )
      values (p_client_id, v_month, 'UTC', 60, 100, 0, 0, 0, 0, auth.uid(), auth.uid())
      on conflict (client_id, month) do nothing;
    end if;

    select * into v_calendar
    from public.content_calendars
    where client_id = p_client_id and month = v_month
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'UNKNOWN_ERROR');
    end if;
  end if;

  -- Serialise against every other reservation of this entry (standalone drafting,
  -- the monthly plan, other planners), using the same key as those paths.
  perform pg_advisory_xact_lock(
    hashtextextended('content_bank_source:' || p_source_id::text, 0)
  );

  if p_source_type = 'founder_experience' then
    select fe.allow_reuse, fe.readiness, true
      into v_allow_reuse, v_readiness, v_active
    from public.founder_experiences fe
    where fe.id = p_source_id and fe.client_id = p_client_id
      and fe.deleted_at is null;
    v_bucket := 'experience';
  else
    select cr.allow_reuse, cr.readiness, coalesce(cr.active, true)
      into v_allow_reuse, v_readiness, v_active
    from public.content_resources cr
    where cr.id = p_source_id and cr.client_id = p_client_id
      and cr.deleted_at is null;
    v_bucket := 'asset';
  end if;
  v_found := found;

  if not v_found or v_readiness is distinct from 'ready' or not v_active then
    return jsonb_build_object(
      'ok', false, 'code', 'SOURCE_UNAVAILABLE', 'reason', 'NOT_AVAILABLE'
    );
  end if;

  if exists (
    select 1 from public.calendar_slots s
    where s.calendar_id = v_calendar.id and s.client_id = p_client_id
      and s.source_id = p_source_id and s.status <> 'cancelled'
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'SOURCE_UNAVAILABLE', 'reason', 'ALREADY_IN_CALENDAR'
    );
  end if;

  if not coalesce(v_allow_reuse, false) and exists (
    select 1 from public.source_usage su
    where su.client_id = p_client_id and su.source_id = p_source_id
      and su.status in ('reserved', 'used', 'published')
  ) then
    return jsonb_build_object(
      'ok', false, 'code', 'SOURCE_UNAVAILABLE', 'reason', 'SINGLE_USE_CONFLICT'
    );
  end if;

  -- A date that already has posts needs an explicit yes; there is no limit per day.
  select coalesce(jsonb_agg(jsonb_build_object(
           'slot_id', s.id,
           'title', coalesce(fe.title, cr.title),
           'status', s.status
         ) order by s.slot_index), '[]'::jsonb)
    into v_same_day
  from public.calendar_slots s
  left join public.founder_experiences fe
    on s.source_type = 'founder_experience' and fe.id = s.source_id
  left join public.content_resources cr
    on s.source_type = 'content_resource' and cr.id = s.source_id
  where s.client_id = p_client_id and s.scheduled_date = p_date
    and s.status <> 'cancelled';

  if jsonb_array_length(v_same_day) > 0 and not p_allow_same_day then
    return jsonb_build_object(
      'ok', false, 'code', 'DATE_HAS_POSTS', 'posts', v_same_day
    );
  end if;

  select coalesce(max(s.slot_index), 0) + 1 into v_index
  from public.calendar_slots s
  where s.calendar_id = v_calendar.id and s.client_id = p_client_id
    and s.status <> 'cancelled';

  v_revision := v_calendar.plan_revision + 1;

  insert into public.source_usage (client_id, source_id, source_type, channel, status)
  values (p_client_id, p_source_id, p_source_type, 'calendar_slot', 'reserved')
  returning id into v_usage_id;

  insert into public.calendar_slots (
    client_id, calendar_id, slot_index, bucket, requested_bucket, status,
    source_id, source_type, source_usage_id, plan_revision, scheduled_date
  )
  values (
    p_client_id, v_calendar.id, v_index, v_bucket, v_bucket, 'reserved',
    p_source_id, p_source_type, v_usage_id, v_revision, p_date
  )
  returning id into v_slot_id;

  update public.content_calendars
  set plan_revision = v_revision, planned_at = now(), updated_by = auth.uid()
  where id = v_calendar.id and client_id = p_client_id;

  return jsonb_build_object(
    'ok', true,
    'slot_id', v_slot_id,
    'usage_id', v_usage_id,
    'calendar_id', v_calendar.id,
    'plan_revision', v_revision,
    'scheduled_date', p_date,
    'posts_on_day', jsonb_array_length(v_same_day) + 1
  );
end;
$$;

revoke all on function public.add_calendar_entry(uuid, uuid, text, date, boolean)
  from public, anon;
grant execute on function public.add_calendar_entry(uuid, uuid, text, date, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- move_calendar_slots
-- ---------------------------------------------------------------------------

create or replace function public.move_calendar_slots(
  p_client_id uuid,
  p_calendar_id uuid,
  p_moves jsonb,
  p_allow_same_day boolean,
  p_expected_plan_revision integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_calendar public.content_calendars%rowtype;
  v_today date;
  v_month_end date;
  v_move jsonb;
  v_ids uuid[] := '{}';
  v_dates date[] := '{}';
  v_slot_id uuid;
  v_date date;
  v_moving uuid[] := '{}';
  v_moving_dates date[] := '{}';
  v_found_count integer;
  v_bad uuid[];
  v_conflicts jsonb;
  v_revision integer;
  v_changed integer;
  v_i integer;
begin
  if p_client_id is null or p_calendar_id is null or p_allow_same_day is null
     or p_moves is null or jsonb_typeof(p_moves) <> 'array'
     or jsonb_array_length(p_moves) = 0 or jsonb_array_length(p_moves) > 100 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
  end if;

  if not (
    public.has_client_access(p_client_id, array['agency_admin', 'client_admin'])
    or private.has_client_permission(p_client_id, 'ideas_manage')
  ) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select * into v_calendar
  from public.content_calendars
  where id = p_calendar_id and client_id = p_client_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- Checked under the calendar-row lock, before any change.
  if p_expected_plan_revision is null then
    return jsonb_build_object('ok', false, 'code', 'PLAN_REVISION_REQUIRED');
  end if;
  if v_calendar.plan_revision is distinct from p_expected_plan_revision then
    return jsonb_build_object(
      'ok', false, 'code', 'PLAN_REVISION_CONFLICT',
      'current_plan_revision', v_calendar.plan_revision
    );
  end if;

  for v_move in select * from jsonb_array_elements(p_moves) loop
    begin
      v_slot_id := (v_move->>'slot_id')::uuid;
      v_date := (v_move->>'date')::date;
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
    end;
    if v_slot_id is null or v_date is null or v_slot_id = any (v_ids) then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
    end if;
    v_ids := v_ids || v_slot_id;
    v_dates := v_dates || v_date;
  end loop;

  v_today := private.calendar_account_today(p_client_id);
  v_month_end := (v_calendar.month + interval '1 month')::date;
  for v_i in 1 .. cardinality(v_ids) loop
    if v_dates[v_i] < v_today then
      return jsonb_build_object('ok', false, 'code', 'DATE_IN_PAST');
    end if;
    if v_dates[v_i] < v_calendar.month or v_dates[v_i] >= v_month_end then
      return jsonb_build_object('ok', false, 'code', 'DATE_OUT_OF_RANGE');
    end if;
  end loop;

  -- Lock the slots, then require every one to be a movable reservation: not
  -- queued, drafting, drafted or cancelled, and not backing a post.
  select count(*) into v_found_count
  from (
    select s.id from public.calendar_slots s
    where s.id = any (v_ids) and s.calendar_id = p_calendar_id
      and s.client_id = p_client_id and s.status <> 'cancelled'
    for update
  ) locked;

  if v_found_count <> cardinality(v_ids) then
    return jsonb_build_object('ok', false, 'code', 'SLOT_NOT_FOUND');
  end if;

  select coalesce(array_agg(s.id), '{}') into v_bad
  from public.calendar_slots s
  where s.id = any (v_ids)
    and (s.status <> 'reserved' or s.post_id is not null or s.content_idea_id is not null);

  if cardinality(v_bad) > 0 then
    return jsonb_build_object('ok', false, 'code', 'SLOT_NOT_MOVABLE', 'slot_ids', to_jsonb(v_bad));
  end if;

  -- Only slots whose date actually changes are moved.
  for v_i in 1 .. cardinality(v_ids) loop
    if exists (
      select 1 from public.calendar_slots s
      where s.id = v_ids[v_i] and s.scheduled_date is distinct from v_dates[v_i]
    ) then
      v_moving := v_moving || v_ids[v_i];
      v_moving_dates := v_moving_dates || v_dates[v_i];
    end if;
  end loop;

  v_changed := cardinality(v_moving);
  if v_changed = 0 then
    return jsonb_build_object(
      'ok', true, 'moved', 0, 'plan_revision', v_calendar.plan_revision
    );
  end if;

  -- A target date that already holds posts (other than the ones being moved away),
  -- or that two moved entries share, needs an explicit yes.
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', t.d,
           'incoming', t.incoming,
           'posts', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'slot_id', s.id,
                      'title', coalesce(fe.title, cr.title),
                      'status', s.status
                    ) order by s.slot_index)
             from public.calendar_slots s
             left join public.founder_experiences fe
               on s.source_type = 'founder_experience' and fe.id = s.source_id
             left join public.content_resources cr
               on s.source_type = 'content_resource' and cr.id = s.source_id
             where s.client_id = p_client_id and s.scheduled_date = t.d
               and s.status <> 'cancelled' and not (s.id = any (v_moving))
           ), '[]'::jsonb)
         ) order by t.d), '[]'::jsonb)
    into v_conflicts
  from (
    select md.d, count(*)::int as incoming
    from unnest(v_moving_dates) as md(d)
    group by md.d
  ) t
  where t.incoming > 1
     or exists (
       select 1 from public.calendar_slots s
       where s.client_id = p_client_id and s.scheduled_date = t.d
         and s.status <> 'cancelled' and not (s.id = any (v_moving))
     );

  if jsonb_array_length(v_conflicts) > 0 and not p_allow_same_day then
    return jsonb_build_object('ok', false, 'code', 'DATE_HAS_POSTS', 'dates', v_conflicts);
  end if;

  for v_i in 1 .. v_changed loop
    update public.calendar_slots
    set scheduled_date = v_moving_dates[v_i]
    where id = v_moving[v_i] and calendar_id = p_calendar_id and client_id = p_client_id;
  end loop;

  v_revision := v_calendar.plan_revision + 1;
  update public.content_calendars
  set plan_revision = v_revision, planned_at = now(), updated_by = auth.uid()
  where id = p_calendar_id and client_id = p_client_id;

  return jsonb_build_object('ok', true, 'moved', v_changed, 'plan_revision', v_revision);
end;
$$;

revoke all on function public.move_calendar_slots(uuid, uuid, jsonb, boolean, integer)
  from public, anon;
grant execute on function public.move_calendar_slots(uuid, uuid, jsonb, boolean, integer)
  to authenticated, service_role;
