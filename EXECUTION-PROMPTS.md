# Execution prompts — one phase per coding session

Use these with Claude, ChatGPT/Codex, or Gemini. Give the tool this package and the repository checkout. Run P00 first. Start the next phase only when its dependencies meet their gates. One editor at a time.

## P00 — Canonical documentation and baseline reconciliation

```text
Read, in this order: AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md. Treat AGENTS.md as primary, security rules as mandatory, and Jawad's confirmed decisions as overriding older docs. Then read IMPLEMENTATION-PLAN.md phase P00, docs/planning/product-spec.md, and docs/handoffs/CURRENT.md.

For this initial installation, read the supplied package files in that order before editing, then reconcile the current repository documents under md files/. Preserve newer unrelated decisions; archive superseded bodies and replace old active paths with canonical pointers. This phase is documentation/baseline work, not permission to implement P01 onward.

**Outcome:** any coding tool starts from the same current rules.

Install root canonical documents from this package; preserve the live `md files/` versions as historical reference, then replace old active copies with pointers to canonical root files. Preserve history rather than deleting it. Replace the duplicated `md files/claude.md` rule body with a pointer after reconciling any unique current rules. Root CLAUDE.md/GEMINI.md remain compact pointers. Update developer routing references without injecting developer docs into runtime prompts.

Inspect current migrations, access helpers, playbook manifest/contracts, worker, Settings, resource service, and delete dependencies. Record a baseline of existing tests/lint/build and a practical rollback point. Verify new-operation capability mappings. Confirm the narrow retrieval/web provider choice, paid-feature budget, and document retention approach in the handoff.

**Gate:** no contradictory active role/product documents; baseline checks recorded; no code/schema change beyond necessary documentation references. Missing integration credentials block activation, not documentation installation. **Commit:** `docs: align personal brand content roadmap`.

**Post-deploy:** existing login, Settings, research, idea/post review, and manual Publish still load if this documentation push causes a redeploy.

Work directly on main. Before editing run git checkout main, git pull --ff-only origin main, and git status; preserve other tools' work. Only one tool may edit. Use additive migrations and do not execute destructive database changes without explicit approval.

Validate the phase's meaningful success/failure cases. Run npm run lint, npm run build, git diff --check, git status --short, git diff --stat, and review git diff before each focused commit. Stage explicit changed files, commit with the phase message, and push origin main. Never force-push or amend a pushed commit. Check deployment and perform the phase's manual post-deploy checks; if unavailable, report the gate as pending.

Update feature-checklist.md and docs/handoffs/CURRENT.md. Return: files changed; what changed; behavior preserved; validation results; manual tests completed; commit hash/push result; deployment status; remaining blockers. Do not mark complete before required deployment and manual checks pass.
```

## P01 — Two context profiles

```text
Read, in this order: AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md. Treat AGENTS.md as primary, security rules as mandatory, and Jawad's confirmed decisions as overriding older docs. Then read IMPLEMENTATION-PLAN.md phase P01, docs/planning/product-spec.md, and docs/handoffs/CURRENT.md.

Implement only P01 — Two context profiles. Confirm its dependencies from the current handoff. Use existing services and current migrations; do not rebuild the application or silently widen scope.

**Depends on:** P00. **Surfaces:** current Settings/setup, client schema/service, context assembly; proposed `src/features/profiles` only if it reduces duplication.

Add form sections and validated storage for the fields in product-spec.md. Preserve existing buyer context, voice examples, phrases, banned topics, proof, and Team Access. Reactivate legacy pillar/positioning columns only through a deliberate mapping; do not assume old values are current. Backfill unambiguous values, leave unknowns blank, and track a profile revision for generation hashes. Drafting can select wider personal readers rather than always substituting buyer ICP.

**Validate:** save/reload; optional fields; old client with partial data; Account User write denial; other-account ID; retained temp-password/team workflow. Verify current values actually reach planning/writing rather than only the form. **Commit:** `feat: add business and personal brand profiles`.

**Post-deploy:** edit each profile, refresh, draft against the selected reader, verify Team Access unchanged.

Work directly on main. Before editing run git checkout main, git pull --ff-only origin main, and git status; preserve other tools' work. Only one tool may edit. Use additive migrations and do not execute destructive database changes without explicit approval.

Validate the phase's meaningful success/failure cases. Run npm run lint, npm run build, git diff --check, git status --short, git diff --stat, and review git diff before each focused commit. Stage explicit changed files, commit with the phase message, and push origin main. Never force-push or amend a pushed commit. Check deployment and perform the phase's manual post-deploy checks; if unavailable, report the gate as pending.

Update feature-checklist.md and docs/handoffs/CURRENT.md. Return: files changed; what changed; behavior preserved; validation results; manual tests completed; commit hash/push result; deployment status; remaining blockers. Do not mark complete before required deployment and manual checks pass.
```

## P02 — Content Bank and safe reuse foundation

```text
Read, in this order: AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md. Treat AGENTS.md as primary, security rules as mandatory, and Jawad's confirmed decisions as overriding older docs. Then read IMPLEMENTATION-PLAN.md phase P02, docs/planning/product-spec.md, and docs/handoffs/CURRENT.md.

Implement only P02 — Content Bank and safe reuse foundation. Confirm its dependencies from the current handoff. Use existing services and current migrations; do not rebuild the application or silently widen scope.

**Depends on:** P01. **Surfaces:** founder-experiences, resources, source services, nav, migrations, delete dependency services.

Unify the list/detail/capture UX and introduce category/readiness/reuse fields plus a shared assignment/usage mechanism. Start with adapters over existing source tables to preserve all IDs and current contracts. Backfill usage from existing ideas/posts; do not infer unused status from missing soft-deleted rows. Preserve lead-magnet admin permissions and existing controlled-gating rules. Category changes cannot bypass resource permissions. Support typed notes and pasted transcripts; do not add a transcription vendor now.

Atomic reservations/use commits must work before calendars. A new use is explicit; same-request retries and redrafts reuse the existing assignment. Preserve old routes until new parity is checked, then redirect. No permanent database deletion in this phase.

**Validate:** old experience/resource counts and links; mixed permissions; single-use contention; marked reusable but not auto-selected; failed draft releases reservation; second explicit angle; published usage survives allowed post deletion. **Commit:** `feat: unify content bank and track explicit reuse` (split schema/UI if needed).

**Post-deploy:** open a migrated experience and resource, create a draft, view usage, then deliberately reuse only an enabled entry.

Work directly on main. Before editing run git checkout main, git pull --ff-only origin main, and git status; preserve other tools' work. Only one tool may edit. Use additive migrations and do not execute destructive database changes without explicit approval.

Validate the phase's meaningful success/failure cases. Run npm run lint, npm run build, git diff --check, git status --short, git diff --stat, and review git diff before each focused commit. Stage explicit changed files, commit with the phase message, and push origin main. Never force-push or amend a pushed commit. Check deployment and perform the phase's manual post-deploy checks; if unavailable, report the gate as pending.

Update feature-checklist.md and docs/handoffs/CURRENT.md. Return: files changed; what changed; behavior preserved; validation results; manual tests completed; commit hash/push result; deployment status; remaining blockers. Do not mark complete before required deployment and manual checks pass.
```

## P03 — Supporting files and retrieval

```text
Read, in this order: AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md. Treat AGENTS.md as primary, security rules as mandatory, and Jawad's confirmed decisions as overriding older docs. Then read IMPLEMENTATION-PLAN.md phase P03, docs/planning/product-spec.md, and docs/handoffs/CURRENT.md.

Implement only P03 — Supporting files and retrieval. Confirm its dependencies from the current handoff. Use existing services and current migrations; do not rebuild the application or silently widen scope.

**Depends on:** P01–P02. **Surfaces:** proposed document services, private storage, ingestion worker job, retrieval adapter, context builder.

Ship `.md`/`.txt` uploads first, safe preview, source/evidence/download purposes, versioning, pending/ready/failed states, and authorized deletion/archive cleanup. Index asynchronously. Recommended hosted retrieval stores are account-isolated; map provider results back to currently authorized application document versions. Preserve the original text. Replacement must not return stale chunks in new generation. A failed or not-yet-indexed required document blocks or clearly delays that source-dependent draft.

Build a context manifest: profile revisions; exact source IDs/versions; playbook version; retrieved document sections/hashes; token estimate. Keep content in protected records, not logs. Preserve essential facts; no arbitrary summary limit. Retrieval is for supporting relevance, not selected-entry lookup or calendar inventory.

**Validate:** short complete file; relevant section in long file; no relevant match; replaced/archived file; parsing failure; prompt-injection text; cross-account provider IDs/excerpts; private evidence not offered as public download. Use a small evidence-fidelity evaluation comparing required facts before/after retrieval. **Commit:** `feat: add private supporting documents and retrieval`.

**Post-deploy:** upload an MD brief, wait for ready, generate a supported post, inspect evidence references, replace it, and confirm subsequent output uses the new version.

Work directly on main. Before editing run git checkout main, git pull --ff-only origin main, and git status; preserve other tools' work. Only one tool may edit. Use additive migrations and do not execute destructive database changes without explicit approval.

Validate the phase's meaningful success/failure cases. Run npm run lint, npm run build, git diff --check, git status --short, git diff --stat, and review git diff before each focused commit. Stage explicit changed files, commit with the phase message, and push origin main. Never force-push or amend a pushed commit. Check deployment and perform the phase's manual post-deploy checks; if unavailable, report the gate as pending.

Update feature-checklist.md and docs/handoffs/CURRENT.md. Return: files changed; what changed; behavior preserved; validation results; manual tests completed; commit hash/push result; deployment status; remaining blockers. Do not mark complete before required deployment and manual checks pass.
```

## P04 — Shared standalone writer and simpler editor

```text
Read, in this order: AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md. Treat AGENTS.md as primary, security rules as mandatory, and Jawad's confirmed decisions as overriding older docs. Then read IMPLEMENTATION-PLAN.md phase P04, docs/planning/product-spec.md, and docs/handoffs/CURRENT.md.

Implement only P04 — Shared standalone writer and simpler editor. Confirm its dependencies from the current handoff. Use existing services and current migrations; do not rebuild the application or silently widen scope.

**Depends on:** P01–P03. **Surfaces:** idea/post generate services; schemas; playbook contracts, compatibility, hashes, source loaders; editor/review.

Extend source contracts to experience, asset-led, profile-led, new-idea/upload, and research-led briefs without breaking legacy source modes. Add primary allocation bucket separately from source-record type. Version the generation plan; adapt old plans. Add editable pillar, eight post types, funnel stage, reader, takeaway, and writing overrides. Load writing rules explicitly by stage and replace buyer-only rules with selected-reader relevance in affected runtime playbooks/tests. No blanket removal of proof checks.

Standalone Create post resolves a source and internal brief directly; calendar later calls the same service. Keep one active post per idea, existing idempotence, independent QA, bounded correction, and metadata-only logs. Any edit to operative content/brief invalidates old approval; generated evidence fields cannot be forged through arbitrary frontend payloads.

**Validate:** each source path; profile-only educational draft with no invented experience; evidence from MD; override persistence; old post redraft; unsupported metrics blocked; stale approval; concurrent Generate calls yield one active post. **Commit:** `feat: unify source based drafting and editorial controls`.

**Post-deploy:** create one standalone experience post, one lead-magnet teaching post, and one evergreen explainer; change stage; edit an approved draft and verify renewed review.

Work directly on main. Before editing run git checkout main, git pull --ff-only origin main, and git status; preserve other tools' work. Only one tool may edit. Use additive migrations and do not execute destructive database changes without explicit approval.

Validate the phase's meaningful success/failure cases. Run npm run lint, npm run build, git diff --check, git status --short, git diff --stat, and review git diff before each focused commit. Stage explicit changed files, commit with the phase message, and push origin main. Never force-push or amend a pushed commit. Check deployment and perform the phase's manual post-deploy checks; if unavailable, report the gate as pending.

Update feature-checklist.md and docs/handoffs/CURRENT.md. Return: files changed; what changed; behavior preserved; validation results; manual tests completed; commit hash/push result; deployment status; remaining blockers. Do not mark complete before required deployment and manual checks pass.
```

## P05 — Monthly settings, source selection, and calendar plan

```text
Read, in this order: AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md. Treat AGENTS.md as primary, security rules as mandatory, and Jawad's confirmed decisions as overriding older docs. Then read IMPLEMENTATION-PLAN.md phase P05, docs/planning/product-spec.md, and docs/handoffs/CURRENT.md.

Implement only P05 — Monthly settings, source selection, and calendar plan. Confirm its dependencies from the current handoff. Use existing services and current migrations; do not rebuild the application or silently widen scope.

**Depends on:** P02/P04. **Surfaces:** proposed calendar services/UI, allocation helper, SQL inventory/reservations.

Implement two save scopes, month snapshots, default version, timezone, count/shares/news cap, and actual allocation. Save-as-default affects future calendars only. Reject invalid totals/negative inputs and show any conflict between requested news share and news cap. Use deterministic rounding, SQL eligibility, visible source candidates, deliberate selection, news placeholders, and evergreen shortage substitution. No source reuse just to satisfy a percentage.

Show plan before drafts. Replanning existing content is a preview/confirmed edit to eligible slots; preserve approved/published work. Monthly settings cannot silently change account defaults. Standalone posts count only when assigned to the calendar.

**Validate:** month-only versus default saves; October unchanged after November/default edit; small counts and rounding; zero eligible entries; 12 requested/eight selected; news cap floor; atomic competing reservation; cancellation. **Commit:** `feat: add monthly calendar allocation and defaults`.

**Post-deploy:** create two different months, update defaults, confirm the first month is unchanged, and verify shortage counts and selected entry references.

Work directly on main. Before editing run git checkout main, git pull --ff-only origin main, and git status; preserve other tools' work. Only one tool may edit. Use additive migrations and do not execute destructive database changes without explicit approval.

Validate the phase's meaningful success/failure cases. Run npm run lint, npm run build, git diff --check, git status --short, git diff --stat, and review git diff before each focused commit. Stage explicit changed files, commit with the phase message, and push origin main. Never force-push or amend a pushed commit. Check deployment and perform the phase's manual post-deploy checks; if unavailable, report the gate as pending.

Update feature-checklist.md and docs/handoffs/CURRENT.md. Return: files changed; what changed; behavior preserved; validation results; manual tests completed; commit hash/push result; deployment status; remaining blockers. Do not mark complete before required deployment and manual checks pass.
```

## P06 — Resumable calendar draft batches

```text
Read, in this order: AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md. Treat AGENTS.md as primary, security rules as mandatory, and Jawad's confirmed decisions as overriding older docs. Then read IMPLEMENTATION-PLAN.md phase P06, docs/planning/product-spec.md, and docs/handoffs/CURRENT.md.

Implement only P06 — Resumable calendar draft batches. Confirm its dependencies from the current handoff. Use existing services and current migrations; do not rebuild the application or silently widen scope.

**Depends on:** P05. **Surfaces:** calendar-slot execution and existing worker/job infrastructure; shared P04 writer.

Generate selected slots in bounded user-triggered batches, each with idempotency key, source reservation, brief, result, retry state, and safe cost/progress summary. Persist each successful slot. Retry only failed/unstarted slots, not the entire month. Recheck cancellation, account status, and permissions. The research schedule cannot start calendar writing by itself.

**Validate:** interruption/restart; duplicate button click; worker replicas; mixed success; cancellation; permission revocation; stale lease; QA-blocked slot; no duplicate post/use rows. **Commit:** `feat: add resumable calendar drafting`.

**Post-deploy:** start a small batch, interrupt one job safely, retry it, and verify successful slots retain their original drafts and history.

Work directly on main. Before editing run git checkout main, git pull --ff-only origin main, and git status; preserve other tools' work. Only one tool may edit. Use additive migrations and do not execute destructive database changes without explicit approval.

Validate the phase's meaningful success/failure cases. Run npm run lint, npm run build, git diff --check, git status --short, git diff --stat, and review git diff before each focused commit. Stage explicit changed files, commit with the phase message, and push origin main. Never force-push or amend a pushed commit. Check deployment and perform the phase's manual post-deploy checks; if unavailable, report the gate as pending.

Update feature-checklist.md and docs/handoffs/CURRENT.md. Return: files changed; what changed; behavior preserved; validation results; manual tests completed; commit hash/push result; deployment status; remaining blockers. Do not mark complete before required deployment and manual checks pass.
```

## P07 — Editable prompt and manual web research

```text
Read, in this order: AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md. Treat AGENTS.md as primary, security rules as mandatory, and Jawad's confirmed decisions as overriding older docs. Then read IMPLEMENTATION-PLAN.md phase P07, docs/planning/product-spec.md, and docs/handoffs/CURRENT.md.

Implement only P07 — Editable prompt and manual web research. Confirm its dependencies from the current handoff. Use existing services and current migrations; do not rebuild the application or silently widen scope.

**Depends on:** P00/P04; may precede P05 if research is prioritized. **Surfaces:** Research settings/UI, existing manual run guard/service, proposed search adapter, finding/citation mapping.

Store the exact initial prompt from product-spec.md; add frontend editing, version snapshots, optional profile toggle off, and Run saved prompt. Implement manual web research with bounded searches, source links, dates, grouping, novelty/consequence/relevance/confidence, safe coverage/error states, and old-RSS history compatibility. Save all discovered candidates within the run's budget; do not promise all internet news. Keep source approvals and human multi-selection; angles are briefing suggestions until selected.

Use existing run guard and metadata logging. Do not build a parallel unguarded research runner. Missing provider configuration is a distinct state, never an empty successful briefing.

**Validate:** edited-versus-saved prompt; off-toggle excludes profile; unrelated requested industry works; source/date accuracy; duplicate development and meaningful follow-up; no evidence; partial search failure; budget stop; selection creates separate posts only on request. **Commit:** `feat: add prompt controlled web research`.

**Post-deploy:** run the provided marketing prompt, then a deliberately unrelated prompt, and confirm no hidden profile filtering or invented founder opinion.

Work directly on main. Before editing run git checkout main, git pull --ff-only origin main, and git status; preserve other tools' work. Only one tool may edit. Use additive migrations and do not execute destructive database changes without explicit approval.

Validate the phase's meaningful success/failure cases. Run npm run lint, npm run build, git diff --check, git status --short, git diff --stat, and review git diff before each focused commit. Stage explicit changed files, commit with the phase message, and push origin main. Never force-push or amend a pushed commit. Check deployment and perform the phase's manual post-deploy checks; if unavailable, report the gate as pending.

Update feature-checklist.md and docs/handoffs/CURRENT.md. Return: files changed; what changed; behavior preserved; validation results; manual tests completed; commit hash/push result; deployment status; remaining blockers. Do not mark complete before required deployment and manual checks pass.
```

## P08 — Research schedules, monitoring, notifications

```text
Read, in this order: AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md. Treat AGENTS.md as primary, security rules as mandatory, and Jawad's confirmed decisions as overriding older docs. Then read IMPLEMENTATION-PLAN.md phase P08, docs/planning/product-spec.md, and docs/handoffs/CURRENT.md.

Implement only P08 — Research schedules, monitoring, notifications. Confirm its dependencies from the current handoff. Use existing services and current migrations; do not rebuild the application or silently widen scope.

**Depends on:** P07. **Surfaces:** existing persistent worker scheduler/run guard, durable due-time fields, URL fetch/monitor service, in-app notifications.

Add per-account timezone/time/lookback, enabled/paused, durable last/next-run state, and one run identity per due occurrence. Resolve DST handling explicitly: one run per local day at the selected time; when time is skipped, use the next valid time, and do not run twice at a repeated time. Coalesce missed runs after downtime into one catch-up rather than a backlog storm. Manual and scheduled runs share locking.

Implement Read article and Monitor blog with SSRF protections, bounded index/sitemap discovery, canonical URLs/content hashes, new/updated content detection, and safe inaccessible-source reporting. RSS can remain an adapter. Do not add an extra scheduler or remove stored RSS sources. In-app ready/partial/failure notifications link to saved briefings.

**Validate:** Karachi schedule, a DST timezone, pause/resume, downtime, two worker replicas, manual collision, one meaningful update, blocked/private redirect, unavailable blog, retry cap, notification dedupe. **Commit:** `feat: schedule research and monitor sources`.

**Post-deploy:** verify a real scheduled run and notification, check no duplicate after a manual run collision, then pause it and confirm no next run starts.

Work directly on main. Before editing run git checkout main, git pull --ff-only origin main, and git status; preserve other tools' work. Only one tool may edit. Use additive migrations and do not execute destructive database changes without explicit approval.

Validate the phase's meaningful success/failure cases. Run npm run lint, npm run build, git diff --check, git status --short, git diff --stat, and review git diff before each focused commit. Stage explicit changed files, commit with the phase message, and push origin main. Never force-push or amend a pushed commit. Check deployment and perform the phase's manual post-deploy checks; if unavailable, report the gate as pending.

Update feature-checklist.md and docs/handoffs/CURRENT.md. Return: files changed; what changed; behavior preserved; validation results; manual tests completed; commit hash/push result; deployment status; remaining blockers. Do not mark complete before required deployment and manual checks pass.
```

## P09 — Newsletter editions

```text
Read, in this order: AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md. Treat AGENTS.md as primary, security rules as mandatory, and Jawad's confirmed decisions as overriding older docs. Then read IMPLEMENTATION-PLAN.md phase P09, docs/planning/product-spec.md, and docs/handoffs/CURRENT.md.

Implement only P09 — Newsletter editions. Confirm its dependencies from the current handoff. Use existing services and current migrations; do not rebuild the application or silently widen scope.

**Depends on:** P02–P04/P07. **Surfaces:** proposed newsletter feature, shared source/context/usage/QA services.

Create independent weekly edition records, source selection, outline/section editing, drafting, evidence, approval versions, and copy/export for manual LinkedIn editing. Mix experiences and research. Edition length follows selected value, not a quota. Apply the same deliberate reuse rules. Keep news findings reusable as references without inventing fresh news. Do not apply monthly post source percentages to editions.

**Validate:** mixed source edition; missing commentary; duplicate development; private evidence; failed generation doesn't consume an entry; version edit resets approval; manual publication records use; source counts in monthly calendar unchanged. **Commit:** `feat: add newsletter drafting and review`.

**Post-deploy:** create an edition from two findings and one permitted experience, edit/review, copy it, and verify usage history without changing monthly counts.

Work directly on main. Before editing run git checkout main, git pull --ff-only origin main, and git status; preserve other tools' work. Only one tool may edit. Use additive migrations and do not execute destructive database changes without explicit approval.

Validate the phase's meaningful success/failure cases. Run npm run lint, npm run build, git diff --check, git status --short, git diff --stat, and review git diff before each focused commit. Stage explicit changed files, commit with the phase message, and push origin main. Never force-push or amend a pushed commit. Check deployment and perform the phase's manual post-deploy checks; if unavailable, report the gate as pending.

Update feature-checklist.md and docs/handoffs/CURRENT.md. Return: files changed; what changed; behavior preserved; validation results; manual tests completed; commit hash/push result; deployment status; remaining blockers. Do not mark complete before required deployment and manual checks pass.
```

## P10 — Migration closure and release validation

```text
Read, in this order: AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md. Treat AGENTS.md as primary, security rules as mandatory, and Jawad's confirmed decisions as overriding older docs. Then read IMPLEMENTATION-PLAN.md phase P10, docs/planning/product-spec.md, and docs/handoffs/CURRENT.md.

Implement only P10 — Migration closure and release validation. Confirm its dependencies from the current handoff. Use existing services and current migrations; do not rebuild the application or silently widen scope.

**Depends on:** shipped slices above. **Surfaces:** compatibility routes, backfill reports, feature flags, docs/status, affected regression tests.

Verify old records/links, new dependency checks, Account User capabilities, provider isolation, exact approvals, context fidelity, retries, and cost limits. Remove obsolete sidebar entries only after parity, retain adapters needed by old records, and archive old documentation as reference. Do not drop legacy tables/columns under this phase. Any destructive cleanup is a separate explicitly authorized task.

**Validate:** complete representative workflow from profiles through a standalone post, calendar, research briefing, and newsletter; cross-account denial; current existing admin deletion checks including added dependencies. Run lint/build and relevant regression suite. **Commit:** `chore: validate personal brand workflow rollout`.

**Post-deploy:** user acceptance against the matrix below, confirmed web/worker deployment, current migration version, and no unresolved required manual tests. Mark complete only then.

Work directly on main. Before editing run git checkout main, git pull --ff-only origin main, and git status; preserve other tools' work. Only one tool may edit. Use additive migrations and do not execute destructive database changes without explicit approval.

Validate the phase's meaningful success/failure cases. Run npm run lint, npm run build, git diff --check, git status --short, git diff --stat, and review git diff before each focused commit. Stage explicit changed files, commit with the phase message, and push origin main. Never force-push or amend a pushed commit. Check deployment and perform the phase's manual post-deploy checks; if unavailable, report the gate as pending.

Update feature-checklist.md and docs/handoffs/CURRENT.md. Return: files changed; what changed; behavior preserved; validation results; manual tests completed; commit hash/push result; deployment status; remaining blockers. Do not mark complete before required deployment and manual checks pass.
```
