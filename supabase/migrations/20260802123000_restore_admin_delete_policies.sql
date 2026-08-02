-- Restore administrator hard-delete policies in environments where the
-- original delete-controls migration was not applied. Application services
-- still perform dependency checks before issuing DELETE statements.

drop policy if exists rss_sources_delete_admin on public.rss_sources;
drop policy if exists market_signal_items_delete_admin on public.market_signal_items;
drop policy if exists trend_cards_delete_admin on public.trend_cards;
drop policy if exists founder_experiences_delete_admin on public.founder_experiences;
drop policy if exists content_ideas_delete_admin on public.content_ideas;
drop policy if exists posts_delete_admin on public.posts;

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
