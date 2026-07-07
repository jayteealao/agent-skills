---
description: Run a release using the project's `.ai/ship-plan.md`. Reads the plan, generates a run-id, and walks the 13-step idempotent ship sequence (pre-flight → publish dry-run → rollout → freshness delta → go/no-go → merge → tag → workflow watch → post-publish poll → post-release bump → index update → write run artifact). Replayable: re-running after a partial failure resumes at the failed step. A `pr#N`/branch first argument ships EVERY slug on the branch atomically as one run (all-or-nothing). Refuses to start unless readiness is `ready`.
argument-hint: <slug|pr#N|branch> [environment|announce|rollback] [<run-id>] [--init-plan]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `$wf ship`, **stage 9 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → `9·ship` → 10·retro

| | Detail |
|---|---|
| Requires | `.ai/ship-plan.md` (project-level — author via `$wf ship-plan init` once per project) AND `08-handoff.md` with `readiness-verdict: ready` (single-slug) or `pr-readiness-verdict: ready` (batch — the branch-level AND). |
| Conditional inputs (mandatory when present) | `augmentations:` list in `00-index.md` (union across the roster in batch mode) — every entry MUST get a changelog entry (translated to user language). Prior `09-ship-run-*.md` with `status: awaiting-input` — must offer to resume rather than start fresh. |
| Produces | `09-ship-run-<run-id>.md` (per release, on the lead slug) + refreshed `09-ship-runs.md` per roster slug (followers carry a `shipped-via` pointer). Legacy `09-ship.md` is read-only; never written by this version. |
| Next | `$wf retro <slug>` (if go) or `$wf implement <slug> <slice>` (if blockers) |

> **Optional second opinion.** At the Go/No-Go gate, you may offer `$consult
> <risk-review this release: pre-flight, dry-run, freshness delta, and any deferred
> findings>` (or `$consult <provider> …`) — a read-only multi-model panel before the irreversible merge. Model may self-run when clearly valuable (pin `codex`/`claude`); otherwise just offer it.

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT fix code — if blockers require code changes, recommend returning to `$wf implement <slug> <slice>`.
- Do NOT modify `.ai/ship-plan.md` — to edit the plan, run `$wf ship-plan edit`. Runs follow the plan as a contract.
- Your job: **read the plan, generate or resume a run, execute the 13 idempotent steps, write the run artifact**.
- Each step is independently re-runnable. Re-running step N when N already completed is a **no-op + note**, not a duplicate side-effect.
- Follow the numbered steps below exactly in order. Do not skip, reorder, or combine steps.

# Step 0 — Orient (MANDATORY)

1. **Resolve the first positional** — polymorphic, same order as `$wf handoff` (first match wins):
   - **Exact slug** (`.ai/workflows/<arg>/00-index.md` exists) → **single-slug ship**. `ship-scope: slug`.
   - **PR reference** `pr#N` / `#N` / bare integer → resolve the branch via `gh pr view <N> --json headRefName -q .headRefName` → branch path below. `ship-scope: branch`.
   - **Branch name** (matches a `branch:` in some `00-index.md`) → **batch ship**. `ship-scope: branch`.
   - **Absent** → infer the most recent active workflow; single-slug. If ambiguous, ask.

   **Build the roster** (`branch-slugs`): single-slug → `[<slug>]`; batch → every slug whose `00-index.md` `branch:` equals the resolved branch. **Elect the lead**: reuse the `handoff-lead:` recorded at handoff time (it MUST already exist — batch ship follows a batch handoff); if absent, elect the first roster slug alphabetically. The lead owns the single `09-ship-run-<run-id>.md`; followers get a `shipped-via` pointer.

1.5. **Announce re-run shortcut.** If the second positional is exactly `announce` (not a valid environment, so no collision with sub-step 3): load `skills/wf/reference/ship/announce.md`, run **only** the announce phase for `<slug>`, then STOP. Do NOT run the 13-step sequence.
1.6. **Rollback shortcut.** If the second positional is exactly `rollback` (not a valid environment): load `skills/wf/reference/ship/rollback.md`, run **only** that phase for `<slug>`, then STOP. Do NOT run the 13-step sequence. Optional third positional = `<run-id>`; default = most recent `status: complete` run in `09-ship-runs.md`. A paused (`awaiting-input`) run is refused — resume or fail it instead.
2. **Detect `--init-plan` flag.** If present, print and STOP:
   ```
   The plan-author flow is `$wf ship-plan init`, not `$wf ship --init-plan`.
   Run: $wf ship-plan init [--from-template <kind>]
   ```
3. **Resolve environment** (optional second positional, e.g. `staging`, `production`). Overrides the plan's default; otherwise use the first entry in `ship-plan.ship-environments[]`.
4. **Read `.ai/ship-plan.md`.** If missing, STOP:
   ```
   No ship plan found at .ai/ship-plan.md.
   Run: $wf ship-plan init [--from-template <kind>]
   ```
   Parse all blocks (A–G) into in-memory state.
5. **Read `00-index.md`** for **each roster slug** — parse `current-stage`, `status`, `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`, `augmentations:`, and `handoff-lead:`. In batch mode the PR/branch fields must agree across the roster (they share one branch/PR); if they disagree, STOP and report the inconsistency.
6. **Readiness gate — all-or-nothing across the roster.** Ship is atomic per PR: you cannot merge some slugs on a branch and not others. So **every** roster slug must be shippable, or none ship.
   - **Single-slug**: read `08-handoff.md`, parse `readiness-verdict`. If missing or `≠ ready`, STOP: "Handoff readiness-verdict is `<verdict>`. Ship requires `ready`. Run: `$wf handoff <slug>`."
   - **Batch**: read the **lead's** `08-handoff.md` and parse `pr-readiness-verdict` (the branch-level AND). If `≠ ready`, STOP and **print the roster report** (which slugs are ready vs. not): "Ship is all-or-nothing per PR. `pr-readiness-verdict` is `<verdict>` — bring every slug ready first: `$wf handoff pr#N`." Do NOT ship the ready subset.

   Parse `pr-url`, `pr-number`, `branch`, `base-branch`, `has-deferred-comments` from the lead handoff. If `has-deferred-comments: true`, WARN before continuing.
6.5. **Runtime-evidence deferral gate (HARD BLOCK — added per RUNTIME-PROBE-PLAN.md §2.4).** Parse `runtime-evidence-deferrals` from **every roster slug's** `00-index.md` (absent on older workflows → treat as empty). An entry is **open** when `cleared-by: null` AND it carries no `ship-override-authorization`. Every open entry, on **any** roster slug, must be cleared before ship — one slug's open deferral blocks the whole atomic run.

   If any entry is still open, STOP with:
   ```
   Ship is blocked: <N> open runtime-evidence deferral(s).
   The following slices passed verify only because runtime evidence was deferred; ship requires evidence:
     - <slice-slug>: <reason>  (deferred-at: <iso>)
     - ...
   Clear each deferral by one of:
     (a) running `$wf probe <slug> <target-matching-the-deferred-AC>` to capture evidence, then re-running verify (sets `cleared-by` to the probe/evidence descriptor), OR
     (b) re-running `$wf verify <slug> <slice-slug>` in an environment that supports the interactive checks for that slice, OR
     (c) recording an explicit PO risk-acceptance as `ship-override-authorization: {by, at, reason}` on the entry — for genuinely deploy-time-circular cases only (e.g. build-inlined config confirmable only post-deploy).
   ```
   **`cleared-by` is for EVIDENCE, never risk-acceptance.** It must hold a probe/evidence descriptor proving the AC was actually observed — not a prose "we'll accept the risk" string (that would silently unlock ship without evidence). PO risk-acceptance goes in `ship-override-authorization`, which the ship summary surfaces as an **explicit override** (recorded, not disguised as evidence). A multi-AC deferral may log partial progress in `cleared-acs: [...]` while `cleared-by` stays null.

   Evidenced entries (non-null `cleared-by`, typically a probe descriptor) and PO-overridden entries do not block — but list every override distinctly in the ship summary for the record. This gate is the hard-block half of the deferral mechanism; earlier stages (verify, review, handoff) surface deferrals as soft warnings.
7. **Read every `07-review-*.md` and `po-answers.md`** for changelog/release-notes context — across **all roster slugs** in batch mode, so the release notes cover the whole branch.
8. **Resume detection.** Search for `.ai/workflows/<slug>/09-ship-run-*.md`. For any with `status: awaiting-input`:
   Ask the user directly in chat presenting a short numbered list:
   "A prior ship run is paused. What would you like to do?
   1. Resume <run-id> (Recommended) — Continue from the failed step.
   2. Start fresh — Generate a new run-id; the prior run stays paused.
   3. Mark prior as failed and start fresh — Set the prior run status: failed."
   If **resume**: load that run's frontmatter and skip to the first step with an empty evidence field.
   If **start fresh**: leave the prior run untouched (or set `failed`); generate a new `run-id`.
9. **Generate `run-id`** (UTC compact ISO-8601): `date -u +"%Y%m%dT%H%MZ"`. Use as the filename suffix and the `run-id` field. In batch mode there is ONE run-id for the whole branch.
10. **Carry forward** `open-questions` from the index (union across roster slugs in batch mode).

# Batch ship (scope: branch) — one run, one artifact, N pointers

The 13-step sequence acts on the **branch/PR**, which is shared — so it runs
**exactly once** per branch, owned by the lead slug.

- The single `09-ship-run-<run-id>.md` is written under the **lead** slug with
  `ship-scope: branch` and `branch-slugs: [...]`.
- **Aggregation points** read the whole roster: the changelog/release-notes
  (step 7 + `augmentations:`) cover every slug's reviews and augmentations; the
  announce phase covers the branch; rollback resolves through the lead.
- Each **follower** slug gets a pointer row in its own `09-ship-runs.md`
  (`shipped-via: <lead>/09-ship-run-<run-id>.md`) and its `00-index.md` advances
  to shipped — no duplicate run artifact.

# Workflow rules
- Store run artifacts under `.ai/workflows/<slug>/`. `00-index.md` is the control file; `09-ship-runs.md` is the per-workflow run index. Never leave the canonical result only in chat — write the stage file first.
- **The ship plan lives at `.ai/ship-plan.md` (repo root), NOT under `.ai/workflows/`.** Project-scoped, shared across workflows.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter; the body is human-readable narrative only.
- **Timestamps must be real:** For `created-at`, `updated-at`, and `observed-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash. Never guess or use `T00:00:00Z`.
- If a step cannot finish, set `status: awaiting-input`, record what's blocking, and STOP. The next invocation resumes from there.
- Append every PO answer to `po-answers.md` with timestamp and stage.
- Reuse earlier workflow files. Do not silently broaden scope.
- **Conditional inputs are mandatory when present.** If the workflow has `augmentations:`, every entry MUST get a changelog line.
- **Idempotency invariants per step.** Pre-flight is a no-op if the version is already applied. Merge is a no-op if the PR is merged. Tag is a no-op if the tag exists. Polling resumes from the last `pending` check.
- **Backwards compatibility.** If a legacy `09-ship.md` exists, do not write to it — read for context only. New shape uses `09-ship-run-<run-id>.md` plus `09-ship-runs.md`.

# Chat return contract
After writing files, return per [_chat-return.md](_chat-return.md) — narrative lead in the artifact's `## The Ship` story voice, then this receipt:
- `slug: <slug>`
- `run-id: <run-id>`
- `wrote: <path>`
- `status: <complete | awaiting-input | failed | rolled-back>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

---

# The 13-step run sequence

Each step is independently re-runnable; detect the already-done state before performing the side-effect.

## Step 1 — Pre-flight (idempotent)

Mark the corresponding task `in_progress`.

1.1 **Branch + tree state.** Confirm you are on `<branch>`. `git status --porcelain` must be empty. If dirty, STOP — ask the user to commit/stash. Record `branch`, `head-sha-at-start: <git rev-parse HEAD>`.

1.2 **Determine version.** Per `plan.version-bump-rule`:
   - `git-cliff` → run `plan.version-bump-cmd` (default: `git cliff --bumped-version`).
   - `conventional-commits` → use the project's bump tooling (`npx changeset version`, `npm version`, etc. — captured in `plan.version-bump-cmd`).
   - `manual` → ask the user directly in chat with three suggested bumps based on commit log: patch, minor, major (presented as a short numbered list).
   - `fixed` → use the literal version from the plan.
   Confirm with the user before applying. Record `version` and `prior-version: <git describe --tags --abbrev=0 || echo "none">`.

1.3 **Apply version to every `version-source-of-truth` file.** Read each file first; if already at `version`, skip. After writing, if any diff exists, commit: `git commit -am "build: bump version to <version>"`.

1.4 **Verify required secrets.** For each `plan.required-secrets[]`:
   - Confirm exists: `gh secret list | grep -q "^<NAME>\b"`
   - Get last-updated: `gh secret list --json name,updatedAt | jq -r '.[] | select(.name=="<NAME>") | .updatedAt'`
   - If `(now - updatedAt).days > plan.secrets-staleness-threshold-days`, WARN (user may proceed; warning recorded in run).

1.5 **Regenerate changelog** per `plan.version-bump-rule`. For `git-cliff`: `git cliff --output CHANGELOG.md`. If the changelog already includes `<version>`, skip. Otherwise commit: `git commit -am "docs: update changelog for <version>"`.

Record `pre-flight-status: pass` (or `pre-flight-status: warn` with reasons if any secret was stale).

## Step 2 — Publish dry-run (mandatory if `plan.publish-dry-run-cmd` is set)

If the plan has no `publish-dry-run-cmd`, set `publish-dry-run-passed: skipped` and skip to step 3. Re-running step 2 is always safe — dry-runs have no side effects.

2.1 Execute `plan.publish-dry-run-cmd`. Capture stdout + stderr.

2.2 Verify artifact post-conditions per `ship-meaning`:
   - `publish` (Maven Central / Sonatype) → confirm POM has groupId, artifactId, version, name, description, url, licenses, developers, scm. Confirm `.asc` signature files exist.
   - `publish` (npm) → confirm `package.json` has `name`, `version`, `repository`, `license`. Run `npm pkg fix --dry-run` to detect manifest issues.
   - `publish` (pypi) → confirm `twine check dist/*` passes.
   - `publish` (container-image) → confirm `docker manifest inspect` returns a multi-arch list when expected.
   - `merge-only` / `deploy-*` → no manifest check; verify the build command succeeded.

2.3 Record `publish-dry-run-passed: true` (or `false` with the failing post-condition + STOP — set `status: awaiting-input`).

## Step 3 — Rollout questions (per-run only, never re-asked)

Idempotency: skip if `go-nogo`, `rollout-strategy`, and `merge-strategy` are already set.

3.1 **Confirm rollout-strategy.** Default is `plan.rollout-strategy`. Ask the user directly in chat presenting the plan default plus "Override" as a short numbered list.

3.2 **Confirm release window** (freeform): timing, blackout windows, on-call coverage.

3.3 **Stakeholder/compliance overrides for this run** (freeform): sign-off required beyond the plan's list?

Append all answers to `po-answers.md` with `stage: ship` and the `run-id`.

## Step 4 — Freshness pass — DELTA only

Idempotency: read-only; re-running is always safe.

4.1 Find the last successful run for this workflow: search for `09-ship-run-*.md`, filter `status: complete`, sort by `created-at`, pick the most recent. Read its `## Freshness Research` section.

4.2 Diff the *delta* — what platforms, dependencies, or CI changes occurred since that run? Re-run web-research sub-agents only for areas that changed:
   - **Platform health** sub-agent: only if there's been a deployment-target change OR > 30 days since the last run.
   - **Dependency security** sub-agent: only if `package.json`, `pyproject.toml`, `Cargo.toml`, or equivalent has changed since the last run's `head-sha-at-start`.
   - **CI/CD config** sub-agent: only if `.github/workflows/*.yml` or related CI files changed since the last run.

4.3 If no prior successful run exists, run the **full** freshness pass (all 3 sub-agents). Merge findings into `## Freshness Research`.

## Step 5 — Go/No-Go

Idempotency: skip if `go-nogo` is already set.

Ask the user directly in chat presenting a short numbered list:
"Based on readiness, dry-run, and freshness, what is the go/no-go decision?
1. Go — Proceed with merge and deployment. All checks pass.
2. Conditional go — Proceed with caveats — record the caveats below.
3. No-go — Do not merge. Return to fix blockers."

If `no-go`: set `status: complete`, `go-nogo: no-go`; skip steps 6–10; write the run artifact (step 13). The PR stays open.

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

8.4 **On failure:** match the failure log against `plan.recovery-playbooks[].triggers[]` (regex match, case-insensitive). For matched playbooks, present each step to the user in chat asking confirmation per step. Record `recovery-actions-taken: [<playbook-id>, ...]`. Allow re-running step 8 after recovery.

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
   - Bound exceeded → set run `status: awaiting-input` with the still-pending checks listed; stop.

## Step 10 — Post-release version bump (if `plan.post-release-version != none`)

Idempotency: read each `version-source-of-truth` file — if already at the post-release version, skip.

10.1 Compute next dev version per `plan.post-release-version-cmd`.
10.2 Apply to every `version-source-of-truth` file. Commit: `git commit -am "build: bump to <next-dev-version>"`.

10.3 Push: `git push origin <base-branch>`. Record `post-release-bump-sha: <git rev-parse HEAD>`.

## Step 11 — Update `09-ship-runs.md` index

Append or update this run's entry. Frontmatter is the source of truth; the body table is regenerated from it. **Batch mode**: update the **lead** slug's `09-ship-runs.md` with the real run row, and each **follower** slug's `09-ship-runs.md` with a pointer row carrying `shipped-via: <lead>/09-ship-run-<run-id>.md` (same run-id, no duplicate run artifact).

```yaml
---
schema: sdlc/v1
type: ship-runs-index
slug: <slug>
updated-at: "<iso>"
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

## Step 14 — Announce (post-publish comms phase)

Runs only when the run reached `go-nogo: go` or `conditional-go` (skip for `no-go` or `awaiting-input`). This is the phase that absorbed the former standalone `$wf-meta announce`.

Load `skills/wf/reference/ship/announce.md` and run it for `<slug>` — it drafts
audience/channel-tailored announcements, writes `announce.md`, and stamps `announcements-sent`
onto the run. The announce phase is interactive; if the user declines or defers, note that and
move on — the run is already complete. To regenerate comms later without re-shipping, the user runs
`$wf ship <slug> announce` (the Step 1.5 shortcut).

---

# Run artifact schema

```yaml
---
schema: sdlc/v1
type: ship-run
slug: <slug>                # the LEAD slug in batch mode
run-id: "<YYYYMMDDTHHMMZ>"
status: <complete | awaiting-input | failed | rolled-back>
plan-ref: ../../ship-plan.md
plan-version-at-run: <integer copied from plan at run-start>
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"

# Scope (batch ship)
ship-scope: <slug | branch>          # branch = one atomic run for every slug on the branch
branch-slugs: [<slug-1>, <slug-2>, ...]   # the roster released together (present when ship-scope: branch)

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
rollback-artifact: "<09-rollback-<run-id>.md or empty>"   # stamped by the rollback phase
announcements-sent: [<channel>, ...]

tags: []
refs:
  index: 00-index.md
  handoff: 08-handoff.md
  plan: ../../ship-plan.md
  reviews: [07-review-<slice-1>.md, ...]
next-command: wf-retro
next-invocation: "$wf retro <slug>"
---

# Ship Run — <slug> @ <version> @ <environment>

## The Ship
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Voice per `_narrative-voice.md` — no "This ship run implements…" openings. 1–4 short paragraphs. -->

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
- **Option A (default):** `$wf retro <slug>` — Go [reason]
- **Option B:** `$wf implement <slug> <slice>` — fix blockers or resolve rebase conflicts [reason, if applicable]
- **Option C:** `$wf verify <slug> <slice>` — re-verify if evidence was stale [reason, if applicable]
- **Option D:** `$wf ship <slug>` — resume paused run [reason, if applicable]
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
  # follower slug in a batch ship — a pointer row, no local run artifact:
  - { run-id: <id>, version: <ver>, environment: <env>, status: <status>, go-nogo: <decision>, shipped-via: "<lead>/09-ship-run-<id>.md", notes: "shipped with <lead>" }
---

# Ship Runs

| Run | Version | Env | Status | Go/No-Go | Notes |
|---|---|---|---|---|---|
| <id> | <ver> | <env> | <status> | <decision> | <notes> |
```

The body table is regenerated from frontmatter on every run — frontmatter is the source of truth.

---

# Adaptive routing — evaluate what's actually next

After completing this run, evaluate the outcome and present the user with ALL viable options:

**Option A (default): Retro** → `$wf retro <slug>`
Use when: `status: complete` and `go-nogo` is `go` or `conditional-go`.

**Option B: Fix and re-implement** → `$wf implement <slug> <selected-slice>`
Use when: ship found blockers requiring code changes, rebase had conflicts, or a recovery playbook required code-side fixes.

**Option C: Re-verify** → `$wf verify <slug> <selected-slice>`
Use when: freshness research surfaced new CVEs the verify stage didn't see.

**Option D: Resume paused run** → `$wf ship <slug>`
Use when: `status: awaiting-input` — required answers missing, post-publish poll bound exceeded, or a recovery playbook was started but not completed.

**Option E: Roll back** → `$wf ship <slug> rollback [<run-id>]`
Use when: post-publish checks failed or a shipped release must be reversed. The rollback phase (`reference/ship/rollback.md`) loads the run's recorded steps, authors a reversal runbook with each step marked reversible or irreversible (irreversible steps surface as mitigations), gates on an explicit Go/No-Go, executes, verifies the prior state is live via `rollback-verify-cmd`, and writes `09-rollback-<run-id>.md` — stamping this run `rolled-back: true` + `rollback-artifact`. For an in-flight emergency during post-publish polling, the Block F recovery playbooks still apply first; the rollback phase is the deliberate reversal.

Write ALL viable options into `## Recommended Next Stage` so the user can choose.

---

# Backwards compatibility

- Workflows with an existing legacy `09-ship.md` keep working. **Reading it is fine; writing it is gone** — `$wf ship` only writes `09-ship-run-<run-id>.md` and `09-ship-runs.md`.
- `$wf status` and `$wf recap` should treat both shapes as valid:
  - If `09-ship-runs.md` exists → use the new shape.
  - Else if `09-ship.md` exists → read it for context, but propose authoring a plan + running a fresh run.
- The legacy `09-ship.md` artifact never had a `plan-ref` or `run-id`. If you encounter one and need to migrate, the simplest path is: author a plan via `$wf ship-plan init`, then run `$wf ship <slug>` for the next release; the legacy file stays as historical record.

---

# When the plan is missing

Ship is plan-driven; the plan captures org knowledge (signing key format, registry token sources, recovery playbooks) that cannot be inferred from the workflow alone. If the user hits the missing-plan error, suggest the `--from-template` shortcut:

```
$wf ship-plan init --from-template kotlin-maven-central
$wf ship-plan init --from-template npm-public
$wf ship-plan init --from-template pypi
$wf ship-plan init --from-template container-image
$wf ship-plan init --from-template server-deploy
$wf ship-plan init --from-template library-internal
```

Each template seeds Blocks A–G with sensible defaults and recovery playbooks for common failure modes.

---

## Step Z — Write the rich `.yaml` + fragment (MANDATORY — do not skip)

The sunflower view renders the ship-run page from a sibling `.yaml` + `.html.fragment`
written next to `09-ship-run.md`. **Without the `.yaml` the page silently degrades to
plain prose** — the deploy timeline, the per-env checks matrix, and the rollback panel
never appear (`ship-run.mjs` returns `renderSimple` when the sibling YAML is absent).
The `post-write-verify` hook **BLOCKS the `.md` write (exit 2) when the sibling
`.yaml` is missing** — author the `.yaml` first (or in the same turn).
(If this is a genuine no-op ship-run with nothing to project, set `fragment: none` in
its frontmatter to opt out.)

For the `09-ship-run-<run-id>.md` you just wrote (files are **flat** in the slug dir —
`09-ship-run-<run-id>.{yaml,html.fragment}`, where `<run-id>` is the run timestamp,
not a `ship/<run-id>/` subtree):

1. Write the sibling **`09-ship-run-<run-id>.yaml`** — the structured data: `release:`,
   `run_at:`, `stages:` (name, status, started_at, ended_at), `checks:` (name, kind,
   results per env → {status, duration}), `rollback:` (window_minutes, target_release,
   approvers). Schema: `siblingYamlSchemas['ship-run']` in `tests/frontmatter.schema.json`.
2. Write the sibling **`09-ship-run-<run-id>.html.fragment`** — the body-only interactive
   layer described next.

The fragment is one `<section class="fragment-shiprun" data-artifact="ship-run"
data-release="<release>">` that reproduces the gallery's ship-run fragment 1:1:

- Deploy-timeline SVG (build → test → stage → canary → prod, segments tinted
  by status).
- `<table class="sr-checks">` with rows = checks, columns = envs, cells
  carrying `.is-pass / .is-fail / .is-flake / .is-skip / .is-running`.
- `<aside class="sr-log-panel" hidden>` that reveals on cell click.
- `<div class="sr-actions">` with `.btn-primary "Promote to 100%"` and
  `.btn-danger "Roll back"`.

Authoring rules (verifier Check 7 enforces):

- Inline `<style>` scoped under `.fragment-shiprun` / `.sr-*`.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-shiprun')`.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready',
  { detail: { name: 'ship-run', artifact: 'ship-run',
    counts: { checks: <n>, stages: <n> }, status: '<latest-stage-status>' } }))`.
- Inline SVG only. Data deterministic from `09-ship-run.yaml`.

Full contract:
[`reference/fragment-author-contract.md`](../../../references/fragment-author-contract.md).
Gallery reference (bundled): [`reference/fragments-gallery.html`](../../../references/fragments-gallery.html).

### Fragment scope

The fragment is **body-only** (see `_fragment-authoring.md` → "Scope"): `ship-run.mjs` owns the page heading and metric-row. Do **not** repeat them — the fragment carries the interactive layer only:

```html
<section class="fragment-shiprun" data-artifact="ship-run" data-release="v3.2.0">
  <!-- No heading, no metric-row here — the page owns them. -->

  <svg class="sr-timeline" viewBox="…"> …deploy timeline (pulse on live stage)… </svg>
  <table class="sr-checks"> …clickable check matrix → log panel… </table>

  <div class="sr-actions">
    <button class="btn btn-primary">Promote to 100%</button>
    <button class="btn btn-danger">Roll back</button>
  </div>
</section>
```

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
