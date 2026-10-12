-- A collected RSS article can keep the full text of its page.
--
-- Additive only: two nullable columns on market_signal_items. No data is changed or
-- removed, no policy is touched (the existing update policy already limits changes to
-- admins and people with the research_contribute capability) and no function is added.
--
-- full_text is filled when someone saves the article to the Content Bank: the page is read
-- once through the app's public-page reader and the readable text is kept here, so drafting
-- from the entry has the whole article instead of the feed's short teaser. It is private
-- AI context for that company; it is never shown on a screen or published.
-- full_text_fetched_at records when it was read. Both stay null if the page could not be read.

alter table public.market_signal_items
  add column if not exists full_text text,
  add column if not exists full_text_fetched_at timestamptz;
