# Research schedule: daily or weekly (database change)

Migration file: `supabase/migrations/20261012220000_research_weekly_schedule.sql`. **Not applied yet.** Apply it before the code that uses it goes live (before the next push to `main`): the Research page reads the new `weekday` column and the Save schedule button calls the new six-argument function.

Additive only. One nullable column (`weekday`, 1 = Monday to 7 = Sunday, empty = every day, which is what every saved schedule already does), one new overload of a due-date helper, one new overload of `save_research_schedule`, and two existing worker functions re-created with one change each: they pass the weekday through when they work out the next due time. No table is dropped, no row is changed, no policy changes. The existing five-argument `save_research_schedule` keeps working and always means daily.

The worker (`rss-worker`) needs no code change: it calls the same functions.

Run in the Supabase SQL Editor, one block at a time, in order.

## Preflight (read only)

```sql
-- weekday must not exist yet
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'research_schedules' and column_name = 'weekday';

-- the functions this changes must exist, and nothing should be running right now
select p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in ('save_research_schedule','claim_scheduled_research','finish_scheduled_research'))
   or (n.nspname = 'private' and p.proname in ('research_next_due','research_day_due'));

select count(*) as running_occurrences from public.research_occurrences where state = 'running' and lease_until > now();
```

Expected: the first query returns no rows (a row means it is already applied; skip to Verify); the second returns six rows; `running_occurrences` is 0 (wait a few minutes if not, because step 3 and 4 replace the functions a running job uses).

## Step 1 of 4: column and the due-date helper

```sql
alter table public.research_schedules
  add column if not exists weekday smallint check (weekday between 1 and 7);

-- First due time strictly after p_now on the chosen weekday (any day when NULL).
create or replace function private.research_next_due(p_now timestamptz,p_zone text,p_time time,p_weekday smallint)
returns timestamptz language plpgsql stable set search_path='' as $$
declare d date:=(p_now at time zone p_zone)::date; due timestamptz;
begin
 for i in 0..9 loop
  if p_weekday is null or extract(isodow from (d+i))=p_weekday then
   due:=private.research_day_due(d+i,p_zone,p_time);
   if due>p_now then return due; end if;
  end if;
 end loop;
 raise exception 'Invalid schedule';
end $$;
revoke all on function private.research_next_due(timestamptz,text,time,smallint) from public,anon,authenticated,service_role;
```

## Step 2 of 4: save schedule (weekly) and the unchanged daily call

```sql
create or replace function public.save_research_schedule(p_client_id uuid,p_version integer,p_enabled boolean,p_timezone text,p_time text,p_weekday smallint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.research_schedules; next_due timestamptz;
begin
 if not private.research_allowed(p_client_id,true) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 if p_version is null or p_enabled is null or p_timezone is null or not exists(select 1 from pg_timezone_names where name=p_timezone)
  or p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  or p_weekday is not null and p_weekday not between 1 and 7
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
 next_due:=case when p_enabled then private.research_next_due(now(),p_timezone,p_time::time,p_weekday) else null end;
 update public.research_schedules set version=version+1,enabled=p_enabled,timezone=p_timezone,local_time=p_time::time,weekday=p_weekday,
  configured_by=auth.uid(),next_due_at=next_due,updated_at=now() where client_id=p_client_id;
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata)
  values(p_client_id,auth.uid(),'research_schedule_saved','client',p_client_id,jsonb_build_object('enabled',p_enabled,'version',s.version+1,'weekday',p_weekday));
 return jsonb_build_object('ok',true,'version',s.version+1);
end $$;

-- Existing five-argument callers keep their meaning: a daily schedule.
create or replace function public.save_research_schedule(p_client_id uuid,p_version integer,p_enabled boolean,p_timezone text,p_time text)
returns jsonb language sql security definer set search_path='' as $$
 select public.save_research_schedule(p_client_id,p_version,p_enabled,p_timezone,p_time,null::smallint);
$$;

revoke all on function public.save_research_schedule(uuid,integer,boolean,text,text,smallint) from public,anon,service_role;
grant execute on function public.save_research_schedule(uuid,integer,boolean,text,text,smallint) to authenticated;
```

## Step 3 of 4: claim a due scheduled run

```sql
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
   update public.research_schedules set next_due_at=private.research_next_due(greatest(now(),private.research_day_due(o.local_day,timezone,local_time)),timezone,local_time,weekday),last_due_at=o.due_at,last_briefing_id=o.briefing_id where client_id=p_client_id;
   if o.briefing_id is not null then insert into public.research_notifications(client_id,briefing_id,kind) values(p_client_id,o.briefing_id,'failure') on conflict do nothing; end if;
   return jsonb_build_object('ok',false,'code','RETRY_EXHAUSTED');
  end if;
 else
  day:=(now() at time zone s.timezone)::date;
  if exists(select 1 from public.research_occurrences where client_id=p_client_id and local_day=day) then
   update public.research_schedules set next_due_at=private.research_next_due(greatest(now(),private.research_day_due(day,timezone,local_time)),timezone,local_time,weekday) where client_id=p_client_id;
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
```

## Step 4 of 4: finish a scheduled run

```sql
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
  update public.research_schedules set last_due_at=o.due_at,last_briefing_id=o.briefing_id,next_due_at=private.research_next_due(greatest(now(),private.research_day_due(o.local_day,timezone,local_time)),timezone,local_time,weekday) where client_id=p_client_id;
  insert into public.research_notifications(client_id,briefing_id,kind) values(p_client_id,o.briefing_id,
   case when p_result->>'outcome' in ('failed','not_configured') then 'failure' when p_result->>'outcome'='partial' then 'partial' else 'ready' end) on conflict do nothing;
 end if;
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata)
  values(p_client_id,o.actor,'scheduled_research_finished','research_briefing',o.briefing_id,jsonb_build_object('outcome',p_result->>'outcome','retry',retry));
 return jsonb_build_object('ok',true,'retry',retry,'id',o.briefing_id);
end $$;
```

## Verify (read only)

```sql
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'research_schedules' and column_name = 'weekday';

select p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname = 'save_research_schedule')
   or (n.nspname = 'private' and p.proname = 'research_next_due');

-- Every saved schedule is still daily: this must equal the number of schedules
select count(*) filter (where weekday is null) as daily, count(*) as total from public.research_schedules;

-- The functions the worker calls are still service-only
select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon_can_run,
       has_function_privilege('authenticated', p.oid, 'execute') as signed_in_can_run
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('claim_scheduled_research','finish_scheduled_research');
```

Expected: `weekday` / `smallint`; two `save_research_schedule` rows (five and six arguments) and two `research_next_due` rows (three and four); `daily` equals `total`; both worker functions show `false` and `false`.

## Rollback

Only if needed, and only while no schedule is set to weekly (a weekly schedule would run daily after this). It restores the original claim and finish behaviour by re-applying the two functions from `supabase/migrations/20261009072944_research_automation.sql` (copy the `claim_scheduled_research` and `finish_scheduled_research` definitions from that file), then:

```sql
drop function if exists public.save_research_schedule(uuid,integer,boolean,text,text,smallint);
-- put the five-argument save back to its original body from 20261009072944_research_automation.sql, then:
drop function if exists private.research_next_due(timestamptz,text,time,smallint);
alter table public.research_schedules drop column if exists weekday;
```

## Tests

`tests/research-weekly-sql.test.ts` runs the real save, claim and finish functions on a throwaway PostgreSQL (PGlite): a weekly save lands on the chosen weekday and time; the old five-argument call stays daily and clears a weekly choice; days outside 1 to 7 are refused; non-admins are refused; and after a scheduled run the next one is the same weekday a week later. It was mutation-checked: with the weekday removed from claim and finish, the "a week later" test fails. The existing schedule suites (`research-automation-sql`, `research-rss-sql`, `web-research-sql`) still pass against the new migration.
