---
description: Runtime-truth verification of built work. Probe drives a running artifact through its acceptance criteria (or a free-form target), captures the observable output, reads it, compares it with the AC text, and writes the findings as a compressed slice. Target mode compares with the AC text. `sweep` drives the whole user surface and compares it with the AC, the charter constraints and the shared defect classes; it runs with or without a slug. Probe is the runtime sibling of rca, which diagnoses statically. Probe writes no fix.
argument-hint: <slug> [target|sweep] | sweep [path]
---

You are running `/wf probe`. You drive the running artifact, capture evidence, compare it with what the workflow promised, and report the findings. With a slug you write one compressed slice, `03-slice-probe-<descriptor>.md`, on that workflow. A slug-less sweep writes `.ai/surface-sweep-<utc-date>.md`. You fix nothing.

## Requires

Read every row that applies before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `03-slice.md` | artifact | if-present | |
| `01-<mode>.md` | artifact | if-present | |
| `03-slice-*.md` | artifact | mode:no-target | |
| `probe/_artifact.md` | procedure | always | |
| `probe/_target-resolution.md` | procedure | mode:target | |
| `_compressed-slice.md` | procedure | always | |
| `_source-modes.md` | procedure | always | |
| `_surface-defects.md` | procedure | always | |
| `runtime-adapters.md` | procedure | always | |
| `runtime-adapters/_ladder.md` | procedure | always | |
| `runtime-adapters/_protocols.md` | procedure | always | |
| `03-slice-probe-*.md` | writes | | |

`no-target` applies when the call has no target string (the slug-wide probe). `target` applies when it has one.

# The rules of probe

- You observe and report; later commands fix. Do not edit source files, propose a patch, or run a command that changes state beyond what the bootstrap section of an adapter authorizes. Starting a dev server, booting an emulator, and a build and install are authorized.
- You may drive the running artifact: clicks, taps, HTTP requests, CLI calls.
- A "Suggested fix shape" in the slice body is a direction, not a plan: 1 to 3 lines that name the area and the approach.
- With a slug, write one artifact in the workflow that exists. [_compressed-slice.md](_compressed-slice.md) gives the slice frontmatter and the index bookkeeping. Write the draft `<wf-dir>/.draft/03-slice-probe-<descriptor>.md` (with the suffix `-2`, `-3` on a collision), then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` per [_records.md](_records.md).
- Create no new workflow, no new branch, no `01-probe.md` and no new top-level `00-index.md`. The slug already owns them.
- Order: finish the branch-posture check (Step 1) before the bootstrap, and the bootstrap (Step 4) before you drive. Write the probe slice before Step 7 changes `00-index.md`.

# Arguments

The first token is the slug, or the word `sweep`.

| First token | Run |
|---|---|
| `sweep` | A slug-less sweep, `/wf probe sweep [path]`. It needs no workflow. It writes the project-level `.ai/surface-sweep-<utc-date>.md` (the same shape as `.ai/ship-plan-audit.md`), changes no `00-index.md`, and does no workflow bookkeeping. |
| a slug | A probe of that workflow, with the forms below. |

What follows the slug:

| Form | Meaning |
|---|---|
| (empty) | A slug-wide probe: every AC of every slice of the slug. |
| `sweep` | Sweep mode: enumerate the whole user surface and compare it with the AC, the charter constraints and the defect classes. It is not a target string. |
| any other text | A focused probe on that target string (Step 2). |

`sweep` is reserved in both positions. Every other string is a target. Probe takes no flags. It always records the incidental defects it sees on the way, and it drives every adapter that the repo matches, intersected with the confirmed stack.

# Step 0 — Orient

In a slug-less sweep, skip items 1–3 and Step 1, and start at item 4.

1. Read `00-index.md` with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`. Take `branch`, `selected-slice`, `current-stage`, `status`, `workflow-files`, `runtime-evidence-deferrals` and `compressed-slices` (each when present), and two blocks:
   - `charter:`: the constraints that the person ratified. They hold across slices, so a probe that reads only the AC misses part of the contract. Step 5 compares with them.
   - `stack:`: written by `/wf intake` Step 0.5 and confirmed in its Batch B. When it has `user-confirmed: true`, it narrows the adapters of Step 3 and the tools you use to drive and observe.
2. Read `03-slice.md`, or the lead `01-<mode>.md`, each with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> <name>`. Note every slice slug, and the source mode of `workflow-type` per [_source-modes.md](_source-modes.md).
3. Take the AC from each per-slice record that the slice index names, with `record get`. The acceptance-source column of [_source-modes.md](_source-modes.md) says where the AC lives. A terminal analysis slug (`workflow-type` `rca`, `discover`, `investigate` or `ideate`) has no `03-slice.md`; do not fail on that. Its probe target is the free-form target string that its escalation ladder routes here with. The comparison basis is that question plus the claim of the lead artifact, and the finding lands as the usual compressed slice on that slug. `investigate` and `ideate` have no build to probe; only their targeted question runs.
4. Use the adapter registry `runtime-adapters.md`, the ladder and the protocols. Read `runtime-adapters/<key>.md` for each adapter that Step 3 matches.
5. Stack awareness. A missing `stack:` does not stop probe, but you state where the stack came from. Apply the probe column of the table in [runtime-adapters.md](runtime-adapters.md) → Stack gate. Always record the `stack:` block under `## Stack context` in the slice body, so a reader can compare what probe saw with what intake confirmed.
6. Take the target from `$ARGUMENTS` by the argument tables above: the target string, or `slug-wide` when there is none.
7. Run the clearing-event tripwire. For each open deferral (`cleared-by: null`) that carries a `clearing-probe`, run that one recorded command with a short timeout; it has no side effects. A hit means that the event the deferral waits for has already happened: say so first, and give that deferral priority in this run. Do not make up a substitute command, and do not edit `00-index.md` here (Step 7 owns the clearing). A miss is ordinary state, not a finding. An entry with no recorded probe is not watched; note it under `## Tripwires` so that the next verify can add one.
8. Use `_surface-defects.md`. It gives the defect classes, the severity rules and the decidability boundary. It is required in `sweep` mode. In target mode it is advisory: its classes are what Step 5 records incidental defects against.
9. Declare decidability before you drive. This is required in `sweep` mode. From the standing not-observable set of `_surface-defects.md`, state which classes of correctness this artifact makes observable, which it does not, and where each unobservable class routes. Record it as the `decidability:` frontmatter block. When the primary correctness class of the artifact is not observable (a ranking or generative system, a long-horizon pipeline), say so first, at the top of the artifact and of the chat return, before any finding. A clean report on the wrapper must not read as a verdict on what the wrapper wraps.

# Step 1 — Branch posture

Do this before the bootstrap.

1. Run `git branch --show-current`. Call the result `current-branch`.
2. Compare it with `branch` of `00-index.md`. Call that `slug-branch`.
3. When they are the same, go to Step 2.
4. When they differ, ask this gate question per [_gate-question.md](_gate-question.md):

```yaml
question: "Working tree is on `<current-branch>`, but workflow `<slug>` is on `<slug-branch>`. How should probe proceed?"
header: "Branch posture"
options:
  - { label: "Switch to <slug-branch>",                  description: "Run `git switch <slug-branch>`. Refuses if uncommitted changes would be lost." }
  - { label: "Run on <current-branch>, record in artifact (Recommended when you know why you're here)", description: "Probe runs against whatever is checked out. Slice records `probed-on-branch: <current-branch>` so a future reader knows the artifact under test was not the slug's." }
  - { label: "Abort",                                    description: "Stop the probe. No artifact written. User decides whether to switch branches or invoke probe later." }
multiSelect: false
```

| Answer | Do |
|---|---|
| Switch | Run `git switch <slug-branch>`. When git refuses because of uncommitted changes, show the error and stop. Do not stash and do not force the switch. |
| Run and record | Go to Step 2, and keep `probed-on-branch: <current-branch>` for the frontmatter. |
| Abort | Write no artifact. Emit: `wf probe aborted: branch mismatch (<slug> on <slug-branch>, working tree on <current-branch>).` |

# Step 2 — Target resolution

| Run | Do |
|---|---|
| `sweep` | Skip this step: a sweep has no target to resolve. Set `target-resolution: {sweep: true}` and go to Step 3. The comparison basis is the AC, the charter and the defect classes (Step 5). A slug-less sweep has no AC and no charter, so its `comparison-basis` is `[taxonomy]`, and the artifact says so. |
| `slug-wide` | Layer 1 expands to every AC of every slice file. The other three layers do not apply. |
| a target string `T` | Load [probe/_target-resolution.md](probe/_target-resolution.md) and run all four layers: Layer 1, the AC text match (a content-word overlap of 50% or more → `target-resolution.matched-ac`); Layer 2, the slice match (→ `matched-slices`); Layer 3, the surface inference (route, screen, command and endpoint hints → `inferred-surfaces`); Layer 4, the ad-hoc criterion (`ad-hoc: true`, and `T` itself is the comparison text). An ad-hoc target is data, not a failure. |

# Step 3 — Adapter selection

1. Select the adapters per [runtime-adapters.md](runtime-adapters.md) → Adapter selection. It owns the intersection, the divergence, the empty fallback, the no-match stop and the probe fields.
2. In `sweep` mode, after the bootstrap, enumerate the surface by the surface enumeration ladder of [runtime-adapters/_protocols.md](runtime-adapters/_protocols.md). Record the rung you reached as `surface-coverage.enumeration-method`.

# Step 4 — Two-phase bootstrap

For each adapter in `adapters-used`, run the `Bootstrap` section of `runtime-adapters/<key>.md`.

Phase 1, active resolution. Run each bootstrap step in order, and give it its documented timeout. When a step fails, read the `Resolution attempts before failing` line of the adapter (when it has one), try the documented resolution, and run the step once more. When it still fails, enter phase 2 for that adapter.

Phase 2, a graceful failure. When the bootstrap of an adapter fails after the resolution attempts:

1. Capture the failure: `step` (the bootstrap step that failed), `exit-code` (of the failing command, or `null` for a timeout), `output-tail` (the last 20 lines of stderr and stdout of that step), and `remediation` (the one-line hint of the `Remediation hints` section of the adapter that matches the `step`).
2. When the only adapter, or every adapter, failed: write the probe slice with `status: awaiting-environment` and the full `bootstrap-failure` block, from the awaiting-environment template of [probe/_artifact.md](probe/_artifact.md). Skip Step 5. A run after the person fixes the environment tries the bootstrap again.
3. When some adapters failed and others booted: record the failures under `partial-bootstrap-failures`, and go on to Step 5 with the booted adapters. The slice carries both the findings and the partial failures.

# Step 5 — Drive and observe

For each adapter in `adapters-used` whose bootstrap completed:

1. For each entry of `target-resolution` (or every AC, when the target is `slug-wide`):
   1. Follow the `Drive` section of the adapter to do the user actions that the target or the AC implies.
   2. Follow its `Observe` section to capture the observable output: a screenshot, stdout, a response body, log lines.
   3. Write the evidence to `<wf-dir>/probe-evidence/<descriptor>/<target-or-ac-slug>.<ext>`, per the `Evidence layout` of the adapter.
   4. Read the evidence (look at a visual, parse a text) and compare it with the text of the target or the AC.
   5. Record `{target-or-ac, adapter, evidence-path, observation, result: pass | fail | partial}`.
2. The comparison basis. Compare every observation, in this order, with:
   1. the matched AC text (target mode), or every AC of the slug (`sweep`);
   2. every charter constraint whose subject the observation touches. A violation is a finding at the weight of the constraint, whether or not an AC covers it. Record the constraint id, for example `C4`, on the finding;
   3. every defect class of `_surface-defects.md`: ask the detection question of the class of each enumerated surface. This is required in `sweep` mode and advisory in target mode.

   Record the bases that ran as `comparison-basis: [ac, charter, taxonomy]`.
3. Perturb. This is required in `sweep` mode where it is authorized. After you observe the happy path, follow the `Perturb` section of the adapter and the shared perturbation protocol: break exactly one dependency, observe again, restore it. Do not perturb a shared or production backend without explicit authorization; record what you skipped and why.
4. Observe again before you record. A finding above `low` whose evidence is one observation of an interactive surface needs a second observation from a clean state (a fresh launch, dismissed system UI, a known route) before you record it. When the two differ, downgrade or drop the finding, and record the difference under `retracted-findings:`. Two tools that agree do not count: both observe the same corrupted state. See `env-interference` in `_surface-defects.md`.
5. Incidental defects. Record each defect you notice on the way (console errors, crashes, HTTP 500s) under `## Findings` with `severity: incidental`. They count toward `findings-count`.
6. Tear down. Run the `Tear down` section of each adapter. It is idempotent: a re-run must not leave the environment dirtier each time.

# Step 6 — Write the probe slice

Write the draft `<wf-dir>/.draft/03-slice-probe-<descriptor>.md` from the frontmatter and body templates of [probe/_artifact.md](probe/_artifact.md), and put it.

The descriptor:

| Target | `<descriptor>` |
|---|---|
| one short string (5 words or fewer after slugification) | the slugified target |
| `slug-wide` | `slug-wide-<utc-date>`, for example `slug-wide-2026-05-16` |

On a collision, append `-2`, `-3`, … until the name is unique. `node "<skill-dir>/scripts/wf.mjs" record list "<root>" <slug>` names the records that exist.

A slug-less sweep writes `.ai/surface-sweep-<utc-date>.md` from the sweep template of the same file.

# Step 7 — Clear deferrals

This step runs when `runtime-evidence-deferrals` of the index has entries with `cleared-by: null` whose `slice` is in `target-resolution.matched-slices`, or is the `slice` of an entry of `matched-ac`, or is any slice when the run is slug-wide or a sweep of the slug. For each such deferral:

1. Check the direction first. When the deferred AC is a prove-fail-closed criterion (a gate, guard or health check that catches a failure; the direction rule of shape), the evidence must show the failure branch firing: an induced fault caught, a bad input rejected. A green happy-path observation does not clear it. On a direction mismatch, leave `cleared-by: null`, and record under `## Tripwires` what evidence would qualify (the fault to inject).
2. Before you leave a deferral uncleared, climb the env-remediation rung of `runtime-adapters/_ladder.md`: rebind a service that the harness owns to a free port and record it (never leave a deferral standing over a port that the run itself binds), boot the documented headless mode, start an existing AVD, run a provisioning script that the repo ships. Keep to its denylist: do not kill a process that the run did not start, change the host configuration, or patch product code.
3. Run the ownership triage again on every wall that remains. A deferral that an earlier run recorded as `external` is a claim, not a fact. When the wall is `code-owned` (a port, host, endpoint or fixture that the repo itself hard-codes pins it), say so under `## Tripwires`, and name the change that would remove it.
4. When the probe evidence satisfies the deferred user-observable AC, set `cleared-by: probe-<descriptor>` on the entry: run `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> index "runtime-evidence-deferrals[<n>].cleared-by=probe-<descriptor>"`. `<n>` is the position of the entry, from 0, in `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index --fields runtime-evidence-deferrals`.
5. When it does not, leave `cleared-by: null`, and report it under `## Tripwires` of the slice, with the current `wall-ownership` verdict of the wall. When the recorded `clearing-event` turned out to be a passive wait ("once the port frees"), name the event that can be provisioned to replace it.
6. Leave a `clearing-probe` on every deferral that remains: a one-line command without side effects that answers "has the clearing event happened yet?" (the `clearing-probe` field of verify). Record the check you would run next time.

This is the one change that probe makes to `00-index.md` beyond the usual bookkeeping. It is additive: clearing a deferral changes its status and does not remove the entry.

# Step 8 — Index bookkeeping

Do the index update and the slice-index update of [_compressed-slice.md](_compressed-slice.md), with `<slice-slug>` = `probe-<descriptor>` and `<op>` = `probe`. The script updates the row of `INDEX.md`.

Do not change `current-stage`, `selected-slice`, `status`, `branch` or `progress` of `00-index.md`. A probe slice is additive and does not advance the main lifecycle.

# Step 9 — Hand off

Lead with the narrative per [_chat-return.md](_chat-return.md) (section *The narrative*). Then give this summary:

```
wf probe complete: <slug>
Target: <probe-target>
Adapters: <adapters-used>
Coverage: <driven>/<enumerated> surfaces (<enumeration-method>) — unreached: <none | list>
Findings: <findings-count> (critical: <N>, high: <N>, medium: <N>, low: <N>)
Tripwires: <none | comma-separated list>
Deferrals cleared: <N>
Recommended next: <next-invocation> — <reason of the default route>
Probe slice: 03-slice-probe-<descriptor>.md
```

| Case | Change to the return |
|---|---|
| `sweep` mode | Lead with the coverage claim, not the finding count. When `enumeration-method: traversal`, say that the denominator is a floor. |
| A primary correctness class is not observable (Step 0 item 9) | Say so before the coverage claim and the findings. |
| A slug-less sweep | Replace the probe-slice line with `.ai/surface-sweep-<utc-date>.md`, and recommend `/wf intake fix <description>` or `/wf intake rca <description>`. A slug-less sweep creates no slug of its own. |
| `status: awaiting-environment` | Replace the summary with `wf probe blocked: <slug>`, then `Bootstrap failed at: <adapter>/<step>`, `Remediation: <hint>`, the name of the probe slice, and `Re-run after applying the remediation.` |

# Where probe sits

- The probe slice is the input of `/wf plan <slug> probe-<descriptor>`, as an `rca` slice is. The Routes table of the template picks the route.
- Probe clears deferrals: Step 7 sets `cleared-by` when the evidence matches the deferred AC. A verify run in a capable environment can clear one too.
- It is not a static analyzer: that is `rca`, its sibling on the other axis.
- It is not a forward-path gate: that is sub-agent 3 of `/wf verify`, which drives the interactive checks. Probe is the way back in for a slug whose work is done.
