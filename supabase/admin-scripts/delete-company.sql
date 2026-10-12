-- PERMANENTLY DELETE A COMPANY (run by hand in the Supabase SQL Editor; this is not a migration).
--
-- THIS CANNOT BE UNDONE. It removes the company and everything under it: posts, ideas,
-- Content Bank entries, resources, documents (database rows), the calendar, research,
-- newsletters, logs, audit history and who had access. Take a backup first.
--
-- It is all-or-nothing: if anything fails, or any row is left behind, the whole thing is
-- rolled back and nothing is deleted. People's logins are NOT deleted (see the guide).
--
-- Before running: do the preflight in docs/company-accounts.md. Then replace the two
-- values below, and run the whole block.
--
--   __COMPANY_ID__    the company's id (from the Companies list URL, or  select id, name from public.clients;)
--   __COMPANY_NAME__  its name, typed exactly as saved. A wrong name stops the script.

do $$
declare
  v_company uuid := '__COMPANY_ID__'::uuid;
  v_name text := '__COMPANY_NAME__';
  v_saved text;
  r record;
  v_left bigint;
begin
  select name into v_saved from public.clients where id = v_company;
  if v_saved is null then
    raise exception 'No company has the id %. Nothing was deleted.', v_company;
  end if;
  if v_saved is distinct from v_name then
    raise exception 'The name you typed does not match the saved name "%". Nothing was deleted.', v_saved;
  end if;

  -- Newsletters
  delete from public.newsletter_sources  where client_id = v_company;
  delete from public.newsletter_attempts where client_id = v_company;
  delete from public.newsletter_versions where client_id = v_company;
  delete from public.source_usage        where client_id = v_company;
  delete from public.newsletter_editions where client_id = v_company;

  -- Calendar
  delete from public.calendar_slots      where client_id = v_company;
  delete from public.calendar_draft_jobs where client_id = v_company;
  delete from public.content_calendars   where client_id = v_company;
  delete from public.calendar_defaults   where client_id = v_company;

  -- Research
  delete from public.research_notifications   where client_id = v_company;
  delete from public.research_candidates      where client_id = v_company;
  delete from public.research_run_inputs      where client_id = v_company;
  delete from public.research_occurrences     where client_id = v_company;
  delete from public.research_findings        where client_id = v_company;
  delete from public.research_schedules       where client_id = v_company;
  delete from public.research_briefings       where client_id = v_company;
  delete from public.research_prompt_versions where client_id = v_company;
  delete from public.research_settings        where client_id = v_company;
  delete from public.research_runs            where client_id = v_company;
  delete from public.research_source_versions where client_id = v_company;
  delete from public.research_sources         where client_id = v_company;

  -- Posts, ideas and the Content Bank
  delete from public.posts               where client_id = v_company;
  delete from public.content_ideas       where client_id = v_company;
  delete from public.content_resources   where client_id = v_company;
  delete from public.founder_experiences where client_id = v_company;
  delete from public.trend_cards         where client_id = v_company;
  delete from public.market_signal_items where client_id = v_company;
  delete from public.rss_sources         where client_id = v_company;
  delete from public.client_documents    where client_id = v_company;

  -- Logs and access
  delete from public.llm_logs     where client_id = v_company;
  delete from public.audit_logs   where client_id = v_company;
  delete from public.client_access where client_id = v_company;

  delete from public.clients where id = v_company;

  -- Safety net: no table with a client_id column may still hold a row for this company,
  -- including tables added after this script was written. If one does, everything above
  -- is rolled back and the message names the table.
  for r in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'client_id' and table_name <> 'clients'
  loop
    execute format('select count(*) from public.%I where client_id = $1', r.table_name)
      into v_left using v_company;
    if v_left > 0 then
      raise exception 'Table % still holds % rows for this company. Nothing was deleted; this script needs updating.', r.table_name, v_left;
    end if;
  end loop;
end $$;
