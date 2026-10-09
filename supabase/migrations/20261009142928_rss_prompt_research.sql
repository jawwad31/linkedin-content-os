-- Jawad's 2026-10-09 decision: RSS feeds replace blog-page discovery.
-- Forward-only function changes; retain every existing source and revision.
create or replace function public.manage_research_source(p_client_id uuid,p_url text,p_kind text,p_source_id uuid default null,p_enabled boolean default true,p_archived boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid;
begin
 if not private.research_allowed(p_client_id,true) then return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 if p_url is null or p_url !~ '^https?://' or length(p_url)>2048 or p_kind is null or p_kind not in ('article','blog') or p_enabled is null or p_archived is null
   or (p_kind='blog' and (p_source_id is null or (p_enabled and not p_archived))) then
  return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
 perform 1 from public.clients where id=p_client_id for update;
 if p_source_id is not null then
  -- A retired blog can only be paused/archived, never resumed via an article payload.
  update public.research_sources set enabled=p_enabled and not p_archived,deleted_at=case when p_archived then now() else null end,configured_by=auth.uid()
   where id=p_source_id and client_id=p_client_id and deleted_at is null and kind=p_kind returning id into sid;
 else
  select id into sid from public.research_sources where client_id=p_client_id and url=p_url and deleted_at is null;
  if sid is null then
   if (select count(*) from public.research_sources where client_id=p_client_id and kind='article' and deleted_at is null)>=4 then return jsonb_build_object('ok',false,'code','SOURCE_LIMIT'); end if;
   insert into public.research_sources(client_id,url,kind,configured_by) values(p_client_id,p_url,p_kind,auth.uid())
    on conflict(client_id,url) do update set deleted_at=null,enabled=true,configured_by=auth.uid(),kind=excluded.kind returning id into sid;
  else
   if exists(select 1 from public.research_sources where id=sid and kind='blog') then return jsonb_build_object('ok',false,'code','VALIDATION_ERROR'); end if;
   update public.research_sources set configured_by=auth.uid(),enabled=p_enabled where id=sid and client_id=p_client_id;
  end if;
 end if;
 if sid is null then return jsonb_build_object('ok',false,'code','SOURCE_UNAVAILABLE'); end if;
 insert into public.audit_logs(client_id,user_id,action,entity_type,entity_id,metadata)
  values(p_client_id,auth.uid(),'research_source_saved','research_source',sid,jsonb_build_object('enabled',p_enabled));
 return jsonb_build_object('ok',true,'id',sid);
end $$;

-- Exact protected input snapshot: four imported article URLs and the twenty
-- most recent articles from active RSS feeds. No keywords/old relevance filter.
create or replace function public.load_rss_research_context(p_client_id uuid,p_actor uuid,p_briefing_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb; article_total integer; rss_total integer; days integer;
begin
 if not private.research_actor_allowed(p_client_id,p_actor) or not exists(
  select 1 from public.research_briefings b join public.research_runs r on r.id=b.run_id
  where b.client_id=p_client_id and b.id=p_briefing_id and b.created_by=p_actor and b.outcome='running' and r.status='running') then
  return jsonb_build_object('ok',false,'code','FORBIDDEN'); end if;
 select v.lookback_days into days from public.research_briefings b join public.research_prompt_versions v
  on v.client_id=b.client_id and v.revision=b.revision where b.client_id=p_client_id and b.id=p_briefing_id;
 with latest as (select distinct on(v.source_id,v.url) v.* from public.research_source_versions v
  join public.research_sources s on s.client_id=v.client_id and s.id=v.source_id
  where v.client_id=p_client_id and s.kind='article' and s.enabled and s.deleted_at is null order by v.source_id,v.url,v.created_at desc,v.id desc),
 ranked as(select *,row_number() over(partition by source_id order by created_at desc,id desc) as position from latest),
 selected as(select * from ranked order by position,created_at desc,id desc limit 4)
 select (select count(*) from latest),coalesce(jsonb_agg(jsonb_build_object('id',id,'url',url,'title',title,'text',content,'contentHash',content_hash,'fetchedAt',fetched_at,'kind','article')),'[]') into article_total,items from selected;
 with eligible as (
  select m.*,s.feed_url from public.market_signal_items m join public.rss_sources s on s.client_id=m.client_id and s.id=m.rss_source_id
  where m.client_id=p_client_id and m.deleted_at is null and s.active and s.deleted_at is null
   and ((m.published_at is not null and m.published_at between now()-make_interval(days=>days) and now())
     or (m.published_at is null and m.created_at>=now()-make_interval(days=>days)))
 ), selected as(select * from eligible order by coalesce(published_at,created_at) desc,id desc limit 20)
 select (select count(*) from eligible),items || coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'url',url,'title',title,'text',coalesce(summary,''),'contentHash',content_hash,'fetchedAt',created_at,
  'kind','rss','feedUrl',feed_url,'feedPublishedAt',published_at)),'[]') into rss_total,items from selected;
 update public.research_run_inputs set source_snapshot=items where client_id=p_client_id and briefing_id=p_briefing_id;
 return jsonb_build_object('ok',true,'sources',items,'omitted',greatest(0,article_total-4)+greatest(0,rss_total-20));
end $$;

revoke all on function public.manage_research_source(uuid,text,text,uuid,boolean,boolean) from public,anon,service_role;
grant execute on function public.manage_research_source(uuid,text,text,uuid,boolean,boolean) to authenticated;
revoke all on function public.load_rss_research_context(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.load_rss_research_context(uuid,uuid,uuid) to service_role;
