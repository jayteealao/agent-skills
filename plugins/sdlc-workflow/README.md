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

> **v8.10.0** adds `wf-how` — a five-mode question-answering and research command. See [How the question-answering system works](#how-the-question-answering-system-works-wf-how) and the [How to…](#how-to) entries below.
>
> **v8.14.0** adds four standalone workflow entry points: `wf-hotfix` (compressed incident-response pipeline), `wf-update-deps` (dependency audit and update), `wf-docs` (documentation audit and Diátaxis generation), and `wf-refactor` (behavior-preserving refactoring with test baseline). See the [Standalone workflows](#standalone-workflows) reference and [How to…](#how-to) entries below.

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

### How the question-answering system works (wf-how)

`wf-how` is a standalone command that answers questions about the codebase, workflow artifacts, and external research topics. It runs at any point in the pipeline without advancing workflow state. It routes automatically across five modes based on what you ask:

| Mode | When it activates | Fan-out |
|------|------------------|---------|
| **Quick (A)** | Narrow question about a single function, class, or file | None — one Explore sub-agent reads and answers directly |
| **Codebase Explain (B)** | "How does X work?" — architectural or flow question | Simple: 1 agent. Complex: 2–4 parallel Explore agents → 1 synthesis agent |
| **Deep Research (C)** | Industry practices, ecosystem surveys, comparative analysis | 6–8 parallel web research agents (target: 200+ sources) → 1 synthesis agent |
| **Workflow Explain (D)** | "What does my plan say?" — explain a specific artifact | 1 reader/explainer agent |
| **Findings Explain (E)** | "Explain the review findings" — understand what findings mean | 1 findings explainer agent |

**Routing is automatic.** The command parses your question for signals — research vocabulary triggers Mode C, narrow scope triggers Mode A, artifact references trigger Mode D or E. State your question naturally and let the command decide. If it guesses wrong, redirect it in chat.

**Every mode offers a Diátaxis output option.** After producing the explanation, the command asks whether you want it saved as a structured doc — Explanation, Reference, or How-to. Defaults by mode: Quick → none, Codebase/Workflow/Findings → Explanation, Deep Research → Reference.

**Artifacts are written to:**
- `.ai/research/<topic>-<ts>.md` — for codebase explanations and deep research
- `.ai/workflows/<slug>/90-how-<artifact>.md` — for workflow artifact explanations
- `.ai/workflows/<slug>/90-findings-explain.md` — for findings explanations
- `.ai/workflows/<slug>/90-how-<topic>.md` — for quick answers when a workflow is active

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

### … discover what to work on next

```
/wf-ideate
```

Scans the codebase with **6 parallel sub-agents** across quality, performance, security, developer experience, feature completeness, and architecture lenses. Generates 30+ raw candidate ideas, then runs an adversarial filter — culling speculative ideas, in-progress duplicates, unjustifiable effort, vague scope, and symptom-level findings. Ranks survivors by impact-to-effort ratio and presents them as a numbered list ready to feed into `/wf-intake`.

```
/wf-ideate security        # focus on the security lens only
/wf-ideate dx 5            # DX lens, return top 5 ideas
/wf-ideate performance 20  # performance lens, top 20
```

Output goes to `.ai/ideation/<focus>-<timestamp>.md`. Use `AskUserQuestion` to select which ideas to act on; the command gives you the exact `/wf-intake` command for each selected idea.

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

### … ask how something works in the codebase

```
/wf-how how does the auth middleware check permissions?
/wf-how what triggers a re-render in the data table component?
```

Routes to **Mode B (Codebase Explain)**. For narrow questions (single function or module), a single Explore sub-agent reads the relevant code and writes a direct explanation. For architectural or flow questions spanning multiple files, the command decomposes the question into 2–4 exploration angles, spawns parallel Explore sub-agents (one per angle), then synthesizes their findings into a structured explanation:

- **Overview** — what this is and why it exists
- **Key Concepts** — the central types, services, and abstractions
- **How It Works** — the flow with `file:line` references and mermaid diagrams where useful
- **Where Things Live** — a file map for someone about to work in this area
- **Gotchas** — non-obvious behavior, historical artifacts, sharp edges

Result is saved to `.ai/research/<topic>-<ts>.md`. A Diátaxis explanation doc is offered as an option.

### … commission deep research on a topic

```
/wf-how --research distributed tracing approaches for microservices
/wf-how --research state of the art in zero-downtime database migrations
```

Routes to **Mode C (Deep Research)**. Decomposes the question into 6–8 source-type research angles, then spawns all agents in parallel — one each for official specs, academic papers, practitioner blogs, GitHub repos, community forums, recent news, conference talks, and books. Each agent runs 25–35 searches and returns structured source lists.

A synthesis agent deduplicates across all findings (target: 200+ unique sources), reconciles contradictions, and produces:

- **Executive Summary** — 3–5 evidence-backed bullet findings
- **State of the Art** — what the field currently recommends
- **Key Debates** — where practitioners genuinely disagree
- **Practical Takeaways** — what to actually do in this codebase
- **Full Citation Index** — tiered by relevance (Primary / Supporting / Tangential)

Result is saved to `.ai/research/<topic>-<ts>.md`. A Diátaxis reference doc is offered as an option.

### … understand what a workflow plan or artifact says

```
/wf-how dark-mode-toggle-settings plan
/wf-how dark-mode-toggle-settings shape
/wf-how dark-mode-toggle-settings slice css-token-setup
```

Routes to **Mode D (Workflow Explain)**. Reads the target artifact(s) plus `po-answers.md` and produces a plain-language explanation:

- **What This Says** — what the artifact actually captures
- **Key Commitments** — locked-in decisions that can't change without a `wf-amend`
- **Why These Decisions** — rationale from po-answers and shape context
- **Open Questions** — unresolved items still in the artifact
- **Implications for Next Steps** — what the next stage must know

Especially useful when resuming a workflow after a long break, onboarding a collaborator, or understanding why a particular approach was chosen. Result is saved to `.ai/workflows/<slug>/90-how-<artifact>.md`.

### … understand review or implementation findings

```
/wf-how dark-mode-toggle-settings review
/wf-how dark-mode-toggle-settings findings
```

Routes to **Mode E (Findings Explain)**. Reads `07-review.md`, per-command review files, `06-verify.md`, and `02-shape.md` (for acceptance criteria context), then produces a structured explanation of what the findings actually mean:

- **Finding Summary** — plain-language explanation of each finding (not a restatement)
- **Why It Matters** — concrete risk if each BLOCKER/HIGH finding goes unaddressed
- **What It Would Take to Fix** — scope signal only, not implementation steps
- **Related Finding Clusters** — findings that share a root cause or are better fixed together
- **Recommended Priority Order** — fix this first, then this, with reasoning

The `findings` target includes both review findings and verification failures. The `review` target reads review only. After reading the explanation, route to `/wf-implement <slug> reviews` to fix the findings.

### … ask a quick code question

```
/wf-how --quick what does UserService.findById return when the user is deleted?
/wf-how --quick what is the shape of the CartItem type?
```

Forces **Mode A (Quick)**. Spawns a single Explore sub-agent that reads the relevant code and answers directly. No fan-out, no synthesis step. For focused questions about a specific function, type, or return value where you don't need an architectural explanation.

If an active workflow is in progress, the answer is saved to `.ai/workflows/<slug>/90-how-<topic>.md`. Otherwise it goes to `.ai/research/<topic>-<ts>.md`. For very short answers, chat-only output with no artifact.

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

### Use wf-how before planning to understand unfamiliar subsystems

If a plan requires touching code you've never worked with before, run `wf-how` before `/wf-plan` to get the lay of the land:

```
/wf-how how does the payment processing pipeline work?
/wf-plan my-feature-slug payment-slice
```

The codebase explanation gives the planning sub-agents pre-built context that they would otherwise have to discover themselves — reducing exploration time and improving plan quality for unfamiliar areas.

### Use wf-how --research to anchor technical decisions

Before committing to an architectural approach, commission research:

```
/wf-how --research approaches to optimistic UI updates with server-side validation
```

The citation index gives you 200+ sources to cite in `po-answers.md` when the review asks "why was this approach chosen?" Helps distinguish informed decisions from guesses.

### … handle a production incident

```
/wf-hotfix auth tokens expiring after deploy
```

Starts a compressed incident-response workflow: derives the slug (`hotfix-auth-tokens-expiring-after-deploy`), asks **at most 3 questions** (what's broken, impact scope, recent changes), creates a dedicated `hotfix/<slug>` branch from production, then launches parallel Explore sub-agents for root-cause diagnosis and blast-radius mapping.

The pipeline compresses 10 stages into 6 — **brief → diagnose → plan → implement → verify → ship** — with a hard scope lock: the plan is limited to 5 steps maximum, and any change beyond the identified root cause requires explicit approval. If the fix requires touching more than 3 files or any architectural changes, the command stops and recommends escalating to `/wf-intake`.

```
/wf-hotfix hotfix-auth-tokens-slug   # resume an in-progress hotfix
```

Artifacts land in `.ai/workflows/hotfix-<slug>/` alongside normal workflows.

### … update dependencies

```
/wf-update-deps                 # scan and update all deps
/wf-update-deps react           # update a single package
/wf-update-deps --security-only # update only CVE-affected packages
/wf-update-deps --audit-only    # scan and plan without implementing
```

Scans all package manifests, then launches **parallel web research sub-agents** (one batch per 3–5 packages) that check latest versions, breaking changes, migration guides, CVEs, and upgrade gotchas. Updates are grouped by risk tier and implemented in order:

| Tier | Condition | Strategy |
|------|-----------|----------|
| **P0 — Security** | Active CVE, fix available | One at a time, commit per package |
| **P1 — Major** | Breaking changes in changelog | One at a time with migration steps |
| **P2 — Safe** | Minor/patch, no breaking changes | Batched in a single commit |
| **Hold** | Runtime incompatible or peer conflict | Documented with revisit condition |

Never mixes tiers in a single commit. If a P2 batch update breaks tests, it bisects to the culprit and marks it blocked without touching application code.

Artifacts land in `.ai/dep-updates/<run-id>/` (separate from workflow directories).

### … audit and update documentation

```
/wf-docs                          # audit and update all project docs
/wf-docs dark-mode-toggle-settings # generate docs for a workflow's changes
/wf-docs --audit-only             # gap analysis only, no writing
/wf-docs docs/api                 # scope to a specific directory
```

Runs a four-pass documentation lifecycle:

1. **Discover** — inventories every markdown file, README, API doc, and inline docstring in scope
2. **Audit** — parallel sub-agents read each doc against the current codebase, checking accuracy (do code examples still work?), Diátaxis quadrant fit (is a reference doc giving opinions?), and freshness (how long since the code changed?)
3. **Plan** — gaps and violations grouped by priority: broken (P0) → missing (P1) → wrong quadrant (P2) → stale (P3)
4. **Generate** — invokes the appropriate Diátaxis skill for each planned action (`tutorial-writer`, `how-to-guide-writer`, `reference-writer`, `explanation-writer`, `readme-writer`)

For `slug` mode, the command reads the workflow's `02-shape.md → ## Documentation Plan` — the doc plan written when the feature was shaped — and fulfills it before adding anything new. Audit artifacts land in `.ai/docs/<run-id>/`. Generated docs are written in-place to their project paths.

### … refactor safely

```
/wf-refactor extract auth logic into service layer
/wf-refactor simplify deeply nested payment validation
```

Structures a refactoring session around a non-negotiable constraint: **external behavior must be identical before and after**. The pipeline is:

1. **Brief** — 3–5 questions: what to refactor, why, what API surface is frozen, what tests exist
2. **Baseline** — parallel sub-agents capture the complete ground truth before any code changes: exported API surface, all callers in the codebase, test pass/fail counts, and coverage gaps
3. **Plan** — incremental steps, each leaving the codebase in a green state; max 1 step per commit
4. **Implement** — executes one step at a time; if a test that was passing before now fails → the refactor is fixed, never the test
5. **Verify** — full before/after comparison: same tests pass, API surface identical, all callers still compile

Coverage gaps found at baseline are surfaced before any code changes. If significant gaps exist, the command asks whether to add tests first. After verify, routes to `/wf-review <slug> refactor-safety` for the specialized refactoring safety review.

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

### Discovery and research commands

| Command | Purpose |
|---|---|
| `/wf-ideate [focus-area] [count]` | Scan codebase with 6 parallel lenses, generate 30+ candidates, adversarially filter, rank survivors — produces `.ai/ideation/` artifact ready for `/wf-intake` |
| `/wf-how <question>` | Auto-route question across 5 modes: quick code answer (A), codebase exploration (B), deep web research (C), workflow artifact explanation (D), or findings explanation (E) |
| `/wf-how <slug> plan\|shape\|slice\|review\|findings` | Shortcut to Mode D or E — explain a specific workflow artifact or findings set for the given slug |
| `/wf-how --research <question>` | Force Mode C — commission 6–8 parallel web research agents targeting 200+ sources |
| `/wf-how --quick <question>` | Force Mode A — single Explore agent, direct answer, no fan-out |

### Utility commands

| Command | Purpose |
|---|---|
| `/wf-next [slug]` | Routing helper — returns next viable command(s) |
| `/wf-status [slug]` | Read-only dashboard across all workflows |
| `/wf-resume [slug]` | ~500-word context brief for resuming after a break |
| `/wf-sync [slug]` | Reality reconciliation — surface drift between artifacts and codebase |
| `/wf-announce <slug> [audience]` | Generate stakeholder announcements with Diátaxis doc links |

### Standalone workflows

Self-contained workflows with their own lifecycle that do not require an existing feature workflow. Each produces its own artifact directory.

| Command | Purpose | Artifact location |
|---|---|---|
| `/wf-hotfix <description>` | Compressed incident-response pipeline (6 stages, scope-locked, max 5 steps) | `.ai/workflows/hotfix-<slug>/` |
| `/wf-update-deps [package\|--security-only\|--audit-only]` | Scan all deps for staleness and CVEs, research each via web search, update by risk tier | `.ai/dep-updates/<run-id>/` |
| `/wf-docs [slug\|--audit-only\|path]` | Discover, audit, and generate project documentation using Diátaxis skills | `.ai/docs/<run-id>/` |
| `/wf-refactor <description>` | Behavior-preserving refactoring with test baseline, incremental green steps, and before/after API surface comparison | `.ai/workflows/refactor-<slug>/` |

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
.ai/
├── workflows/<slug>/
│   ├── 00-index.md                      # Control file — pure YAML frontmatter, no body
│   ├── 00-sync.md                       # Sync report (written by wf-sync if run)
│   ├── 01-intake.md
│   ├── 02-shape.md
│   ├── 02b-design.md                    # Design brief (optional)
│   ├── 02-shape-amend-1.md              # Shape amendment (written by wf-amend if run)
│   ├── 03-slice.md                      # Slice master index
│   ├── 03-slice-<slug>.md               # Per-slice definition
│   ├── 03-slice-<slug>-amend-1.md       # Slice amendment (written by wf-amend if run)
│   ├── 04-plan.md                       # Plan master index
│   ├── 04-plan-<slug>.md                # Per-slice plan
│   ├── 05-implement.md                  # Implement master index
│   ├── 05-implement-<slug>.md           # Per-slice implement record
│   ├── 06-verify.md                     # Verify master index
│   ├── 06-verify-<slug>.md              # Per-slice verification evidence
│   ├── 07-review.md                     # Review master verdict
│   ├── 07-review-<command>.md           # Per-command review findings
│   ├── 08-handoff.md
│   ├── 09-ship.md
│   ├── 10-retro.md
│   ├── announce.md                      # Written by wf-announce if run
│   ├── 90-next.md                       # Written by wf-next if run
│   ├── 90-resume.md                     # Written by wf-resume if run
│   ├── 90-how-<topic>.md                # Written by wf-how (Modes A/D) — codebase/artifact explanations
│   ├── 90-findings-explain.md           # Written by wf-how (Mode E) — findings explanation
│   └── po-answers.md                    # Cumulative product-owner answers log
├── ideation/
│   └── <focus>-<timestamp>.md           # Written by wf-ideate — ranked improvement candidates
├── research/
│   └── <topic>-<timestamp>.md           # Written by wf-how (Modes B/C) — codebase and web research
├── dep-updates/<run-id>/
│   ├── scan.md                          # Dependency inventory and audit results
│   ├── research.md                      # Per-package web research findings + priority groups
│   ├── plan.md                          # Update plan by risk tier (P0 security → P1 major → P2 safe → hold)
│   ├── implement.md                     # Record of what was updated, blocked, and committed
│   └── verify.md                        # Post-update test results
└── docs/<run-id>/
    ├── discover.md                      # Documentation inventory
    ├── audit.md                         # Per-file accuracy, quadrant, and freshness findings
    ├── plan.md                          # Prioritized action plan (create/update/rewrite/delete)
    └── generate.md                      # Record of docs written and review notes
```

Hotfix and refactor workflows use the standard `.ai/workflows/` tree with `workflow-type: hotfix` or `workflow-type: refactor` in `00-index.md` frontmatter, and `hf-`/`rf-` prefixed artifact names instead of numbered stage files.

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
| `90-how-<topic>.md` / `90-findings-explain.md` | `type` (how-quick/how-codebase/how-research/how-workflow/how-findings), `question`, `mode` (A–E), `source-count` (Mode C only), `diataxis-output`, `diataxis-path` |
| `.ai/research/<topic>.md` | Same fields as above — no `schema: sdlc/v1`, not subject to the validate-write hook |

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
