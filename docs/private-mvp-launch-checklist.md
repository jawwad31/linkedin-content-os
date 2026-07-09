# Private MVP Launch Checklist

Use this before launching or redeploying the private MVP.

## Supabase

- Confirm all migrations are applied in production, including operational log/RLS migrations.
- Verify RLS for owner, editor, viewer, unauthenticated, and cross-client access.
- Confirm `audit_logs` and `llm_logs` are owner-only in the UI and through direct API access.
- Confirm new Supabase tables are intentionally exposed or not exposed to the Data API as needed.

## Railway Web Service

- Set `NEXT_PUBLIC_SUPABASE_URL`.
- Set `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Set `NEXT_PUBLIC_APP_URL`.
- Set `SUPABASE_SERVICE_ROLE_KEY`.
- Set `OPENROUTER_API_KEY`.
- Set `OPENROUTER_MODEL`.
- Start command should run the built Next.js app.
- Confirm security headers are present on a deployed page.
- Confirm LLM routes return safe 429 copy after rate-limit threshold.

## Railway Worker Service

- Set `NEXT_PUBLIC_SUPABASE_URL`.
- Set `SUPABASE_SERVICE_ROLE_KEY`.
- Set `RSS_COLLECTOR_ENABLED`.
- Set `RSS_COLLECTOR_INTERVAL_HOURS`.
- Set `RSS_COLLECTOR_RUN_ON_START`.
- Set `RSS_COLLECTOR_BATCH_DELAY_MS`.
- Set `RESEARCH_PIPELINE_FULL`.
- Start command: `npm run worker`.
- Decide `RESEARCH_PIPELINE_FULL=false` for collect-only or `true` for collect, classify, and TrendCard synthesis.
- Confirm one bad feed or one locked client does not stop the whole worker cycle.

## Smoke Tests

- Owner can complete: setup, RSS source, manual research, TrendCards, Content Ideas, post generation, review, approve, copy, mark published.
- Editor can complete allowed content workflow and cannot manage owner-only logs.
- Viewer is read-only and cannot run mutations.
- Unauthenticated API routes return safe 401 responses or redirect through page protection.
- Cross-client mutation attempts are blocked.
- Manual duplicate research run is blocked by the run guard.
- Stale research runs are failed after the configured threshold.
- `llm_logs` contain metadata only; no raw prompts or provider responses.
- API/UI responses do not show stack traces, raw SQL, raw OpenRouter text, or secrets.

## Explicit Non-Launch Items

- No LinkedIn API.
- No LinkedIn OAuth.
- No public signup.
- No post scheduling.
- No visual or image generation.
- No payments.

## Security Notes

- Baseline headers are configured globally: frame deny, nosniff, strict-origin referrer policy, and camera/microphone/geolocation denied.
- CSP is intentionally deferred for this hardening pass because Supabase Auth, Next assets, fonts, and inline style/script behavior need a dedicated browser verification pass before enforcing.
- Current rate limiting is in-memory, per web process, not distributed, and resets on restart/deploy. This is acceptable only for a single-instance private MVP.

## Rollback

- Take or confirm a recent Supabase backup before production migrations.
- Prefer `git revert <commit>` for application rollback.
- Use Railway deployment rollback if a bad deploy needs immediate service recovery.
- If a migration is involved, prepare an explicit down/forward-fix plan before deploy.
