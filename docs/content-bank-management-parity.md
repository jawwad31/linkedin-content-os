# Content Bank management completion — 2026-10-09

Status: feature `bfa6d57bf077b870dfe3b27c2dcff0ce71fd1115` pushed/deployed; testing deferred. This is a focused P02/P10 completion, not a new roadmap phase. Read AGENTS.md, security-access.md, design.md, feature-checklist.md and CONTRIBUTING.md in order, then P02/P10 in IMPLEMENTATION-PLAN.md, product-spec.md and CURRENT.md. Baseline: main `fc2b8ad02fc6dd9a4bcab2c70c49f4ff395c0a2f`.

## Change

Content Bank has one capture/edit form with the full experience structure and resource description, problem solved, target use case, keyword, manual delivery URL/instructions, active state and comment-gate approval. Raw notes are independent of the resource description. Unchanged fields are omitted from an edit; optional fields can be deliberately cleared. Stale editor revisions and concurrent database updates fail visibly. The complete entry view includes dates, linked Research navigation, source usage dates/channels/statuses/angles/takeaways, and available post/newsletter output links.

Readiness, activity, usage and reuse remain distinct. Bank archiving retains the record and its ledger, and deactivates a resource. An administrator can restore readiness and deliberately reactivate it using Edit. It does not perform the legacy soft-archive operation or permanently delete records. Existing administrator deletion controls and dependency checks remain on Founder Experiences. No resource hard-delete control is introduced.

Account/actor/password checks and the session-bound RLS client protect every mutation. Resource management remains admin-only; work logs require `founder_experience_manage`; saved trend reactions require `research_contribute` and retain their linked card/type. Resource/experience record types cannot be converted through a category change. Resource keyword/delivery rules and reaction limits reuse the existing schemas. Audit metadata contains identifiers and changed field names, never entry text.

List/ledger/history reads paginate past the default database row limit. Source usage is keyed by record type and ID. A failed usage read prevents an incorrect unused status or empty-history success. Failed reuse/archive/save actions display an error and retain the prior visible state. The panel takes refreshed server entries directly; it no longer keeps a stale copy of the initial list or reloads the entire browser after capture. Legacy writes invalidate the Bank route as well.

The previous `posts?sourceId=...` link did not load a selected source. It is replaced by honest Open Ideas navigation. Existing deliberate newsletter selection remains. Direct Bank Create post and Add to calendar actions still require a separate integration slice through the shared writer/reservation services; this release does not claim those actions are implemented. The existing resource schema/database supports seven resource types; Framework is not offered as a saveable type until an additive schema/playbook change supports it. No existing type or record is rewritten.

## Files

- `src/features/content-bank/actions.ts`
- `src/features/content-bank/content-bank-entry-form.tsx`
- `src/features/content-bank/content-bank-panel.tsx`
- `src/features/content-bank/queries.ts`
- `src/features/content-bank/schemas.ts`
- `src/features/content-bank/service.ts`
- `src/features/founder-experiences/actions.ts`
- `src/features/founder-experiences/service.ts`
- `src/features/resources/service.ts`
- `src/features/research/trend-cards/service.ts`
- This guide, `docs/handoffs/CURRENT.md`, `docs/p10-release-validation.md`, and `feature-checklist.md`.

## Release and deferred acceptance

No migration, variable, dependency, provider, worker or scheduler change. Existing source IDs/data, legacy routes/navigation, reservations, one active post per Idea, QA/human approval and manual publishing services remain. Calendar batch drafting stays off; account schedules stay paused. Unrelated `supabase/.temp/` is excluded.

Source/diff review only. At Jawad's explicit request, automated tests, local lint/build/type checks, browser/HTTP/API/database acceptance and paid model calls were not run. Railway's normal automatic compilation/deployment is not a manual or functional acceptance pass. Exact-feature-SHA worker `f7a86c7f-f50b-4697-8876-de4c16a1deb1` reports SUCCESS at 17:26:41 UTC. Web `27e4fca4-f0c9-49eb-be3d-ea792b1a5c56` reports SLEEPING at 17:33:10 UTC; describe-service confirms live state and existing `sleepApplication=true`. The prior web deployment is removed. No app request was sent to wake it; web SUCCESS was not directly observed before sleep. This documentation-only closeout retains application code and triggers another normal deployment; its final exact-SHA platform state belongs to the completion report.

The deferred manual round must compare populated legacy and Bank records before/after edits, exercise independent notes/description/activation/approval/delivery, clearing fields, stale edits, retry/error presentation, resource/experience/category permission denial, work-log versus reaction capabilities, archive/restore, refreshed legacy writes, source usage and available output links, and keyboard/mobile behavior. Existing administrator deletion must still enforce its dependencies. Required acceptance remains pending; keep legacy navigation and do not mark P02/P10 complete.

Application rollback restores baseline code through normal Git revert/deployment. There is no new schema to reverse; retain any records created through the UI. Next implementation: direct Bank source-to-post/calendar actions with deliberate selection and the existing atomic ledger; do not bypass these via a source-ID URL or the unused standalone direct-insert service.
