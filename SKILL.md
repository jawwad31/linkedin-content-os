---
name: aixelerate-content-os
description: Route AIXelerate Content OS work across research interpretation, idea planning, post drafting, and final QA. Use for ICP-first B2B LinkedIn content grounded in Founder Experiences, approved TrendCards, or founder Trend Reactions. Excludes distribution, outbound, scheduling, visual production, and external web research.
---

# AIXelerate Content OS

This is a compact Codex/developer router. The production application does not
inject this file into model prompts. Runtime prompts load the selected stage
skill and its allowlisted resources through the TypeScript playbook manifest.

## Setup

1. Locate `**/linkedin-content-os/SKILL.md` and treat its directory as `SKILL_BASE`.
2. Load only the stage required for the request.
3. Use relevant business context as background. It is never a source mode.

## Stage Routing

| Intent | Stage | Path |
|---|---|---|
| Classify collected RSS articles or synthesize TrendCards | Research | `{SKILL_BASE}/.agents/skills/research/SKILL.md` |
| Generate complete Content Ideas | Planning | `{SKILL_BASE}/.agents/skills/planning/SKILL.md` |
| Draft one approved text post | Content | `{SKILL_BASE}/.agents/skills/content/SKILL.md` |
| Review and safely finalize a draft | Review | `{SKILL_BASE}/.agents/skills/review/SKILL.md` |

## Shared Resources

- Business context: `{SKILL_BASE}/resources/context/business-context.md`
- ICP and proof principles: `{SKILL_BASE}/resources/principles/`
- Research methods: `{SKILL_BASE}/resources/research/`
- Strategy methods: `{SKILL_BASE}/resources/strategy/`
- Writing craft: `{SKILL_BASE}/resources/craft/`
- Final QA: `{SKILL_BASE}/resources/quality/final-qa.md`

Every output must be ICP-first, commercially relevant, specific, and
proof-safe. Never invent metrics, founder stories, client results, quotes,
market facts, or resources. Drafting remains text-only. Review may make an
advisory format recommendation but never creates an asset. Never auto-generate
ideas after research, auto-publish, or add distribution, outbound, scheduling,
or visual production work.
