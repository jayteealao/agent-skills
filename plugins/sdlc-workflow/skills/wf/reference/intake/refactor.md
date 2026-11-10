# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary and the workflow-registry / slug rules. Apply the "Compressed-lifecycle change-modes" contract in `intake/_change-mode-tail.md`: the model, the authorship split, and the gate. Do not restate them here.

You are running `/wf intake refactor`, a **behavior-preserving refactoring standard lifecycle**.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `refactor`: it overrides the standalone steps below.

# Pipeline
`01-refactor`(intake) → `02-shape` (baseline) → `03-slice` → `04-plan` → **[gate]** → `/wf implement` (→`05`) → `/wf verify` (→`06`) → `/wf review architecture` (focus refactor-safety, →`07`) → `/wf ship` → `/wf retro`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces (this command) | `01-refactor.md` (`type: intake`, the brief), `02-shape.md` (**the baseline**: the API surface, the coverage map, the gaps, the frozen APIs and the scope), `03-slice.md` (`type: slice-index`, one slice), `04-plan.md` (incremental green steps), and a conformant `00-index.md` (`type: index`). |
| Compression | Each stage is one pass, and no stage is skipped. The refactor is one slice; its units are the atomic green steps of the plan. A refactor large enough to need real multi-slicing takes the *Escalate* option of the gate, to a full `/wf intake`. |
| Gate | Stop and ask before `05-implement` (Proceed / Adjust / Escalate). |
| Next | `/wf implement <slug>`, the standard execution. `07-review` defaults to **`refactor-safety`**. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| existing code to refactor, and its tests | artifact | always | |
| `00-index.md` | artifact | on-resume | |
| `01-refactor.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_change-mode-tail.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `design/_lane.md` | procedure | always | UX impact |
| `design/stage.md` | procedure | mode:design | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-refactor.md` | writes | | |
| `02-shape.md` | writes | | |
| `03-slice.md` | writes | | |
| `04-plan.md` | writes | | |

# Behavior preservation is the only acceptance criterion
You orchestrate a refactoring. The one goal is the same external behavior before and after.
- **Add no new functionality** during a refactor. Finish the refactor, then start a separate `/wf intake` for the new behavior.
- **Do not change the public API surface** (exported signatures, REST routes, event names, component props, config keys), unless API simplification is the stated goal.
- **Do not skip a failing test** with `skip`/`xtest`/`@Ignore` or a comment. A test that fails after your change is a regression: fix the refactor, not the test.
- **Do not rewrite in one large commit.** Each plan step leaves the codebase working and green.
- **Do not assume that the tests are enough.** The baseline (Step 2) records what the tests cover; a gap is a risk.
- The lifecycle skips no stage; each is one pass. Keep the stated order only where a step uses the output of an earlier step or crosses a gate. Reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve the slug and the mode** from `$ARGUMENTS`:
   - When the argument matches an existing workflow whose index (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) has `workflow-type: refactor`, this is **resume mode**. Read the index, and continue from the first unwritten planning artifact. An old slug may carry `rf-*.md` files: write them again as the standard set when you continue.
   - Otherwise this is a **new refactor**.
2. **New slug.** Name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `refactor-<short-description>` (the old alias for refactor: `rf-*` artifacts).
3. **Provenance check.** Apply `_intake-provenance.md`. The common source is a `/wf intake simplify` finding routed here. Its entry (id, files, rationale, severity) travels in the invocation text, and seeds `## Target` and `## Why` directly. An explicit `from <source-slug>` token (an investigate option, an escalated change mode) uses its row of the Consume table. With no match, go on.
4. **Stack fingerprint.** Apply the stack policy in `_change-mode-tail.md`: detect cheaply. The one-line confirmation rides the question round of Step 1, and sets `stack.user-confirmed: true`. Then set `ux-impact` per `_change-mode-tail.md` → UX impact and the design stage.
5. **Branch check.** A refactor should use a dedicated branch. Ask per the gate-question ladder ([_gate-question.md](../_gate-question.md)), with the options `Create dedicated branch (recommended)` / `Use current branch`. For a dedicated branch:
   1. Run the base check first: `node "<skill-dir>/scripts/wf.mjs" base check "<root>" --base <current branch>` ([_workflow-rules.md](../_workflow-rules.md)).
   2. Run `git checkout -b refactor/<slug>` from the current branch.

   Record the choice, so that `branch-strategy` and `branch` of the index reflect it: `branch` is empty when the person kept the current branch.
6. **One slice.** The refactor is one slice. The workflow slug is also the `slice-slug` of that slice: use `<slug>` for `slice-slug`, `selected-slice` and `best-first-slice`. The refactor units are the steps of the plan. The later stages write un-suffixed files.

# Step 1 — Brief → `01-refactor.md` (`type: intake`)
**Write the index first.** Before the first question or research of this step, write the draft of `00-index.md` from the shared change-mode index template in [_change-mode-tail.md](_change-mode-tail.md), with the values of the `refactor` column, `progress.intake: in-progress` and `next-invocation: /wf intake refactor <slug>`, and put it. A run that stops before the gate can then resume (the resume test of Step 0 reads this index), and a close or a probe route of a later step has an index to act on.

Ask 3 to 6 targeted questions, not the 5-round PO interview:
1. **What is being refactored?** The files, modules, classes or components, specifically.
2. **Why?** The structural problem: one class doing three things; copy-paste across N files; nested conditionals; the wrong abstraction; a performance bottleneck.
3. **What must not change?** The behaviors, APIs, interfaces and outputs that are frozen.
4. **Is there test coverage?** The covered areas and the test files. When there is none, add tests first?
5. **Target structure?** What the code should look like after: extract a service; a strategy pattern; early returns.
6. **Stack confirm.** The one-line confirmation of the fingerprint of Step 0, per the stack policy of `_change-mode-tail.md`.

Write the draft `<wf-dir>/.draft/01-refactor.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. Write the draft of each later planning record (`02-shape.md`, `03-slice.md`, `04-plan.md`, `00-index.md`), and put it, the same way.
Take the frontmatter from the `01-<mode>.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Body: `## Target` (what), `## Why` (the structural problem), `## Frozen` (the APIs and behaviors that must not change), `## Target Structure`.

# Step 2 — Baseline → `02-shape.md` (the most important step)
The baseline captures the ground truth before any code change. It is the shape. Launch the sub-agents in parallel.

**Effort tier.** Give every agent the tier **low** ([_subagents.md](../_subagents.md)). Both do a bounded inventory with structured output.

### research sub-agent 1 — Code State Snapshot
Give it all of these:
- Read every target file: the line count, the exported names, the implicit contracts (events emitted, global state, files written).
- Read every caller: grep the imports across the repo.
- Document the current **public API surface**: the exported signatures with their parameter and return types, the class methods, the REST routes, the component props.
- Note the code that does not change on purpose.

### research sub-agent 2 — Test Coverage Snapshot
Give it all of these:
- Find every test file that covers the target: grep the target imports in the test directories.
- Per test file: what behavior it covers, its key assertions, its inputs and outputs.
- Find the **coverage gaps**: the exported functions and paths with no coverage.
- Run the existing tests of the area, and capture the pass, fail and skip counts and any flakiness.

Wait for both. Write the draft of `02-shape.md` with the baseline, and put it.
Take the frontmatter from the `02-shape.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Body. This is the baseline: keep it rich.
- `## Public API Surface`: every exported name with its signature, exactly as it exists now. It is the acceptance contract of verify.
- `## Test Coverage Map`: behavior → test file.
- `## Coverage Gaps`: the uncovered behaviors, the risk of the refactor.
- `## Baseline Command`: the exact test command that sub-agent 2 ran. Verify runs this literal command again and diffs its counts.
- `## Baseline Test Result`: the pass, fail and skip counts before any change.
- `## Callers`: the count and the key sites.
- `## In Scope` / `## Out of Scope`: the frozen surface.
- `## Coverage Decision`: written after the question below: the option the person chose, and why.

**When the coverage gaps are significant,** ask per the gate-question ladder ([_gate-question.md](../_gate-question.md)): "Coverage gaps found in: <list>. Refactoring without tests covering these areas is risky. Add tests first?" The options are `Add tests first (recommended)` / `Proceed with gaps noted as risk` / `Abort`. Record the answer in `## Coverage Decision`: the choice is a durable gate decision, not chat.
- **Add tests first:** Step 1 of the plan becomes "author characterization tests for `<the gaps>`". It is a real plan step that runs before any restructuring, committed on its own, so that the baseline grows before the refactor starts.
- **Proceed with gaps:** record each gap as a `## Tripwire breaches` entry per `_change-mode-tail.md`.
- **Abort:** close the slug per the Abort rule of the tail (`close-reason: cancelled`).

# Step 3 — Slice → `03-slice.md` (`type: slice-index`, one slice)
Take the frontmatter from the `03-slice.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Body (one line): "Single-slice refactor — the units are the plan's atomic green steps."

# Step 4 — Plan → `04-plan.md`
Plan the refactor as a sequence of atomic steps, each green on its own. Each step leaves the codebase passing (tests green, build passing), is one logical change, and changes only the internal structure, never the external behavior.

First launch one sub-agent to research the target pattern with a web search: the established patterns, the common pitfalls, and the safe incremental approaches (for example strangler-fig, parallel-change/expand-contract, replace-conditional-with-polymorphism). **Effort tier:** give it **low** ([_subagents.md](../_subagents.md)); it is bounded search-and-extract work.

The refactor tripwires are: a step that cannot be made green on its own; an API surface delta when API simplification is not the stated goal; a coverage gap accepted at Step 2. Record each breach per the tripwire-breach mechanism in [_change-mode-tail.md](_change-mode-tail.md).
Take the frontmatter from the `04-plan.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Body `## Steps`. Each step has: **What changes** (the specific files), **What does NOT change** (the preserved surface), **Verify green** (the test command after this step), **Why before the next** (a dependency, or "independent"). Then `## Pattern` (the named refactoring pattern) and `## API Surface Delta`: `none`, unless API simplification is the stated goal.

# Step 5 — Finish `00-index.md` (conformant `type: index`)
Get the index that Step 1 wrote (`record get "<root>" <slug> index`), and finish it. Write its draft from the shared change-mode index template in [_change-mode-tail.md](_change-mode-tail.md), with the values of the `refactor` column: the final `workflow-files`, `progress` and terminus route. `branch` is empty when the person kept the current branch; `stack.user-confirmed: true` after the confirmation of Step 1. Put it.

# Step 6 — Gate before implement
Apply the gate and the family gate rules in [_change-mode-tail.md](_change-mode-tail.md). Record the decision in `01-refactor.md` on every branch. On **Escalate** (the refactor needs real multi-slicing), the tail closes this slug and prints `/wf intake "<description>" from <slug>`. The successor inherits the API surface and the coverage baseline through `_intake-provenance-consume.md` (the row of the escalated change mode), so the work of two sub-agents is not lost.

# Step 7 — Hand off to the standard chain
On proceed, route to the standard chain:
1. `/wf implement <slug>`: one atomic green step per plan step, never combined. Commit each step as `refactor: <what the step does>`, per [../implement/_steps.md](../implement/_steps.md). When the verify of a step fails, stop, and fix the refactor, not the test. When two fix attempts on the same step fail, do not keep guessing: run `/wf probe <slug> "<the behavior question the failure raises>"`, or bring it to the person.
2. `/wf verify <slug>`: the full baseline comparison. Run the literal `## Baseline Command` again, and diff its pass, fail and skip counts against `## Baseline Test Result`. Check that every name of `## Public API Surface` still exists with the same signature, and that every caller still works. Any unplanned delta fails verify.
3. **`/wf review <slug> refactor-safety`**: it checks for unintended behavior changes, subtle semantic differences, and the completeness of the coverage.
4. `/wf ship` → `/wf retro`.

Lead with a short narrative paragraph (the target, the reason, the baseline counts, the pattern, the gate decision), then:
```
wf intake refactor complete: <slug>
Branch: refactor/<slug>
Baseline: <pass>/<fail>/<skip> tests · Coverage gaps: <count>
Plan: <N> atomic green steps · Pattern: <name> · API delta: <none | planned changes>
Gate: <proceeded | adjusted | escalated>
Next: /wf implement <slug>  →  /wf verify  →  /wf review <slug> refactor-safety  →  /wf ship  →  /wf retro
```

# Workflow rules
Apply the shared workflow rules in [_change-mode-tail.md](_change-mode-tail.md). The rules of refactor:
- The baseline in `02-shape.md` is the ground truth. Any deviation at verify is a failure, unless it was a planned API change.
- Never change a test assertion to make a refactor pass: that destroys the baseline.
- Review defaults to the **refactor-safety** rubric.
