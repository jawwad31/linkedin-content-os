# Standalone notes and document entry — 2026-10-09

Status: deployed, awaiting deferred testing. Jawad explicitly requested no further testing until all implementation prompts are finished. No new automated tests, local lint/type/build runs, browser/API/database acceptance checks or paid model calls were performed. Source/diff review is implementation review, not a passing test result. Prior 341-test evidence applies to the previous release only.

Read AGENTS.md, security-access.md, design.md, feature-checklist.md and CONTRIBUTING.md in order, then IMPLEMENTATION-PLAN.md P04/P10, product-spec.md and CURRENT.md. The numbered roadmap ends at P10; this focused slice closes its recorded P04 note/document entry gap. Baseline: main `493f71118d8d385c38fff0970b187ab06753227a`. No branch, PR, new scheduler, dependency, provider assignment, variable or migration.

## Behavior

Posts exposes Create post to users with both ideas_manage and posts_draft, or scoped administrators. The form supports a pasted note/transcript, an existing ready source-material document, or a new UTF-8 .md/.txt file. Uploads additionally require the existing founder_experience_manage permission; private evidence, profile references and reader-download purposes are not offered as primary sources.

Topic/angle is required. Instructions, intended reader, takeaway and pillar are optional. Post type and funnel stage support Auto and explicit overrides. Resource offers continue through deliberate selection of approved Content Bank resources; this note/document path does not authorize a gated offer or public file delivery.

The source and controls create a protected ready Idea, then the form calls the existing rate-limited idea-to-post endpoint. That endpoint owns planning, drafting, independent QA, one active post per idea, review and later manual publication. A failure retains the same brief; retry does not create another Idea. The form locks its saved brief; a deliberate Start a new brief creates a separate request. Saved briefs remain accessible in Ideas if the browser closes.

Request-derived IDs are scoped to account, actor and request. Matching request hashes resume existing rows; changed inputs cannot silently reuse that request. New uploads use a new document ID and retain their original text/filename rather than archiving a same-name file. A failed brief save can leave a saved private document, which is preserved and reused by a matching retry. No existing source is deleted or rewritten.

Selected document IDs/hash/version are pinned in protected source context. The shared loader requires the same ready, account-owned document and checks actual text hash, purpose and size before paid generation. Legacy custom-upload records without this new pin remain supported. Resolved editorial fields and document provenance reach the post/review record, including redrafts. Planning now receives the existing full business/personal context fields supported by its contract, instead of dropping them in the writer-to-planner adapter.

## Limits and preservation

Pasted source notes and separate instructions each support 4,000 characters. This full-source standalone entry supports files up to 128,000 UTF-8 bytes. Browser decoding rejects invalid UTF-8/NUL/empty input; the server bounds text and the actual JSON request stream. Larger saved originals remain usable in the document library; this entry asks for a smaller source or relevant note instead of silently shortening facts. Long-file retrieval behavior is not expanded by this slice. A preview renders text, not active HTML.

Capabilities, password gate, authenticated RLS writes, account filtering, protected data, advisory QA and human approval/manual publication remain the intended boundaries. No production fixture or workflow mutation was made during implementation. The browser receives only ready source-material document metadata for its chooser, not the library's full private texts. Audit events store IDs/purpose/counts, not notes, instructions or source text. Calendar allocation, schedules and batch-drafting flags remain unchanged.

The existing normal generator prevents duplicate stored posts with its account/Idea lookup and unique constraint. Its in-memory rate limiter and possible simultaneous paid calls are existing limitations; this slice does not introduce a new distributed generation lease or promise charge deduplication across replicas.

## Changed files and release

- `src/app/client/[client_id]/posts/page.tsx`
- `src/app/api/client/[client_id]/posts/standalone/route.ts`
- `src/features/posts/generate/{standalone-brief-schema.ts,standalone-brief-service.ts,standalone-post-form.tsx,service.ts}`
- This guide, `feature-checklist.md`, `docs/handoffs/CURRENT.md` and the P10 acceptance matrix.

Source/diff review and explicit-path commit/push completed under Jawad's no-testing instruction, overriding the usual pre-commit test/lint/build requirements for this slice. Release `4e13b5f5fc3af7181fd016b387f4be7bf652f5c0` pushed to main; exact-SHA web `38044015-1456-4d3f-8054-2b33c4a65040` and worker `33c43a22-22a7-4a29-801e-ddfd06cef812` both SUCCESS. Only platform status was inspected, with no runtime log/smoke/API/database/browser check. Railway's automatic deployment build is part of deployment; local validation and functional acceptance remain deferred. The documentation-only closeout preserves code; its final platform status belongs to the completion report. Application rollback restores baseline code; no database reversal is needed, and any user-created notes/documents/Ideas must be preserved.

The later manual round must exercise every source option, Auto/override fidelity, upload permissions, account denial, invalid/large files, same-name originals, response loss/retry, archived/replaced sources, actual planner/writer/QA output, review/redraft/approval and manual publication. Other P10 compatibility/recovery and Content Bank parity gates remain pending.
