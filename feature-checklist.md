# Feature checklist — 2026-10-06 roadmap

This is the active implementation tracker. The historical MVP checklist is preserved under docs/reference/2026-10-06 and is not the next build sequence. Read AGENTS.md, security-access.md, design.md, feature-checklist.md, CONTRIBUTING.md in that order before starting a phase.

## Status at handoff

Repository read access and selected source files were verified. This package has not been applied to the repository. No feature below has been implemented, committed, pushed, deployed, or manually accepted by this planning delivery.

| Phase | Deliverable | Dependency | Status |
|---|---|---|---|
| P00 | Canonical docs and baseline reconciliation | None | Complete |
| P01 | Business/personal profiles | P00 | Complete |
| P02 | Content Bank and explicit reuse | P01 | Complete |
| P03 | Markdown documents and scoped retrieval | P01–P02 | Complete |
| P04 | Shared standalone drafting and editorial controls | P01–P03 | Source-mode correction implemented (`b958580`); corrective migration/manual checks pending |
| P05 | Monthly allocation/defaults/source selection | P02/P04 | Implemented (4160ec1); migrations reported applied; fresh manual revalidation deferred to extensive testing at Jawad's request. |
| P06 | Resumable calendar draft batches | P05 | Implemented; migrations reported applied; Railway web e0acab0/login verified and database target user-confirmed. Manual acceptance deferred to extensive testing at Jawad's request, 2026-10-07. Production flag absent/off. |
| P07 | Saved prompt and manual web research | P00/P04 | Feature commit adf3693 pushed to main; Railway web/worker deployment SUCCESS verified 2026-10-08. Additive migration, provider setup and manual acceptance remain pending. Manual acceptance deferred to extensive testing; not complete. |
| P08 | Schedules, source monitoring, notifications | P07 | Planned |
| P09 | Newsletter editions | P02–P04/P07 | Planned |
| P10 | Release validation and compatibility closure | Shipped slices | Planned |

## Acceptance gates

- [x] P00: root canonical docs installed; legacy rule copies reconciled/archived to docs/reference/2026-10-06; current capabilities/provisioning/design preserved; baseline lint/build/tests and provider decision recorded.
- [x] P01: separate profiles persist; selected personal readers influence generation; older fields and Team Access preserved; scoped admin editing enforced.
- [x] P02: experiences/resources available in Content Bank with distinct categories; current delivery/gating retained; explicit reuse and transactional reservations/use history work.
- [x] P03: MD/TXT originals preserved; processing/retry/version states work; selected evidence retrieved accurately; no cross-account/private-source leaks.
- [x] P04: all approved source entry points share generation/QA; post type/pillar/funnel/reader/takeaway editable; existing plans and one-post-per-idea invariant preserved.
- [ ] P05: Save for this month differs from Save as default; existing months immutable to default changes; deterministic actual allocation; source shortage and news cap handled. Automated SQL/service/allocation/render coverage remains recorded. Migrations `20261006150000`-`20261006190000` and earlier post-deploy completion were reported by Jawad, but fresh read-only checks on 2026-10-07 found no saved defaults, slots, or reservations in the configured project. Jawad does not remember his earlier test steps. Repeat connected checks, including two-window contention; do not count them as observed passes yet.
- [ ] P06: user-triggered batches resume by slot; failures do not consume entries; retries do not duplicate drafts; cancellation and permission checks hold. Connected manual checks remain pending. Railway web deployment is e0acab0, `/login` returns HTTP 200, and `CALENDAR_DRAFTING_ENABLED` is absent/off. Jawad confirmed Railway's Supabase URL matches project ref `iphivwufbnmgbuqhicjn` on 2026-10-07; the connector cannot independently read its value. Supplied-note/document source check: **not testable: no entry point**; other reachable source checks remain pending.
- [ ] P07: saved research prompt editable; run uses saved revision; profile off means independent research; findings include evidence/dates/uncertainty; no autonomous posts.
  Local implementation includes version snapshots, shared RSS locking, bounded web search, retained candidates, human source approval and explicit separate-post selection. Lint/build pass; 33 files / 283 automated tests pass. Migration `20261007192100_prompt_controlled_web_research.sql` and `OPENAI_API_KEY` / `OPENAI_RESEARCH_MODEL` must be configured before connected checks. Source/date accuracy and unrelated-topic acceptance remain pending; see `docs/p07-deployment.md`.
- [ ] P08: timezone-aware due times and shared locking; pause/catch-up/retry; blog/article monitoring; in-app notifications; bounded and safe URL fetching.
- [ ] P09: mixed-source editions drafted/reviewed/copied; source usage linked; exact approval version; monthly post allocation unaffected.
- [ ] P10: legacy links/data survive; migration reports reviewed; current security and new acceptance matrix pass; deployment and required manual tests verified.

For each phase also record: lint, build, relevant test evidence, diff review, focused commit hash, push result, affected migrations, web/worker deployment, and manual post-deploy checks. Use “implemented, awaiting deployment” or “deployed, awaiting manual tests” when appropriate. Never substitute “complete” for unavailable validation.

Latest testing decision, 2026-10-07: Jawad deferred the remaining manual checks to an extensive testing round after implementation. Stop guided acceptance for now. All unchecked gates remain pending, and the supplied-note/document limitation remains untestable until an entry point is available. No manual pass or phase completion is inferred from this deferral; production Calendar drafting stays off. On 2026-10-08 Jawad said "please proceed"; Codex moved to P07. P07's research-finding-to-post entry point is implemented locally; supplied notes/documents still have no standalone UI.

P06 acceptance preparation, 2026-10-07: Jawad confirmed Railway's database URL matches the locally configured project and all five profile tabs are visible in the deployed Settings. The earlier save-check discrepancy was resolved as a different workspace, without a confirmed save defect. After he opened the correct Client 1 URL (`2eecf9cd-6537-4020-baa9-5e57a76d6ff4`), read-only counts verify a persisted description at profile revision 2 and one Settings-save audit event. ICP/offer and source preparation remain pending. These setup checks do not pass the Calendar drafting acceptance gates.

## Preserved baseline checks

- [ ] Manual admin user creation and forced password change still work.
- [ ] Agency isolation and selected Account User capabilities remain enforced.
- [ ] Legacy idea → post → QA → review → manual Publish still works.
- [ ] Admin delete/bulk-delete protections and dependency errors remain intact; add new calendar/newsletter/usage dependencies.
- [ ] Current Roboto Flex/warm Material-inspired visual language remains consistent.
- [ ] Raw prompts, source content, passwords, and keys stay out of ordinary logs.

## Deferred / outside this release

- Automated LinkedIn post publishing and analytics: later integration/access phase.
- Native LinkedIn newsletter API publication: not promised.
- Built-in Apify/LinkedIn scraper: not required; manual examples/voice-guide import suffice.
- Native voice recording/transcription: later enhancement; typed or pasted transcript capture works first.
- Visual generation, carousels, billing, public signup, automatic DMs: excluded.
- Destructive legacy schema cleanup: separate explicit approval required.
- General UI refresh backlog: only task-relevant screen work is included; do not mix unrelated polish into feature commits.
