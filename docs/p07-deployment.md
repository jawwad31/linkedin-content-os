# P07 — saved prompt and manual web research

Status: application deployed from feature commit `adf3693c9fe2713f86d613324c071d0818f2b13c`, pushed to main after Jawad's approval on 2026-10-08. Railway web `9431d57e-2d2e-4d17-8c47-2fbfdd4e640f` and worker `b8711468-3d0c-4b41-92f4-a6aa69d93a60` both report SUCCESS. Production migration/provider setup and manual acceptance remain pending. Manual acceptance is deferred to Jawad's extensive testing round. P07 is not complete. Baseline: main `e0acab005984da85b1dc178744b80d2d816796de`. Calendar batch drafting remains off. A documentation-only release-status commit follows the feature commit; it carries the same application code.

## Changes and preserved behavior

Research defaults to Web Briefings, with an administrator-only saved-prompt editor, immutable versions, optional profile context off initially, and explicit Save / Run saved prompt / Save and run controls. RSS Focus & Sources, Collected Articles, TrendCards and Runs remain available. The RSS worker is unchanged. Web runs use the existing `rss_collect` lock, so they cannot overlap an RSS cycle in the same account.

The narrow server-only Responses adapter requires a configured model supporting web search and structured JSON. One response is bounded to six tool calls, 8,000 output tokens, 90 seconds, 180,000 input bytes and 3,000,000 response bytes. This bounds work, not a fixed dollar price. Aborting a request does not guarantee that the provider incurred no cost. Oversized input fails clearly without truncating essential context. Lookback is 1–30 days; an explicit period in the saved prompt takes precedence.

All consulted/cited URLs returned within that budget are saved as candidates. Findings must reference URLs from actual tool sources or citation annotations. Invalid/unproven links are omitted with coverage warnings. Publication, announcement and effective dates are nullable and separate from server-recorded fetched time. Dates are reported from source evidence by the model and still require manual acceptance against the linked pages. Unknown dates stay unknown. Development grouping retains each fact/evidence link; novelty is conservative and compares at most 60 recent workspace findings within 30 days, not all historical or internet coverage.

Briefings distinguish successful findings, successful empty results, partial coverage, provider failure and missing configuration. Private prompts/profile snapshots are application records, not operational logs. Findings and source labels remain model-derived research data. Logged provider/run/audit information contains metadata only.

Research never autonomously creates ideas, calendar assignments, posts, newsletters, approvals or publishing actions. An administrator approves a finding for selection. A user with both `ideas_manage` and `posts_draft` may explicitly select up to three approved findings and choose Create separate posts. Each selection reuses one backing idea and the existing planner/writer/deterministic checks/independent QA. Posts enter human review. Repeating a selection preserves the existing one-active-post invariant; this is not a new durable post batch runner. Failed selected drafts remain retryable through the same selection or Ideas. Linked finding history protects its idea from deletion.

P08 scheduling/monitoring/notifications and P09 newsletters remain outside this phase. Legacy inline research notes and ready custom-document source loading are preserved; the standalone supplied-note/document UI is still unavailable. The new research-finding entry point is local until deployed.

## Rollout

1. Review the patch and validation results. Obtain Jawad's agreement before committing/pushing main under the continuation instruction. Expected message: `feat: add prompt controlled web research`.
2. Verify the target Supabase project and its backup/recovery capability before a production migration. Do not reset or drop anything. Railway does not apply SQL migrations automatically.
3. Apply `supabase/migrations/20261007192100_prompt_controlled_web_research.sql` through the established SQL Editor procedure. It creates six new RLS-protected tables and five scoped transitions, plus a private access helper. It backfills only missing starter prompt records for existing live accounts. Existing saved settings, legacy sources and content are not rewritten. It can be rerun.
4. Use the read-only verification query below. Inspect RLS/grants/advisors for the new objects; the four authenticated definer transitions deliberately check current actor/password/account/role. `finish_web_research` is service-role only and rechecks the initiating actor after the provider call.
5. Add server-only `OPENAI_API_KEY` and `OPENAI_RESEARCH_MODEL` to the Railway web service. Select a model explicitly compatible with Responses `web_search` and strict structured output. Never paste credentials into a handoff or commit them. Existing `OPENROUTER_*` variables still own writing and RSS analysis. The worker requires no new provider settings or schedule.
6. Commit/push only reviewed paths, excluding local CLI cache under `supabase/.temp/`. Verify actual web deployment result and the new Research page. Existing old web/worker code remains compatible with the additive schema. If the migration/provider configuration is missing, the new UI reports setup/load failure and the old RSS tabs remain usable.
7. Complete the deferred connected acceptance below before marking P07 complete. Keep `CALENDAR_DRAFTING_ENABLED` absent/false until its separate P06 gates pass.

App rollback: revert the application commit through the normal validated workflow. Retain additive SQL/data; do not reverse it destructively. Any data rollback requires a separately approved safe procedure.

```sql
select
  to_regclass('public.research_settings') is not null as settings,
  to_regclass('public.research_prompt_versions') is not null as prompt_versions,
  to_regclass('public.research_run_inputs') is not null as private_inputs,
  to_regclass('public.research_briefings') is not null as briefings,
  to_regclass('public.research_candidates') is not null as candidates,
  to_regclass('public.research_findings') is not null as findings,
  to_regprocedure('public.save_research_settings(uuid,integer,text,integer,boolean)') is not null as save_settings,
  to_regprocedure('public.prepare_web_research(uuid,uuid,uuid,integer,jsonb)') is not null as prepare_run,
  to_regprocedure('public.finish_web_research(uuid,uuid,uuid,jsonb)') is not null as finish_run,
  to_regprocedure('public.review_research_finding(uuid,uuid,text)') is not null as review_finding,
  to_regprocedure('public.select_research_findings(uuid,uuid[])') is not null as select_findings,
  not has_function_privilege('authenticated','public.finish_web_research(uuid,uuid,uuid,jsonb)','execute') as finish_private;
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
  ('research_settings','research_prompt_versions','research_run_inputs','research_briefings','research_candidates','research_findings');
```

## Deferred manual acceptance

Use Client 1 (`2eecf9cd-6537-4020-baa9-5e57a76d6ff4`), not the workspace containing real approved/published posts. Localhost and production share the configured production database; writes are real.

- [ ] Starter prompt exactly matches product-spec; new-account editor requires its first save. Reload preserves exact prompt/config revision.
- [ ] Edit without saving: Run saved prompt is disabled, Save and run saves the displayed version before running. Stale settings in another window are rejected; refresh resolves it.
- [ ] Profile off: marketing prompt and a deliberately unrelated industry/topic prompt follow their own scope without ICP/RSS filtering or invented founder opinions. Toggle on includes authorized form context only. Required fields never silently disappear due to an oversized input.
- [ ] Compare each source URL, publication/announcement/effective date and reported evidence to the actual page. Unknown dates stay unknown; fetched time is distinct. Confirm primary/secondary labels and confidence rather than assuming model labels are verified.
- [ ] Multiple articles for one development are grouped; unchanged repeat coverage differs from a material evidence-backed follow-up. No evidence, failed search action, output/time/search-budget stop and invalid citation show honest coverage states with retained candidates where available.
- [ ] Missing model/key, provider auth/rate-limit errors and timeouts do not become empty successful briefings. Retry is explicit, with no automatic paid retry loop.
- [ ] Two windows and an active RSS cycle cannot overlap web runs. Retrying the same request key returns its existing briefing without another web provider call. Closing/transport failure and refresh show the actual run state; stale lock cleanup remains the existing two-hour guard behavior.
- [ ] Account users cannot read private prompt versions/run inputs or forge approvals/results. Different-account IDs, unaccepted/revoked access, inactive users and forced password-change state are denied. Revoking access while research is running prevents its result commit.
- [ ] Research alone creates zero operational ideas/posts/assignments. Pending/archived findings cannot be selected. Approved multi-selection creates separate posts only after the explicit action. Both idea and draft capabilities are required. Retrying selection reuses each idea/post; writing failure remains visible and retryable.
- [ ] Selected posts retain source links, planning hashes, QA warnings and review status with no human approval. Manual edit/approval invalidation/publication and administrator dependency safeguards still work. Source findings cannot be archived after selection.
- [ ] RSS collection/history/TrendCards remain usable. Confirm 375px, 768px and desktop layouts, long URLs, checkbox limits, keyboard focus and status/error announcements. Review loading/empty/error/denied/partial/retry states.

## Validation evidence

Automated validation includes fresh full migration application/rerun on PGlite, RLS and password/role/scope tests, immutable settings and stale-version checks, shared-lock contention, late access revocation, candidate/citation/date validation, grouping/follow-up/partial/budget/missing-config tests, oversized-input refusal, and explicit separate-post selection with idempotent SQL idea linkage. Provider calls are mocked; this does not verify live OpenAI model compatibility or remote source accuracy.

Final checks: lint and production build passed; full suite **33 files / 283 tests passed**; diff check/review passed. Standalone `tsc --noEmit` still reports only the known baseline `tests/profiles.test.ts:121` compatibility-fixture error, with no new type errors. Production migration, environment setup, deployment and all manual checks above are pending. No live P07 customer records or paid research calls were made by the agent.

Provider references checked during implementation: [Responses web search](https://developers.openai.com/api/docs/guides/tools-web-search), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Responses create parameters](https://developers.openai.com/api/reference/resources/responses/methods/create). Database privilege guidance: [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).
