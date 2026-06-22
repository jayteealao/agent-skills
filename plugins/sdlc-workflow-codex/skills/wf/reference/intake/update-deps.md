---
description: Dependency update STANDARD lifecycle. Scans manifests, researches each dependency, prioritizes by risk into P0/P1/P2 tiers, then drives the full SDLC sequence in-slug (01-update-deps → 02-shape research → 03-slice → 04-plan → gate → self-authored 05-implement/06-verify tiered exec → review) on a full type:index overview. Unlike the other change-modes, update-deps SELF-AUTHORS 05/06 (its tier-ordered execution is specialized) then routes to $wf review.
argument-hint: [package-name|--security-only|--audit-only]
---

# Output boundary & shared context
Load `reference/intake/_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, the workflow-registry / slug rules, **and the "Compressed-lifecycle change-modes" contract (the model, the authorship split, and the gate)**. Do not restate them here.

You are running `$wf intake update-deps`, a **dependency maintenance standard lifecycle**.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `reference/_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-update-deps-<descriptor>.md` (`type: slice`, `slice-type: update-deps`, `compressed: true`, `origin: intake/update-deps`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `update-deps → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline
`01-update-deps`(intake, scan) → `02-shape` (research + prioritize) → `03-slice` → `04-plan` (tiered commands) → **[gate]** → **self-authored** `05-implement` + `06-verify` (tier-ordered) → `$wf review` → `$wf handoff` → `$wf ship`

| | Detail |
|---|---|
| Requires | A project with a package manifest (`package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml`, `pubspec.yaml`, etc.). |
| Produces (this command) | In-slug standard artifacts under `.ai/workflows/<slug>/`: `01-update-deps.md` (`type: intake`, scan), `02-shape.md` (research + priority tiers), `03-slice.md` (`type: slice-index`), `04-plan.md` (tiered commands), and — because update-deps self-authors execution — `05-implement.md` + `06-verify.md`, plus a conformant `00-index.md` (`type: index`). |
| Slug | `update-deps-<YYYYMMDD>` (e.g. `update-deps-20260619`). Keep a `run-id` field on the lead for continuity with legacy `.ai/dep-updates/` runs. |
| No argument | Scan and update all dependencies. |
| `<package-name>` | Focus on a single named package. |
| `--security-only` | Prioritize and update only CVE-affected packages. |
| `--audit-only` | Run scan + research + plan only — STOP at the gate after `04-plan`, do not implement. |
| Exception | update-deps is the one change-mode that **self-authors `05`/`06`** (tier-ordered exec is specialized). `$wf implement` and `$wf verify` redirect it back here; only `$wf review` accepts it. |

# CRITICAL — execution discipline
You are a **dependency update orchestrator**.
- Do NOT make application code changes beyond what a dependency update forces (e.g., API changes from a major bump).
- Do NOT edit lock files manually — always use the package manager's own commands (`npm update`, `pip install --upgrade`, `go get`, `cargo update`, …).
- Do NOT batch major version updates across packages in one commit. Major updates go one at a time.
- If an update causes non-trivial test failures → mark that package `blocked` and continue. Surface the blocker; do not fix application code to force tests green.
- The lifecycle skips no *stage* — each is single-pass. Follow the steps exactly in order.

# Step 0 — Orient (MANDATORY)
1. **Parse arguments** from `$ARGUMENTS`: no arg → `mode: all`; package name → `mode: single`, `target-package`; `--security-only` → `mode: security-only`; `--audit-only` → `mode: audit-only` (stop at the gate after `04-plan`).
2. **Resolve slug / resume:** new run → slug `update-deps-<YYYYMMDD>` (`date +"%Y%m%d"`). If `.ai/workflows/<slug>/00-index.md` exists with `workflow-type: update-deps` → resume from the first unwritten artifact. (Legacy `.ai/dep-updates/<run-id>/` runs still validate + render via fallback; new runs are in-slug.)
3. **Identify package manager(s):** read the project root for manifests; a project may have several (Node frontend + Python backend). List all.
4. **Branch:** default `branch-strategy: dedicated`, branch `deps/<slug>`. Create off the current base if absent.
5. **Single slice.** The whole update is one slice (`slice-slug` = `<slug>`); the P0/P1/P2 tiers are organized *within* the slice/plan/implement bodies (so the un-suffixed single `05-implement.md`/`06-verify.md` capture the tiered execution).

# Step 1 — Scan → `01-update-deps.md` (`type: intake`)
Read all manifests and produce a complete inventory. For each: read the manifest, run the package manager's outdated/audit command (Node `npm outdated --json` + `npm audit --json`; Python `pip list --outdated` + `pip-audit`/`safety check`; Go `go list -u -m all` + `govulncheck ./...`; Rust `cargo outdated` + `cargo audit`; Java `mvn versions:display-dependency-updates` / `gradle dependencyUpdates`). For `mode: single`, filter to the target; for `security-only`, identify CVE packages.
```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
workflow-type: update-deps
run-id: deps-<YYYYMMDD-HHMM>   # continuity with legacy .ai/dep-updates/ runs
mode: <all|single|security-only|audit-only>
status: complete
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: [deps]
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-shape
next-invocation: "$wf shape <slug>"
---
```
Body: open with `## The Dependency Update` — the story section (1–2 short paragraphs in the voice of `../_narrative-voice.md`: relevance first, tradeoffs plain, no "This dependency update implements…" opening) — then `## Security Vulnerabilities` (CVEs: severity, package, fix version), `## Outdated Packages` (table: package | current | latest | update-type | days-behind), `## Up to Date` (count only).

# Step 2 — Research + prioritize → `02-shape.md`
For each package that needs updating, launch parallel web-research sub-agents in batches of 3–5.

**Model for every dispatched batch agent:** `haiku`. REQUIRED — each does web search + structured extraction (versions, breaking changes, migration steps, CVEs, compatibility) per package; bounded extraction.

Each batch agent returns per package: current/latest version, update-type, breaking changes, migration steps, CVEs, compatibility, recommendation (update-now / update-with-migration / hold).

Then **prioritize** into tiers: **P0 Security** (active CVE with a fix → update immediately, one at a time), **P1 Major+migration** (breaking changes → one at a time), **P2 Minor/patch safe** (batch up to 10), **Hold** (incompatible / peer-blocked / recommended hold). Write `02-shape.md`:
```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
status: complete
stage-number: 2
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
docs-needed: false
docs-types: []
tags: [deps]
refs:
  index: 00-index.md
  intake: 01-update-deps.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "$wf slice <slug>"
---
```
Body: one `## <package>` section each (current/latest, CVEs, breaking changes, migration steps, recommendation, reason), then `## Priority Groups` (the four tiers with their packages), then `## In Scope` / `## Out of Scope` (the Hold tier).

# Step 3 — Slice → `03-slice.md` (`type: slice-index`, one slice)
```yaml
---
schema: sdlc/v1
type: slice-index
slug: <slug>
status: complete
stage-number: 3
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
total-slices: 1
best-first-slice: <slug>
slices:
  - slug: <slug>
    status: defined
    complexity: <s|m|l>
tags: [deps]
refs:
  index: 00-index.md
  shape: 02-shape.md
  next: 04-plan.md
next-command: wf-plan
next-invocation: "$wf plan <slug>"
---
```
Body: "Single-slice dependency update — executed in P0 → P1 → P2 tier order (see `04-plan.md`)."

# Step 4 — Plan → `04-plan.md` (tiered commands)
```yaml
---
schema: sdlc/v1
type: plan
slug: <slug>
slice-slug: <slug>
status: complete
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-to-touch: <int>
metric-step-count: <int>
has-blockers: false
revision-count: 0
tags: [deps]
refs:
  index: 00-index.md
  slice: 03-slice.md
  next: 05-implement.md
next-command: wf-implement
next-invocation: "$wf review <slug>"   # update-deps self-authors 05/06, then reviews
---
```
Body: `## P0 — Security` / `## P1 — Major+migration` / `## P2 — Safe batch` / `## Hold` — each package with the exact update command, test command, what to verify, and rollback command (Hold: reason + revisit condition).

## Step — Write free narrative fragments
Author free narrative fragments for any artifact per the narrative-fragment tier of `_intake-context.md` (a per-tier update table or a CVE-burndown chart tells a deps story well).

# Step 5 — Write `00-index.md` (conformant `type: index`)
Write the full 22-field `type: index` overview using the template from [intake/default.md](default.md):
```yaml
---
schema: sdlc/v1
type: index
slug: <slug>
title: "Dependency update <YYYY-MM-DD>"
workflow-type: update-deps
status: active
current-stage: plan
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
selected-slice: <slug>
branch-strategy: dedicated
branch: "deps/<slug>"
base-branch: "<main|master>"
review-scope: slug-wide
pr-url: ""
pr-number: 0
open-questions: []
tags: [deps]
next-command: wf-review
next-invocation: "$wf review <slug>"
workflow-files:
  - 00-index.md
  - 01-update-deps.md
  - 02-shape.md
  - 03-slice.md
  - 04-plan.md
slices:
  - slug: <slug>
    status: defined
    complexity: <s|m|l>
progress:
  intake: complete
  shape: complete
  slice: complete
  plan: complete
  implement: not-started
  verify: not-started
  review: not-started
  handoff: not-started
  ship: not-started
  retro: not-started
---
```
Then **register the slug in `.ai/workflows/INDEX.md`** per `intake/default.md` Step 10.

# Step 6 — Gate before implement (MANDATORY)
Apply the **compressed-lifecycle gate** from `_intake-context.md` — for update-deps offer the tier-aware options:
```
AskUserQuestion:
  question: "Dependency update plan ready. P0: <N> security · P1: <N> major · P2: <N> safe · Hold: <N>. Proceed?"
  options:
    - Proceed with full plan
    - Proceed with P0 security updates only
    - Audit-only — save plan, do not implement
    - Adjust plan (describe changes)
```
**If `mode: audit-only`** (or the user picks Audit-only) → STOP here. The plan is saved; do not implement. Record the decision in `01-update-deps.md`.

# Step 7 — Self-author `05-implement.md` (tier-ordered execution)
Execute the plan in tier order. **Never mix tiers in a single commit.**
- **P0 (sequential):** per package — update, run any migration steps, run the test command; pass → commit `fix(deps): update <pkg> to <version> (CVE-<id>)`; fail → mark `blocked`, document, continue.
- **P1 (sequential):** per package — migrate, apply only the API-forced app-code changes, test; pass → commit `fix(deps): update <pkg> to <version> (major, migration applied)`; fail → `blocked`.
- **P2 (single batch):** batch-update, run full suite; pass → commit `fix(deps): batch update <N> safe dependencies`; fail → bisect/rollback the culprit, mark it `blocked`.

Write `05-implement.md` (un-suffixed) — satisfies the **implement** required set:
```yaml
---
schema: sdlc/v1
type: implement
slug: <slug>
slice-slug: <slug>
status: complete
stage-number: 5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-changed: <int>          # manifests + lockfiles touched
metric-lines-added: <int>
metric-lines-removed: <int>
metric-deviations-from-plan: <int>   # e.g. packages that became blocked
metric-review-fixes-applied: 0
commit-sha: "<last tier commit sha, or 'multiple'>"
tags: [deps]
refs:
  index: 00-index.md
  plan: 04-plan.md
  next: 06-verify.md
next-command: wf-verify
next-invocation: "$wf review <slug>"
---
```
Body: `## Updated` (package@version per tier with commit SHA), `## Blocked` (package — reason), `## Held`.

# Step 8 — Self-author `06-verify.md`
Run the full suite against the updated state: complete test suite (not just targeted), the build (`npm run build` / `go build ./...` / `cargo build`), integration/E2E if present; confirm no blocked package left an inconsistent lockfile. Write `06-verify.md` (un-suffixed) — satisfies the **verify** required set:
```yaml
---
schema: sdlc/v1
type: verify
slug: <slug>
slice-slug: <slug>
status: complete
stage-number: 6
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
result: <pass|partial|fail>          # partial is valid: some updated, some blocked
metric-checks-run: <int>
metric-checks-passed: <int>
metric-acceptance-met: <int>
metric-acceptance-total: <int>
metric-interactive-checks-run: 0
metric-interactive-checks-passed: 0
metric-issues-found: <int>           # blocked packages
evidence-dir: ""
tags: [deps]
refs:
  index: 00-index.md
  implement: 05-implement.md
  next: 07-review.md
next-command: wf-review
next-invocation: "$wf review <slug>"
---
```
Body: `## Test Result` (pass/fail/skip), `## Build`, `## Blocked packages` (remaining at old version + why). `result: partial` is valid when some packages updated and some are blocked.

# Step 9 — Route to review
On a `pass`/`partial` verify, route to **`$wf review <slug>`** (review recognizes `workflow-type: update-deps` and reviews the un-suffixed `05`/`06` against `01-update-deps.md` + `03-slice.md`). Then `$wf handoff` → `$wf ship`.

Lead with a short **narrative** paragraph (what was scanned, the tier counts, what updated vs blocked, the verify result), then:
```
wf intake update-deps complete: <slug>
Branch: deps/<slug>
Tiers: P0 <n> · P1 <n> · P2 <n> · Hold <n>
Updated: <n> · Blocked: <n> · Verify: <pass|partial|fail>
Next: $wf review <slug>  →  $wf handoff  →  $wf ship
```

# Workflow rules
- Store artifacts **in-slug** under `.ai/workflows/<slug>/` (legacy `.ai/dep-updates/<run-id>/` runs still validate + render via fallback, but new runs are in-slug).
- **Every artifact MUST have YAML frontmatter** with `schema: sdlc/v1`. **Timestamps must be real** — run `date -u +"%Y-%m-%dT%H:%M:%SZ"`.
- Always use the package manager's own commands — never edit lockfiles directly. Never mix security updates with major migrations in one commit. Web-search every package being updated — don't rely solely on `npm outdated`.
- Review is not skipped — update-deps self-verifies (`06-verify.md`) then routes to `$wf review`.
