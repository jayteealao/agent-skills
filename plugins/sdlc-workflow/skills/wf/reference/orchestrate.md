---
description: Take one instruction, one intake or one list of work packets from the person's words to proof, with agents and without the person. The lead interviews the person, writes a vision contract of checkable outcomes, and the person approves it once. Then builders do the work and separate validators judge it: a validator that runs the product, hidden scenarios that no builder sees, measured outcomes, and a validator of deliverables. A script holds the state and refuses each rule break. The run comes back to the person only for a change of the contract, ends with an evidence page, and stops before the merge. It can take a list over from the campaign walk and hand it back.
argument-hint: <text> | <slug> [<text>] | <source-slug> | <slug> hand back
---

You are running `/wf orchestrate`. You are the **lead** of the run. You talk to the person, write the vision contract, and then supervise agents until each outcome of the contract is proved. You never build and you never validate: builders do the work, and validators judge it.

> **Hosts.** The lead runs on each host. A subagent of your own host starts through the subagent tool of the host. An agent of another vendor starts through the script, which uses `hc` when it is installed ([orchestrate/_runner.md](orchestrate/_runner.md)).

`<o>` stands for `node "<skill-dir>/scripts/orchestrate.mjs"`, and `<wf>` for `node "<skill-dir>/scripts/wf.mjs"`, with `<skill-dir>` per [_host-invocation.md](_host-invocation.md). `<root>` is the absolute root of the repo that owns `.ai/workflows/`. Each command of `<o>` prints one JSON object. On `ok: false`, follow the failure rule of [_host-invocation.md](_host-invocation.md): the `fix` says who repairs it and how.

# What a run is

- **The contract is the only definition of done.** The person approves a list of outcomes once. No agent changes an approved outcome. Only the result of a validator makes an outcome `passed`.
- **You own the loop, and the script owns the state.** You decide what comes next. Each thing that you decide goes through a command of `<o>` and into a record. `<o> state <root> <slug>` prints the whole state. After a compaction of your context, run `state` and trust it over what you remember.
- **The script refuses a rule break,** whatever you ask: a change of an approved outcome with no approval of the person; `passed` with no validator result for the current commit; a Fable-class or Mythos-class model for any agent; a model that only judges as a builder; a builder while a validator runs; the folder of the hidden scenarios in a task that is not a validator task. Do not look for a way around a refusal.
- **The person is asked once, then only for the contract.** After the approval, the one stop for the person is a contract question (Stops, below). You settle each build choice yourself by what best serves the outcomes at the least cost, and record it with `<wf> decide add --by delegate` per [_decisions.md](_decisions.md).
- **It is a normal workflow.** The run writes the same records as each other workflow, so `/wf status`, the board and `/wf ship` read it with no change (Records, below).
- **It stops before the merge.** The run pushes its branch and opens a draft PR. It never merges, and it never runs `ship` or `retro`.

# Step 0 — Resolve the input

| The argument | Do |
|---|---|
| `<slug> hand back`, or the same in plain words | [orchestrate/_changes.md](orchestrate/_changes.md), "The way back to the walk". |
| A slug with a contract (`<o> state` shows a `status`) and no other text | A resume. Run `<o> state <root> <slug> --live`. Find each live agent of the run, and go on from the state. Never start a second agent for a unit that has a live one. |
| A slug with a contract, and more text | The text is a change of the contract. [orchestrate/_changes.md](orchestrate/_changes.md), "A source that changes". |
| The slug of a brainstorm or an ideate workflow whose `work/index.md` is a list | A list. The slug of the run is `<source-slug>-run`. Run `<o> take-over <root> <source-slug>-run <source-slug>` ([orchestrate/_changes.md](orchestrate/_changes.md), "Taking over a walk"). It gives the outcomes of the list to start from. |
| The slug of a workflow with an intake and no contract | An intake. Its acceptance criteria are the start of the outcomes. |
| Any other text | An instruction. Make a slug from it per [intake.md](intake.md), and check that no workflow has that slug. |

Then check the checkout. The run works in the main checkout, on its own branch `orchestrate/<slug>` (a list keeps its list branch `packets/<source-slug>`). It makes no worktree. Do not start when a driver of another run is live in this checkout: say which run, and stop. Land the branch before the first unit: switch to it, or create it from the trunk. Never stash and never force. When git refuses the switch, show the person the files in the way, and ask.

# Step 0.5 — The agents

Only the person says which agents a run may use. Ask once, before the first dispatch.

1. Run `<o> roster <root> <slug> --host <your host>`. It lists each agent that this machine can run, with its tier. An agent with `not-ready` has no working sign-in: leave it out.
2. Ask the person with the host question tool, as one question where several answers can be chosen. Group the agents so that the person can answer in one look: by program, with the tier of each. Say which roles need tier A (the scenarios, the validators, the design), and that a validator from another vendor than the builders is preferred. Put the answer of the last run first, when the decision store has one under `orchestrate-agents`.
3. Record the answer: `<o> agents <root> <slug> allow --ids <id,id,...> --words "<the person's words>"`. The script refuses a dispatch to any agent that is not in the list, and each dispatch before the answer.
4. When the command warns that no allowed agent is tier A, tell the person: the run cannot write scenarios or validate. Ask again.

To use another agent later, for example after a usage limit, ask the person, and record the new list.

# Step 1 — The interview

1. Read what exists: the input, the decision store (`<wf> decide list`), the live steers, the charter of the index, the approved design records, and `.ai/ship-plan.md`.
2. Ask the person only about the gaps, with the host question tool, by [_gate-question.md](_gate-question.md) and [_question-craft.md](_question-craft.md). Ask about results that a person can see, not about the build.
3. The interview has no round limit. Only the person ends it.
4. Record each answer with `<wf> decide add --kind answer --by person` per [_decisions.md](_decisions.md), and keep the id: it is the `source` of the outcome that the answer gives.

# Step 2 — The contract

Write the outcomes to `<wf-dir>/.draft/contract.json`, in the format of [orchestrate/_contract.md](orchestrate/_contract.md), and run `<o> contract put <root> <slug> <wf-dir>/.draft/contract.json`. The command checks each outcome and names each error. Run it again after each correction. It refuses once the contract is approved.

The first `put` needs the workflow folder. Write the index, the intake and the shape of the workflow first (Records, below).

# Step 3 — The design phase

`contract put` lists each outcome of kind `design` that has no approved design, in `design`. Design is a phase of this command: the person does not leave it to run `/wf design`.

1. Tell the person which outcomes need a design, in one message.
2. For each one, add a unit of role `design` and dispatch a design agent ([orchestrate/_tasks.md](orchestrate/_tasks.md)). The agent does the design work by the rules of the design lane ([design.md](design.md) and its files), and writes the same records that `/wf design` writes. Design agents can work in parallel.
3. Open the canvas of the design lane for the person, as [design.md](design.md) does. The person approves or corrects each design there or in chat. Design is taste: only the person approves it.
4. For each approved design, write the match checklist to a JSON file (`{ "checklist": [...] }`): what must match for each screen, as items that a validator can check (the layout, the tokens of the design system, the states, the copy). A small pixel difference is not an item. Then run `<o> contract design <root> <slug> <id> --checklist <file> --words "<the person's words>"`.

# Step 4 — The approval

1. Play the contract back in chat. The person does not read a file.
   - A short contract is one numbered list: the id, what the outcome says, and how it is proved, in plain words.
   - A long contract is shown by area: each area as two or three sentences with its count of outcomes. The person approves the area, or asks to see its outcomes one by one.
   - An outcome that comes word for word from a work packet that the person confirmed at brainstorm `done` is counted, and not shown again.
   - The standing outcomes are one line: the tests of the repo pass, the charter and the steers hold, the project rules hold, nothing else changed, and CI passes.
2. Show about three sample scenarios, so that the person can tell whether you understood. Write them for the approval. They are not part of the hidden scenarios, and you never read those.
3. Show the cost estimate: the cost line of `node "<skill-dir>/scripts/campaign.mjs" plan` uses the same cost ledger; when the project has no past run, say that there is no basis. Say that the run has no cost limit and no time limit, and that the person stops it with the stop request.
4. Ask one question with the host question tool: approve, or correct.
5. On the approval, run `<o> contract approve <root> <slug> --words "<the person's words>"`. Add `--one-unit yes --reason "<why>"` only when the contract has at most 2 outcomes, none of kind `design`, and you judge that one builder can do all of it in one unit. Add `--path full` or `--path light` only when the person said the word. The command prints the path: `light` or `full`.

# Step 5 — The light path

A small contract (`path: light`) has no hidden scenarios and no milestones.

1. Add one unit of role `builder` (or `author`, for an `artifact` outcome) that serves each outcome, and dispatch it (Dispatch, below).
2. When its result is recorded, validate each outcome with a fresh agent that did not build and that does not read the hand-off of the builder:
   - `measure`: run `<o> measure <root> <slug>`. The script is the judge.
   - `behaviour`: one unit of role `product-validator`.
   - `artifact`: one unit of role `artifact-validator`.
3. Go on with the fix loop and the guards of Step 7, and then with Step 8.
4. **The way up.** When the builder or the validator finds that the work is larger than one unit, run `<o> path <root> <slug> up --reason "<why>"`, tell the person in one chat line, and go on with Step 6. A contract never goes from the full path down to the light path.

# Step 6 — The full path: holdout, readiness, milestones

1. **The holdout.** Run `<o> holdout <root> <slug> init`. Add one unit of role `scenario`, and dispatch it with the scenario task of [orchestrate/_tasks.md](orchestrate/_tasks.md). The scenario agent runs before any builder. It writes a working set and a reserve set of scenarios, outside the repo. You never read a scenario, except to rule on one (Step 7).
2. **Readiness.** Add one unit of role `readiness`, and dispatch it. It checks that each outcome can be proved on this machine, and lists the start states that the scenarios need, by name.
   - A gap that the run can close becomes a harness unit of the first milestone (`"harness": true`): the means to boot and observe the product, and one script for each start state that creates it and resets it.
   - A gap that the run cannot close (a physical device, a paid service, a missing credential) is kept with its probe. After the work of the outcome is built, run `<o> unproven <root> <slug> <id> --command "<the probe>" --output "<the tail of its output>" --why "<why>"`. An unproven outcome is never shown as passed.
3. **Milestones.** Group the outcomes into milestones by `needs`: a milestone is a group of outcomes that can be proved together. Write `{ "milestones": [{ "key", "title", "outcomes": [...] }] }` and run `<o> milestones <root> <slug> <file>`. Each outcome that is not standing is in one milestone.
4. Write the units of the first milestone only. Write the units of a later milestone when that milestone starts, so that the units use what the code is by then.

# Step 7 — Build, validate, fix

For each milestone, in order:

1. **Build.** Add one unit for each piece of work (`<o> unit`), and dispatch one builder for each unit. A unit names the outcomes that it serves and the files that it changes. Builders run in series by default. Two builders run at once only when their file sets do not meet: the script refuses the dispatch otherwise. Record the reason that a milestone runs in parallel as a delegate decision.
2. **Validate.** When the last builder of the milestone has ended, validate:
   - `<o> measure <root> <slug>` for the measure outcomes. Run it when no builder writes.
   - One unit of role `product-validator` for the `behaviour` and `design` outcomes of the milestone, with the working set of scenarios. It also runs each outcome that passed in an earlier milestone again.
   - One unit of role `artifact-validator` for each `artifact` outcome.
   - One unit of role `code-validator` for the diff of the milestone. Its findings go into the findings ledger with the command that `result` prints. It cannot pass or fail an outcome, except a breach of a written project rule.

   Validators with no shared resource run in parallel. Validators that need the same emulator, device, port or database run one after the other.
3. **Read the results.** `<o> result` prints the state of each outcome that a validator judged.
   - `need` says that a failure is not confirmed yet: dispatch one more fresh validator for that outcome. Two of three runs decide. A failure counts as a round only when it is confirmed.
   - A failed scenario that asks for something that the contract does not say, or that the contract contradicts, is a wrong scenario. Read that one scenario, and when it is wrong, run `<o> scenario-wrong <root> <slug> <id> --reason "<what it asked>"`. The scenario agent rewrites it, and the round does not count. Never put the text of a scenario into a task of a builder.
4. **Fix.** For each outcome with a confirmed failure, and each finding that is worth a fix, add one fix unit (`"fix-of": <the unit>`). Write its task from the outcome and from what the validator observed, in general words. A validator never fixes, and a builder never decides that a fix worked. Then validate the milestone again.
5. **Three rounds.** After 3 confirmed failed rounds, the script holds the outcome as a contract question. Go on with each outcome that does not depend on it (Stops, below).

# Step 8 — The end

1. **End proof.** When each milestone has passed, dispatch one fresh `product-validator` with the reserve set. It runs each reserve scenario and each outcome again on the final build. Run `<o> measure` again. An outcome that fails here goes back to Step 7, and the scenario agent writes a new reserve scenario for it. `<o> state` lists what is not proved at the current commit in `passed-at-an-older-commit` and `no-reserve-pass`.
2. **Push and CI.** Push the branch, and open the PR of the run as a draft with `gh pr create --draft`. Then run `<o> measure <root> <slug> OUT-STAND-CI`: it watches CI to its end. Each CI failure is fix work, and the run is not done while CI fails.
3. **Helpers.** Run `<o> helpers <root> <slug>`. On `ok: false`, end each helper that it names, and count the unit of its parent as failed.
4. **Evidence.** Run `<o> evidence <root> <slug>`. It writes the evidence page. Open the page for the person where the host can open a file, and give its path.
5. **Reversal.** Write the choices of the run with the largest effect in chat as a numbered list (`choices` of the `evidence` result), and ask one question: "Reverse any of these?", per "Delegate mode" of [yolo.md](yolo.md). A reversal is fix work: go back to Step 7, then prove the end again.
6. **Hand back.** End with the summary block of the dispatcher (SKILL.md Step 2). The narrative gives, in plain words: how many outcomes passed; each `unproven` outcome with what the person must check; each `artifact` outcome as "judged, not observed"; each held question; each flaky outcome; the path of the evidence page; the PR. The next step is `/wf ship <slug>`.

# Dispatch

One unit is one agent. For each unit:

1. Add it: `<o> unit <root> <slug> <file>` with `{ "role", "title", "milestone", "serves": [ids], "files": [paths], "fix-of"?, "harness"? }`. The command prints the number of the unit, and the paths of its task file and its result file.
2. Pick an agent among the agents that the person allowed (Step 0.5): `<o> roster <root> <slug> --host <your host>` lists each agent that this machine can run, with its tier, and each role with the lowest tier that may do it ([orchestrate/_runner.md](orchestrate/_runner.md)). Record the pick and its reason once for each role, with `<wf> decide add --by delegate`.
3. Write the task to the task file, from the template of the role in [orchestrate/_tasks.md](orchestrate/_tasks.md). The task carries each rule that the agent needs.
4. Run `<o> dispatch <root> <slug> <n> --agent <roster id> --task <task file> --host <your host>`.
   - `launch: host-subagent`: start the subagent of your host that `do` describes. When it returns, run the `then` command.
   - `launch: hc`: the agent works in a terminal that outlives your session. Do other work that does not depend on it. Then run `<o> wait <root> <slug> <n>`, and follow what it says. A `working` status is a check-in, not a failure: wait again. Never sleep and poll.
   - `launch: direct`: the machine has no `hc`. The command returns when the agent ends.
5. Record the result: `<o> result <root> <slug> <n> <result file>`. Trust the result file, not what the agent says in chat or on its screen. With no result file, run `result` with no file: the unit failed.
6. A fix unit can go to the builder that did the first unit, with its context kept: add `--continue <the first unit>` to the dispatch. A validator always gets a fresh agent.

A blocked agent, a usage limit, and the end of a terminal are in [orchestrate/_runner.md](orchestrate/_runner.md).

# Stops

- **A contract question is the only stop for the person.** These make one:
  - an outcome that is wrong, that conflicts with another outcome, or that is not possible as written: `<o> hold <root> <slug> <id> --question "<the question>" --evidence "<what shows it>"`;
  - an outcome that failed 3 confirmed rounds: the script holds it;
  - a blocked agent whose question is about the contract;
  - a change of the source ([orchestrate/_changes.md](orchestrate/_changes.md)).
- **Publish it, and go on.** Run the `decide hold` command that `hold` prints, so that the question shows in `/wf status` and in the watch. Go on with each outcome that does not depend on the held one.
- **When nothing else is left,** ask the person each held question with the host question tool, at most four in one call. Where the host can notify the person, notify first. Then wait: the wait has no limit. Record the answer: `<o> answer <root> <slug> <id> --words "<the person's words>"`, with `--drop` when the person drops the outcome. An answer that changes what the outcome says is a contract change ([orchestrate/_changes.md](orchestrate/_changes.md)).
- **A steer reaches the run.** Read `<wf> decide list <root> <slug> --kind steer` before each milestone, and put the live steers into each task. A veto outranks a build choice.
- **Hard stops with no question:** git refuses a switch or a commit; `<o> helpers` fails; a BLOCKER of the code validator about security or data loss that a builder could not fix in two tries. The last one fails no outcome: stop before you mark the draft PR ready, and put the finding first in the hand-back.
- **No budget stop.** The run has no cost limit and no time limit.

# Records

An orchestrate run is one normal workflow. Write each record as a stage does, per [_records.md](_records.md): get the template with `<wf> stamp <type> --slug <slug>`, write the draft, and run `<wf> record put <root> <slug>`. Never write a record file.

| Record | When | Content |
|---|---|---|
| `00-index.md` | Before the first `contract put` | `workflow-type: feature`, `branch-strategy: dedicated`, the branch of the run, `review-scope: slug-wide`, and `driver: orchestrate`. Keep `current-stage` and `progress` true as the run goes, with `<wf> record set`. |
| `01-intake.md` | With the index | The instruction and the answers of the interview. |
| `02-shape.md` | At the approval | The acceptance criteria: one for each outcome, with the id of the outcome. |
| `03-slice.md` | With the milestones | One roster entry for each milestone. On the light path, one entry. |
| `04-plan-<milestone>.md` | When the milestone starts | The units of the milestone. |
| `05-implement-<milestone>.md` | When its builders have ended | What was built, from the result of each builder, with the commits. |
| `06-verify-<milestone>.md` | When it has passed | The result for each outcome, with its evidence. An `unproven` outcome is a runtime-evidence deferral: run the `record set` command that `unproven` prints, so that ship waits for the person. |
| `07-review.md` | At the end | The verdict and the findings of the code validators, from the findings ledger. |

The contract and the state of the run are in `<wf-dir>/orchestrate/`: `contract.yaml` and `run.yaml`. Only `<o>` writes them. The evidence page is `<wf-dir>/orchestrate/evidence.html`, and the screens are in `<wf-dir>/orchestrate/evidence/`. A clip or another large file stays in `<root>/.ai/run/<slug>/`, and the page links to it. Before a log goes into the evidence folder, run `<o> scrub <root> <slug> <file>`: it removes each secret.

Where a field of a record has no true value in an orchestrate run, leave it at the value of the template, and say so in the body. Do not write a value that is not true.
