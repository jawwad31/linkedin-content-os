# AGENTS.md — AIXelerate Content OS

## Purpose

This file is the main source of truth for AI coding agents building AIXelerate Content OS.

Read this file first, then read:

1. `security-access.md`
2. `design.md`
3. `feature-checklist.md`

Security rules override convenience. User-confirmed decisions override defaults.

---

## Development Workflow

Work directly on `main` by default. Do not create a feature branch, open a pull request, or wait for PR review/merge unless the user explicitly asks for one.

See `CONTRIBUTING.md` for the full Git workflow (pulling before starting, one change per commit, lint/build before every commit, migration review, rollback via revert).

---

## Product Summary

AIXelerate Content OS is an ICP-first LinkedIn content operating system for B2B founders, operators, consultants, GTM experts, and client-facing experts.

It turns structured business context, founder experience, RSS research, TrendCards, and founder takes into buyer-relevant LinkedIn content.

It is not a generic LinkedIn AI writer.

The product helps internal operators produce:

- TrendCards
- Content Ideas
- LinkedIn Post Drafts
- Reviewed / Approved Posts
- Manual Publish Queue Items

The system prioritizes:

- ICP relevance
- buyer belief shifts
- proof-safe writing
- commercial sharpness
- operator-led POV
- engagement through relevance

The system must avoid:

- fake proof
- comment bait
- generic creator-growth advice
- automatic publishing
- visual/image generation
- broad LinkedIn applause chasing

---

## Core Product Principle

The app should be simple on the surface and structured underneath.

User-facing workflow:

```text
Settings → Research → TrendCards → Ideas → Posts → Review → Publish
```

Important details:
- Founder Experiences and Research are independent input paths.
- Research internally runs sequentially: Collect RSS → Classify Articles → Synthesize TrendCards.
- Ideas can originate from: Founder Experiences, approved TrendCard, or Trend Reaction.
- One selected Content Idea produces one active Post.
- Review follows Post generation.
- Publishing remains manual (there is no automatic publishing or LinkedIn publishing API).

Important rules:
- Business context is always-on background context.
- Business context is not a standalone generation mode.
- There must be no `business_context_only` mode.
- Humans review before posts move to publish queue.
- No scheduler should auto-generate ideas or posts.

---

## Target Users

Primary v1 user:

- AIXelerate founder/operator
- Internal content operator
- Agency-style operator managing one or more clients

Future users:

- B2B founders
- Consultants
- GTM experts
- Agency operators
- Client-facing experts

Do not design for public self-serve signup in v1.

---

## Confirmed Technical Decisions

| Area | Decision |
|---|---|
| Project type | Web App / SaaS / Internal Tool |
| Framework | Next.js App Router |
| Language | TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Visual style | Material 3-inspired custom AIXelerate UI |
| Hosting | Railway hosts the Next.js app |
| Worker | Separate persistent Railway worker |
| Scheduler | Custom worker process, not Railway native Cron |
| Auth | Supabase Auth |
| Database | Supabase Postgres |
| Security | Supabase Row-Level Security |
| LLM provider | OpenRouter |
| Budget target | Under $50/month during MVP |
| Signup | No public signup |
| Collaboration | One user can access multiple clients; multiple users can access one client |
| Invitations | Email invitations |
| Access model | Agency model with `agency_admin`, `client_admin`, and `client_user` only |
| Audit logs | Lightweight logs: user, action, timestamp, client |
| Delete policy | Soft delete by default; Admin hard delete for 6 specific entity types; hard delete temporary logs |
| Publishing | Manual only; no LinkedIn API |

---

## Agency Access Model

Final product roles are exactly:

- `agency_admin`
- `client_admin`
- `client_user`

There is no viewer-level user in the product. Do not add `viewer` to schemas, role selectors, badges, copy, RLS helpers, role union types, API schemas, or tests.

Legacy `client_access` roles were migrated as:

- `owner` -> `client_admin`
- `editor` -> `client_user`
- `viewer` -> `client_user`

Migration note:

```text
Legacy viewer read-only semantics were retired before onboarding real clients. Existing viewer rows are test/dev-era access and are mapped to client_user.
```

Verified live migration state on 2026-07-10:

- `client_access.role` contains only `client_admin` and `client_user`.
- `agency_members.role` contains only `agency_admin`.
- Active clients all have `agency_id`.
- No legacy `owner`, `editor`, or `viewer` rows remain in `client_access`.

Role rules:

- `agency_admin` can access all Client Workspaces under the Agency, manage Settings, manage client users, manage RSS sources, run Research Agent, approve/reject/mark published, and view operational logs.
- `client_admin` can access only assigned Client Workspaces, manage Settings, manage client users, manage RSS sources, run Research Agent, and approve/reject/mark published. `client_admin` cannot access Agency-level pages or agency-admin-only operational logs.
- `client_user` can access only assigned Client Workspaces, create/edit safe workflow content records, mark articles relevant/irrelevant, add a Trend Reaction (one per TrendCard), generate Ideas, add Founder Direction, generate Posts, and copy approved posts.
- `client_user` cannot edit Settings/business context, manage users, manage RSS sources, run Research Agent, approve/reject/archive posts, mark posts published, view operational logs, access Agency-level pages, or access other Client Workspaces.

---

## UX Reference Decision

`jawwad31/linkedin-content-os` is the production source of truth.

Two things are visual/UX reference only — never a source for architecture, dependencies, behavior, fake data, or production code:

- The Google AI Studio prototype repo (`jawwad31/Linkedin-content--os-google`), if referenced.
- Google Stitch static HTML exports used as screen-level design mockups.

UX patterns may be adopted from either reference gradually, one screen at a time:

- polished login
- workspace/client selector cards
- dark sidebar with a current-workspace card
- top header
- denser dashboard layout
- tabbed/card Settings layout

Never copy from either reference:

- Vite
- Express
- Gemini
- fake/mock auth
- local mock state
- hardcoded workspaces
- fake proof
- fake metrics
- fake buyer quotes
- fake posts
- automatic idea/post generation
- unsupported generation modes

---

## MVP Scope

Build in v1:

1. Supabase Auth login with no public signup.
2. Email invitations for client collaboration.
3. Client selector with many users ↔ many clients.
4. Agency access roles: `agency_admin`, `client_admin`, and `client_user`.
5. Client Settings / always-on business context.
6. Founder Experience records.
7. RSS source management.
8. Persistent Railway worker for RSS collection.
9. Manual Run Research Agent button.
10. Article classification.
11. TrendCard synthesis.
12. Trend Reactions on TrendCards (one per TrendCard; Founder Take input was removed from the Research UI, existing stored values still feed Ideas/Post generation).
13. Approve or archive TrendCards.
14. Content Idea generation from exactly three modes:
    - `founder_experience`
    - `trend_card`
    - `trend_reaction`
15. Founder Direction on ideas.
16. Post generation from ideas.
17. Post review workflow:
    - needs edit
    - redraft
    - approve
    - reject
18. Manual Publish Queue:
    - copy post text
    - mark as published
    - published history
19. Research run tracking.
20. Safe LLM metadata logs.
21. Lightweight audit logs.
22. Soft delete for business records by default (except for the 6 entity types allowing administrator hard deletion).

---

## Explicit Non-Goals for v1

Do not build:

- visual generation
- image generation
- logo upload
- visual brand settings
- LinkedIn API publishing
- LinkedIn OAuth
- Stripe/payments
- public signup
- team billing
- PDF export
- carousel generation
- scraping/Apify
- RAG/vector database
- React-free Flask/Jinja implementation
- automatic post publishing
- automatic idea/post generation from scheduler
- generic creator-growth positioning
- `business_context_only` mode
- `research_reactions` mode
- `trend_only` naming
- CSV reference dependency
- ColdIQ/Kenny/Mich reference dependency

---

## System Architecture

```text
Browser
  ↓
Next.js App Router on Railway
  ↓
Supabase Auth
  ↓
Supabase Postgres + RLS
  ↓
OpenRouter for LLM calls

Railway research-worker
  ↓
Supabase Postgres
  ↓
RSS feeds + OpenRouter
```

Railway services:

1. `nextjs-web-app`
   - runs the Next.js application
   - renders protected pages
   - handles API route handlers
   - manages Supabase Auth sessions
   - calls OpenRouter for request/response LLM work
   - exposes manual research trigger endpoint

2. `research-worker`
   - separate persistent worker service
   - collects RSS on interval
   - optionally classifies and synthesizes TrendCards
   - uses distributed run guard
   - writes to Supabase

The worker is not a Railway native Cron Job.

---

## Scheduler and Worker Rules

Environment variables:

```env
RSS_COLLECTOR_ENABLED=true
RSS_COLLECTOR_INTERVAL_HOURS=6
RESEARCH_PIPELINE_FULL=false
```

Default behavior:

```text
RESEARCH_PIPELINE_FULL=false
→ collect RSS only
```

Full pipeline behavior:

```text
RESEARCH_PIPELINE_FULL=true
→ collect RSS
→ classify articles
→ synthesize TrendCards
```

Manual research button:

```text
POST /api/client/[client_id]/run-research-agent
```

Manual run behavior:

```text
Collect RSS
→ classify articles
→ synthesize TrendCards
```

Run guard rules:

- Manual and scheduled runs must use the same distributed run guard.
- No two research runs can overlap for the same client.
- Duplicate clicks should be blocked.
- Worker/manual collisions should be blocked.
- Stale runs should be cleaned up safely.

Never auto-generate:

- Content Ideas
- Posts
- Publish actions

---

## Canonical Skill System

Use this exact skill structure:

```text
linkedin-content-os
├── SKILL.md
├── .agents
│   └── skills
│       ├── content/SKILL.md
│       ├── planning/SKILL.md
│       └── research/SKILL.md
└── resources
    ├── context/business-context.md
    ├── craft/cta-engagement.md
    ├── craft/formats.md
    ├── craft/hooks.md
    ├── craft/storytelling.md
    └── principles
        ├── icp-first-content.md
        └── proof-safety.md
```

Do not create:

- another active skill system
- a separate root `skills/` directory
- `.claude` skills
- CSV reference dependencies
- old narrative mode files

---

## AI Agent Architecture

### Research Agent

Purpose:

Turn collected RSS/research signals into TrendCards.

Responsibilities:

- classify collected articles
- identify buyer-relevant signals
- produce TrendCard summaries
- explain why buyers care
- suggest content angles
- produce proof notes

Inputs:

- business context
- research keywords
- RSS articles / Collected Articles
- existing TrendCards

Outputs:

- Collected Article status updates
- TrendCard records

Output contract:

- `title`
- `shift`
- `why_it_matters`
- `relevance_to_icp`
- `content_angle`
- `source_item_ids`
- `confidence_score`

Rules:

- no source evidence = no TrendCard
- RSS claims are context, not verified proof
- do not duplicate existing TrendCards
- source links are resolved from cited `market_signal_items`; the model must only return cited source item IDs
- founder POV must come from an existing Founder Take value or a Trend Reaction, not generated `founder_pov` (Founder Take is no longer addable from the Research UI; only Trend Reaction, limited to one per TrendCard, can be added there)
- do not expose raw prompts
- do not flash raw LLM errors

Current Pipeline Behavior:
- **Collection**: Collects from active RSS Sources. Inserts only new articles. Dedupes using `client_id` plus `content_hash`. Existing duplicates are skipped/counted, never re-inserted.
- **Classification**: Processes only articles with status `new`. Maximum 50 articles per run. Internal batch size is 12. Classifies as `relevant` or `irrelevant` with a score and reason. Failed classifications remain `new` and are retryable.
- **TrendCard Synthesis**: Processes up to 30 active relevant articles. Groups evidence into distinct market shifts (not one card per article). Zero TrendCards is a valid outcome when evidence is insufficient. Only articles cited by successfully created TrendCards transition to `used`. Uncited relevant articles remain `relevant` and retryable. Failed synthesis leaves articles `relevant`. Existing active TrendCards are supplied during prompt assembly to reduce duplication. Exact title duplication is rejected at the database or application level.
- **Model Routing**: Router targets `OPENROUTER_RESEARCH_MODEL` if configured, falling back to `OPENROUTER_MODEL` otherwise. (Do not hardcode environment-specific model names).
- **Hardening**: Structured JSON schema outputs are enforced where supported. Generates corrective retries on invalid JSON or schema mismatches. Retries transient network, timeout, 429, and 5xx failures. Validates locally using Zod. Excludes raw prompts or raw LLM responses from schema error logging. Handles no-evidence, zero-card, and partial-failure outcomes gracefully.

### Planning Agent

Purpose:

Turn source material into Content Ideas.

Always receives business context:

- ICP
- offer
- POV
- content pillars
- approved proof
- banned topics
- founder voice
- reference material
- publishing preferences

Allowed modes only:

1. `founder_experience`
2. `trend_card`
3. `trend_reaction`

There is no `business_context_only` mode.

Mode rules:

- `founder_experience`: must use real founder experience; do not invent lived experience.
- `trend_card`: must connect to approved TrendCard; do not claim founder lived experience.
- `trend_reaction`: founder_take is the primary POV; TrendCard provides timing/context.

Output contract:

- `angle`
- `buyer_pain`
- `commercial_relevance`
- `belief_shift`
- `content_pillar`
- `angle_boundary`
- `source_context`
- `proof_notes`

Current Agent Behavior:
- **Always-on Context**: Business context is injected into every Planning run.
- **Founder Direction**: Added by user after Idea generation to refine angles.
- **Quantity & Quality**: Generates 3–5 Ideas only when source quality supports it. Returning fewer or zero Ideas is valid when evidence is insufficient.
- **Angle Deduplication**: Excludes filler and duplicate angles that overlap with recent content ideas.
- **Factual Restraints**: Never invents proof, results, metrics, stories, quotes, or experiences.
- **POV Rules**: TrendCard sources provide market context, not founder experience. Trend Reaction uses the founder's reaction text as the primary POV.

### Content Agent

Purpose:

Turn one approved ContentIdea into a final LinkedIn post.

Inputs:

- ContentIdea
- business context
- founder_direction
- approved proof
- reference material
- edit_note when redrafting

Output contract:

- `final_post`
- `buyer_belief_shift`
- `proof_notes`
- `risk_notes`
- `cta_intent`
- `source_context_used`

Rules:

- do not invent proof
- do not invent metrics
- do not invent founder stories
- do not invent client results
- do not use banned topics
- do not use comment bait
- do not use generic P.S. engagement questions
- do not write for competitors/generic creators
- write for the ICP
- build around one buyer belief shift

Current Agent Behavior:
- **Model Routing**: Router targets `OPENROUTER_CONTENT_MODEL` if configured, falling back to `OPENROUTER_MODEL` otherwise. (Do not hardcode specific model names).
- **One Post per Idea Workflow**: One approved/ready Content Idea generates exactly one active Post. A partial unique index enforces this constraint (`deleted_at IS NULL` context). Repeated generation requests return the existing active Post instead of duplicating it, and race conditions are handled safely. The Idea status becomes `used` once its Post is successfully generated. The Ideas list shows `Post Drafted` and `Open Post`, and disabling the generation action. Alternative drafts must be requested using the Needs Edit → Edit Note → Redraft workflow.
- **Scaffolding Hygiene**: Planning metadata (buyer pain, belief shift, commercial relevance, content pillar, angle boundary, source context, proof notes, target ICP) is private and must not appear as internal labels in public Post copy. The belief shift must be expressed naturally. A hygiene check scans hooks, bodies, and CTAs. One corrective retry is performed if scaffolding tags are detected; a second failure returns a safe generic error. Raw prompts and generated Posts are not logged in LLM logs.

---

## Feature-First Folder Structure

Use a feature-first structure.

```text
src/
├── app/
│   ├── login/
│   ├── clients/
│   ├── client/[client_id]/
│   │   ├── dashboard/
│   │   ├── research/
│   │   ├── founder-experiences/
│   │   ├── ideas/
│   │   ├── publish/
│   │   ├── settings/
│   │   └── posts/[post_id]/review/
│   └── api/
├── features/
│   ├── auth/
│   ├── clients/
│   ├── dashboard/
│   ├── setup/
│   ├── founder-experiences/
│   ├── research/
│   ├── ideas/
│   ├── posts/
│   └── publish/
├── components/
│   ├── app-shell/
│   ├── shared/
│   └── ui/
├── lib/
│   ├── supabase/
│   ├── access/
│   ├── audit/
│   ├── errors/
│   ├── openrouter/
│   ├── validation/
│   └── context/
├── worker/
│   ├── scheduler.ts
│   ├── rssCollector.ts
│   ├── researchPipeline.ts
│   ├── classifyArticles.ts
│   └── synthesizeSignals.ts
├── types/
└── utils/
```

Agent service structure:

```text
src/features/research/agents/researchAgent.ts
src/features/ideas/agents/planningAgent.ts
src/features/posts/agents/contentAgent.ts
```

Each agent owns:

- prompt assembly
- input validation
- OpenRouter call
- output schema validation
- safe error handling

---

## Pages

Public:

- `/login`

Protected:

- `/clients`
- `/client/[client_id]/dashboard` (Overview)
- `/client/[client_id]/research` (Research)
- `/client/[client_id]/founder-experiences` (Founder Experiences)
- `/client/[client_id]/ideas` (Ideas)
- `/client/[client_id]/posts` (Posts)
- `/client/[client_id]/publish` (Publish)
- `/client/[client_id]/settings` (Settings)
- `/client/[client_id]/posts/[post_id]/review`

Primary sidebar nav order: Overview, Research, Founder Experiences, Ideas, Posts, Publish, Settings. Post Review is not a primary nav item — it appears only contextually while viewing that exact post.

---

## Settings / Business Context Rules

The Settings page is the always-on business context editor for a client.

- User-facing nav label: **Settings**. Route stays `/client/[client_id]/settings`.
- Business context lives on the `clients` table — no separate business-context table.
- `agency_admin` and `client_admin` can edit; `client_user` cannot edit Settings/business context.
- Every update is scoped by `client_id` and verifies, server-side: authenticated user, accepted access, and `agency_admin` or `client_admin` permission.
- Input is validated with Zod.
- Successful updates write an audit log with `action: client_settings_updated`. Audit metadata stays minimal (e.g. changed field names and count) — never full business context values.
- Team Access / invitations remain part of Settings and must not be broken by business-context changes.
- Founder Experiences entries are separate records with their own primary route and nav item (`/client/[client_id]/founder-experiences`) — not part of Settings at all.

Supported Business Context fields (on `clients`):

- `name`
- `founder_name`
- `industry`
- `business_description`
- `primary_icp`
- `main_offer`
- `core_pov`
- `content_pillars`
- `research_keywords`
- `banned_topics`
- `founder_voice_sample`
- `phrases_to_use`
- `phrases_to_avoid`
- `approved_proof`
- `reference_material`
- `publishing_preferences`

---

## API Conventions

Use Next.js route handlers.

All responses must follow this shape:

```ts
type ApiSuccess<T> = {
  success: true
  data: T
  error: null
}

type ApiFailure = {
  success: false
  data: null
  error: {
    code: string
    message: string
  }
}
```

Rules:

- Validate inputs with Zod.
- Check auth server-side.
- Check client access server-side.
- Check role permissions server-side.
- Scope all queries by `client_id`.
- Never trust role/client ownership from client payload.
- Log audit events for important mutations.
- Return safe errors only.

---

## Core API Routes

Clients:

```text
GET    /api/clients
POST   /api/clients
GET    /api/client/[client_id]
PATCH  /api/client/[client_id]
```

Invitations:

```text
POST /api/client/[client_id]/invites
POST /api/invites/[invite_id]/accept
POST /api/invites/[invite_id]/revoke
```

Founder Experiences:

```text
POST   /api/client/[client_id]/founder-experiences
PATCH  /api/client/[client_id]/founder-experiences/[experience_id]
DELETE /api/client/[client_id]/founder-experiences/[experience_id]
```

Research:

```text
GET    /api/client/[client_id]/research-runs
POST   /api/client/[client_id]/rss-sources
PATCH  /api/client/[client_id]/rss-sources/[source_id]
DELETE /api/client/[client_id]/rss-sources/[source_id]
POST   /api/client/[client_id]/run-research-agent
POST   /api/client/[client_id]/market-items/[item_id]/mark-relevant
POST   /api/client/[client_id]/market-items/[item_id]/mark-irrelevant
POST   /api/client/[client_id]/trend-cards/[trend_card_id]/founder-take
POST   /api/client/[client_id]/trend-cards/[trend_card_id]/approve-for-ideas
POST   /api/client/[client_id]/trend-cards/[trend_card_id]/react
POST   /api/client/[client_id]/trend-cards/[trend_card_id]/archive
```

Ideas:

```text
GET    /api/client/[client_id]/ideas
POST   /api/client/[client_id]/ideas/generate
PATCH  /api/client/[client_id]/ideas/[idea_id]/direction
POST   /api/client/[client_id]/ideas/[idea_id]/generate-post
```

Posts:

```text
GET  /api/client/[client_id]/posts/[post_id]
POST /api/client/[client_id]/posts/[post_id]/needs-edit
POST /api/client/[client_id]/posts/[post_id]/redraft
POST /api/client/[client_id]/posts/[post_id]/approve
POST /api/client/[client_id]/posts/[post_id]/reject
POST /api/client/[client_id]/posts/[post_id]/mark-published
```

---

## Database Overview

Use Supabase Postgres.

Tables:

- `profiles`
- `agencies`
- `agency_members`
- `clients`
- `client_access`
- `rss_sources`
- `market_signal_items`
- `trend_cards`
- `founder_experiences`
- `content_ideas`
- `posts`
- `research_runs`
- `llm_logs`
- `audit_logs`

Every client-owned table must include `client_id`.

## Hard-Delete Policy

Administrator hard deletion is implemented using SQL DELETE for these six specific entity types:
- RSS Sources (`rss_sources`)
- Collected Articles (`market_signal_items`)
- TrendCards (`trend_cards`)
- Founder Experience entries (`founder_experiences`)
- Content Ideas (`content_ideas`)
- Posts (`posts`)

Allowed roles:
- `agency_admin`, when the Client Workspace belongs to that administrator's Agency.
- `client_admin`, for that exact Client Workspace.
- Blocked: `client_user`, unauthenticated users, users from other Client Workspaces, and administrators from other Agencies.

Security & Isolation:
- Every Delete request uses the authenticated session-bound Supabase client so that the custom DELETE RLS policies remain active.
- No `SUPABASE_SERVICE_ROLE_KEY` bypass is used.
- Cross-client and cross-Agency deletions are denied.

Dependency & Conflict Behavior:
- Never silently cascade-delete downstream business content. If a dependency exists, return a `DEPENDENCY_CONFLICT` (HTTP 409) status with a safe error message.
- RSS Source: Allow hard deletion even when articles were collected (articles remain with `rss_source_id` set to null).
- Collected Article: Block if cited by any active TrendCard.
- TrendCard: Block if referenced by active founder experiences or content ideas. On delete, restore uncited 'used' articles back to 'relevant' atomically.
- Founder Experience: Block if referenced by active content ideas.
- Content Idea: Block if referenced by active posts. This blocks ideas linked to posts in review, needs_edit, approved, rejected, or published states. The post must be deleted first. Deleting a content idea never automatically deletes its post.
- Post: Allow deletion. If no active posts remain for the linked Content Idea, set its status back to 'ready'.

Permanent Confirmation Requirements:
- Every Delete control requires confirmation: "Delete this {record type}? This permanently deletes \"{record title}\". This action cannot be undone."
- For Approved or Published Posts, the API and UI require the user to type exactly "DELETE" to confirm. Deleting an internal published Post does not remove the actual LinkedIn post.

Audit Logs:
- RSS Source: `rss_source_hard_deleted`
- Collected Article: `article_hard_deleted`
- TrendCard: `trend_card_hard_deleted` (audit count measures only used → relevant transitions)
- Founder Experience: `founder_experience_hard_deleted`
- Content Idea: `content_idea_hard_deleted`
- Post: `post_hard_deleted` (audit metadata reports Idea restoration status)
- Complete article summaries, post bodies, founder experience texts, prompts, and secrets are excluded from audit metadata.
- Verification checks: Every direct delete confirms exactly one deleted row was returned from database before writing the audit log.
- Raw RPC and database errors are never returned to the browser.
- The canonical Collected Article delete route is under `/api/client/[client_id]/market-items/[item_id]`; the duplicate `collected-articles` route was removed.
- State cleanup is an automatic workflow-state action: deleted records remain deleted (no Trash screen, no Undo action, and no restore-deleted-record feature).

---

## Current Product Priority

- **Private MVP Complete**: Core private-MVP functionality is fully implemented.
- **UI Refresh**: The next active work is a UI visual polish.
- **Constraints**: Visual polish must preserve all current workflows, permissions, API data contracts, and security rules. Do not mix new backend features or filters into UI-refresh commits. Refresh one screen or coherent component system at a time. No mock metrics, fake posts, fake proof, or hardcoded workspaces.

---

## Table Summary

### profiles

Supabase Auth user profile.

Key fields:

- `id`
- `email`
- `name`
- `role`
- `active`

### agencies

Agency account container.

Key fields:

- `id`
- `name`
- `created_at`
- `updated_at`

### agency_members

Agency-level membership.

Key fields:

- `agency_id`
- `user_id`
- `role`: agency_admin

### clients

Client/business context.

Key fields:

- `agency_id`
- `owner_user_id`
- `name`
- `founder_name`
- `industry`
- `business_description`
- `primary_icp`
- `main_offer`
- `core_pov`
- `content_pillars`
- `research_keywords`
- `banned_topics`
- `founder_voice_sample`
- `phrases_to_use`
- `phrases_to_avoid`
- `approved_proof`
- `reference_material`
- `publishing_preferences`
- `deleted_at`

### client_access

Many-to-many client access.

Key fields:

- `client_id`
- `user_id`
- `role`: client_admin | client_user
- `invited_email`
- `invitation_status`: pending | accepted | revoked
- `invited_by_user_id`

### rss_sources

RSS source records.

Key fields:

- `client_id`
- `source_name`
- `feed_url`
- `category`
- `active`
- `recency_days`
- `last_checked_at`
- `last_success_at`
- `last_error`
- `deleted_at`

### market_signal_items

Collected RSS articles.

Key fields:

- `client_id`
- `rss_source_id`
- `title`
- `url`
- `summary`
- `published_at`
- `collected_at`
- `content_hash`
- `source_name`
- `status`: new | relevant | irrelevant | used
- `relevance_score`
- `classification_reason`
- `deleted_at`

Rules:

- recency_days is a per-source collection window in days
- dedupe by `client_id + content_hash`
- normalize URLs before hashing
- do not expose raw RSS JSON by default

### trend_cards

Synthesized TrendCards.

Key fields:

- `client_id`
- `title`
- `shift`
- `why_it_matters`
- `relevance_to_icp`
- `content_angle`
- `source_item_ids_json`
- `confidence_score`
- `founder_take`
- `approved_for_ideas`
- `week_of`
- `deleted_at`

Rules:

- must have source evidence
- confidence_score must be 1–10
- approved_for_ideas controls Planning Agent eligibility
- source links are shown from cited `market_signal_items`
- `founder_pov` and `evidence` are legacy columns for old records; new synthesis does not generate them
- archive is soft delete via `deleted_at`

### founder_experiences

Real founder/operator experiences.

Key fields:

- `client_id`
- `title`
- `what_happened`
- `what_was_learned`
- `what_changed`
- `why_it_matters`
- `entry_type`: work_log | trend_reaction
- `reaction_type`: agreement | contradiction | gap | observation
- `source_trend_card_id`
- `deleted_at`

### content_ideas

Generated ideas.

Key fields:

- `client_id`
- `source_type`: founder_experience | trend_card | trend_reaction
- `source_ids_json`
- `angle`
- `buyer_pain`
- `commercial_relevance`
- `content_pillar`
- `belief_shift`
- `angle_boundary`
- `source_context`
- `proof_notes`
- `founder_direction`
- `status`: draft | ready | used | archived
- `deleted_at`

### posts

Generated LinkedIn posts.

Key fields:

- `client_id`
- `content_idea_id`
- `final_post`
- `buyer_belief_shift`
- `proof_notes`
- `risk_notes`
- `cta_intent`
- `source_context_used`
- `status`: review | needs_edit | approved | published | rejected
- `edit_note`
- `approved_at`
- `published_at`
- `deleted_at`

### research_runs

Tracks manual and worker research jobs.

Key fields:

- `client_id`
- `triggered_by_user_id`
- `trigger_type`: manual | worker
- `status`: queued | running | success | failed | cancelled
- `stage`
- `error_message`
- `lock_key`
- `started_at`
- `finished_at`

### llm_logs

Safe metadata only.

Allowed fields:

- `client_id`
- `user_id`
- `provider`
- `model`
- `feature`
- `status`
- `token_input_count`
- `token_output_count`
- `estimated_cost`
- `error_type`

Never store raw prompts or sensitive business context.

### audit_logs

Lightweight audit trail.

Key fields:

- `client_id`
- `user_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata`
- `created_at`

---

## Environment Variables

Frontend-safe:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=
```

Server-only:

```env
SUPABASE_SERVICE_ROLE_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=
OPENROUTER_RESEARCH_MODEL=
WORKER_SECRET=
RSS_COLLECTOR_ENABLED=true
RSS_COLLECTOR_INTERVAL_HOURS=6
RESEARCH_PIPELINE_FULL=false
```

Rules:

- OPENROUTER_RESEARCH_MODEL is used for article classification and TrendCard synthesis, falling back to OPENROUTER_MODEL if unset.
- Store production secrets in Railway.
- Never commit `.env.local`.
- Never expose service role or OpenRouter keys to the browser.

---

## Coding Standards

Use:

- TypeScript
- Next.js App Router
- Server Components by default
- Client Components only when needed
- Zod for input/output validation
- React Hook Form for forms
- shadcn/ui for base components
- feature-first folder organization
- safe API response shape
- no raw stack traces in UI
- no hardcoded secrets
- no duplicate business logic across routes

Do not:

- add Supabase service role to client code
- expose OpenRouter keys
- invent new content generation modes
- create generic AI writer flows
- add LinkedIn API publishing
- add visual generation
- add public signup
- use unscoped database queries

---

## Definition of Done

The MVP is done when:

- User can log in.
- User can select a client.
- Agency admins and client admins can invite collaborators by email, subject to client scope.
- User roles are enforced.
- No viewer-level role exists.
- `client_user` can contribute to safe workflow content but cannot manage Settings, users, RSS sources, Research Agent, post approvals, publishing state, operational logs, Agency-level pages, or other Client Workspaces.
- Client data is scoped by `client_id`.
- User can create/update business context.
- User can create Founder Experiences.
- User can add RSS sources.
- Worker can collect RSS articles.
- User can manually run research.
- App classifies collected articles.
- App generates TrendCards.
- User can add a Trend Reaction (one per TrendCard); Founder Take is no longer addable from the Research UI.
- User can approve TrendCards for ideas.
- Planning Agent generates ideas from:
  - founder_experience
  - trend_card
  - trend_reaction
- User can add founder_direction.
- Content Agent drafts a LinkedIn post.
- User can review/redraft/approve/reject post.
- Approved posts appear in Publish.
- User can copy and mark posts as published.
- Audit logs exist for key actions.
- LLM logs store metadata only.
- No visual generation exists.
- No LinkedIn API publishing exists.
