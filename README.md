# AIXelerate Content OS

AIXelerate Content OS is an ICP-first LinkedIn content operating system for B2B operators, founders, consultants, and client-facing experts.

It helps turn business context, founder experience, RSS research, TrendCards, and founder takes into buyer-relevant LinkedIn content.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Auth
- Supabase Postgres + RLS
- Railway hosting
- Railway persistent worker
- OpenRouter

## Important Files

- `AGENTS.md` — main source of truth
- `design.md` — design system and UI rules
- `security-access.md` — auth, roles, RLS, secrets, worker safety
- `feature-checklist.md` — implementation roadmap
- `CONTRIBUTING.md` — development workflow
- `.env.example` — required environment variables

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Worker

The research worker is a separate persistent Railway service.

Local command:

```bash
npm run worker
```

Default behavior:

```env
RSS_COLLECTOR_ENABLED=true
RESEARCH_PIPELINE_FULL=false
RSS_COLLECTOR_INTERVAL_HOURS=6
```

## Development Rule

Build one feature at a time from `feature-checklist.md`.

Do not skip security setup.
