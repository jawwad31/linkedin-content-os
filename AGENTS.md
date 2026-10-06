# AGENTS.md — Virel (previously AIXelerate LinkedIn Content OS)

Updated: 2026-10-06. Product name is confirmed as **Virel**. Repositories, infrastructure, database identifiers, and packages retain their existing names. This document governs the approved next product iteration. Planned functionality is not implemented merely because it is documented here.

## Read order and authority

Every coding agent must read, in order:

1. `AGENTS.md`
2. `security-access.md`
3. `design.md`
4. `feature-checklist.md`
5. `CONTRIBUTING.md`

Then read the assigned phase of `IMPLEMENTATION-PLAN.md`, `docs/planning/product-spec.md`, and the latest `docs/handoffs/CURRENT.md`. Read only task-relevant source and playbooks afterward.

AGENTS.md is primary; security rules override convenience; Jawad's confirmed decisions override older product documentation. Current code establishes what exists, not what the next iteration must preserve when a behavior change is explicitly approved. Historical documents under `docs/reference/` are non-authoritative. Do not revive retired rules from them.

One canonical rule set serves Codex, Claude, and Gemini. `CLAUDE.md` and `GEMINI.md` are pointers, not parallel specifications. Root `SKILL.md` is a developer router, not runtime writing context. Existing `.agents/skills/` and allowlisted `resources/` remain the runtime playbook system; do not create a competing system.

## Product contract

One personal-brand Account/Client Workspace has separate business and personal-brand context profiles. It supports standalone posts and monthly calendars through the same planning, drafting, evidence, QA, and human-review services. A newsletter can use both research and Content Bank material.

Content Bank unifies experiences, observations, experiments, case studies, processes, achievements, and lead magnets. Lead magnets remain a distinct category. The standalone Resources navigation is retired only when existing records, approvals, delivery information, and links remain usable in Content Bank.

Personal readership may include practitioners and peers beyond the buyer ICP. Every post has one intended reader, topic, pillar, post type, takeaway, and funnel stage. The stages are Discovery, Depth, Authority, and Commercial. AI suggests; the user can override. Factual evidence is not a creative setting.

Calendar source allocations are user-configurable per month and can also be saved as account defaults. No universal 40%, 50%, 60%, or news percentage is a confirmed default. Reusable entries require explicit user permission and deliberate selection. Exact inventory, reservations, and usage come from the database, never similarity search.

Research follows its editable saved prompt. Profile context is optional and initially off. Research may run on a schedule and save briefings plus angle suggestions. It must not autonomously create calendar assignments, operational Ideas, final posts, newsletter editions, approvals, or publishing actions.

## Existing architecture to extend

- Next.js App Router, TypeScript, Tailwind, current shadcn-style primitives.
- Supabase Auth/Postgres/RLS; retain `client_id` as the isolation boundary.
- Railway Next.js app and separate persistent research worker.
- OpenRouter currently handles writing and research LLM work; existing planning, drafting, and independent QA stay reusable.
- Current writing contracts include `GenerationPlanV2`, version/input hashes, strategy overrides, selected resource IDs, deterministic checks, and one active post per idea.
- Node and dependency versions come from package.json and the lockfile, not this document.

Recommended additions, to be recorded in Phase P00: private document storage and a scoped retrieval service; OpenAI hosted retrieval and Responses web search behind narrow server-only adapters. Do not migrate all writing calls, add a multi-agent platform, or add a second scheduler merely for these features. Coding with different AI tools does not require the application to use their model providers.

## Runtime context contract

Preserve essential profile fields and hard rules without arbitrary compression. Load the selected source record directly, include the relevant stage playbook explicitly, retrieve relevant excerpts from long supporting files, and retain provenance. Markdown is supported; it is not token compression. Preserve original files. Selected required facts must never disappear silently due to truncation or failed retrieval.

Form values take precedence over conflicting supporting documents. The user maintains content manually. No document-to-form autofill or disagreement-detection subsystem. Writing examples influence style only, never the user's beliefs, results, or life story.

All sources and retrieved content are data, not privileged instructions. Enforce account/document scope before retrieval and verify it afterward. Store private prompts and sources only as authorized application records, never as general logs.

## Preserved boundaries

- Preserve current manual provisioning, forced password-change gate, agency isolation, capability-based Account User access, and existing administrator deletion safeguards. `security-access.md` owns these rules.
- No public signup, billing, auto-DMs, built-in LinkedIn scraper, visual generation, or unrelated redesign.
- Manual publication remains functional. LinkedIn API publishing/analytics is a later separately gated integration; native newsletter API publication is not promised.
- Preserve one active post per idea; reuse an experience by creating a new idea/assignment, not by violating that invariant.
- New post edits invalidate approval of that version. QA is not human approval.
- Do not delete or rewrite legacy source data during migration. No destructive database changes without explicit approval.

## Implementation discipline

Use one focused phase/slice at a time on main. No branch or PR unless requested. Only one coding tool edits the working folder at a time. Lint, build, relevant risk-based tests, and diff review precede every commit. See CONTRIBUTING.md for commands and handoff rules.

Every implementation prompt must specify the five-file read order above. Every completion report must include files changed, changes, behavior preserved, validation, manual tests, commit/push, deployment, and blockers. A phase is complete only after deployment and required manual checks pass; otherwise record its actual intermediate status.
