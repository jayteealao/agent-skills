# RCA artifact bodies (Steps 3–4 of `intake/rca.md`)

`intake/rca.md` holds the frontmatter of `01-rca.md`, `02-shape.md`, and `00-index.md`. This file holds the body templates the two artifacts are written from.

## `01-rca.md` body sections (in order)

Merge findings from the sub-agents. **Do not invent root causes the agents did not surface.** If the agents disagree or returned low confidence, the RCA records that; uncertainty is data.

Write the explainer to `01-rca.explainer.html.fragment` per [_story-arc.md](../../_story-arc.md). Write each section below under a fixed, unnumbered `##` heading: `## Symptom`, `## Scope`, `## Investigation summary`, `## Root cause`, `## Contributing factors`, `## Blast radius`, `## Suggested fix shape`, `## Verification`, `## Confidence`, `## Recommended next command`, `## Tripwire warnings`. Other files cite these names.

### Symptom
The user-reported issue, exact where possible. ≤3 sentences. Cite the original error message or stack trace if provided.

### Scope
- **Who is affected:** all users / cohort / specific account / specific environment.
- **When it started:** first known occurrence (commit, deploy, time window) or "unknown".
- **Reproduction:** specific steps if reliably reproducible, or "intermittent — see Step 4 evidence".

### Investigation summary
A short bulleted list of what was checked. ≤6 bullets. Mention what each sub-agent inspected, what was ruled out, and what was confirmed. Ruling things *out* is data; record it.

### Root cause
The actual cause, written as a mechanism: "X happens because Y, which causes Z." Cite specific `file:line` locations. ≤5 sentences. If multiple plausible causes survive investigation, list them in priority order with the evidence supporting each.

### Contributing factors
Secondary issues that made the bug worse, harder to detect, or harder to recover from: missing test coverage, no observability on the affected path, retry logic that masked early failure, error handling that swallowed the original exception. ≤4 bullets.

### Blast radius
- **Currently visible:** what is broken right now.
- **Possibly affected (silent):** other code paths or persisted data that may be corrupt or behaving unexpectedly because of this same root cause.
- **Same pattern elsewhere:** other locations in the codebase where the same flawed pattern exists and should be checked or fixed alongside this work.

If sub-agent 3 was skipped, write: "Blast radius investigation skipped — symptom is local to <component>. If the fix turns out to require changes outside <component>, run `/wf intake rca` again or escalate to `/wf intake`."

### Suggested fix shape
**Direction, not a plan.** 1 to 3 lines naming the area and the approach. Do not enumerate implementation steps; that belongs in `/wf plan` or `/wf intake fix`. Examples of the right shape:

> "Fix the off-by-one in `cart/total.ts:checkout()` — apply discount before tax, not after. One-line change. Add a regression test in `cart.test.ts`."

> "Add idempotency keys to the checkout webhook handler. New middleware in `webhooks/checkout/`. Deduplicate by `(provider_event_id, order_id)`. Migration to add an index. Estimate 3-5 files."

### Verification
How will we know the fix worked? List:
- **Test:** specific assertion or test command that should pass post-fix.
- **Manual:** specific URL, flow, or visual check.
- **Log signal:** specific log line, metric, or absence-of-error that confirms the bug is gone.

This section becomes the acceptance criteria for the downstream fix workflow.

### Confidence
- **Root cause confidence:** high | medium | low. One sentence justifying.
- **Fix shape confidence:** high | medium | low. One sentence justifying.

If either is `low`, this section also names the next rung of the escalation ladder, cheapest first; never jump straight to a human: a runtime fact the diagnosis hinges on → `/wf probe <slug> "<the question>"` (the finding lands as a compressed slice on this workflow); a dependency/framework behavior question → the `study-sources` skill against the installed source; a second model on the hypothesis → `/consult`; a product/policy call or low confidence that survives those rungs → human triage. State which rung applies and why.

### Recommended next command
Pick **one** primary recommendation based on the diagnosis. The printed invocations are the exact dispatcher-valid forms: record the route first, then run the printed command.

| Conditions | Route | Invocation printed |
|---|---|---|
| `impact: critical` AND production-affecting AND root-cause-confidence ≥ medium AND blast-radius ≤ medium AND suggested-fix-shape is small | `hotfix` | record — `/wf intake rca <slug> hotfix` — then `/wf intake hotfix "<symptom, one line>" from <slug>` |
| Suggested fix shape touches ≤3 files, ≤5 steps, no new dependency, no architecture change | `fix` | record — `/wf intake rca <slug> fix` — then `/wf intake fix "<suggested fix, one line>" from <slug>` |
| Anything else — including any architectural change, new dependency, cross-cutting work, or blast radius is `high` | `plan` | `/wf intake rca <slug> plan`, then `/wf plan <slug>` (same slug continues — the synthesized `02-shape.md` is its input) |
| `root-cause-confidence: low` AND `blast-radius: high` | `human-triage` | climb the escalation ladder first (see `## Confidence`); when low confidence survives it, record `/wf intake rca <slug> human-triage` and hand to the human |

State the recommendation clearly with one sentence of justification. Then list the alternatives in priority order. The user makes the final call. Routing directly (`… from <slug>`) without recording works too; the downstream mode records the route implicitly per `_intake-provenance.md`.

### Tripwire warnings (only if any fired)
Tripwires are **warn-and-continue**: record them, and still write the RCA. Tripwires:

- **Confidence breach:** root-cause-confidence is `low`.
- **Blast radius breach:** blast-radius is `high` (regardless of confidence).
- **Multiple plausible root causes:** `## Root cause` listed >1 cause and the sub-agents could not narrow further.
- **Concurrent work conflict:** Sub-agent 2 found an open PR touching the implicated path; fixing this may collide with that work.
- **Same-pattern elsewhere:** the buggy pattern repeats in other locations and the fix scope expands beyond the originally implicated code.

For each fired tripwire, write one line: `[tripwire-name]: <what specifically tripped it>`. Then add a single closing line:

> One or more wf-rca tripwires fired. The RCA is still valid, but the downstream fix workflow should account for the recorded warnings before proceeding.

## `02-shape.md` body

The shape is a *forwarding contract*. It refers to the RCA sections and does not copy them.

```markdown
# Shape (synthesized from RCA)

`/wf intake rca` wrote this shape from `01-rca.md`. Read `01-rca.md` before planning.

## Problem

See `01-rca.md` `## Symptom` and `## Root cause`.

## Scope (in)

See `01-rca.md` `## Suggested fix shape` and the files that `## Root cause` names.

## Scope (out)

- Anything not directly required to remediate the root cause identified in `01-rca.md`.
- Refactoring, cleanup, or unrelated improvements in the implicated files. If those are needed, file separately.
- Same-pattern-elsewhere fixes (`01-rca.md` `## Blast radius`). Each needs its own scoping decision.

## Acceptance criteria

Each item of `01-rca.md` `## Verification` is one acceptance criterion.

## Open questions

<list any items from `01-rca.md` `## Confidence` that the user still needs to decide; or "none">
```
