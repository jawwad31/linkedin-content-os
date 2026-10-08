# Current handoff

Updated: 2026-10-08

- Active editor: none after the P07 release handoff. Codex committed/pushed the implementation and verified deployment. Previous Claude acceptance-preparation edits and the Codex manual-testing deferral are preserved. Only one tool edits the checkout at a time.
- Phase: **P07 application deployed; production migration/provider configuration and manual acceptance remain pending.** P05/P06 retain their deferred manual gates; production Calendar drafting remains off. P08 and later are not started.
- Repository: jawwad31/linkedin-content-os, main. P07 feature commit `adf3693c9fe2713f86d613324c071d0818f2b13c` pushed; zero divergence from origin/main after push. This release-status documentation update follows the feature commit. Baseline before P07: `e0acab0`; before P06: `498edb1`.
- P04 correction: `b958580` (`fix: support standalone source modes and scoped redrafting`), pushed to main.
- P06 feature: `55fe6bb` (`feat: add resumable calendar drafting`), pushed to main. This final handoff update follows it as a documentation-only commit.
- Product name: Virel. Jawad works one prompt/phase at a time; do not start the next phase until instructed.

## P07 implementation (2026-10-08)

Jawad asked what "drafting stays off" meant and said "please proceed". Codex explained that only Calendar batch drafting is disabled; existing individual-post drafting remains available, and proceeded with P07. This supersedes the earlier instruction to wait before starting P07. Jawad subsequently answered "yes please proceed" to the explicit request to commit and push P07. Commit/push is now authorized. Calendar enablement, P08 and P09 remain outside this authorization.

- Baseline: `e0acab005984da85b1dc178744b80d2d816796de`; P07 feature commit: `adf3693c9fe2713f86d613324c071d0818f2b13c`, main. No branch or PR created.
- New web research code: `src/features/research/web-research/{contracts,provider,queries,service}.ts`, `research-workbench.tsx`; route `src/app/api/client/[client_id]/web-research/route.ts`. Existing Research page/tabs and run-guard/types extended. The guard still uses the shared `rss_collect` database lock with the existing worker.
- Exact starter prompt, immutable saved revisions, optimistic save/run checks, optional profile context initially off, bounded Responses web search, retained candidates, citation checks, separate reported dates/fetched time, development grouping and conservative follow-up/repeat labels. Successful empty, partial, failed and not-configured states are distinct. Provider input over budget fails explicitly; essential fields are not truncated.
- Administrator-only prompt versions and run inputs; scoped member reads for derived findings. SQL checks active profile/password/account/role and rechecks initiating actor before result commit. Service-only result writes; browser direct writes denied. Evidence approval and explicit multi-selection create separate ready ideas, then reuse existing planning/writing/QA/post-review services. Research alone creates no operational ideas, posts, assignments, editions or approvals.
- `src/features/posts/generate/service.ts` loads approved scoped findings with complete evidence for drafting/redrafting. `src/features/ideas/management/service.ts` reports a dependency conflict when an FK protects a linked idea. Existing approvals/manual publication, one active post per idea, capabilities and legacy inline research/custom-document paths remain.
- Migration: `supabase/migrations/20261007192100_prompt_controlled_web_research.sql`, created with Supabase CLI; additive and rerunnable. **Not applied to production.** New six tables and five narrow public transitions; original RSS data/worker/schema untouched. Backup/recovery verification is required before production application. Details and verification query: `docs/p07-deployment.md`.
- Environment-variable names: `OPENAI_API_KEY`, `OPENAI_RESEARCH_MODEL`, documented in `.env.example`. Both were absent in local names-only checks. Existing OpenRouter config remains for writing/RSS; `CALENDAR_DRAFTING_ENABLED` was not changed. No live paid provider call, credentials output or customer-content query was made for P07.
- Tests: `tests/web-research-{provider,queries,service,sql}.test.ts`, `tests/fixtures/web-research.ts`, plus approved-finding coverage in `tests/standalone-source-context.test.ts`. Final `npm run lint` and `npm run build` passed; `npm test`: **33 files / 283 tests passed**. `git diff --check` passed and the new/existing-file diff was reviewed. `npx tsc --noEmit` reports only the unchanged baseline `tests/profiles.test.ts:121` (`archetypes` is not in `StrategyCompatibility`); no new type errors. Migration tests apply all migrations fresh and rerun P07; queries cover pagination past the API row cap. No connected tests are inferred from these results.
- Complete changed-file groups: `.env.example`; `feature-checklist.md`; `docs/handoffs/CURRENT.md`, `docs/p06-deployment.md`, `docs/p07-deployment.md`; `src/app/client/[client_id]/research/page.tsx`; `src/app/api/client/[client_id]/web-research/route.ts`; all five `src/features/research/web-research/` files above; `src/features/research/research-tabs.tsx`, `research-runs/run-guard.ts`, `research-runs/types.ts`; `src/features/posts/generate/service.ts`; `src/features/ideas/management/service.ts`; the P07 migration; the six test/fixture files above. No package/lockfile change. Local CLI cache is excluded from the delivery.
- Manual tests: deferred by Jawad; no live source/date acceptance, authenticated responsive/keyboard QA, permission-user acceptance, marketing/unrelated-prompt acceptance or connected post generation claimed. The research-finding entry point is in the deployed application, pending schema/provider setup; standalone supplied-note/document UI remains unavailable. Do not retroactively mark P04/P06 checks passed.
- Commit/push: `adf3693` (`feat: add prompt controlled web research`), 24 reviewed files, pushed to origin/main successfully. Pre-commit lint/build were rerun and passed; the unchanged implementation's 33-file / 283-test pass remains valid. Environment/cache files excluded. Working tree contained only untracked `supabase/.temp/cli-latest` after push.
- Deployment verified on feature commit, 2026-10-08: Railway web `9431d57e-2d2e-4d17-8c47-2fbfdd4e640f` **SUCCESS** (09:04:47 UTC); worker `b8711468-3d0c-4b41-92f4-a6aa69d93a60` **SUCCESS** (09:04:02 UTC), both at `adf3693`. This documentation-only follow-up carries no application changes. Production web names confirm `OPENAI_API_KEY` and `OPENAI_RESEARCH_MODEL` absent; Calendar flag remains absent. No secrets queried or configuration changed. Blockers: production migration/provider setup and deferred acceptance. P07 is not complete.
- Read-only deployment smoke: production `/login` returns HTTP 200; unauthenticated `/client/2eecf9cd-6537-4020-baa9-5e57a76d6ff4/research` returns HTTP 307 to `/login`. This verifies availability and the route gate, not authenticated P07 functionality. No research run or database write was initiated.
- Next action: follow `docs/p07-deployment.md` for the additive SQL migration and web provider setup. Confirm target project and backup/recovery before applying SQL through the established SQL Editor procedure. Do not enable Calendar drafting or start P08. Preserve earlier acceptance history. Supabase CLI's untracked `supabase/.temp/cli-latest` is local cache only and must not be staged.

## Latest decision — manual testing deferred (2026-10-07)

Jawad instructed: "pass these test we will check these thinngs in extensive testing once all are done". Treat this as deferring the remaining manual checks until the extensive testing round after implementation, not evidence that those checks passed. Stop the step-by-step profile/source setup and Calendar acceptance guidance for now. This decision supersedes earlier next-step instructions in the acceptance history below.

- Retain all P04/P05/P06 required checks, including the supplied-note/document **not testable: no entry point** limitation, for the later testing round. No connected Calendar batch has been tested in this session.
- `CALENDAR_DRAFTING_ENABLED` remains absent/off in production. Deferring tests does not authorize production enablement or mark P06 complete.
- Verified preparation remains valid: Railway web `e0acab0` responds; its database target is user-confirmed; five Settings tabs were reported visible; Client 1's description presence/save audit are verified by counts. Client 1 ICP/offer and source preparation are unfinished.
- At this decision point P07 had not started. Jawad subsequently authorized proceeding on 2026-10-08; the P07 section above owns the current state.
- This continuation changed only `docs/handoffs/CURRENT.md`, `feature-checklist.md`, and `docs/p06-deployment.md`. Application behavior, access safeguards, database records, and deployment configuration were not changed by the agent. Documentation diff checks passed; automated lint/build/tests were not rerun. No commit or push was made or authorized.

## Rollout updates (2026-10-07, after the Codex handoff)

User-reported (not independently verified by an agent unless stated):

- Jawad ran both new migrations separately in the Supabase SQL Editor, successfully: `20261007060000_standalone_source_modes.sql` and `20261007070000_resumable_calendar_drafting.sql`. He then ran the read-only verification query and all five checks returned true (new source types, drafting table, seven slot columns, six drafting functions, installed database protections).
- Jawad saw a successful, active Railway **web** deployment of the commit containing `e0acab0` (P06). Claude did not inspect Railway.
- Connected manual acceptance has **not** been done. `CALENDAR_DRAFTING_ENABLED` defaults to false. Its actual value on Railway has not been confirmed. P06 stays "awaiting manual acceptance".

Independently verified by Claude (read-only, no secrets printed):

- The Supabase project in this machine's `.env.local` is ref `iphivwufbnmgbuqhicjn`. Through its PostgREST schema it has: the `calendar_draft_jobs` table, all seven new `calendar_slots` columns (`content_idea_id, draft_job_id, draft_brief, draft_attempts, lease_token, lease_expires_at, draft_error_code`), and all six drafting functions plus the P05 functions and `reserve_content_bank_source`. This corroborates Jawad's migration report for that project.
- NOT verified: that the Railway web service's `NEXT_PUBLIC_SUPABASE_URL` is the same ref. The deployed login page does not inline it. Jawad must compare it in Railway variables.
- This machine also has `OPENROUTER_*` set and Node 22.19.0, so drafting can be exercised locally with the flag on while Railway stays off.
- Data shape of that project: 3 workspaces (`AIXelerate` with 4 approved/published posts and 1 reusable founder experience; `Client 1` and `Client 2`, empty), 1 agency admin, no Account User memberships, 0 content resources, 1 saved October 2026 calendar with no slots, 0 reservations, 0 saved calendar defaults.
- Consequence: the P05 manual checks recorded as passed did not exercise a saved plan, reservations or defaults in this database. They should be repeated as part of P06 acceptance (the P06 checks need a committed plan anyway).
- Baseline re-run on `e0acab0`: 29 files / 255 tests pass, lint clean, `tsc` shows only the known `tests/profiles.test.ts:121` error.

## Acceptance log (2026-10-07, Claude): NO P06 manual check has passed yet

- GitHub: `main` = `e0acab0`; all 5 branches and 4 PRs checked via git and the GitHub API; nothing newer exists. Jawad believed GitHub was ahead because the last commit was made in Codex Cloud: that commit is `e0acab0`. If Codex Cloud holds anything else, it has not been pushed.
- Railway: `CALENDAR_DRAFTING_ENABLED` is **absent** on the web service, which the code treats as off (`process.env.CALENDAR_DRAFTING_ENABLED === "true"`). Intended; leave it off until acceptance passes. Whether Railway's `NEXT_PUBLIC_SUPABASE_URL` is ref `iphivwufbnmgbuqhicjn` is still unconfirmed.
- Jawad said "all tests done", but a read-only database check (counts, statuses and event names only) showed **no evidence of any P06 or P05 test**: no calendar defaults, no November calendar, no slots, no reservations, no draft jobs, no new posts; only the 4 old `AIXelerate` posts. The only activity from the testing session is one Content Bank entry created in `Client 1` at 2026-10-07 14:41 UTC. Either the tests ran against another database or they were not completed. Do not record any check as passed without an observed result.
- Jawad reports still seeing "old business context sections and fields" in Settings. Code at `e0acab0` has five tabs (Business Profile, ICP & Offer, Personal Brand, Voice & Style, Guardrails & Proof) inside a card still titled "Business Context", plus Supporting Documents and Team Access; legacy fields are kept on purpose (AGENTS.md). Unresolved: which site (localhost or Railway) and whether tabs are visible. One long un-tabbed form would mean Railway serves an older build.
- Not testable by hand: there is no UI or route that calls `generateStandalonePost`, so the "supplied note/document" source (`custom_upload`, `research_brief`) cannot be exercised manually. Asset, evergreen (`profile_led`) and experience paths are reachable through Calendar drafting, then Redraft on the review page. Record the standalone item as "not testable: no entry point", not as passed.
- A local `npm run dev` with `CALENDAR_DRAFTING_ENABLED=true` was run for validation and has been stopped. It used the same Supabase project, so anything created is real data. Use workspace `Client 1` (empty); `AIXelerate` holds real posts.
- Suggested small test: Calendar, November 2026, posts 3, shares 34/33/33/0, news cap 0 gives 1 experience + 1 asset + 1 evergreen slot. Client 1 currently has 1 founder experience and 0 lead magnets; the asset path needs at least one lead magnet (keyword in capitals, plus a delivery URL or instructions).
- Permission and isolation checks need test users that do not exist yet (data shows 1 agency admin and no Account User memberships): a planner-only user, a drafter-only user, and a user on `Client 2` only.
- This section is uncommitted local work.

## Acceptance continuation (2026-10-07, Codex)

- Jawad does not remember which site/workspace or actions his earlier "all tests done" report referred to. Start a fresh observed acceptance record, one step at a time. No P05/P06 manual gate is accepted by this continuation yet.
- Read the five canonical files in order, the acceptance log, P06 plan, product specification, and deployment checklist. Ran `git fetch origin`: `HEAD` and `origin/main` both equal `e0acab005984da85b1dc178744b80d2d816796de`. The existing local handoff edit was preserved.
- Railway connector access is available in this session. Production web service `linkedin-content-os` has latest deployment `d9527fa4-9a66-425e-954d-e80224db254c`, from `main` at `e0acab0`. It reported `SLEEPING`; a subsequent GET of its `/login` returned HTTP 200. No deployment or configuration was changed.
- Railway production variable names confirm `NEXT_PUBLIC_SUPABASE_URL` is set and `CALENDAR_DRAFTING_ENABLED` is absent. The latter is off by the verified code check. OAuth hides variable values. Jawad compared `NEXT_PUBLIC_SUPABASE_URL` in Railway's production web service and replied "matches" to `https://iphivwufbnmgbuqhicjn.supabase.co` on 2026-10-07. Database target is user-confirmed; its value was not independently read by the agent.
- Jawad opened the deployed app, Client 1 Settings, and reported "all five visible" for Business Profile, ICP & Offer, Personal Brand, Voice & Style, and Guardrails & Proof. The earlier Settings-tabs concern is resolved by his observation; no UI change was made.
- Client 1 profile preparation baseline, checked read-only after that report: `profile_revision = 1`; nonempty-field counts are zero for `business_description`, `primary_icp`, `main_offer`, `role_and_work`, and `personal_readers`. Queries returned only row counts and the revision, never field contents. Next guided action is to save a truthful business description, then verify its presence/revision before the next step.
- Business-description save check: Jawad reported "saved", but the subsequent read-only Client 1 check still returned `profile_revision = 1` and zero nonempty `business_description` rows (the other four checked fields also remain empty). Persistence is **not verified**; no save test is marked passed. Next step is to refresh Client 1 Settings and ask whether the entered description remains. Do not assume a code defect or proceed with further profile edits until the discrepancy is understood.
- Refresh follow-up: Jawad reported "Still there" after refreshing. A repeated read-only check of Client 1 (`2eecf9cd-6537-4020-baa9-5e57a76d6ff4`) still returns revision 1, zero nonempty descriptions, and zero `client_settings_updated` audit events. His visible description and the queried workspace are not reconciled yet. Next step is to request the Settings page's browser address to confirm the actual site and workspace ID; no further profile edits or code changes are warranted yet.
- Workspace discrepancy resolved: Jawad supplied the deployed Settings URL for client ID `818dd425-8819-4f2f-8e1a-b41142ebd0a0`, which is a different workspace from Client 1. Read-only counts confirm that workspace has a persisted description, profile revision 2, 16 ideas, and four existing posts (two approved, two published). Client 1 remains revision 1 with an empty description. The earlier five-tabs and save/refresh reports refer to the supplied workspace, not confirmed Client 1 checks. No save defect is established. Do not revert or otherwise edit that workspace's profile; guide testing through the exact Client 1 URL instead.
- Jawad asked when the next prompt will start. P06 has not run a connected draft batch yet; required Calendar/retry/cancellation/permission/manual checks and production enablement remain pending. Do not equate setup confirmation with phase completion or start P07 without an explicit request. Keep subsequent guidance focused on moving the Client 1 test toward the actual Calendar checks.
- Client 1 description now verified: Jawad supplied the correct Settings URL for `2eecf9cd-6537-4020-baa9-5e57a76d6ff4`. The subsequent read-only check shows `profile_revision = 2`, one nonempty `business_description` row, and one `client_settings_updated` audit event. No profile contents were read. `primary_icp`, `main_offer`, `role_and_work`, and `personal_readers` still have zero nonempty rows. Continue with Primary buyer ICP and Main offer on the ICP & Offer tab, then the minimum source preparation needed for Calendar testing.
- Fresh read-only checks using `.env.local` confirm project ref `iphivwufbnmgbuqhicjn`. Client 1 has one founder experience and zero lead magnets, calendar defaults, calendars, slots, jobs, source-use/reservation rows, ideas, posts, or Account memberships. Client 2 has none of those records. AIXelerate retains one calendar with no slots, 16 ideas, and four posts (two approved, two published), with no defaults, jobs, or source-use rows. Only counts/statuses and the explicitly named workspace identities were printed; no keys or source content were printed. No database records were changed.
- Port 3000 is occupied by an existing `node --env-file=.env server.mjs` process, not a verified Virel dev server. It was left running. If local acceptance is needed, use a confirmed free port rather than stopping that process.
- Supplied-note/document manual source acceptance remains **not testable: no entry point**. No new standalone entry point is authorized by this acceptance task.
- Changes in this continuation are documentation only. `git diff --check` passed. Automated lint/build/tests were not rerun; the earlier baseline below remains historical evidence. Nothing committed or pushed. Production drafting remains off.

## Database and deployment state

Jawad applied migrations `20261006150000` through `20261006190000` to production and reported the P05 manual checks passed. Their individual results were not itemised. P05 commits: `e9fd7b1`, `4160ec1`, `fb7f67f`; handoff correction `498edb1`.

This delivery adds two forward, rerunnable migrations:

1. `supabase/migrations/20261007060000_standalone_source_modes.sql`
2. `supabase/migrations/20261007070000_resumable_calendar_drafting.sql`

Original implementation environment (historical): no production database changes were executed by Codex, and no live Supabase/OpenRouter configuration was available in that cloud machine. Railway deployment and connected manual tests were unverified then. That environment had Node 22.19.0 and lockfile-installed dependencies, activated with `export PATH=/workspace/.onboarding/node22/node_modules/.bin:$PATH`. Current local/deployment evidence is recorded in the acceptance continuation above. The required rollout and manual checks remain in `docs/p06-deployment.md`.

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

Stop manual test guidance and Client 1 preparation for now, per Jawad's latest decision. The next planned prompt is P07 (saved prompt and manual web research); do not start it until explicitly requested. When the extensive testing round begins, resume the preserved P04/P05/P06 checklists and finish Client 1's minimum profile/source preparation. Keep production Calendar drafting off until its required gates and activation are confirmed. Record only observed results; deferred checks stay pending. Commit/push only when Jawad agrees.
