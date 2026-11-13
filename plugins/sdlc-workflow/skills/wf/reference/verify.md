---
description: Verify that the selected slice meets its acceptance criteria and is ready for review. Runs the checks of the plan, gates each user-observable criterion on runtime evidence, fixes what fails in one round, and writes the verify record.
argument-hint: <slug> [slice]
---

You are running `/wf verify`, stage 6 of 9: 1·intake → 2·design → 3·slice → 4·plan → 5·implement → `6·verify` → 7·review → 8·ship → 9·retro. You check one slice against every acceptance criterion and every check of its plan, gate each user-observable criterion on runtime evidence, fix what fails in one round, and write the verify record of the slice.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | `06-verify-<slice-slug>.md` and the raw check output in `verify-evidence/<slice-slug>/checks.md`; updates the `06-verify.md` master |
| Charters | Sub-agents 1, 2, 5: [verify/_sub-agents.md](verify/_sub-agents.md); 3: [verify/_runtime-evidence.md](verify/_runtime-evidence.md); 4: [verify/_augmentation.md](verify/_augmentation.md) |
| Deferrals | [verify/_deferrals.md](verify/_deferrals.md): the `interactive-verification: deferred` escape hatch and the index ledger |
| Schemas | [verify/_artifact.md](verify/_artifact.md): frontmatter and body sections of both verify files |
| Next | `/wf review <slug> <selected-slice>` when `result: pass` and `convergence:` is `not-needed` or `converged`. When `convergence: escalated`, re-invoke `/wf verify <slug> <selected-slice>` for a second round or escalate to `/wf implement <slug> <selected-slice>`. |

## Card

- Check every acceptance criterion and every check of the plan. Do not fix code while the checks run.
- Before you rule on a criterion that turns on how a dependency behaves, read its installed source with the `study-sources` skill, per [_source-study.md](_source-study.md).
- Fix only in the fix round of Step 7.6, after the checks and the AC gate of Step 7.5. Fix a `lint`, `format` or `marker-syntax` issue without a question. Ask a gate question for each other failure, per [_gate-question.md](_gate-question.md): `Fix`, `Skip` or `Escalate`. Send each `Fix` to a write-isolated fix sub-agent, and record each fix in `## Verify-Owned Fixes`. When you have no tool that starts a sub-agent (for example, you are a stage agent of a driver), make each `Fix` yourself, one after another, per "No sub-agent tool" in Step 7.6. A missing sub-agent tool is never a reason to stop or to escalate.
- Run one fix round only. When an issue still fails after it, write `convergence: escalated` and route to `/wf verify` again or to `/wf implement`.
- Defer an acceptance criterion only over a probed incapability, per [verify/_deferrals.md](verify/_deferrals.md). A new deferral holds the probe command of this run and its output. An open deferral that `wf.mjs defer check` reports `unchanged` is not probed again. One that it reports `probe-error` has a probe that could not run on this machine: write a probe that runs in any shell ([verify/_deferrals.md](verify/_deferrals.md)), then check again.
- A behaviour that you drove and saw wrong is `result: fail`. It is never a deferral.
- Before you fix or report a failing item, run `wf.mjs decide list` for the slice. When a live decision of the person, a standing answer or a delegate decision already settles the item (for example "record the miss, the speed work moves to a later packet"), accept the item. Write `accepted-by: <that decision's id>`, `accepted-at` and `accepted-items` in the frontmatter. Do not fix it, do not stop on it, and do not ask about it.
- When no code changed after the commit of the implement test receipt, reuse its results. Otherwise run only the fast and affected suites.
- A `full` or `heavy` command, or a command longer than the longest check of your brief, is a long run. A long run is never a slice step (`_long-runs.md` L5): record it under `## Packet Checks`. Do this also when an acceptance criterion needs it or names a push hook. The review runs it once for the packet.
- Reuse the runtime evidence of a check when no file that the check depends on changed since its evidence commit, per [verify/_runtime-evidence.md](verify/_runtime-evidence.md). Drive the runtime only for the other checks.
- When `verified-head` of the last verify record of this slice equals HEAD and the plan of the slice did not change, keep the last clean result. Run no check again. When the result is clean, write `verified-head` with the HEAD sha.
- Use an emulator or a simulator. Do not drive a physical device that `devices.test` of `.ai/sdlc-config.json` does not name.
- Set the terminal state honestly: `convergence` and `result`.
- Done when `06-verify-<slice>.md` records the result of every acceptance criterion.
- To change one section or one line of a record, run `wf.mjs record edit "<root>" <slug> <name> --section <heading> --from <file>` or `... --replace "<old>" --with "<new>"`. To change much of the body, run `wf.mjs record draft "<root>" <slug> <name>`, edit the draft that it names, then run `wf.mjs record put "<root>" <slug>`.
- To change several records or several list items, write a script for `wf.mjs run`, per [_api.md](_api.md).

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

Mode `user-observable`: the slice has a user-observable AC (the Step 7.5 partition). Mode `deferral`: `00-index.md` has an open `runtime-evidence-deferrals` entry for any slice, or Step 7.5 takes the deferral path. Mode `augment`: `02c-craft.md` exists, or `augmentations:` is not empty.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | Acceptance Criteria; Non-Functional Requirements; Edge Cases / Failure Modes; Out of Scope |
| `decisions.yaml` | artifact | if-present | |
| `03-slice-<slice>.md` | artifact | always | |
| `04-plan-<slice>.md` | artifact | always | |
| `05-implement-<slice>.md` | artifact | always | |
| `01-<mode>.md` | artifact | mode:change | |
| `04-plan.md` | artifact | mode:change | |
| `05-implement.md` | artifact | mode:change | |
| `01-rca.md` | artifact | mode:rca | |
| `02b-design.md` | artifact | if-present | |
| `02c-craft.md` | artifact | if-present | |
| `04b-instrument.md` | artifact | if-present | |
| `04c-experiment.md` | artifact | if-present | |
| `05c-benchmark.md` | artifact | if-present | |
| `verify/_artifact.md` | procedure | always | |
| `verify/_sub-agents.md` | procedure | always | |
| `verify/_augmentation.md` | procedure | mode:augment | |
| `verify/_deferrals.md` | procedure | mode:deferral | |
| `_fix-loop.md` | procedure | always | |
| `_fix-prompt.md` | procedure | always | |
| `_source-modes.md` | procedure | always | |
| `runtime-adapters.md` | procedure | mode:user-observable | |
| `runtime-adapters/_ladder.md` | procedure | mode:user-observable | |
| `verify/_runtime-evidence.md` | procedure | mode:user-observable | |
| `06-verify-<slice>.md` | writes | | |

Change-mode and single-scope workflows use the un-suffixed names, for example `06-verify.md`. In `mode:rca`, `02-shape.md` is the synthesized forwarding contract.

# Role

You run the verify stage of one slice: check it, then fix it in one round; you do not review or ship.

# Workflow rules

Apply [_workflow-rules.md](_workflow-rules.md), and these two rules of verify:

- **Evidence versioning on a re-run.** Move the previous evidence directory to `<wf-dir>/verify-evidence/<slice-slug>-run-<N>/`, where `N` is the previous `evidence-run-count`, and write `evidence-run-count: N + 1`. Do not overwrite the old evidence.
- **A re-verify writes back, so the index never contradicts a slice.** When a re-run changes the outcome of a slice, run `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> 06-verify-<slice-slug>.md result=<result>`, then derive the rollup of the master `06-verify.md` again. Change the slice record first, then the index; never the index alone.

# Step 0 — Orient

Do this before every other step.

1. **Resolve the slug** from `$ARGUMENTS`: the first argument is the slug (the dispatcher refuses a call without one), and a second argument is the slice selector.
2. **Read `00-index.md`** with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`: `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Resolve the slice-slug**: the selector that was passed, else `selected-slice` of the index, else ask the person.
4. **Find the source mode.** Apply the row of `workflow-type` in [_source-modes.md](_source-modes.md): the lead record, the acceptance source, the record names and the verify action. When the action is stop, give its route and stop.
5. **Check the prerequisites.** The implement record of the mode must exist: `record get` of it exits 0.
   - When the implement record shows `Status: Awaiting input`, stop.
   - When `06-verify-<slice-slug>.md` (or `06-verify.md` in compressed mode) already exists, say in chat that this is a re-run, and go on. [_additive-write.md](_additive-write.md) snapshots the earlier revision and appends the `revisions:` ledger.
   - **Stack gate.** Apply the verify column of the table in [runtime-adapters.md](runtime-adapters.md) → Stack gate.
   - **Constraint-resolution gate.** Do not inherit an unresolved environment wall. Read `## Verification Strategy` in the plan record. Each user-observable AC whose strategy names an environment dependency (credentials, a device, an external service, an inbound callback, a deploy target, missing infrastructure) carries a `constraint-resolution:` line written at plan time: `prerequisite-slice: <slug>`, `proxy+deferral: <named clearing event>` or `po-accepted: <reason>`. When none of the three is there, record the criterion under `constraint-resolution-missing:` in the verify frontmatter, and treat it as `blocked-runtime-evidence-missing` at Step 7.5. The deferral hatch is not open for it: route to Option E (`/wf plan`), not Option F.
6. **Use the augmentation context.** Each item of `## Mock fidelity inventory` in `02c-craft.md` is one more AC: check it against `## Visual Contract Honored` of `05-implement-<slice-slug>.md`. Each `augmentations:` entry of `00-index.md` names an artifact (for example `07-design-audit.md` or `07-design-critique.md`). The table of sub-agent 4 in [verify/_augmentation.md](verify/_augmentation.md) holds the re-check of each type.
7. **Carry forward** `open-questions` from the index.
8. **Branch check.** Read `branch-strategy` and `branch` from `00-index.md`. When `branch-strategy: dedicated`, confirm the branch with `git branch --show-current`, and switch when needed.

# Steps 1–10 — Check, fix and record

Do the steps in this order. Step 7 runs after Steps 7.5 and 7.6, because the routes read their `result` and `convergence`.

1. Confirm the selected slice.
2. Find the verification commands of the repo.
3. Track the units of the stage in a work-tracking checklist: one item per check (lint, typecheck, tests, build, …), one per acceptance criterion of `03-slice-<slice-slug>.md`, and one for the artifact write. Keep each status true as the results come in.
4. Run the checks: lint, typecheck, tests, build, smoke tests, manual checks. Use parallel sub-agents when the checks span several concerns (Step 4 below). Record a failed check as `FAILED: <output summary>` on its item. Do not fix it yet: the fix round runs once, in Step 7.6.
5. Verify each acceptance criterion of `03-slice-<slice-slug>.md` and `02-shape.md` (in another mode, the source of Step 0.4). Record an unmet criterion as `NOT MET: <reason>` on its item.
6. When a gap comes from the behaviour of an external dependency or from drift of a standard, run a freshness pass, and record it.
7.5. Apply the user-observable AC gate (Step 7.5 below).
7.6. Run the single-round fix loop (Step 7.6 below).
7. Evaluate the routes ("Adaptive routing"), and write each viable option into `recommended-routes` of the frontmatter.
8. Write the draft of `06-verify-<slice-slug>.md` per [verify/_artifact.md](verify/_artifact.md), and run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` per [_records.md](_records.md).
9. Write the draft of `06-verify.md`, the master index that links each verify record of a slice, and put it. To change one row or one field of it, use `record edit` or `record set`. Skip this step when the workflow uses the un-suffixed names: its one record is the stage record.
10. Record the end of the stage with `node "<skill-dir>/scripts/wf.mjs" record stage-done "<root>" <slug> verify <selected-slice>`. It writes `current-stage`, `progress.verify`, `next-command` and `next-invocation` (the default route, `/wf review <slug> <selected-slice>`), and adds the new records to `workflow-files`. When the Next row of this stage names another route, add `--next "<invocation>"`. Set any other index field with `record set "<root>" <slug> index key=value ...`. `record stage-done` sets the roster status.

# Step 4 — Parallel verification

When the verification spans several concerns, launch parallel sub-agents per [_subagents.md](_subagents.md). Each independent group of acceptance criteria goes to its own child. A child may build, boot and drive; it never edits source, and it returns evidence. You compose the verify artifact and the verdict. When one test command covers everything, start no sub-agent.

| Sub-agent | Runs | Charter |
|---|---|---|
| 1, Static Analysis & Build | every slice | Lint, types, build, the performance gate, security scanning, the hygiene of `sdlc-debt:` markers. |
| 2, Test Execution | every slice | Unit tests, integration tests, coverage, the mapping of skipped gating specs (`skipped-gating-specs`), the cross-slice regression record. |
| 3, Interactive & Runtime-Truth Verification | when any AC is user-observable | Drives each such AC on the runtime adapters and the constraint-resolution ladder. Records `evidence-rung`, `mock-provenance:`, `fixture-fidelity:`, the first-light status, and incidental defects of `_surface-defects.md`. |
| 4, Augmentation Re-verification | `mode:augment` | Gets the paths of the screen pages and of the approval pictures, never a canvas URL. |
| 5, Freshness | when a test failed, the plan is older than 14 days, or the slice touches an external API or schema | Dependency drift, AC staleness, standards drift. |

Merge the results. For each check, record the command and its pass or fail in the artifact. Write the raw output (test runner output, probe logs, scan output) to `verify-evidence/<slice-slug>/checks.md`. Do not fix an issue here: the fix loop runs in Step 7.6, after the AC gate sorts the issues.

# Step 7.5 — The user-observable AC gate

Each user-observable AC needs runtime evidence. With no evidence, it does not pass.

1. **Partition.** Read each AC of `03-slice-<slice-slug>.md` (or the compressed-mode source of Step 0.4).
   - An explicit `observable: true | false` annotation (an inline tag or an `<!-- observable: … -->` comment) is final.
   - With no annotation, the AC is user-observable when it names a visible surface (screen, page, route, view, panel, dialog, command output), a user action (click, tap, type, submit, run, invoke, navigate), or an observable post-condition (renders, appears, displays, returns, prints, succeeds, redirects). An AC that names none of the three is `code-only`.
   - Record `kind: code-only | user-observable` for each AC under `## Acceptance Criteria Status`.
2. **Match.** For each `user-observable` AC, find its `interactive-verification-results` entry of sub-agent 3 by AC id or by overlap of the quoted text. An entry reused with `source: evidence <commit>`, because no file that the check depends on changed since that commit ([verify/_runtime-evidence.md](verify/_runtime-evidence.md), "Reuse runtime evidence unless its inputs changed"), counts as matched.

   | Match | The AC is | And |
   |---|---|---|
   | pass | met | |
   | fail | not met | `## Issues Found` lists the failure. |
   | partial | partially met | List the gap. |
   | none | without runtime evidence | The gate refuses `result: pass` for the slice. |

3. **Write the result.**

   | When | `result` |
   |---|---|
   | Every AC is met: code-only through the test suites, user-observable through interactive evidence | `pass` |
   | A user-observable AC has no matching evidence and no deferral annotation; or a designated gating spec was skipped, with no other rung and no deferral | `blocked-runtime-evidence-missing` |
   | At least one AC fails or is partial, and each user-observable AC has runtime evidence | `fail` or `partial` |

   `blocked-runtime-evidence-missing` is procedural (the evidence was not produced), not substantive (the code is wrong). `fail` routes to `/wf implement`. `blocked-runtime-evidence-missing` routes to a capable environment or to a deferral.
4. **Runtime evidence and deferral.** When the slice has a user-observable AC, apply the gate rules of [verify/_runtime-evidence.md](verify/_runtime-evidence.md): mock, CI configuration, write-time enforcement, deferral.

# Step 7.6 — The verify-owned fix loop

This loop follows [_fix-loop.md](_fix-loop.md); this section sets its parameters for verify. It runs one round, gated by the person. A further round needs a new `/wf verify`.

**Inputs.** Each check recorded `FAILED:` (step 4), each AC recorded `NOT MET:` (step 5), each user-observable AC that the gate refused for missing runtime evidence (Step 7.5), and each augmentation re-check that failed (mock fidelity, signal coverage, experiment wiring, benchmark regression). Record the count as `metric-issues-found-initial`. When the count is zero, set `fix-rounds-run: 0` and `convergence: not-needed`, and skip the rest of this section.

**Triage.**

1. An issue of class `lint`, `format` or `marker-syntax` is mechanical. Triage it `Fix` yourself, without a question, and report what was fixed this way, with diffs, in the round summary.
2. Ask a gate question for each other issue, per [_gate-question.md](_gate-question.md): an unclassified, scope-changing or behaviour-changing issue always asks. Batch up to 4 issues per gate round.
   - Header: an id of the issue (`LINT-1`, `AC-3`, `RUNTIME-MISSING-2`, `BENCH-REG`).
   - Question: `"{issue type}: {one-line summary} at {file:line or check name}"`.
   - Options: `Fix` ("Fix this now: spawn a sub-agent to apply the minimal patch in this run"), `Skip` ("Leave as-is for now; it surfaces in the verify artifact under Issues Found"), `Escalate` ("Out of scope for verify; route to `/wf implement` or back to plan").
3. Outside the mechanical class, verify never fixes without a question. When the person picks `Skip` for everything, the loop ends with `convergence: not-needed`, and the failures stay recorded.

**Dispatch.** Dispatch one fix sub-agent for every issue triaged `Fix`, all in parallel, in one wave. For each issue:

1. Dispatch one sub-agent at medium effort with write isolation, per [_subagents.md](_subagents.md). Both settings are required ([_fix-loop.md](_fix-loop.md) rule 3). Send the prompt of [_fix-prompt.md](_fix-prompt.md) with its `[verify]` lines, and with its `[code bug]` lines for a code bug.
2. When the sub-agent returns, read the files it changed, and check the patch against both the issue and the method of the suggested fix ([_fix-loop.md](_fix-loop.md) rule 5). Under a worktree host, read them from the child's branch (`git checkout <branch> -- <files>`), and do not merge the branch until the check passes. Under a partition host (no worktree flag), the edit is already in the working tree, so the check reviews the diff before you accept it.
3. Do not merge a `Method: deviated` return on the sub-agent's own word. Read the patch again against what was suggested, and decide on purpose. Discard a deviation that touches an explicit prohibition.
4. Accept a correct patch: merge the branch under a worktree host, or leave the edit in the working tree under a partition host. When two patches change the same lines, merge one, then dispatch the other again against the merged state; only that pair runs one after the other.
5. Discard a wrong patch (`git checkout -- <files>` under a partition host), and record `COULD NOT FIX: <reason>`. That issue counts toward `convergence: escalated`.

**No sub-agent tool.** When you have no tool that starts a sub-agent, you are the fix agent. Do not stop, and do not escalate because of the missing tool. Take the issues triaged `Fix` one after another, never in parallel. For each one:
1. Fill the prompt of [_fix-prompt.md](_fix-prompt.md) for the issue, as you would for a sub-agent, and follow it yourself: the minimal patch for this one issue, the method of the suggested fix, and its check command run to an exit status.
2. Check your own patch against the issue and the method, per [_fix-loop.md](_fix-loop.md) rule 5. A patch that fails its check command, or that deviates from an explicit prohibition, is reverted with `git checkout -- <files>` and recorded `COULD NOT FIX: <reason>`. Do not improve it with a second patch.
3. Write `Method: as-prescribed | deviated` on the issue's row of `## Verify-Owned Fixes`.
Then run the re-check, the convergence and the commit below as usual. Put the files of each landed fix in the commit by path.

**Re-check.** Run again only the checks whose failures were triaged `Fix`: the failing lint; the test file, or the smallest suite that covers it; the AC, evaluated again against the patched code (for a user-observable AC, with its interactive adapter); the adapter capture for an AC that missed evidence. Do not run an unrelated check, or the check of a `Skip` or `Escalate` issue. Compute `metric-issues-found-final` over the state after the fixes.

**Convergence.**

| When | `convergence` | `result` |
|---|---|---|
| `metric-issues-found-initial == 0` | `not-needed` | The verdict of the gate, unchanged. |
| `metric-issues-found-final == 0`, and no `Escalate` decision | `converged` | `pass`, unless a deferral keeps it at `partial`. |
| `metric-issues-found-final > 0`, or any `Escalate` decision | `escalated` | The verdict of the gate over the state after the fixes: `fail`, `partial` or `blocked-runtime-evidence-missing`. |

When the loop escalates, the routes offer Option B and Option C, and the loop never runs again by itself. `## Issues Found` lists each issue that is still broken, with its triage decision: `Skip`, `Escalate`, or a `Fix` that the sub-agent could not resolve.

**Commit.**

1. When at least one `Fix` sub-agent changed files and every re-check of the `Fix` issues passed, commit by the shared commit rule ([_fix-loop.md](_fix-loop.md) rule 7), with the message `<type>: <what the fix does>` ([implement/_steps.md](implement/_steps.md)). Record the SHA in `## Verify-Owned Fixes` of the artifact.
2. While any re-check of a `Fix` issue still fails, do not commit. Record `convergence: escalated`, leave the working tree as it is, and route to a new `/wf verify`. A partial fix never enters the git history.
3. Record `regression-tests-added: <N>` in the frontmatter. A code-bug fix with neither a test path nor a reason for its exemption is a MED finding (`fix landed without its regression test`). A lint, format, config, tooling or docs fix is exempt (`n-a`).

# Adaptive routing

The routes follow `convergence:` and the `result:` after the fix loop. Write each viable option as one `recommended-routes` entry, with its reason:

| Option | Route | When |
|---|---|---|
| A: Review | `/wf review <slug> <selected-slice>` | `convergence:` is `not-needed` or `converged`, and `result: pass`. Recommend a compaction first when the verify was long: its output is noise for the review. |
| B: Second verify round | `/wf verify <slug> <selected-slice>` | `convergence: escalated`, and the person wants another fix round. Name the unresolved issues first. |
| C: Manual implement (escape hatch) | `/wf implement <slug> <selected-slice>` | The remaining issues need a design rethink, or input that verify cannot supply. |
| E: Revisit plan | `/wf plan <slug> <selected-slice>` | The verification showed a wrong approach, not a wrong line of code. Option E outranks Option C. |
| F: Re-verify in a capable environment, or defer | re-run `/wf verify <slug> <selected-slice>`, or amend with `interactive-verification: deferred` per [verify/_deferrals.md](verify/_deferrals.md) | `result: blocked-runtime-evidence-missing`, and the fix loop could not produce the evidence. A deferral blocks the release of ship, but not review or the PR phase of ship. A deferral is lawful only over a probed incapability, and is not open for a criterion in `constraint-resolution-missing:` (those route to Option E). |
| G: Slug-wide runtime probe | `/wf probe <slug>` | The verify of each slice passed, and a runtime sweep over the whole slug is wanted (breakage of the integration across slices). |

# Chat return contract

Apply the early-stop guard of [_autonomy-guards.md](_autonomy-guards.md) before you end the turn. After you write the files, return per [_chat-return.md](_chat-return.md): lead with the narrative (its section *The narrative*), then give this receipt:

- `slug: <slug>`
- `wrote: <path>`
- `result: <pass | fail | partial | blocked-runtime-evidence-missing>`
- `convergence: <not-needed | converged | escalated>`, with the `fix-rounds-run` count and a one-line summary of what the loop did when `convergence` is not `not-needed`
- `options:` (each viable option of "Adaptive routing")
- at most 3 short blocker bullets, when needed

# Artifacts

Write the drafts of `06-verify.md` (the master index) and `06-verify-<slice-slug>.md` (the record of the slice), and put them, per the schemas of [verify/_artifact.md](verify/_artifact.md). That file also defines the meaning of `result:` and `interactive-verification:`, the rows of `## Acceptance Criteria Status` with their `evidence-rung`, and the `## Verify-Owned Fixes` table.
