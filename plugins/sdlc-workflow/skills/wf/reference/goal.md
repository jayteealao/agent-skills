---
description: Write a goal contract for one slug and hand it to the host goal, which carries the turns. A script, goal.mjs check, prints the evidence and a GOAL line; only that line decides that the goal is met. A human gate parks the goal. Kinds are lifecycle (the slug to handoff-ready), optimize (the metric loop of an optimize slug) and proofs (named commands that exit 0).
argument-hint: <slug> [objective] | <slug> resume|status|clear
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `/wf loop goal <slug> …`. A goal is an objective that the host keeps pursuing over many turns, until a judge says that it is done. The host carries the loop: its own continuation, pause, resume and budget. `/wf` owns the evidence. `goal.mjs check` runs the rule of the goal and prints the evidence, then one last line:

- `GOAL: MET`: the objective is met.
- `GOAL: NOT-MET <reason>`: work remains; the reason names the next unit.
- `GOAL: BLOCKED <reason>`: a person must act, or the cap is used. The goal is impossible until then.

The condition that the host judge reads says to trust only that line. A claim without that output is not evidence.

> **Hosts.** Every host writes the same contract and runs the same `check`. Each host arms its goal its own way. `goal.mjs arm` prints the way for the host that it names, and says when a host has no host goal.

## What a goal is, and is not

- **The goal does not answer gates.** A human gate ends the goal ([_autonomy-guards.md](_autonomy-guards.md), "Goal park"). The person answers the gate, then runs `/wf loop goal <slug> resume`. This is why `yolo` and the campaign waves do not use goals: they answer gates by written policy, and they own their own loop.
- **The goal adds no stop hook.** The host goal is the only continuation. A second continuation would compete with it.
- **The contract lives in the slug.** `goal.md` and `goal/checks.jsonl` stay when the host goal is cleared, so `resume` arms the same contract again.

| `kind` | `check` prints `GOAL: MET` when | Chosen when |
|---|---|---|
| `lifecycle` | every selected slice has a clean verify and the review that the scope needs is clean, by the stop rules of `auto` ([auto.md](auto.md)) | the default |
| `optimize` | `optimize.mjs status` prints `complete` or `finished`. A stopped loop prints `BLOCKED` with the stop reason | the slug has `workflow-type: optimize` |
| `proofs` | every proof command exits 0 | the person names commands that must pass, for example "CI green and coverage at 80" |

`check` counts its runs. Past `max-checks` (default 30) it prints `GOAL: BLOCKED budget`, because the host goal of one host has no cap of its own.

## Step 0 — Resolve

1. The first token is the slug. When it is empty, list the active workflows from `.ai/workflows/INDEX.md` and ask which one. When `.ai/workflows/<slug>/00-index.md` does not exist, end the run: *"No workflow `<slug>`. Start it with `/wf intake <description>`."*
2. Resolve `projectRoot` (the repo root that owns `.ai/workflows`) and `<skill-dir>` per [_host-invocation.md](_host-invocation.md).
3. Every contract change goes through the goal script. Every command except `check` prints one JSON object:

   ```
   node "<skill-dir>/scripts/goal.mjs" <command> "<projectRoot>" <slug> ...
   ```

   Do not edit `goal.md` or `goal/checks.jsonl` by hand.
4. The second token picks the action:

| Second token | Do |
|---|---|
| none | When `goal.md` exists, run `status` and show it. Otherwise, arm a new contract (Step 1). |
| `resume` | Run `status`. When `parked.gate` is set, confirm that the person answered that gate. Then arm again (Step 1). `arm` keeps the objective, the kind and the proofs. |
| `status` | Run `status`. Show the state, the check count against `max-checks`, the last verdict, and the parked gate. |
| `clear` | Run `clear`. Show its `host` line, which says how to clear the host goal. |
| any other text | The text is the objective. Arm a new contract with it (Step 1). |

## Step 1 — Arm

1. Pick the kind from the table above. For `proofs`, ask the person for each proof command, per [_gate-question.md](_gate-question.md). Each proof is one shell command that runs from the project root and exits 0 when the proof holds.
2. Run `arm`:

   ```
   node "<skill-dir>/scripts/goal.mjs" arm "<projectRoot>" <slug> --host <host> [--objective "<text>"] [--kind <kind>] [--proof "<command>"]... [--max-checks <n>]
   ```

   `--host` takes one value for every host: `claude-code`, `codex`, or `pi`. Write one `--proof` for each proof command.
3. On `ok: false`, show the error and end the run.
4. Arm the host goal with `arm.how`, `arm.instruction` and the `condition` text:
   - `goal-command`: show `arm.command` in a fenced block. Say what happens next, from `arm.instruction`. Do not try to run the command yourself.
   - `create_goal`: call the host's goal tool with the condition as the objective. When the host's goals feature is off, show `arm.instruction` and end the run.
   - `in-session`: run the loop of Step 2 in this session, one stage at a time, until `check` prints `GOAL: MET` or `GOAL: BLOCKED`.
5. End the arming turn with the `wf loop goal complete` summary. The host goal starts the first worker turn.

## Step 2 — The worker's turn

While `goal.md` has `state: armed`, do these steps in each turn:

1. Do the next unit of work:
   - `lifecycle`: run the stage that `goal.mjs lifecycle` names in `next`, as `auto` runs it ([auto.md](auto.md)).
   - `optimize`: run one trial, as `optimize.mjs status` names it ([optimize.md](optimize.md), "Without the driver").
   - `proofs`: change the code toward the objective. Keep the change inside the scope of the slug.
2. When a `/wf` gate needs the person, run `park`, per [_autonomy-guards.md](_autonomy-guards.md), "Goal park". Do not answer the gate.
3. At the end of the turn, run `check`:

   ```
   node "<skill-dir>/scripts/goal.mjs" check "<projectRoot>" <slug>
   ```

   The output of `check` is the last tool output of the turn, so the judge reads it. Do not shorten or restate the output.
4. When `check` prints `GOAL: MET` in this turn, complete the host goal where the host has a model-side goal tool. Do not complete it on any other line.
5. When `check` prints `GOAL: BLOCKED`, say what blocks the goal and what the person does next, then end the turn.

## Step 3 — Hand back

End with the dispatcher's summary block (SKILL.md Step 2). The narrative says the kind, the objective, the check count against `max-checks`, the last `GOAL:` line, and the next step: the arming line to submit, the gate to answer, or `/wf handoff <slug>` when the lifecycle goal is met.

## The files

| File | Writer | What |
|---|---|---|
| `goal.md` | the goal script | The contract: `objective`, `kind`, `proofs`, `max-checks`, `arming`, `armed-at`, `host`, `state`, `parked` |
| `goal/checks.jsonl` | the goal script | One line for each `check`: the arming, the verdict, the reason, and the evidence |
| `goal/arm.json` | the goal script | The arming request that the mod reads at the end of the turn, and its state |
