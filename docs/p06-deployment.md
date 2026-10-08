# P04 correction and P06 deployment

Read AGENTS.md, security-access.md, design.md, feature-checklist.md, and CONTRIBUTING.md in that order. P06 is implemented and deployed; manual acceptance is deferred. P07 and later are outside this delivery.

Current rollout status (2026-10-07): Railway web deployment at `e0acab0` and its login response are verified; migration application is reported by Jawad and earlier schema checks corroborate it. Jawad confirmed Railway uses the locally configured Supabase project. He has deferred the remaining manual checks below, plus P05 revalidation, to an extensive testing round after implementation. Preserve this checklist for that round. P06 is not manually accepted or complete; `CALENDAR_DRAFTING_ENABLED` remains absent/off in production. Supplied-note/document manual source checking is **not testable: no entry point** in the current UI/routes.

## Rollout order

1. Record the deployed web/worker commit and verify the normal production backup/recovery path. Keep `CALENDAR_DRAFTING_ENABLED=false` while applying the additive schema.
2. Apply `supabase/migrations/20261007060000_standalone_source_modes.sql`, then `supabase/migrations/20261007070000_resumable_calendar_drafting.sql` using the normal Supabase migration process. Neither migration deletes source records. Both are rerunnable. Railway web deployment does not apply SQL automatically.
3. Deploy the web commit containing `feat: add resumable calendar drafting`. The existing RSS worker remains unchanged and never starts writing batches. No worker redeploy is required for this feature.
4. Verify the normal web deployment result. Use a development/test account and configured Supabase/OpenRouter bindings for the checks below. No new provider credentials are required beyond the existing writing workflow. For local execution, activate Node 22 using the saved environment instructions, then `npm run dev` in `/workspace/linkedin-content-os`.
5. Set `CALENDAR_DRAFTING_ENABLED=true` in the validation environment, restart the web service, and run the manual checks. Keep production activation off until these gates pass. Confirm production migrations and deployment before enabling there.

## Required manual checks

- Create and redraft one asset-led post, one profile-led evergreen post, and one supplied-note/document post. Verify the intended source, reader, stage, and evidence. Also verify legacy experience/trend paths.
- Commit a small Calendar plan. Explicitly select two or three unfinished experience/asset/evergreen slots and confirm their topic, pillar, type, stage, reader, and takeaway. News slots remain placeholders until timely material is selected by a future supported flow.
- Generate the batch. Saved posts must remain in review, with QA concerns retained as warnings and no human approval granted by generation.
- Submit twice from two windows of the same user. There should be one active job, one live attempt, one backing idea per slot, one active post per idea, and no second source reservation.
- Close the page after at least one saved draft. Reopen and Resume. A live attempt reports busy. A stopped attempt is recoverable after its 15-minute lease expires. Successful drafts retain their original IDs and usage history.
- Pause after an attempt. Confirm no next request starts until Resume. Fail one generation safely, then select only that failed slot for retry. The brief/idea/reservation stay the same; success is not regenerated. At three attempts the slot stops and requires an explicit replan.
- Cancel an unfinished batch from a second authenticated admin window while a request is running. Saved drafts remain; unfinished reservations release; the late result cannot commit. Provider calls already sent may incur charges even after cancellation.
- Attempt a P05 replan and Cancel unfinished slots while the batch is queued/running. Queued/running slots must be preserved. Use the batch cancellation control to release them deliberately.
- Verify a planner-only and a drafter-only user cannot start/execute a batch. A member needs both `ideas_manage` and `posts_draft`, or scoped administrator access. Revoke access mid-attempt and confirm no later provider stage or result commit succeeds. Verify another account cannot read or operate the job.
- Archive the selected source mid-attempt and confirm result commit fails without consuming it. Restore it only intentionally. An insert failure must leave no partial post/slot/use changes.
- Verify forced password change, existing manual review/publication, and admin deletion safeguards still work. Check the Calendar controls at 375px, 768px, and desktop with keyboard focus.

## Limits and rollback

Jobs are user-triggered web requests, up to ten slots per batch and three attempts per slot. No autonomous scheduler is added. Closing the page pauses new requests; an in-flight request may complete. Leases are renewed before paid stages and before result commit. Permission/account/password checks run again in the database. Stale lease tokens cannot commit. Post creation, source-use completion, idea use, and slot linking commit together.

The test harness uses single-connection PostgreSQL 18 via PGlite; it verifies competing claims sequentially, not true simultaneous database transactions. The two-window checks above remain required. Actual provider charges are not estimated as a fixed dollar amount; existing LLM logs retain token/cost metadata. The UI reports saved/failed/pending counts and attempts.

New job writes use narrow `SECURITY DEFINER` transitions with a fixed empty search path and explicit capability/scope gates. Reads use RLS. API roles cannot write job rows or forge drafting metadata, leases, or a new post for a Calendar backing idea. Existing P05 plan/cancel functions stay `SECURITY INVOKER` and now preserve queued/running slots.

If a gate fails, disable `CALENDAR_DRAFTING_ENABLED`, stop new requests, and cancel outstanding batches deliberately where appropriate. Keep the additive schema and saved drafts. Use an ordinary app revert/forward fix as described in CONTRIBUTING.md; do not reset/drop the database to roll back this feature.
