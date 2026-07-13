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
- Confirm `client_user` cannot manage Setup, users, RSS sources, Research Agent, post approvals, publishing state, logs, Agency-level pages, or other Client Workspaces.

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

- Sidebar labels: Dashboard, Setup, Research, Ideas, Posts, Publish.
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

- setup completeness
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

Build Setup page for always-on business context.

Dependencies:

- Feature 08

UI:

- `/client/[client_id]/settings`

Acceptance Criteria:

- All client context fields exist.
- `agency_admin` and `client_admin` can edit.
- `client_user` cannot edit Setup/business context.
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

Create/edit/soft-delete Founder Experience records.

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
- Soft delete.
- Test `client_user`.
- Test cross-client access.

Commit:

```text
feat: add founder experiences
```

---

## Feature 12 — RSS Source Management

Goal:

Manage RSS sources on Research page.

Dependencies:

- Feature 08

UI:

- `/client/[client_id]/research`

Acceptance Criteria:

- Add/edit/toggle/soft-delete RSS source.
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
- Delete.
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

Test:

- Run synthesis with relevant articles.
- Re-run and check dedupe.
- Try without evidence.

Commit:

```text
feat: add TrendCard synthesis
```

---

## Feature 19 — Research Review UI

Goal:

Build review UI for collected articles and TrendCards.

Dependencies:

- Feature 18

UI actions:

- mark relevant
- mark irrelevant
- add founder_take
- add Trend Reaction
- approve for ideas
- archive TrendCard

Acceptance Criteria:

- Collected Articles table works.
- TrendCard cards/table works.
- Founder Take saves.
- Trend Reactions save as linked Founder Experience records.
- Approve for Ideas works.
- Archive soft-deletes TrendCards that are not linked to reactions or ideas.
- Weekly grouping works.
- Source links render from cited collected articles.
- `client_user` can mark articles relevant/irrelevant and add Founder Take / Trend Reaction.
- `client_user` cannot approve/archive TrendCards.
- Audit logs written.

Test:

- Mark article relevant.
- Add founder take.
- Add Trend Reaction.
- Approve TrendCard.
- Archive unused TrendCard.
- Test `client_user` allowed contribution actions.
- Test `client_user` approval/archive restrictions.

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

Test:

- Generate post.
- Inspect metadata.
- Check status.
- Simulate LLM failure.

Commit:

```text
feat: add content agent post generation
```

---

## Feature 23 — Post Review Workflow

Goal:

Review, edit, redraft, approve, or reject posts.

Dependencies:

- Feature 22

Actions:

- needs edit
- redraft
- approve
- reject

Acceptance Criteria:

- Review page shows post and metadata.
- Needs Edit stores edit_note.
- Redraft uses edit_note.
- Approve sets approved_at.
- Reject changes status.
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

Scope:

- RSS Sources
- Collected Articles (`market_signal_items`)
- TrendCards
- Founder Experience entries
- Content Ideas
- Posts

Permission Matrix:

- Allowed: `agency_admin` (for Client Workspaces belonging to their Agency), `client_admin` (for their Client Workspace).
- Blocked: `client_user`, unauthenticated users, users from another Client Workspace, administrators from another Agency.

Dependency Rules:

- RSS Source: Allow hard deletion even when articles were collected.
- Collected Article: Block if cited by any active TrendCard.
- TrendCard: Block if referenced by active founder experiences or content ideas. On delete, restore uncited 'used' articles back to 'relevant' atomically.
- Founder Experience: Block if referenced by active content ideas.
- Content Idea: Block if referenced by active posts.
- Post: Allow deletion. If no active posts remain for the linked Content Idea, set its status back to 'ready'.

Acceptance Criteria:

- Supabase migration with DELETE RLS policies applied.
- Authenticated server Supabase client used for target DELETE.
- HTTP DELETE routes implemented.
- Safe audit events written.
- Affected paths revalidated.
- Normal confirmation dialog for most records; typed "DELETE" confirmation for approved/published posts.
- No user-facing Archive action remains.

Test Matrix:

- Verify `client_user` is denied.
- Verify cross-client and cross-Agency deletions are denied.
- Verify dependency checks block deletion with 409 status.
- Verify correct articles and ideas status restoration on delete.
- Verify typed confirmation requirement for approved/published posts.

Suggested Commit:

```text
feat: add admin hard delete controls
```
