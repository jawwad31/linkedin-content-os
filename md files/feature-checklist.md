# feature-checklist.md — AIXelerate Content OS

## Purpose

This is the build roadmap.

Build one feature at a time. Do not skip ahead.

For every feature:

1. Read `AGENTS.md`.
2. Read `security-access.md`.
3. Read `design.md`.
4. Implement only this feature.
5. Run tests/build.
6. Commit with the suggested commit message.

---

## Feature 00 — Project Scaffold

Goal:

Create the base Next.js App Router project with TypeScript, Tailwind, shadcn/ui, and feature-first folders.

Dependencies:

- None

Files/Folders:

- `src/app`
- `src/features`
- `src/components`
- `src/lib`
- `src/worker`
- `src/types`
- `.env.example`

Acceptance Criteria:

- App runs locally.
- Placeholder routes exist.
- Tailwind and shadcn/ui configured.
- `.env.local` ignored.
- No secrets hardcoded.

Test:

- `npm run dev`
- Visit placeholder routes.
- `npm run build`

Commit:

```text
chore: scaffold Next.js app
```

---

## Feature 01 — Design System Foundation

Goal:

Implement the visual foundation from `design.md`.

Dependencies:

- Feature 00

Files:

- Tailwind config
- base CSS
- shared button/card/badge components
- app shell primitives

Acceptance Criteria:

- Brand colors available as tokens.
- Fonts configured.
- Button variants exist.
- Card/badge styles exist.
- No random hardcoded colors.

Test:

- View placeholder pages.
- Confirm typography/colors.
- Build passes.

Commit:

```text
feat: add design system foundation
```

---

## Feature 02 — Supabase Foundation

Goal:

Set up Supabase client helpers and env validation.

Dependencies:

- Feature 00

Files:

- `src/lib/supabase`
- `src/lib/auth`
- `.env.example`

Acceptance Criteria:

- Browser client exists.
- Server client exists.
- Session helper exists.
- Env vars documented.
- Service role key is server-only.

Test:

- App builds.
- Env validation works.

Commit:

```text
chore: configure Supabase foundation
```

---

## Feature 03 — Database Schema

Goal:

Create Supabase migrations for core tables.

Dependencies:

- Feature 02

Tables:

- profiles
- clients
- client_access
- rss_sources
- market_signal_items
- trend_cards
- founder_experiences
- content_ideas
- posts
- research_runs
- llm_logs
- audit_logs

Acceptance Criteria:

- Tables created.
- Constraints exist.
- Status fields constrained.
- Indexes added.
- `client_id` exists on client-owned tables.
- Soft delete fields added where needed.

Test:

- Run migration.
- Confirm tables.
- Insert sample records.

Commit:

```text
chore: add initial database schema
```

---

## Feature 04 — RLS Policies

Goal:

Enable RLS and enforce client access.

Dependencies:

- Feature 03

Acceptance Criteria:

- RLS enabled.
- Read policies use `client_access`.
- `agency_admin`, `client_admin`, and limited `client_user` write policies exist.
- No viewer-level role exists.
- Restricted `client_user` actions are blocked server-side.
- Cross-client access blocked.

Test:

- Two users, two clients.
- Confirm isolation.
- Confirm `client_user` can contribute safe workflow content.
- Confirm `client_user` cannot manage Settings, users, RSS sources, Research Agent, post approvals, publishing state, logs, Agency-level pages, or other Client Workspaces.

Commit:

```text
feat: add Supabase RLS policies
```

---

## Feature 05 — Auth and Login

Goal:

Build login/logout with Supabase Auth.

Dependencies:

- Feature 02
- Feature 04

UI:

- `/login`

Acceptance Criteria:

- User can log in.
- User can log out.
- No signup UI.
- Protected pages redirect when logged out.
- Errors are safe.

Test:

- Valid login.
- Invalid login.
- Protected route while logged out.
- Logout.

Commit:

```text
feat: add authentication and route protection
```

---

## Feature 06 — Client Selector

Goal:

Show clients accessible to the authenticated user.

Dependencies:

- Feature 05

UI:

- `/clients`

Acceptance Criteria:

- User sees only accessible clients.
- Role badge appears.
- Selecting client opens dashboard.
- Empty state works.

Test:

- One user with multiple clients.
- Multiple users on one client.
- Cross-client visibility blocked.

Commit:

```text
feat: add client selector
```

---

## Feature 07 — Email Invitations

Goal:

Allow admins to invite users by email.

Dependencies:

- Feature 06

API:

- create invite
- accept invite
- revoke invite

Acceptance Criteria:

- `agency_admin` and scoped `client_admin` can invite.
- `client_user` cannot invite.
- Role is validated.
- Role validation allows only `client_admin` and `client_user`.
- Status tracked.
- Audit log written.
- Manual fallback works if email provider is not configured.

Test:

- Invite `client_admin`.
- Invite `client_user`.
- Accept invite.
- Try invite as `client_user`.

Commit:

```text
feat: add client invitations
```

---

## Feature 08 — App Shell Navigation

Goal:

Build sidebar/topbar navigation.

Dependencies:

- Feature 06

UI:

- dark sidebar
- client switcher
- user menu
- placeholder command palette
- placeholder global search

Acceptance Criteria:

- Sidebar labels: Dashboard, Research, Founder Experiences, Ideas, Posts, Publish, Settings.
- Active route state works.
- Logout available.
- Responsive layout works.

Test:

- Navigate all pages.
- Switch clients.
- Resize viewport.
- Logout.

Commit:

```text
feat: add app shell navigation
```

---

## Feature 09 — Dashboard

Goal:

Show high-level client status.

Dependencies:

- Feature 08

Metrics:

- settings completeness
- latest research run
- collected articles count
- TrendCards count
- ideas count
- posts needing review
- approved posts ready to publish

Acceptance Criteria:

- Metrics are client-scoped.
- Empty state works.
- `client_admin` and `client_user` can read assigned Client Workspace dashboard.
- No cross-client data.

Test:

- Seed records.
- Confirm counts.
- Test `client_user` assigned-workspace access.
- Test cross-client URL access is blocked.

Commit:

```text
feat: add client dashboard
```

---

## Feature 10 — Business Context Settings

Goal:

Build Settings page for always-on business context.

Dependencies:

- Feature 08

UI:

- `/client/[client_id]/settings`

Acceptance Criteria:

- All client context fields exist.
- `agency_admin` and `client_admin` can edit.
- `client_user` cannot edit Settings/business context.
- Zod validation.
- Audit log on update.
- Safe toasts.

Test:

- Save settings.
- Refresh.
- Test `client_admin`.
- Test `client_user` restriction.

Commit:

```text
feat: add business context settings
```

---

## Feature 11 — Founder Experiences

Goal:

Create/edit/delete Founder Experience records. (Note: Current deletion behavior is superseded by Feature 27 admin hard-delete).

Dependencies:

- Feature 10

UI:

- `/client/[client_id]/founder-experiences` — primary sidebar nav item, not a Setup tab/section.

Acceptance Criteria:

- `agency_admin`, `client_admin`, and `client_user` can create/edit safe Founder Experience records.
- Cross-client access is blocked.
- Deleted records hidden.
- Audit logs written.
- Empty state works.

Test:

- Create.
- Edit.
- Hard delete (superseded by Feature 27).
- Test `client_user`.
- Test cross-client access.

Commit:

```text
feat: add founder experiences
```

---

## Feature 12 — RSS Source Management

Goal:

Manage RSS sources on Research page. (Note: Current deletion behavior is superseded by Feature 27 admin hard-delete).

Dependencies:

- Feature 08

UI:

- `/client/[client_id]/research`

Acceptance Criteria:

- Add/edit/toggle/delete RSS source (superseded by Feature 27).
- Validate feed URL.
- Configure per-source recency window.
- Store feed errors safely.
- `agency_admin` and `client_admin` can manage RSS sources.
- `client_user` cannot manage RSS sources.
- Audit logs written.

Test:

- Add valid feed.
- Add invalid feed.
- Toggle active.
- Delete (superseded by Feature 27).
- Test `client_admin`.
- Test `client_user` restriction.

Commit:

```text
feat: add RSS source management
```

---

## Feature 13 — RSS Collector

Goal:

Collect and dedupe RSS articles.

Dependencies:

- Feature 12

Logic:

- parse active feeds
- apply each source's recency window
- normalize URLs
- hash content
- dedupe by `client_id + content_hash`
- store Collected Article rows

Acceptance Criteria:

- Active feeds collected.
- Duplicates skipped.
- Broken feeds handled safely.
- Items client-scoped.

Test:

- Run collector.
- Re-run and confirm dedupe.
- Test broken feed.

Commit:

```text
feat: add RSS collector
```

---

## Feature 14 — Railway Research Worker

Goal:

Create persistent Railway worker service.

Dependencies:

- Feature 13

Behavior:

- runs continuously
- uses `RSS_COLLECTOR_INTERVAL_HOURS`
- respects `RSS_COLLECTOR_ENABLED`
- collect-only by default
- supports `RESEARCH_PIPELINE_FULL`

Acceptance Criteria:

- `npm run worker` works.
- Interval configurable.
- Collect-only mode works.
- Research runs logged.
- Logs are safe.

Test:

- Run worker locally.
- Force interval.
- Check research_runs.

Commit:

```text
feat: add Railway research worker
```

---

## Feature 15 — Distributed Run Guard

Goal:

Prevent overlapping research runs.

Dependencies:

- Feature 14

Acceptance Criteria:

- Duplicate runs blocked.
- Manual and worker cannot overlap.
- Stale runs can be cleaned.
- Safe duplicate message shown.

Test:

- Trigger two runs.
- Confirm second blocked.
- Simulate stale run.

Commit:

```text
feat: add research run guard
```

---

## Feature 16 — Manual Run Research Agent

Goal:

Add user-triggered research pipeline.

Dependencies:

- Feature 13
- Feature 15

API:

```text
POST /api/client/[client_id]/run-research-agent
```

Acceptance Criteria:

- `agency_admin` and `client_admin` can run.
- `client_user` cannot run.
- Duplicate clicks blocked.
- Status shown.
- Safe errors.

Test:

- Run as `agency_admin`.
- Run as `client_admin`.
- Try as `client_user`.
- Double-click.

Commit:

```text
feat: add manual research runner
```

---

## Feature 17 — Research Agent Classification

Goal:

Classify collected articles using OpenRouter.

Dependencies:

- Feature 16

Output:

- status
- relevance_score
- classification_reason

Acceptance Criteria:

- Business context used.
- Articles classified.
- Safe LLM metadata logged.
- No raw prompts stored.
- OpenRouter failures handled.
- Research model route: `OPENROUTER_RESEARCH_MODEL` with fallback to `OPENROUTER_MODEL` (no hardcoded model IDs).
- Structured output and validation (Zod schema checking, surrounding markdown prose extraction).
- Failed classification items remain retryable.

Test:

- Run classification.
- Check statuses.
- Check llm_logs.
- Simulate failure.

Commit:

```text
feat: add research classification agent
```

---

## Feature 18 — TrendCard Synthesis

Goal:

Create evidence-backed TrendCards.

Dependencies:

- Feature 17

Output:

- title
- shift
- why_it_matters
- relevance_to_icp
- content_angle
- source_item_ids_json
- confidence_score
- week_of

Acceptance Criteria:

- No evidence = no TrendCard.
- Confidence score 1–10.
- Duplicates avoided.
- Source links resolve from cited `market_signal_items`.
- Founder POV is not generated by synthesis.
- TrendCards are grouped by week.
- Safe logs only.
- Grouping: evidence grouped into distinct shifts (not one card per article).
- Zero-card successful runs are valid.
- Only cited articles become `used`. Uncited relevant articles remain relevant and retryable.
- Failed runs leave relevant articles retryable.

Test:

- Run synthesis with relevant articles.
- Re-run and check dedupe.
- Try without evidence.

Commits:

```text
feat: add TrendCard synthesis
02f8ba2 fix: harden research structured outputs
0b3887f fix: align synthesis summary outcomes
```

---

## Feature 19 — Research Review UI

Goal:

Build review UI for collected articles and TrendCards. (Note: Current deletion behavior is superseded by Feature 27 admin hard-delete).

Dependencies:

- Feature 18

UI actions:

- mark relevant
- mark irrelevant
- add Trend Reaction (one per TrendCard)
- approve for ideas
- delete TrendCard (superseded by Feature 27)

Note: Founder Take input and read-only display were removed from this UI in Batch 4A. Existing stored `founder_take` values on TrendCards are untouched and still feed Ideas/Post generation.

Acceptance Criteria:

- Collected Articles list works.
- TrendCard cards/table works.
- Trend Reaction saves as a linked Founder Experience record; a second reaction attempt for the same TrendCard is rejected server-side.
- The React control hides once a reaction exists, showing "Reaction recorded." instead.
- Approve for Ideas works.
- Delete hard-deletes TrendCards that are not linked to reactions or ideas (superseded by Feature 27).
- Weekly grouping works.
- Source links render from cited collected articles.
- `client_user` can mark articles relevant/irrelevant and add one Trend Reaction per TrendCard.
- `client_user` cannot approve/delete TrendCards.
- Audit logs written.

Test:

- Mark article relevant.
- Add Trend Reaction.
- Confirm a second Trend Reaction attempt on the same TrendCard is rejected.
- Approve TrendCard.
- Delete unused TrendCard (superseded by Feature 27).
- Test `client_user` allowed contribution actions.
- Test `client_user` approval/delete restrictions.

Commit:

```text
feat: add research review UI
```

---

## Feature 20 — Planning Agent

Goal:

Generate Content Ideas from exactly three modes.

Dependencies:

- Feature 11
- Feature 19

Modes:

- founder_experience
- trend_card
- trend_reaction

Acceptance Criteria:

- Three modes only.
- Business context always passed.
- No `business_context_only`.
- Ideas store required fields.
- Safe LLM logs only.

Test:

- Generate from Founder Experience.
- Generate from TrendCard.
- Generate from Founder Take.
- Confirm unsupported modes do not exist.

Commit:

```text
feat: add planning agent idea generation
```

---

## Feature 21 — Ideas UI and Founder Direction

Goal:

Manage Content Ideas and add Founder Direction.

Dependencies:

- Feature 20

Acceptance Criteria:

- Idea cards/table display required fields.
- Founder Direction can be saved.
- `client_user` can save Founder Direction.
- Direction is passed to post generation.
- Audit logs written.

Test:

- Save founder direction.
- Refresh.
- Test `client_user`.

Commit:

```text
feat: add ideas management UI
```

---

## Feature 22 — Content Agent Post Generation

Goal:

Generate LinkedIn posts from one Content Idea.

Dependencies:

- Feature 21

Output:

- final_post
- buyer_belief_shift
- proof_notes
- risk_notes
- cta_intent
- source_context_used

Acceptance Criteria:

- Generates one post from one idea.
- No invented proof/metrics/stories/results.
- Uses banned topic rules.
- Starts in review status.
- Safe logs only.
- Model routing: `OPENROUTER_CONTENT_MODEL` falling back to `OPENROUTER_MODEL`.
- Private planning scaffolding hygiene: checks hook, body, CTA copy. Corrective retry if tags appear, then falls back to safe generic error.
- One active post per content idea: partial unique database index context. Existing post returned on racing requests. UI shows "Post Drafted" and disables generation once generated.

Test:

- Generate post.
- Inspect metadata.
- Check status.
- Simulate LLM failure.

Commits:

```text
feat: add content agent post generation
1b19415 fix: tighten post generation workflow
```

---

## Feature 23 — Post Review Workflow

Goal:

Review, edit, redraft, approve, or reject posts. (Note: Current deletion behavior is superseded by Feature 27).

Dependencies:

- Feature 22

Actions:

- needs edit
- redraft
- approve
- reject
- delete (superseded by Feature 27)

Acceptance Criteria:

- Review page shows post and metadata.
- Needs Edit stores edit_note.
- Redraft uses edit_note.
- Approve sets approved_at.
- Reject changes status.
- Delete (superseded by Feature 27).
- Audit logs written.

Test:

- Needs edit.
- Redraft.
- Approve.
- Reject another post.

Commit:

```text
feat: add post review workflow
```

---

## Feature 24 — Publish Queue

Goal:

Manual publishing workflow.

Dependencies:

- Feature 23

Actions:

- copy post text
- mark as published
- view published history

Acceptance Criteria:

- Approved posts appear in queue.
- Copy works.
- Mark published sets status and timestamp.
- Published history works.
- No LinkedIn API exists.

Test:

- Approve post.
- Copy text.
- Mark published.
- Confirm history.

Commit:

```text
feat: add manual publish queue
```

---

## Feature 25 — Audit Logs and Safe LLM Logs

Goal:

Complete operational logging.

Dependencies:

- Features 07–24

Acceptance Criteria:

- Audit logs record key actions.
- LLM logs store metadata only.
- No raw prompts stored.
- Logs are client-scoped.
- Operational logs are visible to `agency_admin` only unless explicitly widened.

Test:

- Invite user.
- Run research.
- Generate idea.
- Generate post.
- Approve post.
- Review logs.

Commit:

```text
feat: add audit and safe LLM logs
```

---

## Feature 26 — Hardening

Goal:

Prepare for private MVP launch.

Dependencies:

- All core features

Work:

- rate limiting
- security headers
- safer errors
- timeout/retry handling
- run guard cleanup
- production build checks
- Railway env review

Acceptance Criteria:

- No stack traces exposed.
- LLM routes rate limited.
- Worker failures safe.
- Stale research runs handled.
- Security checklist passes.
- Production build passes.

Test:

- Invalid RSS.
- OpenRouter failure.
- Unauthorized access.
- `client_user` restricted actions.
- Production build.

Commit:

```text
chore: harden private MVP
```

---

## Feature 27 — Administrator Hard Delete Controls

Goal:

Implement administrator hard-delete controls for six selected Client Workspace business records.

Dependencies:

- All core features

Scope:

- RSS Sources
- Collected Articles (`market_signal_items`)
- TrendCards
- Founder Experience entries / Reactions
- Content Ideas
- Posts

Permission Matrix:

- Allowed: `agency_admin` (for Client Workspaces belonging to their Agency), `client_admin` (for their Client Workspace).
- Blocked: `client_user`, unauthenticated users, users from another Client Workspace, and administrators from another Agency.

Dependency Rules:
- RSS Source: Allow hard deletion even when articles were collected.
- Collected Article: Block if cited by any active TrendCard.
- TrendCard: Block if referenced by active founder experiences or content ideas. On delete, restore uncited 'used' articles back to 'relevant' atomically.
- Founder Experience: Block if referenced by active content ideas.
- Content Idea: Block if referenced by active posts.
- Post: Allow deletion. If no active posts remain for the linked Content Idea, set its status back to 'ready'.

Acceptance Criteria:
- [x] Supabase migration with DELETE RLS policies applied.
- [x] Authenticated server Supabase client used for target DELETE.
- [x] HTTP DELETE routes implemented.
- [x] Safe audit events written.
- [x] Affected paths revalidated.
- [x] Direct deletes verify a returned row (zero-row delete returns error).
- [x] Raw RPC/database errors are mapped cleanly and not exposed.
- [x] Post audit correctly detects Idea ready state restoration.
- [x] TrendCard audit counts only actual used → relevant transitions.
- [x] Duplicate Collected Article delete route removed; canonical `/market-items/` remains.
- [x] Normal confirmation dialog for most records; typed "DELETE" confirmation for approved/published posts.
- [ ] Verified on staging/production (Pending manual verification)

Commits:

```text
c664be3 feat: add admin hard delete controls
0e438ce fix: harden admin delete outcomes
```

Migration:
- `supabase/migrations/20260713203949_add_admin_hard_delete_controls.sql`

---

# V2 Backlog — Deferred

Deferred items are out of scope for the current UI refresh and must not be implemented unless explicitly activated.

## V2.01 — Independent Research Stage Controls [Deferred]

Current MVP UI contains one primary "Run Research Agent" action executing the full Collect → Classify → Synthesize pipeline.
Advanced stage controls are deferred to V2:
- Collect RSS Only
- Classify New Articles
- Synthesize Relevant Articles
- Retry Classification
- Retry Synthesis

Rules:
- Full pipeline remains primary. Advanced controls remain collapsed.
- Allowed roles: `agency_admin` and `client_admin` only (client_user blocked).
- All actions share one client-scoped distributed run guard.
- Failed New/Relevant rows remain retryable.

Suggested Commit:
`feat: add independent research stage controls`

## V2.02 — Expanded Posts and Research Filters [Deferred]

Deferred advanced filtering options:
- Posts page: Refine/expand by status or useful date/source dimensions (should extend the current status tab filter, not create a parallel system).
- Research page: Filter by RSS source, article status, relevance score, collected/published date, research run, or TrendCard state.

Rules:
- Client-scoped.
- URL/search-param state preferred.
- Responsive at 375px and accessible.
- No Content Ideas filter is planned.

Suggested Commit:
`feat: expand posts and research filters`

---

## Feature 28 — UI Refresh [Next]

Goal:

Refresh the production interface without changing business behavior.

Scope rules:
- Refresh one screen or coherent component system at a time.
- Preserve APIs, database, roles, RLS, status transitions, and workflows.
- No fake/mock content; use real production data.
- Use current design tokens and component primitives; maintain WCAG AA contrast.
- Keep primary actions obvious, and advanced/debug controls secondary/collapsed.
- Destructive buttons must be visibly distinct and visible at 375px without hover.
- Filters listed in the V2 backlog are not included unless explicitly activated.
- Validate at desktop, tablet, and 375px mobile widths.

Suggested Commit:
`To be selected after screen prioritization`
