# LinkedIn OS implementation plan

Prepared 2026-10-06 for Jawad. Deliverable: an implementation and documentation handoff, not an application-code change.

## Recommendation

Extend the existing app in deployable slices. Build reliable sources and shared generation first, then calendars, prompt-led research, and newsletters. Keep the current framework, auth, permissions, and writing/QA pipeline. Do not rebuild the app or adopt a large agent-orchestration framework for this scope.

Give one phase prompt from `EXECUTION-PROMPTS.md` to one coding tool at a time. Each phase can be split into a small number of coherent commits; do not combine all phases into one coding request. Use `docs/handoffs/CURRENT.md` to switch between Claude, ChatGPT/Codex, and Gemini.

## 1. Verified baseline and limitations

Repository: [jawwad31/linkedin-content-os](https://github.com/jawwad31/linkedin-content-os), private; connected access and live file reads succeeded. Main was reported at `e42493f704d8b872e32bcf35241bc3bab556bb99` during this review. Reads were taken from main during the session, not from a locked immutable checkout; refresh before implementation.

The active documentation is under `md files/`, not repository root. Those files are newer than the supplied attachments. Root AGENTS.md was absent. The older uploaded documents would regress roles, user provisioning, design tokens, Resources support, and current generation contracts if installed unchanged.

| Observed surface | Implementation implication |
|---|---|
| package.json: Next.js 16, React 19, TypeScript, Supabase, Zod, Vitest; lint/build/test/worker scripts | Extend existing stack and tests; versions remain governed by the lockfile |
| `src/components/app-shell/nav-items.ts` includes Resources and Posts | Consolidate navigation after functional parity, not by deleting services |
| `src/features/resources/schemas.ts` | Resources currently stores asset metadata, delivery URL/instructions, keyword, active and gating approval; no file-ingestion field is present in this schema |
| `src/lib/ai/playbooks/taxonomies.ts` | Three source modes, separate angle/archetype/structure/framework/hook/CTA enums; preserve old records while adding the simpler editorial model |
| `src/features/ideas/generate/service.ts` | Existing source loading, resources, generation-plan persistence/hash, strategy compatibility, scoped access |
| `src/features/posts/generate/service.ts` | Stored-plan reuse/replanning, deterministic checks, independent QA, one active post per idea, idempotent return of existing post |
| `src/features/research/run-research-agent/service.ts` | Manual collect/classify/synthesize pipeline and distributed run-guard reuse |
| Live `md files/security-access.md` | Manual admin provisioning, six configurable Account User capabilities, admin-only resource management, scoped hard deletion |

This was a targeted implementation review, not a full security audit or deployment verification. Live database schema, migrations, RLS functions, worker configuration, provider keys, actual production behavior, and integration entitlements were not independently exercised. Existing docs report MVP implementation but still list pending manual deletion verification. Do not convert those statements into a claim that all production checks passed.

## 2. Agreed product changes

The authoritative detailed behavior is `docs/planning/product-spec.md`:

- Two manually maintained profiles, with separate business/personal positioning and broader personal readership.
- Content Bank merges experience and Resources UX while keeping lead magnets distinct.
- Standalone creation and monthly planning share one writer/QA pipeline.
- User-selected source shares and news cap per month, with separately saved defaults.
- Explicit reuse eligibility, atomic reservations, and history across posts/newsletters.
- Markdown source files, direct loading of selected evidence, relevant document retrieval, no autofill/conflict subsystem.
- Editable independent research prompt, scheduled web research, source monitoring, deduped briefings, human-selected downstream use.
- Frontend post type, pillar, reader, takeaway, and Discovery/Depth/Authority/Commercial stage.
- Newsletter editions can use both research and experience. Manual publication is the initial delivery route.

Writing-example analysis should happen now, externally: choose roughly 10–15 posts across 2–3 writers plus your own examples, extract preferences, then approve a voice guide. This is a recommended exercise, not a mandatory onboarding or scraping feature.

## 3. Architecture and data recommendations

These are recommended implementation designs to validate in P00, not claimed existing schema.

### Shared services

Use a source resolver, context builder, editorial brief/plan, existing writer, existing independent QA, and versioned review as one path. Calendar and standalone are entry points; newsletters reuse source/context/evidence helpers with an edition-specific output contract.

Keep OpenRouter writing adapters. Add a small `DocumentRetrievalProvider` and `WebResearchProvider`, server-only. Recommended initial provider: OpenAI hosted retrieval and Responses web search. Hosted vector-store search can return passages for the existing writer; a complete move of writing to OpenAI is unnecessary. Provider choice, storage/usage cost, data handling, and actual account access must be checked before enabling paid jobs. No fixed model names or claimed sub-$50 guarantee.

### Proposed records

| Record | Minimum responsibility | Migration approach |
|---|---|---|
| clients profile fields/validated profile objects | Separate business and personal contexts, revisions | Preserve active columns; add only missing fields; no unvalidated giant JSON blob |
| content_bank_entries | Stable identity, category, raw/organized notes, readiness, allow_reuse, legacy mapping | Add index/adapter pointing to existing founder_experiences/content_resources initially; avoid copying mutable payloads into two owners |
| source_documents and versions | Private original, purpose, owner, hash, processing status, provider mapping | Private storage plus additive metadata; versions are immutable |
| calendar_defaults | Versioned per-account post count, shares/cap, balances/timezone | One current defaults record; no forced preset |
| content_calendars and calendar_slots | Unique account/month plan, configuration snapshot, slot/source/brief/output link | One active monthly calendar initially; replans are revisions |
| content_assignments/source_usage | Owner output, primary/supporting sources, reservation/use status, idempotency | Shared across standalone, calendars, newsletters; count inventory here |
| research_settings/config versions | Saved prompt, timezone/schedule, lookback, monitor options, profile toggle | One active research configuration per account initially |
| research_runs/findings | Run configuration snapshot, citations/dates, grouped developments, outcomes | Reuse existing run/article/TrendCard structures where suitable; avoid duplicate research systems |
| newsletter_editions | Selected sources, outline, sections, versions, QA/approval/publication | New account-scoped records using shared evidence/reuse services |

Exact table names are recommendations. Prefer extending current schema over duplicating an existing equivalent. Use composite `(client_id, id)` references or equivalent database constraints to prevent cross-account relationships. Index actual list/lookup paths; no graph database is needed.

### Migration strategy

Expand → backfill → verify → switch reads/writes → retain compatibility. Backfills must be idempotent and preserve source IDs, approved proof, existing resource delivery/gating, old ideas/posts, and historical usage. Record before/after counts and invalid references. Old three-mode plans remain readable; new contracts get a new version and deterministic adapters. Unknown historical provenance remains unknown.

Do not remove the existing post-per-idea constraint to implement source reuse. Create a new idea/assignment for a deliberate new use. Add future calendar/newsletter dependencies to delete services before they can reference old records. Avoid silent cascading deletes or treating deletion as permission to forget a published use.

## 4. Execution phases

All phases use the five-file read order, shared Git gates in CONTRIBUTING.md, safe migrations, and the compact completion report. Suggested new feature folders below are not claims that those folders already exist.

### P00 — Canonical documentation and baseline reconciliation

**Outcome:** any coding tool starts from the same current rules.

Install root canonical documents from this package; preserve the live `md files/` versions as historical reference, then replace old active copies with pointers to canonical root files. Preserve history rather than deleting it. Replace the duplicated `md files/claude.md` rule body with a pointer after reconciling any unique current rules. Root CLAUDE.md/GEMINI.md remain compact pointers. Update developer routing references without injecting developer docs into runtime prompts.

Inspect current migrations, access helpers, playbook manifest/contracts, worker, Settings, resource service, and delete dependencies. Record a baseline of existing tests/lint/build and a practical rollback point. Verify new-operation capability mappings. Confirm the narrow retrieval/web provider choice, paid-feature budget, and document retention approach in the handoff.

**Gate:** no contradictory active role/product documents; baseline checks recorded; no code/schema change beyond necessary documentation references. Missing integration credentials block activation, not documentation installation. **Commit:** `docs: align personal brand content roadmap`.

**Post-deploy:** existing login, Settings, research, idea/post review, and manual Publish still load if this documentation push causes a redeploy.

### P01 — Two context profiles

**Depends on:** P00. **Surfaces:** current Settings/setup, client schema/service, context assembly; proposed `src/features/profiles` only if it reduces duplication.

Add form sections and validated storage for the fields in product-spec.md. Preserve existing buyer context, voice examples, phrases, banned topics, proof, and Team Access. Reactivate legacy pillar/positioning columns only through a deliberate mapping; do not assume old values are current. Backfill unambiguous values, leave unknowns blank, and track a profile revision for generation hashes. Drafting can select wider personal readers rather than always substituting buyer ICP.

**Validate:** save/reload; optional fields; old client with partial data; Account User write denial; other-account ID; retained temp-password/team workflow. Verify current values actually reach planning/writing rather than only the form. **Commit:** `feat: add business and personal brand profiles`.

**Post-deploy:** edit each profile, refresh, draft against the selected reader, verify Team Access unchanged.

### P02 — Content Bank and safe reuse foundation

**Depends on:** P01. **Surfaces:** founder-experiences, resources, source services, nav, migrations, delete dependency services.

Unify the list/detail/capture UX and introduce category/readiness/reuse fields plus a shared assignment/usage mechanism. Start with adapters over existing source tables to preserve all IDs and current contracts. Backfill usage from existing ideas/posts; do not infer unused status from missing soft-deleted rows. Preserve lead-magnet admin permissions and existing controlled-gating rules. Category changes cannot bypass resource permissions. Support typed notes and pasted transcripts; do not add a transcription vendor now.

Atomic reservations/use commits must work before calendars. A new use is explicit; same-request retries and redrafts reuse the existing assignment. Preserve old routes until new parity is checked, then redirect. No permanent database deletion in this phase.

**Validate:** old experience/resource counts and links; mixed permissions; single-use contention; marked reusable but not auto-selected; failed draft releases reservation; second explicit angle; published usage survives allowed post deletion. **Commit:** `feat: unify content bank and track explicit reuse` (split schema/UI if needed).

**Post-deploy:** open a migrated experience and resource, create a draft, view usage, then deliberately reuse only an enabled entry.

### P03 — Supporting files and retrieval

**Depends on:** P01–P02. **Surfaces:** proposed document services, private storage, ingestion worker job, retrieval adapter, context builder.

Ship `.md`/`.txt` uploads first, safe preview, source/evidence/download purposes, versioning, pending/ready/failed states, and authorized deletion/archive cleanup. Index asynchronously. Recommended hosted retrieval stores are account-isolated; map provider results back to currently authorized application document versions. Preserve the original text. Replacement must not return stale chunks in new generation. A failed or not-yet-indexed required document blocks or clearly delays that source-dependent draft.

Build a context manifest: profile revisions; exact source IDs/versions; playbook version; retrieved document sections/hashes; token estimate. Keep content in protected records, not logs. Preserve essential facts; no arbitrary summary limit. Retrieval is for supporting relevance, not selected-entry lookup or calendar inventory.

**Validate:** short complete file; relevant section in long file; no relevant match; replaced/archived file; parsing failure; prompt-injection text; cross-account provider IDs/excerpts; private evidence not offered as public download. Use a small evidence-fidelity evaluation comparing required facts before/after retrieval. **Commit:** `feat: add private supporting documents and retrieval`.

**Post-deploy:** upload an MD brief, wait for ready, generate a supported post, inspect evidence references, replace it, and confirm subsequent output uses the new version.

### P04 — Shared standalone writer and simpler editor

**Depends on:** P01–P03. **Surfaces:** idea/post generate services; schemas; playbook contracts, compatibility, hashes, source loaders; editor/review.

Extend source contracts to experience, asset-led, profile-led, new-idea/upload, and research-led briefs without breaking legacy source modes. Add primary allocation bucket separately from source-record type. Version the generation plan; adapt old plans. Add editable pillar, eight post types, funnel stage, reader, takeaway, and writing overrides. Load writing rules explicitly by stage and replace buyer-only rules with selected-reader relevance in affected runtime playbooks/tests. No blanket removal of proof checks.

Standalone Create post resolves a source and internal brief directly; calendar later calls the same service. Keep one active post per idea, existing idempotence, independent QA, bounded correction, and metadata-only logs. Any edit to operative content/brief invalidates old approval; generated evidence fields cannot be forged through arbitrary frontend payloads.

**Validate:** each source path; profile-only educational draft with no invented experience; evidence from MD; override persistence; old post redraft; unsupported metrics blocked; stale approval; concurrent Generate calls yield one active post. **Commit:** `feat: unify source based drafting and editorial controls`.

**Post-deploy:** create one standalone experience post, one lead-magnet teaching post, and one evergreen explainer; change stage; edit an approved draft and verify renewed review.

### P05 — Monthly settings, source selection, and calendar plan

**Depends on:** P02/P04. **Surfaces:** proposed calendar services/UI, allocation helper, SQL inventory/reservations.

Implement two save scopes, month snapshots, default version, timezone, count/shares/news cap, and actual allocation. Save-as-default affects future calendars only. Reject invalid totals/negative inputs and show any conflict between requested news share and news cap. Use deterministic rounding, SQL eligibility, visible source candidates, deliberate selection, news placeholders, and evergreen shortage substitution. No source reuse just to satisfy a percentage.

Show plan before drafts. Replanning existing content is a preview/confirmed edit to eligible slots; preserve approved/published work. Monthly settings cannot silently change account defaults. Standalone posts count only when assigned to the calendar.

**Validate:** month-only versus default saves; October unchanged after November/default edit; small counts and rounding; zero eligible entries; 12 requested/eight selected; news cap floor; atomic competing reservation; cancellation. **Commit:** `feat: add monthly calendar allocation and defaults`.

**Post-deploy:** create two different months, update defaults, confirm the first month is unchanged, and verify shortage counts and selected entry references.

### P06 — Resumable calendar draft batches

**Depends on:** P05. **Surfaces:** calendar-slot execution and existing worker/job infrastructure; shared P04 writer.

Generate selected slots in bounded user-triggered batches, each with idempotency key, source reservation, brief, result, retry state, and safe cost/progress summary. Persist each successful slot. Retry only failed/unstarted slots, not the entire month. Recheck cancellation, account status, and permissions. The research schedule cannot start calendar writing by itself.

**Validate:** interruption/restart; duplicate button click; worker replicas; mixed success; cancellation; permission revocation; stale lease; QA-blocked slot; no duplicate post/use rows. **Commit:** `feat: add resumable calendar drafting`.

**Post-deploy:** start a small batch, interrupt one job safely, retry it, and verify successful slots retain their original drafts and history.

### P07 — Editable prompt and manual web research

**Depends on:** P00/P04; may precede P05 if research is prioritized. **Surfaces:** Research settings/UI, existing manual run guard/service, proposed search adapter, finding/citation mapping.

Store the exact initial prompt from product-spec.md; add frontend editing, version snapshots, optional profile toggle off, and Run saved prompt. Implement manual web research with bounded searches, source links, dates, grouping, novelty/consequence/relevance/confidence, safe coverage/error states, and old-RSS history compatibility. Save all discovered candidates within the run's budget; do not promise all internet news. Keep source approvals and human multi-selection; angles are briefing suggestions until selected.

Use existing run guard and metadata logging. Do not build a parallel unguarded research runner. Missing provider configuration is a distinct state, never an empty successful briefing.

**Validate:** edited-versus-saved prompt; off-toggle excludes profile; unrelated requested industry works; source/date accuracy; duplicate development and meaningful follow-up; no evidence; partial search failure; budget stop; selection creates separate posts only on request. **Commit:** `feat: add prompt controlled web research`.

**Post-deploy:** run the provided marketing prompt, then a deliberately unrelated prompt, and confirm no hidden profile filtering or invented founder opinion.

### P08 — Research schedules, monitoring, notifications

**Depends on:** P07. **Surfaces:** existing persistent worker scheduler/run guard, durable due-time fields, URL fetch/monitor service, in-app notifications.

Add per-account timezone/time/lookback, enabled/paused, durable last/next-run state, and one run identity per due occurrence. Resolve DST handling explicitly: one run per local day at the selected time; when time is skipped, use the next valid time, and do not run twice at a repeated time. Coalesce missed runs after downtime into one catch-up rather than a backlog storm. Manual and scheduled runs share locking.

Implement Read article and Monitor blog with SSRF protections, bounded index/sitemap discovery, canonical URLs/content hashes, new/updated content detection, and safe inaccessible-source reporting. RSS can remain an adapter. Do not add an extra scheduler or remove stored RSS sources. In-app ready/partial/failure notifications link to saved briefings.

**Validate:** Karachi schedule, a DST timezone, pause/resume, downtime, two worker replicas, manual collision, one meaningful update, blocked/private redirect, unavailable blog, retry cap, notification dedupe. **Commit:** `feat: schedule research and monitor sources`.

**Post-deploy:** verify a real scheduled run and notification, check no duplicate after a manual run collision, then pause it and confirm no next run starts.

### P09 — Newsletter editions

**Depends on:** P02–P04/P07. **Surfaces:** proposed newsletter feature, shared source/context/usage/QA services.

Create independent weekly edition records, source selection, outline/section editing, drafting, evidence, approval versions, and copy/export for manual LinkedIn editing. Mix experiences and research. Edition length follows selected value, not a quota. Apply the same deliberate reuse rules. Keep news findings reusable as references without inventing fresh news. Do not apply monthly post source percentages to editions.

**Validate:** mixed source edition; missing commentary; duplicate development; private evidence; failed generation doesn't consume an entry; version edit resets approval; manual publication records use; source counts in monthly calendar unchanged. **Commit:** `feat: add newsletter drafting and review`.

**Post-deploy:** create an edition from two findings and one permitted experience, edit/review, copy it, and verify usage history without changing monthly counts.

### P10 — Migration closure and release validation

**Depends on:** shipped slices above. **Surfaces:** compatibility routes, backfill reports, feature flags, docs/status, affected regression tests.

Verify old records/links, new dependency checks, Account User capabilities, provider isolation, exact approvals, context fidelity, retries, and cost limits. Remove obsolete sidebar entries only after parity, retain adapters needed by old records, and archive old documentation as reference. Do not drop legacy tables/columns under this phase. Any destructive cleanup is a separate explicitly authorized task.

**Validate:** complete representative workflow from profiles through a standalone post, calendar, research briefing, and newsletter; cross-account denial; current existing admin deletion checks including added dependencies. Run lint/build and relevant regression suite. **Commit:** `chore: validate personal brand workflow rollout`.

**Post-deploy:** user acceptance against the matrix below, confirmed web/worker deployment, current migration version, and no unresolved required manual tests. Mark complete only then.

## 5. Required acceptance matrix

| Scenario | Expected result |
|---|---|
| Save October shares only | Account defaults and November unchanged |
| Save default then open a new month | New month copies updated defaults; existing months untouched |
| 30 slots, experience target 12, only eight selected | Actual plan shows eight and reassigns four transparently |
| Single-use source selected concurrently | One assignment wins; other gets a safe availability response |
| Entry marked reusable | Appears eligible; nothing generated until selected |
| Lead magnet used as teaching source | No forced CTA or invented personal proof |
| Long MD contains one needed section | Relevant section plus essential profile facts reaches writer |
| Archived/cross-account indexed file | No excerpt returned or usable |
| Profile differs from saved research prompt | Research follows prompt with profile toggle off |
| News report repeated next day | Grouped/labelled repeat unless meaningful new facts |
| Batch fails after five successful slots | Those drafts persist; retry targets failures only |
| Draft changes after approval | Prior approval cannot authorize changed version |
| Newsletter uses an experience | Usage recorded; monthly post count unchanged |
| Old resource/post/idea opened | Existing metadata, evidence, and route remain usable |

## 6. Release and rollback

Before each risky deployment, record baseline commit, affected services, migration order, feature flag, and rollback path. Deploy additive schema before code that needs it; keep worker/web versions compatible. Disable the affected new feature if a gate fails and use an ordinary revert/forward fix. Do not reset a database to roll back code. User-owned files and saved drafts must survive a provider failure.

Commit/push commands, mandatory lint/build/diff checks, and handoff/report requirements are in CONTRIBUTING.md. Every phase prompt below inherits those gates explicitly. This planning delivery did not run app lint/build, mutate the repository/database, push commits, or verify deployment.

## 7. Documentation delivery and unresolved choices

The package includes root canonical docs, product spec, execution prompts, status/handoff templates, and historical live-doc snapshots. First install/reconcile it in P00; do not overwrite newer repo changes blindly. The current task creates files for review and execution, not a repository commit.

The provider integration and schema choices need P00 confirmation against the real environment; no business decisions are blocked by that check. Automatic LinkedIn publication/analytics, native newsletter API publication, built-in scraping, audio recording/transcription, and visual assets remain later scopes. A monthly source preset is intentionally unset until the user saves one.

## 8. Source notes

- [ChatGPT Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): project files/instructions provide reusable context; this does not establish an exact public implementation contract for internal retrieval.
- [OpenAI File Search](https://developers.openai.com/api/docs/guides/tools-file-search): supported hosted search route, including Markdown. Retrieval result limits trade context/cost against recall; evaluate selected evidence coverage.
- [OpenAI Retrieval](https://developers.openai.com/api/docs/guides/retrieval): candidate server-side passage retrieval route to evaluate in P00/P03.
- [OpenAI Web Search](https://developers.openai.com/api/docs/guides/tools-web-search): candidate sourced search route. The app still owns scheduling, persistence, deduplication, and user selection.

Provider APIs and budgets must be rechecked when their phase starts. The recommended architecture does not depend on knowing ChatGPT Projects' private internals.
