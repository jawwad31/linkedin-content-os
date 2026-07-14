# CONTRIBUTING.md — AIXelerate Content OS

## Development Workflow

Before making changes, read:

1. `AGENTS.md`
2. `security-access.md`
3. `design.md`
4. `feature-checklist.md`

Build one feature at a time.

## Git Workflow

Work directly on `main` by default. Only use a separate branch if the user explicitly asks for one.

Before starting any change:

```bash
git checkout main
git pull origin main
git status
```

Rules:

- One feature or change per commit. Do not mix unrelated changes into one commit.
- Run `npm run lint` before every commit.
- Run `npm run build` before every commit.
- Do not commit if lint or build fails.
- Do not push to `main` until lint and build both pass.
- Every push to `main` is production-bound. If pushing triggers a Railway deploy, treat it as a production deploy.
- For risky work, create a local safety checkpoint (a git tag or branch) before editing, so there's a known-good state to return to.
- To roll back a bad change, prefer `git revert` of the specific commit over rewriting history.
- Do not open a pull request, wait for PR review, or merge a PR by default. That is not the default workflow. Only use a PR if the user explicitly asks for one.

## Database Migration Safety

- Review every migration carefully before pushing to `main`.
- Never make a destructive database change (drops, irreversible column removal, data deletion) without explicit user approval.

## Commit Style

Use clear commits:

```text
chore: scaffold Next.js app
feat: add authentication
feat: add RSS collector
chore: harden private MVP
```

## Coding Rules

- Use TypeScript.
- Use Next.js App Router.
- Use feature-first organization.
- Use Zod for validation.
- Use shadcn/ui for components.
- Use Supabase server-side checks.
- Scope all client data by `client_id`.
- Never expose service-role keys.
- Never expose OpenRouter keys.
- Never log raw prompts.
- Never invent new content generation modes.

## API Response Shape

Use:

```ts
{
  success: true,
  data,
  error: null
}
```

or:

```ts
{
  success: false,
  data: null,
  error: {
    code,
    message
  }
}
```

## Testing Expectations

For every feature:

- run local app
- test happy path
- test permission failure
- test empty/error state
- run production build

## Security Expectations

Security rules in `security-access.md` are mandatory.

Final roles are `agency_admin`, `client_admin`, and `client_user`.

There is no viewer-level product role. `client_user` can contribute to safe workflow content but cannot manage Settings, users, RSS sources, Research Agent, post approvals, publishing state, operational logs, Agency-level pages, or other Client Workspaces.

Every mutation requires:

- authenticated user
- client access
- role check
- input validation
- client_id scoping
