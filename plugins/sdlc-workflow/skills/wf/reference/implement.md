---
description: Implement one selected planned slice, one plan step and one commit at a time. Writes the implementation record of the slice, with cross-links to its slice definition and its plan. `reviews` fixes the open review findings of the ledger instead.
argument-hint: <slug> [slice-slug|reviews]
---

You are running `/wf implement`, stage 5 of 9: 1·intake → 2·design → 3·slice → 4·plan → `5·implement` → 6·verify → 7·review → 8·ship → 9·retro. You build one planned slice in the order of its plan steps, commit each step, write the test receipt, and write the implementation record of the slice.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | `05-implement-<slice-slug>.md`, and updates the `05-implement.md` master. Schemas: [implement/_artifact.md](implement/_artifact.md). |
| Next | `/wf verify <slug> <slice-slug>` (the default); `/wf review <slug> <slice-slug>` when verification is trivial. |
| Special | `/wf implement <slug> reviews` fixes the open review findings of the ledger `findings.yaml` in parallel, per [implement/_reviews-mode.md](implement/_reviews-mode.md). Example: `/wf implement my-slug reviews`. |

## Card

- Build only the selected slice, in the order of its plan steps. Do not broaden the scope. Do not verify, review or ship.
- Red before green: where a step names a test, write the failing test first and see it fail.
- Commit the code. Write the commit message in product language, per [_output-boundary.md](_output-boundary.md).
- Resolve a small drift from the plan inside the scope, and record it in the implement artifact.
- A plan or a slice reserves a decision for the person only as [_decision-classes.md](_decision-classes.md) "A reservation needs the person's words" says.
- Settle an implementation-detail decision yourself, and record it. Do not settle an intent-bearing decision (per [_decision-classes.md](_decision-classes.md)): run `decide answered` for its key, and when no live entry answers it, return it as a question with a key, the options and a recommended option. Then finish the artifact with `status: awaiting-input`.
- After each step, run only the tests that cover the files of that step. Run the fast and affected suites of the test profile once, at the end, with `wf.mjs receipt` ([implement/_steps.md](implement/_steps.md)).
- A `full` or `heavy` command, or a command longer than the longest check of your brief, is a long run. A long run is never a slice step (`_long-runs.md` L5): record it under `## Packet Checks`. Do this also when an acceptance criterion needs it or names a push hook. The review runs it once for the packet.
- Done when the code is committed and `05-implement-<slice>.md` has `status: complete`.
- To change one section or one line of a record, run `wf.mjs record edit "<root>" <slug> <name> --section <heading> --from <file>` or `... --replace "<old>" --with "<new>"`. To change much of the body, run `wf.mjs record draft "<root>" <slug> <name>`, edit the draft that it names, then run `wf.mjs record put "<root>" <slug>`.
- To change several records or several list items, write a script for `wf.mjs run`, per [_api.md](_api.md).

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | Acceptance Criteria; Non-Functional Requirements; Edge Cases / Failure Modes; Out of Scope |
| `decisions.yaml` | artifact | if-present | |
| `03-slice-<slice>.md` | artifact | always | |
| `04-plan-<slice>.md` | artifact | always | |
| `04-plan.md` | artifact | mode:change | |
| `01-<mode>.md` | artifact | mode:change | |
| `01-rca.md` | artifact | mode:rca | |
| `02b-design.md` | artifact | if-present | |
| `02c-craft.md` | artifact | if-present | |
| `04b-instrument.md` | artifact | if-present | |
| `04c-experiment.md` | artifact | if-present | |
| `05c-benchmark.md` | artifact | if-present | |
| `implement/_artifact.md` | procedure | always | |
| `_source-modes.md` | procedure | always | |
| `implement/_research.md` | procedure | mode:research | |
| `implement/_steps.md` | procedure | mode:commit | |
| `design/_design-context.md` | procedure | mode:ui | Design modes; Shared design laws |
| `design/_craft-floor.md` | procedure | mode:ui | |
| `implement/_reviews-mode.md` | procedure | mode:reviews | |
| `_fix-prompt.md` | procedure | mode:reviews | |
| `07-review-<slice>.md` | artifact | mode:reviews | |
| `findings.yaml` | artifact | mode:reviews | |
| `05-implement-<slice>.md` | writes | | |

Change-mode (`fix`, `hotfix`, `refactor`) and single-scope workflows use the un-suffixed names: `03-slice.md`, `04-plan.md`, `05-implement.md`. In `mode:rca`, `02-shape.md` is the synthesized forwarding contract.

Before you write code against a dependency whose exact behaviour matters, follow [_source-study.md](_source-study.md).

# Role

You run the implement stage of one slice.

# Workflow rules

Apply [_workflow-rules.md](_workflow-rules.md).

# Step 0 — Orient

1. **Resolve the slug** from `$ARGUMENTS`: the first argument is the slug (the dispatcher refuses a call without one), and a second argument is the slice-slug.
2. **Read `00-index.md`** with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`. Take `current-stage`, `status`, `selected-slice`, `open-questions` and `workflow-type` from its frontmatter.
3. **Check for reviews mode.** When the last argument is literally `reviews`, the run fixes review findings: load [implement/_reviews-mode.md](implement/_reviews-mode.md), skip the rest of Step 0, and follow that file.
4. **Find the source mode.** Apply the row of `workflow-type` in [_source-modes.md](_source-modes.md): the lead record, the acceptance source, the record names and the implement action. When the action is stop, give its route and stop. Wherever a step below names a suffixed file and the row names records without a suffix, use the name without the suffix.
5. **Resolve the slice-slug**: the one that was passed, else `selected-slice` of the index. In compressed mode the slice-slug may be empty: `01-fix.md` (or the legacy `01-quick.md`) covers one intended change.
6. **Check the prerequisites of the mode.** Check a record with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> <name>`, which exits 1 when the record is absent.

   | Mode | Needs | When it is missing |
   |---|---|---|
   | Compressed | `01-fix.md`, or the legacy `01-quick.md` (check both) | Stop: "Run `/wf intake fix <slug>` first or use a different workflow type." |
   | Standard, forwarded, change mode | A plan: `04-plan-<slice-slug>.md` or `04-plan.md` (a change mode always uses the un-suffixed name) | Stop: "Run `/wf plan <slug> <slice-slug>` first." |

   - When the source plan or quick artifact shows `Status: Awaiting input`, stop.
   - When `05-implement-<slice-slug>.md` (or `05-implement.md` in compressed mode) already exists, say in chat that this is a re-run, and go on. [_additive-write.md](_additive-write.md) snapshots the earlier revision and appends the `revisions:` ledger; no permission question is needed.
7. **Use the source context** of the row of [_source-modes.md](_source-modes.md). The `## Requires` rows name the files.
8. **Apply the augmentation context.** For each entry of the `augmentations:` list of `00-index.md`, do what its type says:

   | Type | Artifact | What implement does |
   |---|---|---|
   | `design-<sub>` (for example `design-harden`, `design-colorize`) | `design-notes/<sub>-<timestamp>.md` | The design code was applied in an earlier pass. Keep the documented changes. |
   | `design-audit` | `07-design-audit.md` | Resolve each "critical" or "high" finding. |
   | `design-critique` | `07-design-critique.md` | Apply the recommendations of the critique where they conflict with the default choices. |
   | `instrument` | `04b-instrument.md` | Build the instrumentation signals of the plan. Each dark-path entry has a designed signal: add its log, metric or trace call to the code you build, with the framework that the artifact names. |
   | `experiment` | `04c-experiment.md` | Wire up the experiment: the feature flag, the cohort split and the metric instrumentation of the artifact, with both the variant path and the control path. |
   | `benchmark` (mode: baseline) | `05c-benchmark.md` | Note the baseline numbers; the build may not regress them. `verify` runs the compare again (it loads `augment/benchmark.md` in compare mode). |
   | `tune` | `05d-tune.md` | Run the rounds of `augment/tune.md`: one lever per round, the harness after each commit, until the target is met, the budget is spent, or the number stalls. |

   **Start a tune loop yourself** when the done check of a plan step is a measured number and the first build misses it:
   1. Write the draft of `05d-tune.md` per `augment/tune.md`, with the metric, the target and the harness of that step, and run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` per [_records.md](_records.md).
   2. Register it in the `augmentations:` list of the index with `type: tune`: `record set "<root>" <slug> index "augmentations+={type: tune, artifact: 05d-tune.md, status: in-progress}"`.
   3. Run the rounds.

   **Apply the design planning artifacts**, apart from the augmentations:
   - `02b-design.md`, the design brief: carry forward the design mode of each surface, the color strategy and the anti-goals.
   - **Baseline design canon**, when the slice builds UI and neither `02b` nor `02c` exists: `design/_design-context.md` gives the design modes, the design laws and the motion summary. When the code touches motion, interface detail or typography, also read `animate.md`, `polish.md` or `typeset.md`. Skip their preflight, image and mutation sections: those govern `/wf design`.
   - **Recommended references**, when `02b-design.md` or `02c-craft.md` is present: take the union of `recommended-references:` of `02b-design.md` and `references-loaded:` of `02c-craft.md`, strip a trailing `.md`, remove duplicates, and read `design/<name>.md` for each name. A reference is read-only judgment context: it settles a doubt about the visual contract and never widens the scope. When an entry names no file, log a one-line warning and go on.
   - `02c-craft.md`, the visual contract. Each item of `## Mock fidelity inventory` is one more acceptance criterion: honour each one in the code. `## Implementation contract` names the token choices, the component decisions and the motion specs to follow.
   - `## Component map` of `02c-craft.md` binds the build. Import each component that is in the code; do not build it again. Make each component of `components-to-build:` once, as a shared component, and run `node "<skill-dir>/scripts/wf.mjs" design component link "<projectRoot>" <key> --code <file> --name <its name in the code>`. Do not add a second component for a part that the map names.
   - With `screens:`, also read the screen pages of the slice with `wf.mjs design approved`, and make the content of each `worst` state loadable in development (`design/_surface.md` → Use the screens in a later stage).
   - **Design moves.** For each move that the plan cites, read its playbook in `design/<name>.md` and apply it during the build. Then register it as a `design-<sub>` augmentation (`record set "<root>" <slug> index "augmentations+={type: design-<sub>, artifact: <file>}"`), and write `design-notes/<sub>-<timestamp>.md` (contract in `design/_output.md`, "Registration and the transformation artifact").
   - When the contract cannot be built as drawn, stop per [design/_lane.md](design/_lane.md), and route to `/wf design <slug> amend`.
9. **Check the sibling implementations.** Run `node "<skill-dir>/scripts/wf.mjs" record list "<root>" <slug>` for the implementation records of the sibling slices. Compare the files of the plan with the `files-modified` key of each one. When a file overlaps, read that sibling record in full with `record get`.
10. **Carry forward** `open-questions` from the index.
11. **Branch check.** Read `branch-strategy`, `branch` and `base-branch` from `00-index.md`:

    | `branch-strategy` | Do |
    |---|---|
    | `dedicated` (required) | Run `git branch --show-current`. When you are not on the workflow branch and the branch is missing, run the base check first (`node "<skill-dir>/scripts/wf.mjs" base check "<root>" --base <base>`, [_workflow-rules.md](_workflow-rules.md)), then create it from `<base-branch>` with `git checkout -b <branch>`. When it exists, run `git checkout <branch>`. Confirm the branch before you go on. |
    | `shared` | Commit to the current branch. Do not create or switch a branch. |
    | `none` | Skip all branch management. |

# Parallel research

Before you build, launch parallel sub-agents that check that the plan is still accurate. Skip them for a trivial change of one file. The charters are in [implement/_research.md](implement/_research.md). When they run, list `research` in `modes:`. Merge their findings. When the codebase moved far from the plan, note the deviations in the implementation record, and adapt the plan steps before you build.

# Build discipline

Shape settled what to build, and plan settled the strategy (the build-avoidance ladder, rungs 1 to 4). Your job is the fewest lines that satisfy the plan and the acceptance criteria: minimal because sufficient, not golfed. Before you write the code of each plan step:

- **Honour the ladder decisions of the plan.** When the plan landed on rung 1, 2 or 3 (the standard library, the native platform, reuse), do not bring back a dependency, and do not hand-roll it.
- **Climb once more at the code level.** Prefer a standard-library or native call to a hand-rolled helper, a direct call to a wrapper, a literal to a config knob, one line to a block, and a deletion to an addition. Add no abstraction that the plan did not ask for: an interface, factory, strategy, generic or options object with one implementation or one call site. This restraint is about the structure of the code only. Never trim an acceptance criterion: shape and plan own what exists.
- **Lazy is not negligent.** Never trim these for brevity: input validation at a trust boundary, error handling that prevents data loss, security, accessibility, calibration on real hardware, and anything that an acceptance criterion needs. Non-trivial logic leaves its verification behind; a trivial one-liner does not.
- **Mark a deliberate shortcut.** When you take an intended simplification with a known ceiling (a global lock, an O(n²) scan, a naive heuristic, a hard-coded value), leave a one-line `sdlc-debt:` comment at the site that names the ceiling and the upgrade path. Record it in `## Anything Deferred` (a deferral) or in `## Known Risks / Caveats` (the ceiling is live in shipped code).
- **Mark each new type or lint suppression as debt.** Each suppression you add (`as any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, or the equivalent of the language, such as `# type: ignore`, `@Suppress`, `#[allow(...)]`, `// nolint`) carries an `sdlc-debt:` marker with a reason at the site. The debt machinery takes the class from there: verify checks the marker, retro reconciles it, and `/wf intake simplify` sweeps it. A warn-only hook (`suppressionDebtLint`) flags an unmarked suppression at write time; it looks for `sdlc-debt:` within 2 lines either side.
- **A build decision that goes against an intent-risk is intent-bearing**, per rule 1 of [_decision-classes.md](_decision-classes.md).
- **Build for verifiability.** The verification seams of the plan are part of done. `## Verification Strategy` of the plan names what makes each user-observable acceptance criterion observable: a seeded fixture, a deterministic clock, a `data-testid` or accessibility id, an emulator or test config, an exported test hook. Build those seams in this slice, and record each one in `## Verification Seams Built`. When you could not build a seam that the plan named, say so there and in `## Deviations from Plan`.

# Design build discipline

This section applies when the slice builds UI and a visual contract or the design canon applies.

1. List `ui` in the `modes:` of the implementation record.
2. Before the first edit of a UI file, load [design/_craft-floor.md](design/_craft-floor.md), once per slice. Check the result against its Refuse and Verify lists. A floor refusal that you introduce is a defect that review and verify send back.
3. When the deliverable is a reusable component (a primitive of the design system or a shared widget, not a one-off screen), apply [design/_component-craft.md](design/_component-craft.md): an API built for the developer first, good defaults, a memorable name, an example to touch.
4. **Contract-check pass**, when `02c-craft.md` was present. After you build against the visual contract, and before you write the implementation record, dispatch one fresh-context check agent. This is the blind pre-mortem pattern (`shape.md` Step 9), not a self-critique.
   - Give the agent only the contract inputs (`02c-craft.md`, `02b-design.md`, the board PNGs, the design-mode reference of each surface) and the built surface.
   - Its charter: report each material departure from the mock fidelity inventory, the boards, the anti-goals and the design-mode rules, each with `file:line` evidence.
   - Fix each material defect that it reports. Record in `## Visual Contract Honored` what the pass caught, and the `file:line` where each fix landed.

# Steps 1–12 — Build, record and commit

1. Make sure you are on the right branch: the branch check of Step 0.11 is complete.
2. Track the plan steps in the step record. Run `step where` for the slice, and record each step of `## Step-by-Step Plan` of `04-plan-<slice-slug>.md` with `step start` and `step done`, per [implement/_steps.md](implement/_steps.md). The step record replaces a host checklist. A blocked step gets `step stop` with its reason.
3. Check the current code again before you edit it, with the files that sibling slices changed.
4. When the slice depends on external APIs or libraries that change, run a freshness pass first.
5. Build the selected slice, step by step. Commit and record each plan step per [implement/_steps.md](implement/_steps.md).
6. Change tests, docs, types, configs or migrations only where this slice needs it.
7. Summarize the exact change set.
8. Write the draft of `05-implement-<slice-slug>.md` per [implement/_artifact.md](implement/_artifact.md), and put it. Ground the record per [_grounded-progress.md](_grounded-progress.md): each entry of `## Verification Seams Built` and `## Visual Contract Honored` cites a `file:line` that you opened again after the edit, not your memory of the edit.
9. Write the draft of `05-implement.md`, the master index, and put it. To change one row or one field of it, use `record edit` or `record set`. Skip this step when the workflow uses the un-suffixed names: its one record is the stage record.
10. Evaluate the routes ("Adaptive routing"), and write each viable option into `recommended-routes` of the frontmatter.
11. Record the end of the stage with `node "<skill-dir>/scripts/wf.mjs" record stage-done "<root>" <slug> implement <slice-slug>`. It writes `current-stage`, `progress.implement`, `next-command` and `next-invocation` (the default route, `/wf verify <slug> <slice-slug>`), and adds the new records to `workflow-files`. When you chose another route, add `--next "<invocation>"`. Set any other index field with `record set "<root>" <slug> index key=value ...`. Do not change the plan records. `record stage-done` sets the roster status.
12. Make the atomic commit, when `branch-strategy` is `dedicated` or `shared`. Stage by path, and fail closed on any other dirty path, per the commit rule of [_workflow-rules.md](_workflow-rules.md). Commit what the step commits did not take, as `<type>: <what the change does>` ([implement/_steps.md](implement/_steps.md)). Do not push: the PR phase of ship pushes. Record the commit SHA in the frontmatter of the slice record: `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> 05-implement-<slice-slug>.md commit-sha=<sha>`. When `branch-strategy` is `none`, skip the commit. Then write the test receipt ([implement/_steps.md](implement/_steps.md)).

# Chat return contract

After you write the files, return per [_chat-return.md](_chat-return.md): lead with the narrative (its section *The narrative*), then give this receipt:

- `slug: <slug>`
- `wrote: <paths>` (the slice record and the master update)
- `options:` (each viable option of "Adaptive routing")
- at most 3 short blocker bullets, when needed

# Adaptive routing

Write each viable option as one `recommended-routes` entry, with its reason:

| Option | Route | When |
|---|---|---|
| A (default): Verify | `/wf verify <slug> <slice-slug>` | The change touches testable behaviour. Recommend a compaction first: the next stage reads the state of the workflow from disk again. |
| B: Skip to review | `/wf review <slug> <slice-slug>` | A purely declarative change with no testable behaviour. Recommend a compaction first, for the same reason. |
| C: Revisit plan | `/wf plan <slug> <slice-slug>` | The plan was wrong: missed files, wrong assumptions. |
| D: Blocked | none | Explain what blocks the slice. |
