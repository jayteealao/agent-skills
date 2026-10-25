---
description: Tuning loop for a measured target. A slice whose goal is a number (a latency, a size, an accuracy, a frame time) moves it in bounded rounds — change one lever, run the harness, record the round — until the target is met, the round budget is spent, or no lever moves the number. Writes 05d-tune.md in the existing workflow directory.
argument-hint: <slug> <slice-slug>
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running the **tune sub-procedure**: a bounded loop that moves one measured number into its target range.

> **Loaded as a sub-procedure (not a standalone key).** Shape (intake from v10) flags `tune` in `augmentations-needed` when an acceptance criterion is a number that the build must reach. Implement may also start it when a plan step's done check is a number that the first build misses. `plan` runs the feasibility spike, `implement` runs the rounds, and `verify` runs the harness again.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | `05d-tune.md` |
| Updates | `00-index.md`: an entry in `augmentations:` with `type: tune` |
| Does NOT | Change the metric, the target range or the harness after the first round. Change a lever that the record does not name. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | Acceptance Criteria |
| `04-plan-<slice>.md` | artifact | if-present | |
| `05d-tune.md` | artifact | if-present | |
| `05d-tune.md` | writes | | |

# The tune record

`05d-tune.md` holds one loop. Its frontmatter:

```yaml
---
schema: sdlc/v1
type: augmentation
augmentation-type: tune
slug: <slug>
slice: <slice-slug>
mode: spike | rounds | complete
metric: "<what is measured, with its unit, for example p95 latency of GET /search in ms>"
target: "<the range that passes, for example <= 120>"
harness: "<the one command that prints the number>"
levers: ["<each thing that a round may change>"]
round-budget: <the most rounds, 3 to 8>
rounds-run: <n>
result: open | met | budget-spent | stalled
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
---
```

The body has `## Baseline` (the harness output on the code before the first round), `## Rounds` and `## Result`. `## Rounds` is a table with one row per round:

| Round | Lever | Change | Number | Delta | Commit |
|---|---|---|---|---|---|
| `1` | `<the lever>` | `<what changed, in one line>` | `<the harness number>` | `<the change from the round before>` | `<short sha>` |

Write the record as the draft `.ai/workflows/<slug>/.draft/05d-tune.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` ([_records.md](../_records.md)). To add a section or a row, get the record with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> 05d-tune.md`, change it, write the draft and put it. To change only `mode:`, `result:` or `rounds-run:`, run `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> 05d-tune.md key=value`.

# Rules

1. **The harness is the judge.** One command prints the number. Run it the same way in every round, on the committed tree. The number of a round is the median of 3 runs when one run varies by more than 5 percent.
2. **One lever per round.** Change one named lever, commit, run the harness, and write the row. A change that touches two levers is two rounds.
3. **Stop on the first of three conditions.**
   - The number is inside the target range: `result: met`.
   - The rounds reach `round-budget`: `result: budget-spent`.
   - Two rounds in a row move the number by less than the noise of the harness: `result: stalled`.
4. **A round that makes the number worse is reverted.** Revert its commit, keep its row with `Delta` marked `reverted`, and try another lever.
5. **The target is the person's.** Do not widen the target range, change the metric or swap the harness. When the budget is spent or the loop stalls, the result is a question for the person: accept the number, raise the budget, or change the target. Record the answer per [_decisions.md](../_decisions.md).

# Plan: the feasibility spike

Before the slice is planned in full, run the harness once on the current code and write `## Baseline`. Then try the most promising lever once, without a commit, and record whether the number moved. Set `mode: spike`. When no lever moves the number, say so in the plan `## Risks / Watchouts`: the target may need a change of approach, and that is a question for the person.

# Implement: the rounds

Set `mode: rounds`. Run the rounds by the rules above, inside the implement time box. Each round commit is a plan step for `wf.mjs step`. When the loop stops, write `## Result`, set `result:`, and set `mode: complete`.

# Verify: the harness again

Run the harness on the final commit. The number must be inside the target range when `result: met`. A number outside the range is a failure of the acceptance criterion, not a deferral.
