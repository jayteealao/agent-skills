---
description: Solution-options sketcher. Takes a code-level problem ("checkout is slow", "auth flow is brittle", "we need to support multi-tenant data") and produces 2–3 candidate engineering approaches grounded in the existing architecture, with tradeoffs (scope, blast radius, effort, risk, reversibility) for each. Does NOT pick a winner — the user does. Does NOT write application code, does NOT diagnose bugs (use `/wf-quick rca`), does NOT validate whether the problem is worth solving (it assumes the user already decided). Read-only.
argument-hint: <problem-statement-or-slug>
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-investigate`, a **solution-options sketcher** that proposes multiple engineering approaches to a stated problem and characterizes their tradeoffs — without picking a winner.

# Slug-mode (read before proceeding)

If `/wf-quick`'s dispatcher selected **slug-mode** in Step 0 (the first argument after the sub-command matched a non-closed slug in `.ai/workflows/INDEX.md`), the *Step 1 — Slug-mode contract* in `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/SKILL.md` overrides the standalone instructions below. Substantively:

- **One artifact, in the existing workflow.** Write `.ai/workflows/<slug>/03-slice-investigate-<descriptor>.md` (collision suffix `-2`, `-3` if needed). Frontmatter: `type: slice`, `slice-slug: investigate-<descriptor>`, `slice-type: investigate`, `compressed: true`, `origin: wf-quick/investigate`, `stage-number: 3`, `status: defined`, `complexity: xs` (investigate produces an option set, not implementation work).
- **Same content, different home.** Body carries the same sections the standalone investigate would have written to `01-investigate.md` (problem restatement, architecture map, 2–3 option sketches with tradeoffs, user-decides routing footer), under a `# Compressed Slice: investigate` heading with a one-line provenance preamble.
- **No new workflow, no new branch, no `01-investigate.md`, no new top-level `00-index.md`.** The slug already owns those. Do NOT synthesize `02-shape.md` either — slug-mode is additive and a slice never overwrites the parent's stage 2.
- **Index updates:** append the slice file to `00-index.md.workflow-files`, append `{slug: investigate-<descriptor>, slice-type: investigate, created-at: <iso>}` to `00-index.md.compressed-slices` (create the array if missing). If `.ai/workflows/<slug>/03-slice.md` exists, also append `{slug, status: defined, slice-type: investigate, compressed: true}` to its `slices`, bump `total-slices`, update `updated-at`. Do not modify `current-stage`, `selected-slice`, `status`, `branch`, or `progress`. Also rewrite the `updated-at` column on `<slug>`'s row in `.ai/workflows/INDEX.md` (see SKILL.md Step 1 step 6).
- **Chat return:** one line — `wf-quick investigate → compressed slice investigate-<descriptor> on <slug>` — plus a one-line summary of the option count and the picker prompt: "Pick A, B, or C and run /wf-quick fix or /wf intake with that option's description."

If slug-mode was not selected (first argument was not a known slug, or `INDEX.md` did not exist), ignore this section and proceed standalone per the instructions below.

# Pipeline
`1·problem-intake` → `2·map-and-sketch` → `3·characterize-tradeoffs` → user picks → `/wf intake` | `/wf-quick fix`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a problem statement or an existing slug to resume. |
| Produces | `01-investigate.md` (problem + architecture map + 2–3 option sketches with tradeoffs), `00-index.md`. **No `02-shape.md`** — the user chooses an option first; the downstream command (`/wf intake` or `/wf-quick fix`) does the shape pass on the chosen option. |
| Skips | No fix, no plan, no implementation, no recommendation. The option set *is* the output. |
| Next | User picks an option, then: `/wf-quick fix <option-description>` (small option, ≤3 files / ≤5 steps / no new dependency) or `/wf intake <option-description>` (medium+). |
| Escalate | If sub-agents agree no viable option exists within the current architecture → surface `architecture-blocking` and recommend a design pass via `/wf intake` with the problem framed as an architecture question. |

# CRITICAL — sketching discipline
You are an **options sketcher**, not a chooser, planner, or implementer.
- The **only** acceptable output is the investigate artifact and index. Do NOT edit application code. Do NOT write a plan. Do NOT pick a winning option (the user picks).
- Read-only investigation only: `git log`, `git blame`, `Read`, `Grep`, static code inspection.
- Each option must be **distinct**: option B is not "option A but with a twist" — it should embody a meaningfully different design choice (different layer, different abstraction, different mechanism). If you cannot find 2 genuinely distinct options, say so (a tripwire) rather than padding with near-duplicates.
- Each option's "Sketch" section is **direction, not a plan** — 2 to 5 lines naming the technique, the area, and the rough boundary. Do not enumerate implementation steps.
- Ask at most **3 questions** in chat. No `AskUserQuestion`, no separate `po-answers.md` — answers go inline into the artifact.
- Follow the steps below exactly in order. Do not skip, reorder, or combine steps.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: investigate` → **resume mode**. Read that index. If `01-investigate.md` is complete, tell the user and stop. If incomplete, pick up from the missing section.
   - Otherwise → **new investigate**. Derive a slug: `investigate-<short-problem>` (kebab-case, max 5 words, e.g., `investigate-checkout-latency`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` exists and `workflow-type` is NOT `investigate` → WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `/wf-meta resume <slug>` to continue it." Stop.
3. **Branch posture (do NOT switch branches):**
   - This is read-only — do not create or switch branches.
   - Record the current branch in the index.
4. **Read project context (lightweight):**
   - Read `README.md` (top 100 lines) for project shape and conventions, so option sketches use vocabulary that fits the codebase.

# Step 1 — Problem clarification
Ask at most **3 questions** — stop as soon as the problem is sketchable:

1. **What is the problem?** — State as a code-level problem the user wants to solve, not a feature ask. Good: "checkout p99 latency is 2s and the bottleneck is unknown". Bad: "we need a faster checkout" (no constraint), "should we rewrite checkout?" (that is `/wf-quick discover`). Required if not clear from `$ARGUMENTS`.
2. **Where in the codebase?** — A starting file, module, or area. The sketches will be scoped to options that touch this area; if the user truly doesn't know, the cartographer sub-agent will widen the search and that will be flagged.
3. **Constraints?** — Anything off-limits (no schema change, no new dependency, must work without a rebuild, ≤1 week of work, no breaking API change). Constraints prune the option space; without them, the sketches will lean wider than the user may want.

If `$ARGUMENTS` contains enough to answer all three, skip to Step 2.

Do NOT write the artifact yet. Hold answers in working memory and proceed.

# Step 2 — Parallel map-and-sketch
Launch all three sub-agents simultaneously. Each is a separate `Explore` sub-agent dispatch. Do not proceed to synthesis until all three complete.

**Model for every dispatched agent:** `sonnet` (resolved from `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/router-metadata.json` `models.overrides["investigate"]`). REQUIRED on every `Task` call. Investigation is judgment-heavy — the Cartographer must surface non-obvious architectural constraints, the Option generator must trade off across the design space, the Tradeoff characterizer must reason about effort/risk/blast-radius. Haiku underserves the abstraction-critique work; Opus is overkill since each agent still runs against a bounded scope. Sonnet 4.6 is the right tier.

### Explore sub-agent 1 — Architecture cartographer

Prompt with ALL of the following:
- The problem: `<verbatim from Step 1>`. The starting area: `<from question 2>`. The constraints: `<from question 3>`.
- Your job is to **map the relevant code area** so options can be grounded. Do not propose solutions — that is sub-agent 2. Produce a faithful map.
- Identify: entry points into the area, the call graph from those entry points 2–3 levels deep, the data model touched by the area, integration boundaries (DB, external services, message queues), existing tests that cover this area, configuration/feature flags that change behavior in this area, recent churn (`git log --oneline --since="90 days ago" -- <area>`).
- Identify **constraints encoded in the architecture itself** — patterns that any option would need to respect (existing abstractions, dependency-injection wiring, error-handling style, transaction boundaries, async boundaries). These constraints are usually invisible until you try to violate them.

Return as structured text:
- `entry_points`: list of `{file:line, signature, one_line_description}`.
- `call_graph_summary`: prose, 1 paragraph — the main flow from entry points through the affected area.
- `data_touched`: list of `{type_or_table, where_defined: file:line, used_at: [file:line]}`.
- `integration_boundaries`: list of `{boundary_type, file:line, description}` (DB calls, external APIs, message bus, cache, file system, etc.).
- `existing_tests`: list of `{file:line, what_it_covers}`.
- `runtime_config_flags`: list of `{flag_or_env, file:line, what_it_changes}` (or "none found").
- `recent_churn`: list of files changed >3x in last 90 days, with a one-line "why" guess from commit messages.
- `architectural_constraints`: list of `{constraint, where_it_shows_up, one_line_implication}` — invariants any solution must respect.

### Explore sub-agent 2 — Option generator

Prompt with ALL of the following:
- The problem: `<verbatim>`. The starting area: `<from question 2>`. The constraints: `<from question 3>`.
- Your job is to propose **2 to 3 genuinely distinct engineering approaches** that could solve the problem within the current architecture (or, if you must violate it, name the violation explicitly as part of the option).
- Distinctness requirement: options must differ in *mechanism*, not just in surface choices. "Cache at layer X" vs. "cache at layer Y" is one option, not two, unless the layers materially change correctness or operational profile. "Add a cache" vs. "denormalize the data model" vs. "compute lazily on demand" are three distinct options.
- For each option, do a light read of the affected area to confirm it is at least plausible (no obvious blocker like "this code path is generated and cannot be edited").
- Name each option with a short, descriptive label (≤6 words) — not "Option A" but "In-process LRU cache on the resolver".
- Do NOT estimate effort, risk, or rank options — that is sub-agent 3.

Return as structured text:
- `options`: list of `{id: A|B|C, label, mechanism: one_paragraph, primary_files_touched: [path], requires_new_dependency: bool, requires_schema_change: bool, requires_architecture_violation: <none or one_line>, plausibility_check: one_line}`.
- `options_considered_and_rejected`: list of `{label, why_rejected: one_line}` — approaches you thought of but didn't include (transparency for the reader; helps avoid "why didn't you consider X?").

### Explore sub-agent 3 — Tradeoff characterizer

Prompt with ALL of the following:
- The problem: `<verbatim>`. The starting area: `<from question 2>`. The constraints: `<from question 3>`.
- You will receive sub-agent 2's options *after* it completes (or, if running fully in parallel, you produce a tradeoff template that the synthesis step will fill in). For each option, characterize:
  - **Effort:** small (≤3 files, ≤5 steps, no new dep, no schema change), medium (4–10 files, or new dep, or config change), large (>10 files, architecture change, migration, cross-team coord).
  - **Blast radius:** narrow (one module, one code path), moderate (one subsystem, several code paths), wide (cross-cutting, multiple subsystems).
  - **Reversibility:** easy (one-PR revert restores prior behavior), moderate (some data or config persists post-revert), hard (data migration or external state changes mean revert is not a no-op).
  - **Risk:** what specifically can go wrong; cite the failure mode, not just "it might break". Examples: "Cache invalidation: stale reads if upstream write skips the invalidation step", "Async boundary: ordering violations on concurrent writes", "Schema change: requires backfill which blocks deploys for the table size".
  - **Operational fit:** does this option need new observability, alerting, runbook entries, or on-call awareness? Does it interact poorly with existing infrastructure (rate limits, autoscaling, deploy gates)?

For each option produce a comparable tradeoff card. Do NOT pick a winner — characterize each on its own terms.

Return as structured text:
- `tradeoff_cards`: list of `{option_id, effort, blast_radius, reversibility, top_risks: [one_line_each], operational_fit}`.
- `cross_option_observations`: 1–2 lines on patterns across options (e.g., "All three require touching `auth/middleware.ts`; that file is the chokepoint regardless of option").

# Step 3 — Synthesize and write `01-investigate.md`

Merge findings from the three sub-agents. **Do not invent options the agents did not surface; do not silently drop options that survived the agents' filtering.** If sub-agent 2 returned only one option and `options_considered_and_rejected` shows nothing was rejected, that's a tripwire — surface it.

**`01-investigate.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: investigate
slug: <slug>
workflow-type: investigate
problem-statement: <one-line problem verbatim>
option-count: <N: 1, 2, or 3>
option-ids: [A, B, C]   # only those present
constraints: [<from-question-3>]
recommended-next: user-picks   # this command never picks
status: ready-for-routing
created-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the real timestamp>
---
```

**Body sections (in order):**

## 1. Problem & constraints

Problem verbatim. Then 1–2 sentences of restatement that name the observable being solved for (latency? error rate? code clarity? capability gap?). Then the constraint list from Step 1 question 3, each as a bullet.

## 2. Architecture map

A condensed view of sub-agent 1's findings. Don't dump the whole report — extract the parts that matter for evaluating options:

- **Entry points:** ≤5 most-relevant ones with `file:line`.
- **Critical flow:** one paragraph describing the main path through the affected area.
- **Integration boundaries:** the DB / external / queue / cache touchpoints that any option must respect.
- **Architectural constraints:** the 2–4 most load-bearing invariants any solution must respect, each with `file:line` evidence.
- **Recent churn:** any file changed >3x in 90 days that an option would also touch — flagged because it suggests instability.

## 3. Options

One subsection per option. Use the labels from sub-agent 2, not "Option A/B/C" alone:

### Option A — `<label>`

- **Mechanism:** one paragraph. What does this option *do*? Reference specific files and abstractions.
- **Sketch:** 2 to 5 lines — the technique and the rough boundary of the change. NOT implementation steps. Cite at least one `file:line` to anchor it.
- **Files touched (estimated):** list of paths or a count + range.
- **Requires new dependency:** yes/no — name it if yes.
- **Requires schema change:** yes/no — describe the shape if yes.
- **Effort:** small | medium | large — one-line justification.
- **Blast radius:** narrow | moderate | wide — one-line justification.
- **Reversibility:** easy | moderate | hard — one-line justification.
- **Top risks:** 2 to 4 bullets, each naming a specific failure mode (not "could break things").
- **Operational fit:** observability/alerting/runbook implications, or "no operational change required".

Repeat for Option B and Option C (if present).

### Options considered and rejected

A short list from sub-agent 2's `options_considered_and_rejected` — transparency for the reader. Each line: `<label> — <one-line reason rejected>`.

## 4. Side-by-side comparison

A compact table:

| | A: <label> | B: <label> | C: <label> |
|---|---|---|---|
| Mechanism (one phrase) | … | … | … |
| Effort | small/medium/large | … | … |
| Blast radius | narrow/moderate/wide | … | … |
| Reversibility | easy/moderate/hard | … | … |
| New dep? | yes (name) / no | … | … |
| Schema change? | yes / no | … | … |
| Top risk (the worst one) | … | … | … |

Then 2 to 4 lines on cross-option observations (from sub-agent 3) — patterns or shared bottlenecks visible across all options.

## 5. Routing (user picks)

This command does not pick a winner. Pick the option you want and route accordingly:

| If you pick … | Route to |
|---|---|
| An option with `effort: small`, mechanism is clear, scope is ≤3 files | `/wf-quick fix <option-label> — <one-line option description>` |
| An option with `effort: medium` or `large`, OR `requires_schema_change: yes`, OR `requires_new_dependency: yes` with non-trivial integration | `/wf intake <option-label> — <one-line option description>` |
| You're not sure which option to pick | Stop and think. If the tradeoff matrix in section 4 doesn't disambiguate, ask a human or run `/wf-docs how <area>` to deepen understanding of the area before choosing. |

## 6. Tripwire warnings (only if any fired)

Tripwires are **warn-and-continue** — record them, do NOT refuse to write the option set.

- **single-viable-option:** Sub-agent 2 found only one genuinely distinct option. State it plainly — the user should know there isn't a real choice here, the next step is just to execute. Routing collapses to one entry.
- **all-options-large:** Every option came back as `effort: large`. The problem may need decomposition before any option becomes tractable — recommend re-running `/wf-quick investigate` with a narrower problem statement.
- **architecture-blocking:** Every viable option requires an architecture violation (sub-agent 2's `requires_architecture_violation` is non-empty on all options). The real next step is a design pass — recommend `/wf intake <problem>` framed as an architecture question, not picking from these options.
- **problem-not-engineering:** The constraint that makes this hard is product/policy/business, not technical. The sub-agents could not find a meaningfully different engineering approach because the choice is upstream. Note this and stop — engineering option sketches are not the right tool.
- **stale-area:** The recent-churn signal shows the affected area changed >5x in the last 30 days. Any option will land on shifting ground; recommend either pausing until churn settles or coordinating with whoever is actively working in the area.

For each fired tripwire: `[tripwire-name]: <what specifically tripped it>`. Closing line:

> One or more wf-investigate tripwires fired. The option set is still recorded, but review the warnings before picking.

# Step 4 — Write `00-index.md`

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
workflow-type: investigate
current-stage: routing
status: ready
selected-slice: <slug>
branch-strategy: none
branch: <current-branch>
base-branch: <current-branch>
next-command: user-picks
next-invocation: "user-picks — see 01-investigate.md section 5"
option-count: <N>
option-labels: [<A label>, <B label>, <C label>]
open-questions: []
augmentations: []
progress:
  - investigate: complete
created-at: <timestamp>
---
```

Body: one-line description of the problem + pointer to `01-investigate.md` and the option labels.

# Step 5 — Hand off to user

Emit a compact chat summary, no more than 12 lines:

```
wf-investigate complete: <slug>
Problem: <one-line problem>
Options sketched: <N>
  A — <label> — effort:<X> radius:<Y> reversibility:<Z>
  B — <label> — effort:<X> radius:<Y> reversibility:<Z>
  C — <label> — effort:<X> radius:<Y> reversibility:<Z>   # if present
Cross-option observation: <one line from section 4>
Tripwires: <none | comma-separated list>
Next: pick A, B, or C — then /wf-quick fix <option> (small) or /wf intake <option> (medium+)
Artifact: .ai/workflows/<slug>/01-investigate.md
```

If `single-viable-option` tripped, prefix with:

> ⓘ Only one viable option found. There isn't really a choice here — the next step is to execute the single option.

If `architecture-blocking` tripped, prefix with:

> ⚠ All sketched options require an architecture violation. The right next step is probably a design pass, not picking from these options. See artifact for details.

# What this command is NOT

- **Not a chooser** — this command sketches options; the user picks. If you want a single recommended approach with acceptance criteria, that is `/wf shape <slug>` after `/wf intake`.
- **Not a problem validator** — this command assumes the problem is real and worth solving. If you're not sure whether the problem is genuine, that requires runtime data, telemetry, or user signal that this command doesn't gather. Run a measurement step first.
- **Not a diagnostician** — if there is a specific symptom (error, crash, slow request) and you want to know *why*, that is `/wf-quick rca <symptom>`. Investigate proposes *how to solve*; rca finds *why it's broken*.
- **Not an explainer** — if you want to understand how the area works before forming options yourself, that is `/wf-docs how <area>`. Investigate already does a light architecture map, but it is in service of options, not as a standalone explanation.
- **Not a substitute for `/wf shape`** — `/wf shape` produces a chosen design with acceptance criteria, attached to a workflow. `investigate` produces an option set with no chosen winner, attached to nothing yet. After you pick, `/wf intake` → `/wf shape` deepens the chosen option into an implementable spec.
