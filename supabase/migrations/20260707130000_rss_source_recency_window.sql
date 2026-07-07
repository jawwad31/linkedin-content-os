-- Add a per-source recency window for RSS collection.
--
-- RSS feeds often expose old evergreen entries alongside current news. The
-- collector now skips entries older than each source's configured window,
-- while entries without a parseable published date are still collected so
-- incomplete feeds are not silently discarded.

alter table public.rss_sources
  add column recency_days integer not null default 30
    check (recency_days between 1 and 365);
