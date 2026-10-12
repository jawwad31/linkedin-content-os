# security-access.md — AIXelerate Content OS

Updated 2026-10-06. Existing security rules are retained from the live repository. The final section defines security requirements for planned features; it does not claim they are implemented.

## Purpose

This file defines authentication, authorization, RLS, secrets, worker safety, audit logging, delete behavior, and error-handling rules.

Security rules override convenience.

---

## Security Principle

Every client-owned record must be protected by:

1. Supabase Auth
2. `client_access`
3. role permissions
4. Supabase Row-Level Security
5. server-side validation

No route should:

- expose assembled internal LLM prompts
- expose stack traces
- expose API keys
- allow cross-client access
- perform destructive actions via GET
- trust client-provided ownership data

---

## Authentication

Provider:

- Supabase Auth

Method:

- Email + password

v1 signup model:

- no public signup
- administrator-created users only
- no invitation email, password-reset email, SMTP dependency, or pending acceptance step
- administrators enter the email and a temporary password in the authenticated UI
- newly created or reset users must replace the temporary password at next sign-in

Session:

- use Supabase SSR/session helpers
- protect routes using middleware and server-side checks
- redirect unauthenticated users to `/login`
- enforce `must_change_password` in both the proxy and the shared server-user
  helper so protected Server Actions cannot bypass the first-login gate

---

## Roles

> **The agency level is retired (2026-10-12).** One account is one company with a team of Account Admins and Account Users. The application no longer reads `agency_members` or grants anything because of it; the sections below that mention Agency Admin describe the old model and the database records that still exist, unused. Migration `20261012230000_account_admins_replace_agency.sql` gave former Agency Admins an ordinary `client_admin` row in each company. Dropping the agency tables is a separate, destructive step that has not been taken. Account Admins now also read their own company's operational logs. See `docs/company-accounts.md`.

### agency_admin (Agency Admin) - retired

Can:

- access all Client Workspaces under the Agency
- edit client settings
- create Agency Admins, Account Admins, and Account Users
- set temporary passwords for users in the Agency
- revoke users
- manage roles
- create/edit/delete business records
- manage RSS sources
- run Research Agent
- generate ideas
- generate posts
- approve/reject posts
- mark posts as published
- view operational logs

### client_admin (Account Admin)

Can:
- access only assigned Client Workspaces
- edit client settings
- create Account Admins and Account Users for assigned Accounts
- set temporary passwords only for users whose accepted access is exclusive to that Account
- revoke users for assigned Client Workspaces
- manage RSS sources
- run Research Agent
- generate ideas
- generate posts
- approve/reject posts
- mark posts as published
- hard-delete business records (RSS sources, collected articles, TrendCards, founder experiences, content ideas, posts) for assigned Client Workspaces

Cannot:
- access Agency-level pages
- access other Client Workspaces
- view agency-admin-only operational logs

### client_user (Account User)

Can:
- access only assigned Client Workspaces
- use only the workflow capabilities selected on its Account membership:
  `research_contribute`, `founder_experience_manage`, `ideas_manage`,
  `posts_draft`, `posts_review`, and `posts_publish`
- copy approved posts

Cannot:
- edit Settings/business context
- manage users
- manage RSS sources
- run Research Agent
- use any unselected workflow capability
- hard-delete business records
- view operational logs
- access Agency-level pages
- access other Client Workspaces
- delete RSS sources, collected articles, TrendCards, founder experiences, content ideas, or posts

There is no viewer-level product role. Legacy `owner`, `editor`, and `viewer` `client_access` rows were migrated to `client_admin` or `client_user` before real external client onboarding.

---

## Protected Routes

Public:

```text
/login
```

Protected:

```text
/clients
/client/[client_id]/dashboard
/client/[client_id]/research
/client/[client_id]/calendar
/client/[client_id]/founder-experiences
/client/[client_id]/resources
/client/[client_id]/ideas
/client/[client_id]/posts
/client/[client_id]/publish
/client/[client_id]/settings
/client/[client_id]/posts/[post_id]/review
```

Unauthorized behavior:

- unauthenticated user → redirect to `/login`
- authenticated without client access → 403 page
- insufficient role → safe permission error

---

## Client Access Model

Access to Client Workspace records is scoped and isolated:
- **Agency Admins (retired)**: used to receive implicit access through `agency_members` linked to `clients.agency_id`. The application no longer honours this; a former Agency Admin now needs a direct `client_access` row (the migration above created them). The database helpers still accept `agency_members` rows, which stay dormant.
- **Account Admins and Account Users**: Receive scoped access to specific Accounts through a matching `client_access` row where `invitation_status = 'accepted'`. The database role IDs remain `client_admin` and `client_user` for compatibility.

Every client-owned table must include:

```text
client_id
```

Every query must verify client scope and Agency isolation.
Never query by record ID alone.
Always include `client_id` in mutations.

---

## Supabase RLS Strategy

Enable RLS on:

- `profiles`
- `agencies`
- `agency_members`
- `clients`
- `client_access`
- `rss_sources`
- `market_signal_items`
- `trend_cards`
- `founder_experiences`
- `content_resources`
- `calendar_defaults`
- `content_calendars`
- `calendar_slots`
- `content_ideas`
- `posts`
- `research_runs`
- `llm_logs`
- `audit_logs`

Read policy pattern:

```sql
exists (
  select 1
  from public.client_access ca
  where ca.client_id = <table>.client_id
  and ca.user_id = auth.uid()
  and ca.invitation_status = 'accepted'
)
```

Account User permission write pattern:

```sql
public.has_client_access(<table>.client_id, array['agency_admin', 'client_admin'])
or private.has_client_permission(<table>.client_id, '<required_permission>')
```

The required permission is selected by operation: `research_contribute`,
`founder_experience_manage`, `ideas_manage`, `posts_draft`, `posts_review`, or
`posts_publish`. A Trend Reaction uses `research_contribute`; a founder work-log
entry uses `founder_experience_manage`.

Client admin pattern:

```sql
exists (
  select 1
  from public.client_access ca
  where ca.client_id = <table>.client_id
  and ca.user_id = auth.uid()
  and ca.role = 'client_admin'
  and ca.invitation_status = 'accepted'
)
```

Agency admin pattern:

```sql
exists (
  select 1
  from public.agency_members am
  join public.clients c on c.agency_id = am.agency_id
  where c.id = <table>.client_id
  and am.user_id = auth.uid()
  and am.role = 'agency_admin'
)
```

Restricted `client_user` actions:

- can write only records covered by an explicitly selected permission
- cannot manage Settings, users, RSS sources, Research Agent, hard deletes, operational logs, Agency-level pages, or other Accounts
- `private.has_client_permission(client_id, permission)` is the RLS helper; application services perform the same explicit permission check before mutation

Content Resource policies:

- all accepted workspace roles may read active, non-deleted resources
- only `agency_admin` and `client_admin` may create, edit, approve, deactivate,
  or archive resources
- resource rows are always scoped by `client_id`
- selected resources use a composite client/resource foreign key so an Idea
  cannot reference another Client Workspace's resource
- `client_user` may select an already approved resource through the safe
  idea-level override endpoint, but cannot manage the resource itself

TrendCard writes:

- `trend_cards` read access follows accepted client access.
- `trend_cards` create/update/delete actions run through trusted server-side code and route handlers.
- `agency_admin` and `client_admin` permissions are checked server-side before approve/delete mutations.
- an Account User with `research_contribute` may add a Trend Reaction (one per TrendCard, enforced server-side) but cannot approve or delete TrendCards.
- Founder Take is no longer an editable UI control for any role; existing stored values are untouched and still feed Ideas/Post generation.

---

## API Security Rules

Every API route must:

1. get authenticated user server-side
2. validate input with Zod
3. verify client access
4. verify role
5. scope query by `client_id`
6. verify object ownership before mutation
7. write audit log for important actions
8. return safe errors
9. never expose raw stack traces

Never trust:

- role from request body
- client_id without checking access
- user_id from client payload
- object ID without client_id scoping

---

## Secrets

Never expose to browser:

```env
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
WORKER_SECRET
```

Frontend-safe:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
```

Rules:

- service role key can only be used server-side
- OpenRouter key can only be used server-side or in worker
- never commit `.env.local`
- never log environment variables

---

## Railway Security

Railway services:

- `nextjs-web-app`
- `research-worker`

Rules:

- store secrets in Railway environment variables
- worker uses `WORKER_SECRET` if calling protected app endpoints
- manual research endpoint requires authenticated `agency_admin` or `client_admin`
- background worker should not expose public endpoints unless protected
- logs must never contain:
  - API keys
  - raw prompts
  - sensitive client context
  - Supabase service role key

---

## Worker Security

The worker can perform privileged server-side operations, but must:

- use least privilege where possible
- only process active clients
- respect `RSS_COLLECTOR_ENABLED`
- respect `RESEARCH_PIPELINE_FULL`
- use run guard
- write safe research logs
- avoid raw prompt logs
- research schedules never initiate Ideas, post drafts, or publication actions; separately authorized user-triggered batch jobs may execute already requested draft assignments under P06

---

## Run Guard

All research runs must acquire a lock before processing.

Protect against:

- double-clicks
- overlapping worker intervals
- manual and scheduled collision
- multiple worker replicas
- stale unfinished runs

Recommended implementation:

- create `research_runs` row with status `running`
- check for existing active run for same `client_id`
- optionally use Postgres advisory lock
- mark stale runs failed/cancelled after timeout

User-facing duplicate message:

```text
Research is already running for this client. Please wait for it to finish.
```

---

## LLM Safety

LLM routes must:

- use configured AI provider adapters server-side only; keep existing OpenRouter behavior until the assigned provider phase is implemented
- apply timeouts
- handle retries safely
- return safe errors
- log metadata only
- never log raw prompts with sensitive client context

LLM logs may include:

- provider
- model
- feature
- status
- input token count
- output token count
- estimated cost
- error type

LLM logs must not include:

- raw prompt
- business context
- founder voice sample
- approved proof
- reference material
- API keys

Content safety rules:

- do not invent proof
- do not invent metrics
- do not invent founder stories
- do not invent client results
- do not use banned topics
- do not use generic comment bait
- controlled comment gating requires one selected active approved Content
  Resource, its saved keyword, and no automatic-delivery promise
- at most one gated idea may be generated in a batch, and gating is unavailable
  when any of the five most recent active, non-rejected posts already used it
- do not use generic P.S. engagement bait
- write for the selected approved reader; the reader may be broader than the business buyer ICP

---

## Manual User Provisioning

There is no active invitation workflow in v1.

1. An administrator enters email, optional name, role/scope, permissions when
   applicable, and a temporary password for a new login.
2. Trusted server code creates the Supabase Auth user with confirmed email or
   reuses an existing Auth user with the same normalized email.
3. The `agency_members` or `client_access` row is stored immediately as
   `accepted`; no email is sent.
4. New and password-reset users have `profiles.must_change_password = true`
   and are limited to `/change-password` until they replace it.

Rules:

- (Retired) Agency Admins managed Agency and Account membership. There is no screen or action for this any more.
- Account Admins can manage only Account Admin and Account User membership in their assigned Account.
- Account Users cannot manage users or self-assign access.
- Existing pending rows are revoked by the migration; pending email-claim RLS policies and invitation API routes are removed.
- Temporary passwords and emails are never written to audit metadata or LLM logs.

---

## Audit Logs

Record lightweight audit logs for:

- user created without email delivery
- Agency or Account access added
- user role changed
- Account User permissions changed
- access revoked
- password reset or changed (never the password value)
- client settings updated
- founder experience created/edited/deleted
- RSS source created/edited/deleted
- research run started/completed/failed
- article marked relevant/irrelevant
- trend_card_created
- trend_card_approved_for_ideas
- trend_card_hard_deleted
- trend_card_reaction_added
- founder_take_added / founder_take_updated
- idea generated
- founder direction updated
- post generated
- post marked needs edit
- post redrafted
- post approved
- post rejected
- post marked published
- calendar month settings saved / reset to defaults (`calendar_month_settings_saved`, `calendar_month_reset_to_defaults`)
- calendar defaults saved (`calendar_defaults_saved`)
- calendar plan committed or replanned (`calendar_plan_committed`)
- calendar slots cancelled (`calendar_slots_cancelled`)

Audit log fields:

- `client_id`
- `user_id`
- `action`
- `entity_type`
- `entity_id`
- `metadata`
- `created_at`

Audit logs must not include:

- raw prompts
- secrets
- full sensitive business context
- OpenRouter request payloads

---

## Delete Policy

Soft delete business records by default (e.g., `clients` or other non-admin managed entities) where deletion is not exposed or is handled via workflow status updates:

```text
set deleted_at = now()
```

Do not display soft-deleted records in normal UI.

Hard delete (using SQL DELETE) is allowed and implemented for these six specific entity types:
- RSS Sources (`rss_sources`)
- Collected Articles (`market_signal_items`)
- TrendCards (`trend_cards`)
- Founder Experience entries (`founder_experiences`)
- Content Ideas (`content_ideas`)
- Posts (`posts`)

Allowed roles:
- (Retired) `agency_admin`: the application no longer grants this.
- `client_admin`, for that exact Client Workspace.
- Blocked: `client_user`, unauthenticated users, users from another Client Workspace, and administrators from another Agency.

Delete Safety & Verifications:
- Every direct SQL DELETE operation must:
  1. Scope by both entity ID and `client_id`.
  2. Require `deleted_at IS NULL` where applicable.
  3. Append `.select("id")` and `.maybeSingle<{ id: string }>()` to retrieve the deleted ID.
  4. Verify that exactly one row was returned.
  5. Only write a success audit log event after the deletion is confirmed.
- Every delete route/service must use the authenticated session-bound Supabase client so that the custom DELETE RLS policies remain active (no service-role delete bypass).
- Downstream dependencies must block deletion, returning `DEPENDENCY_CONFLICT` (HTTP 409) with a safe error message.
- Raw PostgreSQL database errors and RPC messages are caught and mapped using safe error codes (`rpcError.code === '23503'` -> `DEPENDENCY_CONFLICT`, `rpcError.code === 'P0002'` -> `NOT_FOUND`, other -> `UNKNOWN_ERROR`), preventing raw database leak to the browser.
- The canonical Collected Article delete route is under `/api/client/[client_id]/market-items/[item_id]`; the duplicate `/api/client/[client_id]/collected-articles/[article_id]` route was removed.
- The UI supports admin-only bulk deletion for visible Collected Articles, TrendCards, Content Ideas, and Posts through one authenticated `POST /api/client/[client_id]/batch-delete` request. The contract uses a strict entity allowlist, valid UUIDs, exact `DELETE` confirmation, and a maximum of 100 unique records.
- The batch route performs bounded server-side concurrency and delegates every record to its existing delete service. It does not use the service role or raw unscoped deletes, so per-record client filters, dependency checks, returned-row verification, RLS, safe error mapping, audit logging, and path revalidation remain active.
- Every bulk operation requires exact typed confirmation (`DELETE`). Eligible records may succeed independently, while dependency-blocked or failed records remain selected and are reported to the administrator.

Atomic State Cleanup (using SQL RPC functions):
- **TrendCard Delete**: Performs dependency checks, deletes the TrendCard, and restores uncited relevant articles (which went from `used` back to `relevant`) atomically.
- **Post Delete**: Deletes the Post, and restores the linked Idea status back to `ready` if no other active posts remain for that idea.
- These database functions run under `SECURITY INVOKER` with a fixed `search_path` and preserve RLS. They perform workflow state cleanups rather than record restorations (deleted records are permanently gone).

Content Idea & Published Post Rules:
- A Content Idea cannot be deleted if any active Post references it (applies to review, needs_edit, approved, rejected, or published Posts). The Post must be deleted first. Deleting a content idea never automatically deletes its post.
- Approved and published Posts require exact typed confirmation: "DELETE" both on the client and server side.
- Deleting an internal published Post record in Content OS does not remove the actual post from LinkedIn (no LinkedIn API integration).

Audit Logs for Hard Deletes:
The following audit actions are recorded:
- `rss_source_hard_deleted`
- `article_hard_deleted`
- `trend_card_hard_deleted` (metadata tracks `number_of_articles_restored` transition count)
- `founder_experience_hard_deleted`
- `content_idea_hard_deleted`
- `post_hard_deleted` (metadata tracks `linked_idea_restored_to_ready` restoration status)

Audit metadata rules:
- May store metadata such as status indicators, transition counts, or linked IDs.
- Must not store the post body, complete article summary, founder experience text, raw prompt, raw LLM response, or raw database error.

---

## Error Handling

Use safe user-facing error messages.

Examples:

Authentication:

```text
The email or password is incorrect.
```

No client access:

```text
You do not have access to this client.
```

Restricted client user trying to edit:

```text
You do not have permission to perform this action.
```

Research duplicate:

```text
Research is already running for this client.
```

OpenRouter timeout:

```text
The AI provider took too long to respond. Please try again.
```

RSS failure:

```text
We could not read this feed. Check the URL or try again later.
```

Never show:

- stack traces
- SQL errors
- raw LLM errors
- internal assembled prompt text
- environment variables

---

## Rate Limiting

Rate limit LLM-triggering actions:

- Run Research Agent
- Generate Ideas
- Generate Post
- Redraft Post

Suggested v1 limits:

- per user
- per client
- per action
- cooldown for repeated clicks

Also use button disabled states to prevent double-submit.

---

## Security Headers

Add production security headers:

- Content-Security-Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

Use secure cookie/session defaults through Supabase SSR helpers.

---

## Pre-Launch Security Checklist

- [ ] RLS enabled on all protected tables.
- [ ] No viewer-level role exists in schemas, UI, API validation, RLS helpers, or tests.
- [ ] `client_user` contributor limits are enforced server-side.
- [ ] Cross-client access tested.
- [ ] No service role key in browser bundle.
- [ ] No OpenRouter key in browser bundle.
- [ ] `.env.local` ignored by Git.
- [ ] No raw prompts in logs.
- [ ] All mutation routes validate input.
- [ ] Destructive actions do not use GET.
- [ ] LLM routes are rate limited.
- [ ] Worker uses run guard.
- [ ] Worker logs are safe.
- [ ] Stale research runs are handled.
- [ ] Audit logs are written for key actions.
- [ ] Soft delete works by default for non-admin entity updates.
- [ ] Six hard-delete entity policies verified (RSS Sources, Collected Articles, TrendCards, Founder Experiences, Content Ideas, Posts).
- [ ] client_user delete denial verified.
- [ ] Cross-client delete denial verified.
- [ ] Cross-Agency delete denial verified.
- [ ] Dependency conflicts return 409.
- [ ] Direct deletes confirm one deleted row was returned.
- [ ] Raw database/RPC errors are not exposed.
- [ ] Approved/published Posts require typed DELETE.
- [ ] Post-to-Idea state cleanup verified.
- [ ] TrendCard-to-Article state cleanup verified.
- [ ] No silent cascade deletion exists.
- [ ] Production Railway env vars are configured.



## Planned feature security requirements — 2026-10-06

These extend the existing policies; they do not replace manual provisioning, capability controls, or the six-entity hard-delete policy above. Use current shared access helpers rather than duplicating authorization.

### Proposed mapping of new operations to existing capabilities

| Operation | Authorization |
|---|---|
| Edit business/personal profiles, supporting profile documents, account calendar defaults | Scoped Agency/Account Admin only |
| Create/edit experience-style Content Bank entries and their private attachments | Existing founder_experience_manage capability or scoped admin |
| Add a reaction tied to research | Existing research_contribute capability or scoped admin |
| Manage lead magnets, delivery details, public-download eligibility, resource approval | Scoped admin only; preserve existing resource restrictions |
| Select already approved sources; edit monthly draft plan and reservations | Existing ideas_manage capability or scoped admin |
| Generate a post from a new assignment | Both assignment/ideas permission and posts_draft; do not treat one as the other |
| Edit/draft newsletter text | posts_draft; source selection requires ideas_manage where it creates an assignment |
| Approve/reject posts or newsletter editions | posts_review capability or scoped admin |
| Mark manually published | posts_publish capability or scoped admin; exact approved version required |
| Edit/run/pause research configuration, manage monitored URLs | Scoped admin only |
| View saved research prompt | Scoped admin by default; derived findings follow existing workspace read access |

This mapping is an implementation recommendation consistent with the existing capability model. P00 must confirm exact service/RLS correspondence before enabling routes. Never restore blanket client_user approval/publication denial from the outdated attachments, and never grant those permissions to all Account Users. New capabilities, if essential, require an explicit recorded decision rather than silent expansion.

### Files, retrieval, and external sources

- Protect original objects, metadata, document versions, provider IDs, and returned excerpts by client_id and current access. Use a private bucket and authorized short-lived download links.
- Backend code derives account-owned object paths and vector-store/file IDs. Do not accept arbitrary provider IDs, URLs, or another account's document ID as authority.
- For hosted retrieval, use an account-isolated store (recommended initial design), and intersect returned files with the current authorized document/version list. Application RLS does not automatically protect external vector storage.
- Archive/replacement excludes the old version from retrieval immediately at the application boundary; asynchronously remove old provider indexes with idempotent cleanup. Do not rely on instantaneous provider deletion.
- Validate actual file type, UTF-8 decoding, size, and processing limits. Sanitize preview HTML/Markdown; disable active scripts. Keep code fences as text. Index only successful, permitted versions.
- Treat uploads, articles, web results, and imported examples as untrusted data. They cannot override system instructions, grant permissions, select another account, authorize publication, or reveal secrets.
- Separate private evidence from reader downloads. Linking a private file to a post never makes it public. An explicit admin-approved delivery URL/method is required for an offer; do not implement public sharing merely to satisfy a CTA.
- URL import/monitoring must reject private, loopback, link-local, metadata-service, and unsupported-scheme targets, recheck DNS/redirect destinations, and bound response size, redirects, content type, and time. Do not fetch authenticated pages with app/service credentials.

### Prompt storage and logs

The user's saved research prompt is intentional, authorized application content in a protected configuration/version record. Admins may edit it on the frontend. This is distinct from assembled internal prompts, which remain hidden and must never appear in ordinary logs.

Store only safe metadata in LLM/audit logs: IDs, versions, statuses, timing, token/cost figures, field names/counts, error categories. Do not put raw excerpts, research prompts, draft copy, credentials, or personal examples in logs. Evidence manifests in protected content records may record references and hashes without duplicating full prompts.

### Jobs, approvals, and migration integrity

- Research and user-requested draft batches use durable, account-scoped job identity and idempotency. Recheck authorization/cancellation before sensitive commits; background work does not gain unlimited scope from a service-role client.
- A worker lease must be acquired atomically and renewed/recovered safely. A check-then-insert race is not a distributed lock.
- Reservations and successful source-use commits are transactional. A failed draft must not consume an entry. Retries cannot duplicate posts, charges intentionally initiated by the app, or use rows.
- Approval checks compare current output version and approved version server-side. A stale browser cannot approve/publish a later revision accidentally.
- New tables need RLS, deliberate grants, restrictive write policies, correct composite account/record references, and tests for cross-account IDs. A view must not accidentally bypass RLS. Prefer SECURITY INVOKER for RPCs.
- Add calendar, newsletter, file, and usage dependencies to existing deletion checks before enabling their workflows. Never use CASCADE to erase downstream content. Keep a minimal non-content published-use tombstone when permitted deletion removes a post, so deletion cannot reset reuse history.
- New entity types default to archive/soft deletion. Do not widen the six existing admin hard-delete entity types as part of renaming Resources or Founder Experiences.
- New migrations/backfills are additive and rerunnable. Never execute destructive production changes without explicit user authorization. Preserve backup and rollback plans.

### Required new security checks

- [ ] Two accounts and two agencies cannot read each other's document content, search excerpts, sources, calendar jobs, or newsletter records.
- [ ] Revoked/unselected capabilities fail on direct API, Server Action, RLS, and background paths.
- [ ] Private evidence cannot become a public reader download through generation.
- [ ] Source text cannot instruct the AI/application to change access or disclose secrets.
- [ ] Concurrent selection cannot reserve a single-use entry twice.
- [ ] Approval invalidates after edit; stale versions cannot be published.
- [ ] URL import rejects internal/private redirects and oversized responses.
- [ ] Research settings are visible to authorized editors while internal prompts/logs remain private.
