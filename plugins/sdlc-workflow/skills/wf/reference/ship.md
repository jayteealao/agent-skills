---
description: Run a release using the project's `.ai/ship-plan.md`. Reads the plan, generates a run-id, and walks the 13-step idempotent ship sequence (pre-flight → publish dry-run → rollout → freshness delta → go/no-go → merge → tag → workflow watch → post-publish poll → post-release bump → index update → write run artifact). Replayable: re-running after a partial failure resumes at the failed step. Refuses to start when `08-handoff.md` `readiness-verdict ≠ ready`.
argument-hint: <slug> [environment] [--init-plan]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`, `.ai/ship-plan.md`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-ship`, **stage 9 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → `9·ship` → 10·retro

| | Detail |
|---|---|
| Requires | `.ai/ship-plan.md` (project-level — author via `/wf-meta init-ship-plan` once per project) AND `08-handoff.md` with `readiness-verdict: ready` |
| Conditional inputs (mandatory when present) | `augmentations:` list in `00-index.md` — every entry MUST get a changelog entry (translated to user language). The release notes are incomplete if any augmentation is omitted. Prior `09-ship-run-*.md` with `status: awaiting-input` — must offer to resume rather than start fresh. |
| Produces | `09-ship-run-<run-id>.md` (per release) + refreshed `09-ship-runs.md` (per-workflow index). Legacy `09-ship.md` is read-only; never written by this version. |
| Next | `/wf retro <slug>` (if go) or `/wf implement <slug> <slice>` (if blockers) |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT fix code — if blockers require code changes, recommend returning to `/wf implement <slug> <slice>`.
- Do NOT modify `.ai/ship-plan.md` — to edit the plan, run `/wf-meta amend ship-plan`. The plan is the contract; runs follow it.
- Your job: **read the plan, generate or resume a run, execute the 13 idempotent steps, write the run artifact**.
- Each step in the run sequence is independently re-runnable. Re-running step N when N already completed is a **no-op + note**, not a duplicate side-effect. This is the load-bearing property of the run split.
- Follow the numbered steps below exactly in order. Do not skip, reorder, or combine steps.

# Step 0 — Orient (MANDATORY)

1. **Resolve the slug** from `$ARGUMENTS` (first positional). If missing, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Detect `--init-plan` flag.** If present in `$ARGUMENTS`, this invocation is a redirect — print:
   ```
   The plan-author flow is `/wf-meta init-ship-plan`, not `/wf ship --init-plan`.
   Run: /wf-meta init-ship-plan [--from-template <kind>]
   ```
   STOP.
3. **Resolve environment** (optional second positional). If passed (e.g., `staging`, `production`), it overrides the plan's default. Otherwise use the first environment in `ship-plan.ship-environments[]`.
4. **Read `.ai/ship-plan.md`.** If missing, STOP:
   ```
   No ship plan found at .ai/ship-plan.md.
   Run: /wf-meta init-ship-plan [--from-template <kind>]
   ```
   Parse all blocks (A–G) into in-memory state.
5. **Read `00-index.md`** for the workflow — parse `current-stage`, `status`, `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`, `augmentations:`.
6. **Read `08-handoff.md`** — parse `readiness-verdict`. If missing or `≠ ready`, STOP:
   ```
   Handoff readiness-verdict is "<verdict>". Ship requires "ready".
   Run: /wf handoff <slug>   # to refresh the readiness block
   ```
   Also parse `pr-url`, `pr-number`, `branch`, `base-branch`, `has-deferred-comments`. If `has-deferred-comments: true`, WARN before continuing.
6.5. **Runtime-evidence deferral gate (HARD BLOCK — added per RUNTIME-PROBE-PLAN.md §2.4).** Parse `runtime-evidence-deferrals` from `00-index.md` (this field may be absent on older workflows — treat absent as empty). For every entry whose `cleared-by: null`, the slug has an open runtime-evidence deferral that must be cleared before ship.

   If any entry has `cleared-by: null`, STOP with:
   ```
   Ship is blocked: <N> open runtime-evidence deferral(s).
   The following slices passed verify only because runtime evidence was deferred; ship requires evidence:
     - <slice-slug>: <reason>  (deferred-at: <iso>)
     - ...
   Clear each deferral by either:
     (a) running `/wf-quick probe <slug> <target-matching-the-deferred-AC>` to capture evidence, then re-running verify, OR
     (b) re-running `/wf verify <slug> <slice-slug>` in an environment that supports the interactive checks for that slice.
   ```
   Cleared deferrals (entries whose `cleared-by` is non-null — typically a probe descriptor) do not block ship; they are kept in the index for audit. The block bites only on `cleared-by: null` entries.

   This gate is the hard-block half of the deferral mechanism. Earlier stages (verify, review, handoff) surface deferrals as soft warnings; ship is where the block fires.
7. **Read every `07-review-*.md` and `po-answers.md`** for changelog/release-notes context.
8. **Resume detection.** Glob `.ai/workflows/<slug>/09-ship-run-*.md`. For any with `status: awaiting-input`:
   ```yaml
   question: "A prior ship run is paused. Resume it, or start fresh?"
   header: "Prior run"
   options:
     - { label: "Resume <run-id> (Recommended)", description: "Continue from the failed step." }
     - { label: "Start fresh",                   description: "Generate a new run-id; the prior run stays paused." }
     - { label: "Mark prior as failed and start fresh", description: "Set the prior run status: failed." }
   multiSelect: false
   ```
   If **resume**: load that run's frontmatter into in-memory state and skip to the first step whose evidence field is empty.
   If **start fresh**: leave the prior run untouched (or set `failed`); generate a new `run-id`.
9. **Generate `run-id`** (UTC compact ISO-8601): `date -u +"%Y%m%dT%H%MZ"`. Use as the filename suffix and the `run-id` field.
10. **Carry forward** `open-questions` from the index.

# Workflow rules
- Store run artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Maintain `09-ship-runs.md` as the lightweight per-workflow run index. Never leave the canonical result only in chat — write the stage file first.
- **The ship plan lives at `.ai/ship-plan.md` (repo root), NOT under `.ai/workflows/`.** This file is project-scoped, shared across workflows.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at`, `updated-at`, and `observed-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash. Never guess or use `T00:00:00Z`.
- If a step cannot finish, set `status: awaiting-input` in the run frontmatter, record what's blocking in the relevant section, and STOP. The next invocation resumes from there.
- Append every PO answer to `po-answers.md` with timestamp and stage.
- Reuse earlier workflow files. Do not silently broaden scope.
- **Conditional inputs are mandatory when present.** If the workflow has `augmentations:`, every entry MUST get a changelog line.
- **Idempotency invariants per step.** Pre-flight is a no-op if the version is already applied. Merge is a no-op if the PR is merged. Tag is a no-op if the tag exists. Polling is stateful and resumes from the last `pending` check.
- **Backwards compatibility.** If a legacy `09-ship.md` exists from a prior workflow, do not write to it. Read for context only. New shape uses `09-ship-run-<run-id>.md` plus `09-ship-runs.md`.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `run-id: <run-id>`
- `wrote: <path>`
- `status: <complete | awaiting-input | failed | rolled-back>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

---

# The 13-step run sequence

Each step is independently re-runnable. Detect the already-done state before performing the side-effect.

## Step 1 — Pre-flight (idempotent)

Mark the corresponding task `in_progress`.

1.1 **Branch + tree state.** Confirm you are on `<branch>`. `git status --porcelain` must be empty. If dirty, STOP — ask the user to commit/stash. Record `branch`, `head-sha-at-start: <git rev-parse HEAD>`.

1.2 **Determine version.** Per `plan.version-bump-rule`:
   - `git-cliff` → run `plan.version-bump-cmd` (default: `git cliff --bumped-version`).
   - `conventional-commits` → use the project's bump tooling (`npx changeset version`, `npm version`, etc. — captured in `plan.version-bump-cmd`).
   - `manual` → AskUserQuestion with three suggested bumps based on commit log: patch, minor, major.
   - `fixed` → use the literal version from the plan.
   Confirm the proposed version with the user before applying. Record `version` and `prior-version: <git describe --tags --abbrev=0 || echo "none">`.

1.3 **Apply version to every `version-source-of-truth` file.** Idempotency check: read each file first. If the literal already equals `version`, skip the write for that file. After writing, if any diff exists, run a single commit: `git commit -am "build: bump version to <version>"`.

1.4 **Verify required secrets.** For each `plan.required-secrets[]`:
   - Confirm the secret exists: `gh secret list | grep -q "^<NAME>\b"`
   - Get the last-updated date: `gh secret list --json name,updatedAt | jq -r '.[] | select(.name=="<NAME>") | .updatedAt'`
   - If `(now - updatedAt).days > plan.secrets-staleness-threshold-days`, WARN. The user can proceed but the warning is recorded in the run.

1.5 **Regenerate changelog** per `plan.version-bump-rule`. For `git-cliff`: `git cliff --output CHANGELOG.md`. Diff-check: if the changelog already includes `<version>`, skip the regen. Otherwise commit: `git commit -am "docs: update changelog for <version>"`.

Mark the task `completed`. Record `pre-flight-status: pass` (or `pre-flight-status: warn` with reasons if any secret was stale).

## Step 2 — Publish dry-run (mandatory if `plan.publish-dry-run-cmd` is set)

If the plan has no `publish-dry-run-cmd`, set `publish-dry-run-passed: skipped` and skip to step 3.

Idempotency: re-running step 2 is always safe — dry-runs do not produce side effects.

2.1 Execute `plan.publish-dry-run-cmd`. Capture stdout + stderr.

2.2 Verify artifact post-conditions per `ship-meaning`:
   - `publish` (Maven Central / Sonatype) → confirm POM has groupId, artifactId, version, name, description, url, licenses, developers, scm. Confirm `.asc` signature files exist.
   - `publish` (npm) → confirm `package.json` has `name`, `version`, `repository`, `license`. Run `npm pkg fix --dry-run` to detect manifest issues.
   - `publish` (pypi) → confirm `twine check dist/*` passes.
   - `publish` (container-image) → confirm `docker manifest inspect` returns a multi-arch list when expected.
   - `merge-only` / `deploy-*` → no manifest check; verify the build command succeeded.

2.3 Record `publish-dry-run-passed: true` (or `false` with the failing post-condition + STOP — set `status: awaiting-input`).

## Step 3 — Rollout questions (per-run only, never re-asked)

Idempotency: if `go-nogo`, `rollout-strategy`, and `merge-strategy` are already set in the run state, skip step 3.

3.1 **Confirm rollout-strategy.** Default is `plan.rollout-strategy`. AskUserQuestion (single-select):
   ```
   Question: "Confirm rollout strategy for this release?"
   Header: "Rollout"
   Options: built from plan + an "Override" choice; the user can pick the plan default or deviate.
   ```

3.2 **Confirm release window** (freeform): when does this go out? blackout windows, on-call coverage.

3.3 **Stakeholder/compliance overrides for this run** (freeform): does this release require sign-off from anyone the plan doesn't already list?

Append all answers to `po-answers.md` with `stage: ship` and the `run-id`.

## Step 4 — Freshness pass — DELTA only

Idempotency: re-running step 4 is safe (read-only research).

4.1 Find the last successful run for this workflow: glob `09-ship-run-*.md`, filter `status: complete`, sort by `created-at`, pick the most recent. Read its `## Freshness Research` section.

4.2 Diff the *delta* — what platforms, dependencies, or CI changes occurred since that run? Re-run web-research sub-agents only for areas that changed:
   - **Platform health** sub-agent: only if there's been a deployment-target change OR > 30 days since the last run.
   - **Dependency security** sub-agent: only if `package.json`, `pyproject.toml`, `Cargo.toml`, or equivalent has changed since the last run's `head-sha-at-start`.
   - **CI/CD config** sub-agent: only if `.github/workflows/*.yml` or related CI files changed since the last run.

4.3 If no prior successful run exists, run the **full** freshness pass (the same 3-sub-agent fan-out as today's ship). Merge findings into `## Freshness Research`.

## Step 5 — Go/No-Go

Idempotency: if `go-nogo` is already set, skip.

```yaml
question: "Based on readiness, dry-run, and freshness, what is the go/no-go decision?"
header: "Go/No-Go"
options:
  - { label: "Go",              description: "Proceed with merge and deployment. All checks pass." }
  - { label: "Conditional go",  description: "Proceed with caveats — record the caveats below." }
  - { label: "No-go",           description: "Do not merge. Return to fix blockers." }
multiSelect: false
```

If `no-go`: set run `status: complete` with `go-nogo: no-go`; skip steps 6–10. Write the run artifact (step 13). The PR stays open.

## Step 6 — Merge (if `plan.ship-meaning` includes merging AND go-nogo ≠ no-go)

Skip this step entirely when `branch-strategy ≠ dedicated`.

Idempotency check: `gh pr view <pr-number> --json state,mergeCommit,merged` — if `merged: true`, set `merge-sha: <mergeCommit.oid>` and skip to step 7.

6.1 Confirm with user: *"Ready to merge `<branch>` into `<base-branch>` using `<merge-strategy>` strategy. Proceed? (yes/no)"*

6.2 Per `merge-strategy`:
   - `rebase` → `gh pr merge <pr-number> --rebase`
   - `squash` → `gh pr merge <pr-number> --squash`
   - `merge` → `gh pr merge <pr-number> --merge`

6.3 Record `merge-sha: <git rev-parse HEAD on base-branch after merge>` and `merge-strategy: <strategy>`.

## Step 7 — Tag + release (if `plan.release-trigger == tag-on-main` AND `ship-meaning != merge-only`)

Skip when the plan's release-trigger is not `tag-on-main`.

Idempotency check: `git rev-parse "v<version>" 2>/dev/null` — if the tag exists, skip to step 8 with `release-tag: v<version>`.

7.1 Generate release notes: `git cliff --latest --strip header > /tmp/release-notes-<run-id>.md` (or whatever the project's notes generator is — captured in plan if non-default).

7.2 `gh release create v<version> --target <base-branch> --notes-file /tmp/release-notes-<run-id>.md`.

7.3 Record `release-tag: v<version>`.

## Step 8 — Release workflow watch (if `plan.release-workflow-file` is set)

Skip when no release workflow file is set in the plan.

Idempotency: if `release-workflow-conclusion: success` already, skip.

8.1 Locate the workflow run: `gh run list --workflow=<plan.release-workflow-file> --branch=<base-branch> --limit 5 --json databaseId,event,headSha,status,conclusion`. Filter to the run whose `headSha` matches `merge-sha` (or the tag's commit for tag-triggered).

8.2 Watch: `gh run watch <run-id>`.

8.3 Record `release-workflow-run-id: <id>`, `release-workflow-conclusion: <success | failure | cancelled>`.

8.4 **On failure:** match the failure log against `plan.recovery-playbooks[].triggers[]` (regex match, case-insensitive). For matched playbooks, present each step via AskUserQuestion (`Apply this step?` per step). Record `recovery-actions-taken: [<playbook-id>, ...]`. Allow re-running step 8 after recovery.

If no playbook matches: WARN and ask whether to abort or proceed manually.

## Step 9 — Post-publish polling loop

Skip when `plan.post-publish-checks` is empty.

Idempotency: each check has its own `status` (`pass | fail | pending`). Resume from the last `pending` check. Do not re-poll a check whose status is already `pass` or `fail`.

9.1 For each `plan.post-publish-checks[]` whose run-state is not yet `pass`:
   - Substitute environment variables (`$VERSION`, `$PACKAGE`, `$IMAGE`, `$GROUP`, `$ARTIFACT`, `$NAMESPACE`, `$DEPLOYMENT`, `$HOST`, etc.) from the run state.
   - Execute `cmd`. Compare against `expect`.
   - Record `{ kind, status, observed-at, evidence }` in the run.

9.2 Loop with `plan.poll-interval-seconds` between iterations. Bound by `plan.propagation-window-max-minutes`.

9.3 Outcomes:
   - All checks `pass` → set step 9 done.
   - Bound exceeded → set run `status: awaiting-input` with the still-pending checks listed; stop. The next ship invocation can resume polling from where it left off.

## Step 10 — Post-release version bump (if `plan.post-release-version != none`)

Idempotency: read each `version-source-of-truth` file — if already at the post-release version, skip.

10.1 Compute next dev version per `plan.post-release-version-cmd`.

10.2 Apply to every `version-source-of-truth` file. Commit: `git commit -am "build: bump to <next-dev-version>"`.

10.3 Push: `git push origin <base-branch>`. Record `post-release-bump-sha: <git rev-parse HEAD>`.

## Step 11 — Update `09-ship-runs.md` index

Append (or update the entry for) this run. Refresh the run table from frontmatter — the body is regenerated, the frontmatter is the source of truth.

```yaml
---
schema: sdlc/v1
type: ship-runs-index
slug: <slug>
runs:
  - { run-id: <run-id>, version: <version>, environment: <env>, status: <status>, go-nogo: <go|conditional-go|no-go>, notes: "<short>" }
  - ...
---
# Ship Runs

| Run | Version | Env | Status | Go/No-Go | Notes |
|---|---|---|---|---|---|
| ... |
```

## Step 12 — Adaptive routing

Evaluate what's actually next (see `## Adaptive routing` below) and write ALL viable options into the run artifact's `## Recommended Next Stage` section.

Update `00-index.md` accordingly: `current-stage`, `recommended-next-command`, `recommended-next-invocation`.

## Step 13 — Write `09-ship-run-<run-id>.md`

See the `## Run artifact schema` section below.

---

# Run artifact schema

```yaml
---
schema: sdlc/v1
type: ship-run
slug: <slug>
run-id: "<YYYYMMDDTHHMMZ>"
status: <complete | awaiting-input | failed | rolled-back>
plan-ref: ../../ship-plan.md
plan-version-at-run: <integer copied from plan at run-start>
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"

# Per-run inputs
environment: <env name>
version: "<chosen version>"
prior-version: "<last release tag, or 'none'>"
go-nogo: <go | conditional-go | no-go>
merge-strategy: <rebase | squash | merge | none>

# Per-run evidence (set as steps complete; absent fields = not yet run)
head-sha-at-start: "<sha>"
pre-flight-status: <pass | warn | fail>
publish-dry-run-passed: <true | false | skipped>
merge-sha: "<sha or empty>"
release-tag: "<vX.Y.Z or empty>"
release-workflow-run-id: "<gh run id or empty>"
release-workflow-conclusion: <success | failure | cancelled | empty>
post-publish-checks:
  - { kind: <kind>, status: <pass|fail|pending>, observed-at: "<iso>", evidence: "<short>" }
post-release-bump-sha: "<sha or empty>"

# Per-run outcomes
recovery-actions-taken: [<playbook-id>, ...]
rolled-back: <true | false>
rollback-sha: "<sha or empty>"
rollback-reason: ""
announcements-sent: [<channel>, ...]

tags: []
refs:
  index: 00-index.md
  handoff: 08-handoff.md
  plan: ../../ship-plan.md
  reviews: [07-review-<slice-1>.md, ...]
next-command: wf-retro
next-invocation: "/wf retro <slug>"
---

# Ship Run — <slug> @ <version> @ <environment>

## Pre-flight
- branch + tree clean
- version chosen: <version> (prior: <prior-version>)
- source-of-truth files updated: <list>
- secrets verified: <list with staleness flags>
- changelog regenerated: <yes/no, commit sha>

## Publish dry-run
- command: <plan.publish-dry-run-cmd>
- result: <pass / fail with detail>
- post-conditions: <list of checks ran + outcomes>

## Rollout decision
- strategy: <strategy>
- release window: <window>
- stakeholders: <list>
- caveats: <list>

## Freshness research delta
- platforms checked: <list>
- new advisories since <prior run-id>: <list>
- CI/CD changes since <prior run-id>: <list>

## Go / No-Go
- decision: <go | conditional-go | no-go>
- rationale: <one paragraph>

## Merge
- pr-number: <N>
- merge-strategy: <strategy>
- merge-sha: <sha>

## Tag + release
- tag: v<version>
- release URL: <url>
- notes source: git cliff --latest

## Release workflow watch
- workflow file: <plan.release-workflow-file>
- run id: <id>
- conclusion: <success | failure | cancelled>
- jobs: <list with conclusions>

## Post-publish polling
- checks (each with kind, status, observed-at, evidence)
- propagation window: <X minutes elapsed of <max>>

## Post-release version bump
- next dev version: <version>
- commit sha: <sha>

## Recovery actions taken
- <playbook-id>: <steps confirmed by user>

## Announcements
- channels notified: <list>

## Recommended Next Stage
- **Option A (default):** `/wf retro <slug>` — Go [reason]
- **Option B:** `/wf implement <slug> <slice>` — fix blockers or resolve rebase conflicts [reason, if applicable]
- **Option C:** `/wf verify <slug> <slice>` — re-verify if evidence was stale [reason, if applicable]
- **Option D:** `/wf ship <slug>` — resume paused run [reason, if applicable]
```

---

# Run-index file (`09-ship-runs.md`) — append/refresh on every run

```yaml
---
schema: sdlc/v1
type: ship-runs-index
slug: <slug>
updated-at: "<iso>"
runs:
  - { run-id: <id>, version: <ver>, environment: <env>, status: <status>, go-nogo: <decision>, notes: "<≤80 chars>" }
---

# Ship Runs

| Run | Version | Env | Status | Go/No-Go | Notes |
|---|---|---|---|---|---|
| <id> | <ver> | <env> | <status> | <decision> | <notes> |
```

The body table is regenerated from frontmatter on every run — frontmatter is the source of truth. Cheap; the body is short.

---

# Adaptive routing — evaluate what's actually next

After completing this run, evaluate the outcome and present the user with ALL viable options:

**Option A (default): Retro** → `/wf retro <slug>`
Use when: status is `complete` and `go-nogo` is `go` or `conditional-go`. The release is out.

**Option B: Fix and re-implement** → `/wf implement <slug> <selected-slice>`
Use when: ship found blockers requiring code changes, OR rebase had conflicts, OR a recovery playbook required code-side fixes (e.g., revert a bad migration).

**Option C: Re-verify** → `/wf verify <slug> <selected-slice>`
Use when: ship found verification evidence was stale (freshness research delta surfaced new CVEs the verify stage didn't see).

**Option D: Resume paused run** → `/wf ship <slug>`
Use when: `status: awaiting-input` — required answers missing, post-publish poll bound exceeded, or a recovery playbook was started but not completed.

**Option E: Roll back** → manual + `/wf-meta amend ship-plan` (if the rollback-mechanism needs codifying)
Use when: post-publish checks failed and the plan's `rollback-mechanism` was triggered. Set `rolled-back: true`, `rollback-sha`, `rollback-reason` in the run artifact.

Write ALL viable options into `## Recommended Next Stage` so the user can choose.

---

# Backwards compatibility

- Workflows with an existing legacy `09-ship.md` keep working. **Reading it is fine; writing it is gone.** This version of `wf-ship` never writes `09-ship.md` — only `09-ship-run-<run-id>.md` and `09-ship-runs.md`.
- `/wf-meta status` and `/wf-meta resume` should treat both shapes as valid:
  - If `09-ship-runs.md` exists → use the new shape.
  - Else if `09-ship.md` exists → read it for context, but propose authoring a plan + running a fresh run.
- The legacy `09-ship.md` artifact never had a `plan-ref` or `run-id`. If you encounter one and need to migrate, the simplest path is: author a plan via `/wf-meta init-ship-plan`, then run `/wf ship <slug>` for the next release; the legacy file stays as historical record.

---

# When the plan is missing

The most common new-user error is running `/wf ship <slug>` before authoring a plan. The hard stop in step 0.4 is by design: ship is plan-driven, and the plan captures org knowledge (signing key format, registry token sources, recovery playbooks) that cannot be inferred from the workflow alone.

If the user keeps running into the missing-plan error, suggest the `--from-template` shortcut:

```
/wf-meta init-ship-plan --from-template kotlin-maven-central
/wf-meta init-ship-plan --from-template npm-public
/wf-meta init-ship-plan --from-template pypi
/wf-meta init-ship-plan --from-template container-image
/wf-meta init-ship-plan --from-template server-deploy
/wf-meta init-ship-plan --from-template library-internal
```

Each template seeds Blocks A–G with sensible defaults and one or two recovery playbooks distilled from common failure modes.
