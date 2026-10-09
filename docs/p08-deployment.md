# P08 — scheduled research, monitored sources and notifications

Updated 2026-10-09. Code `dd1ddfe` is deployed, the production schema is applied and P08 controls are enabled. Both Railway services report SUCCESS after configuration activation. Account schedules start disabled until explicitly enabled by an administrator. Extensive manual acceptance remains deferred; P08 is not complete until those gates pass.

Initial feature-off release: web `8175ad7e-26f3-4556-bde9-ad71f46c1266`, worker `060c279b-3c29-4361-8480-ac5a9cba7034`; `/login` 200, unauthenticated Client 1 Research 307 to login. Activated release: web `287fc7f6-ebe6-445c-88e3-d7d1281318e5`, worker `882c05bf-bbaa-46a8-beec-201c43a15c16`, both SUCCESS at `43f41ae` with unchanged `dd1ddfe` application code. Existing worker completes RSS collection with zero failed runs; its three feed errors also occur before P08. Scheduled dispatcher polls every minute with zero claimed/finished/errors. No account schedule or paid research run was started by Codex.

## Resulting behavior

- Scoped administrators save a daily local time/timezone and enable or pause the schedule. The current saved research prompt, lookback and optional profile setting are snapshotted per attempt. Profile context remains off by default.
- The existing Railway worker dispatches due research once per minute when automation is enabled, independently of the RSS collector switch. RSS retains its own interval and full-pipeline flag. No second worker/scheduler is introduced.
- Durable occurrences, the existing `rss_collect` unique lock, 15-minute renewable leases, at most three attempts and 5/10-minute retry delays protect replicas, manual collisions and restarts. Downtime coalesces to one occurrence for the current local day. Skipped DST times advance to the next real minute; repeated times run once. Pause/edit/revocation invalidates unfinished work.
- Read article preserves one public source; Monitor blog checks a public index or sitemap and at most two same-origin links per occurrence. Four non-archived sources per account; pause/resume/archive preserve originals and revision history. Exact extracted text/title hashes detect updates and reversions; unchanged navigation outside the article does not create a revision.
- Fetching allows public HTTP(S) on default ports, verifies all DNS answers, pins the connection to a verified address with connection reuse disabled, revalidates redirects, accepts bounded uncompressed UTF-8 text/HTML/XML and sends no application credentials. Limits: 20 seconds total per fetched URL, three redirects, 512,000 bytes, 40,000 extracted characters. Oversized selected text fails rather than truncates.
- Latest source context selects at most four actual URLs, prioritizing one per active source, without a REST row cap hiding older sources. Every selected input is snapshotted; omitted URLs and limited/inaccessible monitoring are explicit coverage gaps. Publication dates stay unknown unless provider evidence supports them.
- Ready/partial/failure notifications appear in Research → Briefings and link to the actual saved briefing, including older briefings beyond the normal ten-item view. Sources/prompts remain administrator-private; derived notifications follow workspace read access.
- Research produces no operational Ideas, calendar assignments, posts, newsletters, approvals or publication actions. Existing deliberate source selection, shared writing/QA and manual publication remain intact. Calendar batch drafting remains off.

## Migration and rollout

Migration: `supabase/migrations/20261009072944_research_automation.sql`, created with the Supabase CLI. Additive/rerunnable: five RLS tables, a protected source-snapshot column, three internal helpers and seven narrowly granted public RPCs. No legacy source or content is deleted.

1. Verify the target is `iphivwufbnmgbuqhicjn` / `linkedin-content-os`. Normally verify a recent backup and restore/recovery capability before applying schema, as required by `CONTRIBUTING.md`. Jawad explicitly waived this prerequisite for this P08 migration; the waiver does not change guidance for future migrations.
2. Apply the reviewed migration through the verified Supabase procedure/SQL editor. Railway does not apply SQL migrations as part of an application build. Never reset the project or remove old migrations to make this work.
3. Verify all five new tables have RLS enabled, no anon access or direct authenticated write grants exist, private schedules/sources/versions deny members and other accounts, and only service_role can call claim/renew/load/record/finish. Run security advisors and review findings against the new objects. Keep existing P07 target/functions/grants checks and deferred acceptance pending until actually verified.
4. Deploy the code with `RESEARCH_AUTOMATION_ENABLED` absent or `false` on both services. Older schema remains usable in this mode. The ignored local `.env.local` and `.env.example` use `false`.
5. Before activation, give the existing `rss-worker` its own `OPENROUTER_API_KEY`, `LLM_WEB_RESEARCH_PROVIDER=openrouter`, `LLM_WEB_RESEARCH_MODEL=anthropic/claude-haiku-5.5`. Retain its Supabase URL/service key and `npm run worker`. Keep Railway Serverless off for the timer-based worker. Do not rename/delete the service or add another scheduler.
6. Set `RESEARCH_AUTOMATION_ENABLED=true` on web and worker only after schema/configuration readiness. All account schedules still start off until an authorized admin deliberately saves an enabled schedule. RSS may be disabled independently. `RSS_COLLECTOR_BATCH_DELAY_MS` remains optional on the worker and defaults to zero; no Calendar flag is required for research.

Backup check and waiver, 2026-10-09: the signed-in production project's [Database Backups page](https://supabase.com/dashboard/project/iphivwufbnmgbuqhicjn/database/backups/scheduled) confirms Free Plan has no included project backups. Jawad answered "No / I'm not sure" about a downloaded copy, then explicitly instructed **"dont worry about the backup, just proceed"**. Codex applied the additive P08 SQL under that instruction after confirming target/prerequisites. No backup or restore was performed. Future backup work follows the official [Supabase backup instructions](https://supabase.com/docs/guides/platform/backups); this waiver applies to the current migration.

Production migration history is `20261009091101` / `research_automation`, applied by MCP from committed file `20261009072944_research_automation.sql`. The connector generated its own timestamp; preserve this mapping rather than assuming matching version strings or resetting history. All five tables have RLS, anonymous access is denied, authenticated direct writes are denied, and the two authenticated/five service-only public functions plus three private helpers have intended grants and fixed search paths. Protected source snapshot exists; Karachi 09:00 resolves to 04:00 UTC. Anonymous Data API schedule reads/background claims both fail with 401 / privilege code 42501.

Security advisors report two intended new [signed-in SECURITY DEFINER notices](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) for `save_research_schedule` and `manage_research_source`: these are deliberately exposed configuration RPCs with explicit scoped admin checks. No P08 anonymous execution or missing-RLS notice. Baseline notices remain for [mutable set_updated_at search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anonymous execution of three existing access helpers](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), other authenticated definers and [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Later security/acceptance review remains separate from this rollout.

### Railway variable changes

| Service | Variable | Action |
|---|---|---|
| Web + rss-worker | `RESEARCH_AUTOMATION_ENABLED` | Set to `true` after schema/configuration setup. Local/example defaults remain false. |
| rss-worker | `OPENROUTER_API_KEY` | Added reference `${{linkedin-content-os.OPENROUTER_API_KEY}}`; actual secret not read/copied/printed. |
| rss-worker | `LLM_WEB_RESEARCH_PROVIDER` | Added reference `${{linkedin-content-os.LLM_WEB_RESEARCH_PROVIDER}}`; uses the web service's selected provider. |
| rss-worker | `LLM_WEB_RESEARCH_MODEL` | Added reference `${{linkedin-content-os.LLM_WEB_RESEARCH_MODEL}}`; uses its selected model. |
| Both | App/Supabase settings | Keep existing correct values. Same intended database. |
| rss-worker | Existing RSS flags/interval/run-on-start | Keep intended values; RSS is optional and independent. |
| rss-worker | RSS classifier/synthesis pairs/key | Needed only when `RESEARCH_PIPELINE_FULL=true`; not required merely for collection. |
| Web | `CALENDAR_DRAFTING_ENABLED` | Keep absent/false; unrelated to P08. Individual post drafting remains available. |

## Validation and pending manual gates

Automated coverage includes migrations/rerun/RLS/grants, Karachi/DST times, catch-up, shared locking, leases, pause/revocation, retry cap and notifications, source changes/reversions/archive, exact source snapshots/coverage omissions, DNS/mixed answers/private redirects/connection pinning/type/encoding/size limits, and independent worker gates. Run the full suite with `npm test -- --maxWorkers=2` on this Windows host: unconstrained parallel PGlite instances plus a production build exhausted local resources and timed out setup. A limited-worker full run passed 36 files / 313 tests. The final source-owner SQL correction passed the focused 16-test suite again. Final lint (zero warnings), production build and diff review/check pass.

Plain Node worker module import/automation-off dispatch passes through the existing resolve hook without a Next.js request. No live paid provider call or authenticated UI acceptance is inferred from automated tests.

Connected read-only smoke verifies the authenticated Research page loads schedule/timezone/source/notification controls, with daily research visibly disabled. After-screen evidence is stored outside Git at `C:/Users/jawad/.codex/visualizations/2026/10/07/01a11701-80a2-7b13-92ec-5decf9ec6a1d/p08-research-controls.jpg`; saved prompt text is outside the captured viewport. This does not pass the full visual/workflow acceptance matrix.

Manual checks remain deferred by Jawad: a real scheduled run/notification; two replicas and manual collision; pause prevents the next run; one meaningful blog update; unsupported/inaccessible sources; administrator/member/cross-account workflow/direct routes; mobile/tablet/desktop/keyboard UI; source/date quality. Capture complete before/after screen evidence during that round. Keep P04/P05/P06/P07 acceptance gaps intact. Backup remains unverified under the explicit waiver; actual hidden key validity/model quality remain untested. Production schema/configuration was verified separately from Railway success.

## Rollback

Set the new flag false on both services to stop new P08 dispatch/UI/API work. Pause account schedules before disabling if possible. In-flight source/result commits still require a live lease and actor; do not count a global process restart as a refund for an already issued paid request. Retain additive schema and source history. If reverting application code, validate and deploy a new revert commit; do not reverse/drop this schema or force-push main.

## Documentation consulted

[Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security), [current Supabase changelog](https://supabase.com/changelog), and [Postgres 15.19/17.11 notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes). This slice does not introduce the custom operators, legacy PGP ciphers or ltree/btree_gist changes covered by that notice.
