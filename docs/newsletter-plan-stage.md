# Newsletter plan stage: database change

Migration file: `supabase/migrations/20261012160000_newsletter_plan_stage.sql`. Additive: no table, column or row is dropped. It changes four functions and one check constraint so that the AI can propose an outline (a "plan" attempt), the outline is saved as a version, and the edition is then drafted as one article.

Apply in the Supabase SQL Editor, one step at a time, in order. Run the preflight first, then the six steps, then the verify queries. Applied and verified by Jawad on 2026-10-12.

What each step changes:

1. Allows a third attempt mode, `plan`.
2. Payload validator: a source may feed more than one section; new optional `plan`, `article`, `claims` fields; size cap 300000.
3. `save_newsletter_edition`: every source must appear in at least one section (overlap allowed); experience snapshots record `entryType`.
4. `transition_newsletter_edition`: approval needs QA and the article (or all section bodies); a plan that is not `ready` cannot be confirmed.
5. `begin_newsletter_attempt`: accepts `plan`; a plan attempt needs no confirmed outline and reserves nothing.
6. `finish_newsletter_attempt`: plan, draft and QA each may change only what they own.

## Preflight (read only)

```sql
-- 1. The constraint name must be newsletter_attempts_mode_check
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.newsletter_attempts'::regclass and contype = 'c';

-- 2. The four functions and the validator exist, and nothing is mid-flight
select p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where (n.nspname = 'public' and p.proname in ('save_newsletter_edition','transition_newsletter_edition','begin_newsletter_attempt','finish_newsletter_attempt'))
   or (n.nspname = 'private' and p.proname = 'newsletter_payload_valid');

select count(*) as running_attempts from public.newsletter_attempts where state = 'running' and lease_until > now();
```

Expected: one check on `mode`; five function rows; `running_attempts` 0 (wait a few minutes if not).


## Step 1 of 6

```sql
-- Step 1 of 6: allow a "plan" attempt next to "draft" and "qa".
alter table public.newsletter_attempts drop constraint if exists newsletter_attempts_mode_check;
alter table public.newsletter_attempts add constraint newsletter_attempts_mode_check check (mode in ('plan','draft','qa'));
```

## Step 2 of 6

```sql
-- Step 2 of 6: payload validator. Sources may now feed more than one section (a section cites facts, not whole sources).
-- New optional fields: plan (object), article (text), claims (array). Larger size cap for the fact ledger.
create or replace function private.newsletter_payload_valid(p jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare s jsonb; ids uuid[]; x text;
begin
 if p is null or jsonb_typeof(p)<>'object' or length(p::text)>300000
  or jsonb_typeof(p->'title') is distinct from 'string' or jsonb_typeof(p->'reader') is distinct from 'string'
  or jsonb_typeof(p->'depth') is distinct from 'string' or jsonb_typeof(p->'startDate') is distinct from 'string'
  or jsonb_typeof(p->'endDate') is distinct from 'string' or length(p->>'title') not between 3 and 300
  or length(p->>'reader') not between 3 and 1000 or p->>'depth' not in ('concise','standard','deep')
  or not (p ?& array['title','reader','depth','startDate','endDate','sections'])
  or p->>'startDate' !~ '^\d{4}-\d{2}-\d{2}$' or p->>'endDate' !~ '^\d{4}-\d{2}-\d{2}$'
  or (p->>'endDate')::date < (p->>'startDate')::date
  or jsonb_typeof(p->'sections')<>'array' or jsonb_array_length(p->'sections') not between 1 and 8 then return false; end if;
 if (p ? 'plan' and jsonb_typeof(p->'plan')<>'object')
  or (p ? 'article' and (jsonb_typeof(p->'article')<>'string' or length(p->>'article')>60000))
  or (p ? 'claims' and (jsonb_typeof(p->'claims')<>'array' or jsonb_array_length(p->'claims')>500)) then return false; end if;
 for s in select value from jsonb_array_elements(p->'sections') loop
  if not(s ?& array['heading','sourceIds','commentary','body'])
   or jsonb_typeof(s->'heading') is distinct from 'string' or jsonb_typeof(s->'body') is distinct from 'string'
   or jsonb_typeof(s->'commentary') is distinct from 'string' or length(s->>'heading') not between 1 and 300
   or length(s->>'body')>14000 or length(s->>'commentary')>4000
   or jsonb_typeof(s->'sourceIds')<>'array' or jsonb_array_length(s->'sourceIds') not between 1 and 8 then return false; end if;
  ids='{}';
  for x in select jsonb_array_elements_text(s->'sourceIds') loop
   if x::uuid=any(ids) then return false; end if; ids=array_append(ids,x::uuid);
  end loop;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function private.newsletter_payload_valid(jsonb) from public,anon,authenticated;
```

## Step 3 of 6

```sql
-- Step 3 of 6: saving an edition. Every selected source must still appear in at least one section, but may appear in several.
-- Experience snapshots now record the entry type so the writer can tell your own experiences from trend reactions.
create or replace function public.save_newsletter_edition(p_client uuid,p_edition uuid,p_expected integer,p_request uuid,p_payload jsonb,p_sources jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.newsletter_editions; sid uuid; t text; item jsonb; snap jsonb; ids uuid[]='{}'; arranged uuid[]; new_id uuid; fp text; fingerprints text[]='{}';
begin
 if not private.newsletter_allowed(p_client,auth.uid(),'posts_draft') then return jsonb_build_object('ok',false,'code','NO_ACCESS'); end if;
 if not coalesce(private.newsletter_payload_valid(p_payload),false) then return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
 if p_edition is null then
  if not private.newsletter_allowed(p_client,auth.uid(),'ideas_manage') then return jsonb_build_object('ok',false,'code','NO_ACCESS'); end if;
  if p_request is null or jsonb_typeof(p_sources)<>'array' or jsonb_array_length(p_sources) not between 1 and 8 then return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
  perform pg_advisory_xact_lock(hashtextextended('newsletter_create:'||p_client::text||p_request::text,0));
  select * into e from public.newsletter_editions where client_id=p_client and request_key=p_request;
  if found then return jsonb_build_object('ok',true,'id',e.id,'revision',e.revision); end if;
  insert into public.newsletter_editions(client_id,request_key) values(p_client,p_request) returning * into e;
  for item in select value from jsonb_array_elements(p_sources) loop
   sid=(item->>'id')::uuid; t=item->>'type'; snap=null;
   if sid=any(ids) then raise exception 'DUPLICATE_SOURCE'; end if; ids=array_append(ids,sid);
   if t='research_finding' then
    select payload||jsonb_build_object('fingerprint',fingerprint) into snap from public.research_findings
     where client_id=p_client and id=sid and approval_status='approved';
    fp=snap->>'fingerprint';
    if fp=any(fingerprints) then raise exception 'DUPLICATE_DEVELOPMENT'; end if;
    fingerprints=array_append(fingerprints,fp);
   elsif t='founder_experience' then
    select jsonb_build_object('title',title,'category',category,'entryType',entry_type,'rawNotes',raw_notes,'takeaway',takeaway,
      'whatHappened',what_happened,'whatWasLearned',what_was_learned,'whatChanged',what_changed,'whyItMatters',why_it_matters) into snap
     from public.founder_experiences where client_id=p_client and id=sid and deleted_at is null and readiness='ready';
   elsif t='content_resource' then
    select jsonb_build_object('title',title,'description',description,'problemSolved',problem_solved,'targetUseCase',target_use_case,
      'rawNotes',raw_notes,'keyword',keyword,'deliveryUrl',delivery_url,'deliveryInstructions',delivery_instructions) into snap
     from public.content_resources where client_id=p_client and id=sid and deleted_at is null and readiness='ready' and active and comment_gate_approved;
   end if;
   if snap is null then raise exception 'SOURCE_UNAVAILABLE'; end if;
   insert into public.newsletter_sources(client_id,edition_id,source_id,source_type,experience_id,resource_id,finding_id,reuse_confirmed,snapshot,content_hash)
    values(p_client,e.id,sid,t,case when t='founder_experience' then sid end,case when t='content_resource' then sid end,
     case when t='research_finding' then sid end,coalesce((item->>'reuseConfirmed')::boolean,false),snap,md5(snap::text));
  end loop;
  perform private.newsletter_reserve(p_client,e.id);
 else
  select * into e from public.newsletter_editions where client_id=p_client and id=p_edition and deleted_at is null for update;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  if e.revision is distinct from p_expected or e.status='published' or exists(select 1 from public.newsletter_attempts where edition_id=e.id and state='running' and lease_until>now()) then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
  e.revision=e.revision+1;
  update public.newsletter_editions set revision=e.revision,status='review',approved_revision=null,outline_revision=null where id=e.id;
  select array_agg(source_id) into ids from public.newsletter_sources where edition_id=e.id;
 end if;
 select array_agg(distinct x::uuid order by x::uuid) into arranged from jsonb_array_elements(p_payload->'sections') s cross join lateral jsonb_array_elements_text(s->'sourceIds') x;
 if arranged is distinct from (select array_agg(i order by i) from unnest(ids) i) then raise exception 'SOURCE_ARRANGEMENT'; end if;
 insert into public.newsletter_versions(client_id,edition_id,revision,payload,created_by) values(p_client,e.id,e.revision,p_payload,auth.uid());
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata) values(p_client,auth.uid(),'newsletter_version_saved','newsletter',e.id,jsonb_build_object('revision',e.revision));
 return jsonb_build_object('ok',true,'id',e.id,'revision',e.revision);
exception when others then return jsonb_build_object('ok',false,'code','SOURCE_OR_CONFLICT');
end $$;
```

## Step 4 of 6

```sql
-- Step 4 of 6: transitions. Approval needs QA and either the article text or every section body.
-- An outline whose plan is not "ready" (research gap, needs selection, blocked) cannot be confirmed.
create or replace function public.transition_newsletter_edition(p_client uuid,p_edition uuid,p_expected integer,p_action text,p_url text default null,p_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.newsletter_editions; v public.newsletter_versions; perm text;
begin
 perm=case when p_action in ('approve','reject') then 'posts_review' when p_action='publish' then 'posts_publish' else 'posts_draft' end;
 if not private.newsletter_allowed(p_client,auth.uid(),perm) then return jsonb_build_object('ok',false,'code','NO_ACCESS'); end if;
 select * into e from public.newsletter_editions where client_id=p_client and id=p_edition and deleted_at is null for update;
 if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
 if e.revision is distinct from p_expected or e.status='published' or exists(select 1 from public.newsletter_attempts where edition_id=e.id and state='running' and lease_until>now()) then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
 select * into v from public.newsletter_versions where edition_id=e.id and revision=e.revision;
 if p_action='confirm_outline' then
  if v.payload ? 'plan' and v.payload->'plan'->>'status' is distinct from 'ready' then return jsonb_build_object('ok',false,'code','PLAN_NOT_READY'); end if;
  update public.newsletter_editions set outline_revision=revision where id=e.id;
 elsif p_action='approve' then
  if v.qa is null or (length(trim(coalesce(v.payload->>'article','')))=0
    and exists(select 1 from jsonb_array_elements(v.payload->'sections') s where length(trim(s->>'body'))=0)) then return jsonb_build_object('ok',false,'code','QA_REQUIRED'); end if;
  -- A manually entered edition commits use at approval, after QA; generated drafts commit at success.
  perform private.newsletter_reserve(p_client,e.id);
  update public.source_usage set status='used',updated_at=now() where newsletter_id=e.id and status='reserved';
  update public.newsletter_editions set status='approved',approved_revision=revision where id=e.id;
 elsif p_action='reject' then
  update public.newsletter_editions set status='rejected',approved_revision=null where id=e.id;
  update public.source_usage set status='cancelled',updated_at=now() where newsletter_id=e.id and status='reserved';
 elsif p_action='publish' then
  if e.status<>'approved' or e.approved_revision is distinct from e.revision or p_date is null or p_date>current_date or p_url is null or length(p_url)>2048 or p_url !~ '^https://(www\.)?linkedin\.com/' then return jsonb_build_object('ok',false,'code','APPROVAL_REQUIRED'); end if;
  update public.newsletter_editions set status='published',publication_url=p_url,published_on=p_date where id=e.id;
  update public.source_usage set status='published',updated_at=now() where newsletter_id=e.id and status='used';
 elsif p_action='archive' then
  update public.newsletter_editions set deleted_at=now(),approved_revision=null where id=e.id;
  update public.source_usage set status='cancelled',updated_at=now() where newsletter_id=e.id and status='reserved';
 else return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata) values(p_client,auth.uid(),'newsletter_'||p_action,'newsletter',e.id,jsonb_build_object('revision',e.revision));
 return jsonb_build_object('ok',true,'id',e.id,'revision',e.revision);
exception when others then return jsonb_build_object('ok',false,'code','SOURCE_OR_CONFLICT');
end $$;
```

## Step 5 of 6

```sql
-- Step 5 of 6: starting an attempt. A plan attempt needs no confirmed outline and reserves nothing (sources were reserved when the edition was created).
create or replace function public.begin_newsletter_attempt(p_client uuid,p_edition uuid,p_actor uuid,p_expected integer,p_request uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.newsletter_editions; a public.newsletter_attempts;
begin
 if not private.newsletter_allowed(p_client,p_actor,'posts_draft') or p_mode not in ('plan','draft','qa') or p_request is null then return jsonb_build_object('ok',false,'code','NO_ACCESS'); end if;
 select * into e from public.newsletter_editions where client_id=p_client and id=p_edition and deleted_at is null for update;
 if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
 if exists(select 1 from public.newsletter_attempts where edition_id=e.id and request_key=p_request) then return jsonb_build_object('ok',false,'code','REQUEST_ALREADY_HANDLED'); end if;
 if e.revision is distinct from p_expected or e.status='published' or exists(select 1 from public.newsletter_attempts where edition_id=e.id and state='running' and lease_until>now()) then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
 if p_mode='draft' and e.outline_revision is distinct from e.revision then return jsonb_build_object('ok',false,'code','OUTLINE_REQUIRED'); end if;
 if p_mode='draft' then perform private.newsletter_reserve(p_client,e.id); end if;
 update public.newsletter_attempts set state='failed' where edition_id=e.id and state='running';
 insert into public.newsletter_attempts(client_id,edition_id,actor,request_key,revision,mode) values(p_client,e.id,p_actor,p_request,e.revision,p_mode) returning * into a;
 return jsonb_build_object('ok',true,'attempt',a.id,'token',a.token,'revision',e.revision);
exception when others then return jsonb_build_object('ok',false,'code','SOURCE_OR_CONFLICT');
end $$;
```

## Step 6 of 6

```sql
-- Step 6 of 6: finishing an attempt.
--  plan:  saves a new version with a new outline (sections + plan; any earlier article and claims are dropped). Reserved sources stay reserved, also on failure.
--  draft: saves a new version with the article (and claims). The confirmed outline and plan may not change.
--  qa:    stores the QA report on the current version; the version itself may not change.
create or replace function public.finish_newsletter_attempt(p_client uuid,p_attempt uuid,p_token uuid,p_payload jsonb,p_qa jsonb,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.newsletter_attempts; e public.newsletter_editions; old_payload jsonb; arranged jsonb; old_arranged jsonb; used_sources uuid[]; all_sources uuid[];
begin
 -- Lock edition before attempt, same order as start/edit/transition.
 select e1.* into e from public.newsletter_editions e1 join public.newsletter_attempts a1 on a1.edition_id=e1.id
  where a1.id=p_attempt and a1.client_id=p_client for update of e1;
 select * into a from public.newsletter_attempts where client_id=p_client and id=p_attempt for update;
 if not found or a.token is distinct from p_token or a.state<>'running' or a.lease_until<=now() or e.revision<>a.revision or e.deleted_at is not null
  or not private.newsletter_allowed(p_client,a.actor,'posts_draft') then return jsonb_build_object('ok',false,'code','STALE_RESULT'); end if;
 if p_payload is null then
  update public.newsletter_attempts set state='failed' where id=a.id;
  if a.mode<>'plan' then update public.source_usage set status='cancelled',updated_at=now() where newsletter_id=e.id and status='reserved'; end if;
  return jsonb_build_object('ok',true,'id',e.id,'revision',e.revision);
 end if;
 if not private.newsletter_payload_valid(p_payload) or (a.mode<>'plan' and (jsonb_typeof(p_qa)<>'object' or p_qa is null)) then return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
 select payload into old_payload from public.newsletter_versions where edition_id=e.id and revision=e.revision;
 if a.mode='plan' then
  if (p_payload-'sections'-'plan'-'article'-'claims')<>(old_payload-'sections'-'plan'-'article'-'claims') or not (p_payload ? 'plan') then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
  select array_agg(distinct x::uuid order by x::uuid) into used_sources from jsonb_array_elements(p_payload->'sections') s cross join lateral jsonb_array_elements_text(s->'sourceIds') x;
  select array_agg(source_id order by source_id) into all_sources from public.newsletter_sources where edition_id=e.id;
  if used_sources is distinct from all_sources then return jsonb_build_object('ok',false,'code','SOURCE_ARRANGEMENT'); end if;
  e.revision=e.revision+1;
  insert into public.newsletter_versions(client_id,edition_id,revision,payload,evidence,created_by) values(p_client,e.id,e.revision,p_payload,p_evidence,a.actor);
  update public.newsletter_editions set revision=e.revision,approved_revision=null,outline_revision=null where id=e.id;
 else
  select jsonb_agg(s-'body') into arranged from jsonb_array_elements(p_payload->'sections') s;
  select jsonb_agg(s-'body') into old_arranged from jsonb_array_elements(old_payload->'sections') s;
  if (p_payload-'sections'-'article'-'claims')<>(old_payload-'sections'-'article'-'claims') or arranged<>old_arranged or (a.mode='qa' and p_payload<>old_payload) then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
  if a.mode='draft' then
   perform private.newsletter_reserve(p_client,e.id);
   e.revision=e.revision+1;
   insert into public.newsletter_versions(client_id,edition_id,revision,payload,qa,evidence,created_by) values(p_client,e.id,e.revision,p_payload,p_qa,p_evidence,a.actor);
   update public.source_usage set status='used',updated_at=now() where newsletter_id=e.id and status='reserved';
   update public.newsletter_editions set revision=e.revision,status='review',approved_revision=null,outline_revision=null where id=e.id;
  else
   update public.newsletter_versions set qa=p_qa,evidence=p_evidence where edition_id=e.id and revision=e.revision;
   update public.newsletter_editions set status='review',approved_revision=null where id=e.id;
  end if;
 end if;
 update public.newsletter_attempts set state='finished' where id=a.id;
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata) values(p_client,a.actor,'newsletter_'||a.mode||'_finished','newsletter',e.id,jsonb_build_object('revision',e.revision));
 return jsonb_build_object('ok',true,'id',e.id,'revision',e.revision);
exception when others then return jsonb_build_object('ok',false,'code','SOURCE_OR_CONFLICT');
end $$;
revoke all on function public.save_newsletter_edition(uuid,uuid,integer,uuid,jsonb,jsonb),public.transition_newsletter_edition(uuid,uuid,integer,text,text,date),public.begin_newsletter_attempt(uuid,uuid,uuid,integer,uuid,text),public.finish_newsletter_attempt(uuid,uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_newsletter_edition(uuid,uuid,integer,uuid,jsonb,jsonb),public.transition_newsletter_edition(uuid,uuid,integer,text,text,date) to authenticated;
grant execute on function public.begin_newsletter_attempt(uuid,uuid,uuid,integer,uuid,text),public.finish_newsletter_attempt(uuid,uuid,uuid,jsonb,jsonb,jsonb) to service_role;
```

## Verify (read only)

```sql
-- mode now allows plan
select pg_get_constraintdef(oid) from pg_constraint where conname = 'newsletter_attempts_mode_check';

-- the functions carry the new logic (each should be true)
select
  pg_get_functiondef('private.newsletter_payload_valid(jsonb)'::regprocedure) like '%article%' as validator_updated,
  pg_get_functiondef('public.save_newsletter_edition(uuid,uuid,integer,uuid,jsonb,jsonb)'::regprocedure) like '%entryType%' as save_updated,
  pg_get_functiondef('public.transition_newsletter_edition(uuid,uuid,integer,text,text,date)'::regprocedure) like '%PLAN_NOT_READY%' as transition_updated,
  pg_get_functiondef('public.begin_newsletter_attempt(uuid,uuid,uuid,integer,uuid,text)'::regprocedure) like '%''plan'',''draft'',''qa''%' as begin_updated,
  pg_get_functiondef('public.finish_newsletter_attempt(uuid,uuid,uuid,jsonb,jsonb,jsonb)'::regprocedure) like '%a.mode=''plan''%' as finish_updated;

-- privileges unchanged: public/anon/authenticated must NOT execute begin/finish; authenticated may execute save/transition
select p.proname,
  has_function_privilege('anon', p.oid, 'execute') as anon,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
  has_function_privilege('service_role', p.oid, 'execute') as service_role
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('save_newsletter_edition','transition_newsletter_edition','begin_newsletter_attempt','finish_newsletter_attempt')
order by p.proname;
```

Expected: five `true` values; `anon` false everywhere; `authenticated` true only for save and transition; `service_role` true for begin and finish.

## Rollback

Restores the previous function bodies and the two-mode constraint. Existing editions keep working. Versions saved by the new flow stay readable, but the old validator rejects re-saving an outline in which one source feeds two sections.

First remove any plan attempts, because the old constraint cannot hold them:

```sql
delete from public.newsletter_attempts where mode = 'plan';
```

Then the previous definitions, copied from `20261009131721_newsletter_editions.sql`:

```sql
alter table public.newsletter_attempts drop constraint if exists newsletter_attempts_mode_check;
alter table public.newsletter_attempts add constraint newsletter_attempts_mode_check check (mode in ('draft','qa'));

create or replace function private.newsletter_payload_valid(p jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare s jsonb; ids uuid[]='{}'; x text;
begin
 if p is null or jsonb_typeof(p)<>'object' or length(p::text)>140000
  or jsonb_typeof(p->'title') is distinct from 'string' or jsonb_typeof(p->'reader') is distinct from 'string'
  or jsonb_typeof(p->'depth') is distinct from 'string' or jsonb_typeof(p->'startDate') is distinct from 'string'
  or jsonb_typeof(p->'endDate') is distinct from 'string' or length(p->>'title') not between 3 and 300
  or length(p->>'reader') not between 3 and 1000 or p->>'depth' not in ('concise','standard','deep')
  or not (p ?& array['title','reader','depth','startDate','endDate','sections'])
  or p->>'startDate' !~ '^\d{4}-\d{2}-\d{2}$' or p->>'endDate' !~ '^\d{4}-\d{2}-\d{2}$'
  or (p->>'endDate')::date < (p->>'startDate')::date
  or jsonb_typeof(p->'sections')<>'array' or jsonb_array_length(p->'sections') not between 1 and 8 then return false; end if;
 for s in select value from jsonb_array_elements(p->'sections') loop
  if not(s ?& array['heading','sourceIds','commentary','body'])
   or jsonb_typeof(s->'heading') is distinct from 'string' or jsonb_typeof(s->'body') is distinct from 'string'
   or jsonb_typeof(s->'commentary') is distinct from 'string' or length(s->>'heading') not between 1 and 300
   or length(s->>'body')>14000 or length(s->>'commentary')>4000
   or jsonb_typeof(s->'sourceIds')<>'array' or jsonb_array_length(s->'sourceIds') not between 1 and 8 then return false; end if;
  for x in select jsonb_array_elements_text(s->'sourceIds') loop
   if x::uuid=any(ids) then return false; end if; ids=array_append(ids,x::uuid);
  end loop;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function private.newsletter_payload_valid(jsonb) from public,anon,authenticated;

create or replace function public.save_newsletter_edition(p_client uuid,p_edition uuid,p_expected integer,p_request uuid,p_payload jsonb,p_sources jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.newsletter_editions; sid uuid; t text; item jsonb; snap jsonb; ids uuid[]='{}'; arranged uuid[]; new_id uuid; fp text; fingerprints text[]='{}';
begin
 if not private.newsletter_allowed(p_client,auth.uid(),'posts_draft') then return jsonb_build_object('ok',false,'code','NO_ACCESS'); end if;
 if not coalesce(private.newsletter_payload_valid(p_payload),false) then return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
 if p_edition is null then
  if not private.newsletter_allowed(p_client,auth.uid(),'ideas_manage') then return jsonb_build_object('ok',false,'code','NO_ACCESS'); end if;
  if p_request is null or jsonb_typeof(p_sources)<>'array' or jsonb_array_length(p_sources) not between 1 and 8 then return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
  perform pg_advisory_xact_lock(hashtextextended('newsletter_create:'||p_client::text||p_request::text,0));
  select * into e from public.newsletter_editions where client_id=p_client and request_key=p_request;
  if found then return jsonb_build_object('ok',true,'id',e.id,'revision',e.revision); end if;
  insert into public.newsletter_editions(client_id,request_key) values(p_client,p_request) returning * into e;
  for item in select value from jsonb_array_elements(p_sources) loop
   sid=(item->>'id')::uuid; t=item->>'type'; snap=null;
   if sid=any(ids) then raise exception 'DUPLICATE_SOURCE'; end if; ids=array_append(ids,sid);
   if t='research_finding' then
    select payload||jsonb_build_object('fingerprint',fingerprint) into snap from public.research_findings
     where client_id=p_client and id=sid and approval_status='approved';
    fp=snap->>'fingerprint';
    if fp=any(fingerprints) then raise exception 'DUPLICATE_DEVELOPMENT'; end if;
    fingerprints=array_append(fingerprints,fp);
   elsif t='founder_experience' then
    select jsonb_build_object('title',title,'category',category,'rawNotes',raw_notes,'takeaway',takeaway,
      'whatHappened',what_happened,'whatWasLearned',what_was_learned,'whatChanged',what_changed,'whyItMatters',why_it_matters) into snap
     from public.founder_experiences where client_id=p_client and id=sid and deleted_at is null and readiness='ready';
   elsif t='content_resource' then
    select jsonb_build_object('title',title,'description',description,'problemSolved',problem_solved,'targetUseCase',target_use_case,
      'rawNotes',raw_notes,'keyword',keyword,'deliveryUrl',delivery_url,'deliveryInstructions',delivery_instructions) into snap
     from public.content_resources where client_id=p_client and id=sid and deleted_at is null and readiness='ready' and active and comment_gate_approved;
   end if;
   if snap is null then raise exception 'SOURCE_UNAVAILABLE'; end if;
   insert into public.newsletter_sources(client_id,edition_id,source_id,source_type,experience_id,resource_id,finding_id,reuse_confirmed,snapshot,content_hash)
    values(p_client,e.id,sid,t,case when t='founder_experience' then sid end,case when t='content_resource' then sid end,
     case when t='research_finding' then sid end,coalesce((item->>'reuseConfirmed')::boolean,false),snap,md5(snap::text));
  end loop;
  perform private.newsletter_reserve(p_client,e.id);
 else
  select * into e from public.newsletter_editions where client_id=p_client and id=p_edition and deleted_at is null for update;
  if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
  if e.revision is distinct from p_expected or e.status='published' or exists(select 1 from public.newsletter_attempts where edition_id=e.id and state='running' and lease_until>now()) then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
  e.revision=e.revision+1;
  update public.newsletter_editions set revision=e.revision,status='review',approved_revision=null,outline_revision=null where id=e.id;
  select array_agg(source_id) into ids from public.newsletter_sources where edition_id=e.id;
 end if;
 select array_agg(x::uuid order by x) into arranged from jsonb_array_elements(p_payload->'sections') s cross join lateral jsonb_array_elements_text(s->'sourceIds') x;
 if arranged is distinct from (select array_agg(i order by i) from unnest(ids) i) then raise exception 'SOURCE_ARRANGEMENT'; end if;
 insert into public.newsletter_versions(client_id,edition_id,revision,payload,created_by) values(p_client,e.id,e.revision,p_payload,auth.uid());
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata) values(p_client,auth.uid(),'newsletter_version_saved','newsletter',e.id,jsonb_build_object('revision',e.revision));
 return jsonb_build_object('ok',true,'id',e.id,'revision',e.revision);
exception when others then return jsonb_build_object('ok',false,'code','SOURCE_OR_CONFLICT');
end $$;

create or replace function public.transition_newsletter_edition(p_client uuid,p_edition uuid,p_expected integer,p_action text,p_url text default null,p_date date default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.newsletter_editions; v public.newsletter_versions; perm text;
begin
 perm=case when p_action in ('approve','reject') then 'posts_review' when p_action='publish' then 'posts_publish' else 'posts_draft' end;
 if not private.newsletter_allowed(p_client,auth.uid(),perm) then return jsonb_build_object('ok',false,'code','NO_ACCESS'); end if;
 select * into e from public.newsletter_editions where client_id=p_client and id=p_edition and deleted_at is null for update;
 if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
 if e.revision is distinct from p_expected or e.status='published' or exists(select 1 from public.newsletter_attempts where edition_id=e.id and state='running' and lease_until>now()) then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
 select * into v from public.newsletter_versions where edition_id=e.id and revision=e.revision;
 if p_action='confirm_outline' then update public.newsletter_editions set outline_revision=revision where id=e.id;
 elsif p_action='approve' then
  if v.qa is null or exists(select 1 from jsonb_array_elements(v.payload->'sections') s where length(trim(s->>'body'))=0) then return jsonb_build_object('ok',false,'code','QA_REQUIRED'); end if;
  -- A manually entered edition commits use at approval, after QA; generated drafts commit at success.
  perform private.newsletter_reserve(p_client,e.id);
  update public.source_usage set status='used',updated_at=now() where newsletter_id=e.id and status='reserved';
  update public.newsletter_editions set status='approved',approved_revision=revision where id=e.id;
 elsif p_action='reject' then
  update public.newsletter_editions set status='rejected',approved_revision=null where id=e.id;
  update public.source_usage set status='cancelled',updated_at=now() where newsletter_id=e.id and status='reserved';
 elsif p_action='publish' then
  if e.status<>'approved' or e.approved_revision is distinct from e.revision or p_date is null or p_date>current_date or p_url is null or length(p_url)>2048 or p_url !~ '^https://(www\.)?linkedin\.com/' then return jsonb_build_object('ok',false,'code','APPROVAL_REQUIRED'); end if;
  update public.newsletter_editions set status='published',publication_url=p_url,published_on=p_date where id=e.id;
  update public.source_usage set status='published',updated_at=now() where newsletter_id=e.id and status='used';
 elsif p_action='archive' then
  update public.newsletter_editions set deleted_at=now(),approved_revision=null where id=e.id;
  update public.source_usage set status='cancelled',updated_at=now() where newsletter_id=e.id and status='reserved';
 else return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata) values(p_client,auth.uid(),'newsletter_'||p_action,'newsletter',e.id,jsonb_build_object('revision',e.revision));
 return jsonb_build_object('ok',true,'id',e.id,'revision',e.revision);
exception when others then return jsonb_build_object('ok',false,'code','SOURCE_OR_CONFLICT');
end $$;

create or replace function public.begin_newsletter_attempt(p_client uuid,p_edition uuid,p_actor uuid,p_expected integer,p_request uuid,p_mode text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.newsletter_editions; a public.newsletter_attempts;
begin
 if not private.newsletter_allowed(p_client,p_actor,'posts_draft') or p_mode not in ('draft','qa') or p_request is null then return jsonb_build_object('ok',false,'code','NO_ACCESS'); end if;
 select * into e from public.newsletter_editions where client_id=p_client and id=p_edition and deleted_at is null for update;
 if not found then return jsonb_build_object('ok',false,'code','NOT_FOUND'); end if;
 if exists(select 1 from public.newsletter_attempts where edition_id=e.id and request_key=p_request) then return jsonb_build_object('ok',false,'code','REQUEST_ALREADY_HANDLED'); end if;
 if e.revision is distinct from p_expected or e.status='published' or exists(select 1 from public.newsletter_attempts where edition_id=e.id and state='running' and lease_until>now()) then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
 if p_mode='draft' and e.outline_revision is distinct from e.revision then return jsonb_build_object('ok',false,'code','OUTLINE_REQUIRED'); end if;
 if p_mode='draft' then perform private.newsletter_reserve(p_client,e.id); end if;
 update public.newsletter_attempts set state='failed' where edition_id=e.id and state='running';
 insert into public.newsletter_attempts(client_id,edition_id,actor,request_key,revision,mode) values(p_client,e.id,p_actor,p_request,e.revision,p_mode) returning * into a;
 return jsonb_build_object('ok',true,'attempt',a.id,'token',a.token,'revision',e.revision);
exception when others then return jsonb_build_object('ok',false,'code','SOURCE_OR_CONFLICT');
end $$;

create or replace function public.finish_newsletter_attempt(p_client uuid,p_attempt uuid,p_token uuid,p_payload jsonb,p_qa jsonb,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.newsletter_attempts; e public.newsletter_editions; old_payload jsonb; arranged jsonb; old_arranged jsonb;
begin
 -- Lock edition before attempt, same order as start/edit/transition.
 select e1.* into e from public.newsletter_editions e1 join public.newsletter_attempts a1 on a1.edition_id=e1.id
  where a1.id=p_attempt and a1.client_id=p_client for update of e1;
 select * into a from public.newsletter_attempts where client_id=p_client and id=p_attempt for update;
 if not found or a.token is distinct from p_token or a.state<>'running' or a.lease_until<=now() or e.revision<>a.revision or e.deleted_at is not null
  or not private.newsletter_allowed(p_client,a.actor,'posts_draft') then return jsonb_build_object('ok',false,'code','STALE_RESULT'); end if;
 if p_payload is null then
  update public.newsletter_attempts set state='failed' where id=a.id;
  update public.source_usage set status='cancelled',updated_at=now() where newsletter_id=e.id and status='reserved';
  return jsonb_build_object('ok',true,'id',e.id,'revision',e.revision);
 end if;
 if not private.newsletter_payload_valid(p_payload) or jsonb_typeof(p_qa)<>'object' or p_qa is null then return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
 select payload into old_payload from public.newsletter_versions where edition_id=e.id and revision=e.revision;
 select jsonb_agg(s-'body') into arranged from jsonb_array_elements(p_payload->'sections') s;
 select jsonb_agg(s-'body') into old_arranged from jsonb_array_elements(old_payload->'sections') s;
 if p_payload-'sections'<>old_payload-'sections' or arranged<>old_arranged or (a.mode='qa' and p_payload<>old_payload) then return jsonb_build_object('ok',false,'code','CONFLICT'); end if;
 if a.mode='draft' then
  perform private.newsletter_reserve(p_client,e.id);
  e.revision=e.revision+1;
  insert into public.newsletter_versions(client_id,edition_id,revision,payload,qa,evidence,created_by) values(p_client,e.id,e.revision,p_payload,p_qa,p_evidence,a.actor);
  update public.source_usage set status='used',updated_at=now() where newsletter_id=e.id and status='reserved';
  update public.newsletter_editions set revision=e.revision,status='review',approved_revision=null,outline_revision=null where id=e.id;
 else
  update public.newsletter_versions set qa=p_qa,evidence=p_evidence where edition_id=e.id and revision=e.revision;
  update public.newsletter_editions set status='review',approved_revision=null where id=e.id;
 end if;
 update public.newsletter_attempts set state='finished' where id=a.id;
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata) values(p_client,a.actor,'newsletter_'||a.mode||'_finished','newsletter',e.id,jsonb_build_object('revision',e.revision));
 return jsonb_build_object('ok',true,'id',e.id,'revision',e.revision);
exception when others then return jsonb_build_object('ok',false,'code','SOURCE_OR_CONFLICT');
end $$;
revoke all on function public.save_newsletter_edition(uuid,uuid,integer,uuid,jsonb,jsonb),public.transition_newsletter_edition(uuid,uuid,integer,text,text,date),public.begin_newsletter_attempt(uuid,uuid,uuid,integer,uuid,text),public.finish_newsletter_attempt(uuid,uuid,uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_newsletter_edition(uuid,uuid,integer,uuid,jsonb,jsonb),public.transition_newsletter_edition(uuid,uuid,integer,text,text,date) to authenticated;
grant execute on function public.begin_newsletter_attempt(uuid,uuid,uuid,integer,uuid,text),public.finish_newsletter_attempt(uuid,uuid,uuid,jsonb,jsonb,jsonb) to service_role;
```
