# Campaign drive: the wave driver's own agents

The wave driver (`workflows/campaign-wave.js`) drives every unit of one wave in one Workflow run. Every campaign wave runs the wave driver, and yolo never drives a campaign unit. The stage agents follow the stage references (`plan.md`, `implement.md`, `verify.md`, `review.md`). The other agents of the drive follow this file: each prompt names its section. The boundary agents and the wave review follow [_boundary.md](_boundary.md).

`<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug. `<watch>` stands for `node "<pluginRoot>/scripts/yolo-watch.mjs"`. The prompt gives each command in full, with absolute paths.

- A bookkeeping agent runs only the commands of its prompt, in the order of the prompt. It edits no code.
- Run git as `git -C <path>`, with the absolute path that the prompt gives: the unit worktree, or the wave worktree.
- Each `<cmd>` command prints one JSON object. Return the fields that the prompt names, as the command printed them.
- A command that runs twice is safe. `unit <key> <state>` sets a state, `ask` returns the open question, and `needs add` does nothing for a matching entry.
- CAUTION: do not edit `ledger.json` by hand. Change the ledger only through `<cmd>`, because each command holds the ledger lock. A hand edit can overwrite the change of another agent.
- CAUTION: do not run `git add -A` or `git add .`. They stage work that belongs to another session. Stage each file by its path.
- CAUTION: do not push. The wave branch is pushed by handoff, after its verify passed.

The run goes in this order: the unit orients, the plans, the cross-unit reconcile, the early plan questions, the walks of the units, and then the boundary. The boundary starts only when every unit finished or moved out.

## Unit orient

The unit orient is read-only. It writes only its heartbeat lines, and the merge abort of step 9. It runs:

- at the start of the run, for each unit that is not finished and has no open question;
- as a resume orient, after the plan fan-out bookkeeping, and after the answer to a `stage` or `driver-fault` park;
- again, after the answer to an `orient` park, and after the answer to a question that was open at launch.

A unit that is `finished` at launch gets no orient. A unit with an open question at launch waits for the answer first.

1. Read `00-index.md` for its current state only. Do not read `index-history.jsonl` or `history/`. Parse the keys that the prompt names, the open `runtime-evidence-deferrals`, and the `charter`.
2. Read the unit's driver journal.
   - When the prompt gives the unit's run id, keep it. Report `lastSeq`: the largest `seq` of that run. A resume orient always has a run id, so `seq` counts on.
   - When the prompt gives no run id, mint one: the UTC time in ISO-8601 basic form plus the slug, for example `20261016T143005Z-<slug>`. Report `lastSeq` 0.
3. Read the roster `03-slice.md`. Capture every slice in roster order, with its status from `00-index.md`, its `depends-on`, and its `unit` and `source` when the roster entry has them. The driver keeps only the slices that the unit owns ([_order.md](_order.md), "Slice order").
4. Resolve the file convention: `suffixed` or `unsuffixed`.
5. Run the readiness gate and the design gate of the prompt. Do not run the design stage, because a person confirms the design.
6. Mark each stage of each slice `done`, `todo`, or `n-a`, by the rules of the prompt.
7. Run the clearing probe of each open deferral once. Do not clear the deferral, and do not edit `00-index.md`.
8. Run `git -C <worktree> branch --show-current`. When the branch is not the unit branch, return `ok: false` with the reason.
9. When `git -C <worktree> rev-parse -q --verify MERGE_HEAD` succeeds, a merge-in stopped half way. Run `git -C <worktree> merge --abort`, and report `mergeAborted: true`. The wait agent then merges again.
10. Append the start and end heartbeat lines to the unit's driver journal, with the run id of step 2.

When the orient returns `ok: false`, or returns nothing, the unit parks with kind `orient`.

## Park

A unit parks when it cannot continue without the person. Each park asks exactly one question, and the person chooses how the unit continues. The other units continue. A unit that waits on a parked unit keeps waiting, because the parked unit can continue when its answer comes.

1. Run `<cmd> unit <key> stopped --route "parked: <kind>: <reason>"`.
2. Run `<cmd> ask <id> --wave <n> --unit <key> --kind <kind> "<question>"`. When the prompt names a stage and a slice, the command also has `--stage <stage> --slice <slice>`.
3. Append one `waiting` line to the unit's driver journal, with the question id and the kind. The watch then reads the silence of the unit as by design.
4. Run `<cmd> journal park '<json>'`, with `run`, `wave`, `key`, `kind`, `question`, and `reason`.
5. Change nothing else. Return `ok` and a `note`.

The id of a unit question is `w<n>-<key>-<k>`, where k counts the questions of that unit from 1. `ask` with an open id and the same text returns the open question, so a park that runs twice asks once.

| Kind | Cause | The question asks |
|---|---|---|
| `stage` | A stage returned `hard-stop`, a stage gate failed, a verify did not converge, or a charter checkpoint found a broken commitment or a crossed veto. Also an implement that stopped three times for a wait that the driver does not hold | How the unit continues |
| `review` | A unit review returned `dont-ship`, or a blocker stayed open after the fix loop | Fix the open findings in a given way, or accept them as they are |
| `merge-conflict` | The merge agent aborted a merge-in, or `merge-in` failed for another reason | How the conflict is resolved |
| `contract` | The cross-unit reconcile, or the `crossUnit` report of a plan, found a shared change to a `provides` or `expects` line | Approve the change with the new line, or refuse it |
| `needs-cycle` | `needs add` refused an entry that closes a cycle | Which slice comes first, or which unit moves out |
| `deadlock` | Every walk that is not finished waits, no wait can become ready, and no question is open | Which wait is dropped, or which unit moves out |
| `moved-dependency` | A unit that this unit waits on moved out of the wave | Drop the wait and continue, or move this unit out too |
| `orient` | The unit orient did not pass | "Continue" when the cause is fixed, or move the unit out |
| `slug-stop` | A stop request with `scope: slug` and `then: hold` names the unit | Continue the unit, after the stop request is cleared |
| `driver-fault` | The walk of the unit threw | Continue from the disk state, or move the unit out |

A stop request with `then: move` parks nothing: the unit moves out with no question (see "Move out").

**The wave question.** The wave review asks a question of kind `wave-review`, with the id `w<n>-wave-<k>` ([_boundary.md](_boundary.md), "Wave review"). The question belongs to no unit. Run `<cmd> ask <id> --wave <n> --kind wave-review "<question>"`, then `<cmd> journal park '<json>'` with `key` null. Change nothing else.

## Move out

A unit moves out of the wave on an answer with `move`, on an answer that names the move, or on a stop request with `then: move`. Run `<cmd> unit <key> stopped --route "moved by the person: <reason>"`, and change nothing else. The unit stays `stopped`. Every wait on it rejects, and each unit that waits on it parks with kind `moved-dependency`.

## Resume actions

An answer reaches the driver from three sources: the waiter, the free check of a stage agent, and `slice-done`. The first source starts one resume. The driver ignores each later report of the same answer, and passes its id to the waiter in `--seen`.

When the answer has `move`, the unit moves out. Otherwise, the resume agent runs first:

1. Run `<cmd> unit <key> running`.
2. Run `<cmd> journal resume '<json>'`, with `run`, `wave`, `key`, `question`, and `by`.
3. When the prompt gives a third command, `<cmd> question <id> consumed`, run it. Change nothing else.

Then the driver takes the resume action of the park kind, below. For the kinds `contract`, `needs-cycle`, `deadlock`, and `moved-dependency`, a resolve agent reads the answer and follows the part of its kind. The resolve agent runs only the commands that the answer asks for. It returns `action` (`continue`, `replan`, or `move`), `dropped`, `added`, and `amended`.

A stage agent or a writer that runs again with the answer marks the answer consumed itself (see "Answered escalation"). A resolve agent runs `question <id> consumed` as its last command, except for `action: replan`. For each other answer, the resume agent runs it, so a new launch does not use the answer twice.

### stage

1. The resume agent runs.
2. A resume orient runs, with the same run id.
3. The stopped stage runs again, with the ANSWERED ESCALATION clause. For implement, the clause gives the start sha of the stopped implement. For verify, the clause goes to every round. When the answer accepts the slice with its failing items, the verify writes `accepted-by` in its frontmatter and returns `acceptedByPerson: true`, and the slice passes with no fix round. The orient counts that verify as done. When the answer to a verify or review stop changes the slice's design, its acceptance criteria or its plan, the stage changes no code, writes `route-back: plan` and returns `routeBack: 'plan'`. When the answer needs new code that the plan already describes, it writes `route-back: implement` and returns `routeBack: 'implement'`. An implement whose answer changes the design, the acceptance criteria or the plan leaves its work in place, writes `route-back: plan` and returns `routeBack: 'plan'`. The driver then runs that stage and every later stage of the slice again, and that stage gets the answer. A slice routes back at most twice in one run; the next stop parks as before.
4. The stage agent runs `<cmd> question <id> consumed` as its last command.

When the park came from a charter checkpoint, no stage runs again: the walk continues with the next slice. When the question was open at launch, its answer goes to the stage and the slice that asked.

### review

1. The resume agent runs.
2. When the driver holds the stored findings of that review in this run, only the review writer runs again. It gets the findings and the answer, and no new fan-out runs.
3. When the driver has no stored findings, for example after a launch again, the full review runs. Its writer gets the answer.
4. When the answer accepts a finding as it is, the writer records the person's override as a decision.
5. The writer runs `<cmd> question <id> consumed` as its last command. When the review gate clears, the unit continues.

### merge-conflict

1. The resume agent runs.
2. The wait agent runs `merge-in` again.
3. When `merge-in` conflicts again, the merge agent runs with the answer as the person's rule (see "Merge-in conflict").
4. When the merge agent resolved the conflict, the wait agent runs `merge-in` again and records the merge.

### contract

The prompt gives the shared pair in its context: the slice, the other unit, and the files.

- When the answer approves the change, run `<cmd> contract <key> amend --line <line key> --text "<new text>"`, with the key that the prompt gives. Return `action: continue` and `amended: true`.
- When the answer refuses the change, run no command. Return `action: replan`. The plan of the slice then runs again with the ANSWERED ESCALATION clause, and that plan agent runs `question <id> consumed`.
- When the answer keeps the contract and lets the slice wait for the other unit, run `<cmd> needs <key> add --from <key> --through <slice> --before <slice> --why "<text>" --by person`. Return it in `added`, with the `state` and `sha` of its `wait`, and return `action: continue`.
- When the answer moves the unit out of the wave, return `action: move`.

Record every wait that an answer gives with `needs add --by person`, also when the action is `replan`. The driver adds a wait only from a `needs add` result, so the driver and the ledger hold the same waits.

`contract amend` writes the context file of every unit that carries or expects the line. Each stage agent reads its context file fresh, so the change reaches the other units at their next agent.

### needs-cycle

- When the answer names the slice order, run `<cmd> needs <key> add --from <key> --through <slice> --before <slice> --why "<text>" --by person` for the entry that the answer gives. Return it in `added`, with the `state` and `sha` of the `wait` that the command printed. Return `action: continue`.
- When the answer moves the unit out of the wave, return `action: move`.

### deadlock

- When the answer drops a derived entry, run `<cmd> needs <key> remove --from <key> --through <slice> --before <slice>`. Return the entry in `dropped`, and return `action: continue`. The command leaves a drop record, so a relaunch does not add the wait again.
- `needs remove` drops only a derived entry. When the answer names a wait of a packet, run no command for that wait, and say so in `note`.
- When the answer moves the unit out of the wave, return `action: move`.

A wait that the answer does not drop stays open, and the unit waits again.

### moved-dependency

- When the answer drops the wait, and the wait is a derived entry, run `<cmd> needs <key> remove` for it. Return the wait in `dropped`, and return `action: continue`. The unit continues without the wait.
- When the answer moves the unit out too, return `action: move`.

### orient

The resume agent runs, then the unit orient runs again. When the orient fails again, the unit parks again with a new question.

### slug-stop

The session clears the stop request before it replies "continue". Otherwise the stop check of the next stage agent stops the unit again, and the unit parks again.

- When the answer starts with "continue", "yes", "resume", "go on", or "go", the resume agent runs and marks the answer consumed. Then the stopped stage runs again.
- Any other answer moves the unit out of the wave. An answer with `move` also moves the unit out.

### driver-fault

The resume agent runs, then a resume orient. The walk then starts again from the disk state, and skips each stage that is clean on disk. At the third fault, the walk ends with no park, and the outcome marks the unit `faulted`.

### wave-review

1. The wave review writer runs again with the answer. No resume agent runs, because the question has no unit.
2. When the answer names units to revert, the writer returns them in `revert`. The driver reverts each one by the "Revert search" step of [_boundary.md](_boundary.md). A unit that another unit merged in, or that carries a unit, cannot be reverted alone, so the wave asks again.
3. When the answer accepts a finding as it is, the writer records the person's override as a decision.
4. The writer runs `<cmd> question <id> consumed` as its last command.

## Answered escalation

The ANSWERED ESCALATION clause is in the prompt of an agent that runs again after an answer: the stopped stage, the review writer, the plan after a refused contract, and the stage that asked a question that was open at launch. The prompt gives the question id, the question, the answer, and `by`.

1. Settle the stopped decision by the answer.
2. Record the answer as a decision with class `intent-bearing`. Quote the answer, and set `by` to the value of the prompt.
3. For implement, the prompt gives the start sha of the stopped implement. Read `git diff <start sha>..HEAD` and `git status` for the work that it left. Revise or undo that work to fit the answer.
4. As the last command before your end heartbeat, run `<cmd> question <id> consumed`.

After step 4, `await` does not return the answer again, also after a launch again. The wave review writer follows the same rules for a wave question.

## Order

The pair kinds, the cross-unit reconcile, the derived needs, the merge notes, the wait agent, the slice order, and the sort of legacy waits are in [_order.md](_order.md).

## Early plan questions

A plan of the fan-out that stops (`hard-stop`, or a plan gate that fails) asks its question when the plan phase ends, not when the walk reaches the slice. The unit does not park: it stays `running`.

1. Run `<cmd> ask <id> --wave <n> --unit <key> --kind stage --stage plan --slice <slice> "<question>"` for each question of the prompt.
2. Run `<cmd> journal asked '<json>'`, with `run`, `wave`, `key`, `questions`, and `early: true`.
3. Do not run `unit <key> stopped`. Change nothing else. Return `ok` and a `note`.

While the question of slice S is open, the walk skips S and each slice that depends on S, and walks the next slice in the walk order. When the answer comes, the walk goes back to S, and the plan of S runs again with the answer. When every slice that is left waits for a question, the unit waits for the first answer.

## Merge-in conflict

The merge agent resolves one merge-in conflict in the unit's worktree. It takes a heavy slot, because it runs the tests of both units.

1. Read [_boundary.md](_boundary.md), section "Merge", and apply its conflict table to this one merge.
2. Read both context files of the prompt.
3. Run `git -C <worktree> -c rerere.enabled=true merge --no-ff <sha>`.
4. Resolve each conflict so that the intent of both units holds. When the prompt gives the person's rule, apply it.
5. When a conflict needs a product decision that neither context file settles, run `git -C <worktree> merge --abort`. Return `resolved: false` with the reason.
6. Run the tests of both units.
7. Commit the merge. Return `resolved: true` and the merge commit as `sha`.

After `resolved: true`, the wait agent runs `merge-in` again and records the merge. The rerere cache keeps the resolution, so the boundary merge replays it. After `resolved: false`, the unit parks with kind `merge-conflict`.

## Waiter

While one or more questions of the wave are open, or a unit waits on a derived wait, the driver keeps one waiter agent alive. The waiter judges nothing and writes nothing.

1. Run the `await` command of the prompt through Bash, with a Bash timeout of 600000 ms: `<cmd> await --wave <n> --max <seconds> --seen <id>,<id>`.
2. When the object has `"timeout": true`, run the same command again. Run it at most the number of times that the prompt gives.
3. Return at the first object without `timeout`:
   - `answered`, with its `answered` list, and its `needsChanged` list when it has one;
   - `needs-changed`, with its `needsChanged` list, when the object has no `answered` list;
   - `stopped`, with `kind`, `until`, and `reason`;
   - `paused`, with `until` and `reason` from its `paused` field;
   - `cancelled`.
4. After the last timeout, return `timeout`. Also return `calls`: the number of times that you ran the command.

`--seen` lists the question ids that the driver already has, so a seen answer does not return again. It also lists the held answers: an answer for an id that no question of this run holds, such as an unconsumed answer of an earlier run. A question that opens later with that id takes the held answer. `--max` is in seconds, at most 540. The driver gives 270 and at most 12 calls, so each wake finds the prompt cache. At each call, `await` appends a `waiter` line to the campaign journal, so the run stays live. Every 10 seconds, it reads the cancel marker, the campaign control file, the budget, and the answers of the wave that are not consumed.

| Result | What the driver does |
|---|---|
| `answered` | Starts one resume for each answer |
| `needs-changed` | Settles each wait that the person dropped, and arms each wait that the person added ([_order.md](_order.md), "Derived needs") |
| `stopped` or `paused` | Stops the run as a stop request or a usage pause |
| `cancelled` | Stops the run, when the run did not write the cancel marker |
| `timeout` | Starts a new waiter while questions stay open |

Three waiters in a row that return nothing stop the run. The open questions stay in the ledger for the next launch.

**Free checks.** The stop check of every stage agent runs `<cmd> await --wave <n> --max 0` and returns its `answered` list. `slice-done` returns the same list. An answer can then arrive before the waiter sees it.

**Cancel.** At the end of the run, while a waiter still runs, one agent runs `<cmd> await --wave <n> --cancel`. The command writes the cancel marker, and the waiter returns in 10 seconds.

## Slice write-back

A slice clears when its verify passed, and, for a `per-slice` unit, its review is clean. Then the slice write-back runs.

1. Read the frontmatter of the slice's verify artifact. Mirror `complete` only when it records `result: pass`. For any other result, skip steps 2 and 3, and say so in `note`.
2. In `00-index.md`, set the slice's entry in `slices[]` to `complete`. Refresh `progress` and `updated-at`.
3. In the roster file, set the slice's status to `complete` when verify did not. Do not change an entry that is `skipped`.
4. Change nothing else. Do not mark the workflow complete.
5. Last, run `<cmd> slice-done <key> <slice> --run <run id>`. Return its object as `sliceDone`.

`slice-done` commits the slug's records on the unit branch, without the run-time files. It records the cleared commit, and marks the waits on the slice `ready`. It also returns the budget and the open answers.

## Event agent

The event agent appends the driver's own decisions that no other agent appends, for example a `width` event when the heavy slots change. Run each `<cmd> journal <event> '<json>'` command of the prompt, in order, and change nothing else.

## Unit end

The unit end agent runs when the unit review is clean. When the setup answer names a recipe, the slug output runs first ([_boundary.md](_boundary.md), "Slug output"). A failed build parks the unit with kind `stage`, and the output builds again after the answer.

1. Append one `run-end` line to the unit's driver journal.
2. Pipe a one-paragraph run-end note into `<watch> note "<worktree>" <slug> --event run-end`. Write what the unit built, in product language.
3. Run `<watch> end "<worktree>" <slug>`.
4. Run `<cmd> slice-done <key> --final --run <run id>`. Return its object as `sliceDone`.
5. Run `<cmd> unit <key> finished --digest '<json>'`.
6. Change nothing else.

Keep this order. `slice-done --final` commits the driver journal and the commentary, so the run-end line and the note come first. It also marks each wait with `through: finished` as `ready`.

## Boundary setup

The boundary setup agent runs when the wave settles: every unit finished, or moved out of the wave.

1. Run `<cmd> wave <n> set boundary`.
2. Run `<cmd> worktree wave-<n> add`. Return its `path` as `worktree`.
3. Run `<cmd> merge-order <n>`. Return its `units` list as `units`, as the command printed it. Each unit has `key`, `slug`, `branch`, `worktree`, `tip`, `quiet`, and `through` for a carried unit.
4. When a command fails, return `status: failed`, with `error` quoting the failure.
5. Change nothing else.

A stop request with `scope: campaign`, or a pause, stops this step. A request with `scope: wave` or `scope: slug` does not stop it. Then the boundary steps of [_boundary.md](_boundary.md) run in the wave worktree.
