---
description: Solution-options sketcher. Takes a code-level problem ("checkout is slow", "auth flow is brittle", "we need to support multi-tenant data") and enumerates every genuinely distinct candidate engineering approach grounded in the existing architecture, with tradeoffs (scope, blast radius, effort, risk, reversibility) for each — up to 3 presented as full cards, surplus distinct options recorded as compressed entries. Does NOT pick a winner — the user does; re-invoked as `investigate <slug> <option>` it records that pick and closes the workflow. Does NOT write application code, does NOT diagnose bugs (use `$wf intake rca`), does NOT validate whether the problem is worth solving (it assumes the user already decided). Read-only except the pick bookkeeping.
argument-hint: <problem-statement-or-slug>
---

# Output boundary & shared context
Load `reference/intake/_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, and the workflow-registry / slug rules. Do not restate them here.

You are running `$wf intake investigate`, a **solution-options sketcher** that proposes multiple engineering approaches to a stated problem and characterizes their tradeoffs — without picking a winner.

# Slug-mode (read before proceeding)

If the dispatcher selected **slug-mode** (the first token after `intake` matched a non-closed slug in `.ai/workflows/INDEX.md`), follow `reference/_compressed-slice.md` — it OVERRIDES the standalone instructions below. In short: write one `.ai/workflows/<slug>/03-slice-investigate-<descriptor>.md` (`type: slice`, `slice-type: investigate`, `compressed: true`, `origin: intake/investigate`); no new workflow, no new branch, no standalone artifact, no new top-level `00-index.md`; additive index updates only; chat return `investigate → compressed slice <slice-slug> on <slug>`.

If slug-mode was not selected, ignore this section and proceed standalone below.

# Pipeline
`1·problem-intake` → `2·map-and-sketch` → `3·characterize-tradeoffs` → user picks (recorded via `# Pick`) → `$wf intake … from <slug>` | `$wf intake fix … from <slug>`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a problem statement or an existing slug to resume; pass `<slug> <option>` to record a pick. |
| Produces | `01-investigate.md` (problem + architecture map + every distinct option sketched with tradeoffs — ≤3 full cards, surplus as compressed entries — plus a status-quo baseline), `00-index.md`. **No `02-shape.md`** — the user chooses an option first; the downstream skill (`$wf intake` or `$wf intake fix`) does the shape pass on the chosen option, seeded from this artifact via `_investigate-provenance.md`. |
| Skips | No fix, no plan, no implementation, no recommendation. The option set *is* the output. |
| Next | User picks an option → record it (`$wf intake investigate <slug> <option> [reason]`), then `$wf intake fix "<option> — <one-line>" from <slug>` (`effort: small` per the effort rubric below) or `$wf intake "<option> — <one-line>" from <slug>` (medium+). |
| Escalate | If sub-agents agree no viable option exists within the current architecture → surface `architecture-blocking` and recommend a design pass via `$wf intake` with the problem framed as an architecture question. |

> **Auto second opinion (objective triggers).** At the terminus, once the option set is
> synthesized (after Step 3 has written `01-investigate.md` and before Step 4 writes the index —
> folding the panel's output in therefore edits the just-written artifact), **auto-invoke** `$consult codex <critique these
> candidate approaches and name what this analysis missed>` (pinning `codex`/`claude` keeps it
> free) when ANY of: (a) any tripwire fired (`single-viable-option` especially — a second model
> is the cheapest test of whether the option space is genuinely that narrow); (b) any option is
> `effort: large` or requires a schema change or an architecture violation; (c) the options span
> security, auth, data migration, or money/billing. Fold distinct options or refutations into the
> artifact (an option the panel kills moves to "considered and rejected" with the reason). Skip
> only when none of the triggers hold; the user may invoke it explicitly with any provider.

> **Ground options in real source.** When a candidate approach hinges on what a
> library, framework, or SDK *actually* supports — an extension point, a config
> surface, a limit, whether an API even exists in the installed version — invoke the
> `study-sources` skill to read its installed source (or clone it into `.scratch/`)
> before characterizing feasibility, effort, and risk. An option's tradeoffs are only
> as sound as the API facts behind them; reading the real source keeps a sketch from
> resting on an API that doesn't exist. Read-only — reads land in `.scratch/`, no repo
> or application-code changes.

# Effort rubric (single source)

The one definition of effort for this skill. Every other mention in this file — sub-agent prompts, option sections, routing — cites this rubric instead of restating thresholds; pass it verbatim into any sub-agent prompt that needs it.

- **small** — ≤3 files, ≤5 steps, no new dependency, no schema change.
- **medium** — 4–10 files, or a new dependency, or a config change.
- **large** — >10 files, or an architecture change, migration, or cross-team coordination.

# CRITICAL — sketching discipline
You are an **options sketcher**, not a chooser, planner, or implementer.
- The **only** acceptable output is the investigate artifact and index. Do NOT edit application code. Do NOT write a plan. Do NOT pick a winning option (the user picks).
- Read-only investigation only: `git log`, `git blame`, your native file-reading and search tools, static code inspection.
- Each option must be **distinct**: option B is not "option A but with a twist" — it should embody a meaningfully different design choice (different layer, different abstraction, different mechanism). If you cannot find 2 genuinely distinct options, say so (a tripwire) rather than padding with near-duplicates.
- Each option's "Sketch" section is **direction, not a plan** — 2 to 5 lines naming the technique, the area, and the rough boundary. Do not enumerate implementation steps.
- Ask at most **3 questions** directly in chat, presenting options as a short numbered list. No separate `po-answers.md` — answers go inline into the artifact.
- Follow the steps below exactly in order. Do not skip, reorder, or combine steps.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the first token matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: investigate` → the workflow exists. Read that index, then split on three sub-cases:
     - **A token after the slug matches an option id (`A`, `B`, …) or an option label** from `01-investigate.md` → **pick mode**. Jump to `# Pick — decision closure` below; any trailing prose after the option token is the decision note. If the token matches more than one label, ask one question to disambiguate. If the index is already `status: closed`, WARN: "Workflow `<slug>` is closed (chosen-option: `<value>`)." and stop.
     - **`01-investigate.md` is complete and no pick token is present** → tell the user the option set is ready and how to record a pick — `$wf intake investigate <slug> <option-id-or-label> [one-line reason]` — and stop.
     - **`01-investigate.md` is incomplete** → **resume mode**: pick up from the missing section.
   - Otherwise → **new investigate**. Derive a slug: `investigate-<short-problem>` (kebab-case, max 5 words, e.g., `investigate-checkout-latency`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` exists and `workflow-type` is NOT `investigate` → WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `$wf recap <slug>` to review it." Stop.
3. **Branch posture (do NOT switch branches):**
   - This is read-only — do not create or switch branches.
   - Record the current branch in the index.
4. **Read project context (lightweight):**
   - Read `README.md` (top 100 lines) for project shape and conventions, so option sketches use vocabulary that fits the codebase.
   - Read `AGENTS.md` if present for project conventions.

# Step 1 — Problem clarification
Ask at most **3 questions** — stop as soon as the problem is sketchable. Present as a numbered list in chat:

1. **What is the problem?** — State as a code-level problem the user wants to solve, not a feature ask. Good: "checkout p99 latency is 2s and the bottleneck is unknown". Bad: "we need a faster checkout" (no constraint), "should we rewrite checkout?" (that is `$wf intake discover`). Required if not clear from `$ARGUMENTS`.
2. **Where in the codebase?** — A starting file, module, or area. The sketches will be scoped to options that touch this area; if the user truly doesn't know, the cartographer sub-agent will widen the search and that will be flagged.
3. **Constraints?** — Anything off-limits (no schema change, no new dependency, must work without a rebuild, ≤1 week of work, no breaking API change). Constraints prune the option space; without them, the sketches will lean wider than the user may want.

If `$ARGUMENTS` contains enough to answer all three, skip to Step 2.

Do NOT write the artifact yet. Hold answers in working memory and proceed.

# Step 2 — Map and sketch (two waves)
Three sub-agents, dispatched in two waves as read-only `explorer` children per [_subagents.md](../_subagents.md): the cartographer and the option generator are independent and launch **in parallel**; the tradeoff characterizer launches **after both return**, because it consumes their output — launched blind it can only produce an empty template. Do not proceed to synthesis until all three complete.

## Wave 1 — cartographer ∥ option generator (launch simultaneously)

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
- Your job is to enumerate **every genuinely distinct engineering approach** that could solve the problem within the current architecture (or, if you must violate it, name the violation explicitly as part of the option). The distinctness requirement below is the only ceiling — typically 2–5 mechanisms exist. Report exactly as many as you find: do not stop at 3 because it feels complete, and do not pad with a near-duplicate to reach a count. Selection for presentation happens at synthesis, not here.
- Distinctness requirement: options must differ in *mechanism*, not just in surface choices. "Cache at layer X" vs. "cache at layer Y" is one option, not two, unless the layers materially change correctness or operational profile. "Add a cache" vs. "denormalize the data model" vs. "compute lazily on demand" are three distinct options.
- For each option, do a light read of the affected area to confirm it is at least plausible (no obvious blocker like "this code path is generated and cannot be edited").
- Name each option with a short, descriptive label (≤6 words) — not "Option A" but "In-process LRU cache on the resolver".
- Do NOT estimate effort, risk, or rank options — that is sub-agent 3.

Return as structured text:
- `options`: list of `{id: sequential letter (A, B, C, D, …), label, mechanism: one_paragraph, primary_files_touched: [path], requires_new_dependency: bool, requires_schema_change: bool, requires_architecture_violation: <none or one_line>, plausibility_check: one_line}`.
- `options_considered_and_rejected`: list of `{label, why_rejected: one_line}` — approaches you thought of but didn't include (transparency for the reader; helps avoid "why didn't you consider X?"). Merit rejections only (implausible, blocked, dominated) — NOT an overflow bin for viable distinct options; every viable distinct mechanism belongs in `options`.

## Wave 2 — tradeoff characterizer (launch after both Wave 1 agents return)

### Explore sub-agent 3 — Tradeoff characterizer

Prompt with ALL of the following:
- The problem: `<verbatim>`. The starting area: `<from question 2>`. The constraints: `<from question 3>`.
- Sub-agent 2's full `options` list, verbatim.
- Sub-agent 1's `architectural_constraints` and `integration_boundaries`, verbatim — judge each option against the mapped architecture, and flag any option that collides with a constraint or boundary.
- The effort rubric (from `# Effort rubric`), verbatim.
- For each option — however many sub-agent 2 returned, including any beyond three — characterize:
  - **Effort:** small | medium | large, per the effort rubric.
  - **Blast radius:** narrow (one module, one code path), moderate (one subsystem, several code paths), wide (cross-cutting, multiple subsystems).
  - **Reversibility:** easy (one-PR revert restores prior behavior), moderate (some data or config persists post-revert), hard (data migration or external state changes mean revert is not a no-op).
  - **Risk:** what specifically can go wrong; cite the failure mode, not just "it might break". Examples: "Cache invalidation: stale reads if upstream write skips the invalidation step", "Async boundary: ordering violations on concurrent writes", "Schema change: requires backfill which blocks deploys for the table size".
  - **Operational fit:** does this option need new observability, alerting, runbook entries, or on-call awareness? Does it interact poorly with existing infrastructure (rate limits, autoscaling, deploy gates)?
  - **Constraint compliance:** does the option honor every user-stated constraint (from Step 1 question 3)? Name the violated constraint if not.
  - **Decisive unknown:** the ONE assumption that, if false, kills this option, plus the cheapest way to check it (a measurement, a source read, a yes/no truth question). "None" is valid only when every load-bearing assumption was verified during characterization — never as a default.

For each option produce a comparable tradeoff card. Do NOT pick a winner — characterize each on its own terms.

Return as structured text:
- `tradeoff_cards`: list of `{option_id, effort, blast_radius, reversibility, top_risks: [one_line_each], operational_fit, honors_stated_constraints: yes | violates <constraint>, decisive_unknown: {assumption, cheapest_check} | none}`.
- `constraint_collisions`: list of `{option_id, constraint, one_line_implication}` — options that violate an architectural constraint or integration boundary from sub-agent 1's map (or "none").
- `cross_option_observations`: 1–2 lines on patterns across options (e.g., "All three require touching `auth/middleware.ts`; that file is the chokepoint regardless of option").

# Step 3 — Synthesize and write `01-investigate.md`

Merge findings from the three sub-agents. **Do not invent options the agents did not surface; do not silently drop options that survived the agents' filtering.** If sub-agent 2 returned only one option and `options_considered_and_rejected` shows nothing was rejected, that's a tripwire — surface it.

**Constraint cross-check (MANDATORY):** before writing, verify every surviving option against sub-agent 1's `architectural_constraints` and `integration_boundaries` — start from sub-agent 3's `constraint_collisions` and add any collision it missed. A collision does not drop the option: set or extend that option's `requires_architecture_violation` and add the collision to its top risks, with the `file:line` evidence from the map. If every option collides, that is the `architecture-blocking` tripwire. Extend the same check to the **user's stated constraints** from Step 1 question 3: start from sub-agent 3's `honors_stated_constraints`, correct it where the map contradicts it, and add any violation to that option's top risks — a violating option loses ties in the presentation-cap selection but is not dropped (the user may relax a constraint once they see the price of keeping it).

**Select for presentation (cap = 3 full cards):** if more than 3 viable options survived, pick the 3 that maximize spread across mechanism, effort, and risk profile (preferring options that honor the user's constraints) for full option sections. Demote the surplus to compressed entries under "Demoted by presentation cap" in the rejected section — `<label> — <mechanism, one phrase> — effort:<X> — <why it lost the differentiation cut>` — taking the effort value from sub-agent 3's cards. Demotion by cap is NOT rejection on merit: fire the `option-space-truncated` tripwire so the reader knows the option space was wider than the full cards.

**`01-investigate.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: investigate
slug: <slug>
workflow-type: investigate
problem-statement: <one-line problem verbatim>
option-count: <N: total distinct viable options found>
presented-count: <min(N, 3)>
option-ids: [A, B, C, …]   # all found; the first `presented-count` are full cards
constraints: [<from-question-3>]
recommended-next: user-picks   # this skill never picks
status: ready-for-routing
created-at: <real UTC timestamp per _timestamp.md>
---
```

**Body sections (in order):**

## The Investigation
<!-- STORY SECTION — first, and self-sufficient. Arc per `../_ste-procedural.md` section 4: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. STE language throughout (sections 1 and 3). No "This <stage> implements…" opening. 1–3 short paragraphs. -->

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

One subsection per **presented** option (the ≤3 full cards selected in Step 3). Use the labels from sub-agent 2, not "Option A/B/C" alone:

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
- **Honors stated constraints:** yes, or `violates <constraint>` with one line on the collision.
- **Decisive unknown:** `<the assumption that, if false, kills this option>` — cheapest check: `<measurement / source read / truth question>`. Write "none — load-bearing assumptions verified during characterization" only when that is literally true.

Repeat for Option B and Option C (if present).

### Options considered and rejected

If the presentation cap demoted viable options (Step 3), open with a **Demoted by presentation cap** sub-list — `<label> — <mechanism, one phrase> — effort:<X> — <why demoted>`. These are viable options, not rejections; a reader may still pick one. Then the merit rejections from sub-agent 2's `options_considered_and_rejected` — transparency for the reader. Each line: `<label> — <one-line reason rejected>`.

## 4. Side-by-side comparison

A compact table. The leading **Status quo** column is the do-nothing baseline: mechanism "leave it as is", effort/blast radius/reversibility `—`, and its top-risk cell states the cost of the problem persisting (tie it to the observable from section 1). Every option's tradeoffs read relative to this column.

| | 0: Status quo | A: <label> | B: <label> | C: <label> |
|---|---|---|---|---|
| Mechanism (one phrase) | leave it as is | … | … | … |
| Effort | — | small/medium/large | … | … |
| Blast radius | — | narrow/moderate/wide | … | … |
| Reversibility | — | easy/moderate/hard | … | … |
| New dep? | — | yes (name) / no | … | … |
| Schema change? | — | yes / no | … | … |
| Top risk (the worst one) | <cost of the problem persisting> | … | … | … |

Then 2 to 4 lines on cross-option observations (from sub-agent 3) — patterns or shared bottlenecks visible across all options.

## 5. Routing (user picks)

This skill does not pick a winner. Pick the option you want, record the pick, and route:

| If you … | Do |
|---|---|
| Pick an option with `effort: small` (per the effort rubric) and a clear mechanism | Record it — `$wf intake investigate <slug> <option> [reason]` — then `$wf intake fix "<option-label> — <one-line option description>" from <slug>` |
| Pick an option with `effort: medium` or `large`, OR `requires_schema_change: yes`, OR `requires_new_dependency: yes` with non-trivial integration | Record it — `$wf intake investigate <slug> <option> [reason]` — then `$wf intake "<option-label> — <one-line option description>" from <slug>` |
| Are not sure which option to pick | Resolve the cheapest **Decisive unknown** among the candidate cards first: a truth question about the system → `$wf intake <slug> discover <the unknown>` (the answer lands as a compressed slice on this workflow); an API fact about a dependency → the `study-sources` skill, with the finding noted in this artifact; a product or policy call → the human who owns it (see the `problem-not-engineering` tripwire). Then pick. If the stall is comprehension rather than evidence, `$wf recap <slug> <focus>` still applies. |

Routing directly (`… from <slug>`) without recording a pick also works — the downstream mode
records the pick implicitly and closes this workflow (see `_investigate-provenance.md`).

## 6. Tripwire warnings (only if any fired)

Tripwires are **warn-and-continue** — record them, do NOT refuse to write the option set.

- **single-viable-option:** Sub-agent 2 found only one genuinely distinct option. State it plainly — the user should know there isn't a real choice here, the next step is just to execute. Routing collapses to one entry.
- **option-space-truncated:** More than 3 genuinely distinct viable options were found; the surplus was demoted to compressed entries by the presentation cap, not on merit. The full cards are a curated sample — check "Demoted by presentation cap" before concluding none of the demoted options fits better.
- **all-options-large:** Every option came back as `effort: large`. The problem may need decomposition before any option becomes tractable — recommend re-running `$wf intake investigate` with a narrower problem statement.
- **architecture-blocking:** Every viable option requires an architecture violation (sub-agent 2's `requires_architecture_violation` is non-empty on all options). The real next step is a design pass — recommend `$wf intake <problem>` framed as an architecture question, not picking from these options.
- **problem-not-engineering:** The constraint that makes this hard is product/policy/business, not technical. The sub-agents could not find a meaningfully different engineering approach because the choice is upstream. Record whatever option set exists, but flag prominently that picking among these options will not resolve the problem — the decision belongs to its upstream owner, and routing should go there before choosing.
- **stale-area:** The recent-churn signal shows the affected area changed >5x in the last 30 days. Any option will land on shifting ground; recommend either pausing until churn settles or coordinating with whoever is actively working in the area.

For each fired tripwire: `[tripwire-name]: <what specifically tripped it>`. Closing line:

> One or more wf-investigate tripwires fired. The option set is still recorded, but review the warnings before picking.

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](../../wf/reference/_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

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
next-invocation: "user-picks — record via $wf intake investigate <slug> <option>; see 01-investigate.md section 5"
option-count: <N: total distinct viable options found>
presented-count: <min(N, 3)>
option-labels: [<A label>, <B label>, <C label>]   # full-card options only
demoted-labels: []   # labels demoted by the presentation cap; empty if none
open-questions: []
augmentations: []
progress:
  - investigate: complete
created-at: <timestamp>
---
```

Body: one-line description of the problem + pointer to `01-investigate.md` and the option labels.

The workflow stays open until the user picks. The pick (`# Pick — decision closure` below, or the
implicit pick in `_investigate-provenance.md`) later flips this index to `closed` with
`chosen-option` provenance and `superseded-by` pointing at the successor workflow.

# Step 5 — Hand off to user

Lead with a short **narrative** paragraph (prose, no bullets) telling the story — what was found, built, or measured, and what it means for the user — then the structured anchors below.

Emit a compact chat summary:

```
wf-investigate complete: <slug>
Problem: <one-line problem>
Options found: <N> (<presented-count> full cards)
  A — <label> — effort:<X> radius:<Y> reversibility:<Z>
  B — <label> — effort:<X> radius:<Y> reversibility:<Z>
  C — <label> — effort:<X> radius:<Y> reversibility:<Z>   # if present
  Demoted by cap: <N−3> — see "Options considered and rejected"   # only if option-space-truncated fired
Cross-option observation: <one line from section 4>
Tripwires: <none | comma-separated list>
Next: pick an option — record it via $wf intake investigate <slug> <option> [reason],
      then route per section 5 (the routed invocation carries `from <slug>`)
Artifact: .ai/workflows/<slug>/01-investigate.md
```

If `single-viable-option` tripped, prefix with:

> ⓘ Only one viable option found. There isn't really a choice here — the next step is to execute the single option.

If `architecture-blocking` tripped, prefix with:

> ⚠ All sketched options require an architecture violation. The right next step is probably a design pass, not picking from these options. See artifact for details.

# Pick — decision closure

Runs only from Step 0 pick mode (`$wf intake investigate <slug> <option-id-or-label> [one-line reason]`).
The pick is the workflow's terminus: it records the decision and closes the workflow. It never
starts the successor — it prints the invocation and stops.

1. **Stamp the artifact.** Add to `01-investigate.md` frontmatter: `chosen-option: <id> — <label>`;
   `chosen-at:` set to the real UTC timestamp per `_timestamp.md`; and
   `decision-note: <the trailing prose>` if the user supplied any (omit the key otherwise).
2. **Append a `## Decision` section** to the artifact body: which option was picked; why (the
   user's reason verbatim, else "user picked without a stated reason"); which tripwires were live
   at pick time (from section 6, or "none").
3. **Close the workflow.** Update `00-index.md`: `status: closed`, `close-reason: option-picked`,
   `superseded-by: pending`, `closed-at: <timestamp>`, `next-command: none`,
   `next-invocation: "none — decision recorded"`. Update the slug's row in `.ai/workflows/INDEX.md`
   to `closed`. `superseded-by: pending` is corrected to the successor slug by the downstream
   mode's link-back (`_investigate-provenance.md`); updating that one field on a closed index is
   additive and safe.
4. **Print the next invocation** with provenance, per the effort routing in artifact section 5 —
   `$wf intake fix "<label> — <one-line mechanism>" from <slug>` (small) or
   `$wf intake "<label> — <one-line mechanism>" from <slug>` (medium+) — and stop. Do not run it.

A `discover` compressed slice landing on this slug (section 5's escalation ladder) is NOT a pick
and re-opens nothing: it is drill-down on a still-open decision, and its answer stays in the
slice — no option-card write-back.

# What this skill is NOT

- **Not a chooser** — this skill sketches options; the user picks. Recording the pick (`# Pick — decision closure`) is bookkeeping so the decision has provenance, not choosing. If you want a single recommended approach with acceptance criteria, that is `$wf shape <slug>` after `$wf intake`.
- **Not a problem validator** — this skill assumes the problem is real and worth solving. If you're not sure whether the problem is genuine, that requires runtime data, telemetry, or user signal that this skill doesn't gather. Run a measurement step first.
- **Not a diagnostician** — if there is a specific symptom (error, crash, slow request) and you want to know *why*, that is `$wf intake rca <symptom>`. Investigate proposes *how to solve*; rca finds *why it's broken*.
- **Not an explainer** — if you want to understand how the area works before forming options yourself, that is `$wf recap <slug> <focus>` or `$deep-research`. Investigate already does a light architecture map, but it is in service of options, not as a standalone explanation.
- **Not a substitute for `$wf shape`** — `$wf shape` produces a chosen design with acceptance criteria, attached to a workflow. `investigate` produces an option set with no chosen winner, attached to nothing yet. After you pick, `$wf intake` → `$wf shape` deepens the chosen option into an implementable spec.
