# SDLC-Workflow

A Claude Code plugin that gives your AI assistant a structured software delivery lifecycle. Instead of ad-hoc prompts that produce inconsistent results, every feature, fix, or spike moves through the same reproducible sequence of stages — each one writing a permanent, machine-readable artifact to your repo that the next stage reads.

All artifacts use **YAML frontmatter** (`schema: sdlc/v1`) as the single source of machine-readable state. The markdown body is for human-readable narrative only. This means the same workflow files can power dashboards, kanban boards, dependency graphs, CI/CD gates, or any tool that reads YAML.

---

## Before you start

**Prerequisites**

- Claude Code with the sdlc-workflow plugin installed
- A project with a git working directory (artifacts are written under `.ai/workflows/`)
- Familiarity with running slash commands in Claude Code (`/command-name arguments`)

**What the plugin provides**

Eleven workflow commands, 30 individual review commands, 7 aggregate review commands, 4 analysis skills, and 1 setup command:

| Command | Stage | Artifact written |
|---|---|---|
| `/wf-intake` | 1 — Intake | `01-intake.md` |
| `/wf-shape` | 2 — Shape | `02-shape.md` |
| `/wf-slice` | 3 — Slice | `03-slice.md` + `03-slice-<slug>.md` per slice |
| `/wf-plan` | 4 — Plan | `04-plan.md` + `04-plan-<slug>.md` per slice |
| `/wf-implement` | 5 — Implement | `05-implement.md` + `05-implement-<slug>.md` per slice |
| `/wf-verify` | 6 — Verify | `06-verify.md` + `06-verify-<slug>.md` per slice |
| `/wf-review` | 7 — Review | `07-review.md` + `07-review-<command>.md` per review command |
| `/wf-handoff` | 8 — Handoff | `08-handoff.md` |
| `/wf-ship` | 9 — Ship | `09-ship.md` |
| `/wf-retro` | 10 — Retro | `10-retro.md` |
| `/wf-next` | Routing helper | reads `00-index.md`, returns next command |

Every workflow also has a `00-index.md` control file (pure YAML frontmatter — no markdown body) and a `po-answers.md` answers log — both maintained automatically.

---

## How to start a new workflow

Run `/wf-intake` with a plain-language description of your task. You do not need a slug yet — the command derives one from your description.

```
/wf-intake add dark mode toggle to settings page
```

The command will:

1. Ask you 3–7 focused product-owner questions covering desired outcome, success criteria, non-goals, constraints, and **whether you want a dedicated feature branch** for this work.
2. Create `.ai/workflows/dark-mode-toggle-settings/` and write `00-index.md` and `01-intake.md`.
3. Return a compact summary ending with multiple options for what to run next (see adaptive routing below).

If you choose a dedicated branch, the workflow tracks `branch`, `base-branch`, and `branch-strategy` in the index. All downstream commands are branch-aware.

**The slug** (`dark-mode-toggle-settings`) is derived from your description and stays fixed for the life of the workflow. Every subsequent command takes it as its first argument.

---

## How to progress through a workflow stage by stage

After each stage completes, the command presents multiple routing options — not just one. The default is the next sequential stage, but you may also see skip-to options for simpler tasks or revisit options if issues were found. Copy your chosen command and run it.

```
/wf-shape dark-mode-toggle-settings
```

```
/wf-slice dark-mode-toggle-settings
```

```
/wf-plan dark-mode-toggle-settings slice-1
```

```
/wf-implement dark-mode-toggle-settings slice-1
```

Each stage reads the artifacts written by earlier stages. You do not need to re-explain context — the commands read `00-index.md` and the relevant stage files automatically.

**If you are not sure what to run next**, use the routing helper:

```
/wf-next dark-mode-toggle-settings
```

It reads `00-index.md` and returns all viable options with reasoning.

---

## How adaptive routing works

Every command evaluates what should actually come next instead of blindly pointing to the sequential successor. After completing a stage, you will see multiple labeled options:

- **Option A (default)** — the natural next stage
- **Option B (skip-to)** — jump ahead when the task is simple enough (e.g., intake can skip to plan for trivial fixes, verify can skip review for solo projects)
- **Option C (revisit)** — go back to a prior stage if issues were found
- **Option D (blocked)** — re-run the current stage after providing missing answers

This means a well-understood single-file fix can go `intake → plan → implement → verify → ship` without forcing you through every stage.

---

## How branch-based workflows work

At intake, the workflow asks whether you want a **dedicated feature branch**. If you say yes, the entire workflow lifecycle maps onto git:

| Stage | Git action |
|---|---|
| **Intake** | Records branch strategy, branch name (`feat/<slug>` default), and base branch |
| **Implement** | Creates the branch (first slice only), switches to it, commits atomically per slice |
| **Verify** | Confirms it's on the correct branch before running tests |
| **Review** | Uses `git diff <base>...<branch>` for the full change set |
| **Handoff** | Pushes the branch, creates a PR using the handoff summary as PR body |
| **Ship** | Rebases onto base branch, merges the PR (rebase-and-merge, squash, or merge commit) |

**Three branch strategies are supported:**

| Strategy | Behavior |
|---|---|
| `dedicated` | Full lifecycle: branch creation → atomic commits → push → PR → rebase → merge |
| `shared` | Commits go to whatever branch you're already on. No branch creation, no PR, no merge. |
| `none` | No git operations at all. You manage git yourself. |

**Atomic commits per slice** — each `/wf-implement` invocation commits its changes with a message like `feat(<slug>): implement <slice-slug>`. Review fixes commit as `fix(<slug>): review fixes for <slice-slug>`. Nothing is pushed until handoff.

**The routing helper warns about branch mismatches** — if you run `/wf-next` while on the wrong branch, it tells you to switch before proceeding.

**Merge strategy is chosen at ship time** — the workflow asks during ship's mandatory questions whether to rebase-and-merge (default), squash-and-merge, or create a merge commit. If rebase conflicts arise, ship stops and recommends returning to implement to resolve them.

---

## How to work with slices

`/wf-slice` breaks shaped work into thin, independently deliverable vertical slices. Once slices exist, downstream commands write **per-slice files** with cross-links:

| Stage | Master file | Per-slice file |
|---|---|---|
| Slice | `03-slice.md` | `03-slice-<slug>.md` |
| Plan | `04-plan.md` | `04-plan-<slug>.md` |
| Implement | `05-implement.md` | `05-implement-<slug>.md` |
| Verify | `06-verify.md` | `06-verify-<slug>.md` |

Each per-slice file contains `refs` in its frontmatter linking to the master index, sibling slices, and upstream/downstream artifacts. Master files contain tables linking all per-slice files with their status.

```
/wf-plan dark-mode-toggle-settings slice-2
/wf-implement dark-mode-toggle-settings slice-2
/wf-verify dark-mode-toggle-settings slice-2
```

**To implement slices in sequence**, finish the full implement → verify → review → handoff → ship cycle on slice-1 before starting slice-2. The index tracks which slice is currently selected.

**Sibling awareness** — when planning or implementing a slice, the command reads existing sibling plans/implementations to avoid conflicts on shared files and tracks shared file touches.

**If you have a small change that does not need slicing**, pass a focus area instead of a slice identifier:

```
/wf-plan dark-mode-toggle-settings css-variables-only
```

---

## How to plan all slices in parallel

Instead of planning one slice at a time, plan them all concurrently:

```
/wf-plan dark-mode-toggle-settings all
```

This spawns one sub-agent per slice. Each sub-agent writes its plan directly to `04-plan-<slice-slug>.md`. The main agent then reads all plans, runs a cohesion check for conflicts, gaps, and integration points, and writes the master `04-plan.md`.

---

## How to review and fix existing plans

Re-invoking `/wf-plan` on an existing plan does not overwrite it — it auto-reviews. Three modes:

**Auto-review (single slice):**
```
/wf-plan dark-mode-toggle-settings slice-1
```
Re-inspects the codebase, compares the plan against acceptance criteria, checks sibling plan cohesion, and fixes issues found. Reports "no issues" if the plan is current.

**Review all slices:**
```
/wf-plan dark-mode-toggle-settings all
```
Launches parallel sub-agents to review every existing slice plan, cross-checks cohesion, fixes all issues.

**Directed fix with feedback:**
```
/wf-plan dark-mode-toggle-settings slice-1 split the database migration into two steps
```
Applies your feedback surgically to the existing plan without starting from scratch.

All modes append to `## Revision History` in each modified plan file.

---

## How to pick up a workflow after a context gap

If you lose your session or return to a workflow after a break, run the routing helper with the slug:

```
/wf-next dark-mode-toggle-settings
```

It reads the control file, determines the current stage and status, and returns all viable options. If you have forgotten the slug, omit it — the command searches `.ai/workflows/*/00-index.md` and either infers the most recent active workflow or asks you to choose.

```
/wf-next
```

---

## How to handle a mandatory-question stage

Two stages — **intake** and **ship** — are mandatory-question stages. They will not finalize until you have answered the required questions.

**Intake** asks about scope, acceptance criteria, non-goals, constraints, and branch strategy. If you run `/wf-intake` with no description, it will ask for one before proceeding.

**Ship** asks about:
- Target environment and release window
- Rollout preference (immediate, staged, canary, feature flag, maintenance window)
- Rollback tolerance and business risk
- Stakeholder communication or compliance requirements
- Merge strategy (if on a dedicated branch): rebase-and-merge, squash-and-merge, or merge commit

If `branch-strategy` is `dedicated` and go-nogo is approved, ship rebases the feature branch onto the base branch and merges the PR. It asks for explicit confirmation before merging and checks CI status first. If rebase conflicts arise, ship stops and recommends returning to implement.

If answers are not yet available when you run the command, it writes the stage file with `status: awaiting-input` in frontmatter, lists the exact unanswered questions, and stops. Return to it when you have the answers:

```
/wf-ship dark-mode-toggle-settings slice-1
```

The command resumes from where it stopped, reads your answers from the session, and completes the stage.

---

## How to run a review with the workflow

`/wf-review` is an intelligent review dispatch orchestrator. It does not review code directly — it selects and spawns sub-agents.

```
/wf-review dark-mode-toggle-settings slice-1
```

What happens:

1. Reads workflow artifacts (shape, plan, implementation, verify) and gathers git diff statistics
2. Selects relevant review commands based on file types and content signals (e.g., touches CSS → triggers `frontend-performance`; touches SQL → triggers `data-integrity` and `migrations`)
3. Spawns one parallel sonnet sub-agent per selected command — each writes findings to `07-review-<command>.md`
4. After all sub-agents complete, aggregates and deduplicates findings (same file:line or same root cause), keeps highest severity
5. Writes the unified verdict to `07-review.md`

The verdict uses three tiers:

- **Blocking issues** — must fix before handoff
- **Should-fix issues** — fix in this PR if possible
- **Nice-to-have improvements** — can be follow-up work

Frontmatter on `07-review.md` includes `verdict: ship|ship-with-caveats|dont-ship` and `metric-findings-*` counts for machine consumption.

If there are blocking issues, the recommended next command returns to `/wf-implement`. If the review passes, it recommends `/wf-handoff`.

---

## How to fix review findings automatically

After a review produces findings, use the reviews mode to fix them:

```
/wf-implement dark-mode-toggle-settings reviews
```

This reads `07-review.md` and all per-command review files, extracts BLOCKER and HIGH findings sorted by severity, and spawns one sonnet sub-agent per finding **sequentially** (each fix is verified before the next starts). After completion:

- Each finding is marked Fixed / Partially Fixed / Could Not Fix
- `05-implement-<slice>.md` gets a `## Review Fixes Applied` section
- `07-review.md` gets a `## Fix Status` tracking table
- Recommends re-verify after all fixes are applied

---

## How to generate a PR-ready handoff package

`/wf-handoff` reads the implementation, verification, and review artifacts and produces a reviewer-friendly summary package: PR title options, problem/solution summary, affected areas, verification evidence, migration notes, risks, and reviewer focus areas.

```
/wf-handoff dark-mode-toggle-settings slice-1
```

**If `branch-strategy` is `dedicated`**, handoff also pushes the branch and creates a pull request automatically using `gh pr create`. The handoff summary becomes the PR body. The PR URL and number are recorded in both `08-handoff.md` and `00-index.md` frontmatter.

**If `branch-strategy` is `shared`**, the branch is pushed but no PR is created — you manage that yourself.

**If `branch-strategy` is `none`**, no git operations happen. The handoff document in `08-handoff.md` is the deliverable.

---

## How to close out a completed workflow

After shipping, run the retro to extract reusable lessons:

```
/wf-retro dark-mode-toggle-settings
```

It reads the full workflow trail and produces concrete improvement suggestions for your `CLAUDE.md`, hooks, test coverage, CI checks, and command prompts. It marks the workflow complete in `00-index.md`.

Retro output is in `10-retro.md`. Each recommendation includes a priority and suggested text you can paste directly into your repo instruction files. Frontmatter includes `workflow-outcome: completed|abandoned|partial` and improvement metrics.

---

## How to read and understand the control file

Every workflow has a `00-index.md` at `.ai/workflows/<slug>/00-index.md`. It is pure YAML frontmatter — no markdown body. It is the single source of truth for workflow state.

Key frontmatter fields:

| Field | What it tells you |
|---|---|
| `schema` | Always `sdlc/v1` — for version detection and future migration |
| `slug` | Stable identifier used in all command arguments |
| `title` | Human-readable task name |
| `status` | `active`, `complete`, `blocked`, `abandoned` |
| `current-stage` | The stage most recently started |
| `stage-number` | Numeric position (1–10) |
| `selected-slice` | Which slice is currently active |
| `open-questions` | Unanswered questions blocking progress |
| `next-command` | Command name (e.g., `wf-shape`) |
| `next-invocation` | Full slash command ready to copy and run |
| `workflow-files` | List of all artifacts written so far |
| `progress` | Map of every stage name → status (`not-started`, `in-progress`, `complete`, etc.) |
| `slices` | Array of slice summaries (slug, status, complexity, depends-on) — present once slicing is done |
| `branch-strategy` | `dedicated`, `shared`, or `none` |
| `branch` | Feature branch name (e.g., `feat/dark-mode-toggle`) — empty if `none` |
| `base-branch` | Branch to merge back into (e.g., `main`) |
| `pr-url` | Pull request URL — set by handoff |
| `pr-number` | Pull request number — set by handoff |

**Status enums used across all files:** `not-started`, `in-progress`, `awaiting-input`, `complete`, `skipped`, `blocked`.

---

## How to query workflow metadata programmatically

All artifact state lives in YAML frontmatter, making it easy to query with standard tools.

**Extract a single field with `yq`:**
```bash
yq --front-matter=extract '.status' .ai/workflows/dark-mode/00-index.md
```

**Get the full progress map:**
```bash
yq --front-matter=extract '.progress' .ai/workflows/dark-mode/00-index.md
```

**List all slices and their status:**
```bash
yq --front-matter=extract '.slices[] | .slug + ": " + .status' .ai/workflows/dark-mode/00-index.md
```

**Get review verdict and finding counts:**
```bash
yq --front-matter=extract '{"verdict": .verdict, "blockers": .["metric-findings-blocker"]}' .ai/workflows/dark-mode/07-review.md
```

**Compatible parsers:** `yq --front-matter=extract`, Obsidian Dataview, MarkdownDB, gray-matter (Node.js), python-frontmatter, or any YAML parser that can split on `---` delimiters.

---

## How to pass supplemental context to a command

Any text after the slug and optional slice is treated as supplemental context. Use it to direct the command's focus without re-running earlier stages.

```
/wf-plan dark-mode-toggle-settings slice-1 prefer CSS custom properties over JS state, must work with existing Tailwind setup
```

```
/wf-review dark-mode-toggle-settings slice-1 pay extra attention to SSR compatibility and hydration order
```

The supplemental context is not persisted — it applies only to this invocation.

---

## How to handle a stage that is not applicable

Some changes do not need every stage. For a documentation-only change, for example, you may not need `/wf-verify` or `/wf-review`.

Run the stage anyway but pass a brief note as supplemental context:

```
/wf-verify dark-mode-docs docs-only no code changed
```

The command will produce a minimal artifact noting the stage was acknowledged but not substantively applicable, which keeps the workflow trail complete and `00-index.md` accurate.

Alternatively, use adaptive routing — each command's skip-to options let you jump forward when stages are not needed.

---

## How to run a freshness pass manually

Every command performs a freshness pass automatically when external knowledge could affect the output. If you want to force an explicit freshness pass — for example, before planning work that touches a rapidly evolving dependency — run the relevant stage with a freshness hint:

```
/wf-plan dark-mode-toggle-settings slice-1 run full freshness pass on CSS color-scheme property and prefers-color-scheme media query support
```

The freshness results are written into the stage file under `## Freshness Research` with source, relevance, and takeaway for each item checked.

---

## Artifact layout reference

All artifacts for a workflow live under a single directory:

```
.ai/workflows/<slug>/
├── 00-index.md                  # Control file — pure YAML frontmatter, no body
├── 01-intake.md                 # Intake brief, acceptance criteria, non-goals
├── 02-shape.md                  # Mini-spec, edge cases, constraints
├── 03-slice.md                  # Slice master index
├── 03-slice-<slug>.md           # Per-slice definition (one per slice)
├── 04-plan.md                   # Plan master index
├── 04-plan-<slug>.md            # Per-slice implementation plan
├── 05-implement.md              # Implement master index
├── 05-implement-<slug>.md       # Per-slice implementation record
├── 06-verify.md                 # Verify master index
├── 06-verify-<slug>.md          # Per-slice verification evidence
├── 07-review.md                 # Review master verdict
├── 07-review-<command>.md       # Per-command review findings
├── 08-handoff.md                # PR-ready package, reviewer focus areas
├── 09-ship.md                   # Release readiness, rollout and rollback plan
├── 10-retro.md                  # Lessons, concrete improvement actions
├── 90-next.md                   # Routing helper output (if wf-next was run)
└── po-answers.md                # Cumulative product-owner answers log
```

Every file starts with YAML frontmatter containing `schema: sdlc/v1` and all machine-readable state. The markdown body below the frontmatter is for human-readable narrative only. Commit these files alongside your code — they form a permanent, machine-readable record of how and why a change was made.

---

## Review commands reference

`/wf-review` dispatches from a library of 30 individual review commands and 7 aggregate bundles:

**Individual commands** (each covers one domain):
accessibility, api-contracts, architecture, backend-concurrency, ci, correctness, cost, data-integrity, docs, dx, frontend-accessibility, frontend-performance, infra, infra-security, logging, maintainability, migrations, observability, overengineering, performance, privacy, refactor-safety, release, reliability, scalability, security, style-consistency, supply-chain, testing, ux-copy

**Aggregate commands** (each runs a curated subset):
| Command | What it covers |
|---|---|
| `/review-all` | Full sweep across all domains |
| `/review-quick` | Fast check — correctness, security, testing |
| `/review-pre-merge` | Pre-merge gate — correctness, security, testing, api-contracts, migrations |
| `/review-security` | Security-focused — security, infra-security, supply-chain, privacy |
| `/review-architecture` | Structure-focused — architecture, scalability, maintainability, reliability |
| `/review-infra` | Infrastructure — infra, infra-security, ci, cost, observability |
| `/review-ux` | User experience — ux-copy, accessibility, frontend-accessibility, frontend-performance |

You do not need to call these directly — `/wf-review` selects the relevant ones automatically based on your diff. But they are available as standalone commands if you want a targeted review outside the workflow.

---

## Analysis skills reference

Four analysis skills are available during implementation and verification:

| Skill | When to use |
|---|---|
| `error-analysis` | Systematic error/stacktrace/log analysis with root cause identification |
| `refactoring-patterns` | Safe refactoring: extract, rename, move, simplify |
| `test-patterns` | Test generation: unit, integration, factories, coverage strategies |
| `wide-event-observability` | Wide-event logging and tail sampling design |

The `setup-wide-logging` command sets up wide-event logging with tail sampling for Express/Koa/Fastify/Next.js with Pino/Winston/Bunyan.

---

## How documentation is handled (Diátaxis)

The workflow integrates the Diátaxis documentation framework across three stages:

**At shape (stage 2)** — the mini-spec includes a `## Documentation Plan` that classifies what docs the feature needs:

| If the change... | Doc type needed | Diátaxis quadrant |
|---|---|---|
| Introduces new API surface, config, CLI commands | Reference | Cognition × Applying |
| Adds user-facing behavior or task capability | How-to guide | Action × Applying |
| Is a major new capability aimed at new users | Tutorial | Action × Acquiring |
| Involves architectural decisions or trade-offs | Explanation | Cognition × Acquiring |
| Significantly changes project capabilities | README update | Landing page |

**At review (stage 7)** — `review/docs` audits existing documentation against Diátaxis principles:
- Classifies every doc page by what it actually does (not its title)
- Flags boundary violations: tutorial drifting into explanation, reference giving opinions, how-to teaching basics, README becoming a dumping ground
- Checks system completeness across all four quadrants
- Recommends specific splits ("move parameter tables into reference") not vague advice

**At handoff (stage 8)** — documentation is generated or updated using the shape's docs plan:
- Each identified doc type is written following its Diátaxis constraints
- Boundary discipline is enforced — one type per file, split rather than mix
- Generated doc paths are recorded in `08-handoff.md` frontmatter (`docs-generated`) and included in the PR

Seven documentation skills are available:

| Skill | Purpose |
|---|---|
| `diataxis-doc-planner` | Classify docs into quadrants, propose docs map and writing order |
| `tutorial-writer` | Step-by-step lessons where learners build something concrete |
| `how-to-guide-writer` | Goal-oriented guides for competent users getting work done |
| `reference-writer` | Neutral, structured, scannable technical reference for lookup |
| `explanation-writer` | Understanding-oriented content about why, trade-offs, architecture |
| `readme-writer` | README as front door — routes to deeper docs, not a manual |
| `docs-reviewer` | Audit docs against Diátaxis principles with prioritised fixes |

---

## Command argument syntax

```
/wf-<stage> <slug> [slice-or-focus] [supplemental context...]
```

| Part | Required | Notes |
|---|---|---|
| `slug` | Yes (except intake) | Derived automatically by intake; stable thereafter |
| `slice-or-focus` | No | Required for plan/implement/verify once slices exist. Use `all` with wf-plan to plan all slices. Use `reviews` with wf-implement to fix review findings. |
| `supplemental context` | No | Free text; applies to this invocation only |

**Intake only** takes a plain-language task description instead of a slug:

```
/wf-intake <plain-language task description>
```

---

## Frontmatter schema reference

Every artifact file follows this pattern:

```yaml
---
schema: sdlc/v1          # Always present — version detection
type: <type>              # intake, shape, slice-index, slice, plan-index, plan, etc.
slug: <workflow-slug>     # Matches directory name
status: <status>          # not-started | in-progress | awaiting-input | complete | skipped | blocked
stage-number: <n>         # 1–10
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: []
refs:                     # Cross-links to related files
  index: 00-index.md
  prev: <previous-stage>.md
  next: <next-stage>.md
next-command: <command>
next-invocation: "/wf-<command> <slug>"
---
```

**Stage-specific fields:**

| Stage | Extra frontmatter fields |
|---|---|
| Index (`00-index.md`) | `progress` (map of all 10 stages → status), `slices` (array), `workflow-files`, `selected-slice`, `open-questions`, `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number` |
| Shape | `docs-needed`, `docs-types` (array of Diátaxis types needed) |
| Slice per-file | `slice-slug`, `complexity`, `depends-on` |
| Plan per-file | `metric-files-to-touch`, `metric-step-count`, `has-blockers`, `revision-count` |
| Implement per-file | `metric-files-changed`, `metric-lines-added`, `metric-lines-removed`, `metric-deviations-from-plan`, `metric-review-fixes-applied`, `commit-sha` |
| Verify per-file | `result` (pass/fail/partial), `metric-checks-run`, `metric-checks-passed`, `metric-acceptance-met`, `metric-issues-found` |
| Review per-command | `review-command`, `metric-findings-total`, `metric-findings-blocker`, `metric-findings-high`, `result` |
| Review master | `verdict` (ship/ship-with-caveats/dont-ship), `commands-run`, all `metric-findings-*` counts |
| Handoff | `pr-title`, `pr-url`, `pr-number`, `branch`, `base-branch`, `has-migration`, `has-config-change`, `has-docs-changes`, `docs-generated` (array of doc paths) |
| Ship | `go-nogo` (go/no-go/conditional-go), `rollout-strategy`, `merge-strategy` (rebase/squash/merge/none), `merge-sha`, `branch`, `base-branch`, `pr-url`, `pr-number` |
| Retro | `workflow-outcome` (completed/abandoned/partial), `metric-improvement-count`, `metric-stages-completed`, `metric-stages-skipped` |

All `metric-*` prefixed fields are numeric measurements designed for aggregation and dashboards.
