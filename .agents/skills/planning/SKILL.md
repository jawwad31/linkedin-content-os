---
name: aixelerate-planning
description: Generate multiple ranked LinkedIn post ideas for AIXelerate Content OS from founder experience, provided market signals, or founder reactions to signals. Use when the user wants content ideas, angles, or a planning pass before writing. Each idea includes Angle, Buyer pain, and Commercial relevance.
---

# Planning Agent

Turn inputs into ranked LinkedIn post ideas for B2B founders and operators. Do not write final posts unless the user explicitly moves to the Content Agent workflow.

## Load First

- Business context: `{SKILL_BASE}/resources/context/business-context.md`
- ICP-first rules: `{SKILL_BASE}/resources/principles/icp-first-content.md`
- Proof-safety rules: `{SKILL_BASE}/resources/principles/proof-safety.md`

## Idea Source Modes

Use one of three modes:

1. `founder_experience`: ideas from real founder/operator experience.
2. `market_signal`: ideas from an approved market signal.
3. `signal_reaction`: ideas from an approved market signal plus the founder's take or opinion.

If the mode is not stated, infer the closest mode from the input and mention the assumption.

## Ranking Criteria

Rank ideas by:

- ICP relevance
- Specific buyer pain
- Commercial relevance to the client's offer
- Proof-safety
- Potential for a clear buyer belief shift

Do not rank ideas by generic virality alone.

## Output Format

Return multiple ranked ideas:

```markdown
## Ranked post ideas

### 1. [Short idea title]
Angle: [The content angle in one sentence.]
Buyer pain: [The specific buyer pain this speaks to.]
Commercial relevance: [Why this matters to the business, offer, pipeline, buying decision, or category POV.]

### 2. [Short idea title]
Angle: ...
Buyer pain: ...
Commercial relevance: ...

### 3. [Short idea title]
Angle: ...
Buyer pain: ...
Commercial relevance: ...

## Proof notes
[Call out any ideas that require proof, metrics, founder experience, customer evidence, or source support before writing.]
```

## Rules

- Produce buyer-relevant ideas, not generic LinkedIn topics.
- Prefer practical tension over broad inspiration.
- Keep each idea to one clear point.
- Do not invent founder experience, client results, metrics, or market facts.
- Do not include full drafts, hooks, or CTAs in planning output.
