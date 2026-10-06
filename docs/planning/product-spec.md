# Product specification — Virel (Personal-brand Content OS)

Version: 2026-10-06. Status: approved direction for Virel with technical recommendations explicitly labelled. See IMPLEMENTATION-PLAN.md for rollout; none of the new phases is claimed as shipped.

## 1. Profiles

Keep one Account/Client Workspace and two manually maintained context profiles. This is not a second workspace or publishing destination. Preserve Account Team Access separately within Settings.

| Business profile | Fields |
|---|---|
| Overview | Business name; complete description of what the business does |
| Primary buyer ICP | Roles, industries, geography, seniority, company size, department where relevant |
| Audience understanding | What buyers care about, struggle with, value, and distrust |
| Pain points | Problem and consequences; optional frequency and urgency |
| Offer | Service/product, deliverables, delivery method, inclusions |
| Commercial details | Optional pricing, guarantees, exclusions |
| Delivery approach | Process or methodology; no required branded framework |
| Business positioning | Alternatives considered and differentiators |
| Questions and doubts | Common questions, reservations, or objections, optional |
| Supporting documents | Separate file uploads, including Markdown business briefs or PRDs |

No required current revenue, target revenue, or 90-day business goal. Proof is not mandatory onboarding; retain existing approved proof during migration and link it to evidence where appropriate.

| Personal-brand profile | Fields |
|---|---|
| Role and work | What the person personally does, builds, manages, or advises on |
| Expertise/personal positioning | Subjects to be associated with and why readers should follow this person |
| Readers | Intended personal readership and secondary readers; buyer ICP available but not forced |
| Pillars | Recurring subjects and boundaries; manually editable |
| Principles | Approved beliefs, approaches, and disagreements, optional |
| Voice | Preferences, phrases to use/avoid, externally prepared voice guide |
| Examples | Selected style-only examples, author/source where known |
| Boundaries | Private topics, client naming, sensitive results, personal disclosures |
| Business mentions | When mentioning the business or offer is appropriate |
| Supporting documents | Personal strategy and other reference files |

Forms are manual. Uploads neither autofill fields nor automatically extract a new persona. Explicit fields take precedence over supporting documents; there is no disagreement-flagging subsystem.

## 2. Content Bank

Categories: problem solved; client project/case study/win; experiment; lesson/mistake; original observation; process/walkthrough; achievement; lead magnet/resource. Lead-magnet subtypes include guide, checklist, template, framework, report, worksheet, tool, other.

Start capture with one free-form box. Offer category and optional links/files; AI can organize notes into an editable entry and ask focused follow-ups. Preserve raw notes. Results/metrics are optional and cannot be inferred. Initial delivery is text capture plus attachments; voice-note recording/transcription is an explicitly deferred enhancement, with pasted transcripts usable immediately.

Attachments have independent purposes: source material, private evidence, reader download. One may have multiple purposes only when deliberately set. A private report must never become a public download automatically. A download offer needs an approved delivery URL or honest manual delivery instructions. Using a checklist as teaching material does not require a download CTA.

Entry actions: Create post; Add to calendar; Use in newsletter. All resolve to the same source ID, content/evidence, and usage history. Supporting profile uploads remain in Profile, not disguised as experience entries.

### Reuse and usage

- `allow_reuse` defaults false. User permission is explicit.
- Marking reusable permits suggestions, not automatic selection or creation.
- New-angle reuse creates a separate assignment/idea. Redrafting an existing post is the same use.
- Readiness and usage are separate: draft/ready/archived plus derived reservation and usage status. A reusable entry can be used and still eligible.
- An unused entry is ready, available, unreserved, and has no retained successful assignment use. A failed generation does not consume it. A successful new draft commits a use; published status is recorded separately.
- Reservations are atomic across standalone, calendar, and newsletter assignment flows. Even reusable entries require a separate deliberate selection; retries must not duplicate a use.
- Cancelling an ungenerated assignment releases its reservation. Deleting an unpublished draft may explicitly release its assignment; never erase published usage merely by deleting an internal post.
- Historical entries with evidence of prior use are imported as used. Unknown use is marked unknown rather than assumed unused; user can enable reuse deliberately.
- Usage history shows assignment/output, channel, date, takeaway, and draft/published/cancelled status.

Recommended first-version behavior: one use of an entry within a given calendar unless the user explicitly selects another distinct angle. Publication in a newsletter also contributes to reuse eligibility/history.

## 3. Sources and standalone creation

Four calendar allocation buckets: experience/original observation; lead magnet/other asset; evergreen/profile-led; news/trend. Content Bank supplies the first two, but a file's storage location does not decide whether it is personal experience.

Standalone creation can begin from Content Bank, a research finding, business/personal context, or a fresh idea/upload. Multiple supporting sources are allowed. Each post has one primary allocation bucket and primary source reference; profile-led/new-idea posts use an explicit brief rather than a fabricated experience ID. A news item used merely as background does not automatically make a personal experience post news-led.

No mandatory trip through a separate Ideas screen. Reuse the internal idea/plan object to preserve one active post per idea and existing validation.

## 4. Monthly calendar settings

The user controls post count, source allocation, news maximum, pillar balance, funnel balance, dates, and account timezone. Allocation settings are not hardcoded to previously suggested percentages.

Two explicit save actions:

1. **Save for this month:** changes the selected month's settings only.
2. **Save as default:** changes defaults for newly created calendars only. To apply the same changes to the current month, show a separate explicit choice or use Save for this month as well. Do not silently mutate both scopes.

New calendars copy defaults into a versioned month snapshot. Later default changes do not modify existing months. Show whether a month matches defaults and provide an explicit reset-to-current-defaults action. Editing settings does not silently rewrite existing drafts or published posts; show a replan preview for eligible slots.

### Allocation contract

- Nonnegative shares sum to 100%; post count is a positive integer within a configured practical limit.
- Integer counts use deterministic largest-remainder rounding with documented stable tie order: experience, asset, evergreen, news. Enforce news count at or below the floor of `post_count × news_cap / 100`.
- If requested news share exceeds the configured news cap, require the user to resolve the conflicting settings before saving. News allocation is a maximum, not an obligation. At planning time, show news placeholders until the user chooses timely material.
- Count eligible entries in SQL/application inventory, then rank relevant candidates. Semantic search is not inventory counting.
- Show candidate entries and let the user select. If fewer are selected or available than the target, fill the shortage with evergreen ideas unless the user changes the plan. Show requested versus actual counts and the reason.
- Example: a user selects 40/10/40/10 for 30 posts: 12/3/12/3. With only eight eligible experience entries selected, the proposed actual mix is 8/3/16/3. These numbers are an example, not product defaults.
- Persist reservations only when selections are committed. Cancellation releases them. Resizing or replanning affects uncommitted slots via a preview; no rewriting published content.
- Batch generation is a user-triggered resumable job. Persist success per slot and retry failures only. No all-or-nothing 30-post prompt or silent duplicate drafts.
- Calendar count includes assigned monthly posts, not newsletter editions. Standalone posts enter monthly allocation only when explicitly added to that calendar; unassigned posts remain visible in account history.

## 5. Post decisions and frontend

| Location | Controls |
|---|---|
| Main editor | Sources, topic/instructions, pillar, post type, funnel stage |
| Brief | Intended reader, main takeaway, approved perspective when supplied |
| Expandable writing options | Length/depth, tone adjustment, CTA, business mention; format preference only when output is supported |
| Evidence | Source entries, excerpts/files, links, claims and confidentiality |
| Draft actions | Edit, revise hook/body/ending, QA, review, approve/reject |
| Calendar/manual publishing | Date/time, placement, copy/export, mark published |

AI-controlled fields default Auto but show the chosen value and allow override. Sources/evidence remain inspectable. The eight post types are story/lesson; case study; tutorial/walkthrough; explainer; opinion/analysis; comparison/decision guide; checklist/curated list; resource offer.

One funnel stage: Discovery (awareness), Depth (understanding), Authority (trust/evidence), Commercial (capability/offer connection). Keep hook categories, body frameworks, narrative arcs, and claim-boundary internals out of the main form. Retain underlying writing quality rules.

Text is the implemented output at baseline. Image-supported/document format metadata must not masquerade as asset generation. No carousel/image/video generation is introduced by this plan.

Approval is tied to the exact output version. Editing text, selected evidence, or the operative brief requires new QA/review before approval. Publication records retain the approved version actually published.

## 6. Supporting documents and context

Support UTF-8 `.md` and `.txt` first, with a documented size limit and safe preview. Additional PDF/DOCX parsing is a later format extension, not a hidden launch dependency. Save original content, version, owner account, document purpose, processing state, and links to the relevant profile/entry.

Model input consists of essential profile context, explicit selected evidence, stage-specific playbook instructions, and relevant retrieved excerpts. Long files are indexed/searchable; selected entries are loaded by ID. The amount of text actually supplied determines context usage, not the `.md` extension.

Track input tokens and retrieval completeness. Do not impose a fixed 800–1,200-word cutoff. Preserve confidentiality, positioning distinctions, user-approved opinions, and all facts necessary for the selected claim. Expand retrieval or ask a focused question if needed. Do not silently continue a source-dependent draft when indexing/retrieval failed.

Recommended adapter: scoped hosted semantic/keyword retrieval over versioned files, with a retrieval result contract that any existing writer can consume. Keep original storage and ownership in the application. This reproduces the useful source-file workflow, not an undocumented copy of ChatGPT Projects internals.

## 7. Research

Frontend settings: editable prompt, save, run saved prompt now, enabled/paused, frequency/time/timezone, lookback, optional monitored URLs, optional keywords that help author the prompt, and use-profile-context toggle initially off. With unsaved changes, offer Save and run or Run saved prompt; never run unspecified text.

Initial prompt, verbatim:

> Deliver a concise, high-signal daily briefing for a digital marketing agency. Research the past week and cover only consequential changes or tactics: Meta and Google Ads platform/policy/measurement updates; GoHighLevel releases, best practices; Google Business Profile, local SEO, AI Overviews/local search, reviews and Maps; CRO and lead-conversion best practices; CRM, AI agents, AI Chatbots and calling agents, call/chat/SMS automation; and other material digital-marketing developments. For each item include what changed, why it matters for local-service clients, and a specific agency action. Prioritize primary sources and include direct source links. Clearly separate confirmed platform changes from informed trend analysis. Skip minor news and generic advice.

Each run snapshots its saved prompt/configuration. Search topics specified by that prompt without a hidden buyer filter. Collect candidates within declared search/time/cost budgets; prioritize primary sources; record publication, announcement, effective, and fetched dates separately. Unknown dates remain unknown. Group related reports into one development and distinguish meaningful updates from repeated coverage.

Findings include source links, what changed, why it matters under the prompt, action/angle, confidence/uncertainty, novelty, consequence, and relevance. Retain discovered candidates, rank them, and expose coverage gaps; do not claim exhaustive internet coverage. Distinguish success with no findings, partial completion, failure, and provider not configured.

Human multi-selection offers Create separate posts or Add to newsletter; combining findings into one post is explicit. Preserve authorized review of research sources before downstream use. Briefing angle suggestions are not automatically persisted operational Ideas.

Read this article imports one URL. Monitor this blog periodically checks a source index/sitemap (RSS may remain an internal adapter). Preserve existing RSS history while moving the primary UX to prompt-based research. Do not drop old sources or run duplicate schedulers.

Run scheduling uses saved timezone and durable due times. Shared account-scoped run guard covers manual and scheduled runs, with retry/backoff, lease expiry/recovery, a budget cap, and idempotent outcomes. In-app notifications are the first notification channel; email/push is not assumed available.

## 8. Newsletter

A separate weekly edition plan can combine research, experience, case studies, lead magnets, and supplied commentary. Select items, group them, approve an outline, draft, check facts/links/repetition/voice, review, then copy/export for manual publication. There is no required number of news items. Missing personal interpretation is not invented.

Track edition versions, evidence, approvals, publication reference/date, and Content Bank usage. Newsletter selections do not consume monthly post allocation. Native LinkedIn newsletter publishing is deferred until a supported integration is verified.

## 9. Decisions not yet fixed

Technical recommendations in this package: hosted retrieval provider, narrow web-search adapter, JSONB versus typed profile columns, and relational structure of new records. Validate these in P00 using current migrations, budget, and provider access; do not present them as already implemented.

Deferred: native audio capture, built-in writing-profile scraping, automated newsletter publishing, automatic LinkedIn post publication/analytics, visual generation, and broad analytics learning loops. Manual style analysis can happen now and is not a dependency on implementation.
