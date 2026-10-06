-- Migration: Monthly calendar settings, allocation plan, and atomic source reservation
-- Product: Virel
-- Phase: P05
--
-- Additive and rerunnable. Adds account-level calendar defaults, one saved
-- settings snapshot per account/month, and the slots of the monthly plan. Source
-- reservation moves into SQL so competing selections cannot both win a
-- single-use Content Bank entry. No existing table is altered or dropped.

-- ---------------------------------------------------------------------------
-- 1. calendar_defaults: one current record per account. `version` increases on
--    every save; new calendars copy these values and remember the version.
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_defaults (
  client_id uuid primary key references public.clients(id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  timezone text not null check (length(trim(timezone)) > 0),
  post_count integer not null check (post_count between 1 and 60),
  share_experience integer not null check (share_experience between 0 and 100),
  share_asset integer not null check (share_asset between 0 and 100),
  share_evergreen integer not null check (share_evergreen between 0 and 100),
  share_news integer not null check (share_news between 0 and 100),
  news_cap_percent integer not null check (news_cap_percent between 0 and 100),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_defaults_shares_sum_check
    check (share_experience + share_asset + share_evergreen + share_news = 100),
  constraint calendar_defaults_news_cap_check
    check (share_news <= news_cap_percent)
);

-- ---------------------------------------------------------------------------
-- 2. content_calendars: one saved snapshot per account and month. Later changes
--    to calendar_defaults never modify an existing row.
-- ---------------------------------------------------------------------------

create table if not exists public.content_calendars (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  month date not null,
  timezone text not null check (length(trim(timezone)) > 0),
  post_count integer not null check (post_count between 1 and 60),
  share_experience integer not null check (share_experience between 0 and 100),
  share_asset integer not null check (share_asset between 0 and 100),
  share_evergreen integer not null check (share_evergreen between 0 and 100),
  share_news integer not null check (share_news between 0 and 100),
  news_cap_percent integer not null check (news_cap_percent between 0 and 100),
  defaults_version integer check (defaults_version >= 1),
  settings_revision integer not null default 1 check (settings_revision >= 1),
  plan_revision integer not null default 0 check (plan_revision >= 0),
  planned_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_calendars_month_first_day_check
    check (month = date_trunc('month', month)::date),
  constraint content_calendars_shares_sum_check
    check (share_experience + share_asset + share_evergreen + share_news = 100),
  constraint content_calendars_news_cap_check
    check (share_news <= news_cap_percent),
  constraint content_calendars_client_month_key unique (client_id, month),
  constraint content_calendars_client_id_id_key unique (client_id, id)
);

-- ---------------------------------------------------------------------------
-- 3. calendar_slots: the planned posts of a month. Cancelled slots are kept as
--    history; nothing here is hard-deleted or cascaded.
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_slots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  calendar_id uuid not null,
  slot_index integer not null check (slot_index >= 1),
  bucket text not null
    check (bucket in ('experience', 'asset', 'evergreen', 'news')),
  requested_bucket text not null
    check (requested_bucket in ('experience', 'asset', 'evergreen', 'news')),
  shortage_reason text
    check (shortage_reason in ('fewer_selected', 'no_eligible_entries')),
  status text not null default 'planned'
    check (status in ('placeholder', 'planned', 'reserved', 'cancelled')),
  source_id uuid,
  source_type text
    check (source_type in ('founder_experience', 'content_resource')),
  source_usage_id uuid references public.source_usage(id) on delete set null,
  post_id uuid references public.posts(id),
  plan_revision integer not null check (plan_revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_slots_calendar_fkey
    foreign key (client_id, calendar_id)
    references public.content_calendars(client_id, id),
  constraint calendar_slots_source_pair_check
    check (
      (source_id is null and source_type is null)
      or (
        source_id is not null
        and (
          (bucket = 'experience' and source_type = 'founder_experience')
          or (bucket = 'asset' and source_type = 'content_resource')
        )
      )
    ),
  constraint calendar_slots_reserved_source_check
    check (status <> 'reserved' or source_id is not null)
);

create unique index if not exists calendar_slots_active_index_key
  on public.calendar_slots (calendar_id, slot_index)
  where status <> 'cancelled';

-- One use of an entry per calendar unless the user plans another angle later.
create unique index if not exists calendar_slots_active_source_key
  on public.calendar_slots (calendar_id, source_id)
  where source_id is not null and status <> 'cancelled';

create index if not exists calendar_slots_client_calendar_idx
  on public.calendar_slots (client_id, calendar_id);

create index if not exists calendar_slots_client_source_idx
  on public.calendar_slots (client_id, source_id)
  where source_id is not null and status <> 'cancelled';

create index if not exists calendar_slots_post_idx
  on public.calendar_slots (post_id)
  where post_id is not null;

drop trigger if exists set_updated_at on public.calendar_defaults;
create trigger set_updated_at
  before update on public.calendar_defaults
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.content_calendars;
create trigger set_updated_at
  before update on public.content_calendars
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.calendar_slots;
create trigger set_updated_at
  before update on public.calendar_slots
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. RLS. Reads follow accepted workspace access. Defaults are admin-only;
--    monthly plans follow the ideas_manage capability. No delete policies.
-- ---------------------------------------------------------------------------

alter table public.calendar_defaults enable row level security;
alter table public.content_calendars enable row level security;
alter table public.calendar_slots enable row level security;

drop policy if exists "Workspace members can read calendar defaults" on public.calendar_defaults;
create policy "Workspace members can read calendar defaults"
  on public.calendar_defaults for select
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']));

drop policy if exists "Admins can insert calendar defaults" on public.calendar_defaults;
create policy "Admins can insert calendar defaults"
  on public.calendar_defaults for insert
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

drop policy if exists "Admins can update calendar defaults" on public.calendar_defaults;
create policy "Admins can update calendar defaults"
  on public.calendar_defaults for update
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin']))
  with check (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

drop policy if exists "Workspace members can read content calendars" on public.content_calendars;
create policy "Workspace members can read content calendars"
  on public.content_calendars for select
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']));

drop policy if exists "Planners can insert content calendars" on public.content_calendars;
create policy "Planners can insert content calendars"
  on public.content_calendars for insert
  with check (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or private.has_client_permission(client_id, 'ideas_manage')
  );

drop policy if exists "Planners can update content calendars" on public.content_calendars;
create policy "Planners can update content calendars"
  on public.content_calendars for update
  using (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or private.has_client_permission(client_id, 'ideas_manage')
  )
  with check (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or private.has_client_permission(client_id, 'ideas_manage')
  );

drop policy if exists "Workspace members can read calendar slots" on public.calendar_slots;
create policy "Workspace members can read calendar slots"
  on public.calendar_slots for select
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin', 'client_user']));

drop policy if exists "Planners can insert calendar slots" on public.calendar_slots;
create policy "Planners can insert calendar slots"
  on public.calendar_slots for insert
  with check (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or private.has_client_permission(client_id, 'ideas_manage')
  );

drop policy if exists "Planners can update calendar slots" on public.calendar_slots;
create policy "Planners can update calendar slots"
  on public.calendar_slots for update
  using (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or private.has_client_permission(client_id, 'ideas_manage')
  )
  with check (
    public.has_client_access(client_id, array['agency_admin', 'client_admin'])
    or private.has_client_permission(client_id, 'ideas_manage')
  );

grant select, insert, update
  on table public.calendar_defaults, public.content_calendars, public.calendar_slots
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Atomic single-source reservation (standalone drafting path).
--    A transaction-scoped advisory lock keyed by the source serialises every
--    reservation of that entry, so two requests cannot both claim a single-use
--    entry between the availability check and the insert.
-- ---------------------------------------------------------------------------

create or replace function public.reserve_content_bank_source(
  p_client_id uuid,
  p_source_id uuid,
  p_source_type text,
  p_channel text default 'linkedin_post',
  p_content_idea_id uuid default null,
  p_post_id uuid default null,
  p_angle text default null,
  p_takeaway text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_allow_reuse boolean;
  v_readiness text;
  v_usage_id uuid;
begin
  if p_source_type not in ('founder_experience', 'content_resource')
     or p_channel not in ('linkedin_post', 'newsletter', 'calendar_slot') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION_ERROR');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('content_bank_source:' || p_source_id::text, 0)
  );

  if p_source_type = 'founder_experience' then
    select fe.allow_reuse, fe.readiness
      into v_allow_reuse, v_readiness
    from public.founder_experiences fe
    where fe.id = p_source_id
      and fe.client_id = p_client_id
      and fe.deleted_at is null;
  else
    select cr.allow_reuse, cr.readiness
      into v_allow_reuse, v_readiness
    from public.content_resources cr
    where cr.id = p_source_id
      and cr.client_id = p_client_id
      and cr.deleted_at is null;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v_readiness = 'archived' then
    return jsonb_build_object('ok', false, 'code', 'ARCHIVED_ENTRY');
  end if;

  if not coalesce(v_allow_reuse, false) and exists (
    select 1
    from public.source_usage su
    where su.client_id = p_client_id
      and su.source_id = p_source_id
      and su.status in ('reserved', 'used', 'published')
  ) then
    return jsonb_build_object('ok', false, 'code', 'SINGLE_USE_CONFLICT');
  end if;

  insert into public.source_usage (
    client_id, source_id, source_type, channel, status,
    content_idea_id, post_id, angle, takeaway
  )
  values (
    p_client_id, p_source_id, p_source_type, p_channel, 'reserved',
    p_content_idea_id, p_post_id, p_angle, p_takeaway
  )
  returning id into v_usage_id;

  return jsonb_build_object('ok', true, 'usage_id', v_usage_id);
end;
$$;

grant execute on function public.reserve_content_bank_source(
  uuid, uuid, text, text, uuid, uuid, text, text
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Commit a monthly plan: validate every selected entry, then write the new
--    slots and their reservations in one transaction. Nothing is written unless
--    every selected entry is available. p_replace replans only slots that have
--    no post attached; slots carrying a post are preserved untouched.
--
--    p_slots: jsonb array of
--      { bucket, requested_bucket, shortage_reason, source_id, source_type }
-- ---------------------------------------------------------------------------

create or replace function public.commit_calendar_plan(
  p_client_id uuid,
  p_calendar_id uuid,
  p_slots jsonb,
  p_replace boolean default false
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
      and s.post_id is not null
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
        and (not p_replace or s.post_id is not null)
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
              and s.status <> 'cancelled' and s.post_id is null
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
          and s.status <> 'cancelled' and s.post_id is null
          and s.source_usage_id is not null
      );

    update public.calendar_slots
    set status = 'cancelled', updated_at = now()
    where calendar_id = p_calendar_id and client_id = p_client_id
      and status <> 'cancelled' and post_id is null;
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

grant execute on function public.commit_calendar_plan(uuid, uuid, jsonb, boolean)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Cancel planned slots (all eligible slots when p_slot_ids is null). Releases
--    their reservations. Slots that already carry a post are never touched.
-- ---------------------------------------------------------------------------

create or replace function public.cancel_calendar_slots(
  p_client_id uuid,
  p_calendar_id uuid,
  p_slot_ids uuid[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cancelled integer := 0;
  v_released integer := 0;
  v_preserved integer := 0;
begin
  perform 1
  from public.content_calendars
  where id = p_calendar_id and client_id = p_client_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select count(*) into v_preserved
  from public.calendar_slots s
  where s.calendar_id = p_calendar_id and s.client_id = p_client_id
    and s.status <> 'cancelled' and s.post_id is not null
    and (p_slot_ids is null or s.id = any (p_slot_ids));

  update public.source_usage su
  set status = 'cancelled', updated_at = now()
  where su.client_id = p_client_id
    and su.status = 'reserved'
    and su.id in (
      select s.source_usage_id from public.calendar_slots s
      where s.calendar_id = p_calendar_id and s.client_id = p_client_id
        and s.status <> 'cancelled' and s.post_id is null
        and s.source_usage_id is not null
        and (p_slot_ids is null or s.id = any (p_slot_ids))
    );
  get diagnostics v_released = row_count;

  update public.calendar_slots s
  set status = 'cancelled', updated_at = now()
  where s.calendar_id = p_calendar_id and s.client_id = p_client_id
    and s.status <> 'cancelled' and s.post_id is null
    and (p_slot_ids is null or s.id = any (p_slot_ids));
  get diagnostics v_cancelled = row_count;

  return jsonb_build_object(
    'ok', true,
    'cancelled', v_cancelled,
    'released', v_released,
    'preserved', v_preserved
  );
end;
$$;

grant execute on function public.cancel_calendar_slots(uuid, uuid, uuid[])
  to authenticated, service_role;
