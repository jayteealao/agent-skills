# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake investigate`, a **solution-options sketcher** that proposes multiple engineering approaches to a stated problem and characterizes their tradeoffs — without picking a winner.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `investigate`: it overrides the standalone steps below.

# Pipeline
`1·problem-intake` → `2·map-and-sketch` → `3·characterize-tradeoffs` → user picks (recorded via `# Pick`) → `/wf intake … from <slug>` | `/wf intake fix … from <slug>`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). Pass a problem statement or an existing slug to resume; pass `<slug> <option>` to record a pick. |
| Produces | `01-investigate.md` (problem + architecture map + every distinct option sketched with tradeoffs — ≤3 full cards, surplus as compressed entries — plus a status-quo baseline), `00-index.md`. **No `02-shape.md`** — the user chooses an option first; the downstream command (`/wf intake` or `/wf intake fix`) does the shape pass on the chosen option, seeded from this artifact via `_intake-provenance.md`. |
| Skips | No fix, no plan, no implementation, no recommendation. The option set *is* the output. |
| Next | User picks an option → record it (`/wf intake investigate <slug> <option> [reason]`), then `/wf intake fix "<option> — <one-line>" from <slug>` (`effort: small` per the effort rubric below) or `/wf intake "<option> — <one-line>" from <slug>` (medium+). |
| Escalate | If sub-agents agree no viable option exists within the current architecture → surface `architecture-blocking` and recommend a design pass via `/wf intake` with the problem framed as an architecture question. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-investigate.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_light-index.md` | procedure | always | |
| `intake/investigate/_research.md` | procedure | always | |
| `intake/investigate/_artifact.md` | procedure | always | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-investigate.md` | writes | | |

> **Ground options in real source.** When a candidate approach hinges on what a
> library, framework, or SDK *actually* supports — an extension point, a config
> surface, a limit, whether an API even exists in the installed version — invoke the
> `study-sources` skill to read its installed source (or clone it into `.scratch/`)
> before characterizing feasibility, effort, and risk. An option's tradeoffs are only
> as sound as the API facts behind them; reading the real source keeps a sketch from
> resting on an API that doesn't exist. Read-only — reads land in `.scratch/`, no repo
> or application-code changes.

# Effort rubric (single source)

The one definition of effort for this command. Every other mention in this file — sub-agent prompts, option sections, routing — cites this rubric instead of restating thresholds; pass it unchanged into any sub-agent prompt that needs it.

- **small** — ≤3 files, ≤5 steps, no new dependency, no schema change.
- **medium** — 4–10 files, or a new dependency, or a config change.
- **large** — >10 files, or an architecture change, migration, or cross-team coordination.

# Sketching discipline
You are an **options sketcher**, not a chooser, planner, or implementer.
- The **only** acceptable output is the investigate artifact and index. Do not edit application code. Do not write a plan. Do not pick a winning option (the user picks).
- Read-only investigation only: `git log`, `git blame`, your native file-reading and search tools, static code inspection.
- Each option must be **distinct**: option B is not "option A but with a twist" — it should embody a meaningfully different design choice (different layer, different abstraction, different mechanism). If you cannot find 2 genuinely distinct options, say so (a tripwire) rather than padding with near-duplicates.
- Each option's "Sketch" section is **direction, not a plan** — 2 to 5 lines naming the technique, the area, and the rough boundary. Do not enumerate implementation steps.
- Ask at most **3 questions** in chat. No structured gate question. Record each answer with `decide add` per [_decisions.md](../_decisions.md), and also write it inline into the artifact.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the first token names an existing workflow whose index (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) has `workflow-type: investigate` → the workflow exists. Read that index, then split on three sub-cases:
     - **A token after the slug matches an option id (`A`, `B`, …) or an option label** from `01-investigate.md` → **pick mode**. Jump to `# Pick — decision closure` below; any trailing prose after the option token is the decision note. If the token matches more than one label, ask one question to disambiguate. A closed index stops the run, per "Closure" of [_light-index.md](_light-index.md).
     - **`01-investigate.md` is complete and no pick token is present** → tell the user the option set is ready and how to record a pick — `/wf intake investigate <slug> <option-id-or-label> [one-line reason]` — and stop.
     - **`01-investigate.md` is incomplete** → **resume mode**: pick up from the missing section.
   - Otherwise → **new investigate**.
2. **New slug:** name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `investigate-<short-problem>`.
3. **Branch posture (do NOT switch branches):**
   - This is read-only — do not create or switch branches.
   - Record the current branch in the index.
4. **Read project context (lightweight):**
   - Read `README.md` (top 100 lines) for project shape and conventions, so option sketches use vocabulary that fits the codebase.
   - Read `AGENTS.md` if present for project conventions.

# Step 1 — Problem clarification
Ask at most **3 questions** — stop as soon as the problem is sketchable:

1. **What is the problem?** — State as a code-level problem the user wants to solve, not a feature ask. Good: "checkout p99 latency is 2s and the bottleneck is unknown". Bad: "we need a faster checkout" (no constraint), "should we rewrite checkout?" (that is `/wf intake discover`). Required if not clear from `$ARGUMENTS`.
2. **Where in the codebase?** — A starting file, module, or area. The sketches will be scoped to options that touch this area; if the user truly doesn't know, the cartographer sub-agent will widen the search and that will be flagged.
3. **Constraints?** — Anything off-limits (no schema change, no new dependency, must work without a rebuild, ≤1 week of work, no breaking API change). Constraints prune the option space; without them, the sketches will lean wider than the user may want.

If `$ARGUMENTS` contains enough to answer all three, skip to Step 2.

Do not write the artifact yet. Hold answers in working memory and proceed.

# Step 2 — Map and sketch (two waves)
Three sub-agents, dispatched in two waves: the cartographer and the option generator are independent and launch **in parallel**; the tradeoff characterizer launches **after both return**, because it consumes their output — launched blind it can only produce an empty template. Each is a separate read-only sub-agent dispatch (per [_subagents.md](../_subagents.md)). Do not proceed to synthesis until all three complete.

Charters, effort tier, and return shapes for the three sub-agents are in `intake/investigate/_research.md`.

# Step 3 — Synthesize and write `01-investigate.md`

Merge findings from the three sub-agents. **Do not invent options the agents did not surface; do not silently drop options that survived the agents' filtering.** If sub-agent 2 returned only one option and `options_considered_and_rejected` shows nothing was rejected, that's a tripwire — surface it.

**Constraint cross-check:** before writing, verify every surviving option against sub-agent 1's `architectural_constraints` and `integration_boundaries` — start from sub-agent 3's `constraint_collisions` and add any collision it missed. A collision does not drop the option: set or extend that option's `requires_architecture_violation` and add the collision to its top risks, with the `file:line` evidence from the map. If every option collides, that is the `architecture-blocking` tripwire. Extend the same check to the **user's stated constraints** from Step 1 question 3: start from sub-agent 3's `honors_stated_constraints`, correct it where the map contradicts it, and add any violation to that option's top risks — a violating option loses ties in the presentation-cap selection but is not dropped (the user may relax a constraint once they see the price of keeping it).

**Select for presentation (cap = 3 full cards):** if more than 3 viable options survived, pick the 3 that maximize spread across mechanism, effort, and risk profile (preferring options that honor the user's constraints) for full option sections. Demote the surplus to compressed entries under "Demoted by presentation cap" in the rejected section — `<label> — <mechanism, one phrase> — effort:<X> — <why it lost the differentiation cut>` — taking the effort value from sub-agent 3's cards. Demotion by cap is NOT rejection on merit: fire the `option-space-truncated` tripwire so the reader knows the option space was wider than the full cards.

**`01-investigate.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: investigate
slug: <slug>
workflow-type: investigate
problem-statement: <one-line problem, exact>
option-count: <N: total distinct viable options found>
presented-count: <min(N, 3)>
option-ids: [A, B, C, …]   # all found; the first `presented-count` are full cards
constraints: [<from-question-3>]
recommended-next: user-picks   # this command never picks
status: ready-for-routing
created-at: <real UTC timestamp per _timestamp.md>
next-command: user-picks
next-invocation: "/wf intake investigate <slug> <option>"
recommended-routes: [{invocation: "/wf intake investigate <slug> <option>", reason: "record the pick", default: true}]
---
```

Write the body per `intake/investigate/_artifact.md`: `## Problem & constraints`, `## Architecture map`, `## Options`, `## Side-by-side comparison` with the status-quo column, `## Routing`, `## Tripwire warnings`. Write the record to the draft `<wf-dir>/.draft/01-investigate.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

# Step 4 — Write `00-index.md`

Write the draft of `00-index.md` from [_light-index.md](_light-index.md), the `investigate` row, and put it. Add these keys:

```yaml
branch: <current-branch>
base-branch: <current-branch>
option-count: <N: total distinct viable options found>
presented-count: <min(N, 3)>
option-labels: [<A label>, <B label>, <C label>]
demoted-labels: []
augmentations: []
```

`option-labels` lists the full-card options only. `demoted-labels` lists the labels that the presentation cap demoted. It is empty when the cap demoted none.

Body: one-line description of the problem + pointer to `01-investigate.md` and the option labels.

The workflow stays open until the user picks. The pick (`# Pick — decision closure` below, or the
implicit pick in `_intake-provenance-consume.md`) later flips this index to `closed` with
`chosen-option` provenance and `superseded-by` pointing at the successor workflow.

# Step 5 — Hand off to user

Return per [_chat-return.md](../_chat-return.md): lead with the narrative (section *The narrative*), then the structured anchors below.

Emit a compact chat summary:

```
wf-investigate complete: <slug>
Problem: <one-line problem>
Options found: <N> (<presented-count> full cards)
  A — <label> — effort:<X> radius:<Y> reversibility:<Z>
  B — <label> — effort:<X> radius:<Y> reversibility:<Z>
  C — <label> — effort:<X> radius:<Y> reversibility:<Z>   # if present
  Demoted by cap: <N−3> — see "Options considered and rejected"   # only if option-space-truncated fired
Cross-option observation: <one line from ## Side-by-side comparison>
Tripwires: <none | comma-separated list>
Next: pick an option — record it via /wf intake investigate <slug> <option> [reason],
      then route per ## Routing (the routed invocation carries `from <slug>`)
Artifact: <wf-dir>/01-investigate.md
```

If `single-viable-option` tripped, prefix with:

> ⓘ Only one viable option found. There isn't really a choice here — the next step is to execute the single option.

If `architecture-blocking` tripped, prefix with:

> ⚠ All sketched options require an architecture violation. The right next step is probably a design pass, not picking from these options. See artifact for details.

# Pick — decision closure

Runs only from Step 0 pick mode (`/wf intake investigate <slug> <option-id-or-label> [one-line reason]`). Follow "Closure" of [_light-index.md](_light-index.md) with the `investigate` row. Step 4 prints the invocation of the effort routing in `## Routing` of the artifact: `/wf intake fix "<label> — <one-line mechanism>" from <slug>` (small) or `/wf intake "<label> — <one-line mechanism>" from <slug>` (medium+).

A `discover` compressed slice landing on this slug (the `## Routing` escalation ladder) is NOT a pick
and re-opens nothing: it is drill-down on a still-open decision, and its answer stays in the
slice — no option-card write-back.

# What this command is NOT

- **Not a chooser.** This command sketches options; the user picks. The pick only records the decision.
- **Not a problem validator.** Investigate assumes that the problem is real. A doubt about the problem needs runtime data, telemetry or user signal first.
