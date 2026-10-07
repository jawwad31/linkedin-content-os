# Current handoff

Updated: 2026-10-07

- Active editor: none (Codex finished implementation and stopped at the deployment/manual gates). No other coding tool edited the checkout.
- Phase: **P05 complete. P04 source-mode correction and P06 implemented, awaiting production migration, deployment verification, and manual acceptance.** P07 and later are not started.
- Repository: jawwad31/linkedin-content-os, main. Baseline: `498edb1`.
- P04 correction: `b958580` (`fix: support standalone source modes and scoped redrafting`), pushed to main.
- P06 feature: `55fe6bb` (`feat: add resumable calendar drafting`), pushed to main. This final handoff update follows it as a documentation-only commit.
- Product name: Virel. Jawad works one prompt/phase at a time; do not start the next phase until instructed.

## Database and deployment state

Jawad applied migrations `20261006150000` through `20261006190000` to production and reported the P05 manual checks passed. Their individual results were not itemised. P05 commits: `e9fd7b1`, `4160ec1`, `fb7f67f`; handoff correction `498edb1`.

This delivery adds two forward, rerunnable migrations:

1. `supabase/migrations/20261007060000_standalone_source_modes.sql`
2. `supabase/migrations/20261007070000_resumable_calendar_drafting.sql`

No production database changes were executed by Codex. No live Supabase/OpenRouter configuration is available in this cloud machine. Railway deployment and connected manual tests are unverified. The required rollout and manual checks are in `docs/p06-deployment.md`. The environment has Node 22.19.0 and lockfile-installed dependencies; activate `export PATH=/workspace/.onboarding/node22/node_modules/.bin:$PATH` for each shell.

`CALENDAR_DRAFTING_ENABLED` defaults false. Apply schema before enabling web code. Enable it only in a configured validation environment until the manual gates pass, then confirm production schema/deployment before production activation. Existing OpenRouter/Supabase variable names remain unchanged; no new secret is required. No RSS worker changes or new scheduler were introduced.

## P04 correction

Reproduced the source-type CHECK failure on PostgreSQL via PGlite before fixing it. The forward constraint accepts all seven `SOURCE_MODES` and still rejects unknown modes. Initial drafting/redrafting now share scoped loaders for assets, current profile context, ready account-owned documents, supplied upload notes, and research briefs. Inline notes persist in protected `content_ideas.source_context`, never ordinary logs. Legacy experience/trend/reaction loaders stay intact. Missing sources fail closed.

Correction validation: 26 files / 222 tests, lint, build, and diff checks passed. Its production source-path checks remain pending.

## P06 implementation

- Explicit batches of up to ten selected unfinished slots; topic, pillar, post type, funnel stage, reader, and takeaway are saved as each slot's brief. News placeholders are not draftable until timely material has a supported selection flow.
- One active job per calendar, caller-stable request key, one backing idea per slot, a 15-minute lease/token, renewals before paid stages and commit, and three attempts per slot across retries/restarts.
- A user-triggered web pump executes one slot per request using the same scoped source loader, planner, writer, deterministic checks, and independent QA as standalone drafting. Resume starts the next request; closing the page stops new requests, while an in-flight request may complete.
- Every sensitive database transition rechecks account/password state and both `ideas_manage` and `posts_draft` (or scoped administrator access). Only the initiating user resumes a job; its owner or a scoped administrator with drafting permission can cancel it.
- Atomic completion inserts the post in review, commits source usage, marks the idea used, and links the slot. Failed inserts roll back all of these. A stale lease/cancelled job cannot commit; retries reuse the idea/reservation, and completed slots never regenerate.
- Cancellation retains successful drafts and invalidates unfinished leases/releases their reservations. Failed attempts keep a reservation available for deliberate retry or cancellation; they do not mark the source used.
- Queued/running slots are preserved by P05 replan/cancel and excluded from its selectable source inventory. Generic idea generation cannot bypass the Calendar lease/commit path. New job reads use RLS, and direct API writes cannot forge draft state, leases, or backing posts.
- QA is advisory and retained as warnings; all drafts still need human review. The UI reports saved/failed/pending counts and attempts, without promising a fixed provider cost. Already-sent provider calls cannot be refunded by cancellation.

## Exact P06 files

- `.env.example`
- `src/app/client/[client_id]/calendar/page.tsx`
- `src/features/calendar/actions.ts`
- `src/features/calendar/calendar-panel.tsx`
- `src/features/calendar/calendar-plan-view.tsx`
- `src/features/calendar/queries.ts`
- `src/features/calendar/calendar-drafting-panel.tsx`
- `src/features/calendar/draft-executor.ts`
- `src/features/calendar/drafting-contracts.ts`
- `src/features/calendar/drafting-service.ts`
- `src/features/posts/generate/service.ts`
- `supabase/migrations/20261007070000_resumable_calendar_drafting.sql`
- `tests/calendar-panel.test.ts`
- `tests/calendar-draft-executor.test.ts`
- `tests/calendar-drafting-service.test.ts`
- `tests/calendar-drafting-sql.test.ts`
- `tests/generate-warning-paths.test.ts`
- `feature-checklist.md`
- `docs/p06-deployment.md`
- `docs/handoffs/CURRENT.md`

## Final validation

- `npm test`: **29 files, 255 tests passed** (P05 baseline 24 / 216).
- `npm run lint`: passed.
- `npm run build`: passed using standard Next.js production build; Google Fonts access worked during this implementation.
- `npx tsc --noEmit`: the sole pre-existing error in `tests/profiles.test.ts:121` (`archetypes` is not in `StrategyCompatibility`) remains; no new type errors.
- Diff/working-tree review: performed before committing; only this delivery's files changed.
- Every migration applies on PostgreSQL 18 via PGlite. P06 reapplication retains an active batch. The combined P04/P06 single-transaction deployment script also re-applies successfully to the migrated test instance.
- Tests cover duplicate requests/claims, expiry/recovery, mixed success, atomic rollback, cancelled/stale results, retained ideas/reservations, source/idea substitution, attempt limits, strict brief validation, permission revocation, password/account state, cross-account reads, anonymous denial, API write forgery, optional editorial controls, and cancellation before/between real writer stages.
- Connected UI/provider/production manual checks were **not run**. PGlite is single-connection: true simultaneous transactions/two-window contention remain a manual gate. Responsive/keyboard manual acceptance is also pending.

## Preserved behavior and gotchas

- Manual provisioning, temporary-password gate, agency/account isolation, capability model, independent QA, one active post per idea, human review, approval invalidation, and manual publishing remain in place.
- PostgREST HEAD failures may return `error: null`; use GET with `limit(1)` when the error matters.
- `reserveSourceEntryWithoutLock` remains the pre-P05 fallback in `usage-service.ts`. Its removal needs confirmation of migration coverage in every environment; P06 itself uses the committed slot's SQL reservation and never calls that fallback.
- Existing internal hard-delete paths must respect new Calendar references. Do not remove dependencies or source-usage history to make a delete pass.

## Next action

Apply both new migrations in order and follow `docs/p06-deployment.md` to verify web deployment, enable the validation flag, and complete the connected manual checks. Mark P06 complete only after those gates pass. Do not begin P07 until Jawad requests it.
