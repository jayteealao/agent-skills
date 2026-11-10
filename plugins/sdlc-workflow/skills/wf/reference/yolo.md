---
description: Autonomous lifecycle driver, on Claude Code, Codex and pi. Runs each stage as a sub-agent of the host's workflow runtime and resolves each stage gate by a written Autonomous Decision Policy, recording each decision in the artifact. `/wf yolo <slug>` drives every slice, then the final review, and stops before ship; `/wf yolo <slug> <slice>` drives one slice and routes to the next. Writes no artifact of its own; never opens a PR, runs ship or retro, or fixes CI.
argument-hint: <slug> [<slice>]
---

You are running `/wf yolo`, the autonomous lifecycle driver. It drives a slug from `plan` to its review endpoint through the host's workflow runtime (Step 1), and resolves each stage gate by the Autonomous Decision Policy below.

> **Hosts.** `workflows/yolo.js` runs unchanged on each host. Claude Code runs it with the **Workflow** tool, pi with the **SubagentWorkflow** tool of pi-subagents, and Codex with `wf.mjs drive`, where each agent is one `codex exec` call. Step 1 names the call for each host. This file is a named host-contract file, so it names each host's tools directly.

# What yolo is, and is not

- **A driver, not a stage.** A delegated stage sub-agent writes every artifact in `<wf-dir>/`. It follows the stage reference (`plan.md`, `implement.md`, `verify.md`, `review.md`) exactly, with one override: where the reference asks the person, the sub-agent resolves the gate by policy.
- **The reads are listed.** Each stage prompt names the `## Requires` table of its reference as a checklist, per [_requires.md](_requires.md).
- **It resolves gates; it does not remove them.** Each quality gate still runs, and yolo supplies the answer and records it. When yolo cannot produce the runtime proof that a criterion needs, it defers that criterion through the `interactive-verification: deferred` hatch of verify. The deferral is recorded, visible, and blocks ship.
- **It stops before ship.** It never opens a PR and never runs `ship` or `retro`. CI is not in its scope.
- **Resume is free.** The artifact trail (`00-index.md` and the numbered files) is the durable record, and there is no separate state file. A killed run resumes when you start it again: orientation skips each stage that is already terminal-clean.
- **A dead driver looks dead.** Each dispatched sub-agent writes heartbeats to `<wf-dir>/.driver-journal.jsonl`. Judge the journal by the staleness rule, not by its existence.

# What yolo drives

yolo drives from `plan` onward. It never runs `intake` (with its shape phase) or `design`: those stages own the alignment with the product owner.

Orientation classifies the slug by the `workflow-type` of `00-index.md`. [_source-modes.md](_source-modes.md) holds the lead record, the acceptance source and the record names of each `workflow-type`.

| Class | `workflow-type` | What yolo does |
|---|---|---|
| Build lifecycle | standard (`feature`), and the change modes `fix`, `hotfix`, `refactor` | A standard workflow starts at `plan`. A change mode has written its `04-plan.md` (`01-<mode>` → `02-shape` → `03-slice` → `04-plan`), so it starts at `implement`. Orientation takes the intake lead of the mode (`01-fix.md`, `01-hotfix.md` or `01-refactor.md`, each `type: intake`) from `workflow-type`, not from `01-intake.md`. Readiness needs the intake lead, `02-shape.md` and `03-slice.md`; a single-scope workflow with no `03-slice.md` runs as a roster of one. |
| RCA, forwarded and single-scope | `rca` | `01-rca.md` (`type: rca`) is the intake, and it writes `02-shape.md`. yolo drives from `plan` over a roster of one, made from `selected-slice`; each stage reference has a forwarded-mode path. `recommended-next` sets the flavour: `hotfix` gives the review the `security` rubric; `plan` or `fix` a standard review. `recommended-next: human-triage` is a product stop: orientation blocks and routes the person to read `01-rca.md` and choose the route by hand. yolo never makes a branch or changes the base for an RCA. |
| Self-managed build | `update-deps` | One sub-agent runs Steps 6 to 9 of `intake/update-deps.md`, with the Step 6 scope gate resolved by the policy table. It writes `05-implement.md` and `06-verify.md` itself, in tier order: P0 security, then P1 major and migration, then P2 safe batch. Then yolo runs the slug-wide review. Readiness needs `01-update-deps.md` (`type: intake`), `02-shape.md`, `03-slice.md` and `04-plan.md`, each `status: complete`. Otherwise orientation blocks with `route='/wf intake update-deps <slug>'`, or `/wf plan <slug>` when `04-plan` is the only gap. |
| Optimize loop | `optimize` | yolo runs no trial. Until the finish of the loop writes `05-implement-optimize.md`, orientation blocks with `route='/wf loop optimize <slug>'`. Then yolo drives verify and review of the slice `optimize`. |
| Analysis with no decided build | `investigate`, `discover`, `ideate`, `audit`, `brainstorm` (`00-index.md` is `type: workflow-index`) | yolo drives nothing, and never routes them to `/wf slice` or `/wf plan <slug>`. Orientation blocks and hands back the next step that the mode recorded: `ideate` → `/wf intake <chosen-idea>`; `investigate` → pick an option in `01-investigate.md`, then `/wf intake fix <option>`; `discover` → act on the verdict in `01-discover.md`; `audit` → the route of each finding in `## Triage Decisions` of `07-review.md`; `brainstorm` → `/wf intake brainstorm <slug>` (resume). |
| Refusal | `task`, `prototype` | yolo drives nothing, and orientation blocks: `task` (its blast-radius gates are never resolved unattended; route `/wf intake task <slug>`) and `prototype` (the person starts every round; route `/wf loop prototype <slug> <request>`). |

# Two modes

| Mode | `review-scope: per-slice` | `review-scope: slug-wide` |
|---|---|---|
| Slug mode, `/wf yolo <slug>`: every slice of the roster, then stop before ship | Each slice runs `plan → implement → verify → review`. The run ends when the review of the last slice is clean. | Each slice runs `plan → implement → verify`. Then the one slug-wide review (`07-review.md` over the branch diff) runs once. |
| Slice mode, `/wf yolo <slug> <slice>`: that slice, then route to the next | `plan → implement → verify → review` for the slice. | `plan → implement → verify`, then stop before review. |

A slice of complexity `xs` or `s` has no separate verify agent. Its implement agent runs `verify.md` in the same session, with at most 2 verify rounds, and writes the verify record. When that verify does not converge, the run stops. An `m`, `l` or `xl` slice keeps a separate verify agent.

# Work ordering

Orientation classifies each slice by why it still has work. The driver runs the classes in this order:

1. `new-work`: a stage never ran, did not converge, or has a substantive residual. These slices run first, in roster order.
2. The target of the run: the slug-wide review in slug mode, or the named slice in slice mode.
3. `deferral-rechallenge`: every stage is terminal-clean, and the only residue is an open runtime-evidence deferral that no one authorized. These slices run after the target, in the same run.

A re-challenge is a bounded wall probe, not a verify. A read-only agent runs the recorded capability probes of the open deferrals of the slice again, and reports for each wall whether it still stands. When every wall stands, the deferrals carry fresh receipts and the slice is done for this run. The driver runs a full verify again only for a named reason (a wall fell, or the artifacts contradict the index), and records that reason as a decision.

# Driver liveness

Each dispatched agent appends one JSONL line to the journal before it starts and one before it returns, through the `line` command of the driver. A stop adds `reason`, `hardStopReason` or `routeBack`:

```json
{"at":"2026-07-26T14:31:07Z","run":"20260726T142950Z-<slug>","seq":4,"event":"agent-start","agent":"verify:auth","phase":"Drive","stage":"verify","slice":"auth"}
{"at":"2026-07-26T14:58:22Z","run":"20260726T142950Z-<slug>","seq":4,"event":"agent-end","agent":"verify:auth","status":"complete","errors":0}
```

- The journal is a diagnostic, not a gate. A failed append never changes what a stage does. The last agent, `run-end`, writes the `run-end` line.
- Judge liveness by the staleness rule of [_liveness.md](_liveness.md) at every read, `/wf status <slug>` included. Do not infer liveness from a file, a task id, or a "running independently" chip.
- The last writes of a driver presumed dead are suspect. Re-read each control file just before you change it: read a record with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> <name>`. Where an artifact contradicts `00-index.md`, trust the artifact, and correct the index with `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <slug> index key=value ...`. Report what the journal shows the run completed and what it abandoned.

# Control files while a driver is live

While a driver runs for a slug, or is presumed dead and not yet reconciled, the driver owns the `00-index.md` of that slug. The scripts write `.ai/workflows/INDEX.md`, and no writer edits it. Each writer, in the foreground or delegated:

1. Changes an index field with `record set`, per [_control-file-ownership.md](_control-file-ownership.md). The command merges the change in one step.
2. Treats a refused write as "the other writer moved": re-read, derive the change again, and retry once. Do not force a stale value through.
3. Does not start a second driver (another `yolo`) for the same slug while one is live.

The driver keeps these records at drive time:

- **Slice complete.** When a slice clears every gate, the driver writes `status: complete` on the roster entry and the `progress` block of the index.
- **Progress record.** Each stage agent runs `wf.mjs progress set` when it starts. The `run-end` agent writes `done`, `stopped` or `waiting`, with the reason and the resume command. `/wf status <slug>` reads that record.
- **Plan check.** Before an implement, a read-only agent refreshes a plan that code built earlier in the run contradicts.

# The Autonomous Decision Policy

yolo resolves each stage gate that would ask the person by this table. A gate resolves in one of two ways: auto-resolve (go on, and record the decision in the artifact) or hard stop (end the run with the artifact trail and a reason). The last column says what changes in delegate mode: a delegate run stops only where that column names a stop.

| Gate | Auto-resolve | Hard stop | In delegate mode |
|---|---|---|---|
| `plan` discovery interview or scope fork | An implementation-detail fork: pick the option that best meets the acceptance criteria of the slice at the least cost, and record the assumption in `## Assumptions`. A fork that changes user-observable scope or a contract (public API, data shape, UX behaviour, migration) is intent-bearing: the stage returns it as a question (the intent-bearing row). | See the intent-bearing row. | The stage settles the fork by its recommended option, and records it with `--by delegate`. |
| `verify` failing check or unmet acceptance criterion | Fix and defer by "The verify row", below. The run continues at `result: partial` for a lawful deferral. | A substantive failure still unresolved after 2 rounds (`convergence: escalated`); a bare `result: blocked-runtime-evidence-missing`; a deferral that still carries no probe receipt after the corrective re-run; a `code-owned` wall with no scoped resolution. Never fabricate runtime proof. | A failure still unresolved after 2 rounds does not stop: the verify agent records a `verify-accept:<slice>:<item>` delegate decision, writes `accepted-by: delegate`, and adds the item as one `residual` finding that the review tries to fix. A `code-owned` wall is a delegate decision. A deferral with no probe receipt after the corrective re-run, and missing evidence with no deferral, still stop. |
| `review` triage | Fix every finding, BLOCKER to NIT, one step and one commit at a time, in the session of the review agent. Dismiss a false positive with the reason, and a finding that goes against a decision of the person with the id of that decision. A finding that only runtime evidence can settle stays a deferral. The review asks nothing and routes nothing back. It runs one round and stops after the fix steps; nothing scans the fix commits again ([review/_stage.md](review/_stage.md) Steps 4b and 4c). | A BLOCKER that is `could-not-fix` after two tries. | The same stop. |
| Charter fidelity checkpoint, every 3 slices | `honored`: drive on. `at-risk`: drive on, and list it in `outcome.charterCheckpoints`. | `broken`: stop with `outcome.stoppedAt = 'charter-checkpoint'`, because a driver does not walk away from a charter commitment. | The same stop. |
| `update-deps` scope gate (Step 6) | Take the full plan: P0 security, P1 major and migration (one at a time, with only the app-code changes that the API forces), and P2 safe batch. A package that fails its test or build is marked `blocked`, and the run continues at `result: partial`; its deferrals in `06-verify.md` use the runtime-evidence hatch. Never take audit-only, never hand-edit a lockfile, and never mix a security update with a major migration in one commit. | A substantive failure of `06-verify.md` that stays unresolved (the `verify` rule), or a slug-wide review that returns `dont-ship` or a security blocker it cannot fix. | A verify failure is accepted as in the `verify` row. A security blocker that cannot be fixed still stops. |
| Branch posture (`branch-strategy: dedicated` only) | Land the tree on the slug branch before any stage runs: switch to the branch when it exists, else create it from `base-branch`. `outcome.branch` reports the move. Under `shared` or `none`, never switch. | A switch or create that git refuses because uncommitted work would be lost (never stash or force-switch), or a missing `base-branch` that blocks the create. | The same stop. |
| Intent-bearing decision (per [_decision-classes.md](_decision-classes.md)) | Never autonomous, except in delegate mode. A live answer in the decision store settles it (`decide answered`). | The stage records the open question in its artifact as awaiting input and returns `status: 'questions'`. The run stops as `waiting`, with `outcome.questions` ([Questions](#questions--the-stop-that-waits-for-the-person)). | Settled by the recommended option, recorded with `--by delegate`. No stop. |
| `intake` (with its shape phase) or `design` | Never autonomous: these stages own the alignment with the product owner. | A missing, `awaiting-input` or unsettled ([design/_lane.md](design/_lane.md)) stage: stop, and route to that key. | The same stop. |
| Standing steering (live `steer` entries) | A preference tilts an auto-resolve. A constraint that can be met is obeyed and logged in `steering-honored` of the stage. | A steering veto that an otherwise lawful autonomous action would cross. A veto outranks every auto-resolve above. | The same stop. |

## The verify row

The `verify` row is the one statement of the deferral posture of yolo. The deferral law under it is in [verify.md](verify.md) and [verify/_deferrals.md](verify/_deferrals.md).

1. Fix first: the minimal patch, in the single fix round of the stage, for at most 2 rounds.
2. Before any deferral, climb the env-remediation rung ([runtime-adapters/_ladder.md](runtime-adapters/_ladder.md)): rebind a service that the harness owns to a free port and record it, boot the documented headless mode, start an existing AVD, run a provisioning script that the repo ships, or run an install that the plan authorized. Never defer over a port that the run itself binds.
3. Classify the wall (`wall-ownership`). A `code-owned` wall (a port, host, endpoint or fixture that the repo hard-codes) is not deferred automatically: it is a decision that the run surfaces. The driver does not quietly patch product code to unblock itself, and does not defer around its own constant.
4. Defer a user-observable acceptance criterion only when the environment cannot produce its evidence, through the `interactive-verification: deferred` hatch of verify, and only over a probed incapability: the deferral carries the command and output tail of the capability probe as a structured `probe` receipt. A sweep in which every spec was skipped at a guard is never an automatic deferral.
5. A deferral with no probe receipt gets exactly one corrective re-run that asks for it. Still with no receipt, the run stops.
6. A deferral that an earlier run recorded is a claim to probe again, fresh, not to inherit.
7. Record the deferral in `runtime-evidence-deferrals` of `00-index.md`; the run continues at `result: partial`.

A reversible, run-scoped change to state that the run owns is taken and recorded. State that the run does not own is surfaced, not improvised.

## The rest of the policy

- **Standing steering.** Each driven agent runs `decide list --kind steer` fresh, so a new entry reaches the later agents. A crossed veto stops at `steering-checkpoint`. A steering entry that yolo cannot honour without crossing a mandatory gate or a hard stop is surfaced, and not obeyed into a broken state. Steering cannot authorize a ship with an open deferral, and cannot waive a `dont-ship` verdict.
- **Deferrals.** Orientation challenges the open deferrals of earlier runs again, fresh. The hand-back reports the open pile as `outcome.deferralPressure` (the open count, the oldest wall, the `repeat-of` clusters). `/wf ship` refuses until every deferral is cleared.
- **Charter fidelity.** The checkpoint is one read-only sub-agent. It reads the `charter:` block of `00-index.md` and the recent `05-implement` artifacts, and judges each commitment. It never edits or fixes. It skips a due checkpoint when no work since the last one touched the charter, and never runs after the last slice.
- **Autonomy guards.** Apply the early-stop guard and the release valve of [_autonomy-guards.md](_autonomy-guards.md) to the driving session itself.

# Step 0 — Resolve arguments

1. **Slug and mode.** The first positional argument after `yolo` is the slug; the dispatcher refuses a call without one. A second positional argument is the `<slice>`, and selects slice mode. With no second argument, the run is in slug mode.
2. **Existence check.** Check that `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index` exits 0. Otherwise stop: *"No workflow `<slug>`. Run `/wf status` to list workflows, or `/wf intake <description>` to start one."* Do not correct a near miss here. When the person gave a description instead of a slug, stop and tell them to run `/wf intake <description>` first, then `/wf yolo <slug>`.
3. **Resolve the absolute paths.** The driver script and its stage sub-agents inherit no working directory:
   - `projectRoot`: the absolute root of the repo of the workflow, the `"<projectRoot>"` of the dispatch call (the nearest ancestor that holds `.ai/`, capped at the git toplevel).
   - `pluginRoot`: `$CLAUDE_PLUGIN_ROOT` when it is set, else the folder three levels above this reference file (`…/skills/wf/reference` → the plugin root). Check that `<pluginRoot>/scripts/wf.mjs` exists before you use it.
   - `referenceRoot`: `<pluginRoot>/skills/wf/reference`.
4. **Stage the driver script inside the repo.** The Workflow tool refuses a `scriptPath` outside the working directory. On Claude Code and pi, run this at every launch and every resume (on Codex, `wf.mjs drive` runs it):

   ```
   node "<pluginRoot>/scripts/stage-yolo-driver.mjs" "<projectRoot>" --slug <slug>
   ```

   The script copies the driver to `<projectRoot>/.scratch/wf/yolo.js`, makes `.scratch/` ignore itself, and prints one JSON line with `scriptPath`, `models`, `recordsRoot` and `delegate`. Pass `models` and `recordsRoot` on in the args of Step 1, and `delegate: true` when `delegate` is true. A `CAUTION` line on stderr means that a hot-patched copy was overwritten ("Hot-patching the driver mid-run"). When the script fails, follow the failure rule of [_host-invocation.md](_host-invocation.md), and stop.
5. **Ask how the run settles the person's decisions.** The question follows "Standing answers" of [_gate-question.md](_gate-question.md). Ask only when the store of the workflow holds no `run-decisions` steer. When another workflow of this project holds a `run-decisions` steer, put that answer first. Ask one question with the host question tool ([_gate-question.md](_gate-question.md)): "When the run reaches a decision of yours, should it stop and wait, or take the recommended option and show you each one at the end?" The options are "Stop and wait for me" and "Take the recommended option and show me each one at the end". Record the answer as a standing steer:

   ```
   node "<pluginRoot>/scripts/wf.mjs" decide add "<projectRoot>" <slug> --kind steer --key run-decisions --question "<the question>" --answer "<the answer>"
   ```

   The newest entry supersedes the answer of an earlier launch. When the answer is "Take the recommended option and show me each one at the end", pass `delegate: true` in Step 1 ([Delegate mode](#delegate-mode)). On Codex, `wf.mjs drive` reads the recorded answer itself.

# Step 1 — Start the driver

**Claude Code.** Call the **Workflow** tool:

```
Workflow({
  scriptPath: "<projectRoot>/.scratch/wf/yolo.js",   // from Step 0.4
  args: {
    projectRoot:   "<absolute repo root owning .ai/workflows>",
    referenceRoot: "<pluginRoot>/skills/wf/reference",
    slug:          "<slug>",
    slice:         "<slice>",       // slice mode only — omit for slug mode
    models:        { … },           // the `models` block of .ai/sdlc-config.json
    recordsRoot:   "<recordsRoot>",  // from Step 0.4: the folder of the records
    answered:      [ … ],           // a relaunch after questions only — see Questions
    delegate:      true,            // delegate mode only — omit otherwise
    reviewFindings: true            // the review-findings mode of the campaign walk only (campaign.md, the action `fix-run`) — omit otherwise
    // reviewFanout (on): omit unless the person asks
  }
})
```

The workflow runs in the background. Right after this call, start the watch and the running commentary per [yolo/_commentary.md](yolo/_commentary.md).

**pi.** Call the **SubagentWorkflow** tool with the same `scriptPath` and the same `args`, plus `host: "pi"`. The workflow runs in the background. Its result reaches you as context on your next turn, and `/agents` → Workflows shows the live agents. Each agent runs on the model of the session unless the `models` block names one.

**Codex.** Run one shell command, with a timeout that covers the run (several hours for a slug):

```
node "<pluginRoot>/scripts/wf.mjs" drive "<projectRoot>" <slug> [<slice>] [--answered <answers.json>] [--delegate] [--review-findings]
```

- The command stages the driver itself (Step 0.4), runs each agent as one `codex exec` call in the workspace-write sandbox, and prints the `outcome` as JSON.
- `--answered` names a JSON file that holds the `answered` array.
- `--review-findings` is the `reviewFindings: true` of the other hosts. The campaign walk passes it when the slug-wide review fixes only the findings that the walk put in the ledger (campaign.md, the action `fix-run`).
- While it runs, `wf.mjs progress show "<projectRoot>" <slug>` says where the run stands.
- When the command stops before its end, run it again with `--resume <run>`. The agents whose prompts did not change return their recorded results.

# Resuming

- A person who types `/wf yolo <slug>`, or a consent granted per SKILL.md Step 0 item 4, opts in to an unattended run.
- A relaunch of the script is not a new opt-in: it continues the run that the person authorized. After a hand-back is answered, repeat Step 0.4, then the Step 1 call of your host with the same args. Orientation skips each stage that is already terminal-clean.
- Say what you do: *"resuming the driver from `<slice>`"*. Do not tell the person to run `/wf yolo <slug>` themselves.

# Questions — the stop that waits for the person

A stage agent never asks the person. It returns each intent-bearing decision as a question: `{ key, question, options, recommended, why }`. The run stops, and `outcome.questions` holds each question with its `stage` and `slice`. The main session asks them and relaunches:

1. End the watch per [yolo/_commentary.md](yolo/_commentary.md).
2. Drop the questions that the store already answers:
   1. Write `outcome.questions` to `<wf-dir>/.draft/questions.json`.
   2. Run `wf.mjs decide drop "<projectRoot>" <slug> <wf-dir>/.draft/questions.json --json`. It prints `{ ask, answered }`.
   3. Put each question of `answered` into the relaunch `answered` list of step 6, with the decision id and the answer that the command prints. Do not ask it again.
3. Ask the questions of `ask` with the host question tool ([_gate-question.md](_gate-question.md)), at most four per call, with the `recommended` option first. When `ask` is empty, go to step 5.
4. Record each answer: `wf.mjs decide add "<projectRoot>" <slug> --kind answer --by person --key <key> --question "<question>" --answer "<answer>" --stage <stage>`, with `--slice <slice>` when the question has a slice. For several answers, write them to a JSON file as a list of `{ key, question, answer, by, stage, slice }`, and run `wf.mjs decide add "<projectRoot>" <slug> --file <file>` once. Keep the ids that the command prints. The command takes each answered key out of the open questions of the index. Do not also write the answers to `po-answers.md`: the decision store is their one record.
5. Repeat Step 0.4.
6. Relaunch with the Step 1 call and the same args, plus `answered`: one entry `{ key, stage, slice, question, answer, by: 'person', id }` per answer.

An answer reaches only the stage and the slice that asked it. A stage that stopped on several questions gets every answer. A slug-wide stage has no slice: give its answers no slice. Orientation skips each stage that is already terminal-clean, so the relaunch starts at the stage that asked. An answered stage settles in one of three ways:

- It settles the decision and continues.
- A verify accepts the slice with its failing or residual items on the answer. The slice passes, and the verify frontmatter records `accepted-by`.
- The answer needs a new plan or new code. The stage routes back to `plan` or `implement`, and the driver runs that stage and every later stage of the slice again with the answer. A slice routes back at most twice on one answer. The slug-wide review asks no question and never routes back.

## A held question during a run

A stage that reaches an intent-bearing decision can hold it and go on with the work that does not depend on it. The stage publishes the held question in `open-questions` of the index with `decide hold`, under its exact key. A look-in names each held question with its key ([yolo/_commentary.md](yolo/_commentary.md) C7). Before the stage returns, it looks for an answer again.

1. When a look-in names a held question, ask it with the host question tool ([_gate-question.md](_gate-question.md)).
2. Record the answer with `decide add` and the held key, exactly as `open-questions` shows it. Add `--stage` and `--slice` as the held entry shows them.
3. Tell the person that the stage reads the answer before it returns.
4. Do not stop or relaunch the driver. When the stage still returns the question, step 2 of the list above moves it to `answered`.

## Delegate mode

Launch with `delegate: true` when the `run-decisions` answer of Step 0.5 takes the recommended option, or when the person says that the run decides for them. Each stage then settles an intent-bearing decision by the option that it recommends, and records it with `--by delegate`. The run returns no questions. Before a stage settles a decision, it looks in the store for an answer to the same question in substance, also under another key, and reuses it.

**While a delegate run is live, report and do not ask**, per "A delegate run" of [yolo/_commentary.md](yolo/_commentary.md).

The end digest is one list and one question, per "A list of items" of [_gate-question.md](_gate-question.md). At the end of the run, run `outcome.delegate.digest` (`decide list --by delegate`).

1. Write the delegate decisions in chat as a numbered list, one line each: the key, what the run chose, and its effect.
2. Ask one question with the host question tool: "Reverse any of these?". The options are "None, keep them all (Recommended)" and, for up to 3 of the decisions with the largest effect, "Reverse <n>". The free-text answer can name other numbers.
3. For each reversal, run `decide add --by person` with the same key and the same `--slice` as the entry it reverses (`decide list` shows both): it supersedes the delegate entry. Then relaunch with the reversals in `answered`.

# Hot-patching the driver mid-run

1. Do not patch the plugin cache. A patch to the installed copy is invisible to the dev tree, and the next plugin update erases it. Patch the staged copy instead; the next launch overwrites it.
2. Write the patch down at `.ai/patches/<date>-<symbol>.md` in the repo you work on: the diff, the symptom, and the file and symbol that it targets.
3. Record it against the plugin dev tree: a task, an issue, or a note.

# Step 2 — Hand back to the user

When the workflow completes, end the watch per [yolo/_commentary.md](yolo/_commentary.md). Then read the returned `outcome` and write a chat summary. Lead with a short narrative paragraph, in prose with no bullets: which stages ran, the load-bearing decisions of each, the autonomous calls of the driver, and why the run ended. Then the anchors:

```
wf yolo complete: <slug> [<slice>]  (mode: <slug|slice> — <endpoint reached | hard stop at <stage>: <reason>>)

<Narrative paragraph.>

Prior driver: <omit when absent | outcome.priorDriver, worded per the staleness rule in _liveness.md — never "still running" unless the journal's recency supports it>
Branch: <outcome.branch — "created <target> from <base>" | "switched to <target>"; omit when yolo did not move the branch>
Stages run: <the per-slice sequence actually executed>
Autonomous decisions: <count + one-line gist, or "none recorded">
Charter: <omit when no checkpoint ran | from outcome.charterCheckpoints: all commitments honored | N at-risk (name them) | hard stop on a broken commitment (name it)>
Decisions: <outcome.decisionDigest: N total by class; intent-bearing count WITH its intentBearingGuarantee qualifier — "exact" → "intent-bearing escapes: 0"; "suspect" → "intent-bearing escapes: 0 (SUSPECT — M unclassifiable; review them)"; intentBearing>0 → should-have-been-a-stop escapes>
Residual findings: <none | N deferred/could-not-fix recorded in <artifact>>
Runtime-evidence deferrals: <none | outcome.runtimeEvidenceDeferrals: N — slice/AC + reason (+ probe receipt), in 00-index.md; /wf ship refuses until each is cleared by /wf probe or a re-verify in a capable environment>
Substantive failures: <omit when absent | outcome.substantiveFailures: N — slice + result. Defects, not deferrals; no /wf probe clears them>
Reconciled: <omit when absent | outcome.reconciled: N deferral classification(s) the recorded decisions or the index ledger classify differently than the driver derived — name each and the canonical source>
Clearing events satisfied: <omit when absent | outcome.clearingEventsSatisfied: N open deferral(s) whose clearing-probe reports the event HAS happened — run /wf probe <slug> to capture the evidence; nothing was cleared automatically>
Subagent errors: <omit when absent | outcome.subagentErrors: N recovered, M fatal — recovered errors changed no verdict, but the run does not claim zero>
Deferral pressure: <omit when absent | outcome.deferralPressure: N open, oldest since <date>, M repeat-of wall(s)>
Questions: <omit when absent | outcome.questions: N — key and question of each; ask them now per Questions>
Delegate decisions: <omit when not delegate mode | the numbered list of the end digest, one line each: key, what the run chose, its effect; then the one question "Reverse any of these?">
Accepted verify items: <omit when absent | outcome.acceptedResiduals: one line each — the slice, the item, the decision that accepted it, and what the review did with its residual finding>
Settled by a standing answer: <omit when absent | the entries that decide list --by standing prints: one line each — the question and the standing answer that settled it>
Contested decisions: <omit when absent | outcome.decisionDigest.contested: one line each — the slice, the stage and the doubtful decision that the stage settled because it can be undone inside the packet>
Next: <outcome.route — the routing command>
```

`Next` comes from `outcome.route`:

| The run ended at | `Next` |
|---|---|
| The endpoint, slice mode | The next slice of the roster: `/wf yolo <slug> <next-slice>`. After the last slice: `/wf yolo <slug>` (slug-wide) or `/wf ship <slug>` (per-slice). |
| The endpoint, slug mode | `/wf ship <slug>`. |
| A hard stop | The gate that fired and the command that resolves it, then `/wf yolo <slug> [<slice>]` to resume. |
| A stop request (`stoppedAt` is `stop-request`) | Where the run stopped, then `outcome.route`. |
| Questions (`outcome.questions` is not empty) | Ask them and relaunch per [Questions](#questions--the-stop-that-waits-for-the-person). Do not wait for the person to type the command. |

Rules of the hand-back:

- Always write it, also on a hard stop or an orientation block. The narrative says why the run stopped.
- Surface the autonomy in chat, because the person does not read the artifacts. Name each recorded assumption, each finding fixed or deferred, each accepted verify item, each case that a standing answer settled, and each contested decision. A record in an artifact does not inform the person.
- Surface charter drift and the decision digest. Call out `intentBearing > 0` by name. When `decisionDigest.intentBearingGuarantee` is `suspect`, say so in the same sentence as the zero.
- When `outcome.runtimeEvidenceDeferrals` is not empty, say that `/wf ship` refuses until each deferral is cleared.
- Report what ran. Do not imply that the workflow is further along than the artifacts show.
- Do not re-label an input. A verify that recorded an acceptance criterion as a substantive `fail` is reported under `Substantive failures:`, and never moved into the deferral list. Where the derivation of the driver disagrees with a recorded decision or the index ledger, the recorded classification wins, and the `Reconciled:` line names the disagreement.
- State the fate of the previous driver; do not infer it. When `outcome.priorDriver` says presumed dead, say presumed dead, and since when.
