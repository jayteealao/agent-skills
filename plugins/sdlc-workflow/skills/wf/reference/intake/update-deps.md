---
description: Dependency update STANDARD lifecycle. Scans manifests, researches each dependency, prioritizes by risk into P0/P1/P2 tiers, then drives the full SDLC sequence in-slug (01-update-deps → 02-shape research → 03-slice → 04-plan → gate → self-authored 05-implement/06-verify tiered exec → review) on a full type:index overview. Unlike the other change-modes, update-deps SELF-AUTHORS 05/06 (its tier-ordered execution is specialized) then routes to /wf review.
argument-hint: "[package-name|--security-only|--audit-only|<existing-run-slug to resume>]"
---

# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary and the workflow-registry / slug rules. Apply **the "Compressed-lifecycle change-modes" contract in `intake/_change-mode-tail.md` (the model, the authorship split, and the gate)**. Do not restate them here.

You are running `/wf intake update-deps`, a **dependency maintenance standard lifecycle**.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `../_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one draft `.ai/workflows/<slug>/.draft/03-slice-update-deps-<descriptor>.md` and put it with `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` (per [_records.md](../_records.md); `type: slice`, `slice-type: update-deps`, `compressed: true`, `origin: intake/update-deps`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `update-deps → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline
`01-update-deps`(intake, scan) → `02-shape` (research + prioritize) → `03-slice` → `04-plan` (tiered commands) → **[gate]** → **self-authored** `05-implement` + `06-verify` (tier-ordered) → `/wf review` → `/wf ship` → `/wf retro`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces (this command) | In-slug standard artifacts under `.ai/workflows/<slug>/`: `01-update-deps.md` (`type: intake`, scan), `02-shape.md` (research + priority tiers), `03-slice.md` (`type: slice-index`), `04-plan.md` (tiered commands), and — because update-deps self-authors execution — `05-implement.md` + `06-verify.md`, plus a conformant `00-index.md` (`type: index`). |
| Slug | `update-deps-<YYYYMMDD>` (e.g. `update-deps-20260619`). Keep a `run-id` field on the lead for continuity with legacy `.ai/dep-updates/` runs. |
| No argument | Scan and update all dependencies. |
| `<package-name>` | Focus on a single named package. |
| `<existing-run-slug>` | **Resume** — a bare token that exactly matches an existing `workflow-type: update-deps` slug (e.g. `update-deps-20260619`) resumes that run from its first unwritten artifact. Any other bare token is a package name. |
| `--security-only` | Prioritize and update only CVE-affected packages. |
| `--audit-only` | Run scan + research + plan only — STOP at the gate after `04-plan`, do not implement. The lawful terminus is `/wf intake <slug> close deferred` (see Step 6). |
| Exception | update-deps is the one change-mode that **self-authors `05`/`06`** (tier-ordered exec is specialized). `/wf implement` and `/wf verify` redirect it back here; only `/wf review` accepts it. |

## Card

The rules of Steps 6 to 9 when a driver runs them (`/wf yolo`), with nobody to ask:

- The Step 6 gate answer is "Proceed with full plan": run every planned tier. Never treat the run as audit-only.
- Run P0 security updates one package at a time, then P1 major updates one at a time, then the P2 safe updates in one batch. Apply only the app-code changes that the bump forces.
- Never mix a security update and a major migration in one commit. Never edit a lockfile by hand: use the package manager.
- When the tests or the build of a package fail, record the package as blocked in `05-implement.md`, with the reason, and continue. A run that updates some packages and blocks others is `result: partial`, not a stop.
- Write `06-verify.md` from the full suite and the build. Defer an acceptance criterion only by the law of `verify/_deferrals.md`, once, with the probe of this run.
- Stop after `06-verify.md`. Do not run the review or the handoff.

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| a package manifest | artifact | always | |
| `00-index.md` | artifact | on-resume | |
| `01-update-deps.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_change-mode-tail.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `design/stage.md` | procedure | mode:design | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `intake/update-deps/_exec-artifacts.md` | procedure | always | |
| `01-update-deps.md` | writes | | |
| `02-shape.md` | writes | | |
| `03-slice.md` | writes | | |
| `04-plan.md` | writes | | |
| `05-implement.md` | writes | | |
| `06-verify.md` | writes | | |

# Role
You are a **dependency update orchestrator**; the lifecycle skips no *stage* (each is single-pass), and the stated order binds only where a step consumes an earlier step's output or crosses a gate.
- Do not make application code changes beyond what a dependency update forces (e.g., API changes from a major bump).
- Do not edit lock files manually — always use the package manager's own commands (`npm update`, `pip install --upgrade`, `go get`, `cargo update`, …).
- Do not batch major version updates across packages in one commit. Major updates go one at a time.
- If an update causes non-trivial test failures → mark that package `blocked` and continue. Surface the blocker; do not fix application code to force tests green.

# Step 0 — Orient
1. **Parse arguments** from `$ARGUMENTS`: no arg → `mode: all`; a bare token that exactly matches an existing `workflow-type: update-deps` slug on disk → **resume that run** (this check runs before the package-name reading — a slug is not a package); any other bare token → `mode: single`, `target-package`; `--security-only` → `mode: security-only`; `--audit-only` → `mode: audit-only` (stop at the gate after `04-plan`).
2. **Resolve slug / resume:** new run → slug `update-deps-<YYYYMMDD>` (the date-only row of [_timestamp.md](../_timestamp.md), dashes removed). If the index of `<slug>` exists (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) with `workflow-type: update-deps` → resume from the first unwritten artifact. (Legacy `.ai/dep-updates/<run-id>/` runs still validate + render via fallback; new runs are in-slug.) Apply the collision check in `_change-mode-tail.md` if the slug exists with a different type.
3. **Prior-run provenance:** apply `_intake-provenance.md` (update-deps row). Scan `.ai/workflows/INDEX.md` for the most recent prior `workflow-type: update-deps` run; when one exists, read its `02-shape.md` Hold tier and `05-implement.md` Blocked list (`record get "<root>" <prior-slug> <name>`) and seed this run's Step 2 research from them — re-check each recorded revisit condition instead of cold-re-deriving last month's Hold research. Record `origin-update-deps: <prior-slug>` on the index when consumed.
4. **Stack fingerprint:** apply the stack policy in `_change-mode-tail.md` — detect cheaply, write the block with `user-confirmed: false` (update-deps asks no planning questions; its self-authored verify carries the caveat). Write `ux-impact: none` and `progress.design: skipped` with `design-skip-reason: dependency update; no intended design change`. When a P1 package is a UI framework, component, or styling package, review selects the `design-audit` dimension (`review/_select.md`) and checks the rendered surfaces for drift.
5. **Identify package manager(s):** read the project root for manifests; a project may have several (Node frontend + Python backend). List all.
6. **Branch:** default `branch-strategy: dedicated`, branch `deps/<slug>`. Create off the current base if absent.
7. **Single slice.** The whole update is one slice (`slice-slug` = `<slug>`); the P0/P1/P2 tiers are organized *within* the slice/plan/implement bodies (so the un-suffixed single `05-implement.md`/`06-verify.md` capture the tiered execution).

# Step 1 — Scan → `01-update-deps.md` (`type: intake`)
Read all manifests and produce a complete inventory. For each: read the manifest, run the package manager's outdated/audit command (Node `npm outdated --json` + `npm audit --json`; Python `pip list --outdated` + `pip-audit`/`safety check`; Go `go list -u -m all` + `govulncheck ./...`; Rust `cargo outdated` + `cargo audit`; Java `mvn versions:display-dependency-updates` / `gradle dependencyUpdates`). For `mode: single`, filter to the target; for `security-only`, identify CVE packages. Write the draft `.ai/workflows/<slug>/.draft/01-update-deps.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. Write the draft of each later record of this run and put it the same way.
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
next-command: <next-command>
next-invocation: "<next-invocation>"
recommended-routes: <routes>
---
```
Body: `## Security Vulnerabilities` (CVEs: severity, package, fix version), `## Outdated Packages` (table: package | current | latest | update-type | days-behind), `## Up to Date` (count only).

# Step 2 — Research + prioritize → `02-shape.md`
For each package that needs updating, launch parallel web-research sub-agents in batches of 3–5.

**Effort tier for every dispatched batch agent:** **low** (per [_subagents.md](../_subagents.md)). REQUIRED — each does web search + structured extraction (versions, breaking changes, migration steps, CVEs, compatibility) per package; bounded extraction.

Each batch agent returns per package: current/latest version, update-type, breaking changes, migration steps, CVEs, compatibility, recommendation (update-now / update-with-migration / hold).

**Authoritative source — REQUIRED per package.** Web search is the discovery net, but each agent must ground its breaking-changes + migration-steps in the package's **own changelog or release notes**, not blog posts or Q&A. In priority order, fetch and read: (1) the `CHANGELOG.md` / `HISTORY` / `NEWS` in the package repo, (2) the GitHub/GitLab **Releases** page for the target version range, (3) an official upgrade/migration guide if one exists. Read **every intermediate major** between current and latest — a 3→6 jump means reading the 4.0, 5.0, and 6.0 notes, since breaking changes stack. Record the exact **source URL(s)** consulted and the **highest version whose notes were actually read**. If no authoritative changelog can be located for a P0/P1 package, do NOT infer "no breaking changes" — mark it `changelog: unverified` and recommend `hold` (or manual review); a missing changelog is a risk signal, not an all-clear.

**When the changelog can't settle it, read the source.** For a P0/P1 package whose changelog is `unverified`, ambiguous, or silent on a symbol the repo actually calls, invoke the `study-sources` skill to fetch the **target version's real source** (source JAR, `npm pack`, sdist, `go mod download`, the Cargo/NuGet cache, or a clone of the release tag into `.scratch/`) and diff its changed API against the current usage. Reading the real diff turns an `unverified` guess into a cited migration fact — record the version you read alongside `changelog-source:`. This is a read-only study step; it never installs or runs the candidate version.

**A limitation claim carries its evidence.** Any claim that a capability was REMOVED, broke, or is no longer exposed by the target version must cite it in the artifact: the changelog/release line that announces the removal (`changelog-source:` URL), a `study-sources` read of the target version's **installed** source (name the path opened), or an upstream issue. Do not infer removal from a remembered API or from an in-repo comment — a comment claiming a limitation is a hypothesis to re-verify, never authority to plan a migration around. An uncited "the new version dropped X" drops the package to `Hold: changelog unverified`.

Then **prioritize** into tiers: **P0 Security** (active CVE with a fix → update immediately, one at a time), **P1 Major+migration** (breaking changes → one at a time), **P2 Minor/patch safe** (batch up to 10), **Hold** (incompatible / peer-blocked / recommended hold). Write the draft of `02-shape.md` and put it:
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
next-command: <next-command>
next-invocation: "<next-invocation>"
recommended-routes: <routes>
---
```
Body: one `## <package>` section each (current/latest, CVEs, breaking changes, migration steps, recommendation, reason, **`changelog-source:` URL(s) + `changelog-read-through:` the highest version whose notes were read, or `unverified`**), then `## Priority Groups` (the four tiers with their packages), then `## In Scope` / `## Out of Scope` (the Hold tier). **Every P1 (major+migration) package's migration steps must cite the changelog source they derive from** — an uncited P1 migration is not plan-ready and drops to `Hold: changelog unverified`.

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
next-command: <next-command>
next-invocation: "<next-invocation>"
recommended-routes: <routes>
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
next-command: <next-command>
next-invocation: "<next-invocation>"
recommended-routes: <routes>
---
```
Body: `## P0 — Security` / `## P1 — Major+migration` / `## P2 — Safe batch` / `## Hold` — each package with the exact update command, test command, what to verify, and rollback command (Hold: reason + revisit condition). Then `## Tripwire breaches` (only if any fired — per `_change-mode-tail.md`; the update-deps tripwires are: a P1 migration without a cited changelog · a Hold entry without a revisit condition · mixed tiers forced into one commit by tooling).

# Step 5 — Write `00-index.md` (conformant `type: index`)
Write the draft of `00-index.md` from the shared change-mode index template in [_change-mode-tail.md](_change-mode-tail.md) with the `update-deps` column values (`mode: <all|single|security-only|audit-only>` mirrored onto the index frontmatter as an extra key; `origin-update-deps` when Step 0 consumed a prior run; `stack.user-confirmed: false`). Put it.

# Step 6 — Gate before implement
Apply the gate and the family gate rules in [_change-mode-tail.md](_change-mode-tail.md) — for update-deps ask per the gate-question ladder ([_gate-question.md](../_gate-question.md)) with the tier-aware options:
```
question: "Dependency update plan ready. P0: <N> security · P1: <N> major · P2: <N> safe · Hold: <N>. Proceed?"
options:
  - Proceed with full plan
  - Proceed with P0 security updates only
  - Audit-only — save plan, do not implement
  - Adjust plan (describe changes)
```
**Record the gate decision in `01-update-deps.md` on every branch** (full plan / P0-only / audit-only / adjusted), per the tail. **If `mode: audit-only`** (or the user picks Audit-only) → the run ends lawfully, not in a deadlock:
1. Push every Hold-tier entry onto the index's `open-questions` as `"revisit <package>: <condition>"` — the research survives as machine-readable revisit triggers.
2. Self-report to the index in one call, with the `open-questions` list of item 1: `record set "<root>" <slug> index mode=audit-only next-command=wf-close "next-invocation=/wf intake <slug> close deferred" "open-questions=[<current entries>, <revisit entries>]"`. Touch the registry row's `updated-at`.
3. STOP, printing: *"Audit saved. Close the run with `/wf intake <slug> close deferred` — the plan stays revivable; a future run seeds from its Hold list via provenance."* Do not point at `/wf review` (it refuses without `05-implement.md`) and do NOT leave `next-command` pointing at implementation that will never run.

# Step 7 — Self-author `05-implement.md` (tier-ordered execution)
Execute the plan in tier order. **Never mix tiers in a single commit.**
- **P0 (sequential):** per package — update, run any migration steps, run the test command; pass → commit `fix(deps): update <pkg> to <version> (CVE-<id>)`; fail → mark `blocked`, document, continue.
- **P1 (sequential):** per package — migrate, apply only the API-forced app-code changes, test; pass → commit `fix(deps): update <pkg> to <version> (major, migration applied)`; fail → `blocked`.
- **P2 (single batch):** batch-update, run full suite; pass → commit `fix(deps): batch update <N> safe dependencies`; fail → bisect/rollback the culprit, mark it `blocked`.

Write the draft of `05-implement.md` (un-suffixed) per [intake/update-deps/_exec-artifacts.md](update-deps/_exec-artifacts.md); it satisfies the **implement** required set (`next: 06-verify.md`, `next-command: wf-review`). Put it.
Body: `## Updated` (package@version per tier with commit SHA), `## Blocked` (package — reason **+ revisit condition**), `## Held`.

**Then self-report to `00-index.md`** — the stage completed, so the index must say so: run `record set "<root>" <slug> index current-stage=implement stage-number=5 progress.implement=complete "workflow-files=[<current entries>, 05-implement.md]"`, and touch the registry row's `updated-at`. A self-authored stage that skips this leaves the dashboard reading "unimplemented" forever.

# Step 8 — Self-author `06-verify.md`
Run the full suite against the updated state: complete test suite (not just targeted), the build (`npm run build` / `go build ./...` / `cargo build`), integration/E2E if present; confirm no blocked package left an inconsistent lockfile. Write the draft of `06-verify.md` (un-suffixed) per [intake/update-deps/_exec-artifacts.md](update-deps/_exec-artifacts.md) and put it; it satisfies the **verify** required set (`next: 07-review.md`).
Body: `## Test Result` (pass/fail/skip), `## Build`, `## Blocked packages` (remaining at old version + why **+ revisit condition**), `## Caveats` (the unconfirmed stack). Write the raw test and build output to `verify-evidence/<slug>/checks.md`. `result: partial` is valid when some packages updated and some are blocked.

**Then self-report to the index** again in one call: `record set "<root>" <slug> index current-stage=verify stage-number=6 progress.verify=complete "workflow-files=[<current entries>, 06-verify.md]" next-command=wf-review "next-invocation=/wf review <slug>"`, and touch the registry row. Blocked packages also land on the index's `open-questions` as `"revisit <package>: <condition>"` (in the same call) so the next run's provenance seed finds them without re-reading stage bodies.

# Step 9 — Route to review
On a `pass`/`partial` verify, route to **`/wf review <slug>`** (review recognizes `workflow-type: update-deps` and reviews the un-suffixed `05`/`06` against `01-update-deps.md` + `03-slice.md`). Then `/wf ship` → `/wf retro`.

Lead with a short **narrative** paragraph (what was scanned, the tier counts, what updated vs blocked, the verify result), then:
```
wf intake update-deps complete: <slug>
Branch: deps/<slug>
Tiers: P0 <n> · P1 <n> · P2 <n> · Hold <n>
Updated: <n> · Blocked: <n> · Verify: <pass|partial|fail>
Next: /wf review <slug>  →  /wf ship  →  /wf retro
```

# Workflow rules
Apply the shared workflow rules in [_change-mode-tail.md](_change-mode-tail.md). Update-deps-specific: store artifacts **in-slug** (legacy `.ai/dep-updates/<run-id>/` runs still validate + render via fallback); always use the package manager's own commands — never edit lockfiles directly; never mix security updates with major migrations in one commit; web-search every package being updated — don't rely solely on `npm outdated`; review is not skipped — update-deps self-verifies (`06-verify.md`) then routes to `/wf review`.
