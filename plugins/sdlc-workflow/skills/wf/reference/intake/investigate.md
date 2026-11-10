# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary, and the workflow-registry / slug rules. Do not restate them here.

You are running `/wf intake investigate`, a **solution-options sketcher**. It proposes several engineering approaches to a stated problem, and characterizes their tradeoffs. It does not pick a winner.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `investigate`: it overrides the standalone steps below.

# Pipeline
`1·problem-intake` → `2·map-and-sketch` → `3·characterize-tradeoffs` → user picks (recorded via `# Pick`) → `/wf intake … from <slug>` | `/wf intake fix … from <slug>`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). Pass a problem statement, or an existing slug to resume; pass `<slug> <option>` to record a pick. |
| Produces | `01-investigate.md` (the problem, the architecture map, and every distinct option sketched with its tradeoffs: at most 3 full cards, the surplus as compressed entries; and a status-quo baseline), and `00-index.md`. **No `02-shape.md`:** the person chooses an option first. The next command (`/wf intake` or `/wf intake fix`) does the shape pass on the chosen option, seeded from this artifact through `_intake-provenance.md`. |
| Skips | No fix, no plan, no implementation, no recommendation. The option set is the output. |
| Next | The person picks an option. Record it (`/wf intake investigate <slug> <option> [reason]`), then run `/wf intake fix "<option> — <one-line>" from <slug>` (`effort: small` per the effort rubric below) or `/wf intake "<option> — <one-line>" from <slug>` (medium or more). |
| Escalate | When the sub-agents agree that no viable option exists within the current architecture, raise `architecture-blocking`, and recommend a design pass through `/wf intake`, with the problem framed as an architecture question. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-investigate.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `intake/_light-index.md` | procedure | always | |
| `intake/investigate/_research.md` | procedure | always | |
| `intake/investigate/_artifact.md` | procedure | always | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-investigate.md` | writes | | |

> **Ground the options in real source.** When an approach depends on what a library, a framework or an SDK actually supports (an extension point, a config surface, a limit, whether an API exists in the installed version), use the `study-sources` skill to read its installed source, or clone it into `.scratch/`, before you characterize feasibility, effort and risk. The tradeoffs of an option are only as sound as the API facts behind them, and the real source keeps a sketch off an API that does not exist. This is read-only: the reads land in `.scratch/`, with no change to the repo or the application code.

# Effort rubric (single source)

The one definition of effort for this command. Every other mention in this file (the sub-agent prompts, the option sections, the routing) cites this rubric instead of restating the thresholds. Pass it unchanged into each sub-agent prompt that needs it.

- **small** — ≤3 files, ≤5 steps, no new dependency, no schema change.
- **medium** — 4–10 files, or a new dependency, or a config change.
- **large** — >10 files, or an architecture change, migration, or cross-team coordination.

# Sketching discipline
You sketch options. You do not choose, plan or implement.
- The only acceptable output is the investigate artifact and the index. Do not edit application code. Do not write a plan. Do not pick a winning option: the person picks.
- Investigate read-only: `git log`, `git blame`, your native file-reading and search tools, static code inspection.
- Each option is **distinct**. Option B is not "option A with a twist": it embodies a different design choice (a different layer, abstraction or mechanism). When you cannot find 2 really distinct options, say so (a tripwire); do not pad with near-duplicates.
- The "Sketch" section of each option is a direction, not a plan: 2 to 5 lines that name the technique, the area and the rough boundary. Do not list implementation steps.
- Ask at most 3 questions in chat, and no structured gate question. Record each answer with `decide add` per [_decisions.md](../_decisions.md), and also write it inline into the artifact.
- Keep the stated order only where a step uses the output of an earlier step or crosses a gate. Reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve the slug and the mode** from `$ARGUMENTS`:
   - When the first token names an existing workflow whose index (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) has `workflow-type: investigate`, the workflow exists. Read that index, then take one of three cases:
     - **A token after the slug matches an option id (`A`, `B`, …) or an option label** of `01-investigate.md`: this is **pick mode**. Go to `# Pick — decision closure` below. The prose after the option token is the decision note. When the token matches more than one label, ask one question to tell them apart. A closed index stops the run, per "Closure" of [_light-index.md](_light-index.md).
     - **`01-investigate.md` is complete, and there is no pick token:** tell the person that the option set is ready, and how to record a pick (`/wf intake investigate <slug> <option-id-or-label> [one-line reason]`). Stop.
     - **`01-investigate.md` is incomplete:** this is **resume mode**. Continue from the missing section.
   - Otherwise this is a **new investigate**.
2. **New slug.** Name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `investigate-<short-problem>`.

2b. **Provenance check.** Apply `intake/_intake-provenance.md`:
   - Detect an inherited analysis decision: a trailing `from <source-slug>` token. It is implied when this investigation runs from a work packet ([../intake.md](../intake.md), "List work packet").
   - Use the matching row of the Consume table.
   - Link back: record `origin-<type>` here, and `origin-packet` when the source is a work packet.

   With no match, go on. That is the common case.
3. **Branch posture.** This mode is read-only: do not create or switch branches. Record the current branch in the index.
4. **Read the project context, lightly:**
   - Read the top 100 lines of `README.md` for the shape and the conventions of the project, so that the sketches use words that fit the codebase.
   - Read `AGENTS.md`, when present, for the conventions of the project.

# Step 1 — Problem clarification
Ask at most 3 questions, and stop as soon as the problem can be sketched:

1. **What is the problem?** State it as a code-level problem that the person wants to solve, not as a feature ask. Good: "checkout p99 latency is 2s and the bottleneck is unknown". Bad: "we need a faster checkout" (no constraint), "should we rewrite checkout?" (that is `/wf intake discover`). Ask it when `$ARGUMENTS` does not make it clear.
2. **Where in the codebase?** A starting file, module or area. The sketches are scoped to options that touch this area. When the person does not know, the cartographer sub-agent widens the search, and the wider search is flagged.
3. **Constraints?** Anything off-limits: no schema change, no new dependency, must work without a rebuild, at most 1 week of work, no breaking API change. Constraints prune the option space. Without them, the sketches lean wider than the person may want.

When `$ARGUMENTS` answers all three, go to Step 2.

Do not write the artifact yet. Hold the answers in working memory, and go on.

# Step 2 — Map and sketch (two waves)
Three sub-agents run in two waves:
1. The cartographer and the option generator are independent, and launch **in parallel**.
2. The tradeoff characterizer launches **after both return**, because it uses their output: launched blind, it can only produce an empty template.

Each is a separate read-only sub-agent dispatch ([_subagents.md](../_subagents.md)). Do not start the synthesis until all three are done.

`intake/investigate/_research.md` holds the charters, the effort tier and the return shapes of the three sub-agents.

# Step 3 — Synthesize and write `01-investigate.md`

Merge the findings of the three sub-agents. Do not invent an option that the agents did not surface. Do not silently drop an option that survived the filtering of the agents. When sub-agent 2 returned only one option and `options_considered_and_rejected` shows that nothing was rejected, that is a tripwire: surface it.

**Constraint cross-check.** Before you write, check every surviving option against the `architectural_constraints` and `integration_boundaries` of sub-agent 1.
- Start from the `constraint_collisions` of sub-agent 3, and add each collision it missed.
- A collision does not drop the option. Set or extend the `requires_architecture_violation` of that option, and add the collision to its top risks, with the `file:line` evidence of the map.
- When every option collides, that is the `architecture-blocking` tripwire.
- Extend the same check to the **constraints that the person stated** in question 3 of Step 1. Start from the `honors_stated_constraints` of sub-agent 3, correct it where the map contradicts it, and add each violation to the top risks of that option. A violating option loses ties in the selection for the presentation cap, but it is not dropped: the person may relax a constraint after seeing the price of keeping it.

**Select for presentation (cap = 3 full cards).** When more than 3 viable options survived, give full option sections to the 3 that spread most across mechanism, effort and risk profile, preferring options that honor the constraints of the person. Demote the surplus to compressed entries under "Demoted by presentation cap" in the rejected section: `<label> — <mechanism, one phrase> — effort:<X> — <why it lost the differentiation cut>`, with the effort value from the cards of sub-agent 3. A demotion by the cap is not a rejection on merit: fire the `option-space-truncated` tripwire, so the reader knows that the option space was wider than the full cards.

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

Body: a one-line description of the problem, and a pointer to `01-investigate.md` and the option labels.

The workflow stays open until the person picks. The pick (`# Pick — decision closure` below, or the implicit pick in `_intake-provenance-consume.md`) later sets this index to `closed`, with the `chosen-option` provenance and `superseded-by` pointing at the successor workflow.

# Step 5 — Hand off to user

Return per [_chat-return.md](../_chat-return.md): lead with the narrative (section *The narrative*), then the structured anchors below.

Write a compact chat summary:

```
wf intake investigate complete: <slug>
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

When `single-viable-option` tripped, put this first:

> ⓘ Only one viable option found. There isn't really a choice here — the next step is to execute the single option.

When `architecture-blocking` tripped, put this first:

> ⚠ All sketched options require an architecture violation. The right next step is probably a design pass, not picking from these options. See artifact for details.

# Pick — decision closure

This runs only from the pick mode of Step 0 (`/wf intake investigate <slug> <option-id-or-label> [one-line reason]`). Follow "Closure" of [_light-index.md](_light-index.md) with the `investigate` row. Step 4 prints the invocation of the effort routing in `## Routing` of the artifact: `/wf intake fix "<label> — <one-line mechanism>" from <slug>` (small) or `/wf intake "<label> — <one-line mechanism>" from <slug>` (medium or more).

A `discover` compressed slice that lands on this slug (the escalation ladder of `## Routing`) is not a pick, and it reopens nothing. It drills down on a decision that is still open. Its answer stays in the slice, with no write-back to the option card.

# What this command is NOT

- **Not a chooser.** This command sketches options; the user picks. The pick only records the decision.
- **Not a problem validator.** Investigate assumes that the problem is real. A doubt about the problem needs runtime data, telemetry or user signal first.
