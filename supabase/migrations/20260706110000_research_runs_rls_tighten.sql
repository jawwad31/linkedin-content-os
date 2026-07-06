-- Feature 15 (security correction) — tighten research_runs RLS
--
-- research_runs is an operational system table. All writes to it come
-- exclusively from trusted server-side code — the worker's run guard
-- (Feature 15), via the service-role admin client, which bypasses RLS
-- entirely and is unaffected by this migration. The owner/editor
-- insert/update policies added in Feature 04 anticipated a browser-driven
-- write path that was never built that way, so they're removed here: an
-- authenticated browser session must not be able to insert/update
-- research_runs directly, even as an owner/editor.
--
-- Unaffected by this migration:
--   - research_runs_select_accepted_access (read access for any accepted
--     client role — owner, editor, or viewer — is preserved as-is).
--   - RLS stays enabled on research_runs.
--   - The service role continues to bypass RLS for worker writes.
--
-- No delete policy exists on research_runs today (soft-delete-only
-- convention, and this table isn't soft-deleted at all), so the delete
-- drop below is a defensive no-op if that ever changes.

drop policy if exists research_runs_insert_owner_editor on public.research_runs;
drop policy if exists research_runs_update_owner_editor on public.research_runs;
drop policy if exists research_runs_delete_owner_editor on public.research_runs;
