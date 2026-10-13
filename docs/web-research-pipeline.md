# Web research: the staged pipeline (2026-10-13)

Status: implemented locally, uncommitted, **not run against a real provider**. No migration. See `docs/handoffs/CURRENT.md` for the validation record.

## Why it changed

One request that searched, read results and wrote the whole structured briefing was failing in three separate ways: the provider refused an unsupported `include` value (fixed earlier), a later run found sources but answered in prose, and a search-result URL was being treated as if it supported every claim attributed to it. A URL in a search result only shows the tool surfaced it. The run is now a sequence of small steps, each with one job, and the facts in the final briefing come only from page text that was read and checked.

## Call path

`runWebResearch` (manual, `service.ts`) and `dispatchResearchSchedules` (scheduled, `automation/executor.ts`) both call `researchWeb` in `web-research/pipeline/run.ts`. Authorization, the shared run guard, request-key idempotency, the saved prompt revision, the profile toggle, previous-finding comparison and the commit RPCs (`prepare_web_research`, `finish_web_research`, the scheduled claim/finish pair) are unchanged. The scheduled path additionally refreshes feeds first and renews its lease before every stage (`beforeStage`); losing the lease aborts the run.

1. **Plan** (model, no tools). Input: the saved prompt, look-back, today's date, up to 20 recent feed headlines. **No profile data.** Output: topic lanes (1 for a narrow prompt, up to `maxLanes` for a broad one), each with a focus and one or two public queries, plus a date range only if the prompt itself asks for one. If the plan cannot be read, the saved prompt is searched as one lane and a coverage note says so.
2. **Discover** (model + OpenRouter `openrouter:web_search`, Exa). One call per lane, up to three lanes at once, each bounded by `searchesPerLane`, 5 results per search, 4,000 characters per result. The provider's reply is read for the pages it consulted. Its notes are not used as facts.
3. **Read** (no model). Pages are chosen round-robin across lanes, then up to `maxRssLeadPages` feed articles as leads (a page found by both is read once and keeps both origins). Imported article text is used as already read. Each page goes through `readSourcePage` -> the existing `fetchPublicText` + `extractPage` (public addresses only, DNS and every redirect rechecked, size, time and content-type limits). Blocked, paid, script-only, non-HTML, too-short and failed pages become a coverage gap naming the host and are never evidence.
4. **Extract and verify.** A tool-free model step reads up to three pages at a time and returns claims, each with a word-for-word excerpt, dates, date evidence, source kind, what was true before, who is affected and limitations. Then code checks every claim: the excerpt must be found on the cited page (case, spacing, curly quotes ignored; an ellipsis may join two copied passages; under 25 characters is rejected), a date is kept only if the date evidence is itself on the page and writes that date, a publication or announcement date in the future is dropped, and a claim dated entirely before the window is left out and counted. Failures are counted in plain coverage notes, never silently dropped.
5. **Write** (model, no tools). Sees only the verified evidence (ids, claims, excerpts, dates, limitations), the saved prompt, the window, earlier developments, optional profile context (only if the saved toggle is on) and the lane status. It returns findings that cite evidence ids. **Sources, dates, date evidence and excerpts are copied by code from the verified evidence**, so the model cannot supply a link or a date. A finding that cites no retained evidence is dropped. The result then goes through the same `finishBriefing` rules as before: schema check, `confirmed_change` needs a primary source or is relabelled `trend_analysis`, grouping of one development, novelty against previous findings (`new`, `follow_up` only with a changed fact and new evidence, otherwise `repeated`).
6. **Repeated coverage** with nothing new is left out of the briefing and counted in the summary; the briefing summary also lists the topics searched and how many sources each gave.

Prose or invalid structure from a model step gets **one** tool-free conversion pass that sees only the text just returned (not the pages, the prompt or the evidence), with a cap of `maxRepairs` (3) across the whole run. If it still fails, the run is `partial` with the stage named in plain words, `INVALID_RESPONSE`, and every consulted source kept.

## How the saved prompt controls scope

The saved prompt is the scope of the investigation. A broad prompt is split into lanes; a narrow or unrelated prompt gets one lane with no default marketing categories added (tested). The planner decides the lanes from the prompt alone. Relevance and materiality at the writing step follow the prompt's own criteria: if the prompt says to skip minor items they are skipped, if it does not they are kept and marked low confidence (Jawad's decision of 2026-10-13: "I decide what to keep"). The default prompt text still says "consequential" and "skip minor news" until it is edited on the Research page.

## Model configuration

Unchanged: `LLM_WEB_RESEARCH_PROVIDER` / `LLM_WEB_RESEARCH_MODEL` serve every model step (plan, discover, extract, write, conversion). No other role is borrowed. The `LLM_RSS_SYNTHESIS_*` pair is not read by any code (the TrendCard synthesis role was removed on 2026-10-12) and can be deleted from Railway. The structured steps use the Responses API with strict `json_schema` built from plain schemas (no length or format keywords), so a model must support structured output; if a model cannot, the failure shows as `PROVIDER_BAD_REQUEST` at the planning step before any search is paid for. If quality or capability proves inadequate for one step, the proposal is a separate, independently configurable role: not done here.

## Limits and cost

Per run, defaults (`RESEARCH_BUDGET` in `web-research/contracts.ts`, saved with each run in `research_run_inputs.budget`):

| Limit | Default | Setting (optional) |
|---|---|---|
| Topic lanes | 4 | `RESEARCH_MAX_LANES` (1-6) |
| Searches per lane | 2 | `RESEARCH_SEARCHES_PER_LANE` (1-3) |
| Searches per run | lanes x per-lane = 8 | derived |
| Results per search / characters per result | 5 / 4,000 | fixed |
| Pages read in full (feed leads included) | 14 (feed leads <= 4) | `RESEARCH_MAX_PAGES` (4-24) |
| Page text sent to the evidence step | 12,000 characters per page | fixed |
| Model calls | 1 plan + one per lane + about one per 3 pages + 1 write = about 12 at the defaults, plus at most 3 conversions | derived |
| One model step | 90 s (plan 40 s, search 60 s, evidence 70 s) | fixed |
| Whole run | 240 s, then no new step starts | `RESEARCH_TOTAL_SECONDS` (60-270) |

Cost is the provider's price for the tokens plus the per-search price of the search tool; both vary by model, so no dollar figure is promised here. Each run writes one `llm_logs` row with total input and output tokens, so the first live runs show the real figure. Order of magnitude at the defaults: 100k-200k input tokens and 20k-40k output tokens, 8 searches, 14 page reads. Check the model's and OpenRouter's current prices before enabling the weekly schedule.

**Request limit.** A manual run still executes inside the web request (`maxDuration = 300` on `/api/client/[id]/web-research`). The 240-second whole-run stop means it normally finishes inside that, degrading to `partial` instead of failing, and every stage keeps what it collected. If live runs regularly hit the stop, the next step is to run manual research on the existing worker the way scheduled research already runs, and show progress; that is deliberately not built before real timings exist.

## What the page now shows

Each finding: Confirmed change or Trend badge, confidence, New / Follow-up with new facts / Already reported; what changed; what was true before; who it affects; why it matters; the suggested action (labelled as our recommendation, separate from the source's claim); limits and uncertainty; sources with published / announced / effective dates and fetch time kept apart, the supporting passage found on the page, and the date evidence. Coverage notes list unread pages, dropped claims, lanes with no sources and any time or output stop.

## Validation record

- Automated: `tests/web-research-verify.test.ts`, `tests/web-research-pipeline.test.ts` (33 cases, mutation-checked: ten safeguards each broken in turn and caught), `tests/web-research-provider.test.ts` (rules kept from the single-request design), executor and service tests re-pointed at the new entry.
- Evaluation set: two fixture runs (careful and careless model) in `tests/web-research-pipeline.test.ts`. Fixture pages are written stand-ins, **not** fetched or copied from ChatGPT or the web. They show the checks keep accurate claims (precision 1.0, date accuracy 1.0, citation support 1.0 on what is kept) and reject planted unsupported claims (2 of 2) and wrong dates. **They do not measure how many consequential items a real model finds or misses, or real-world false positives.**
- **Deferred, needs your approval because it spends money:** a live run on Railway on the saved prompt, then a comparison with a ChatGPT briefing on the same prompt and window, verifying that briefing's claims and dates independently first. Record: precision, missed consequential items, false positives, unsupported claims, date accuracy, citation support, structured-answer success rate, tokens, searches and seconds.
