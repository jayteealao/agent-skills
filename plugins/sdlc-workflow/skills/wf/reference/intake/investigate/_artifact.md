# Investigate artifact body (Step 3 of `intake/investigate.md`)

`intake/investigate.md` holds the `01-investigate.md` frontmatter and the synthesis rules (constraint cross-check, presentation cap). This file holds the body sections, in order.

## The Investigation
<!-- STORY SECTION — first, and self-sufficient. must follow `../../_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language must follow `../../_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

## 1. Problem & constraints

The exact problem. Then 1–2 sentences of restatement that name the observable being solved for (latency? error rate? code clarity? capability gap?). Then the constraint list from Step 1 question 3, each as a bullet.

## 2. Architecture map

A condensed view of sub-agent 1's findings. Do not dump the whole report; extract the parts that matter for evaluating options:

- **Entry points:** ≤5 most-relevant ones with `file:line`.
- **Critical flow:** one paragraph describing the main path through the affected area.
- **Integration boundaries:** the DB / external / queue / cache touchpoints that any option must respect.
- **Architectural constraints:** the 2–4 most load-bearing invariants any solution must respect, each with `file:line` evidence.
- **Recent churn:** any file changed >3x in 90 days that an option would also touch, flagged because it suggests instability.

## 3. Options

One subsection per **presented** option (the ≤3 full cards selected in Step 3). Use the labels from sub-agent 2, not "Option A/B/C" alone:

### Option A — `<label>`

- **Mechanism:** one paragraph. What does this option *do*? Reference specific files and abstractions.
- **Sketch:** 2 to 5 lines: the technique and the rough boundary of the change. NOT implementation steps. Cite at least one `file:line` to anchor it.
- **Files touched (estimated):** list of paths or a count + range.
- **Requires new dependency:** yes/no; name it if yes.
- **Requires schema change:** yes/no; describe the shape if yes.
- **Effort:** small | medium | large, with a one-line justification.
- **Blast radius:** narrow | moderate | wide, with a one-line justification.
- **Reversibility:** easy | moderate | hard, with a one-line justification.
- **Top risks:** 2 to 4 bullets, each naming a specific failure mode (not "could break things").
- **Operational fit:** observability/alerting/runbook implications, or "no operational change required".
- **Honors stated constraints:** yes, or `violates <constraint>` with one line on the collision.
- **Decisive unknown:** `<the assumption that, if false, kills this option>` — cheapest check: `<measurement / source read / truth question>`. Write "none — load-bearing assumptions verified during characterization" only when that is literally true.

Repeat for Option B and Option C (if present).

### Options considered and rejected

If the presentation cap demoted viable options (Step 3), open with a **Demoted by presentation cap** sub-list: `<label> — <mechanism, one phrase> — effort:<X> — <why demoted>`. These are viable options, not rejections; a reader may still pick one. Then the merit rejections from sub-agent 2's `options_considered_and_rejected`, transparency for the reader. Each line: `<label> — <one-line reason rejected>`.

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

Then 2 to 4 lines on cross-option observations (from sub-agent 3): patterns or shared bottlenecks visible across all options.

## 5. Routing (user picks)

This command does not pick a winner. Pick the option you want, record the pick, and route:

| If you … | Do |
|---|---|
| Pick an option with `effort: small` (per the effort rubric) and a clear mechanism | Record it — `/wf intake investigate <slug> <option> [reason]` — then `/wf intake fix "<option-label> — <one-line option description>" from <slug>` |
| Pick an option with `effort: medium` or `large`, OR `requires_schema_change: yes`, OR `requires_new_dependency: yes` with non-trivial integration | Record it — `/wf intake investigate <slug> <option> [reason]` — then `/wf intake "<option-label> — <one-line option description>" from <slug>` |
| Are not sure which option to pick | Resolve the cheapest **Decisive unknown** among the candidate cards first: a truth question about the system → `/wf intake <slug> discover <the unknown>` (the answer lands as a compressed slice on this workflow); an API fact about a dependency → the `study-sources` skill, with the finding noted in this artifact; a product or policy call → the human who owns it (see the `problem-not-engineering` tripwire). Then pick. If the stall is comprehension rather than evidence, `/wf recap <slug> <focus>` still applies. |

Routing directly (`… from <slug>`) without recording a pick also works: the downstream mode records the pick implicitly and closes this workflow (see `_intake-provenance.md`).

## 6. Tripwire warnings (only if any fired)

Tripwires are **warn-and-continue**: record them, and still write the option set.

- **single-viable-option:** Sub-agent 2 found only one genuinely distinct option. State it plainly: the user should know there is not a real choice here, and the next step is just to execute. Routing collapses to one entry.
- **option-space-truncated:** More than 3 genuinely distinct viable options were found; the surplus was demoted to compressed entries by the presentation cap, not on merit. The full cards are a curated sample; check "Demoted by presentation cap" before concluding none of the demoted options fits better.
- **all-options-large:** Every option came back as `effort: large`. The problem may need decomposition before any option becomes tractable; recommend re-running `/wf intake investigate` with a narrower problem statement.
- **architecture-blocking:** Every viable option requires an architecture violation (sub-agent 2's `requires_architecture_violation` is non-empty on all options). The real next step is a design pass; recommend `/wf intake <problem>` framed as an architecture question, not picking from these options.
- **problem-not-engineering:** The constraint that makes this hard is product/policy/business, not technical. The sub-agents could not find a meaningfully different engineering approach because the choice is upstream. Record whatever option set exists, but flag prominently that picking among these options will not resolve the problem; the decision belongs to its upstream owner, and routing should go there before choosing.
- **stale-area:** The recent-churn signal shows the affected area changed >5x in the last 30 days. Any option will land on shifting ground; recommend either pausing until churn settles or coordinating with whoever is actively working in the area.

For each fired tripwire: `[tripwire-name]: <what specifically tripped it>`. Closing line:

> One or more wf-investigate tripwires fired. The option set is still recorded, but review the warnings before picking.
