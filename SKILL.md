---
name: aixelerate-content-os
description: AIXelerate Content OS for creating ICP-first LinkedIn posts for B2B founders and operators. Use when the user asks to interpret a provided TrendCard for content, plan LinkedIn post ideas from founder experience, TrendCards, or TrendCard reactions, or write a final LinkedIn post from an approved idea. Focuses on buyer relevance, operator-led insight, commercial sharpness, and strict proof-safety. Does not handle LinkedIn ads, outbound DM campaigns, profile optimization, scheduling, RSS ingestion, or generic creator growth content.
---

# AIXelerate Content OS

Use this skill as a LinkedIn content operating system for B2B founders and operators. The goal is not generic LinkedIn content. The goal is content that speaks directly to the client's ICP and helps the target buyer feel understood.

## Setup

Before loading any agent workflow or resource:

1. Locate this skill by finding `**/linkedin-content-os/SKILL.md`.
2. Treat that directory as `SKILL_BASE`.
3. Load only the agent workflow needed for the user request.
4. Use business context as background in every workflow. Do not treat business context as a standalone content mode.

## Agent Routing

| User intent | Agent workflow | Path |
|---|---|---|
| Interpret a provided TrendCard or research note for content use | Research Agent | `{SKILL_BASE}/.agents/skills/research/SKILL.md` |
| Generate multiple ranked LinkedIn post ideas | Planning Agent | `{SKILL_BASE}/.agents/skills/planning/SKILL.md` |
| Turn one approved idea into a final LinkedIn post | Content Agent | `{SKILL_BASE}/.agents/skills/content/SKILL.md` |

## Shared Resources

Load these resources only when relevant:

- Business context contract: `{SKILL_BASE}/resources/context/business-context.md`
- ICP-first content rules: `{SKILL_BASE}/resources/principles/icp-first-content.md`
- Proof-safety rules: `{SKILL_BASE}/resources/principles/proof-safety.md`
- Hook guidance: `{SKILL_BASE}/resources/craft/hooks.md`
- Storytelling guidance: `{SKILL_BASE}/resources/craft/storytelling.md`
- CTA and engagement guidance: `{SKILL_BASE}/resources/craft/cta-engagement.md`
- Format guidance: `{SKILL_BASE}/resources/craft/formats.md`

## Core Philosophy

Every output must be:

- ICP-first
- Buyer-relevant
- Operator-led
- Commercially sharp
- Proof-safe
- Specific
- Engaging
- Built around a clear buyer belief shift

Engagement and growth still matter, but engagement must come from ICP relevance, useful tension, sharp insight, and practical value. Do not write for competitors, generic creators, or broad LinkedIn applause when the content should speak to the actual target buyer.

## Proof-Safety

Never invent proof, metrics, founder stories, client results, customer quotes, market facts, or unsupported claims. If proof is missing, either:

- Write without the claim.
- Mark it in proof notes as missing.
- Ask for approved proof when the missing proof is necessary.

## Default Output Rules

- Research Agent returns: `TrendCard summary`, `Why buyers care`, `Content angles`, `Proof notes`.
- Planning Agent returns multiple ranked ideas. Each idea includes: `Angle`, `Buyer pain`, `Commercial relevance`.
- Content Agent returns: `Final LinkedIn post`, `Buyer belief shift`, `Proof notes`.
- Keep posts focused on one idea.
- Use short, readable lines.
- Prefer specific buyer language over broad business jargon.
- Use CTA, hook, format, and engagement guidance only when it supports the ICP and business goal.
