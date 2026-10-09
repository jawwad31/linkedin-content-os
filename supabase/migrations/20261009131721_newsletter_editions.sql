-- P09: independent weekly editions; no legacy data or calendar allocations changed.
create unique index if not exists founder_experiences_client_id_unique on public.founder_experiences(client_id,id);
create table if not exists public.newsletter_editions (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
 request_key uuid not null, revision integer not null default 1 check(revision>0),
 status text not null default 'outline' check(status in ('outline','review','approved','rejected','published')),
 outline_revision integer, approved_revision integer, deleted_at timestamptz,
 publication_url text, published_on date, created_at timestamptz not null default now(),
 unique(client_id,id), unique(client_id,request_key)
);
create table if not exists public.newsletter_versions (
 client_id uuid not null, edition_id uuid not null, revision integer not null,
 payload jsonb not null check(jsonb_typeof(payload)='object'), qa jsonb, evidence jsonb,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 primary key(edition_id,revision), foreign key(client_id,edition_id) references public.newsletter_editions(client_id,id)
);
create table if not exists public.newsletter_sources (
 client_id uuid not null, edition_id uuid not null, source_id uuid not null,
 source_type text not null check(source_type in ('founder_experience','content_resource','research_finding')),
 experience_id uuid, resource_id uuid, finding_id uuid, usage_id uuid references public.source_usage(id),
 reuse_confirmed boolean not null default false, snapshot jsonb not null, content_hash text not null,
 primary key(edition_id,source_id),
 foreign key(client_id,edition_id) references public.newsletter_editions(client_id,id),
 foreign key(client_id,experience_id) references public.founder_experiences(client_id,id),
 foreign key(client_id,resource_id) references public.content_resources(client_id,id),
 foreign key(client_id,finding_id) references public.research_findings(client_id,id),
 check((source_type='founder_experience' and experience_id=source_id and resource_id is null and finding_id is null)
    or (source_type='content_resource' and resource_id=source_id and experience_id is null and finding_id is null)
    or (source_type='research_finding' and finding_id=source_id and experience_id is null and resource_id is null))
);
create table if not exists public.newsletter_attempts (
 id uuid primary key default gen_random_uuid(), client_id uuid not null, edition_id uuid not null,
 actor uuid not null references auth.users(id), request_key uuid not null, revision integer not null,
 mode text not null check(mode in ('draft','qa')), token uuid not null default gen_random_uuid(),
 state text not null default 'running' check(state in ('running','finished','failed')),
 lease_until timestamptz not null default now()+interval '10 minutes', created_at timestamptz not null default now(),
 unique(edition_id,request_key), foreign key(client_id,edition_id) references public.newsletter_editions(client_id,id)
);
alter table public.source_usage add column if not exists newsletter_id uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='source_usage_newsletter_scope_fk') then
  alter table public.source_usage add constraint source_usage_newsletter_scope_fk
   foreign key(client_id,newsletter_id) references public.newsletter_editions(client_id,id);
 end if;
end $$;
create index if not exists newsletter_account_recent on public.newsletter_editions(client_id,created_at desc);
create index if not exists newsletter_source_experience on public.newsletter_sources(client_id,experience_id);
create index if not exists newsletter_source_resource on public.newsletter_sources(client_id,resource_id);
create index if not exists newsletter_source_finding on public.newsletter_sources(client_id,finding_id);
create index if not exists newsletter_attempt_active on public.newsletter_attempts(edition_id,state);
create index if not exists source_usage_newsletter on public.source_usage(newsletter_id);

create or replace function private.newsletter_allowed(p_client uuid,p_actor uuid,p_permission text default null)
returns boolean language sql stable security definer set search_path='' as $$
 select p_actor is not null
 and exists(select 1 from public.clients where id=p_client and deleted_at is null)
 and exists(select 1 from public.profiles where id=p_actor and active and not must_change_password)
 and (exists(select 1 from public.agency_members a join public.clients c on c.agency_id=a.agency_id
     where c.id=p_client and a.user_id=p_actor and a.role='agency_admin' and a.invitation_status='accepted')
   or exists(select 1 from public.client_access where client_id=p_client and user_id=p_actor and invitation_status='accepted'
     and (p_permission is null or role='client_admin' or p_permission=any(permissions))));
$$;
revoke all on function private.newsletter_allowed(uuid,uuid,text) from public,anon;
grant execute on function private.newsletter_allowed(uuid,uuid,text) to authenticated,service_role;

alter table public.newsletter_editions enable row level security;
alter table public.newsletter_versions enable row level security;
alter table public.newsletter_sources enable row level security;
alter table public.newsletter_attempts enable row level security;
revoke all on public.newsletter_editions,public.newsletter_versions,public.newsletter_sources,public.newsletter_attempts from public,anon,authenticated;
grant select on public.newsletter_editions,public.newsletter_versions,public.newsletter_sources to authenticated;
grant all on public.newsletter_editions,public.newsletter_versions,public.newsletter_sources,public.newsletter_attempts to service_role;
drop policy if exists "Newsletter workspace read" on public.newsletter_editions;
create policy "Newsletter workspace read" on public.newsletter_editions for select to authenticated using(private.newsletter_allowed(client_id,auth.uid()));
drop policy if exists "Newsletter versions read" on public.newsletter_versions;
create policy "Newsletter versions read" on public.newsletter_versions for select to authenticated using(private.newsletter_allowed(client_id,auth.uid()));
drop policy if exists "Newsletter evidence read" on public.newsletter_sources;
create policy "Newsletter evidence read" on public.newsletter_sources for select to authenticated using(private.newsletter_allowed(client_id,auth.uid()));
-- Existing broad source_usage policies cannot forge newsletter reservations/use.
drop policy if exists "Newsletter use insert guard" on public.source_usage;
create policy "Newsletter use insert guard" on public.source_usage as restrictive for insert to authenticated
 with check(channel<>'newsletter' and newsletter_id is null);
drop policy if exists "Newsletter use update guard" on public.source_usage;
create policy "Newsletter use update guard" on public.source_usage as restrictive for update to authenticated
 using(channel<>'newsletter' and newsletter_id is null) with check(channel<>'newsletter' and newsletter_id is null);

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

-- Locks match standalone/calendar source locks. Reuse is explicitly confirmed per edition.
create or replace function private.newsletter_reserve(p_client uuid,p_edition uuid)
returns void language plpgsql set search_path='' as $$
declare s record; reusable boolean; ready text; active_source boolean; uid uuid; current_status text;
begin
 if exists(select 1 from public.newsletter_sources ns left join public.research_findings rf
   on rf.client_id=ns.client_id and rf.id=ns.finding_id
   where ns.client_id=p_client and ns.edition_id=p_edition and ns.source_type='research_finding'
   and rf.approval_status is distinct from 'approved') then raise exception 'SOURCE_UNAVAILABLE'; end if;
 for s in select * from public.newsletter_sources where client_id=p_client and edition_id=p_edition
   and source_type<>'research_finding' order by source_id loop
  perform pg_advisory_xact_lock(hashtextextended('content_bank_source:'||s.source_id::text,0));
  if s.source_type='founder_experience' then
   select allow_reuse,readiness,true into reusable,ready,active_source from public.founder_experiences
    where client_id=p_client and id=s.source_id and deleted_at is null for share;
  else
   select allow_reuse,readiness,active and comment_gate_approved into reusable,ready,active_source from public.content_resources
    where client_id=p_client and id=s.source_id and deleted_at is null for share;
  end if;
  if not found or ready is distinct from 'ready' or not coalesce(active_source,false) then raise exception 'SOURCE_UNAVAILABLE'; end if;
  select status into current_status from public.source_usage where id=s.usage_id;
  if current_status in ('used','published') then continue; end if;
  if current_status='reserved' then
   if s.reuse_confirmed and not coalesce(reusable,false) then raise exception 'REUSE_REQUIRED'; end if;
   continue;
  end if;
  if exists(select 1 from public.source_usage where client_id=p_client and source_id=s.source_id and id is distinct from s.usage_id and status in ('reserved','used','published'))
    and not (coalesce(reusable,false) and s.reuse_confirmed) then raise exception 'REUSE_REQUIRED'; end if;
  insert into public.source_usage(client_id,source_id,source_type,channel,status,newsletter_id)
   values(p_client,s.source_id,s.source_type,'newsletter','reserved',p_edition) returning id into uid;
  update public.newsletter_sources set usage_id=uid where edition_id=p_edition and source_id=s.source_id;
 end loop;
end $$;
revoke all on function private.newsletter_reserve(uuid,uuid) from public,anon,authenticated;

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

-- Paid operations are server-only; actor is derived from the verified session.
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

-- A single statement checks the current approved version and reads its copy.
-- Invoker rights preserve RLS even when called directly through the Data API.
create or replace function public.read_approved_newsletter(p_client uuid,p_edition uuid,p_revision integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce((select jsonb_build_object('ok',true,'payload',v.payload)
  from public.newsletter_editions e join public.newsletter_versions v
   on v.client_id=e.client_id and v.edition_id=e.id and v.revision=e.revision
  where e.client_id=p_client and e.id=p_edition and e.revision=p_revision
   and e.approved_revision=e.revision and e.status in ('approved','published') and e.deleted_at is null),jsonb_build_object('ok',false));
$$;
revoke all on function public.read_approved_newsletter(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.read_approved_newsletter(uuid,uuid,integer) to authenticated;
