# Remaining work plan (written 2026-10-12, after commit 5c25ce9)

Audience: whichever model executes this next (written so a smaller model such as Claude Haiku 5.5 can follow it), and Jawad as the reviewer.

Read first, in this order: `AGENTS.md`, `security-access.md`, `design.md`, `feature-checklist.md`, `CONTRIBUTING.md`, `docs/handoffs/CURRENT.md`, then this file. The visual and behavior spec is `ui-reference/Virel Phase 1 Wireframes.dc.html` (screen ids such as e1, 1g are quoted below) with the design system tokens in `ui-reference/_ds/`.

## 0. Rules for the executing model (apply to every task)

1. **One task at a time.** Finish it, verify it, report, then stop. Do not start the next task until Jawad says so.
2. **Show a short plan before changing code**, listing the files you will touch. Keep changes to what the task names.
3. **Verify before you say it works.** Run, in this order, and paste the real result: `npx tsc --noEmit`, `npx eslint src tests`, `npx vitest run`, `npx next build`. A task is not done while any of these fails. Never write "passed", "works" or "verified" for something you did not run. Manual browser testing is deferred to the end of the project by Jawad; write it into `docs/p10-release-validation.md` as a deferred check, never as done.
4. **Database:** only additive migrations, in a new file under `supabase/migrations/`. You cannot run SQL. Give Jawad the SQL as separate blocks (preflight, apply, verify, rollback) and test the migration with the PGlite tests (`tests/support/pg-harness.ts`). No `drop table`, no data deletes, no removing columns, no changing row-level security without asking. Follow the pattern in `docs/newsletter-plan-stage.md`.
5. **Do not commit or push** until Jawad says "commit and push". Stage only the files of the task. Leave these three alone: `docs/content-resource-framework-type.md`, `supabase/.temp/`, `ui-reference/Virel Phase 1 Wireframes.dc (1).html`.
6. **Stop and ask Jawad** (do not guess) when: a mockup and a wireframe disagree; a task needs a database change not listed here; a permission or access rule would change; a step would delete or hide data; the task needs an environment variable; something you must change is not in the task's file list.
7. **Update the docs of the task** in the same change: `docs/handoffs/CURRENT.md` (what changed, what was and was not verified), `design.md` if the UI rules changed.

### Practical gotchas learned on this project

- **Writing files:** use the Write or Edit tool for any text containing backslashes (`\n`, regular expressions). A shell heredoc silently turns `\n` into a real newline and breaks the file. If you use Python, put the script in a file written with the Write tool.
- **Line endings:** working files are mixed CRLF and LF and git stores LF. Edit with the Edit tool, or a script that keeps each file's existing endings.
- **Tailwind:** use only class names that exist in `src/app/globals.css` (type scale `text-small`, `text-body`, `text-caption`, `text-card-title`, `text-section-title`; colors such as `text-muted-foreground`, `text-near-black`, `text-link`, `border-border-subtle`, `bg-surface-sunken`). Unknown Material-style class names silently do nothing. Primary buttons use `variant="brand"` (cyan with dark text; never white text on cyan). Use `cn()` from `@/lib/utils`.
- **Components to reuse, not re-invent:** `PageHeader` (60px top bar with the one primary action), `ActionMenu`, `SegmentedNavigation`, `Badge`, `Button`, `Input`, `Textarea`, `EmptyState`. The best pattern examples are `src/features/content-bank/content-bank-panel.tsx` (list rows, row menu, Advanced details), `src/features/setup/settings-tabs.tsx` (tabs) and `src/features/newsletter/*.tsx` (four-screen flow).
- **Advanced:** "Advanced" is a `<details>` block at the foot of a page, one level deep, as in the Content Bank panel and the newsletter read screen.
- **Tests that run the real database code:** `tests/newsletter-plan-sql.test.ts` is the template. Prove a new test can fail (break the code, watch it fail, restore).
- **Server-only code** imports `server-only`; client components cannot import it. Server actions live in `actions.ts` files with `"use server"`.
- **AI calls:** every model call goes through `requestStructuredCompletion` in `src/lib/openrouter/client.ts`; model output limits must be lenient (cut, not reject), see `src/features/newsletter/lenient.ts`.

## Status update (2026-10-12, end of the batch session)

Done, uncommitted, all four checks green (538 tests): T1, T2, T3, T6, T7 (Haiku 5.5, reviewed); T4 (research findings to the Content Bank, Ideas page retired), T5 except the per-entry Calendar draft, the daily/weekly research schedule, wireframe capability names, Run now visible to members, and T8 (agency area and switcher removed; company scripts). Two database migrations are written and tested but **not applied**: `20261012210000_content_bank_research_finding_link.sql` and `20261012220000_research_weekly_schedule.sql`. Apply both (guides in `docs/content-bank-finding-link.md` and `docs/research-weekly-schedule.md`) before pushing. Still open: T5 Calendar "Draft now" (needs a backend decision), T9 cleanup, T10 newsletter tuning (needs a real edition), T11 manual acceptance. Jawad decided: no more phone work.

## 1. Where things stand

Done and deployed: navigation (six items), Add to Calendar and the calendar month view, Posts "Needs you" with exact-version review, reject frees the entry, the Avelune visual system, the 60px top bar, Content Bank rows with row menu and Advanced, Settings tabs, and the whole Newsletter module (plan, write and QA stages, three screens, LinkedIn-ready export; a live run of all three stages worked).

Standing decisions (Jawad): no workspace switching at all; the agency level and client selector are removed in the very last step; Add to Calendar needs Manage ideas or admin; keep legacy undated calendar slots in "Needs a date"; research findings go to the Content Bank as trend reactions first; a rejected post frees its single-use entry; an editor may approve their own version if they hold Review; all manual testing is deferred to the end.

## 2. Tasks

Suggested executor: **H** = suitable for a smaller model with review; **S** = give to the strongest model (database, access rules, AI flow, anything hard to undo).

### T1 Research screens, layout only (H)
Spec: wireframes e1, e2 and mockups 4d, 4e (Research: saved prompt and briefings; Briefing), state s5.
- Research page: one editable saved prompt, a schedule select and Save prompt, a primary **Run now** in the top bar, then a list of briefings (title, date, source count, Open). Empty state: "No briefings yet. Write a prompt, then run it now or on a schedule."
- Move source and feed management, run history and classification views under one **Advanced** block at the foot.
- Briefing page: note "Research does not create posts or approvals. Nothing here is used until you choose it." Findings each show their sources with dates. Remove the overall summary essay, tagging, save-all and relevance scores from the visible page.
- **Do not change behavior or data.** The existing per-finding actions stay as they are; the new "Save to Content Bank" button is T4.
- Files to start from: `src/app/client/[client_id]/research/page.tsx`, `src/features/research/research-tabs.tsx`, `src/features/research/web-research/research-workbench.tsx`, `src/features/research/research-runs/research-runs-panel.tsx`, `src/features/research/automation/automation-panel.tsx`.
- Done when: the four commands in section 0 pass, tests for any new pure helper exist, and the handoff lists what moved under Advanced.

### T2 Loading, empty, error and permission states (H)
Spec: wireframes 1g (s1 to s9), 1h permissions table.
- Loading: page title, tabs and nav render at once; only data rows are skeleton bars (`loading.tsx` per route). Decision buttons show disabled while loading.
- Empty states for Content Bank, Calendar, Research with the exact wording in s3, s4, s5 and one action.
- Error state for list loads: "Could not load entries. Nothing was changed." with Try again.
- Permission rule: a control that is the next step on a visible page is **disabled with a one-line reason** ("You cannot draft posts. Ask an account admin to add the Draft posts capability."); a whole area the person may not use is **hidden** (admin-only Delete, nav items without capability).
- Do not change who may do what; only how it is shown. If a gate is missing in code, report it, do not add it silently.

### T3 Breadcrumbs and "Advanced" links (H)
Spec: mockup headers ("Newsletter / November edition"), wireframe 1h "Hide behind Advanced".
- Breadcrumb in the 60px bar on detail pages: Posts review and edit, Newsletter edition screens, Research briefing. Extend `PageHeader` with an optional `breadcrumb` prop; keep the plain heading elsewhere.
- Advanced links: Posts (version history and compare, QA rule details), Calendar (per-slot reassignment, plan revision history) where those exist today. Do not build new features; only move existing ones under Advanced.

### T4 Research findings into the Content Bank; retire the Ideas page (S)
Spec: wireframes e2 and the confirmation frame after it, handoff decision "research findings are saved to Content Bank as a trend reaction first".
- Schema: trend reactions that do not come from a TrendCard need an additive migration (nullable link, new origin value). Provide preflight, apply, verify, rollback as separate SQL blocks and PGlite tests.
- "Save to Content Bank" on each finding (primary): creates a reusable, unused trend-reaction entry; confirmation "Finding 1 is now in Content Bank as a trend reaction. Reusable, unused." with **Create post** and **Add to Calendar**. No research-only draft path.
- Retire the Ideas page: redirect `/ideas` to the Content Bank, remove the "Open Ideas" menu item and every link to it (Content Bank row menu, research findings), keep the tables.
- Newsletter: remove the "Research briefings" group from the source picker once findings live in the Content Bank (`src/features/newsletter/queries.ts` `getNewsletterOptions`, `new-edition.tsx`). Existing editions keep working.
- Risk to check: calendar drafting and research still read ideas; list every reader before removing anything.

### T5 Create post flow and the drafting screen (S)
Spec: wireframes a2, a3, a4, states s7, s8, mockup 3f; handoff step 4. Needs the calendar drafting flag, currently off.
- Create post: source with Change link, reuse notice ("This entry is used up once the post is drafted. Reuse is turned off."), seven editable fields prefilled from the source (Topic, Instructions, Intended reader, Takeaway, Pillar, Post type, Funnel stage), primary **Draft post**. Removed: tone, length and hook pickers, template gallery, preview pane.
- Drafting screen with honest wording and a Retry draft button on failure (s7: "Drafting stopped while writing. Your source and fields are saved. The entry was not used."). Do not promise "you can leave and it will wait" until drafting is a background job.
- Calendar: "Draft now" and "Create post now" on reserved entries, behind the existing drafting flag.
- Permission: without Draft posts the button is disabled with the reason (s8).
- Keep backend behavior unchanged unless a wireframe says otherwise; list every proposed backend change first.

### T6 Settings: Team access restyle and Invite member (H, review by S)
Spec: mockup 5d (Settings: Team access). The tab exists (`src/features/setup/settings-tabs.tsx`, `src/features/access-management/team-management.tsx`).
- Restyle the list to rows with role badges and capabilities; the top bar gets **Invite member** (primary) that opens the existing invite form.
- No change to who can manage users or to any capability name.

### T7 Phone layouts (H)
Spec: mockups 4f (post review on a phone), 5c (calendar as a dated list), the drawer menu.
- Check every screen at 375 px width: Content Bank, Calendar, Posts, post review and edit, Newsletter (four screens), Research, Settings tabs. Fix overflow, tap targets (at least 38 px), sticky primary action where the mockup shows one.
- Headless Chrome will not go below about 500 px; say so in the report instead of claiming a phone check. Record the phone checks as deferred manual items.

### T8 Remove the agency level and client selector (S, last)
Spec: handoff decisions, wireframe 1h "Cut: Client selector and agency pages: one account per company".
- Remove the agency shell, agency pages, `/clients` selector, "Switch workspace" link, and make sign-in land on the person's one account. Open risk recorded earlier: removing the agency screens leaves no UI to create company accounts or agency users; decide with Jawad how those are created (direct SQL, a small admin page, or kept hidden) **before** deleting anything.
- Database tables and migrations stay. Anything that deletes or hides data needs Jawad's explicit approval.

### T9 Cleanup and checks (S for SQL and access, H for the rest)
- Remove dead code: old monthly-plan database functions' callers, `allocation.ts` and `parseCalendarSettings` remnants, user-facing "Founder Experience" wording (Ideas page copy goes with T4, the team-permission label `founder_experience_manage`, the post-review source label), superseded model variables (`OPENROUTER_MODEL`, `OPENROUTER_RESEARCH_MODEL`, `OPENAI_*`) only after Jawad confirms the Railway values.
- Run the deferred PUBLIC-privilege check and the Supabase advisors for the functions added since the last check; resolve the migration backup decision with Jawad.
- Rejected post: its calendar slot still shows Drafted; make it show the freed state.
- Decide with Jawad what to do with the duplicate `(1).html`, the externally edited `docs/content-resource-framework-type.md` and force-adding the small `_ds` token files.

### T10 Newsletter follow-ups (S)
- After Jawad runs a real edition: tune the three skill files and `app-rules.md` from what comes back (QA found a heading that stated the author's reasoning as fact, for example).
- Confirm in the live LinkedIn editor whether a rich paste keeps headings and lists; if not, make plain text the default copy.

### T11 Final round
- Write the manual acceptance script from the "deferred manual checks" in `docs/p10-release-validation.md`, run it with Jawad, fix what it finds, then close out the handoff and replace `ui-reference/screen-map.md`.

## 3. Suggested order

T1, T2, T3 (low risk, mostly layout, good for a smaller model) then T6 and T7; T4 then T5 (stronger model, they change data and the AI flow); T9 clean-up items that do not touch access; T10 once Jawad has run a real edition; T8 last; T11 to finish.

## 4. Review checklist for every task (Jawad or a stronger model)

- Did it touch only the files the task names? (`git status`, `git diff --stat`)
- Do the four commands pass, with real output pasted?
- Is anything described as verified that was not run?
- No new migration without the four SQL blocks and a database test; no data deleted.
- Permissions unchanged unless the task says so; hidden vs disabled follows the rule in T2.
- Colors and spacing use existing tokens; no new one-off hex colors.
- Docs updated; no commit made without the instruction.
