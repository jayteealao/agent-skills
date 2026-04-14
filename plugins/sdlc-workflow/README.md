# SDLC Workflow

A Claude Code plugin that gives your AI assistant a structured software delivery lifecycle. Every feature, fix, or spike moves through the same reproducible sequence of stages — each one writing a permanent, machine-readable artifact to your repo that the next stage reads.

---

## Contents

1. [Understanding the system](#understanding-the-system) — concepts and methodology
2. [Your first workflow](#your-first-workflow) — end-to-end tutorial
3. [How to…](#how-to) — task-oriented guides
4. [Tips and tricks](#tips-and-tricks)
5. [Command reference](#command-reference)
6. [Hooks](#hooks)
7. [Artifact layout and schema](#artifact-layout-and-schema)

---

## Understanding the system

### Why this exists

When you ask an AI assistant to build a feature, the conversation ends and the context is gone. The next session starts blank. The AI made decisions — about architecture, scope, edge cases, test strategy — that have no record. When something breaks three weeks later, you can't trace why a particular approach was chosen.

sdlc-workflow solves this by making the AI's reasoning **visible and persistent**. Every decision, every shaped requirement, every review finding, and every retrospective lesson lives in a YAML-fronted markdown file under `.ai/workflows/<slug>/`. These files are committed alongside your code. They are queryable, diffable, and readable by humans and machines long after the conversation ends.

### The mental model: artifacts over memory

The pipeline has ten stages. Each stage:
- **Reads** what the previous stages wrote
- **Thinks and asks** — interviews you via `AskUserQuestion` to fill in what the artifacts don't cover
- **Writes** its own artifact with all machine-readable state in YAML frontmatter
- **Recommends** what to run next (but you choose)

You do not need to re-explain context between stages. The commands read it from the files.

### The orchestrator discipline

Every command in this plugin operates under a strict constraint: it is an **orchestrator**, not a problem-solver. This is deliberate.

- `wf-shape` shapes a spec. It does not write code.
- `wf-plan` produces a plan. It does not implement it.
- `wf-review` dispatches reviewers. It does not fix findings.
- `wf-implement` builds. It does not design.

This separation keeps each artifact clean and prevents stages from collapsing into each other. A plan file describes intent. An implement file describes what was actually done. These are different documents. If the plan and implementation are written simultaneously, the plan becomes post-hoc rationalization.

### Adaptive routing

No two features take the same path. After completing a stage, every command presents **all viable next options** — not just the sequential next stage. You might see:

- **Option A (default)** — the natural next stage
- **Option B (skip-to)** — jump ahead for simple changes (e.g., intake → plan for trivial one-line fixes)
- **Option C (revisit)** — go back when planning revealed the spec was incomplete
- **Option D (parallel)** — plan or implement multiple slices concurrently

A well-understood single-file fix can legitimately run `intake → plan → implement → verify → ship` without visiting shape, slice, or review. The system does not force you through stages that add no value for your specific change.

### The pipeline

```
1·intake → 2·shape → 2b·design* → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro
```

\* Optional design brief stage for UI/UX features. Slots between shape and slice.

| Stage | Purpose | Key artifact |
|---|---|---|
| **Intake** | Capture requirements, establish scope, choose branch strategy | `01-intake.md` |
| **Shape** | Interview to build a full mini-spec with edge cases, constraints, and docs plan | `02-shape.md` |
| **Design** *(optional)* | UX brief — discovery interview, layout approach, key states, interaction model | `02b-design.md` |
| **Slice** | Decompose shaped work into thin, independently deliverable vertical slices | `03-slice.md` + per-slice files |
| **Plan** | Repo-aware implementation plan using parallel codebase exploration sub-agents | `04-plan.md` + per-slice files |
| **Implement** | Execute the plan, commit atomically per slice, record deviations | `05-implement.md` + per-slice files |
| **Verify** | Run acceptance criteria, automated tests, interactive checks, evidence capture | `06-verify.md` + per-slice files |
| **Review** | Dispatch parallel review sub-agents, aggregate findings, triage with user | `07-review.md` + per-command files |
| **Handoff** | PR-ready package — summary, evidence, docs, push branch, create PR | `08-handoff.md` |
| **Ship** | Release readiness, go/no-go, merge strategy, rollout, rollback plan | `09-ship.md` |
| **Retro** | Extract reusable lessons, produce concrete improvements for CLAUDE.md and hooks | `10-retro.md` |

### How the review system works

`wf-review` is not a single reviewer. It is a **dispatch orchestrator** that selects from 31 individual review domains and launches one parallel sub-agent per domain. The sub-agents run concurrently, each writing its findings to a separate file. The orchestrator then aggregates, deduplicates (same `file:line` or same root cause), and triages findings with you through `AskUserQuestion`.

Selection is artifact-driven, not keyword-driven. The orchestrator reads your shape and slice artifacts to understand *what the feature does*, then reasons about which review domains matter. A feature described as "adds async bulk import" triggers `backend-concurrency` and `data-integrity` even if the diff text contains neither word.

Three finding severity levels gate routing:
- **BLOCKER** → `Don't Ship` verdict → route to `wf-implement` for fixes
- **HIGH only** → `Ship with caveats` verdict → route to `wf-implement` or handoff with noted issues
- **MED/LOW/NIT** → `Ship` verdict → route to `wf-handoff`

### How documentation is integrated (Diátaxis)

The plugin applies the [Diátaxis framework](https://diataxis.fr) across the lifecycle:

**At shape (stage 2):** the mini-spec includes a docs plan that classifies what documentation the feature needs by quadrant:

| Change type | Diátaxis quadrant | Doc type |
|---|---|---|
| New API, config, CLI commands | Reference | Structured lookup |
| New user-facing task capability | How-to guide | Goal-oriented steps |
| Major new capability for new users | Tutorial | Learning by doing |
| Architectural decisions, trade-offs | Explanation | Background and rationale |
| Significant project change | README update | Front door |

**At handoff (stage 8):** documentation is generated from the shape's docs plan before the announcement is drafted. The appropriate Diátaxis skill is invoked for each doc type planned at shape. Generated doc paths land in `08-handoff.md` frontmatter.

**At announce (post-ship):** announcements automatically link to generated docs by channel — Slack/chat gets a short link, GitHub Release gets markdown blocks, wikis get embedded sections.

**At review (stage 7):** the `docs` review command audits existing documentation against Diátaxis boundaries — flagging tutorials that drift into explanation, references that give opinions, and READMEs that have become manuals.

### The re-entry model

The pipeline is linear by design, but real development is cyclic. Three utility commands handle re-entry without overwriting completed work:

| Need | Command |
|---|---|
| Implementation bugs found in review | `wf-implement <slug> reviews` — reads `07-review.md`, fixes BLOCKER/HIGH findings |
| Spec or acceptance criteria were wrong | `wf-amend` — creates versioned correction artifacts alongside originals |
| New scope needed (not bugs, not corrections) | `wf-extend` — appends new slices without touching completed slice files |

`wf-amend` and `wf-extend` never modify any artifact with `status: complete`. The original record of what was done is always preserved.

---

## Your first workflow

This tutorial walks you through a complete workflow for a simple feature. The goal is to learn the pattern, not master every option.

**Scenario:** Add a dark mode toggle to the settings page.

### Step 1 — Intake

```
/wf-intake add dark mode toggle to settings page
```

The command derives the slug (`dark-mode-toggle-settings`), asks you 3–7 questions about scope, success criteria, non-goals, and whether you want a dedicated git branch, then writes `01-intake.md` and `00-index.md`.

You will see something like:
```
slug: dark-mode-toggle-settings
wrote: 01-intake.md, 00-index.md
options:
  A (default): /wf-shape dark-mode-toggle-settings
  B (skip to plan): /wf-plan dark-mode-toggle-settings — if scope is already fully clear
```

### Step 2 — Shape

```
/wf-shape dark-mode-toggle-settings
```

This is the most interview-intensive stage. The command asks **20 questions across 5 rounds** — generated dynamically from your intake brief, not hardcoded. The five rounds cover:

1. What does it do? (core interaction)
2. How does it behave? (state, persistence, edge cases)
3. What does it look like? (visual states, transitions)
4. What can go wrong? (failure modes, graceful degradation)
5. Where are the boundaries? (out-of-scope, future work)

All answers are saved to `po-answers.md` — a cumulative product-owner log that subsequent stages read, so you never repeat yourself.

### Step 3 — Slice

```
/wf-slice dark-mode-toggle-settings
```

The command interviews you (4–8 questions) about delivery order, slice granularity, rollout coupling, and scope cuts. For this feature it might propose two slices: `css-token-setup` (the CSS variable infrastructure) and `toggle-ui` (the UI component and persistence logic).

### Step 4 — Plan

```
/wf-plan dark-mode-toggle-settings css-token-setup
```

The command launches parallel explore sub-agents to inspect your codebase — affected files, call graphs, test infrastructure, dependency versions. It then asks you 8–12 questions about implementation approach decisions the sub-agents surfaced. The output is an execution-ready plan in `04-plan-css-token-setup.md`.

### Step 5 — Implement

```
/wf-implement dark-mode-toggle-settings css-token-setup
```

The command executes the plan, commits changes atomically as `feat(dark-mode-toggle-settings): implement css-token-setup`, and records exactly what was built, what deviated from the plan, and why.

### Step 6 — Verify

```
/wf-verify dark-mode-toggle-settings css-token-setup
```

Runs acceptance criteria against the implementation. For each criterion marked `interactive`, it identifies the right verification tool (Playwright, browser MCP, `adb`, Maestro) and runs it. Evidence is captured and written to `06-verify-css-token-setup.md`.

### Step 7 — Review

```
/wf-review dark-mode-toggle-settings css-token-setup
```

Selects relevant review domains from your diff and artifacts, dispatches parallel sub-agents, aggregates findings, triages BLOCKER/HIGH findings with you one at a time. Returns a `Ship / Ship with caveats / Don't Ship` verdict.

### Step 8 — Handoff

```
/wf-handoff dark-mode-toggle-settings
```

No slice needed — handoff reads `03-slice.md` and automatically aggregates all complete slices into a single PR description. Run this once all intended slices on the branch are implemented and reviewed. If your branch strategy is `dedicated`, this also pushes the branch and creates the PR.

### Step 9 — Ship

```
/wf-ship dark-mode-toggle-settings
```

Asks about rollout strategy, rollback tolerance, and merge approach. Merges the PR. Records the merge SHA.

### Step 10 — Retro

```
/wf-retro dark-mode-toggle-settings
```

Reads the full artifact trail, extracts lessons, and produces concrete suggested additions to your `CLAUDE.md`, hooks, test coverage, CI checks, and command configurations. Marks the workflow complete.

**Then repeat** for `toggle-ui` — the second slice follows the same path from plan onward.

---

## How to…

### … start a new workflow

```
/wf-intake <plain-language task description>
```

You do not need a slug yet. The command derives it from your description and creates the workflow directory. Every subsequent command takes the slug as its first argument.

**If you already know the slug** (returning to an abandoned workflow):
```
/wf-intake existing-slug
```

### … find out what to run next

```
/wf-next dark-mode-toggle-settings
```

Reads `00-index.md` and returns all viable options with reasoning. If you have forgotten the slug:

```
/wf-next
```

The command searches all `.ai/workflows/*/00-index.md` files and either infers the active workflow or asks you to choose.

### … see all workflow status at a glance

```
/wf-status
```

Reads every `00-index.md` in the project and renders a grouped dashboard — active, complete, blocked, and abandoned — with current stage, progress bars, and next invocation for each. No files are written.

```
/wf-status dark-mode-toggle-settings
```

Detail mode for a single workflow: shows every stage status, all artifacts, open questions, and the full recommended next command.

### … recover context after a break

```
/wf-resume dark-mode-toggle-settings
```

Reads the full workflow trail and distills it into a ~500-word context brief. Written to `90-resume.md` and returned in chat. Designed for starting a new Claude Code session without re-reading all the artifact files manually.

### … reconcile workflow state with reality

```
/wf-sync dark-mode-toggle-settings
```

Cross-references every code file, test file, branch, PR, and dependency referenced in workflow artifacts against the actual codebase. Especially useful mid-flight (stages 4–7) when long-running workflows can drift due to teammate merges, library releases, or config changes. Produces `00-sync.md` with a health rating (`in-sync / minor-drift / significant-drift / stale`) and per-category drift details.

This command is **read-only and diagnostic** — it surfaces drift but does not fix it. You decide how to respond.

### … pass supplemental context to a command

Any text after the slug and optional slice is treated as supplemental context and applies to that invocation only:

```
/wf-plan dark-mode-toggle-settings slice-1 prefer CSS custom properties over JS state, must work with existing Tailwind setup
```

```
/wf-review dark-mode-toggle-settings slice-1 pay extra attention to SSR compatibility
```

### … plan all slices in parallel

```
/wf-plan dark-mode-toggle-settings all
```

Spawns one plan sub-agent per slice. Each sub-agent writes its plan directly. The main agent reads all plans, runs a cohesion check for shared-file conflicts and integration gaps, and writes the master `04-plan.md`.

### … auto-review or fix an existing plan

Re-invoking `/wf-plan` on an existing plan does not overwrite it — it enters review-and-fix mode automatically:

| Invocation | What happens |
|---|---|
| `/wf-plan <slug> <slice>` (plan already exists) | **Auto-review** — re-inspects codebase, checks plan against acceptance criteria, fixes issues found |
| `/wf-plan <slug> all` (all plans exist) | **Review-all** — parallel sub-agents review every plan, cross-checks cohesion |
| `/wf-plan <slug> <slice> <feedback text>` | **Directed fix** — applies your feedback surgically, preserves everything unchanged |

All modes append to `## Revision History` in each modified plan file.

### … fix review findings automatically

```
/wf-implement dark-mode-toggle-settings reviews
```

Reads `07-review.md`, extracts BLOCKER and HIGH findings in severity order, spawns one sequential sonnet sub-agent per finding (each fix is verified before the next starts). After completion, marks each finding Fixed / Partially Fixed / Could Not Fix and appends a `## Review Fixes Applied` section to the implement file.

### … re-triage deferred review findings

After deferring some findings in a previous review:

```
/wf-review dark-mode-toggle-settings triage
```

Skips the full review. Reads `07-review.md → ## Triage Decisions`, collects all findings marked `deferred` or `untriaged`, and presents them for re-triage. Updates the triage section in-place.

### … amend an existing workflow (spec was wrong)

Use `wf-amend` when a review or retro reveals that the **spec, acceptance criteria, or fundamental approach** of an existing slice was incorrect — not that the code has bugs, and not that new scope is needed.

```
/wf-amend dark-mode-toggle-settings from-review
```

The command reads `07-review.md`, identifies findings that point to spec errors (not implementation bugs), asks 4–8 questions to understand the correction, then writes versioned amendment artifacts:

- `02-shape-amend-1.md` — if the overall spec needs correcting
- `03-slice-<slug>-amend-1.md` — if a slice's goal or acceptance criteria need correcting

These files sit alongside originals. No existing artifact is overwritten. The original `03-slice-<slug>.md` gains `amended: true` and a reference to the amendment file in its frontmatter.

After writing amendments, the command routes you to `wf-plan` directed-fix mode to update the plan to match the corrected spec.

**Three source modes:**
```
/wf-amend dark-mode-toggle-settings from-review    # seed from 07-review.md findings
/wf-amend dark-mode-toggle-settings from-retro     # seed from 10-retro.md
/wf-amend dark-mode-toggle-settings                # describe the correction manually
```

### … add new slices to an existing workflow

Use `wf-extend` when review or retro reveals **new scope** — missing capability that was never planned, not bugs in what was built and not corrections to the spec.

```
/wf-extend dark-mode-toggle-settings from-review
```

The command reads `07-review.md`, identifies findings that describe missing capability (not broken code), groups them into candidate slices, asks 4–8 questions about grouping and ordering, confirms the proposed slices with you, then:

1. Writes new `03-slice-<new-slug>.md` files
2. Appends new entries to `03-slice.md` non-destructively — existing entries and their `status: complete` flags are preserved
3. Routes to `wf-plan` for the new slices

```
/wf-extend dark-mode-toggle-settings from-retro    # seed from retro findings
/wf-extend dark-mode-toggle-settings               # describe new scope manually
```

**Key distinction from re-running wf-slice:** `wf-extend` appends; `wf-slice` replaces.

### … add a design brief for a UI feature

The design stage slots between shape (2) and slice (3):

```
/wf-design dark-mode-toggle-settings
```

Requires `.impeccable.md` in your project root (established by `wf-design:setup`). The command loads your design context (brand personality, aesthetic direction, design principles), scans the codebase for existing patterns, runs a UX discovery interview, and produces `02b-design.md` — a structured design brief with layout approach, key states, interaction model, and component inventory.

**Four supporting design commands:**

| Command | Purpose |
|---|---|
| `/wf-design:setup` | Establish project-wide design context in `.impeccable.md` (run once per project) |
| `/wf-design:critique <slug>` | Independent expert critique of an existing design brief |
| `/wf-design:audit <slug>` | Technical audit — accessibility, performance, theming, responsive design |
| `/wf-design:extract <slug>` | Extract reusable design tokens and component specs from an existing implementation |

### … generate announcements after shipping

```
/wf-announce dark-mode-toggle-settings
```

Reads `08-handoff.md`, `09-ship.md`, `01-intake.md`, and `02-shape.md`. Checks for any planned docs from the shape's docs plan that weren't generated at handoff and invokes the appropriate Diátaxis skill to fill the gap. Then asks which audience and which channels:

**Audiences:** `eng`, `product`, `users`, `all`

**Channels and their formatting rules:**
| Channel | Format |
|---|---|
| Slack/chat | 5–8 lines, emoji ok, link to PR/docs |
| Email | Prose paragraphs with headers, no jargon |
| GitHub Release | Markdown with code blocks, changelog-style |
| Wiki/Notion | Full structured format — context, changes, migration notes, docs |

Each draft includes a **Docs** section linking to the generated documentation for that audience's context.

### … handle a stage that does not apply

For a docs-only change that doesn't need verification or review:

```
/wf-verify dark-mode-docs docs-only no code changed
```

The command produces a minimal artifact acknowledging the stage was not substantively applicable — keeping `00-index.md` accurate without forcing empty ceremony. Then use skip-to routing to jump forward.

### … query workflow state programmatically

All state lives in YAML frontmatter — queryable with standard tools:

```bash
# Get current stage and status
yq --front-matter=extract '.current-stage + ": " + .status' .ai/workflows/dark-mode/00-index.md

# List all slices with their status
yq --front-matter=extract '.slices[] | .slug + ": " + .status' .ai/workflows/dark-mode/00-index.md

# Get review verdict and blocker count
yq --front-matter=extract '{"verdict": .verdict, "blockers": .["metric-findings-blocker"]}' .ai/workflows/dark-mode/07-review.md

# Find all workflows in a given state
for f in .ai/workflows/*/00-index.md; do
  yq --front-matter=extract '"'" + "$f" + '": " + .status' "$f"
done
```

Compatible parsers: `yq --front-matter=extract`, Obsidian Dataview, MarkdownDB, `gray-matter` (Node.js), `python-frontmatter`, or any YAML parser that splits on `---` delimiters.

---

## Tips and tricks

### The `/compact` command is your friend

Review dispatch, planning research, and implementation all generate significant context. Before moving to the next slice or to fix mode, run `/compact`. The PreCompact hook automatically preserves all workflow state in the artifact files, so the context is available even after compression.

The review command reminds you explicitly: "Consider running `/compact` before `/wf-implement` — triage decisions are in `07-review.md`."

### Let the routing helper navigate between sessions

If you start a session without remembering where you left off:

```
/wf-next
```

No slug needed. It finds your active workflow and returns the next command ready to copy and run.

### Use supplemental context to focus without re-shaping

If a review revealed a specific concern but you don't want to re-run the full review:

```
/wf-plan dark-mode-toggle-settings toggle-ui focus the test plan on keyboard accessibility and prefers-color-scheme media query edge cases
```

The supplemental text is visible to the command but not persisted — it guides this invocation only.

### wf-sync before planning long-running features

On a feature that will span multiple days, run `wf-sync` before starting each new planning or implementation session. Teammate merges, dependency updates, and config changes can silently invalidate plan assumptions. The sync report surfaces these before you've written code against stale assumptions.

```
/wf-sync dark-mode-toggle-settings
```

### Use po-answers.md as the decision audit trail

Every answer you give to `AskUserQuestion` during the workflow is appended to `po-answers.md` with a timestamp and the stage that asked it. This file becomes the product-owner decision log for the change. When a PR reviewer asks "why was X designed this way?", the answer is in `po-answers.md`.

### Commit the `.ai/workflows/` directory with your code

The workflow artifacts form the permanent record of how and why a change was made. Committing them alongside the code means you can `git log` the decision trail, diff the spec against what was implemented, and onboard teammates to why specific choices were made. The `schema: sdlc/v1` field is designed for future migrations and tooling.

### Use wf-plan directed-fix instead of re-shaping

If implementation revealed that one step in the plan was wrong:

```
/wf-plan dark-mode-toggle-settings toggle-ui use localStorage for theme persistence, not a cookie — cookies don't work for pre-render SSR
```

This surgically updates the plan without triggering the full planning research cycle. Much faster than re-running shape or slice.

### Fresh reviews with /wf-review triage

After fixing BLOCKER findings in implement, don't re-run the full review — re-triage what was deferred:

```
/wf-review dark-mode-toggle-settings triage
```

This revisits only deferred and untriaged findings. If the BLOCKER fixes introduced new issues, *then* run a full re-review.

### Design context is project-wide

`.impeccable.md` is set up once per project with `/wf-design:setup` and reused by every subsequent `wf-design` invocation. You don't re-establish brand personality or aesthetic direction for each feature — it flows through from the project-level file.

### Extension rounds are tracked

Every `wf-extend` invocation records an `extension-round: N` on new slice entries. You can see which slices were part of the original design and which were added later — and when — directly from the `03-slice.md` frontmatter. This matters for post-ship analysis of how well initial scoping predicted final scope.

---

## Command reference

### Pipeline stages

| Command | Stage | Purpose | Artifact |
|---|---|---|---|
| `/wf-intake <description>` | 1 | Capture scope, criteria, branch strategy | `01-intake.md` |
| `/wf-shape <slug>` | 2 | 20-question feature interview, mini-spec, docs plan | `02-shape.md` |
| `/wf-design <slug>` | 2b *(optional)* | UX brief — layout, states, interaction model | `02b-design.md` |
| `/wf-slice <slug>` | 3 | Decompose into vertical slices | `03-slice.md` + per-slice |
| `/wf-plan <slug> [slice\|all] [feedback]` | 4 | Repo-aware implementation plan | `04-plan.md` + per-slice |
| `/wf-implement <slug> [slice\|reviews]` | 5 | Execute plan, atomic commits | `05-implement.md` + per-slice |
| `/wf-verify <slug> [slice]` | 6 | Acceptance criteria, test runs, evidence | `06-verify.md` + per-slice |
| `/wf-review <slug> [slice\|triage]` | 7 | Multi-domain parallel review dispatch | `07-review.md` + per-command |
| `/wf-handoff <slug> [slice-slug]` | 8 | Aggregates all complete slices into one PR package; `[slice-slug]` only for one-PR-per-slice workflows | `08-handoff.md` |
| `/wf-ship <slug> [environment]` | 9 | Workflow-level go/no-go, merge, rollout plan; `[environment]` overrides deployment target | `09-ship.md` |
| `/wf-retro <slug>` | 10 | Extract lessons, improvement actions | `10-retro.md` |

### Design quality commands

All require `.impeccable.md` established by `/wf-design:setup`.

| Command | Purpose |
|---|---|
| `/wf-design:setup` | Project-wide design context (run once) |
| `/wf-design:critique <slug>` | Expert UX critique of a design brief |
| `/wf-design:audit <slug>` | Accessibility, performance, theming, responsive check |
| `/wf-design:extract <slug>` | Extract reusable design tokens and component specs |

### Re-entry and correction commands

| Command | Use when |
|---|---|
| `/wf-amend <slug> [from-review\|from-retro]` | Spec/AC/approach of an existing slice was wrong |
| `/wf-extend <slug> [from-review\|from-retro]` | New scope (not bugs, not corrections) needs adding |

### Discovery commands

| Command | Purpose |
|---|---|
| `/wf-ideate [focus-area] [count]` | Scan codebase with 6 parallel lenses, generate 30+ candidates, adversarially filter, rank survivors — produces `.ai/ideation/` artifact ready for `/wf-intake` |

### Utility commands

| Command | Purpose |
|---|---|
| `/wf-next [slug]` | Routing helper — returns next viable command(s) |
| `/wf-status [slug]` | Read-only dashboard across all workflows |
| `/wf-resume [slug]` | ~500-word context brief for resuming after a break |
| `/wf-sync [slug]` | Reality reconciliation — surface drift between artifacts and codebase |
| `/wf-announce <slug> [audience]` | Generate stakeholder announcements with Diátaxis doc links |

### Review domains (31 individual commands)

Available as standalone commands and dispatched automatically by `wf-review`:

**Always selected for any code change:** `correctness`, `security`, `code-simplification`

**Always selected for backend source changes:** `testing`, `maintainability`, `reliability`

**Always selected for frontend source changes:** `accessibility`, `frontend-accessibility`, `frontend-performance`, `ux-copy`

**Selected by feature type (from shape/slice artifacts):**

| Domain | Trigger |
|---|---|
| `backend-concurrency` | Async, concurrent, parallel behaviour |
| `refactor-safety` | Refactor, restructure, rename, extraction |
| `architecture` | New modules, services, architectural layers |
| `overengineering` | Generic abstractions, base classes, factory patterns |
| `performance` | DB queries, loops over collections, cache interactions |
| `data-integrity` | DB writes, mutations, transactions, schema changes |
| `migrations` | DB migration files |
| `privacy` | User data, auth flows, PII, payment processing |
| `api-contracts` | Route definitions, OpenAPI, GraphQL schemas, gRPC |
| `scalability` | Queue consumers, batch ops, multi-tenant data |
| `supply-chain` | Added or changed dependencies |
| `infra` | Dockerfile, Terraform, Helm, K8s, Ansible |
| `infra-security` | Infrastructure-level security configuration |
| `ci` | CI/CD pipeline changes |
| `release` | CHANGELOG, version fields, release configs |
| `logging` | New or changed log statements |
| `observability` | Metrics, OpenTelemetry, Prometheus, health checks |
| `cost` | Cloud/API calls that incur spend |
| `docs` | Documentation files, docstrings |
| `style-consistency` | Mixed naming conventions within a file or module |
| `dx` | Developer-facing tooling, scripts, README |

**Aggregate bundles (curated subsets):**

| Command | What it covers |
|---|---|
| `/review-all` | Full sweep across all domains |
| `/review-quick` | Fast check — correctness, security, testing |
| `/review-pre-merge` | Pre-merge gate — correctness, security, testing, api-contracts, migrations |
| `/review-security` | Security-focused — security, infra-security, supply-chain, privacy |
| `/review-architecture` | Structure — architecture, scalability, maintainability, reliability |
| `/review-infra` | Infrastructure — infra, infra-security, ci, cost, observability |
| `/review-ux` | User experience — ux-copy, accessibility, frontend-accessibility, frontend-performance |

### Analysis skills

Available during implementation and verification:

| Skill | Purpose |
|---|---|
| `error-analysis` | Root cause identification from errors, stack traces, logs |
| `refactoring-patterns` | Safe refactoring: extract, rename, move, simplify |
| `test-patterns` | Test generation: unit, integration, factories, coverage strategies |
| `wide-event-observability` | Wide-event logging and tail sampling design |

The `setup-wide-logging` command configures wide-event logging for Express/Koa/Fastify/Next.js with Pino/Winston/Bunyan.

### Design quality skills

Fourteen design quality skills — invoked directly by `/wf-design` commands and available standalone. All require `.impeccable.md` established by `/wf-design:setup`.

| Skill | Purpose |
|---|---|
| `design-polish` | Final quality pass — alignment, spacing, micro-detail inconsistencies before shipping |
| `design-animate` | Purposeful animations, micro-interactions, and motion effects |
| `design-bolder` | Amplify safe or generic designs — more impact, more visual interest |
| `design-quieter` | Tone down visually aggressive or overstimulating designs |
| `design-colorize` | Add strategic colour to monochromatic or low-engagement interfaces |
| `design-delight` | Add moments of personality, joy, and unexpected touches |
| `design-distill` | Strip to essence — remove unnecessary complexity, clarify purpose |
| `design-clarify` | Improve UX copy, error messages, microcopy, labels, and instructions |
| `design-layout` | Fix layout, spacing, visual rhythm, and weak visual hierarchy |
| `design-typeset` | Fix typography — font choices, hierarchy, sizing, weight, readability |
| `design-adapt` | Adapt designs across screen sizes, devices, and platforms (responsive) |
| `design-optimize` | Diagnose and fix UI performance — loading speed, rendering, animations |
| `design-harden` | Technical quality checks — accessibility, performance, theming, responsive |
| `design-overdrive` | Push past conventional limits — shaders, spring physics, scroll-driven reveals |

These skills are the same set provided by the `impeccable` plugin. When both are installed, the design skills are shared.

### Documentation skills (Diátaxis)

| Skill | Purpose |
|---|---|
| `diataxis-doc-planner` | Classify docs into quadrants, propose docs map and writing order |
| `tutorial-writer` | Learning-oriented: step-by-step, builds something concrete |
| `how-to-guide-writer` | Task-oriented: goal-driven steps for competent users |
| `reference-writer` | Information-oriented: neutral, structured, scannable lookup |
| `explanation-writer` | Understanding-oriented: why, trade-offs, architecture |
| `readme-writer` | Front door: routes to deeper docs, not a manual |
| `docs-reviewer` | Audit docs against Diátaxis principles with prioritised fixes |

---

## Hooks

The plugin installs four hooks that run automatically — no configuration required. They fire in the background and never block normal operation.

### SessionStart — workflow discovery

**Script:** `hooks/scripts/workflow-discovery.sh`

Fires at the start of every Claude Code session. Scans `.ai/workflows/*/00-index.md` for active (non-complete, non-abandoned) workflows and injects a compact summary into Claude's system context for the session. This means Claude always knows what workflow you were working on, what stage it's at, what slice is active, and what the next command is — without you having to explain it.

If multiple active workflows exist, all summaries are injected. If the current git branch doesn't match the workflow's expected branch, the summary includes a `WRONG BRANCH` warning.

**Requires:** `yq` installed on your system (`brew install yq` or `apt-get install yq`). If `yq` is not available, the hook exits silently — no error, no injection.

### PreToolUse (Write) — workflow file validation

**Script:** `hooks/scripts/validate-workflow-write.sh`

Fires before every Write tool call that targets a `.ai/workflows/` file. Validates four structural invariants before allowing the write:

| Check | What it validates |
|---|---|
| **Schema version** | `schema` field must be `sdlc/v1` |
| **Required fields** | `type`, `slug` must be present in frontmatter |
| **Slug stability** | The `slug` value in frontmatter must match the workflow directory name |
| **Stage file naming** | File name must follow `NN-stagename.md` convention (or `NNb-` substage, or non-numbered utility files like `po-answers.md`) |

If any check fails, the write is **blocked** and a structured error message is fed back to Claude — prompting self-correction before the file is written. This prevents corrupted artifacts that would break future stage reads.

Edit operations (partial changes) pass through validation — only full Write calls are validated.

### PostToolUse (Write/Edit) — auto-stage

**Script:** `hooks/scripts/auto-stage.sh`

Fires after every Write or Edit tool call. When a workflow is in the **implement stage** with `branch-strategy: dedicated` or `shared`, it automatically runs `git add <file>` on the changed file — keeping the git staging area current with implementation progress. This supports the atomic-commit-per-slice pattern: when `wf-implement` is ready to commit, all the relevant files are already staged.

**Opt out:** Create `.ai/.no-auto-stage` in your project root. The hook checks for this flag on every run and exits immediately if found.

The hook is naturally inactive outside of the implement stage — it checks the workflow's `current-stage` field before doing anything.

**Requires:** `yq`, `jq`, and `git`.

### PreCompact — context preservation

**Script:** `hooks/scripts/pre-compact.sh`

Fires before Claude Code's context compaction. Reads every active workflow's `00-index.md` and outputs detailed preservation instructions to the compaction model, telling it what state must survive in the summary:

- Active workflow slug, current stage, and selected slice
- Branch name and strategy
- All open questions (blocking — losing these means re-asking you)
- Progress map across all 10 stages
- Recommended next command and full invocation
- Any triage decisions, PO answers, or architectural choices made in this session

Without this hook, compaction might summarise away the workflow state — the artifact files would still be on disk, but Claude would need to re-read them from scratch to reorient. The hook ensures the summary carries enough context for immediate orientation after compaction.

This is why `/compact` is safe to run during a workflow — the hook protects the critical state.

**Requires:** `yq`, `jq`.

### Hook dependency: yq

All hooks depend on `yq` for YAML frontmatter parsing. If `yq` is not installed, the SessionStart and PreCompact hooks will exit silently (no workflow context in sessions, no compaction preservation). The PreToolUse validation hook also degrades gracefully. Install it:

```bash
# macOS
brew install yq

# Ubuntu/Debian
apt-get install yq

# Or via pip
pip install yq

# Or download binary from https://github.com/mikefarah/yq/releases
```

---

## Artifact layout and schema

### Workflow directory structure

All artifacts for a workflow live under a single directory:

```
.ai/workflows/<slug>/
├── 00-index.md                  # Control file — pure YAML frontmatter, no body
├── 00-sync.md                   # Sync report (written by wf-sync if run)
├── 01-intake.md
├── 02-shape.md
├── 02b-design.md                # Design brief (optional)
├── 02-shape-amend-1.md          # Shape amendment (written by wf-amend if run)
├── 03-slice.md                  # Slice master index
├── 03-slice-<slug>.md           # Per-slice definition
├── 03-slice-<slug>-amend-1.md   # Slice amendment (written by wf-amend if run)
├── 04-plan.md                   # Plan master index
├── 04-plan-<slug>.md            # Per-slice plan
├── 05-implement.md              # Implement master index
├── 05-implement-<slug>.md       # Per-slice implement record
├── 06-verify.md                 # Verify master index
├── 06-verify-<slug>.md          # Per-slice verification evidence
├── 07-review.md                 # Review master verdict
├── 07-review-<command>.md       # Per-command review findings
├── 08-handoff.md
├── 09-ship.md
├── 10-retro.md
├── announce.md                  # Written by wf-announce if run
├── 90-next.md                   # Written by wf-next if run
├── 90-resume.md                 # Written by wf-resume if run
└── po-answers.md                # Cumulative product-owner answers log
```

Every file starts with YAML frontmatter (`schema: sdlc/v1`) containing all machine-readable state. Commit these files alongside your code — they form a permanent, queryable record of how and why a change was made.

### Control file fields (`00-index.md`)

| Field | Description |
|---|---|
| `schema` | Always `sdlc/v1` |
| `slug` | Stable identifier, matches directory name |
| `title` | Human-readable task name |
| `status` | `active` / `complete` / `blocked` / `abandoned` |
| `current-stage` | Most recently started stage |
| `stage-number` | Numeric position (1–10) |
| `selected-slice-or-focus` | Currently active slice |
| `open-questions` | Unanswered questions blocking progress |
| `next-command` | Command name (e.g., `wf-shape`) |
| `next-invocation` | Full slash command ready to copy and run |
| `workflow-files` | List of all artifacts written |
| `progress` | Map of all 10 stage names → `not-started / in-progress / complete / skipped / blocked` |
| `slices` | Array of slice summaries (slug, status, complexity, depends-on) |
| `branch-strategy` | `dedicated` / `shared` / `none` |
| `branch` | Feature branch name (`feat/<slug>` default) |
| `base-branch` | Branch to merge back into |
| `pr-url` | Pull request URL (set by handoff) |
| `pr-number` | Pull request number (set by handoff) |

### Stage-specific frontmatter fields

| File type | Extra fields |
|---|---|
| `02-shape.md` | `docs-needed`, `docs-types` (Diátaxis types array) |
| `03-slice-<slug>.md` | `slice-slug`, `complexity` (xs/s/m/l/xl), `depends-on`, `amended`, `amendment-refs` |
| `03-slice-<slug>.md` (extension) | `source`, `source-ref`, `extension-round` |
| `04-plan-<slug>.md` | `metric-files-to-touch`, `metric-step-count`, `has-blockers`, `revision-count` |
| `05-implement-<slug>.md` | `metric-files-changed`, `metric-lines-added`, `metric-lines-removed`, `metric-deviations-from-plan`, `commit-sha` |
| `06-verify-<slug>.md` | `result` (pass/fail/partial), `metric-checks-run`, `metric-checks-passed`, `metric-acceptance-met` |
| `07-review-<cmd>.md` | `review-command`, `metric-findings-total`, `metric-findings-blocker`, `metric-findings-high`, `result` |
| `07-review.md` | `verdict` (ship/ship-with-caveats/dont-ship), `commands-run`, all `metric-findings-*` counts |
| `08-handoff.md` | `pr-title`, `pr-url`, `pr-number`, `branch`, `base-branch`, `has-migration`, `has-docs-changes`, `docs-generated` |
| `09-ship.md` | `go-nogo` (go/no-go/conditional-go), `rollout-strategy`, `merge-strategy`, `merge-sha` |
| `10-retro.md` | `workflow-outcome` (completed/abandoned/partial), `metric-improvement-count`, `metric-stages-completed` |
| `02-shape-amend-N.md` | `amendment-number`, `amends`, `source`, `source-ref`, `affected-slices` |
| `03-slice-<slug>-amend-N.md` | `amendment-number`, `amends`, `original-status`, `plan-needs-update` |
| `00-sync.md` | `health` (in-sync/minor-drift/significant-drift/stale), drift category tables |

All `metric-*` fields are numeric — designed for aggregation, dashboards, and CI/CD gate evaluation.

### Command argument syntax

```
/wf-<stage> <slug> [slice-or-focus] [supplemental context...]
```

| Part | Required | Notes |
|---|---|---|
| `slug` | Yes (except intake) | Derived by intake; stable thereafter |
| `slice-or-focus` | No (required once slices exist for plan/implement/verify) | Use `all` with wf-plan; `reviews` with wf-implement; `triage` with wf-review |
| `supplemental context` | No | Free text; applies to this invocation only |

Intake only takes a task description instead of a slug:
```
/wf-intake <plain-language task description>
```

### Status enum

Used consistently across all artifact frontmatter:

`not-started` / `in-progress` / `awaiting-input` / `complete` / `skipped` / `blocked`
