-- P08: additive, initially disabled research automation. No legacy data removed.
create table if not exists public.research_schedules (
  client_id uuid primary key references public.clients(id),
  version integer not null default 0,
  enabled boolean not null default false,
  timezone text not null default 'Asia/Karachi',
  local_time time not null default '09:00',
  configured_by uuid references auth.users(id),
  next_due_at timestamptz, last_due_at timestamptz, last_briefing_id uuid,
  updated_at timestamptz not null default now(),
  foreign key(client_id,last_briefing_id) references public.research_briefings(client_id,id)
);
create table if not exists public.research_occurrences (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.research_schedules(client_id),
  schedule_version integer not null, local_day date not null, due_at timestamptz not null,
  state text not null default 'queued' check(state in ('queued','running','finished','cancelled')),
  attempts integer not null default 0 check(attempts between 0 and 3),
  lease_token uuid, lease_until timestamptz, retry_at timestamptz,
  run_id uuid references public.research_runs(id), briefing_id uuid,
  actor uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(client_id,local_day), unique(client_id,id),
  foreign key(client_id,briefing_id) references public.research_briefings(client_id,id)
);
create table if not exists public.research_sources (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
  url text not null check(length(url) between 8 and 2048),
  kind text not null check(kind in ('article','blog')), enabled boolean not null default true,
  configured_by uuid not null references auth.users(id), checked_at timestamptz, error_code text,
  deleted_at timestamptz, created_at timestamptz not null default now(),
  unique(client_id,id), unique(client_id,url)
);
create table if not exists public.research_source_versions (
  id uuid primary key default gen_random_uuid(), client_id uuid not null, source_id uuid not null,
  url text not null, title text not null, original text not null check(octet_length(original)<=512000),
  content text not null check(length(content) between 1 and 40000),
  content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  change_kind text not null check(change_kind in ('new','updated')),
  fetched_at timestamptz not null, created_at timestamptz not null default now(),
  unique(source_id,url,fetched_at), unique(client_id,id),
  foreign key(client_id,source_id) references public.research_sources(client_id,id)
);
create table if not exists public.research_notifications (
  id uuid primary key default gen_random_uuid(), client_id uuid not null, briefing_id uuid not null,
  kind text not null check(kind in ('ready','partial','failure')), created_at timestamptz not null default now(),
  unique(briefing_id), foreign key(client_id,briefing_id) references public.research_briefings(client_id,id)
);
alter table public.research_run_inputs add column if not exists source_snapshot jsonb;
create index if not exists research_schedule_due on public.research_schedules(next_due_at) where enabled;
create index if not exists research_occurrence_pending on public.research_occurrences(client_id,state);
create index if not exists research_source_recent on public.research_source_versions(client_id,created_at desc);
create index if not exists research_source_parent on public.research_source_versions(source_id);
create index if not exists research_notifications_recent on public.research_notifications(client_id,created_at desc);

alter table public.research_schedules enable row level security;
alter table public.research_occurrences enable row level security;
alter table public.research_sources enable row level security;
alter table public.research_source_versions enable row level security;
alter table public.research_notifications enable row level security;
revoke all on public.research_schedules,public.research_occurrences,public.research_sources,
  public.research_source_versions,public.research_notifications from public,anon,authenticated;
grant select on public.research_schedules,public.research_occurrences,public.research_sources,
  public.research_source_versions,public.research_notifications to authenticated;
grant all on public.research_schedules,public.research_occurrences,public.research_sources,
  public.research_source_versions,public.research_notifications to service_role;
drop policy if exists "Schedule admin read" on public.research_schedules;
create policy "Schedule admin read" on public.research_schedules for select to authenticated using(private.research_allowed(client_id,true));
drop policy if exists "Occurrence admin read" on public.research_occurrences;
create policy "Occurrence admin read" on public.research_occurrences for select to authenticated using(private.research_allowed(client_id,true));
drop policy if exists "Source admin read" on public.research_sources;
create policy "Source admin read" on public.research_sources for select to authenticated using(private.research_allowed(client_id,true));
drop policy if exists "Source original admin read" on public.research_source_versions;
create policy "Source original admin read" on public.research_source_versions for select to authenticated using(private.research_allowed(client_id,true));
drop policy if exists "Notification workspace read" on public.research_notifications;
create policy "Notification workspace read" on public.research_notifications for select to authenticated using(private.research_allowed(client_id));

-- Internal helpers are not Data API endpoints. Explicit actor checks also protect
-- service-only jobs after access is revoked or a temporary password is assigned.
create or replace function private.research_actor_allowed(p_client uuid,p_actor uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor is not null
  and exists(select 1 from public.clients where id=p_client and deleted_at is null)
  and exists(select 1 from public.profiles where id=p_actor and active and not must_change_password)
  and (exists(select 1 from public.client_access where client_id=p_client and user_id=p_actor and role='client_admin' and invitation_status='accepted')
    or exists(select 1 from public.agency_members a join public.clients c on c.agency_id=a.agency_id
      where c.id=p_client and a.user_id=p_actor and a.role='agency_admin' and a.invitation_status='accepted'));
$$;
-- Earliest real UTC minute on the local day at/after the selected wall time:
-- a skipped time advances to the first valid minute; a repeated time runs once.
create or replace function private.research_day_due(p_day date,p_zone text,p_time time)
returns timestamptz language sql stable set search_path='' as $$
 select min(t) from generate_series((p_day::timestamp at time zone 'UTC')-interval '18 hours',
  (p_day::timestamp at time zone 'UTC')+interval '42 hours',interval '1 minute') t
 where (t at time zone p_zone)::date=p_day and (t at time zone p_zone)::time>=p_time;
$$;
create or replace function private.research_next_due(p_now timestamptz,p_zone text,p_time time)
returns timestamptz language plpgsql stable set search_path='' as $$
declare d date:=(p_now at time zone p_zone)::date; due timestamptz;
begin
 for i in 0..3 loop
  due:=private.research_day_due(d+i,p_zone,p_time);
  if due>p_now then return due; end if;
 end loop;
 raise exception 'Invalid schedule';
end $$;
revoke all on function private.research_actor_allowed(uuid,uuid),private.research_day_due(date,text,time),
  private.research_next_due(timestamptz,text,time) from public,anon,authenticated,service_role;

create or replace function public.save_research_schedule(p_client_id uuid,p_version integer,p_enabled boolean,p_timezone text,p_time text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.research_schedules; next_due timestamptz;
begin
 if not private.research_allowed(p_client_id,true) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 if p_version is null or p_enabled is null or p_timezone is null or not exists(select 1 from pg_timezone_names where name=p_timezone)
  or p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or not exists(select 1 from public.research_settings where client_id=p_client_id and revision>0) then
  return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
 insert into public.research_schedules(client_id) values(p_client_id) on conflict do nothing;
 select * into s from public.research_schedules where client_id=p_client_id for update;
 if s.version<>p_version then return jsonb_build_object('ok',false,'code','REVISION_CHANGED'); end if;
 -- Pausing/editing invalidates in-flight leases; they cannot commit afterward.
 update public.research_runs set status='cancelled',finished_at=now() where client_id=p_client_id and status='running'
  and id in(select run_id from public.research_occurrences where client_id=p_client_id and state in ('running','queued'));
 update public.research_briefings set outcome='failed',error_code='SCHEDULE_CHANGED',finished_at=now() where client_id=p_client_id and outcome='running'
  and id in(select briefing_id from public.research_occurrences where client_id=p_client_id and state in ('running','queued'));
 update public.research_occurrences set state='cancelled',lease_token=null,lease_until=null where client_id=p_client_id and state in ('running','queued');
 next_due:=case when p_enabled then private.research_next_due(now(),p_timezone,p_time::time) else null end;
 update public.research_schedules set version=version+1,enabled=p_enabled,timezone=p_timezone,local_time=p_time::time,
  configured_by=auth.uid(),next_due_at=next_due,updated_at=now() where client_id=p_client_id;
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata)
  values(p_client_id,auth.uid(),'research_schedule_saved','client',p_client_id,jsonb_build_object('enabled',p_enabled,'version',s.version+1));
 return jsonb_build_object('ok',true,'version',s.version+1);
end $$;

create or replace function public.manage_research_source(p_client_id uuid,p_url text,p_kind text,p_source_id uuid default null,p_enabled boolean default true,p_archived boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not private.research_allowed(p_client_id,true) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 if p_url is null or p_url !~ '^https?://' or length(p_url)>2048 or p_kind is null or p_kind not in ('article','blog') or p_enabled is null or p_archived is null then
  return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
 -- Account row serializes source capacity checks and concurrent source creation.
 perform 1 from public.clients where id=p_client_id for update;
 if p_source_id is not null then
  update public.research_sources set enabled=p_enabled and not p_archived,deleted_at=case when p_archived then now() else null end,configured_by=auth.uid() where id=p_source_id and client_id=p_client_id and deleted_at is null returning id into sid;
 else
  select id into sid from public.research_sources where client_id=p_client_id and url=p_url and deleted_at is null;
  if sid is null then
   if (select count(*) from public.research_sources where client_id=p_client_id and deleted_at is null)>=4 then return jsonb_build_object('ok',false,'code','SOURCE_LIMIT'); end if;
   insert into public.research_sources(client_id,url,kind,configured_by) values(p_client_id,p_url,p_kind,auth.uid())
    on conflict(client_id,url) do update set deleted_at=null,enabled=true,configured_by=auth.uid(),kind=excluded.kind returning id into sid;
  else
   update public.research_sources set configured_by=auth.uid(),kind=p_kind,enabled=p_enabled where id=sid and client_id=p_client_id;
  end if;
 end if;
 if sid is null then return jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE'); end if;
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata)
  values(p_client_id,auth.uid(),'research_source_saved','research_source',sid,jsonb_build_object('enabled',p_enabled));
 return jsonb_build_object('ok',true,'id',sid);
end $$;

-- Select latest actual revisions without a PostgREST row cap hiding older
-- sources. One current URL per active source first; remaining coverage is
-- counted explicitly. Store the exact selected input in a protected snapshot.
create or replace function public.load_research_source_context(p_client_id uuid,p_actor uuid,p_briefing_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb; total integer;
begin
 if not private.research_actor_allowed(p_client_id,p_actor) or not exists(
  select 1 from public.research_briefings b join public.research_runs r on r.id=b.run_id
  where b.client_id=p_client_id and b.id=p_briefing_id and b.created_by=p_actor and b.outcome='running' and r.status='running') then
  return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 with latest as (select distinct on(v.source_id,v.url) v.* from public.research_source_versions v
  join public.research_sources s on s.client_id=v.client_id and s.id=v.source_id
  where v.client_id=p_client_id and s.enabled and s.deleted_at is null order by v.source_id,v.url,v.created_at desc,v.id desc),
 ranked as(select *,row_number() over(partition by source_id order by created_at desc,id desc) as position from latest),
 selected as(select * from ranked order by position,created_at desc,id desc limit 4)
 select (select count(*) from latest),coalesce(jsonb_agg(jsonb_build_object('id',id,'url',url,'title',title,'text',content,'contentHash',content_hash,'fetchedAt',fetched_at)),'[]') into total,items from selected;
 update public.research_run_inputs set source_snapshot=items where client_id=p_client_id and briefing_id=p_briefing_id;
 return jsonb_build_object('ok',true,'sources',items,'omitted',greatest(0,total-4));
end $$;

create or replace function public.claim_scheduled_research(p_client_id uuid,p_budget jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.research_schedules; o public.research_occurrences; v public.research_prompt_versions;
 run uuid; bid uuid; token uuid:=gen_random_uuid(); profile jsonb; day date;
begin
 select * into s from public.research_schedules where client_id=p_client_id for update skip locked;
 if not found or not s.enabled or s.next_due_at>now() or s.next_due_at is null then return jsonb_build_object('ok',false,'code','NOT_DUE'); end if;
 if not private.research_actor_allowed(p_client_id,s.configured_by) then
  update public.research_runs set status='cancelled',finished_at=now() where client_id=p_client_id and status='running'
   and id in(select run_id from public.research_occurrences where client_id=p_client_id and state in ('running','queued'));
  update public.research_briefings set outcome='failed',error_code='ACCESS_CHANGED',finished_at=now() where client_id=p_client_id and outcome='running'
   and id in(select briefing_id from public.research_occurrences where client_id=p_client_id and state in ('running','queued'));
  update public.research_occurrences set state='cancelled',lease_token=null,lease_until=null where client_id=p_client_id and state in ('running','queued');
  update public.research_schedules set enabled=false,next_due_at=null where client_id=p_client_id;
  return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 select * into o from public.research_occurrences where client_id=p_client_id and schedule_version=s.version and state in ('queued','running') order by created_at desc limit 1 for update;
 if found then
  if o.state='running' and o.lease_until>now() or o.retry_at>now() then return jsonb_build_object('ok',false,'code','LOCKED'); end if;
  update public.research_runs set status='failed',finished_at=now(),error_message='Scheduled research lease expired.' where id=o.run_id and client_id=p_client_id and status='running';
  update public.research_briefings set outcome='failed',error_code='LEASE_EXPIRED',finished_at=now() where id=o.briefing_id and client_id=p_client_id and outcome='running';
  if o.attempts>=3 then
   update public.research_occurrences set state='finished',lease_token=null,lease_until=null where id=o.id;
   update public.research_schedules set next_due_at=private.research_next_due(greatest(now(),private.research_day_due(o.local_day,timezone,local_time)),timezone,local_time),last_due_at=o.due_at,last_briefing_id=o.briefing_id where client_id=p_client_id;
   if o.briefing_id is not null then insert into public.research_notifications(client_id,briefing_id,kind) values(p_client_id,o.briefing_id,'failure') on conflict do nothing; end if;
   return jsonb_build_object('ok',false,'code','RETRY_EXHAUSTED');
  end if;
 else
  day:=(now() at time zone s.timezone)::date;
  if exists(select 1 from public.research_occurrences where client_id=p_client_id and local_day=day) then
   update public.research_schedules set next_due_at=private.research_next_due(greatest(now(),private.research_day_due(day,timezone,local_time)),timezone,local_time) where client_id=p_client_id;
   return jsonb_build_object('ok',false,'code','ALREADY_RAN'); end if;
 end if;
 update public.research_runs set status='failed',finished_at=now(),error_message='Research run timed out before completion.'
  where client_id=p_client_id and lock_key='rss_collect' and status='running' and started_at<now()-interval '2 hours';
 if exists(select 1 from public.research_runs where client_id=p_client_id and lock_key='rss_collect' and status='running') then return jsonb_build_object('ok',false,'code','LOCKED'); end if;
 select pv.* into v from public.research_settings rs join public.research_prompt_versions pv using(client_id,revision) where rs.client_id=p_client_id;
 if not found then return jsonb_build_object('ok',false,'code','SETTINGS_UNAVAILABLE'); end if;
 insert into public.research_runs(client_id,triggered_by_user_id,trigger_type,status,stage,lock_key,started_at)
  values(p_client_id,s.configured_by,'worker','running','web_research','rss_collect',now()) returning id into run;
 insert into public.research_briefings(client_id,run_id,request_key,created_by,revision)
  values(p_client_id,run,gen_random_uuid(),s.configured_by,v.revision) returning id into bid;
 if v.use_profile_context then select to_jsonb(c)-array['agency_id','deleted_at','created_at','updated_at'] into profile from public.clients c where id=p_client_id; end if;
 insert into public.research_run_inputs(client_id,briefing_id,profile_snapshot,budget) values(p_client_id,bid,profile,p_budget);
 if o.id is null then
  insert into public.research_occurrences(client_id,schedule_version,local_day,due_at,actor) values(p_client_id,s.version,day,s.next_due_at,s.configured_by) returning * into o;
 end if;
 update public.research_occurrences set state='running',attempts=attempts+1,lease_token=token,lease_until=now()+interval '15 minutes',retry_at=null,run_id=run,briefing_id=bid where id=o.id;
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata)
  values(p_client_id,s.configured_by,'scheduled_research_started','research_briefing',bid,jsonb_build_object('occurrence_id',o.id,'attempt',o.attempts+1,'revision',v.revision));
 return jsonb_build_object('ok',true,'occurrenceId',o.id,'token',token,'briefingId',bid,'runId',run,'actor',s.configured_by,
  'settings',jsonb_build_object('revision',v.revision,'prompt',v.prompt,'lookbackDays',v.lookback_days,'useProfileContext',v.use_profile_context),'profile',profile);
exception when unique_violation then return jsonb_build_object('ok',false,'code','LOCKED');
end $$;

create or replace function public.renew_scheduled_research(p_client_id uuid,p_occurrence_id uuid,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.research_schedules;
begin
 select * into s from public.research_schedules where client_id=p_client_id for share;
 if not found or not s.enabled then return jsonb_build_object('ok',false,'code','LEASE_CHANGED'); end if;
 update public.research_occurrences set lease_until=now()+interval '15 minutes'
  where client_id=p_client_id and id=p_occurrence_id and schedule_version=s.version and state='running'
   and lease_token=p_token and lease_until>now() and private.research_actor_allowed(client_id,actor);
 if not found then return jsonb_build_object('ok',false,'code','LEASE_CHANGED'); end if;
 return jsonb_build_object('ok',true);
end $$;

create or replace function public.record_research_source(p_client_id uuid,p_source_id uuid,p_actor uuid,p_pages jsonb,p_error text,
 p_occurrence_id uuid default null,p_token uuid default null,p_run_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare page jsonb; changed integer:=0; kind text;
begin
 if not private.research_actor_allowed(p_client_id,p_actor) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 if p_occurrence_id is not null then
  perform 1 from public.research_schedules s join public.research_occurrences o using(client_id)
   where s.client_id=p_client_id and s.enabled and o.id=p_occurrence_id and o.actor=p_actor and o.schedule_version=s.version
    and o.state='running' and o.lease_token=p_token and o.lease_until>now() for share of s,o;
  if not found then return jsonb_build_object('ok',false,'code','LEASE_CHANGED'); end if;
 else
  if not exists(select 1 from public.research_runs where id=p_run_id and client_id=p_client_id and triggered_by_user_id=p_actor and status='running' and lock_key='rss_collect') then return jsonb_build_object('ok',false,'code','RUN_UNAVAILABLE'); end if;
 end if;
 perform 1 from public.research_sources where client_id=p_client_id and id=p_source_id and enabled and deleted_at is null
  and private.research_actor_allowed(client_id,configured_by) for update;
 if not found then return jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE'); end if;
 if p_pages is null or jsonb_typeof(p_pages)<>'array' or jsonb_array_length(p_pages)>3 or p_error is not null and p_error not in ('SOURCE_BLOCKED','SOURCE_TOO_LARGE','SOURCE_UNAVAILABLE') then return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
 for page in select value from jsonb_array_elements(p_pages) loop
  if (select content_hash from public.research_source_versions where source_id=p_source_id and url=page->>'url' order by created_at desc,id desc limit 1) = page->>'contentHash' then continue; end if;
  kind:=case when exists(select 1 from public.research_source_versions where source_id=p_source_id and url=page->>'url') then 'updated' else 'new' end;
  insert into public.research_source_versions(client_id,source_id,url,title,original,content,content_hash,change_kind,fetched_at)
   values(p_client_id,p_source_id,page->>'url',page->>'title',page->>'original',page->>'text',page->>'contentHash',kind,(page->>'fetchedAt')::timestamptz) on conflict do nothing;
  if found then changed:=changed+1; end if;
 end loop;
 update public.research_sources set checked_at=now(),error_code=p_error where id=p_source_id and client_id=p_client_id;
 return jsonb_build_object('ok',true,'changed',changed);
end $$;

create or replace function public.finish_scheduled_research(p_client_id uuid,p_occurrence_id uuid,p_token uuid,p_result jsonb,p_sources jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.research_schedules; o public.research_occurrences; result jsonb; retry boolean;
begin
 select * into s from public.research_schedules where client_id=p_client_id for update;
 select * into o from public.research_occurrences where id=p_occurrence_id and client_id=p_client_id for update;
 if o.id is null or not s.enabled or o.schedule_version<>s.version or o.state<>'running' or o.lease_token is distinct from p_token or o.lease_until<=now()
  or not private.research_actor_allowed(p_client_id,o.actor) then return jsonb_build_object('ok',false,'code','LEASE_CHANGED'); end if;
 result:=public.finish_web_research(p_client_id,o.briefing_id,o.actor,p_result);
 if not coalesce((result->>'ok')::boolean,false) then return result; end if;
 update public.research_run_inputs set source_snapshot=p_sources where client_id=p_client_id and briefing_id=o.briefing_id;
 retry:=p_result->>'outcome'='failed' and o.attempts<3 and coalesce(p_result->>'errorCode','') not in ('INPUT_TOO_LARGE','PROVIDER_AUTH_FAILED');
 update public.research_runs set status=case when p_result->>'outcome' in ('failed','not_configured') then 'failed' else 'success' end,
  finished_at=now(),sources_processed=jsonb_array_length(p_result->'candidates'),total_fetched=jsonb_array_length(p_result->'candidates'),
  signals_created=jsonb_array_length(p_result->'findings'),error_count=jsonb_array_length(p_result->'coverageGaps') where id=o.run_id and client_id=p_client_id and status='running';
 update public.research_occurrences set state=case when retry then 'queued' else 'finished' end,lease_token=null,lease_until=null,
  retry_at=case when retry then now()+make_interval(mins=>o.attempts*5) else null end where id=o.id;
 if not retry then
  update public.research_schedules set last_due_at=o.due_at,last_briefing_id=o.briefing_id,next_due_at=private.research_next_due(greatest(now(),private.research_day_due(o.local_day,timezone,local_time)),timezone,local_time) where client_id=p_client_id;
  insert into public.research_notifications(client_id,briefing_id,kind) values(p_client_id,o.briefing_id,
   case when p_result->>'outcome' in ('failed','not_configured') then 'failure' when p_result->>'outcome'='partial' then 'partial' else 'ready' end) on conflict do nothing;
 end if;
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata)
  values(p_client_id,o.actor,'scheduled_research_finished','research_briefing',o.briefing_id,jsonb_build_object('outcome',p_result->>'outcome','retry',retry));
 return jsonb_build_object('ok',true,'retry',retry,'id',o.briefing_id);
end $$;

revoke all on function public.save_research_schedule(uuid,integer,boolean,text,text),public.manage_research_source(uuid,text,text,uuid,boolean,boolean) from public,anon,service_role;
grant execute on function public.save_research_schedule(uuid,integer,boolean,text,text),public.manage_research_source(uuid,text,text,uuid,boolean,boolean) to authenticated;
revoke all on function public.claim_scheduled_research(uuid,jsonb),public.renew_scheduled_research(uuid,uuid,uuid),public.record_research_source(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid),
 public.finish_scheduled_research(uuid,uuid,uuid,jsonb,jsonb),public.load_research_source_context(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_scheduled_research(uuid,jsonb),public.renew_scheduled_research(uuid,uuid,uuid),public.record_research_source(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid),
 public.finish_scheduled_research(uuid,uuid,uuid,jsonb,jsonb),public.load_research_source_context(uuid,uuid,uuid) to service_role;
