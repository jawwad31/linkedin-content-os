# Next step — research automation (P08)

Prepared 2026-10-09 after Jawad asked whether the RSS worker is still needed, whether Virel is moving in the right direction, and to move to the next step. This is the implementation brief for the next focused phase; it does not claim P08 is implemented.

## Architecture assessment

Keep the existing Railway worker service. It currently performs scheduled RSS collection and optionally classification/TrendCard synthesis. Manual web research and individual post generation are handled by the web application, so those actions do not require the worker. The approved next phase requires background scheduled research, source monitoring and notifications; extend the existing worker for those tasks. RSS is an optional source adapter. Do not add a second scheduler or remove stored RSS sources/history. The service may retain its infrastructure name `rss-worker`; renaming it is not a prerequisite.

The current direction is consistent with Virel's product contract: separate business/personal profiles, Content Bank with explicit reuse, shared planning/writing/checks/QA, human review/manual publication, and prompt-led research with optional profile context off. Six independent OpenRouter model roles are sufficient for the implemented tasks. Decisions API integration adds no required capability to the next phase and remains deferred.

The immediate correction is release sequencing: Railway's new LLM variables must be consumed by the corresponding deployed code. Ship the verified role-configuration follow-up before building the next slice. Automated tests support its contracts; they do not establish live model quality or completed manual acceptance. Preserve deferred P04/P05/P06/P07 gates, especially the missing standalone supplied-note/document entry point, source/date accuracy, Calendar contention and permissions. Keep Calendar batch drafting off until those gates pass.

## Implementation prompt

Continue Virel in `jawwad31/linkedin-content-os`, branch `main`, at the verified latest pushed state. Implement **P08 — Research schedules, source monitoring and in-app notifications** as one focused phase. Only one coding tool may edit this checkout. No branch/PR or separate scheduler.

Read in this exact order before coding:

1. `AGENTS.md`
2. `security-access.md`
3. `design.md`
4. `feature-checklist.md`
5. `CONTRIBUTING.md`

Then read P08 in `IMPLEMENTATION-PLAN.md`, `docs/planning/product-spec.md`, the latest `docs/handoffs/CURRENT.md`, and task-relevant code. Current production schema/provider verification and manual acceptance are separate from implementation status; do not invent passes.

### Scope

- Add administrator-managed saved schedule/timezone, enabled/paused state and lookback. Persist last/next due times and an idempotent identity per due occurrence. Schedule changes are explicit saved changes, not unsaved form input.
- Extend the existing persistent worker. Independently gate legacy RSS collection and the new schedule dispatcher so disabling RSS does not disable scheduled web research. Default new automation off until dependencies are ready.
- Manual and scheduled research share the account-scoped guard. Use durable claim/lease/retry state; two worker replicas cannot perform the same occurrence. Coalesce downtime into one catch-up run. Bound retries/search work and report real failures/missing configuration.
- Use the saved account prompt revision, optional authorized profile context and the existing OpenRouter web adapter. Recheck initiating/configuring actor and account authority at sensitive commits; service-role execution does not bypass scoped access rules. Preserve the original source/context/provenance contracts.
- Handle one run per selected local day: when DST skips the chosen time, use the next valid time; do not run twice in a repeated local time. Test Asia/Karachi plus a DST timezone.
- Add Read article and Monitor blog using bounded, safe URL fetching. Reject private/loopback/link-local/metadata targets and unsupported schemes; revalidate DNS/redirect destinations and bind the actual connection to verified addresses. Bound discovery, redirects, bytes, response types and time. Preserve source originals/content hashes/provenance; no authenticated browsing with app credentials.
- Detect new/materially updated source content with idempotent monitoring state. RSS can remain an adapter for discovery; do not replace all research with feed setup or erase legacy data.
- Save deduplicated in-app ready/partial/failure notifications linking to the actual saved briefing. No email, DMs or push integration is assumed available.
- Research automation creates zero operational ideas, calendar assignments, post drafts, newsletters, human approvals or publishing actions. Existing explicit source-selection/drafting/review paths remain intact. Newsletter implementation is P09.

### Validation and delivery

Use additive/rerunnable migrations and risk-based SQL/service/provider tests: timezone/DST, pause/resume, catch-up, replica contention, manual collision, cancellation/revocation, retry cap, notification dedupe, changed-source detection, private DNS/redirect/oversized-response failures, safe logging and cross-account denial. Run lint, build, relevant/full tests and diff review before committing. Preserve unrelated CLI cache and ignored credentials.

Keep existing extensive manual testing deferred at Jawad's request; record those gates as pending rather than passed. No live paid research run is required merely to validate a mock or enable a new automation flag. Production schema/configuration changes follow the documented target/backup procedure and user authorization. Commit/push approval remains governed by the current session instruction.

The worker must stay running while using its internal timer scheduler: keep Railway Serverless off for this service, retain `npm run worker`, and use one worker service with durable account-scoped coordination. The new worker will also need `OPENROUTER_API_KEY`, `LLM_WEB_RESEARCH_PROVIDER` and `LLM_WEB_RESEARCH_MODEL`; classifier/synthesis pairs are needed only if the legacy full RSS AI pipeline is enabled. The web and worker share the same intended database.

Update `CURRENT.md`, the phase deployment guide and `feature-checklist.md`. Report exact changed files, resulting behavior, preserved boundaries, validation, manual tests, migration/configuration status, commit/push, actual web/worker deployment and blockers. Mark P08 complete only after its required production/manual gates pass.
