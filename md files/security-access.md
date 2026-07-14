# security-access.md — AIXelerate Content OS

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

- expose raw LLM prompts
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
- invited users only
- agency admins and client admins invite collaborators by email, subject to client scope

Session:

- use Supabase SSR/session helpers
- protect routes using middleware and server-side checks
- redirect unauthenticated users to `/login`

---

## Roles

### agency_admin

Can:

- access all Client Workspaces under the Agency
- edit client settings
- invite users
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

### client_admin

Can:
- access only assigned Client Workspaces
- edit client settings
- invite users for assigned Client Workspaces
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

### client_user

Can:
- access only assigned Client Workspaces
- create/edit safe workflow content records
- mark articles relevant/irrelevant
- add a Trend Reaction (one per TrendCard)
- generate Ideas
- add Founder Direction
- generate Posts
- copy approved posts

Cannot:
- edit Settings/business context
- manage users
- manage RSS sources
- run Research Agent
- approve/reject/delete posts
- mark posts published
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
/client/[client_id]/founder-experiences
/client/[client_id]/ideas
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
- **Agency Admins**: Receive implicit Client Workspace access through their `agency_members` record linked to `clients.agency_id`. They do not require a direct `client_access` row.
- **Client Admins and Client Users**: Receive scoped access to specific client workspaces through a matching `client_access` row where `invitation_status = 'accepted'`.

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

Client contributor write pattern:

```sql
exists (
  select 1
  from public.client_access ca
  where ca.client_id = <table>.client_id
  and ca.user_id = auth.uid()
  and ca.role in ('client_admin', 'client_user')
  and ca.invitation_status = 'accepted'
)
```

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

- can write only safe workflow content records
- cannot manage Settings, users, RSS sources, Research Agent, post approvals, publishing state, operational logs, Agency-level pages, or other Client Workspaces

TrendCard writes:

- `trend_cards` read access follows accepted client access.
- `trend_cards` create/update/delete actions run through trusted server-side code and route handlers.
- `agency_admin` and `client_admin` permissions are checked server-side before approve/delete mutations.
- `client_user` may add a Trend Reaction (one per TrendCard, enforced server-side) but cannot approve or delete TrendCards.
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
- never generate ideas/posts/publishing actions automatically

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

- use OpenRouter server-side only
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
- do not use comment bait
- do not use generic P.S. engagement bait
- write for the ICP

---

## Invitations

Agency admins and client admins can invite users by email, subject to client scope.

Invitation flow:

1. Admin enters email and role.
2. App creates pending access/invitation record.
3. Email invitation is sent.
4. User accepts.
5. Invitation status becomes `accepted`.

v1 fallback:

- If email delivery is not ready, create the invitation record and manually notify the user.
- Still preserve the invitation model.

Rules:

- only `agency_admin` or scoped `client_admin` can invite/revoke
- invited `client_access.role` must be `client_admin` or `client_user`
- user cannot self-assign access

---

## Audit Logs

Record lightweight audit logs for:

- user invited
- user role changed
- access revoked
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
- `agency_admin`, when the Client Workspace belongs to that administrator's Agency.
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
- prompt text
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
