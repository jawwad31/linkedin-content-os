-- Feature 18 (security correction) — tighten market_signals RLS
--
-- market_signals is populated exclusively by trusted server-side code —
-- the Market Signal synthesizer (Feature 18), via the service-role admin
-- client, which bypasses RLS entirely and is unaffected by this migration.
-- The owner/editor insert/update policies added in Feature 04 anticipated
-- a browser-driven write path that was never built that way — mirroring
-- research_runs's identical correction in
-- 20260706110000_research_runs_rls_tighten.sql: an authenticated browser
-- session must not be able to insert/update market_signals directly, even
-- as an owner/editor. Founder Take editing and Approve for Ideas
-- (Feature 19) will go through dedicated, server-validated routes using
-- the admin client, not direct RLS-gated browser writes.
--
-- Unaffected by this migration:
--   - market_signals_select_accepted_access (read access for any accepted
--     client role — owner, editor, or viewer — is preserved as-is).
--   - RLS stays enabled on market_signals.
--   - The service role continues to bypass RLS for synthesizer writes.
--
-- No delete policy exists on market_signals today (soft-delete-only
-- convention), so the delete drop below is a defensive no-op if that ever
-- changes.

drop policy if exists market_signals_insert_owner_editor on public.market_signals;
drop policy if exists market_signals_update_owner_editor on public.market_signals;
drop policy if exists market_signals_delete_owner_editor on public.market_signals;
