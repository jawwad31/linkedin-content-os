# CONTRIBUTING.md — Development and handoff workflow

Read AGENTS.md, security-access.md, design.md, feature-checklist.md, and CONTRIBUTING.md in that order. Work only on the assigned phase. Documentation is an implementation contract, not evidence that work has shipped.

## Before work

Ensure no other tool is editing this checkout, then run:

```bash
git checkout main
git pull --ff-only origin main
git status
```

Inspect existing changes. Do not discard, overwrite, or stage another tool's unfinished work. If unrelated changes exist, establish ownership before editing their files. A same-folder model switch needs no Git operation just to switch; the next agent reads the handoff and current diff. Before changing devices/copies, commit and push completed work, then pull on the other copy.

## Validate and review

```bash
npm run lint
npm run build
git diff --check
git status --short
git diff --stat
git diff
```

Run focused tests for the behavior at risk. Auth, RLS, migration, reservation, reuse, retry, and approval changes need meaningful failure-path coverage. Do not add tests that merely restate presentation markup. Do not mark blocked checks as passed or commit when lint/build fails.

## Commit and push

Replace placeholders with reviewed files and the phase's focused message:

```bash
git add <changed-files>
git commit -m "<focused commit message>"
git push origin main
```

One focused commit per coherent change. A phase may require multiple deployable slices. No feature branch or PR unless requested. Never force-push or amend a pushed commit. Prefer `git revert <commit>` for application rollback, with validation before pushing the revert. Record the pre-change commit for risky work; do not create a branch contrary to this workflow.

## Migrations and deployment

Use additive, backward-compatible migrations and idempotent backfills. Review RLS and dependency effects. Verify backup/recovery capability before a production data migration. Do not reset, drop, truncate, or destructively transform a database without explicit authorization. Existing administrator delete UI is not authorization for a migration to destroy records.

Apply schema changes through the repository's verified deployment procedure; do not assume Railway applies them automatically. Keep old web/worker versions compatible during rollout. Reverting app code does not reverse a database migration: retain additive schema and use a forward fix unless a separately approved safe rollback exists.

Every main push may trigger production deployment. Check actual deployment results for affected web/worker services and perform the phase's manual post-deploy checks. Record unavailable access as a blocker. Feature flags must default off until dependencies and checks are ready.

## Cross-tool handoff

Update `docs/handoffs/CURRENT.md` before handing off. Include phase, active editor, baseline/current commit, exact files, completed work, remaining task, migrations, environment-variable names only, validation evidence, deployment state, and next command. Never include secrets or customer content.

Any tool can implement or review a phase; avoid switching mid-migration or while another process is editing. A reviewer uses the same canonical documents. Separate model-specific rule copies are prohibited.

## Completion report

- Files changed
- What changed
- Behavior preserved
- Validation results
- Manual tests completed
- Commit hash and push result
- Deployment status
- Remaining blockers
