# Start here — LinkedIn OS documentation handoff

Prepared for Jawad on 2026-10-06. These are Markdown implementation documents for Claude, ChatGPT/Codex, and Gemini. They do not change application code or deploy features.

## Use this package

1. Open IMPLEMENTATION-PLAN.md for the detailed phased plan.
2. Give a single coding tool the P00 prompt from EXECUTION-PROMPTS.md and access to this package plus the current repository checkout.
3. P00 installs/reconciles canonical root files, preserving newer repo changes and existing security rules.
4. Continue one phase at a time. Read the handoff when switching tools. Do not tell any tool to implement the whole roadmap in one pass.

The current repo keeps its instruction files under `md files/`. This package recommends canonical root files so tools can find one rule set. Historical snapshots are included under `docs/reference/2026-10-06/`; they are reference only. The install phase converts old active documents to pointers rather than keeping contradictory copies.

## Package map

| File | Purpose |
|---|---|
| AGENTS.md | Primary coding-agent contract and approved direction |
| security-access.md | Current security rules plus planned-feature requirements |
| design.md | Current design language and new screen behavior |
| feature-checklist.md | Phase status and acceptance gates |
| CONTRIBUTING.md | Main-only workflow, validation, commits, deployment, handoffs |
| operating-guidelines.md | Content quality and decision conventions |
| IMPLEMENTATION-PLAN.md | Baseline, design recommendations, phases, validation, rollback |
| EXECUTION-PROMPTS.md | One scoped prompt per phase for any coding tool |
| docs/planning/product-spec.md | Agreed profiles, sources, calendar, research, newsletter behaviors |
| docs/handoffs/CURRENT.md | Current implementation state and handoff template |
| CLAUDE.md / GEMINI.md | Short pointers to canonical instructions |

No fixed calendar percentages are imposed. The user saves month-specific values or future defaults. Markdown is a supported source format, not context compression. Example-profile analysis is recommended externally before implementing a scraper; save an approved voice guide and selected examples.

All new feature phases remain planned. App tests, commits, pushes, deployments, and manual product acceptance are still pending implementation. Historical records in the included snapshots retain their original claims; they do not establish current production verification.
