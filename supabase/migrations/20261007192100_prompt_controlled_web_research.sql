-- P07: additive web research. RSS tables, worker and lock remain compatible.
-- Private prompt versions/run inputs are administrator-only. Findings are data.
create or replace function private.research_allowed(p_client_id uuid, p_manage boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (select 1 from public.clients c where c.id=p_client_id and c.deleted_at is null)
    and exists (select 1 from public.profiles p where p.id=auth.uid() and p.active and not p.must_change_password)
    and public.has_client_access(p_client_id, case when p_manage then array['agency_admin','client_admin']
      else array['agency_admin','client_admin','client_user'] end);
$$;
revoke all on function private.research_allowed(uuid,boolean) from public, anon;
grant execute on function private.research_allowed(uuid,boolean) to authenticated;

create table if not exists public.research_settings (
  client_id uuid primary key references public.clients(id),
  revision integer not null default 0 check (revision>=0)
);
create table if not exists public.research_prompt_versions (
  client_id uuid not null references public.clients(id),
  revision integer not null check (revision>0),
  prompt text not null check (length(prompt) between 10 and 12000),
  lookback_days integer not null default 7 check (lookback_days between 1 and 30),
  use_profile_context boolean not null default false,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  primary key (client_id,revision)
);
create table if not exists public.research_briefings (
  id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id),
  run_id uuid not null unique references public.research_runs(id),
  request_key uuid not null, created_by uuid not null references auth.users(id),
  revision integer not null, outcome text not null default 'running'
    check (outcome in ('running','success','empty','partial','failed','not_configured')),
  summary text not null default '', coverage_gaps jsonb not null default '[]',
  error_code text, tool_calls integer not null default 0,
  candidate_count integer not null default 0, created_at timestamptz not null default now(),
  finished_at timestamptz, unique (client_id,id), unique(client_id,request_key),
  foreign key (client_id,revision) references public.research_prompt_versions(client_id,revision)
);
create table if not exists public.research_run_inputs (
  client_id uuid not null, briefing_id uuid primary key,
  profile_snapshot jsonb, budget jsonb not null,
  foreign key (client_id,briefing_id) references public.research_briefings(client_id,id)
);
create table if not exists public.research_candidates (
  id uuid primary key default gen_random_uuid(), client_id uuid not null, briefing_id uuid not null,
  url text not null, evidence jsonb not null, unique(briefing_id,url),
  foreign key(client_id,briefing_id) references public.research_briefings(client_id,id)
);
create table if not exists public.research_findings (
  id uuid primary key default gen_random_uuid(), client_id uuid not null, briefing_id uuid not null,
  fingerprint text not null, payload jsonb not null,
  approval_status text not null default 'pending' check(approval_status in ('pending','approved','archived')),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
  content_idea_id uuid references public.content_ideas(id), created_at timestamptz not null default now(),
  unique(client_id,id), unique(briefing_id,fingerprint), unique(content_idea_id),
  foreign key(client_id,briefing_id) references public.research_briefings(client_id,id)
);
create index if not exists research_briefings_recent on public.research_briefings(client_id,created_at desc);
create index if not exists research_findings_recent on public.research_findings(client_id,created_at desc);
create index if not exists research_candidates_briefing on public.research_candidates(briefing_id);

-- Backfill only missing settings. Never overwrite a saved prompt or old sources.
insert into public.research_settings(client_id,revision) select id,1 from public.clients where deleted_at is null
  on conflict do nothing;
insert into public.research_prompt_versions(client_id,revision,prompt)
select client_id,1,$prompt$Deliver a concise, high-signal daily briefing for a digital marketing agency. Research the past week and cover only consequential changes or tactics: Meta and Google Ads platform/policy/measurement updates; GoHighLevel releases, best practices; Google Business Profile, local SEO, AI Overviews/local search, reviews and Maps; CRO and lead-conversion best practices; CRM, AI agents, AI Chatbots and calling agents, call/chat/SMS automation; and other material digital-marketing developments. For each item include what changed, why it matters for local-service clients, and a specific agency action. Prioritize primary sources and include direct source links. Clearly separate confirmed platform changes from informed trend analysis. Skip minor news and generic advice.$prompt$
from public.research_settings where revision=1 on conflict do nothing;

alter table public.research_settings enable row level security;
alter table public.research_prompt_versions enable row level security;
alter table public.research_run_inputs enable row level security;
alter table public.research_briefings enable row level security;
alter table public.research_candidates enable row level security;
alter table public.research_findings enable row level security;
revoke all on public.research_settings,public.research_prompt_versions,public.research_run_inputs,
  public.research_briefings,public.research_candidates,public.research_findings from anon,authenticated;
grant select on public.research_settings,public.research_prompt_versions,public.research_run_inputs,
  public.research_briefings,public.research_candidates,public.research_findings to authenticated;
grant all on public.research_settings,public.research_prompt_versions,public.research_run_inputs,
  public.research_briefings,public.research_candidates,public.research_findings to service_role;
drop policy if exists "Research settings private" on public.research_settings;
create policy "Research settings private" on public.research_settings for select using(private.research_allowed(client_id,true));
drop policy if exists "Research versions private" on public.research_prompt_versions;
create policy "Research versions private" on public.research_prompt_versions for select using(private.research_allowed(client_id,true));
drop policy if exists "Research inputs private" on public.research_run_inputs;
create policy "Research inputs private" on public.research_run_inputs for select using(private.research_allowed(client_id,true));
drop policy if exists "Research briefings scoped" on public.research_briefings;
create policy "Research briefings scoped" on public.research_briefings for select using(private.research_allowed(client_id));
drop policy if exists "Research candidates scoped" on public.research_candidates;
create policy "Research candidates scoped" on public.research_candidates for select using(private.research_allowed(client_id));
drop policy if exists "Research findings scoped" on public.research_findings;
create policy "Research findings scoped" on public.research_findings for select using(private.research_allowed(client_id));

create or replace function public.save_research_settings(p_client_id uuid,p_expected_revision integer,
  p_prompt text,p_lookback_days integer,p_use_profile boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_revision integer;
begin
  if not private.research_allowed(p_client_id,true) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  if p_prompt is null or length(p_prompt) not between 10 and 12000 or p_lookback_days is null
    or p_lookback_days not between 1 and 30 or p_use_profile is null or p_expected_revision is null then
    return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
  insert into public.research_settings(client_id) values(p_client_id) on conflict do nothing;
  select revision into v_revision from public.research_settings where client_id=p_client_id for update;
  if v_revision<>p_expected_revision then return jsonb_build_object('ok',false,'code','REVISION_CHANGED'); end if;
  v_revision:=v_revision+1;
  insert into public.research_prompt_versions(client_id,revision,prompt,lookback_days,use_profile_context,created_by)
    values(p_client_id,v_revision,p_prompt,p_lookback_days,p_use_profile,auth.uid());
  update public.research_settings set revision=v_revision where client_id=p_client_id;
  return jsonb_build_object('ok',true,'revision',v_revision);
end $$;

-- Attach to the existing distributed lock; browser callers cannot invent a run.
create or replace function public.prepare_web_research(p_client_id uuid,p_run_id uuid,p_request_key uuid,p_revision integer,p_budget jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_profile jsonb; v_version public.research_prompt_versions; v_current integer;
begin
  if not private.research_allowed(p_client_id,true) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  if not exists(select 1 from public.research_runs where id=p_run_id and client_id=p_client_id
    and triggered_by_user_id=auth.uid() and status='running' and lock_key='rss_collect') then
    return jsonb_build_object('ok',false,'code','RUN_UNAVAILABLE'); end if;
  select revision into v_current from public.research_settings where client_id=p_client_id for share;
  if v_current is distinct from p_revision then return jsonb_build_object('ok',false,'code','REVISION_CHANGED'); end if;
  select * into v_version from public.research_prompt_versions where client_id=p_client_id and revision=p_revision;
  if not found then return jsonb_build_object('ok',false,'code','REVISION_CHANGED'); end if;
  if v_version.use_profile_context then
    -- Full form context, no supporting-file autofill or arbitrary compression.
    select to_jsonb(c)-array['agency_id','deleted_at','created_at','updated_at'] into v_profile
      from public.clients c where c.id=p_client_id and c.deleted_at is null;
  end if;
  insert into public.research_briefings(client_id,run_id,request_key,created_by,revision)
    values(p_client_id,p_run_id,p_request_key,auth.uid(),p_revision) returning id into v_id;
  insert into public.research_run_inputs(client_id,briefing_id,profile_snapshot,budget)
    values(p_client_id,v_id,v_profile,p_budget);
  return jsonb_build_object('ok',true,'id',v_id,'prompt',v_version.prompt,'lookbackDays',v_version.lookback_days,
    'useProfileContext',v_version.use_profile_context,'profile',v_profile);
exception when unique_violation then return jsonb_build_object('ok',false,'code','REQUEST_EXISTS');
end $$;

-- Service-only evidence commit. Recheck initiating actor, account and live lock
-- after the paid call; a removed member/password-gated actor cannot commit.
create or replace function public.finish_web_research(p_client_id uuid,p_briefing_id uuid,p_actor uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_b public.research_briefings; v_item jsonb;
begin
  select * into v_b from public.research_briefings where id=p_briefing_id and client_id=p_client_id for update;
  if not found or v_b.created_by<>p_actor then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  if not exists(select 1 from public.profiles where id=p_actor and active and not must_change_password)
    or not exists(select 1 from public.clients where id=p_client_id and deleted_at is null)
    or not (exists(select 1 from public.client_access where client_id=p_client_id and user_id=p_actor
      and role='client_admin' and invitation_status='accepted')
      or exists(select 1 from public.agency_members a join public.clients c on c.agency_id=a.agency_id
        where c.id=p_client_id and a.user_id=p_actor and a.role='agency_admin' and a.invitation_status='accepted')) then
    return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  if v_b.outcome<>'running' then return jsonb_build_object('ok',true,'id',v_b.id); end if;
  if not exists(select 1 from public.research_runs where id=v_b.run_id and client_id=p_client_id
    and triggered_by_user_id=p_actor and status='running') then return jsonb_build_object('ok',false,'code','RUN_UNAVAILABLE'); end if;
  if p_result->>'outcome' not in ('success','empty','partial','failed','not_configured')
    or jsonb_typeof(p_result->'candidates')<>'array' or jsonb_typeof(p_result->'findings')<>'array'
    or jsonb_array_length(p_result->'findings')>12 then
    return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
  for v_item in select value from jsonb_array_elements(p_result->'candidates') loop
    insert into public.research_candidates(client_id,briefing_id,url,evidence)
      values(p_client_id,v_b.id,v_item->>'url',v_item) on conflict(briefing_id,url) do nothing;
  end loop;
  for v_item in select value from jsonb_array_elements(p_result->'findings') loop
    insert into public.research_findings(client_id,briefing_id,fingerprint,payload)
      values(p_client_id,v_b.id,v_item->>'fingerprint',v_item) on conflict(briefing_id,fingerprint) do nothing;
  end loop;
  update public.research_briefings set outcome=p_result->>'outcome',summary=p_result->>'summary',
    coverage_gaps=p_result->'coverageGaps',error_code=p_result->>'errorCode',
    tool_calls=(p_result->>'toolCalls')::integer,candidate_count=jsonb_array_length(p_result->'candidates'),finished_at=now()
    where id=v_b.id and client_id=p_client_id;
  return jsonb_build_object('ok',true,'id',v_b.id);
end $$;

create or replace function public.review_research_finding(p_client_id uuid,p_finding_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.research_allowed(p_client_id,true) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  if p_status not in ('approved','archived') or p_status is null then return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
  update public.research_findings set approval_status=p_status,reviewed_by=auth.uid(),reviewed_at=now()
    where client_id=p_client_id and id=p_finding_id and content_idea_id is null;
  if not found then return jsonb_build_object('ok',false,'code','FINDING_UNAVAILABLE'); end if;
  return jsonb_build_object('ok',true);
end $$;

-- Explicit selection only. Lock finding rows in stable order; repeat requests
-- reuse the same idea, preserving the existing one-active-post invariant.
create or replace function public.select_research_findings(p_client_id uuid,p_finding_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_f public.research_findings; v_idea uuid; v_rows jsonb:='[]'; v_count integer;
begin
  if not private.calendar_draft_allowed(p_client_id) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
  if cardinality(p_finding_ids) not between 1 and 3 or p_finding_ids is null then
    return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
  select count(distinct id) into v_count from public.research_findings
    where client_id=p_client_id and id=any(p_finding_ids) and approval_status='approved';
  if v_count<>cardinality(p_finding_ids) then return jsonb_build_object('ok',false,'code','FINDING_UNAVAILABLE'); end if;
  for v_f in select * from public.research_findings where client_id=p_client_id and id=any(p_finding_ids) order by id for update loop
    if v_f.approval_status<>'approved' then raise exception 'Finding changed' using errcode='40001'; end if;
    v_idea:=v_f.content_idea_id;
    if v_idea is null then
      insert into public.content_ideas(client_id,source_type,source_ids_json,angle,commercial_relevance,belief_shift,source_context,status,allocation_bucket)
        values(p_client_id,'research_brief',jsonb_build_array(v_f.id),v_f.payload->>'angle',v_f.payload->>'whyItMatters',
          v_f.payload->>'agencyAction',jsonb_build_object('findingId',v_f.id),'ready','news') returning id into v_idea;
      update public.research_findings set content_idea_id=v_idea where id=v_f.id and client_id=p_client_id;
    end if;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object('findingId',v_f.id,'ideaId',v_idea));
  end loop;
  return jsonb_build_object('ok',true,'items',v_rows);
end $$;

revoke all on function public.save_research_settings(uuid,integer,text,integer,boolean),
  public.prepare_web_research(uuid,uuid,uuid,integer,jsonb),public.review_research_finding(uuid,uuid,text),
  public.select_research_findings(uuid,uuid[]) from public,anon,service_role;
grant execute on function public.save_research_settings(uuid,integer,text,integer,boolean),
  public.prepare_web_research(uuid,uuid,uuid,integer,jsonb),public.review_research_finding(uuid,uuid,text),
  public.select_research_findings(uuid,uuid[]) to authenticated;
revoke all on function public.finish_web_research(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_web_research(uuid,uuid,uuid,jsonb) to service_role;
