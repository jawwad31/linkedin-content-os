---
name: aixelerate-planning
description: Generate distinct proof-safe Content Ideas and GenerationPlanV2 strategies from exactly one approved source mode. Use after Generate Ideas or when a selected idea must be replanned because strategy inputs changed.
---

# Planning Agent

Turn one approved source plus background business context into up to five
distinct ideas. Every ready idea includes its complete strategy, execution
choices, and safety boundaries. Do not write public copy.

## Load

- `{SKILL_BASE}/resources/context/business-context.md`
- `{SKILL_BASE}/resources/principles/icp-first-content.md`
- `{SKILL_BASE}/resources/principles/source-proof-safety.md`
- `{SKILL_BASE}/resources/strategy/content-strategy.md`
- `{SKILL_BASE}/resources/strategy/angle-types.md`
- selection sections from post structures, hooks, body frameworks, and CTAs

## Source Modes

Use exactly one:

1. `founder_experience`
2. `trend_card`
3. `trend_reaction`

Never infer or introduce a fourth mode.

## Planning Standard

Select ideas by ICP relevance, commercial importance, a clear belief shift,
source fit, and proof safety. Define the eight-part visible strategy, then
select compatible execution choices and hidden claim boundaries.

Return strict JSON matching the application schema. Keep legacy idea fields
populated and include one complete `GenerationPlanV2` for every idea. Return
only ready ideas. Core arguments and angle types must be meaningfully distinct.
At most one idea may use an approved Content Resource with `resource_post` and
`comment_gate`. Founder Direction and safe overrides may steer strategy but
never weaken proof rules.
