-- Feature 15 — Research Run Tracking + Distributed Run Guard
--
-- research_runs already exists (Feature 03/04) with client_id,
-- triggered_by_user_id, trigger_type, status, stage, error_message,
-- lock_key, started_at, finished_at. This migration adds only what's
-- missing:
--
--   1. Minimal numeric summary columns so a run's collection counts (from
--      collectForClient) can be stored without a new table or a jsonb blob.
--   2. A partial unique index on (client_id, lock_key) where status =
--      'running' — a database-enforced distributed lock. Only one running
--      run can exist per client_id + lock_key at a time, across any number
--      of worker replicas, overlapping intervals, or future manual-trigger
--      requests. An INSERT that would violate it fails with a unique
--      violation (23505), which the app treats as "already running, skip."
--
-- No RLS changes: existing accepted-access select / owner-editor
-- insert-update policies already cover this table correctly (Feature 04).
-- The worker writes through the service-role admin client, which bypasses
-- RLS entirely — same pattern already used for audit_logs/llm_logs — since
-- a worker process has no authenticated user session to check.

alter table public.research_runs
  add column sources_processed integer not null default 0,
  add column total_fetched integer not null default 0,
  add column total_new integer not null default 0,
  add column skipped_duplicate integer not null default 0,
  add column skipped_invalid integer not null default 0,
  add column skipped_error integer not null default 0,
  add column error_count integer not null default 0;

create unique index research_runs_running_lock_idx
  on public.research_runs (client_id, lock_key)
  where status = 'running' and lock_key is not null;
