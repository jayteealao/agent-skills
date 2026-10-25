---
description: Verify that the selected slice meets acceptance criteria and is ready for review.
argument-hint: <slug> [slice]
---

Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output this operation produces.

> **Standing steer.** Only when the decision store holds a live `steer` entry (`decide list --kind steer`, per [_decisions.md](_decisions.md)): apply it. Honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf verify`, **stage 6 of 9**: 1·intake → 2·design → 3·slice → 4·plan → 5·implement → `6·verify` → 7·review → 8·ship → 9·retro.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | `06-verify-<slice-slug>.md` and the raw check output in `verify-evidence/<slice-slug>/checks.md`; updates the `06-verify.md` master |
| Charters | Sub-agents 1, 2, 5: [verify/_sub-agents.md](verify/_sub-agents.md); 3: [verify/_runtime-evidence.md](verify/_runtime-evidence.md); 4: [verify/_augmentation.md](verify/_augmentation.md) |
| Deferrals | [verify/_deferrals.md](verify/_deferrals.md): the `interactive-verification: deferred` escape hatch and the index ledger |
| Schemas | [verify/_artifact.md](verify/_artifact.md): frontmatter and body sections of both verify files |
| Next | `/wf review <slug> <selected-slice>` when `result: pass` and `convergence:` is `not-needed` or `converged`. When `convergence: escalated`, re-invoke `/wf verify <slug> <selected-slice>` for a second round or escalate to `/wf implement <slug> <selected-slice>`. |
| Skip-to | `/wf ship <slug>` when review is unnecessary (solo project, trivial change, external peer review); valid only when `result: pass`. |

## Card

- Check every acceptance criterion and every check of the plan. Fix each fixable issue in one fix round, and record it in `## Verify-Owned Fixes`.
- Defer an acceptance criterion only over a probed incapability, per [verify/_deferrals.md](verify/_deferrals.md). A new deferral holds the probe command of this run and its output. An open deferral that `wf.mjs defer check` reports `unchanged` is not probed again.
- A behavior that you drove and saw wrong is `result: fail`. It is never a deferral.
- When no code changed after the commit of the implement test receipt, reuse its results. Otherwise run only the fast and affected suites.
- Use an emulator or a simulator. Never drive a physical device that `devices.test` of `.ai/sdlc-config.json` does not name.
- Set the terminal state honestly: `convergence` and `result`.
- Done when `06-verify-<slice>.md` records the result of every acceptance criterion.

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
| `runtime-adapters.md` | procedure | mode:user-observable | |
| `runtime-adapters/_ladder.md` | procedure | mode:user-observable | |
| `verify/_runtime-evidence.md` | procedure | mode:user-observable | |
| `06-verify-<slice>.md` | writes | | |

Change-mode and single-scope workflows use the un-suffixed names, for example `06-verify.md`. In `mode:rca`, `02-shape.md` is the synthesized forwarding contract.

**Verify against the real contract, not the remembered one.** When a criterion turns on how a dependency, framework, or SDK actually behaves, invoke the `study-sources` skill to read its installed source (`node_modules`, `~/.m2`, the Go/Rust/NuGet caches, Android SDK `sources/`) before ruling the criterion met or unmet. Match the version the project resolved. Reads land in gitignored `.scratch/` and never enter the verify evidence or the diff.

# Role

You are a **workflow orchestrator that owns its own triage→fix loop**.
- Run checks and compare results against acceptance criteria; do not improvise fixes while checks run, and do not review or ship (later stages).
- After all checks and the user-observable AC gate finish (Step 7.5), you own a **single-round, user-gated fix loop** (Step 7.6): mechanical classes (lint / format / marker-syntax) auto-fix without a question; triage every other failure as a gate question per [_gate-question.md](_gate-question.md) (Fix / Skip / Escalate); `Fix` choices spawn parallel write-isolated sub-agents per [_subagents.md](_subagents.md) that apply the minimal patch. ONE round only: if anything still fails, write `convergence: escalated` and route to re-invoke `/wf verify` or `/wf implement`; do not loop again in this invocation.
- Your only output is the workflow artifacts, the dispatched fix sub-agents, and the compact chat summary defined below.

# Workflow rules

Apply [_workflow-rules.md](_workflow-rules.md). Two verify-specific rules:
- **Evidence versioning across re-invocations.** On a re-run, move the previous evidence directory to `.ai/workflows/<slug>/verify-evidence/<slice-slug>-run-<N>/` where `N` = `fix-rounds-run` + 1; never overwrite it.
- **Re-verify writes back; the index never contradicts a slice.** When a re-invocation changes a per-slice outcome, run `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> 06-verify-<slice-slug>.md result=<result>`, then re-derive the master `06-verify.md` rollup. Change the slice record first, then the index; never the index alone.

# Step 0 — Orient (do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument); the second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `node "<skill-dir>/scripts/wf.mjs" status "<root>" --json`. If ambiguous, ask the user.
2. **Read `00-index.md`** with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`: `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Resolve the slice-slug**: the passed selector, else `selected-slice` from the index, else ask the user.
4. **Determine the workflow source mode** from `workflow-type`:
   - `quick` (legacy) → **compressed mode**. `01-quick.md` holds the acceptance criteria. No per-slice files exist.
   - `rca` → **forwarded mode**. `01-rca.md` and the synthesized `02-shape.md` hold the acceptance criteria.
   - `investigate` → **terminal analysis, not verified in place.** Direct the user to `/wf intake <option>`.
   - `fix` / `hotfix` / `refactor` → **change-mode.** Verify as standard mode with the un-suffixed files. The lead `01-<mode>.md` holds the acceptance criteria, not `03-slice.md`. Hotfix: reproduce the incident symptom and run the regression suite. Refactor: re-run the literal `## Baseline Command` from `02-shape.md`, diff its pass/fail/skip counts against `## Baseline Test Result`, confirm every `## Public API Surface` name keeps its signature and its callers work; any unplanned deviation is a FAIL.
   - `update-deps` → **self-managed**; it authors its own `06-verify.md`. STOP and direct the user back to `/wf intake update-deps <slug>`.
   - `feature`/`optimize` or unset → **standard mode**. The slice file holds the acceptance criteria.
5. **Check prerequisites.** The mode's implement record must exist: `record get` of it exits 0.
   - All modes: if implement record shows `Status: Awaiting input` → STOP.
   - If `06-verify-<slice-slug>.md` (or `06-verify.md` in compressed mode) already exists → note the re-run in chat and proceed; [_additive-write.md](_additive-write.md) snapshots the prior revision and appends the `revisions:` ledger.
   - **Stack gate (do not silently re-detect).** Inspect `stack:` in `00-index.md` and `stack-source` in `04-plan-<slice-slug>.md`.
     - If `stack:` is **missing entirely** → STOP: "Stack fingerprint missing from `00-index.md`. Re-run `/wf intake <slug>` first."
     - If `stack.user-confirmed: false` → **hard gate.** Ask ONE gate question per [_gate-question.md](_gate-question.md): header `"Stack unconfirmed"`, question `"stack: was auto-detected but the PO never confirmed it. Adapter selection may be wrong. (1) Stop and re-run intake Batch B. (2) Proceed with unconfirmed stack — result stamped weak-provenance and review/ship may refuse it."`, options `Stop (recommended)` / `Proceed with unconfirmed stack`. Stop → STOP. Proceed → set `stack-source: unconfirmed-auto-detect` in the verify slice frontmatter and `## Caveats`. Never auto-proceed.
     - If `04-plan-<slice-slug>.md` carries `stack-source: unconfirmed-auto-detect` → propagate the same warning and frontmatter stamp.
     - If `stack.user-confirmed: true` and the plan agrees → proceed. Sub-agent 3 intersects matched adapters with `stack.platforms`; companion skills used for evidence come from `stack.available-skills`.
   - **Constraint-resolution gate (refuse inherited unresolved environment walls).** Read `## Verification Strategy` in the plan record. Every user-observable AC whose strategy names an environment dependency (credentials, device, external service, inbound callback, deploy target, missing infrastructure) carries a `constraint-resolution:` line authored at plan time (`prerequisite-slice: <slug>` | `proxy+deferral: <named clearing event>` | `po-accepted: <reason>`). If none of the three is present, record the criterion under `constraint-resolution-missing:` in the verify frontmatter and treat it as `blocked-runtime-evidence-missing` at Step 7.5; the deferral hatch is not available for it. Route to Option E (`/wf plan`), not Option F.
6. **Use the augmentation context.** Each `02c-craft.md` `## Mock fidelity inventory` item is an additional AC; cross-reference it against `05-implement-<slice-slug>.md` `## Visual Contract Honored`. Each `00-index.md` `augmentations:` entry names an artifact (for example `07-design-audit.md`, `07-design-critique.md`). Sub-agent 4's table in [verify/_augmentation.md](verify/_augmentation.md) holds the type-specific re-checks.
7. **Carry forward** `open-questions` from the index.
8. **Branch check.** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy: dedicated`, confirm the branch via `git branch --show-current` and switch if needed.

# Parallel verification (Step 4)

When verification spans multiple concerns, launch parallel sub-agents per [_subagents.md](_subagents.md): independent AC groups go to parallel non-editing children (they may build, boot, and drive; they never edit source), each returning evidence; the parent composes the verify artifact and the verdict. Do not spin up sub-agents when a single test command covers everything. The charters:
- **Sub-agent 1, Static Analysis & Build** (every slice): lint, types, build, the default performance gate, security scanning, `sdlc-debt:` marker hygiene.
- **Sub-agent 2, Test Execution** (every slice): unit, integration, coverage, the skipped-gating-spec mapping (`skipped-gating-specs`), the cross-slice regression check.
- **Sub-agent 3, Interactive & Runtime-Truth Verification** (required when any AC is user-observable): drives each such AC on the runtime adapters and the constraint-resolution ladder; records `evidence-rung`, `mock-provenance:`, `fixture-fidelity:`, first-light status, and incidental `_surface-defects.md` defects.
- **Sub-agent 4, Augmentation Re-verification** (`mode:augment`). It gets the paths of the screen pages and the approval pictures, never a canvas URL.
- **Sub-agent 5, Freshness** (when any test failed, the plan is older than 14 days, or the slice touches an external API or schema).
Merge all results. For each check, record the command and pass/fail in the artifact. Write the raw output (test runner output, probe logs, scan output) to `verify-evidence/<slice-slug>/checks.md`. Do not fix issues here; the fix loop runs in Step 7.6 after the AC gate partitions issues.

# Chat return contract

Apply the early-stop guard in [_autonomy-guards.md](_autonomy-guards.md) before ending the turn. After writing files, return per [_chat-return.md](_chat-return.md). Lead with the narrative per that file (section *The narrative*), then give this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `result: <pass | fail | partial | blocked-runtime-evidence-missing>`
- `convergence: <not-needed | converged | escalated>`, with the `fix-rounds-run` count and a one-line "what the loop did" summary when `convergence != not-needed`
- `options:` (all viable next options per Adaptive routing)
- ≤3 short blocker bullets if needed

Do this in order:
1. Confirm the selected slice.
2. Determine the relevant verification commands from the repo.
3. **Track the stage's units in a work-tracking checklist**: one item per check (lint, typecheck, tests, build, …), one per acceptance criterion from `03-slice-<slice-slug>.md`, plus the artifact write. Keep statuses truthful as results land.
4. **Run checks** (parallel sub-agents when multi-concern): lint, typecheck, tests, build, smoke tests, manual checks. Record a failed check as `FAILED: <output summary>` on its item. Do not fix yet; the user-gated fix loop runs once in Step 7.6.
5. **Verify acceptance criteria** against each criterion from `03-slice-<slice-slug>.md` and `02-shape.md` (other modes: the Step 0.4 source). Record an unmet criterion as `NOT MET: <reason>` on its item.
6. If verification reveals gaps caused by external dependency behavior or standards drift, run a freshness pass and record it.
7. **Evaluate adaptive routing.** Write ALL viable options into frontmatter `recommended-routes`.
7.5. **Apply the user-observable AC gate** (below). Partition AC into `code-only` and `user-observable`. Every `user-observable` AC needs a matching `interactive-verification-results` entry. If any has none and no `interactive-verification: deferred` annotation, write `result: blocked-runtime-evidence-missing` and list the AC in `## Issues Found`.
7.6. **Single-round verify-owned fix loop** (below). Snapshot `metric-issues-found-initial`; auto-fix mechanical classes; triage each remaining failure as a gate question per [_gate-question.md](_gate-question.md); `Fix` choices spawn parallel write-isolated sub-agents; re-run only affected checks once. Record `fix-rounds-run`, `convergence`, `metric-issues-found-final`. ONE round only; if anything still fails, finalize with `convergence: escalated` and route to re-invoke verify or `/wf implement`.
8. **Write the draft of `06-verify-<slice-slug>.md`** per [verify/_artifact.md](verify/_artifact.md), and run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` per [_records.md](_records.md).
9. **Write the draft of `06-verify.md`** (the master index linking every per-slice verify record) and put it. To update it, get it first.
10. Record the end of the stage with `node "<skill-dir>/scripts/wf.mjs" record stage-done "<root>" <slug> verify <selected-slice>`. It writes `current-stage`, `progress.verify`, `next-command`, `next-invocation` (the default route, `/wf review <slug> <selected-slice>`) and adds the new records to `workflow-files`. When the Next row of this stage names another route, add `--next "<invocation>"`. Set any other index field with `record set "<root>" <slug> index key=value ...`. **Then promote the slice's roster status** in one call: `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> 03-slice slices[<selected-slice>].status=<status>`. `result: pass` sets `status: complete`; any other result (`fail`, `partial`, `blocked-runtime-evidence-missing`) leaves it at `status: in-progress`. A deferral-only `partial` is **not** complete; the AC still owes runtime evidence, and `/wf ship` blocks on it. Set only this slice's entry; do not touch siblings, do not renumber, and never move an entry that `close.md` set to `skipped`. Only verify writes `complete`; yolo mirrors a recorded `result: pass`.

# Adaptive routing

Routing is driven by `convergence:` plus the post-fix-loop `result:`. Present ALL viable options. Write each option as one `recommended-routes` entry with its reason:
- **Option A: Review** → `/wf review <slug> <selected-slice>` when `convergence:` is `not-needed` or `converged` and `result: pass`. **Compact recommended if verify was lengthy**; its output is noise for review.
- **Option B: Second verify round** → `/wf verify <slug> <selected-slice>` when `convergence: escalated` and the user wants another fix round. State the unresolved issues first.
- **Option C: Manual implement (escape hatch)** → `/wf implement <slug> <selected-slice>` when the remaining issues need a design rethink or input verify cannot supply.
- **Option D: Skip review** → `/wf ship <slug>` for a solo project, an external review, or a trivial fix; only with `result: pass`.
- **Option E: Revisit plan** → `/wf plan <slug> <selected-slice>` when verification revealed a wrong approach, not a wrong line of code. Dominates Option C.
- **Option F: Re-verify in a capable environment, or defer** → re-run `/wf verify <slug> <selected-slice>`, or amend with `interactive-verification: deferred` per [verify/_deferrals.md](verify/_deferrals.md), when `result: blocked-runtime-evidence-missing` and the fix loop could not produce the evidence. Deferrals block the release of ship, but not review or the PR phase of ship. A deferral is lawful only over a probed incapability and is unavailable for criteria in `constraint-resolution-missing:` (those route to Option E).
- **Option G: Slug-wide runtime probe** → `/wf probe <slug>` when per-slice verify passed and a slug-wide runtime sweep is wanted (cross-slice integration breakage).

# User-observable AC gate (Step 7.5)

Runtime evidence is required for every user-observable AC. No evidence, no pass.

**Partition.** Read every AC entry from `03-slice-<slice-slug>.md` (or the compressed-mode source per Step 0.4). Step A: an explicit `observable: true | false` annotation (inline tag or `<!-- observable: … -->` comment) is final. Step B, when unannotated: the AC is user-observable when it names a visible surface (screen, page, route, view, panel, dialog, command output), a user action (click, tap, type, submit, run, invoke, navigate), or an observable post-condition (renders, appears, displays, returns, prints, succeeds, redirects). Criteria that fail all three are `code-only`. Record `kind: code-only | user-observable` per AC under `## Acceptance Criteria Status`.

**Matching.** For each `user-observable` AC, find the sub-agent 3 `interactive-verification-results` entry by AC id or quoted-text overlap. Matched pass → met. Matched fail → not met; `## Issues Found` lists the failure. Matched partial → partially met; list the gap. Not matched → no runtime evidence; the gate refuses `result: pass` for the slice.

**Result writeback.** All AC met (code-only via test suites, user-observable via interactive evidence) → `pass`. A user-observable AC with no matching evidence and no deferral annotation → `blocked-runtime-evidence-missing`; a designated gating spec skipped with no other rung and no deferral → the same. At least one AC fails or is partial while every user-observable AC has runtime evidence → `fail` or `partial`. `blocked-runtime-evidence-missing` is procedural (evidence not produced), not substantive (code wrong): `fail` routes to `/wf implement`; `blocked-runtime-evidence-missing` routes to a capable environment or a deferral.

**Runtime evidence and deferral.** When the slice has a user-observable AC, apply the gate rules of [verify/_runtime-evidence.md](verify/_runtime-evidence.md): mock, CI-configuration, write-time enforcement, deferral.

# Verify-owned fix loop (Step 7.6, single round, user-gated)

Conforms to [_fix-loop.md](_fix-loop.md); this section is the verify-specific parameterization. Bounded to one round; re-runs require re-invoking `/wf verify`.

**Inputs.** Every check recorded `FAILED:` (Step 4), every AC recorded `NOT MET:` (Step 5), every user-observable AC the gate refused for missing runtime evidence (Step 7.5), every augmentation re-check that failed (mock fidelity, signal coverage, experiment wiring, benchmark regression). Record the count as `metric-issues-found-initial`. If the count is zero, set `fix-rounds-run: 0`, `convergence: not-needed`, and skip the rest of this section.

**Triage.** An issue of class `lint`, `format`, or `marker-syntax` is mechanical: triage it `Fix` yourself, without asking, and report what was auto-fixed, with diffs, in the round summary. Anything unclassified, scope-changing, or behavior-changing still asks.

For each remaining issue, ask the gate question per [_gate-question.md](_gate-question.md), batching up to 4 issues per gate round: header = an issue identifier (`LINT-1`, `AC-3`, `RUNTIME-MISSING-2`, `BENCH-REG`); question = `"{issue type}: {one-line summary} at {file:line or check name}"`; options `Fix` ("Fix this now: spawn a sub-agent to apply the minimal patch in this run"), `Skip` ("Leave as-is for now; it surfaces in the verify artifact under Issues Found"), `Escalate` ("Out of scope for verify; route to `/wf implement` or back to plan"). Outside the mechanical carve-out, verify never silently auto-fixes. If the user picks `Skip` for everything, the loop ends with `convergence: not-needed` and the failures remain recorded.

Dispatch a fix sub-agent for **every** issue triaged `Fix` **in parallel** (one wave). For each issue:
1. Dispatch ONE sub-agent at **medium** effort with write isolation, per [_subagents.md](_subagents.md); both settings are required ([_fix-loop.md](_fix-loop.md) rule 3). Under a worktree host, do not merge its branch until the sanity check passes; under a partition host (no worktree flag) the edit is already in the tree, so the sanity check reviews the diff before it is accepted. Prompt:
   ```
   Fix the following verify-stage issue in the codebase:

   Issue ID: {ID}
   Type: {check-failure | unmet-ac | runtime-evidence-missing | augmentation-regression}
   Location: {file:line OR check-name}
   Observation: {raw output or AC criterion text}
   Suggested fix: {one-line suggestion, if any}
   Check command: {narrowest check for this fix}

   Read the file(s) at the location. Apply the minimal fix for this
   issue only. Do not refactor.

   Regression test (required for code bugs): if this issue is a code
   bug, not a lint/format, config, tooling, or docs finding, add a
   minimal regression test that fails before your patch and passes
   after it. Write the test first when the check that caught the issue
   is re-runnable. If a regression test is genuinely not possible,
   state why in one line; the orchestrator records it as an exemption.
   Never weaken, delete, or skip an existing test to make a check
   pass; that is the one forbidden test edit.

   The suggested fix names a METHOD, not only an outcome. Follow it. If
   you conclude it is wrong or impossible you may deviate, but say so
   in the FIRST line of your return, not in a closing note.

   Run the check command before you return.

   Return, in this order:
     Method: as-prescribed | deviated
     (if deviated) what was suggested / what you did instead / why
     Self-check: <command> → exit <N>
     A brief summary of what you changed, including the regression test
     path (or the one-line exemption reason).
   ```
2. As each sub-agent returns, read the changed files (worktree host: from the child's branch via `git checkout <branch> -- <files>`; partition host: from the working tree) and sanity-check the patch against both the issue and the suggested fix's method ([_fix-loop.md](_fix-loop.md) rule 5). A `Method: deviated` return is never merged on the sub-agent's own say-so: re-read the patch against what was suggested and decide deliberately; a deviation that touches an explicit prohibition is discarded, not merged. Accept a correct patch (merge the branch result under a worktree host; leave the working-tree edit under a partition host). When two patches overlap on the same lines, merge one, then re-dispatch the other against the merged state; serial for the conflicting pair only. Discard a wrong patch (`git checkout -- <files>` under a partition host) and record `COULD NOT FIX: <reason>`; that issue is `convergence: escalated` material.

**Re-check.** Re-run ONLY the checks whose original failures were triaged `Fix`: the failing lint; the specific test file (or the smallest suite that covers it); the AC re-evaluated against the patched code (or the relevant interactive adapter for a user-observable AC); the adapter capture for a missing-evidence AC. Do not re-run unrelated checks, and do not re-run `Skip` or `Escalate` issues' checks. Compute `metric-issues-found-final` over the post-fix state.

**Convergence.** `metric-issues-found-initial == 0` → `not-needed`; `result:` unchanged from the gate verdict. `metric-issues-found-final == 0` and no `Escalate` decision → `converged`; `result: pass` unless a deferral keeps it at `partial`. `metric-issues-found-final > 0` or any `Escalate` decision → `escalated`; `result:` is the gate's verdict over the post-fix state (`fail`, `partial`, or `blocked-runtime-evidence-missing`). When escalated, routing offers Option B and Option C and never auto-loops, and `## Issues Found` lists each still-broken issue with its triage decision attached (`Skip`, `Escalate`, and any `Fix` the sub-agent could not resolve).

**Commit.** When at least one `Fix` sub-agent modified files and every re-check for `Fix`-triaged issues passed, follow the shared commit discipline ([_fix-loop.md](_fix-loop.md) rule 7) with message `fix(<slug>): verify-time fixes for <slice-slug>` and record the SHA in the artifact's `## Verify-Owned Fixes` section. Do not commit while any `Fix`-triaged re-check still fails: record `convergence: escalated`, leave the working tree as-is, and route to re-invoke verify; a partial-fix commit never enters git history. Record `regression-tests-added: <N>` in the frontmatter; a code-bug fix with neither a test path nor an exemption reason is a MED finding (`fix landed without its regression test`), while lint/format, config, tooling, and docs fixes are exempt (`n-a`).

# Artifacts

Write the drafts of `06-verify.md` (master index) and `06-verify-<slice-slug>.md` (per-slice), and put them, per the schemas in [verify/_artifact.md](verify/_artifact.md), which also defines the `result:` and `interactive-verification:` semantics, the `## Acceptance Criteria Status` rows with their `evidence-rung`, and the `## Verify-Owned Fixes` table.
