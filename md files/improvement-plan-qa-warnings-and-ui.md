# Improvement Plan — Warn-Only QA, Idea Simplification, and Research UI

Status: approved by Jawwad on 2026-08-03. Ready for implementation.

This plan has five independent workstreams. Do them in the order listed. Each
one ends at a committable, verifiable state. Do not mix workstreams into one
commit.

Read `AGENTS.md` and `CONTRIBUTING.md` before starting. Work directly on `main`.
Run `npm test`, `npm run lint`, and `npm run build` before every commit.

---

## Workstream 0 — Commit the existing QA diagnostics work first

There is validated but uncommitted work in the tree (safe QA reason codes,
audit coverage on every blocked exit, the corrective-retry fix, and four
deterministic-validator corrections). It is the foundation Workstream 1 builds
on — the reason-code machinery becomes the warning machinery.

Commit it as-is before starting anything else, so there is a clean checkpoint
to roll back to.

```text
fix: add safe QA block diagnostics, audit coverage, and validator corrections
```

---

## Workstream 1 — QA becomes warn-only (never blocks a draft)

### Decision

The QA agent must **never** prevent a post from being created. Every concern
becomes a warning attached to the post and shown on the review screen. The
human reviewer decides.

Rationale: the app already requires human review before publish. A second AI
gate at generation time is redundant, has no view of the operator's risk
appetite, and destroys the draft so the operator cannot even see what was
objected to.

### Behavioural contract (new)

| Situation | Old behaviour | New behaviour |
|---|---|---|
| QA returns `pass` / `revised` with a final post | Store post | Store post (unchanged) |
| QA returns `blocked` (no final post) | Discard, return error | Store the **Content Agent draft** + warnings |
| Deterministic findings remain after corrective retry | Discard, return error | Store best available post + warnings |
| Replan returns `readiness: blocked` | Return error | Proceed with the plan + `strategy_exceeds_source` warning |
| Banned topic / any other finding | Discard | Store + warning |

Keep the corrective retry. It still improves quality — it just no longer
gatekeeps. One bounded retry, then store whatever is best available.

### Files and changes

**`src/features/posts/generate/service.ts`**

- Delete `qaBlockedFailure` and every `return { ok: false, failure: ... }`
  arising from QA verdicts or deterministic findings.
- Add a `warnings: QaBlockDetails`-shaped accumulator threaded through
  `produceReviewedPost`. Reuse `buildQaBlockDetails` from
  `src/lib/ai/playbooks/qa-block-reasons.ts` — rename the concept from
  "block details" to "warnings" but keep the same safe reason-code enums.
- Add a resolution step: `finalPost = reviewResult.qa.finalPost ??
  buildFinalPost(agentResult.draft)`. When falling back to the Content Agent
  draft, record `qa_fallback_to_draft` in the warning set so the reviewer knows
  the QA agent declined to finalise it.
- When QA returns `blocked`, still capture `qa.checks` failures and
  `qa.issues.length` into warnings, then continue.
- Persist warnings inside the existing `qa_result` jsonb column as
  `qa_result.warnings = { reasonCodes, recommendedActions, stage }`.
  **No migration required.**
- Replace the audit action `post_generation_blocked_by_qa` with
  `post_generated_with_warnings`, written only when warnings is non-empty.
  Keep the same safe metadata (enum codes only, never `detail` strings, never
  draft/prompt/source text).

**`src/features/posts/agents/review-agent.ts`**

- `runReviewAgent` currently returns `{ ok: false, reason: "error" }` when a
  non-blocked verdict has no `finalPost`. Keep that validation.
- For `verdict === "blocked"`, continue returning the result normally — the
  service now handles it as a warning path rather than a failure.

**`src/features/ideas/agents/planning-agent.ts`**

- Keep the `"blocked"` reason on `ReplanningAgentResult`, but the service now
  treats it as a warning and proceeds using the returned plan rather than
  aborting. If the plan is structurally unusable (wrong source mode, fails
  compatibility), that remains a genuine `error`.

**`src/lib/errors/api-response.ts`**

- Remove `QA_BLOCKED: 422` from the status map — generation no longer fails
  for QA reasons. Leave the optional `details` field in place (still used for
  genuine failures).

**`src/lib/ai/playbooks/qa-block-reasons.ts`**

- Add `qa_fallback_to_draft` to `QA_REASON_CODES` with a label such as
  "The AI reviewer declined to finalise this draft, so the original draft was
  kept."
- Rename exported symbols from `QaBlock*` to `QaWarning*` for clarity. Keep
  the label maps — the UI uses them for warning text.

**`src/features/ideas/management/generate-post-button.tsx`**

- The QA error branch is now dead. Generation either succeeds or fails for a
  real reason (auth, config, network). Simplify back to a plain error message,
  and on success optionally surface "Draft created with N notes."

**Review screen — `src/app/client/[client_id]/posts/[post_id]/review/page.tsx`
and `src/features/posts/review/post-review-actions.tsx`**

This is the safety-critical part of this workstream. Because nothing blocks
any more, the warnings must be impossible to overlook.

- Render warnings in a prominent amber/danger banner **above** the post body,
  never inside a collapsed `<details>`.
- One line per reason code using `QA_REASON_CODE_LABELS`.
- Never render deterministic `detail` strings or raw QA `issues` text — the
  safe label only.
- Optional but recommended: when warnings include a fabrication-class code
  (`unsupported_numeric_claim`, `unsupported_quote`), require a single
  confirmation checkbox ("I have checked these claims") before Approve is
  enabled. This is the main mitigation for the residual risk of a fabricated
  metric reaching an approved post.

### Tests

`tests/generate-block-paths.test.ts` currently asserts the **old** blocking
behaviour and will fail. Rewrite it as `tests/generate-warning-paths.test.ts`:

1. QA returns `blocked` → post **is** stored, idea becomes `used`, warnings
   contain `strategy_exceeds_source` and `qa_fallback_to_draft`.
2. Deterministic findings survive the retry → post stored, warnings contain
   the exact codes.
3. Corrective retry still receives the reviewed post and exact findings
   (keep this assertion — it is a genuine regression guard, verified by
   mutation testing).
4. Clean generation → no warnings, no warning audit written.
5. No draft text, finding `detail` text, source content, or business context
   appears in the API response or audit metadata.

Also update `tests/qa-block-reasons.test.ts` for the renamed exports.

### Documentation

`AGENTS.md` states "blocked drafts are not inserted" and "Pass/revised posts
enter human review; blocked drafts are not stored." Both are now wrong.
Update the Content Agent and Review Agent sections to describe warn-only
behaviour. This is required — the doc is the source of truth for future agents.

---

## Workstream 2 — Content Idea simplification

The card renders ~23 labels, five of which are the same data stored twice.

| Shown as | Source | Verdict |
|---|---|---|
| Belief (X to Y) | `plan.strategy.currentBelief` / `desiredBelief` | Keep |
| Belief Shift | `content_ideas.belief_shift` | Duplicate |
| Proof to use | `plan.strategy.proofToUse` | Keep |
| Proof Notes | `content_ideas.proof_notes` | Duplicate |
| Primary source anchor | `plan.strategy.primarySourceAnchor` | Keep |
| Source context | `content_ideas.source_context` | Duplicate |
| Risk notes | `plan.strategy.riskNotes` | Keep |
| Angle Boundary | `content_ideas.angle_boundary` | Duplicate |
| Theme | `content_ideas.content_pillar` | Legacy, low value |

### Phase 2a — Display only (zero risk)

Single file: `src/features/ideas/management/content-ideas-panel.tsx`.

Restructure each card into three zones:

- **Always visible:** source + status badges, angle as title, core argument as
  one sentence, belief shift as one line, target buyer.
- **"Strategy" disclosure:** source anchor, proof to use, risk notes,
  readiness, source title.
- **"How it will be written" disclosure:** archetype, structure, framework,
  hook, CTA, resource, argument outline.

Delete the `Angle Control` and `Why This Idea Exists` sections entirely.
Keep the existing `idea.generationPlan ? ... : ...` fallback so older ideas
without a stored plan still render using the legacy fields.

### Phase 2b — Stop writing the duplicates

- `src/features/ideas/agents/planning-agent.ts`: remove `belief_shift`,
  `angle_boundary`, `source_context`, `proof_notes`, `content_pillar` from
  `ideaSchema`, `IDEA_JSON_SCHEMA`, and the prompt. **Keep** `angle`,
  `buyer_pain`, `commercial_relevance` — they have no plan equivalent.
- `src/features/ideas/generate/service.ts`: stop inserting those columns.
- `src/features/posts/generate/service.ts`: remove them from
  `ideaHashMetadata` and `toIdeaContext` (this also shrinks every Content
  Agent prompt and lowers token cost).
- **Do not drop the database columns.** No migration. Old ideas keep working.

⚠️ Changing `ideaHashMetadata` invalidates every stored plan hash once, so each
existing idea re-plans on its next Generate Post. Harmless but expected —
do not mistake it for a bug.

### Do not remove

`safety.allowedClaims` and `safety.claimBoundaries` are invisible in the UI but
are what the reviewer checks the draft against. Leave them intact.

---

## Workstream 3 — Collapse / expand for TrendCards and Content Ideas

- Default **collapsed**: one row showing title, status badges, and (for ideas)
  the belief shift on one line.
- Expanded: the full card from Workstream 2.
- Add an "Expand all / Collapse all" control at the top of each list.
- Persist per-card state in `localStorage` keyed by client id, so it survives
  navigation. Do not put it in the URL.
- Must not interfere with the existing bulk-selection checkbox mode in
  `content-ideas-panel.tsx` — when selection mode is active, keep rows
  collapsed and make the whole row a selection target.

Files: `src/features/ideas/management/content-ideas-panel.tsx`, and the
TrendCards list under `src/features/research/trend-cards/`.

---

## Workstream 4 — Research page sub-tabs

`src/app/client/[client_id]/research/page.tsx` is 211 lines rendering every
section at once. Split into four horizontal sub-tabs:

1. **Focus & Sources** — Research Focus editor + RSS Sources + Run Research
   Agent button
2. **Collected Articles**
3. **TrendCards**
4. **Runs**

Requirements:

- Drive selection from a URL search param (`?tab=articles`) so links, refreshes,
  and back/forward work. Default to `focus`.
- Keep all existing role/permission gating exactly as it is today — a
  `client_user` must still be unable to edit sources or run the agent.
- Show a count badge on Collected Articles and TrendCards.
- Keep the Run Research Agent button reachable from the Focus & Sources tab.
- Reuse the existing tab primitive if one exists in `src/components/ui/`;
  otherwise add a minimal accessible one (roving tabindex, `aria-selected`).

---

## Workstream 5 — Research Focus clarity

Confirmed behaviour, for the help text: Research Focus (`research_keywords`)
does **not** filter RSS collection. It is injected into the Article
Classification and TrendCard Synthesis prompts alongside industry, business
description, ICP, main offer, and banned topics. It steers AI judgement about
what is worth keeping, after collection.

- Fix the naming inconsistency: the page heading says "Research Focus", the
  form label says "Research keywords". Standardise on **Research Focus**
  everywhere.
- Replace the helper text with something accurate and actionable:
  > Research Focus does not change which articles are collected — your RSS
  > sources control that. It tells the AI what matters to your buyers when it
  > decides which collected articles are relevant and which become TrendCards.
  > Write themes in plain language, one per line, for example "outbound reply
  > rates declining". Broaden these if useful articles are being filtered out;
  > sharpen them if too much noise is getting through.

---

## Suggested commit sequence

```text
1. fix: add safe QA block diagnostics, audit coverage, and validator corrections
2. feat: make QA advisory — always store the draft and surface warnings
3. refactor: remove duplicated Content Idea fields from the ideas card
4. refactor: stop generating duplicated Content Idea fields
5. feat: collapsible TrendCard and Content Idea cards
6. feat: split Research into Focus, Articles, TrendCards, and Runs sub-tabs
7. docs: clarify Research Focus purpose and standardise naming
```

## Verification for every workstream

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Plus a manual pass: generate one post end to end and confirm it is created
with visible warnings rather than an error; open Research and confirm each
sub-tab renders with permissions intact.
