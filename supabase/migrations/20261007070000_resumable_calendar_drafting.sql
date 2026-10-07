-- P06: bounded, user-triggered drafting. No research scheduling or production data rewrites.
-- Definer functions below are narrow state transitions with explicit current-user
-- capability/password/account gates. Direct API writes cannot forge leases/results.
create table if not exists public.calendar_draft_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  calendar_id uuid not null,
  request_key uuid not null,
  created_by uuid not null references auth.users(id),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  slot_ids uuid[] not null check (cardinality(slot_ids) between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, request_key),
  unique (client_id, id),
  foreign key (client_id, calendar_id) references public.content_calendars(client_id, id)
);
create unique index if not exists calendar_draft_jobs_one_active
  on public.calendar_draft_jobs(calendar_id) where status = 'active';
alter table public.calendar_draft_jobs enable row level security;
revoke all on public.calendar_draft_jobs from anon, authenticated;
grant select on public.calendar_draft_jobs to authenticated;
drop policy if exists "Members read calendar draft jobs" on public.calendar_draft_jobs;
create policy "Members read calendar draft jobs" on public.calendar_draft_jobs for select
  using (public.has_client_access(client_id, array['agency_admin','client_admin','client_user']));

alter table public.calendar_slots drop constraint if exists calendar_slots_status_check;
alter table public.calendar_slots add constraint calendar_slots_status_check
  check (status in ('placeholder','planned','reserved','queued','drafting','drafted','failed','cancelled'));
alter table public.calendar_slots
  add column if not exists content_idea_id uuid references public.content_ideas(id),
  add column if not exists draft_job_id uuid,
  add column if not exists draft_brief jsonb,
  add column if not exists draft_attempts integer not null default 0 check (draft_attempts between 0 and 3),
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists draft_error_code text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'calendar_slots_draft_job_fkey') then
    alter table public.calendar_slots add constraint calendar_slots_draft_job_fkey
      foreign key (client_id, draft_job_id) references public.calendar_draft_jobs(client_id,id);
  end if;
end $$;
create unique index if not exists calendar_slots_backing_idea_key
  on public.calendar_slots(content_idea_id) where content_idea_id is not null;

create or replace function private.calendar_draft_allowed(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (select 1 from public.clients c where c.id = p_client_id and c.deleted_at is null)
    and exists (select 1 from public.profiles p where p.id = auth.uid()
      and p.active and not p.must_change_password)
    and (public.has_client_access(p_client_id, array['agency_admin','client_admin'])
      or (private.has_client_permission(p_client_id,'ideas_manage')
        and private.has_client_permission(p_client_id,'posts_draft')));
$$;
revoke all on function private.calendar_draft_allowed(uuid) from public, anon;
grant execute on function private.calendar_draft_allowed(uuid) to authenticated;

-- Existing planner RLS remains for planning. Only the gated functions may change
-- drafting metadata or a queued/running slot. No client-settable bypass flag.
create or replace function private.guard_calendar_draft_slot()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      if new.content_idea_id is not null or new.draft_job_id is not null
        or new.draft_attempts <> 0 or new.lease_token is not null or new.draft_brief is not null
        or new.status in ('queued','drafting','drafted','failed') then
        raise exception 'Draft state is managed by the drafting service' using errcode = '42501';
      end if;
    elsif old.status in ('queued','drafting') or
      row(new.content_idea_id,new.draft_job_id,new.draft_brief,new.draft_attempts,new.lease_token,new.lease_expires_at,new.draft_error_code)
      is distinct from row(old.content_idea_id,old.draft_job_id,old.draft_brief,old.draft_attempts,old.lease_token,old.lease_expires_at,old.draft_error_code)
      or (new.status is distinct from old.status and new.status in ('queued','drafting','drafted','failed'))
      or (old.content_idea_id is not null and row(new.source_id,new.source_type,new.post_id,new.bucket,new.client_id,new.calendar_id)
        is distinct from row(old.source_id,old.source_type,old.post_id,old.bucket,old.client_id,old.calendar_id)) then
      raise exception 'Draft state is managed by the drafting service' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_calendar_draft_slot on public.calendar_slots;
create trigger guard_calendar_draft_slot before insert or update on public.calendar_slots
  for each row execute function private.guard_calendar_draft_slot();

create or replace function private.guard_calendar_backing_post()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') and exists (
    select 1 from public.calendar_slots s where s.content_idea_id = new.content_idea_id
  ) then
    raise exception 'Use the calendar drafting service' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_calendar_backing_post on public.posts;
create trigger guard_calendar_backing_post before insert on public.posts
  for each row execute function private.guard_calendar_backing_post();

create or replace function public.start_calendar_draft_job(
  p_client_id uuid, p_calendar_id uuid, p_request_key uuid, p_slots jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.calendar_draft_jobs%rowtype;
  s public.calendar_slots%rowtype;
  item jsonb;
  ids uuid[] := '{}';
  slot_id uuid;
  job_id uuid;
  brief jsonb;
begin
  if not private.calendar_draft_allowed(p_client_id) then
    return jsonb_build_object('ok',false,'code','FORBIDDEN');
  end if;
  perform 1 from public.content_calendars where id=p_calendar_id and client_id=p_client_id for update;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  select * into j from public.calendar_draft_jobs where client_id=p_client_id and request_key=p_request_key;
  if found then
    if j.calendar_id<>p_calendar_id or j.created_by<>auth.uid() then
      return jsonb_build_object('ok',false,'code','CONFLICT');
    end if;
    return jsonb_build_object('ok',true,'job_id',j.id,'status',j.status);
  end if;
  select * into j from public.calendar_draft_jobs where calendar_id=p_calendar_id and status='active';
  if found then return jsonb_build_object('ok',false,'code','BATCH_ACTIVE','job_id',j.id); end if;
  if p_request_key is null or p_slots is null or jsonb_typeof(p_slots)<>'array'
    or jsonb_array_length(p_slots) not between 1 and 10 then
    return jsonb_build_object('ok',false,'code','VALIDATION_ERROR');
  end if;
  for item in select * from jsonb_array_elements(p_slots) loop
    begin slot_id := (item->>'slot_id')::uuid;
    exception when invalid_text_representation then return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end;
    brief := item->'brief';
    if slot_id is null or slot_id=any(ids) or brief is null or jsonb_typeof(brief)<>'object'
      or length(trim(coalesce(brief->>'topic',''))) not between 3 and 500
      or coalesce(brief->>'postType','') not in ('framework','case_study','contrarian_take','how_to','teardown','listicle','story','lead_magnet_offer')
      or coalesce(brief->>'funnelStage','') not in ('Discovery','Depth','Authority','Commercial')
      or length(coalesce(brief->>'contentPillar',''))>500
      or length(coalesce(brief->>'intendedReader',''))>500
      or length(coalesce(brief->>'primaryTakeaway',''))>700 then
      return jsonb_build_object('ok',false,'code','VALIDATION_ERROR');
    end if;
    select * into s from public.calendar_slots where id=slot_id and client_id=p_client_id
      and calendar_id=p_calendar_id for update;
    if not found or s.post_id is not null or s.status not in ('planned','reserved','failed') then
      return jsonb_build_object('ok',false,'code','SLOT_NOT_AVAILABLE');
    end if;
    if s.draft_attempts>=3 then return jsonb_build_object('ok',false,'code','ATTEMPTS_EXHAUSTED'); end if;
    if s.content_idea_id is not null and s.draft_brief is distinct from brief then
      return jsonb_build_object('ok',false,'code','BRIEF_LOCKED');
    end if;
    if s.source_id is not null and not exists (select 1 from public.source_usage u
      where u.id=s.source_usage_id and u.client_id=p_client_id and u.source_id=s.source_id
        and u.source_type=s.source_type and u.status='reserved') then
      return jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE');
    end if;
    ids := array_append(ids,slot_id);
  end loop;
  insert into public.calendar_draft_jobs(client_id,calendar_id,request_key,created_by,slot_ids)
    values(p_client_id,p_calendar_id,p_request_key,auth.uid(),ids) returning id into job_id;
  for item in select * from jsonb_array_elements(p_slots) loop
    update public.calendar_slots set status='queued', draft_job_id=job_id,
      draft_brief=item->'brief', draft_error_code=null
      where id=(item->>'slot_id')::uuid and client_id=p_client_id;
  end loop;
  return jsonb_build_object('ok',true,'job_id',job_id,'status','active');
end $$;

create or replace function public.claim_calendar_draft_slot(p_client_id uuid,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.calendar_draft_jobs%rowtype;
  s public.calendar_slots%rowtype;
  idea_id uuid;
  token uuid;
  mode text;
begin
  if not private.calendar_draft_allowed(p_client_id) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  select * into j from public.calendar_draft_jobs where id=p_job_id and client_id=p_client_id;
  if not found or j.created_by<>auth.uid() then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  perform 1 from public.content_calendars where id=j.calendar_id and client_id=p_client_id for update;
  select * into j from public.calendar_draft_jobs where id=p_job_id for update;
  if j.status<>'active' then return jsonb_build_object('ok',true,'done',true); end if;
  if exists (select 1 from public.calendar_slots where draft_job_id=p_job_id
    and status='drafting' and lease_expires_at>now()) then
    return jsonb_build_object('ok',true,'busy',true);
  end if;
  update public.calendar_slots set status='failed',lease_token=null,lease_expires_at=null,
    draft_error_code='ATTEMPTS_EXHAUSTED' where draft_job_id=p_job_id and status='drafting'
      and lease_expires_at<=now() and draft_attempts>=3;
  select * into s from public.calendar_slots where client_id=p_client_id and draft_job_id=p_job_id
    and post_id is null and draft_attempts<3 and
      (status='queued' or (status='drafting' and lease_expires_at<=now()))
    order by slot_index for update skip locked limit 1;
  if not found then
    update public.calendar_draft_jobs set status='completed',updated_at=now() where id=p_job_id;
    return jsonb_build_object('ok',true,'done',true);
  end if;
  idea_id:=s.content_idea_id;
  if idea_id is null then
    mode:=coalesce(s.source_type,'profile_led');
    insert into public.content_ideas(client_id,source_type,source_ids_json,angle,content_pillar,
      allocation_bucket,post_type,funnel_stage,intended_reader,primary_takeaway,strategy_overrides,status)
    values(p_client_id,mode,case when s.source_id is null then '[]'::jsonb else jsonb_build_array(s.source_id) end,
      s.draft_brief->>'topic',nullif(s.draft_brief->>'contentPillar',''),s.bucket,
      s.draft_brief->>'postType',s.draft_brief->>'funnelStage',nullif(s.draft_brief->>'intendedReader',''),
      nullif(s.draft_brief->>'primaryTakeaway',''),
      jsonb_strip_nulls(jsonb_build_object(
        'postType',s.draft_brief->>'postType','funnelStage',s.draft_brief->>'funnelStage',
        'contentPillar',nullif(s.draft_brief->>'contentPillar',''),
        'intendedReader',nullif(s.draft_brief->>'intendedReader',''),
        'primaryTakeaway',nullif(s.draft_brief->>'primaryTakeaway',''))), 'ready') returning id into idea_id;
    if s.source_usage_id is not null then update public.source_usage set content_idea_id=idea_id
      where id=s.source_usage_id and client_id=p_client_id and status='reserved'; end if;
  end if;
  token:=gen_random_uuid();
  update public.calendar_slots set status='drafting',content_idea_id=idea_id,
    draft_attempts=draft_attempts+1,lease_token=token,lease_expires_at=now()+interval '15 minutes',
    draft_error_code=null where id=s.id;
  return jsonb_build_object('ok',true,'slot_id',s.id,'idea_id',idea_id,'lease_token',token);
end $$;

create or replace function public.renew_calendar_draft_lease(p_client_id uuid,p_job_id uuid,p_slot_id uuid,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.calendar_draft_allowed(p_client_id) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  update public.calendar_slots s set lease_expires_at=now()+interval '15 minutes'
    where s.id=p_slot_id and s.client_id=p_client_id and s.draft_job_id=p_job_id
      and s.status='drafting' and s.lease_token=p_lease_token and s.lease_expires_at>now()
      and exists (select 1 from public.calendar_draft_jobs j where j.id=p_job_id
        and j.client_id=p_client_id and j.status='active' and j.created_by=auth.uid());
  return jsonb_build_object('ok',found,'code',case when found then null else 'LEASE_LOST' end);
end $$;

create or replace function public.finish_calendar_draft_slot(
  p_client_id uuid,p_job_id uuid,p_slot_id uuid,p_lease_token uuid,p_values jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  j public.calendar_draft_jobs%rowtype;
  s public.calendar_slots%rowtype;
  v_post_id uuid;
begin
  if not private.calendar_draft_allowed(p_client_id) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  select * into j from public.calendar_draft_jobs where id=p_job_id and client_id=p_client_id;
  if not found or j.created_by<>auth.uid() then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  perform 1 from public.content_calendars where id=j.calendar_id for update;
  select * into j from public.calendar_draft_jobs where id=p_job_id for update;
  select * into s from public.calendar_slots where id=p_slot_id and client_id=p_client_id
    and draft_job_id=p_job_id for update;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  if s.status='drafted' and s.lease_token=p_lease_token then
    return jsonb_build_object('ok',true,'post_id',s.post_id,'already_generated',true);
  end if;
  if j.status<>'active' or s.status<>'drafting' or s.lease_token is distinct from p_lease_token
    or s.lease_expires_at<=now() then return jsonb_build_object('ok',false,'code','LEASE_LOST'); end if;
  if p_values is null or length(trim(coalesce(p_values->>'finalPost',''))) not between 1 and 15000 then
    return jsonb_build_object('ok',false,'code','VALIDATION_ERROR');
  end if;
  perform 1 from public.content_ideas i where i.id=s.content_idea_id and i.client_id=p_client_id
    and i.deleted_at is null and i.status in ('ready','used')
    and i.source_type=coalesce(s.source_type,'profile_led')
    and i.source_ids_json=case when s.source_id is null then '[]'::jsonb else jsonb_build_array(s.source_id) end
    and i.angle=s.draft_brief->>'topic';
  if not found then return jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE'); end if;
  if s.source_id is not null then
    if (s.source_type='founder_experience' and not exists (
      select 1 from public.founder_experiences where id=s.source_id and client_id=p_client_id
        and deleted_at is null and readiness='ready')) or
      (s.source_type='content_resource' and not exists (
      select 1 from public.content_resources where id=s.source_id and client_id=p_client_id
        and deleted_at is null and active and readiness='ready')) then
      return jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE');
    end if;
    perform 1 from public.source_usage where id=s.source_usage_id and client_id=p_client_id
      and source_id=s.source_id and source_type=s.source_type and status='reserved' for update;
    if not found then return jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE'); end if;
  end if;
  insert into public.posts(client_id,content_idea_id,final_post,buyer_belief_shift,proof_notes,
    risk_notes,cta_intent,qa_result,format_recommendation,source_context_used,
    allocation_bucket,post_type,funnel_stage,intended_reader,primary_takeaway,content_pillar,
    draft_version,approved_draft_version,status)
  values(p_client_id,s.content_idea_id,p_values->>'finalPost',p_values->>'buyerBeliefShift',
    p_values->>'proofNotes',p_values->>'riskNotes',p_values->>'ctaIntent',p_values->'qaResult',
    p_values->'formatRecommendation',p_values->'sourceContextUsed',s.bucket,
    s.draft_brief->>'postType',s.draft_brief->>'funnelStage',s.draft_brief->>'intendedReader',
    s.draft_brief->>'primaryTakeaway',s.draft_brief->>'contentPillar',1,null,'review')
  returning id into v_post_id;
  update public.source_usage set status='used',post_id=v_post_id,content_idea_id=s.content_idea_id,updated_at=now()
    where id=s.source_usage_id and client_id=p_client_id and status='reserved';
  update public.content_ideas set status='used' where id=s.content_idea_id and client_id=p_client_id;
  update public.calendar_slots set status='drafted',post_id=v_post_id,lease_expires_at=null,
    draft_error_code=null where id=s.id;
  if not exists (select 1 from public.calendar_slots where draft_job_id=p_job_id and status in ('queued','drafting')) then
    update public.calendar_draft_jobs set status='completed',updated_at=now() where id=p_job_id;
  end if;
  return jsonb_build_object('ok',true,'post_id',v_post_id);
end $$;

create or replace function public.fail_calendar_draft_slot(
  p_client_id uuid,p_job_id uuid,p_slot_id uuid,p_lease_token uuid,p_error_code text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.calendar_draft_jobs%rowtype;
begin
  if not private.calendar_draft_allowed(p_client_id) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  select * into j from public.calendar_draft_jobs where id=p_job_id and client_id=p_client_id;
  if not found or j.created_by<>auth.uid() then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  perform 1 from public.content_calendars where id=j.calendar_id for update;
  update public.calendar_slots set status='failed',lease_token=null,lease_expires_at=null,
    draft_error_code=case when p_error_code in ('NOT_CONFIGURED','SOURCE_UNAVAILABLE','ATTEMPTS_EXHAUSTED') then p_error_code else 'GENERATION_FAILED' end
    where id=p_slot_id and client_id=p_client_id and draft_job_id=p_job_id and status='drafting'
      and lease_token=p_lease_token and lease_expires_at>now() and j.status='active';
  if not found then return jsonb_build_object('ok',false,'code','LEASE_LOST'); end if;
  if not exists (select 1 from public.calendar_slots where draft_job_id=p_job_id and status in ('queued','drafting')) then
    update public.calendar_draft_jobs set status='completed',updated_at=now() where id=p_job_id;
  end if;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.cancel_calendar_draft_job(p_client_id uuid,p_job_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.calendar_draft_jobs%rowtype;
begin
  if not private.calendar_draft_allowed(p_client_id) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  select * into j from public.calendar_draft_jobs where id=p_job_id and client_id=p_client_id;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  if j.created_by<>auth.uid() and not public.has_client_access(p_client_id,array['agency_admin','client_admin']) then
    return jsonb_build_object('ok',false,'code','FORBIDDEN');
  end if;
  perform 1 from public.content_calendars where id=j.calendar_id for update;
  update public.calendar_draft_jobs set status='cancelled',updated_at=now() where id=p_job_id;
  update public.source_usage set status='cancelled',updated_at=now() where client_id=p_client_id
    and status='reserved' and id in (select source_usage_id from public.calendar_slots
      where draft_job_id=p_job_id and post_id is null and status in ('queued','drafting','failed'));
  update public.calendar_slots set status='cancelled',lease_token=null,lease_expires_at=null
    where draft_job_id=p_job_id and client_id=p_client_id and post_id is null and status in ('queued','drafting','failed');
  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.start_calendar_draft_job(uuid,uuid,uuid,jsonb) from public,anon;
revoke all on function public.claim_calendar_draft_slot(uuid,uuid) from public,anon;
revoke all on function public.renew_calendar_draft_lease(uuid,uuid,uuid,uuid) from public,anon;
revoke all on function public.finish_calendar_draft_slot(uuid,uuid,uuid,uuid,jsonb) from public,anon;
revoke all on function public.fail_calendar_draft_slot(uuid,uuid,uuid,uuid,text) from public,anon;
revoke all on function public.cancel_calendar_draft_job(uuid,uuid) from public,anon;
grant execute on function public.start_calendar_draft_job(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.claim_calendar_draft_slot(uuid,uuid) to authenticated;
grant execute on function public.renew_calendar_draft_lease(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.finish_calendar_draft_slot(uuid,uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.fail_calendar_draft_slot(uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.cancel_calendar_draft_job(uuid,uuid) to authenticated;

-- Preserve queued and leased slots during P05 replanning/cancellation.
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
    and s.status <> 'cancelled' and (s.post_id is not null or s.status in ('queued','drafting'))
    and (p_slot_ids is null or s.id = any (p_slot_ids));

  update public.source_usage su
  set status = 'cancelled', updated_at = now()
  where su.client_id = p_client_id
    and su.status = 'reserved'
    and su.id in (
      select s.source_usage_id from public.calendar_slots s
      where s.calendar_id = p_calendar_id and s.client_id = p_client_id
        and s.status <> 'cancelled' and s.post_id is null and s.status not in ('queued','drafting')
        and s.source_usage_id is not null
        and (p_slot_ids is null or s.id = any (p_slot_ids))
    );
  get diagnostics v_released = row_count;

  update public.calendar_slots s
  set status = 'cancelled', updated_at = now()
  where s.calendar_id = p_calendar_id and s.client_id = p_client_id
    and s.status <> 'cancelled' and s.post_id is null and s.status not in ('queued','drafting')
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
