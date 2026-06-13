# Handoff + Ship Overhaul Plan — sdlc-workflow

Status: draft, pre-implementation
Author: planning conversation, 2026-05-10
Target plugin version after full landing: next minor after current `master` (one minor bump per PR, four PRs total)
References:
- Current handoff reference: `plugins/sdlc-workflow/skills/wf/reference/handoff.md`
- Current ship reference: `plugins/sdlc-workflow/skills/wf/reference/ship.md`
- Source patterns lifted from: `.scratch/prepare-pr/SKILL.md`, `.scratch/release/SKILL.md` (Isometric Kotlin/Maven Central project)
- Comparable migration shape: `ROUTER-MIGRATION-PLAN.md`

---

## 1. Why — the gap

### 1.1 Today's `wf handoff` (`skills/wf/reference/handoff.md`, stage 8)

10 numbered steps:

1. Orient (resolve slug, scope, prereqs)
2. Read branch strategy
3. Create T1–T6 task list
4. T1 — Read prior artifacts
5. T2 — Write reviewer-friendly summary
6. T3 — Generate Diátaxis docs
7. Freshness pass
8. T4–T5 — Push branch + `gh pr create`
9. Adaptive routing
10. T6 — Write `08-handoff.md`

Misses, relative to a real PR-readiness pipeline:

- No commit-lint pass against base merge-base.
- No public-surface drift detection (Kotlin `.api`, OpenAPI, GraphQL schema, exported `.d.ts`, SQL DDL, etc.).
- No doc-mirror regen for projects with generated docs (`sync-docs.js`, Docusaurus build, Sphinx, godoc).
- **No PR comment triage.** The PR is created and then never re-read. Bot reviewers (CodeRabbit, Greptile, Gemini, Codex) and human reviewers leave 🔴 blockers and 🟡 suggestions that the workflow ignores.
- No rebase onto base before declaring readiness.
- No live PR-state check (`reviewDecision`, `statusCheckRollup`) recorded in the artifact.

### 1.2 Today's `wf ship` (`skills/wf/reference/ship.md`, stage 9)

10 numbered steps:

1. Orient (resolve slug + optional environment)
2. Read branch strategy
3. Create T1–TN task list
4. T1 — AskUserQuestion rollout/merge questions + freeform
5. T2 — Freshness research (3 parallel sub-agents: platform, deps, CI/CD)
6. T3 — Readiness assessment
7. T4 — AskUserQuestion go/no-go
8. T5–T8 — Rebase, CI check, `gh pr merge`, branch cleanup
9. Adaptive routing
10. TN — Write `09-ship.md`

Misses, relative to a repeatable release pipeline:

- No notion of "**what does ship mean for this project**". `09-ship.md` answers it implicitly per run, never as a contract.
- No version model (scheme, source-of-truth files, bump rule, prerelease/postrelease handling).
- No CI/CD ownership — the workflow stops at PR merge and assumes someone else cares about tag/release/publish.
- No publish dry-run before the public push.
- No post-publish propagation poll — "task succeeded" is taken as "artifact published".
- No structured recovery playbooks for the predictable failure modes (signing key wrong format, registry token expiry).
- **Not replayable.** Re-running `/wf ship <slug>` after a partial failure re-asks every question, re-runs every research sub-agent, and overwrites the prior `09-ship.md`. Releases are inherently retried; the artifact shape forbids it.

### 1.3 Decisions taken (settled in the planning conversation)

| Decision | Choice | Rationale |
|---|---|---|
| Where does the ship plan live? | **Per project, repo-root**: `.ai/ship-plan.md` | Versioning + CI/CD + rollout/rollback are project-level contracts, not workflow-level. Every workflow ships through the same pipeline. |
| Run history | **Accumulating**: `09-ship-run-<run-id>.md` per release | Audit trail. The workflow folder is allowed to grow — each run is small. |
| Plan authoring | **Split** from runs: `/wf ship <slug> --init-plan` (or `/wf-meta init-ship-plan`) authors the project plan; `/wf ship <slug>` reads it and runs one revolution | Plan authorship is a meaningfully different task — it is project-wide, one-time, and re-runs would corrupt history. Runs are workflow-scoped, frequent, and replayable. |
| PR comment triage | **In handoff** (not a separate `/wf-meta address-reviews`) | Triage is part of "is this PR ready"; that is exactly what handoff stage 8 already owns. A separate command would also need its own task list, prereq checks, and routing — duplication of handoff scaffolding. |

---

## 2. Handoff overhaul

### 2.1 New shape

Today's handoff is a 10-step linear pipeline. The new handoff is the same shape with a **PR-readiness block** inserted between today's T5 (PR creation) and T6 (artifact write). The block fires only when `branch-strategy: dedicated`.

```
T1 Read prior artifacts                             (existing)
T2 Write reviewer-friendly summary                  (existing)
T3 Generate Diátaxis docs                           (existing)
NEW T3.5 commitlint pass
NEW T3.6 Public-surface drift check
NEW T3.7 Doc-mirror regen + commit if changed
T4 Push branch                                      (existing)
T5 Create or update PR                              (existing — also updates body if PR exists)
NEW T5.1 PR comment triage loop
NEW T5.2 Rebase onto base + force-with-lease
NEW T5.3 Live readiness check
T6 Write 08-handoff.md                              (existing — new frontmatter fields)
```

For `branch-strategy: shared` the block runs except for T5.2 (no force-push on a shared branch). For `branch-strategy: none` the entire block is skipped (same as today).

### 2.2 Lifts from `.scratch/prepare-pr/SKILL.md`

**Take, generalised:**

| Picked | From prepare-pr | Mapped to | Generalisation rule |
|---|---|---|---|
| Branch + tree audit | 1.1 | T0 (orient — already partial) | Surface as explicit pre-flight: branch ≠ base, tree clean, ahead-of-base count |
| commitlint pass | 2.1, 2.2 | T3.5 | Read `.commitlintrc*` if present; skip silently if absent. `BREAKING CHANGE` / `!:` flag triggers a warning in the artifact, not a block |
| Public-surface drift | 3.1 | T3.6 | Driven by `00-index.md` field `public-surface: { kind, regen-cmd, files }`. Skips silently if absent. Pattern fits Kotlin `.api`, OpenAPI, GraphQL schema, exported TS types, SQL DDL |
| Doc-mirror regen | 4.4 | T3.7 | Driven by `00-index.md` field `docs-mirror: { regen-cmd, regen-paths }`. If regen produces a diff: stage + commit `docs: regenerate <kind> mirrors` |
| PR comment triage + thread resolution | 5.1–5.5 | T5.1 | Bot logins from plugin defaults (`coderabbitai`, `greptile-dev`, `gemini-code-assist`, `chatgpt-codex-connector[bot]`), overridable via `00-index.md` `review-bots:` list. **Handoff stays orchestrator** — for 🔴 fixes, route to `/wf implement <slug> <slice> reviews`, then `resolveReviewThread` only after the fix lands |
| Rebase onto base | 8.1–8.4 | T5.2 | `git fetch origin <base-branch>` → `git rebase origin/<base-branch>` → `git push --force-with-lease`. Stop on conflict, route to `/wf implement <slug> <slice>` |
| Live PR readiness check | 9.1 | T5.3 | `gh pr view <pr-number> --json reviewDecision,statusCheckRollup`; record in artifact frontmatter |
| PR template checkbox sweep | 7.2 | T5 (existing PR-update step) | If `.github/PULL_REQUEST_TEMPLATE.md` exists, cross-reference checkboxes against artifact state and tick where the artifact provides evidence |

**Don't take:**

| Skipped | From prepare-pr | Why |
|---|---|---|
| Fix-in-place for 🔴 blockers | 5.4 | Violates handoff's orchestrator-not-fixer rule. Route to `/wf implement <slug> <slice> reviews` |
| Auto-create PR if missing | 1.2 | Handoff already does this in T5 |
| README feature-keyword scan | 4.3 | Project-specific heuristic, often noisy. If wanted, fold into the Diátaxis `readme` primitive |
| Hard-coded bot logins | 5.2 | Defaults in plugin, override per-project via `00-index.md` |
| Local CI re-run | 6.1, 6.2 | Belongs in `/wf verify`, not handoff. Handoff instead checks the verify-evidence freshness in T1 |

### 2.3 PR comment triage loop (T5.1) — detailed

The triage step is a **bounded loop**, not a one-shot. The loop runs until either no unresolved 🔴 blockers remain, or the user opts to defer.

```
Iteration N:
  1. Fetch unresolved review threads via GraphQL:
       reviewThreads(first: 100) { nodes { id, isResolved, comments { ... } } }
     Filter isResolved == false. Capture { threadId, author, file, line, body }.
  2. Fetch top-level PR comments and formal review submissions.
  3. Classify each comment by author and content:
       🔴 Blocking      — correctness, crash, security, data loss, "request changes" with a must-fix
       🟡 Suggestion    — style, naming, doc gap, test gap, nit-with-merit
       🟢 Informational — walkthroughs, praise, declined nits
  4. Report a triage table to the user:
       | Source | File:Line | Severity | Summary | Recommended action |
  5. For each 🔴: hand off to `/wf implement <slug> <slice> reviews` (sub-invocation).
     The implement-reviews mode reads the open thread context, applies the fix,
     commits, and returns. Handoff captures the resulting commit SHA per threadId.
  6. For each 🟡: AskUserQuestion (multi-select) — apply / defer / decline.
     Apply selected ones via the same implement-reviews route.
  7. After fixes commit and push, resolveReviewThread mutation per fixed threadId.
  8. Re-fetch threads. If new comments arrived, loop. Else exit.

Loop exit conditions:
  - No unresolved 🔴 blockers AND user has triaged every 🟡.
  - User chooses "defer remaining" — recorded in artifact frontmatter as
    triage-deferred-thread-ids: [...]; handoff sets has-deferred-comments: true.

Loop bound: max 5 iterations to avoid infinite ping-pong with bots that re-comment.
After bound, set status: awaiting-input and stop.
```

🟢 informational comments are summarised in the artifact's `## Reviewer Comments Triaged` section, never resolved (general PR comments are not threadable via API).

### 2.4 New `00-index.md` fields (project-level config consumed by handoff)

```yaml
# Optional — handoff skips silently if any of these are absent.
public-surface:
  kind: kotlin-api          # or openapi | graphql-schema | typescript-dts | sql-ddl
  regen-cmd: "./gradlew apiDump"
  files:
    - isometric-core/api/isometric-core.api
    - isometric-compose/api/isometric-compose.api

docs-mirror:
  regen-cmd: "node scripts/sync-docs.js"
  source-paths: ["site/src/content/docs/**/*.mdx"]
  mirror-paths: ["docs/**/*.md"]

review-bots:
  - coderabbitai
  - greptile-dev
  - gemini-code-assist
  - chatgpt-codex-connector[bot]
```

These fields are written by `/wf-meta amend index` or `/wf-quick setup`. They live at the workflow level for now (in `00-index.md`); a future iteration can hoist them to a project-level `.ai/project.md` if multiple workflows share them.

### 2.5 New `08-handoff.md` frontmatter fields

```yaml
# Added by the PR-readiness block.
commitlint-status: <pass | warn | fail | skipped>     # warn = breaking-change present
public-surface-drift: <none | regenerated | drift-without-regen | skipped>
docs-mirror-status: <up-to-date | regenerated | skipped>
triage-iterations: <N>
triage-fixes-applied: <N>
triage-fixes-skipped: <N>
triage-deferred-thread-ids: [<id>, ...]
has-deferred-comments: <true | false>
rebase-status: <fast-forward | rebased-clean | conflicts | skipped>
rebase-onto-sha: "<sha of origin/<base-branch> at rebase time>"
live-review-decision: <APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | null>
live-checks-failing: [<check-name>, ...]
live-checks-pending: [<check-name>, ...]
readiness-verdict: <ready | blocked | awaiting-input>
```

Ship reads `readiness-verdict` and refuses to proceed unless `ready`.

---

## 3. Ship overhaul — split into plan + runs

### 3.1 Two artifacts

| Artifact | Path | Scope | Authored when | Updated how |
|---|---|---|---|---|
| **Ship plan** | `.ai/ship-plan.md` | One per project (repo-root) | First-time `/wf ship --init-plan` (or `/wf-meta init-ship-plan`) | `/wf-meta amend ship-plan` only |
| **Ship run** | `.ai/workflows/<slug>/09-ship-run-<run-id>.md` | One per release/redeploy of the workflow | Every `/wf ship <slug>` invocation | Append-only — runs accumulate |

The legacy `09-ship.md` is deprecated (kept readable for old workflows, never written by new code).

### 3.2 `09` index file in workflow folder

`09-ship-runs.md` (lightweight per-workflow index) lists all runs:

```yaml
---
schema: sdlc/v1
type: ship-runs-index
slug: <slug>
runs:
  - { run-id: 20260510T1432Z, version: 1.4.0, environment: production, status: complete, go-nogo: go }
  - { run-id: 20260512T0903Z, version: 1.4.1, environment: production, status: complete, go-nogo: go,
      notes: "hotfix for regression in 1.4.0" }
---
# Ship Runs

| Run | Version | Env | Status | Go/No-Go | Notes |
|---|---|---|---|---|---|
| 20260510T1432Z | 1.4.0 | production | complete | go | initial release |
| 20260512T0903Z | 1.4.1 | production | complete | go | hotfix |
```

Refreshed at the end of every run. Cheap; the body is generated from frontmatter.

### 3.3 `.ai/ship-plan.md` — schema

`★ Insight ─────────────────────────────────────`
- The plan separates three orthogonal concerns the current ship.md conflates: **what ship means** (publish/merge/deploy), **how versions work**, and **how CI/CD is wired**. Each gets its own frontmatter block so a run can read just the slice it needs.
- Required-secrets and recovery-playbooks live in the plan, not the runs. That way, the team's hard-won knowledge (signing key format, token regeneration URL) survives across releases and is re-presented on the next failure rather than re-discovered.
`─────────────────────────────────────────────────`

```yaml
---
schema: sdlc/v1
type: ship-plan
plan-version: 1
created-at: "<iso>"
updated-at: "<iso>"
project-name: "<repo or product name>"

# Block A — what ship means
ship-meaning: <publish | merge-only | deploy-immutable | deploy-rolling | feature-flag-flip>
ship-environments:                       # ordered promotion path
  - { name: staging,    auto-promote: false }
  - { name: production, auto-promote: false }
ship-cadence: <on-demand | per-merge | weekly | release-train>

# Block B — versioning contract
version-scheme: <semver | calver | sequential | none>
version-source-of-truth:                 # all literals that must agree
  - { path: package.json,   field: version }
  - { path: pyproject.toml, field: project.version }
version-bump-rule: <git-cliff | conventional-commits | manual | fixed>
version-bump-cmd: "git cliff --bumped-version"   # used when rule == git-cliff
prerelease-suffix: <none | -SNAPSHOT | -alpha | -beta | -rc>
post-release-version: <next-snapshot | next-dev | none>
post-release-version-cmd: ""             # how to compute the next dev version, if any

# Block C — CI/CD contract
ci-pipeline:
  pre-merge-checks: [build, test, lint, apiCheck]
  release-trigger: <tag-on-main | merge-to-main | manual-dispatch | branch-push>
  release-workflow-file: ".github/workflows/release.yml"
  release-jobs: [validate-version, build-and-test, publish]
  publish-dry-run-cmd: "./gradlew publishToMavenLocal"
  publish-cmd: "./gradlew publishAndReleaseToMavenCentral"
  required-secrets:
    - { name: MAVEN_CENTRAL_USERNAME, purpose: "Sonatype user token username" }
    - { name: MAVEN_CENTRAL_PASSWORD, purpose: "Sonatype user token password" }
    - { name: SIGNING_KEY,            purpose: "ASCII-armored GPG private key, single line" }
    - { name: SIGNING_KEY_ID,         purpose: "Last 8 chars of GPG fingerprint" }
    - { name: SIGNING_KEY_PASSWORD,   purpose: "GPG passphrase" }
  secrets-staleness-threshold-days: 90

# Block D — post-publish verification contract
post-publish-checks:
  - kind: registry-api
    cmd: "curl -s 'https://central.sonatype.com/api/v1/publisher/published?namespace=$GROUP&name=$ARTIFACT&version=$VERSION'"
    expect: "published==true"
  - kind: fresh-resolve
    cmd: |
      mkdir -p /tmp/$ARTIFACT-smoke && cat > /tmp/$ARTIFACT-smoke/build.gradle.kts <<EOF
      repositories { mavenCentral() }
      configurations { create("smoke") }
      dependencies { "smoke"("$GROUP:$ARTIFACT:$VERSION") }
      EOF
      cd /tmp/$ARTIFACT-smoke && gradle dependencies --no-daemon --configuration smoke
    expect: "resolves cleanly"
  - kind: github-release
    cmd: "gh release view v$VERSION"
    expect: "tag exists"
propagation-window-min-minutes: 5
propagation-window-max-minutes: 30
poll-interval-seconds: 60

# Block E — rollout + rollback contract (defaults; runs can override go-nogo not strategy)
rollout-strategy: <immediate | staged | canary | feature-flag>
rollout-stages: ["10%", "50%", "100%"]
rollback-mechanism: <git-revert | gh-release-yank | feature-flag-off | blue-green-switch | redeploy-prior>
rollback-time-estimate-min: 5
db-migrations-reversible: <true | false | n/a>

# Block F — recovery playbooks (distilled from past failures)
recovery-playbooks:
  - id: signing-failure
    triggers: ["gpg signing failed", "InvalidSignatureException"]
    steps:
      - "Re-export key: gpg --export-secret-keys --armor $KEY_ID | grep -v '\\-\\-' | grep -v '^=.' | tr -d '\\n'"
      - "Re-upload: gh secret set SIGNING_KEY --body \"$KEY\""
      - "Re-run failed workflow: gh run rerun $RUN_ID"
  - id: registry-token-401
    triggers: ["401 Unauthorized", "authentication failed"]
    steps:
      - "Token likely expired. Regenerate at <portal-url>"
      - "Update both username and password secrets"
      - "Re-run failed workflow"

# Block G — stakeholder + announcement contract
announcement:
  channels: ["#releases", "release-notes@example.com"]
  template-path: ".ai/release-announcement-template.md"
---

# Ship Plan — <Project>

## What "ship" means here
   <one paragraph: what artifact reaches what audience? does ship publish, merge, deploy, or flip a flag?>

## Versioning
   <prose walkthrough of scheme, source-of-truth files, bump rule, prerelease/postrelease handling>

## CI/CD pipeline
   <pre-merge checks, release trigger, workflow file, jobs in order, required secrets and where they come from>

## Post-publish verification
   <each check + expected signal + how long to wait>

## Rollout strategy
   <default + when to vary>

## Rollback playbook
   <detection signals, rollback steps, time estimate>

## Recovery playbooks
   <each known failure mode + steps>

## Stakeholder + announcement
   <who needs to know, what channel, what template>
```

### 3.4 `09-ship-run-<run-id>.md` — schema

```yaml
---
schema: sdlc/v1
type: ship-run
slug: <slug>
run-id: "<YYYYMMDDTHHMMZ>"               # UTC compact ISO-8601, used in filename
status: <complete | awaiting-input | failed | rolled-back>
plan-ref: ../../ship-plan.md             # relative path to .ai/ship-plan.md
plan-version-at-run: 1                   # plan-version copied at run-start
created-at: "<iso>"
updated-at: "<iso>"

# Per-run inputs
environment: <staging | production | ...>     # from plan or override
version: "<chosen version>"
prior-version: "<last successful release>"
go-nogo: <go | conditional-go | no-go>
merge-strategy: <rebase | squash | merge>     # from plan default; per-run override allowed

# Per-run evidence
publish-dry-run-passed: <true | false>
merge-sha: "<sha or empty>"
release-tag: "<vX.Y.Z or empty>"
release-workflow-run-id: "<gh-run-id or empty>"
release-workflow-conclusion: <success | failure | cancelled | empty>
post-publish-checks:
  - { kind: registry-api,   status: <pass|fail|pending>, observed-at: "<iso>", evidence: "..." }
  - { kind: fresh-resolve,  status: <pass|fail|pending>, observed-at: "<iso>", evidence: "..." }
  - { kind: github-release, status: <pass|fail|pending>, observed-at: "<iso>", evidence: "..." }
post-release-bump-sha: "<sha or empty>"

# Per-run outcomes
recovery-actions-taken: [<playbook-id>, ...]
rolled-back: <true | false>
rollback-sha: "<sha or empty>"
rollback-reason: ""
announcements-sent: [<channel>, ...]

refs:
  index: 00-index.md
  handoff: 08-handoff.md
  plan: ../../ship-plan.md
next-command: wf-retro
next-invocation: "/wf retro <slug>"
---

# Ship Run — <slug> @ <version> @ <env>

## Pre-flight
## Publish dry-run
## Rollout decision
## Freshness research delta
## Go/No-Go
## Merge
## Tag + release
## Release workflow watch
## Post-publish polling
## Post-release version bump
## Recovery actions taken
## Announcements
## Recommended Next Stage
```

### 3.5 Run sequence (replayable, idempotent)

```
0  Orient
   - Resolve slug.
   - Read .ai/ship-plan.md. STOP with "Run /wf ship <slug> --init-plan first" if missing.
   - Read 08-handoff.md; STOP if readiness-verdict != ready.
   - Generate run-id (date -u +%Y%m%dT%H%MZ).
   - If a prior run with status: awaiting-input exists, offer to resume it instead of starting fresh.

1  Pre-flight (idempotent)
   1.1 Branch + tree state.
   1.2 Determine version per plan.version-bump-rule. Confirm with user.
   1.3 Apply version to every plan.version-source-of-truth file. Single commit "build: bump version to <X.Y.Z>" if any diff.
   1.4 Verify required secrets exist + recent (per plan.required-secrets, plan.secrets-staleness-threshold-days).
   1.5 Regenerate changelog per plan.version-bump-rule. Commit if diff.

2  Publish dry-run (mandatory if plan.publish-dry-run-cmd is set)
   - Execute plan.publish-dry-run-cmd.
   - Verify artifact completeness per plan-defined post-conditions (manifest fields, signatures).
   - Set publish-dry-run-passed accordingly. STOP on failure with the failing post-condition.

3  Rollout questions (per-run only, never re-asked)
   - Confirm rollout-strategy (default = plan.rollout-strategy).
   - Confirm release window (freeform).
   - Capture stakeholder/compliance overrides for this run.

4  Freshness pass — DELTA only
   - Diff against the last successful run's freshness research.
   - Re-run sub-agents only for platforms/deps that changed since.
   - If no prior run, run full freshness pass.

5  Go/No-Go (AskUserQuestion: go | conditional-go | no-go)

6  Merge (if plan.ship-meaning includes merging AND go-nogo != no-go)
   - Per plan.merge-strategy + per-run override.
   - Idempotent: if PR already merged, skip with note.

7  Tag + release (if plan.release-trigger == tag-on-main)
   - git cliff --latest --strip header → release notes
   - gh release create v<VERSION> --target <main> --notes "<notes>"
   - Idempotent: if tag exists, skip with note.

8  Release workflow watch (if plan.release-workflow-file is set)
   - gh run list --workflow=<file> --limit 1
   - gh run watch <id>
   - On failure: match error against plan.recovery-playbooks; present the playbook,
     ask user to confirm each step. Record recovery-actions-taken.

9  Post-publish polling loop
   - Run plan.post-publish-checks every plan.poll-interval-seconds.
   - Bound by plan.propagation-window-max-minutes.
   - Set status: complete only when every check returns pass.
   - On bound exceeded: status: awaiting-input.

10 Post-release version bump (if plan.post-release-version != none)
   - Compute next dev version per plan.post-release-version-cmd.
   - Commit + push.

11 Update 09-ship-runs.md index.

12 Adaptive routing → write Recommended Next Stage.

13 Write .ai/workflows/<slug>/09-ship-run-<run-id>.md.
```

Re-running `/wf ship <slug>` after a partial failure starts at step 0, finds the prior run with `status: awaiting-input`, and offers to **resume** at the failed step. Each step is independently re-runnable: pre-flight is a no-op if the version is already applied; merge is a no-op if the PR is merged; tag is a no-op if the tag exists; polling is stateful and resumes from the last `pending` check.

### 3.6 Lifts from `.scratch/release/SKILL.md`

| Picked | From release | Goes into | Generalisation rule |
|---|---|---|---|
| Version-bump suggestion | 1.1 | Plan Block B + Run step 1.2 | Plan stores the cmd; run executes it |
| Multi-module version consistency | 1.3 | Run step 1.3 | Generic via `version-source-of-truth` list |
| Publish dry-run | 1.5 | Plan Block C + Run step 2 | Highest-value pattern. Mandatory if cmd set |
| Manifest required-fields check | 1.5 (POM elements) | Plan Block C as post-conditions | Generalises to npm `package.json` fields, pyproject `project.urls` |
| Secrets staleness | 1.6 | Plan Block C + Run step 1.4 | Per-secret freshness threshold |
| Changelog generation | 1.7 | Plan Block B + Run step 1.5 | Driven by `version-bump-rule` |
| Tag-triggered release | 3.1–3.3 | Plan Block C + Run step 7 | Frees ship from doing the publish itself |
| Recovery playbooks | 4 (signing, 401) | Plan Block F | Captures org knowledge across runs |
| Propagation poll | 5.1–5.3 | Plan Block D + Run step 9 | "Task succeeded ≠ artifact published" — second-highest-value lift |
| Post-release bump | 6.1 | Plan Block B + Run step 10 | Optional per plan |
| Final summary report | 6.3 | Run chat return | Maps to existing chat-return contract |

| Skipped | From release | Why |
|---|---|---|
| Hard-coded GPG fingerprint, Sonatype URLs, Maven coordinates | All over | Project-level; lives in plan |
| `gpg --export-secret-keys` inline command | 1.6 | Belongs in a recovery playbook, not the reference body |
| "Stop and ask user to commit/stash" | 1.2 | Already handled by handoff readiness gate |

---

## 4. New plan-authoring command

### 4.1 Surface

Add `init-ship-plan` to the `wf-meta` router (skill-mode router consistency).

```
/wf-meta init-ship-plan [--from-template <kind>]
```

`<kind>` ∈ `{ kotlin-maven-central, npm-public, pypi, container-image, server-deploy, library-internal }`. Each template seeds Blocks A–G with sensible defaults; the user fills in project-specific fields via AskUserQuestion + freeform.

### 4.2 Plan-author flow

```
0  Orient. STOP if .ai/ship-plan.md exists with "Plan exists. Use /wf-meta amend ship-plan to edit."

1  AskUserQuestion: ship-meaning (publish | merge-only | deploy-immutable | deploy-rolling | feature-flag-flip)

2  AskUserQuestion: ship-environments (multi-select from common + freeform), ordered

3  AskUserQuestion: version-scheme (semver | calver | sequential | none)

4  Discover version-source-of-truth via Glob/Read (package.json, pyproject.toml, build.gradle.kts, Cargo.toml, *.csproj, etc.). Confirm or amend.

5  AskUserQuestion: version-bump-rule. If git-cliff, capture cmd. If conventional-commits, capture commitlint config path.

6  AskUserQuestion: release-trigger. If tag-on-main, discover .github/workflows/*.yml and pick the release workflow.

7  AskUserQuestion: required-secrets. Pre-fill from template, edit interactively.

8  AskUserQuestion: post-publish-checks. Template-driven: user picks which kinds apply (registry-api, fresh-resolve, github-release, smoke-test, k8s-rollout-status).

9  AskUserQuestion: rollout-strategy + rollback-mechanism.

10 Freeform: announcement channels.

11 Recovery playbooks: start empty (built up over time as runs hit failures and amend the plan).

12 Write .ai/ship-plan.md.

13 Print the next-step suggestion: "/wf ship <slug>".
```

The plan-author flow is itself a workflow stage from the user's perspective, but it doesn't write to `.ai/workflows/`. It writes once, at repo level, to `.ai/ship-plan.md`.

### 4.3 Amend flow

`/wf-meta amend ship-plan` opens the plan, lets the user pick which block to edit (A–G), runs the relevant questions for that block only, and bumps `plan-version`. Runs subsequent to an amendment record the new `plan-version-at-run`, which is useful for retro analysis ("did the rollout strategy change between v1.4.0 and v1.4.1?").

---

## 5. New `wf-meta` sub-command additions

| Sub-command | Purpose |
|---|---|
| `init-ship-plan` | First-time plan author |
| `amend ship-plan` | Edit one block of an existing plan |

The router's existing `amend` already takes `<scope> <target>` — `amend ship-plan` fits naturally. Only `init-ship-plan` is new.

Update needed:
- `plugins/sdlc-workflow/skills/wf-meta/SKILL.md` — add `init-ship-plan` to the known-keys list and the argument-hint
- `plugins/sdlc-workflow/skills/wf-meta/reference/init-ship-plan.md` — new file
- `plugins/sdlc-workflow/skills/wf-meta/reference/amend.md` — extend to handle `ship-plan` scope

---

## 6. Phasing — four PRs

Each independently revertable. Order chosen to land lowest-risk lifts first; ship-plan/run split lands last because it's the largest behavioural change.

### PR-1: Handoff PR-readiness block — non-triage parts

Lands T3.5 (commitlint), T3.6 (public-surface drift), T3.7 (doc-mirror regen), T5.2 (rebase onto base), T5.3 (live readiness check). Does **not** include T5.1 triage loop.

- Edit `skills/wf/reference/handoff.md`: insert new steps; add new frontmatter fields; document new `00-index.md` config keys.
- Add fixtures + tests: a synthetic workflow with `public-surface` set, a workflow with `docs-mirror` set, one without either (verify silent skip).
- Verify on a real branch: run `/wf handoff <slug>` against an open PR with a base-branch ahead of HEAD.

### PR-2: Handoff PR comment triage loop (T5.1)

Lands the triage loop. Larger because it touches `/wf implement <slug> <slice> reviews` flow.

- Confirm `/wf implement <slug> <slice> reviews` already accepts a thread-id list; extend if not.
- Edit `skills/wf/reference/handoff.md`: insert T5.1 between T5 and T5.2. Document the loop bound, deferred-thread frontmatter, classification rules.
- Default `review-bots:` list lives in `skills/wf/reference/handoff.md`; `00-index.md` override documented.
- Test against a real PR with a CodeRabbit comment thread.

### PR-3: Ship plan + plan-author command

Lands the plan artifact and `/wf-meta init-ship-plan` only. Run still uses today's `09-ship.md` flow.

- Add `skills/wf-meta/reference/init-ship-plan.md`.
- Update `skills/wf-meta/SKILL.md` argument-hint and known-keys list.
- Add 6 plan templates under `skills/wf-meta/reference/ship-plan-templates/<kind>.md`.
- Schema validation: extend `wf-validate` pre-write hook (if present) to validate `.ai/ship-plan.md` schema.
- Verify by authoring a plan for the sdlc-workflow plugin's own release flow (eat the dogfood).

### PR-4: Ship run split + replayable run sequence

Lands `09-ship-run-<run-id>.md` per-run artifact and `09-ship-runs.md` index. Rewrites `skills/wf/reference/ship.md` to read the plan, build a run, and follow the new 13-step sequence.

- Edit `skills/wf/reference/ship.md`: replace the body with the plan-driven sequence. Keep the External Output Boundary preamble verbatim.
- Add deprecation note for legacy `09-ship.md`: new code never writes it; old workflows can still be read.
- Recovery playbooks: dispatch logic (match error → present playbook → AskUserQuestion to confirm each step).
- Resume logic: detect `status: awaiting-input` from prior run, offer to resume.
- Verify by shipping the next sdlc-workflow plugin release through the new ship sequence.

---

## 7. Hard constraints

- **Backwards compatibility for existing workflows.** Workflows with an existing `09-ship.md` keep working. Reading them is fine; writing them is gone. `/wf-meta status` and `/wf-meta resume` must handle both old and new ship artifacts.
- **No semantic changes to `/wf implement`, `/wf review`, `/wf verify`, `/wf retro`.** This plan touches only handoff and ship.
- **Per-project plan placement.** `.ai/ship-plan.md` at repo root. Not under `.ai/workflows/`. Not under `.claude/`. The plan is repo-scoped; workflows are feature-scoped.
- **External Output Boundary still applies.** Every internal reference (workflow paths, sub-command names, run-ids) must be translated to product language before going into PR bodies, release notes, announcement messages.
- **PR readiness block does not run for `branch-strategy: none`.** The block requires a remote PR to inspect.
- **Idempotency invariants per run step.** Re-running step N when N already completed must be a no-op + note, not a duplicate side-effect. This is the load-bearing property of the run split.

---

## 8. Risks + mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Plan schema drift between projects | Plan written for project A doesn't validate against schema in newer plugin version | `plan-version` field + plugin-side migration layer; `/wf-meta amend ship-plan` offers to upgrade |
| PR triage loop infinite ping-pong with bots | Handoff never finishes if bot re-comments after every fix | 5-iteration bound; after bound, `status: awaiting-input` and stop |
| Recovery playbook fires on false-positive error match | User is asked to follow steps that don't apply | Each playbook has a `triggers:` regex array; user always confirms before executing each step |
| `force-with-lease` push fails because remote moved during triage | Rebase retry needed | Loop the rebase step once on lease failure; if still fails, route to `/wf implement` |
| User runs `/wf ship` without ever authoring a plan | Hard stop with no path forward | Ship explicitly errors with "Run /wf-meta init-ship-plan first" + the `--from-template <kind>` shortcut |
| Plan templates miss a project shape | User has to author from scratch | Templates are seeds, not requirements; user can amend any block. Six templates cover the common cases |
| Run accumulation grows the workflow folder unboundedly | `09-ship-run-*.md` files pile up | Cheap (~5KB each); future iteration can add `/wf-meta close <slug> --archive-runs` to compress old runs |

---

## 9. Verification harness

Per PR, before merge:

1. **Schema check** — every artifact written by the changed reference passes `wf-validate` schema validation.
2. **Snapshot diff** — run the new reference against a synthetic workflow fixture; compare artifact output to a checked-in snapshot. Mechanical changes only; behavioural deltas reviewed manually.
3. **Real-PR smoke test** — run the changed reference against a live throwaway PR in a sandbox repo. Confirm no destructive operations (no force-push to wrong branch, no PR merged unintentionally).
4. **Backwards compat check** — read an old workflow's `09-ship.md` via `/wf-meta status`; confirm no error.

---

## 10. Open questions left for implementation

1. **Should the PR-readiness block run on every `/wf handoff` invocation, or only on the first?** Re-running handoff today re-creates the artifact; a re-run probably *should* re-triage new comments. Lean: always re-run the readiness block, idempotent on each step.
2. **Where do project-level overrides for handoff config live long-term?** Today: `00-index.md`. Tomorrow: maybe `.ai/project.md` (mirror of `.ai/ship-plan.md`). Defer until a second consumer needs the same fields.
3. **Should `init-ship-plan` be its own slash command (`/wf-init-ship-plan`) or stay as `/wf-meta init-ship-plan`?** Lean: stay under `/wf-meta` for router-discipline reasons (init = setup = navigation/management).
4. **Diátaxis docs in handoff vs. announcements in ship — overlap?** Both write user-facing prose. Handoff Diátaxis = product-doc updates; ship announcement = release notification. Different audiences, different cadence; keep separate.
5. **How does this interact with the `wf-validate` pre-write hook?** Adding new artifact types (`ship-plan`, `ship-run`, `ship-runs-index`) means new schemas. PR-3 and PR-4 must update the validator in lockstep.

---

## 11. Decision log

| Decision | Made on | Notes |
|---|---|---|
| Plan-per-project (not per-workflow) | 2026-05-10 | "ship is a project-level contract" was the framing |
| Accumulating run history | 2026-05-10 | Audit trail beats workflow-folder size |
| Plan authoring split from runs | 2026-05-10 | Different tasks, different cadence, different audience |
| PR comment triage stays in handoff | 2026-05-10 | Triage = "is this PR ready" = handoff's existing job |
| Surface drift / doc-mirror config in `00-index.md` | 2026-05-10 | Provisional; revisit if shared across workflows |
| 5-iteration triage bound | 2026-05-10 | Default; tunable per project later if needed |
| Templates: kotlin-maven-central, npm-public, pypi, container-image, server-deploy, library-internal | 2026-05-10 | Cover the common ship-meaning shapes; extensible |
