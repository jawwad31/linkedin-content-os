-- Migration: Add Admin Hard Delete Controls
-- Adds DELETE RLS policies to the 6 target tables to allow client_admin and agency_admin to delete records,
-- and adds PL/pgSQL database functions for transaction-safe TrendCard and Post deletion.

-- Drop policies if they already exist
drop policy if exists rss_sources_delete_admin on public.rss_sources;
drop policy if exists market_signal_items_delete_admin on public.market_signal_items;
drop policy if exists trend_cards_delete_admin on public.trend_cards;
drop policy if exists founder_experiences_delete_admin on public.founder_experiences;
drop policy if exists content_ideas_delete_admin on public.content_ideas;
drop policy if exists posts_delete_admin on public.posts;

-- Create DELETE policies allowing only client_admin and agency_admin (denying client_user by exclusion)
create policy rss_sources_delete_admin
  on public.rss_sources
  for delete
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

create policy market_signal_items_delete_admin
  on public.market_signal_items
  for delete
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

create policy trend_cards_delete_admin
  on public.trend_cards
  for delete
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

create policy founder_experiences_delete_admin
  on public.founder_experiences
  for delete
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

create policy content_ideas_delete_admin
  on public.content_ideas
  for delete
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin']));

create policy posts_delete_admin
  on public.posts
  for delete
  to authenticated
  using (public.has_client_access(client_id, array['agency_admin', 'client_admin']));


-- Create atomic database function for TrendCard deletion and article status restoration
create or replace function public.delete_trend_card_and_restore_articles(
  p_client_id uuid,
  p_trend_card_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_article_ids uuid[];
  v_article_id uuid;
  v_other_exists boolean;
begin
  -- 1. Check dependencies
  if exists (
    select 1
    from public.founder_experiences
    where client_id = p_client_id
      and source_trend_card_id = p_trend_card_id
      and deleted_at is null
  ) or exists (
    select 1
    from public.content_ideas
    where client_id = p_client_id
      and source_ids_json @> jsonb_build_array(p_trend_card_id::text)
      and deleted_at is null
  ) then
    raise exception 'This TrendCard cannot be deleted because downstream content depends on it.'
      using errcode = 'foreign_key_violation';
  end if;

  -- 2. Capture cited articles
  select coalesce(array(
    select jsonb_array_elements_text(source_item_ids_json)::uuid
    from public.trend_cards
    where id = p_trend_card_id
      and client_id = p_client_id
      and deleted_at is null
  ), array[]::uuid[]) into v_article_ids;

  -- 3. Delete TrendCard (will fail if user lacks RLS DELETE privilege)
  delete from public.trend_cards
  where id = p_trend_card_id
    and client_id = p_client_id;

  if not found then
    raise exception 'TrendCard not found.'
      using errcode = 'no_data_found';
  end if;

  -- 4. Restore article statuses
  if v_article_ids is not null then
    foreach v_article_id in array v_article_ids loop
      if exists (
        select 1
        from public.market_signal_items
        where id = v_article_id
          and client_id = p_client_id
          and status = 'used'
          and deleted_at is null
      ) then
        -- check if another active TrendCard cites it
        select exists (
          select 1
          from public.trend_cards
          where client_id = p_client_id
            and source_item_ids_json @> jsonb_build_array(v_article_id::text)
            and deleted_at is null
        ) into v_other_exists;

        if not v_other_exists then
          update public.market_signal_items
          set status = 'relevant'
          where id = v_article_id
            and client_id = p_client_id;
        end if;
      end if;
    end loop;
  end if;
end;
$$;

grant execute on function public.delete_trend_card_and_restore_articles(uuid, uuid) to authenticated;


-- Create atomic database function for Post deletion and Content Idea restoration
create or replace function public.delete_post_and_restore_idea(
  p_client_id uuid,
  p_post_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_idea_id uuid;
  v_other_exists boolean;
  v_idea_status text;
begin
  -- 1. Capture content_idea_id
  select content_idea_id
  into v_idea_id
  from public.posts
  where id = p_post_id
    and client_id = p_client_id
    and deleted_at is null;

  if not found then
    raise exception 'Post not found.'
      using errcode = 'no_data_found';
  end if;

  -- 2. Delete Post (will fail if user lacks RLS DELETE privilege)
  delete from public.posts
  where id = p_post_id
    and client_id = p_client_id;

  -- 3. Restore Idea if applicable
  if v_idea_id is not null then
    select exists (
      select 1
      from public.posts
      where client_id = p_client_id
        and content_idea_id = v_idea_id
        and deleted_at is null
    ) into v_other_exists;

    if not v_other_exists then
      select status
      into v_idea_status
      from public.content_ideas
      where id = v_idea_id
        and client_id = p_client_id
        and deleted_at is null;

      if found and v_idea_status <> 'archived' then
        update public.content_ideas
        set status = 'ready'
        where id = v_idea_id
          and client_id = p_client_id;
      end if;
    end if;
  end if;
end;
$$;

grant execute on function public.delete_post_and_restore_idea(uuid, uuid) to authenticated;
