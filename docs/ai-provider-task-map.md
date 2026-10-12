# Virel AI tasks and OpenRouter settings

Updated 2026-10-09. Jawad selected OpenRouter for all six current AI roles, superseding the earlier direct-provider request. The role configuration and web-search adapter are implemented, validated, pushed and deployed as `e2525e6`, based on `022ec87`; both Railway services reported SUCCESS. Exact deployment results are in CURRENT.md. No live paid model calls were made. Provider value/quality and deferred manual acceptance remain unverified.

## Update 2026-10-12: one way to configure, and no RSS synthesis role

- **Only the explicit pairs are read now.** Each role needs `LLM_<ROLE>_PROVIDER` and `LLM_<ROLE>_MODEL`. The older single-model settings (`OPENROUTER_MODEL`, `OPENROUTER_RESEARCH_MODEL`, `OPENROUTER_PLANNING_MODEL`, `OPENROUTER_CONTENT_MODEL`, `OPENROUTER_REVIEW_MODEL`, `OPENAI_RESEARCH_MODEL`) no longer do anything, and a role with no pair is "not configured" (it never borrows another role's model). Jawad confirmed every Railway service, including `rss-worker`, has the new pairs.
- **The RSS TrendCard synthesis role is gone** because TrendCards are no longer built (the RSS run fetches articles and marks them relevant or not). `LLM_RSS_SYNTHESIS_PROVIDER` and `LLM_RSS_SYNTHESIS_MODEL` can be deleted from Railway. Five roles remain, plus the three newsletter roles that follow planning, content and review unless set.
- **Safe to delete from Railway** (they are ignored): `OPENROUTER_MODEL`, `OPENROUTER_RESEARCH_MODEL`, `OPENROUTER_PLANNING_MODEL`, `OPENROUTER_CONTENT_MODEL`, `OPENROUTER_REVIEW_MODEL`, `OPENAI_RESEARCH_MODEL`, `LLM_RSS_SYNTHESIS_PROVIDER`, `LLM_RSS_SYNTHESIS_MODEL`.
- **Web research provider:** `openrouter` (default here) or `openai` (direct, needs `OPENAI_API_KEY`). No other role may use `openai`.
- The sections below are the historical record of 2026-10-08/09 and still mention the retired settings and the synthesis role.

## Six current AI roles and selected models

| Role | Trigger and output | Selected OpenRouter model | Assessment |
|---|---|---|---|
| Web research | Research > Web Briefings > Run saved prompt / Save and run; searches the saved topic and produces grouped findings, source URLs, dates, suggested angles and coverage gaps. Profile context is optional/off. | anthropic/claude-haiku-5.5 | Reasonable first baseline; requires actual search tools/citation metadata and source/date evaluation. |
| RSS relevance classification | Legacy RSS research/full worker pipeline; labels collected titles/summaries relevant/irrelevant and returns scores/reasons. | anthropic/claude-haiku-5.5 | Suitable starting choice for a bounded classification task; evaluate false positives/negatives. |
| RSS TrendCard synthesis | After classification; groups supplied relevant articles into supported shifts, consequences, reader relevance and angles, retaining source article IDs. | anthropic/claude-haiku-5.5 | Selected from Jawad's two options. Can produce written TrendCards; evaluate grouping and source fidelity. |
| Planning/replanning | Generate Ideas or create/replan a selected idea's strategy; distinct ideas and structured GenerationPlanV2. | anthropic/claude-sonnet-5.5 | Reasonable stronger model for multi-constraint planning. |
| Writing/redrafting | Generate Post, Redraft, explicit research-selected posts, Calendar batches when enabled; hook/body/CTA and proof/risk notes. | anthropic/claude-sonnet-5.5 | Reasonable stronger model for voice and structured writing. |
| QA/corrective review | After drafting/redrafting; fidelity, credibility, reader, voice, structure and CTA checks plus issues/revisions. May perform one extra corrective pass. | anthropic/claude-haiku-5.5 | Cost-conscious advisory review baseline; test missed errors before treating it as reliable. Human approval remains separate. |

Both exact Claude IDs were found in the public [OpenRouter model catalog](https://openrouter.ai/api/v1/models) on 2026-10-08, with tools and structured outputs listed. See [Haiku](https://openrouter.ai/anthropic/claude-haiku-5.5) and [Sonnet](https://openrouter.ai/anthropic/claude-sonnet-5.5). This verifies advertised availability/capabilities, not account access or quality on Virel's tasks.

The web adapter uses OpenRouter's Responses endpoint and [web-search server tool](https://openrouter.ai/docs/guides/features/server-tools/web-search), pinned to Exa. Limits: six tool steps/searches, five results per search, thirty total results, 4,000 characters of retrieved excerpts per result; existing 8,000 output-token, 90-second, 180,000 input-byte and 3,000,000 response-byte caps remain. Search charges are additional to model-token charges. The deprecated web plugin/:online variant is not used. Source action URLs and citation annotations establish provenance; generated JSON URLs alone do not. Search usage is not double-counted with output items. Missing/incomplete search remains visible, and oversized application context is refused rather than silently truncated.

## Exact new role variables

Add these to Railway's **linkedin-content-os** production web service once the new code is deployed. They are already present in Git-ignored `.env.local` and documented in `.env.example`.

```env
LLM_WEB_RESEARCH_PROVIDER=openrouter
LLM_WEB_RESEARCH_MODEL=anthropic/claude-haiku-5.5
LLM_RSS_CLASSIFIER_PROVIDER=openrouter
LLM_RSS_CLASSIFIER_MODEL=anthropic/claude-haiku-5.5
LLM_RSS_SYNTHESIS_PROVIDER=openrouter
LLM_RSS_SYNTHESIS_MODEL=anthropic/claude-haiku-5.5
LLM_PLANNING_PROVIDER=openrouter
LLM_PLANNING_MODEL=anthropic/claude-sonnet-5.5
LLM_CONTENT_PROVIDER=openrouter
LLM_CONTENT_MODEL=anthropic/claude-sonnet-5.5
LLM_REVIEW_PROVIDER=openrouter
LLM_REVIEW_MODEL=anthropic/claude-haiku-5.5
```

Provider names are trimmed/case-normalized, so OpenRouter also works; use lowercase consistently. Explicit roles require both provider and model. A missing/unsupported pair or missing selected key fails configuration without silently falling back to another role/provider. Only OpenRouter writing/RSS adapters and the existing direct OpenAI web adapter exist; configuring anthropic/google does not create a direct adapter.

## Complete Railway/local comparison and replacement list

The table records the 2026-10-08 comparison before Jawad changed the Railway variables. On 2026-10-09, web names were rechecked: all twelve LLM role variables and OPENROUTER_API_KEY are now present; old model variables are absent. Worker still has its original eight names with no AI key/pairs. OAuth returns names only: key/model/URL/flag values cannot be compared. Local comparison records presence, never secret values. W = web, R = rss-worker. No Railway variables were changed by Codex.

| Current variable | Railway presence | Local presence before this slice | Action |
|---|---|---|---|
| NEXT_PUBLIC_APP_URL | W + R | Set | Keep the correct URL for each environment: production URL on Railway, localhost locally. These need not match; current Railway values are hidden. |
| NEXT_PUBLIC_SUPABASE_URL | W + R | Set | Keep the intended existing database URL. |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | W + R | Set | Keep. |
| SUPABASE_SERVICE_ROLE_KEY | W + R | Set | Keep, server/worker only. |
| OPENROUTER_API_KEY | W only | Set | Keep the name and valid key. Add it to R if its full AI pipeline is enabled. |
| OPENROUTER_MODEL | W only | Set | Replace the generic defaults with the six explicit role models above. Remove after new code/configuration is deployed and checked. |
| OPENROUTER_RESEARCH_MODEL | W only | Set | Split into LLM_RSS_CLASSIFIER_MODEL and LLM_RSS_SYNTHESIS_MODEL, plus their provider variables. |
| OPENROUTER_CONTENT_MODEL | W only | Absent | Replace with LLM_CONTENT_MODEL plus LLM_CONTENT_PROVIDER. |
| RESEARCH_PIPELINE_FULL | W + R | Set | Keep the chosen flag. If true on R, classifier/synthesis pairs and OPENROUTER_API_KEY are required there. Do not silently enable it. |
| RSS_COLLECTOR_ENABLED | W + R | Set | Keep. |
| RSS_COLLECTOR_INTERVAL_HOURS | W + R | Set | Keep the chosen interval. |
| RSS_COLLECTOR_RUN_ON_START | R only | Absent | Keep on R; no new web requirement. Local/default behavior is unchanged. |
| OPENAI_API_KEY | Absent | Blank | Not needed for the selected OpenRouter roles. Local blank entry retained for rollback; no OpenAI key must be added. |
| OPENAI_RESEARCH_MODEL | Absent | Set | Superseded by LLM_WEB_RESEARCH_MODEL + LLM_WEB_RESEARCH_PROVIDER. Local legacy value retained for rollback. |
| OPENROUTER_PLANNING_MODEL | Absent | Absent | If configured elsewhere, replace with LLM_PLANNING_MODEL + provider. |
| OPENROUTER_REVIEW_MODEL | Absent | Absent | If configured elsewhere, replace with LLM_REVIEW_MODEL + provider. |
| CALENDAR_DRAFTING_ENABLED | Absent | Absent | Leave absent/false until its existing P06 acceptance gates pass. |
| WORKER_SECRET | Absent | Absent | No addition needed for the current scheduler. Required only if a worker calls protected app endpoints. |
| RSS_COLLECTOR_BATCH_DELAY_MS | Absent | Absent | Optional; retain default 0 unless deliberately changed. |
| RAILWAY_* | Managed variables on W + R | Absent | Leave Railway's generated variables unchanged. |

All twelve new LLM role variables were absent on both Railway services during the original 2026-10-08 audit. The 2026-10-09 web audit confirms Jawad added them; worker remains unchanged. Local has all twelve, with existing credentials and legacy settings preserved. `.env.local` is not committed and Railway does not synchronize it automatically.

For **rss-worker**, only the two classifier/synthesis pairs and `OPENROUTER_API_KEY` are needed when `RESEARCH_PIPELINE_FULL=true`. Collection-only mode needs no AI key. P08 scheduled web research is not implemented yet; record its worker web-role settings when that phase starts.

Put the same valid OpenRouter key in:
- Local: `D:\Local Work\AIXelerate\linkedin-content-os\.env.local`, under `OPENROUTER_API_KEY`.
- Railway: Project > production > linkedin-content-os > Variables > `OPENROUTER_API_KEY`.
- Railway rss-worker: the same variable only if enabling its AI pipeline.

One OpenRouter key serves all six models/tasks. Never prefix it with NEXT_PUBLIC_, commit it, or paste it into a handoff/chat. The current local key is present, but its validity was not tested. No Anthropic/OpenAI/Gemini key is required for these assignments.

Keep the older Railway model variables until the new implementation is deployed; then add the new pairs and remove superseded model settings after checking configuration. The code retains legacy behavior only when the relevant new pair is absent. This permits an orderly rollout/rollback without enabling a different model silently.

## OpenAI Decisions API

The supplied attachment was treated as reference documentation. Current [official Decisions documentation](https://developers.openai.com/api/docs/guides/decisions) confirms public beta, the dedicated `POST /v1/decisions` endpoint, and model `gpt-6-luna`. It returns predicate probabilities, choices from supplied options, or rubric scores.

Potential narrow uses: relevance classification, category choice, ranking scores, specific QA predicates. It cannot replace written TrendCards, complete plans/posts, explanations or corrective QA text. The current classifier also expects a reason, and review expects issues/revisions, so using Decisions would require changing or supplementing those contracts.

`openai/gpt-6-luna-decisions` was absent from OpenRouter's catalog. The regular `openai/gpt-6-luna` model is available through OpenRouter, but ordinary chat/Responses generation is not the dedicated Decisions API. A future Decisions integration would require direct `OPENAI_API_KEY` and a separate tested adapter. No Decisions calls or automatic routing to it are implemented in this slice.

## Reused workflows and operations with no model call

Individual posts, research-selected posts and Calendar drafts reuse planning -> writer -> deterministic checks -> QA -> human review. Valid cached plans may avoid a planner call; bounded transport/schema/corrective retries can add calls. Calendar batch drafting remains off.

RSS fetching/parsing/deduplication, monthly allocation/inventory/reservations/leases, manual Content Bank capture, settings saves, permissions, approvals and publication use code/database/human actions. Supporting MD/TXT retrieval uses scoped keyword/section matching, with no embedding/hosted-file-search call. Newsletter editions use three AI stages: outline (`LLM_PLANNING_MODEL`), article (`LLM_CONTENT_MODEL`) and QA (`LLM_REVIEW_MODEL`), each with its own skill file under `.agents/skills/`. P08 schedules/monitoring remain planned.

## Changed files and validation

- Configuration: `.env.example`, ignored `.env.local`, `src/lib/llm/config.ts`, `src/lib/openrouter/client.ts`.
- Call sites: `src/features/research/agents/research-classifier.ts`, `trend-card-synthesizer.ts`; `src/features/ideas/agents/planning-agent.ts`; `src/features/posts/agents/content-agent.ts`, `review-agent.ts`; `src/features/calendar/drafting-service.ts`.
- Web search/UI: `src/features/research/web-research/provider.ts`, `src/app/client/[client_id]/research/page.tsx`.
- Tests: `tests/llm-config.test.ts`, `tests/web-research-provider.test.ts`.
- Documentation: this file, `docs/p07-deployment.md`, `docs/handoffs/CURRENT.md`, `feature-checklist.md`.

Preserved: client/agency isolation, access/password gates, supplied source/context/schema contracts, bounded retries, one active post per idea, advisory QA/human approval, manual publication, shared research locking and Calendar-off state. No package/lockfile, database schema, production variables or paid provider call changed.

Validation: fresh lint, production build, full suite (34 files / 296 tests), diff check/review and local ignore check passed; details in CURRENT.md. Connected model/source/date tests remain deferred by Jawad; catalog inspection and mocked calls do not constitute live acceptance. Release approval was received on 2026-10-09; actual commit/push/deployment state is recorded in CURRENT.md. P07 does not become complete without its remaining required gates.
