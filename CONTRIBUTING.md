# CONTRIBUTING.md — AIXelerate Content OS

## Development Workflow

Before making changes, read:

1. `AGENTS.md`
2. `security-access.md`
3. `design.md`
4. `feature-checklist.md`

Build one feature at a time.

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

Viewer is read-only.

Every mutation requires:

- authenticated user
- client access
- role check
- input validation
- client_id scoping
