# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary and the workflow-registry / slug rules. Apply the "Compressed-lifecycle change-modes" contract in `intake/_change-mode-tail.md`: the model, the authorship split, and the gate. Do not restate them here.

You are running `/wf intake hotfix`, an **accelerated incident-response standard lifecycle**.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `hotfix`: it overrides the standalone steps below.

# Pipeline
`01-hotfix`(intake) → `02-shape` (diagnosis) → `03-slice` → `04-plan` → **[gate]** → `/wf implement` (→`05`) → `/wf verify` (→`06`) → `/wf review security` (→`07`) → `/wf ship` → `/wf retro`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces (this command) | `01-hotfix.md` (`type: intake`: the incident brief and the acceptance criteria), `02-shape.md` (the root cause, the blast radius and the scope), `03-slice.md` (`type: slice-index`, one slice), `04-plan.md` (a minimal plan and the rollback), and a conformant `00-index.md` (`type: index`). |
| Compression | Each stage is one pass, and no stage is skipped, but the lifecycle is fast under incident pressure. One slice. The PR phase of ship and retro stay in the chain: ship stops without a ready handoff verdict. |
| Gate | Stop and ask before `05-implement` (Proceed / Adjust / Escalate; the family rules per `_change-mode-tail.md`). |
| Next | `/wf implement <slug>`, the standard execution. `07-review` defaults to **`security`**. |
| Escalate | When the fix needs more than 3 files, more than about 50 lines, or an architectural change, the tripwire fires. Record it per `_change-mode-tail.md`, and offer the *Escalate* option of the gate, which closes this slug and restarts as `/wf intake "<description>" from <slug>`. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-hotfix.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_change-mode-tail.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `design/_lane.md` | procedure | always | UX impact |
| `design/stage.md` | procedure | mode:design | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-hotfix.md` | writes | | |
| `02-shape.md` | writes | | |
| `03-slice.md` | writes | | |
| `04-plan.md` | writes | | |

# Scope lock
You orchestrate a hotfix. This is not a feature workflow.
- The only acceptable output is the minimum change that stops the incident.
- Allow no scope creep. Do not refactor, clean up or improve code that is not the direct cause. Touch nothing outside the identified root cause without the person's explicit approval.
- Ask at most 3 questions. Record each answer with `decide add` per [_decisions.md](../_decisions.md), and also write it inline into `01-hotfix.md`.
- The lifecycle skips no stage, but each stage is one pass, scoped to the incident. The hotfix tripwires are: more than 3 files; more than about 50 lines; any architectural change. Record a breach per `_change-mode-tail.md`. It is never a refusal: it brings up the *Escalate* option of the gate.
- Keep the stated order only where a step uses the output of an earlier step or crosses a gate. Reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve the slug and the mode** from `$ARGUMENTS`:
   - When the argument matches an existing workflow whose index (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) has `workflow-type: hotfix`, this is **resume mode**. Read that index, and continue from the first unwritten planning artifact. An old slug may carry `hf-*.md` files: write them again as the standard set when you continue.
   - Otherwise this is a **new hotfix**.
2. **New slug.** Name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `hotfix-<short-description>`.
3. **Provenance check.** Apply `_intake-provenance.md`: an rca often routes its critical cases here. On an explicit `from <rca-slug>` token, use the rca row of the Consume table, and link back. The root cause seeds `## Root Cause` of `02-shape.md`, `## Verification` seeds the acceptance criteria, and the blast radius seeds the scope. The sub-agents of Step 2 then check them again instead of deriving them again. With no match, go on.
4. **Stack fingerprint.** Apply the stack policy in `_change-mode-tail.md`: detect cheaply, write the block with `user-confirmed: false`, and spend no question on it (the caveat path of verify carries it). Then set `ux-impact` per `_change-mode-tail.md` → UX impact and the design stage.
5. **Branch check:**
   1. Check the current branch: `git branch --show-current`.
   2. Find the production branch (the default branch) offline first: `git symbolic-ref refs/remotes/origin/HEAD`. Use no network: in an incident, the network may be part of the incident. When it is unset, fall back to `git remote show origin | grep 'HEAD branch'`, then to whichever of `main` and `master` exists locally.
   3. A hotfix always branches from the production branch. Run the base check first (`node "<skill-dir>/scripts/wf.mjs" base check "<root>" --base <production-branch>`, [_workflow-rules.md](../_workflow-rules.md)), then `git checkout -b hotfix/<slug> <production-branch>`.
6. **One slice.** The whole hotfix is one slice. The workflow slug is also the `slice-slug` of that slice: use `<slug>` for `slice-slug`, `selected-slice` and `best-first-slice`. The later stages write un-suffixed files.

# Step 1 — Brief → `01-hotfix.md` (`type: intake`)
**Write the index first.** Before the first question or research of this step, write the draft of `00-index.md` from the shared change-mode index template in [_change-mode-tail.md](_change-mode-tail.md), with the values of the `hotfix` column, `progress.intake: in-progress` and `next-invocation: /wf intake hotfix <slug>`, and put it. A run that stops before the gate can then resume (the resume test of Step 0 reads this index), and a close or a probe route of a later step has an index to act on.

Ask at most 3 questions, and stop as soon as you have enough:
1. **What is broken?** The symptom: what fails, where (URL, endpoint, page, component, service), and for whom (all users, a cohort, an environment, an account).
2. **What is the impact?** An outage, a degradation, or a data issue? How many users? Is data at risk?
3. **What changed recently?** Deployments, migrations, config, dependency updates in the last 24 to 72 hours?

Write the draft `<wf-dir>/.draft/01-hotfix.md` at once, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. Write the draft of each later planning record (`02-shape.md`, `03-slice.md`, `04-plan.md`, `00-index.md`), and put it, the same way.
Take the frontmatter from the `01-<mode>.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Body:
- `## Symptom` (what, where, for whom).
- `## Impact` (the severity, the affected scope, the data risk).
- `## Acceptance Criteria`: at most 2, each objectively verifiable. Embed the answers to the inline questions as italic notes. Verify and review read the criteria from this lead, so a hotfix without them cannot pass its own quality tail. The incident is over when these are observably true, for example "checkout returns 200 for the repro request" and "no new occurrences of the error signature for 30 minutes".
- `## Recent Changes` (or "none known").

# Step 2 — Diagnose → `02-shape.md`
Launch the sub-agents in parallel to find the root cause. Do not go on until both are done.

**Effort tier.** Give every agent the tier **medium** ([_subagents.md](../_subagents.md)). Both agents reason about causes under time pressure: they trace the root cause across recent changes, and they reason about the blast radius. Low effort is not enough for causal tracing. Do not go above medium: an active incident cannot wait.

### research sub-agent 1 — Root Cause Investigation
Give it all of these:
- Read the areas most likely to hold the bug.
- Run `git log --oneline -20` on the affected files, and compare it with the "recent changes" of the brief. Run `git log --oneline --since="72 hours ago" -- <affected-path>`.
- Grep for the exception names, error strings and failure patterns of the symptom. Check the TODO/FIXME/HACK markers near the area. Look for failing related tests.
- Find the exact files and lines of origin.

It reports `file:line`, a root-cause hypothesis (2 to 4 sentences), a confidence (high, medium or low) and the supporting evidence.

### research sub-agent 2 — Impact & Scope
Give it all of these:
- Find every caller, consumer and dependent of the broken path (grep the imports and references).
- Check whether related components share the bug through shared code.
- Find any data that may have been corrupted during the active period.
- Check whether the bug is on the production branch, or only in unreleased code.

It reports the complete list of affected files, paths and services, the data risk (none, possible or confirmed), and a summary of the blast radius.

Wait for both. When the root-cause confidence is low, launch a focused third agent on the most likely hypothesis.

**Confidence floor.** When the confidence is still low after the third agent, do not write a guessed `## Root Cause`. Climb the ladder instead: reproduce the symptom at runtime with `/wf probe <slug> "<the runtime question the diagnosis hinges on>"` (the finding lands as a compressed slice on this slug), or hand it to human triage. A hotfix built on a guess ships a second incident.

Then write `02-shape.md` with the diagnosis as its scope. `02-shape.md` is the only home of the root cause; `01-hotfix.md` does not copy it.
Take the frontmatter from the `02-shape.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Body: `## Root Cause` (`file:line`, the hypothesis and the confidence), `## Blast Radius` (the affected paths and services, the data risk), `## In Scope` (the minimum change), `## Out of Scope` (everything else: the scope lock).

# Step 3 — Slice → `03-slice.md` (`type: slice-index`, one slice)
Take the frontmatter from the `03-slice.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Body (one line): "Single-slice incident fix."

# Step 4 — Plan → `04-plan.md`
Write a minimal plan, ready to run:
- Aim for at most 5 steps and at most 3 files.
- Each step addresses the root cause directly: no cleanup, refactor or improvement.
- Include a **rollback**: the exact revert command or steps.
- When data was corrupted, include a separate data-remediation step.

When the plan really needs more, that is a tripwire breach, not a schema violation. Record it per `_change-mode-tail.md`, and let the gate judge it.
Take the frontmatter from the `04-plan.md` planning template in [_change-mode-tail.md](_change-mode-tail.md).
Body: `## Steps` (each names the files, the change and the verification), `## Rollback` (the exact revert), `## Data remediation` (when needed), `## Verification` (reproduce the symptom; the regression suite; a spot-check of the adjacent paths), `## Tripwire breaches` (only when one fired, per `_change-mode-tail.md`).

# Step 5 — Finish `00-index.md` (conformant `type: index`)
Get the index that Step 1 wrote (`record get "<root>" <slug> index`), and finish it. Write its draft from the shared change-mode index template in [_change-mode-tail.md](_change-mode-tail.md), with the values of the `hotfix` column: the final `workflow-files`, `progress` and terminus route. The branch is `hotfix/<slug>`, from the production branch; `stack.user-confirmed: false` per the stack policy.

**Seed `intent-risks` from `## Impact`.** Write two entries (`id: RIM-1`/`RIM-2`, `severity` from the severity of the incident, `status: open`): one for the user or data impact of the incident, and one for the blast-radius or data-remediation risk. Ship then judges the severity of the incident, instead of inheriting a hardcoded empty list. Put the index.

# Step 6 — Gate before implement
Apply the gate and the family gate rules in [_change-mode-tail.md](_change-mode-tail.md). Record the decision in `01-hotfix.md` on every branch. Escalate closes this slug and prints `/wf intake "<description>" from <slug>`. Under incident pressure you may go on without the pause when the fix is clearly minimal: at most 3 files, a high root-cause confidence, and no data risk.

# Step 7 — Hand off to the standard chain
On proceed, route to `/wf implement <slug>` → `/wf verify <slug>` → **`/wf review <slug> security`** → `/wf ship <slug>` → `/wf retro <slug>`.
- Review defaults to the security rubric for a hotfix, and it is always safe to run quickly.
- The PR phase of ship runs first, and ship stops without its `readiness-verdict: ready`. An incident does not skip it.

Lead with a short narrative paragraph (the symptom, the root cause, the minimal fix, the gate decision), then:
```
wf intake hotfix complete: <slug>
Branch: hotfix/<slug> (off <production-branch>)
Root cause: <file:line>
Plan: <N> steps · Files: <M> (≤3) · Data remediation: <yes|no>
Gate: <proceeded | adjusted | escalated | auto-proceeded (minimal)>
Next: /wf implement <slug>  →  /wf verify  →  /wf review <slug> security  →  /wf ship  →  /wf retro
```

# Workflow rules
Apply the shared workflow rules in [_change-mode-tail.md](_change-mode-tail.md). The rule of hotfix: review defaults to the **security** rubric (auth, tokens, crypto, permissions). `/wf review <slug> security` is always safe to run quickly. Widen it only when the change warrants it.
