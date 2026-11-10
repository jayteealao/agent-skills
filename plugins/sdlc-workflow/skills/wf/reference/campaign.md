---
description: Walk the list of one brainstorm or ideate folder, one work packet at a time, on one branch. A script gives the next action of the walk, one at a time; the agent does it and asks the person. The walk shows the plan and asks how far to go, opens each build work packet, stops for the design stage when a design is not settled, slices the work packet, runs the yolo driver, reads the decision fidelity table of the review, and pauses for a try-out when the person can try the work packet. A defect goes into the findings ledger of the work packet, and a review run fixes it; it never becomes a new slice. The person can skip a blocked work packet and let a later one run ahead. When the list is finished, the walk hands off one PR for the list. The first call on a folder with an old campaign ledger migrates it first.
argument-hint: <source-slug>
---

You are running `/wf campaign <source-slug>`, the **walk**. The source is a brainstorm workflow or an ideate workflow. Its `work/index.md` (`type: list`) is the **list**: one work packet file `work/<packet-slug>.md` (`type: packet`) per work packet, in strict order. A brainstorm `done` or an ideate pick writes the list ([intake/brainstorm/_work.md](intake/brainstorm/_work.md)). Each work packet is one normal workflow, with its own wf-dir beside the wf-dir of the source: `<wf-dir>/../<packet-slug>/`. The walk builds the work packets in list order, one work packet at a time, on the **list branch** `packets/<source-slug>`.

> **Hosts.** The action `launch-driver` launches the yolo driver through the host's workflow runtime ([yolo.md](yolo.md) Step 1). Every action runs on every host.

## The rules of the walk

- **The scope is confirmed.** The person confirmed the goal, the scope, the acceptance criteria, `ux-impact`, `try-out` and the stack of each work packet at brainstorm `done`. Do not ask about them again. Do not re-word a carried decision.
- **The state is on disk.** The state of a work packet is the `state` field of its work packet file: `written`, `open`, `built`, `done`, or `dropped`. A skip of the person is its `skipped` field. The walk keeps no other state, so a new call starts again with `next`.
- **The script writes the exact things, and it chooses the next action.** Change the state of a work packet, a skip, the list branch, the end branches and `base-branch` only through the script. Do not edit a work packet file by hand. Do not choose an action yourself.
- **The person decides, in chat.** The walk asks at each stop, each set of fidelity rows, each try-out and each set of conflicts. It never guesses past one. The person does not read the artifacts: everything that the person must know or decide is in chat. Ask about a list of items per "A list of items" of [_gate-question.md](_gate-question.md).

A work packet has a key (`key`, the name on the board) and a slug (`packet-slug`, the name of its workflow folder). Each command takes the key, and it also accepts the slug. `<cmd>` stands for `node "<skill-dir>/scripts/campaign.mjs"`, with `<skill-dir>` per [_host-invocation.md](_host-invocation.md). `<root>` is the absolute root of the repo that owns `.ai/workflows/`, resolved as `yolo.md` Step 0.3 does. Each command prints one JSON object. On `ok: false`, follow the failure rule of [_host-invocation.md](_host-invocation.md), and ask before you go on.

## The loop

The argument is the source slug. When it is empty, list the folders whose `work/index.md` has `type: list`, and ask which.

Run `<cmd> next "<root>" <source-slug>`. It prints one action: `{ ok, action, why, command?, args?, ask?, tell?, then }`. It changes nothing. Do what the section of its `action` below says. Then run `then.next`, and do the next action. Stop when the action is `end` or `hand-off`, and the person has answered what it asks.

- `command` is the exact command line of a script call. Run it as it is.
- `args` are the inputs of a subagent or of the driver.
- `ask` holds the questions to ask now ([`ask`](#ask--the-questions-of-the-walk)).
- `tell` is the text for the person at a stop. Write it in chat.
- `then.next` carries the answers of this call: how far to go (`--how-far`, `--since`) and the run-decisions answer (`--run-decisions`). Fill in the placeholders that `ask-how-far` leaves, and keep them on each later call.
- `recordHowFar` is the command that records the how-far answer under the key `campaign-how-far`. Run it once when it is there. `ask-how-far` gives the last answer as `howFar.answer`: put it first in the how-far question.
- `skipped` lists the work packets that the person skipped. Mention them in the report of the call.

When the person wants to stop the call, run `then.next` with `--end`.

## The actions

### `migrate`

The source has an old campaign ledger. When `phase` is `report`, read [campaign/_migrate.md](campaign/_migrate.md) in full and run the migration. When `phase` is `finish`, read the same file and run its steps 8 and 9.

### `open`

Run `command`. It writes the workflow folder of a build work packet from its work packet file.

### `ask-how-far`

A new call. Do these, in this order:
1. Run `shipReady`, the listing form of Step R0 of [_ship-plan-readiness.md](_ship-plan-readiness.md). Tell the person each gap as a person task. A gap does not stop the walk here: the walk stops on a gap only at ship.
2. Run `command`, the plan of the walk (`<cmd> plan`). It is compact. Show the person these, not the whole list:
   - The totals: the work packets left, the build work packets, and the slices left (`totals`).
   - What will stop for the person: each kind of stop in `totals.stops`, with its count and its work packets.
   - The next work packets (`next`): each with its title, its form, its stops and its slices.
   - The cost line (`totals.costLine`), with its basis: the number of past runs (`cost.runs`) and `cost.perSlice`. When `cost.perSlice` is null, give `cost.note` instead of a number. When `cost.excluded` is set, say how many past runs were left out, and why (`cost.excludedWhy`).

   Do not show `rest`, one line for each other work packet, unless the person asks. `full` gives every work packet in full.
3. Show the work packets of `needDesign`, each with `/wf design <packet-slug>`. Tell the person that a later work packet can be designed between work packets, in this checkout, on the list branch. Design work in another worktree or on another branch does not reach the walk.
4. Ask these questions with one call of the host question tool ([_gate-question.md](_gate-question.md)):
   - How far: the next work packet only; a number of work packets (free text gives the number); the whole list.
   - The run-decisions question of [yolo.md](yolo.md) Step 0.5. Put `runDecisions.answer`, the answer of the last call, first.
   - The budget question, when "When to ask" of [_check-budget.md](_check-budget.md) says to ask it.

Then fill in `then.next`: `--how-far next`, `--how-far all` or `--how-far <the number>`, and the run-decisions answer in `--run-decisions`. Each launch in this call reuses that answer: `launch-driver` gives the command to record it in the work packet's workflow with `decide add --kind steer --key run-decisions`. Do not ask it again in this call.

### `route-stop`

The form is `investigate`, `discover`, `rca` or `task`. Write `tell` ("Type `<route>`"), and stop. The mode starts the workflow `<packet-slug>` from the work packet file (`intake.md`, "List work packet"). When the person drops the work packet, run `<cmd> close "<root>" <source-slug> <packet-key> dropped`. This works for a work packet of any form.

### `close`

The workflow of a routed work packet is complete or closed. Run `command`. It sets the state `done` in the work packet file and on the work packet in the board.

### `design-stop`

Show `why` in plain words. Write `tell`, and stop. The design stage reads the carried design thoughts of the work packet ([design/_carried.md](design/_carried.md)).

### `land`

Run `command`. It switches the checkout to the list branch, or creates the branch from the trunk. On the stacked shape (below), it lands on the layer of the work packet. It never stashes and never forces. When git refuses the switch, show the person the files in the way, and ask. When the result has `base.state: diverged`, ask the person to reconcile the trunk with its remote.

### `start`

Run `command`. It sets `base-branch` of the work packet to the newest end branch on the list branch, or to the trunk. For a migrated work packet, it first commits, rebases and merges the work of the unit branch into the list branch. When the result has `conflict`, ask the person to resolve the conflict by hand. When the result has `refused`, git refused the merge commit with no conflict, for example by a commit-msg hook of the repo. Show the error, and ask the person to merge by hand with a message that the repo accepts.

### `ask-carried`

Each question of the entry is an open item that the person left to this build in the brainstorm, at an area close or at done, as "Ask me before the slice". Write them in chat as a numbered list, each with its key and its question, and ask per "A list of items" of [_gate-question.md](_gate-question.md). Record each answer with `decide add --kind answer --key <the key> --stage slice` per [_decisions.md](_decisions.md). Put the question and the person's words in `--question` and `--answer`. The command takes the key out of `open-questions` of the index.

### `slice`

Dispatch one subagent per [_subagents.md](_subagents.md). Its prompt tells it to run the stage in `slice.md` on `args.slug`, with these policy answers:
- The scope, the acceptance criteria, `ux-impact` and the stack are confirmed. Do not ask about them again.
- The decision store settles the open items of the work packet: an answer of the person, or a steer that leaves the choice to the build. For a steer, choose the option that best fits the acceptance criteria, and record the choice as an assumption.
- Cut one slice per capability: a group of mechanisms that verify checks together. The small outcomes of the capability become the steps of its plan. A slice has fewer than 40 steps. Do not size a slice by lines.
- Aim for 10 slices. When the work packet needs more than 14, write them and return a warning.
- Step 6c (review scope): `slug-wide`, recorded with `by: standing default`.
- When `02c-craft.md` exists, map each slice to its screen keys, and write `ux-impact` into each slice record ([design/_lane.md](design/_lane.md), "One duty per stage").
- An intent-bearing choice, for example a slice that drops or narrows an acceptance criterion, is a stop. Return it as a question.

When the subagent returns the warning, tell the person the slice count. The person can split the work packet later. When the subagent returns a question, ask the person, then dispatch the subagent again with the answer.

### `launch-driver`

When the action has `command`, run it first: it records the run-decisions answer of this call. Then launch the driver on `args.slug` in slug mode, as `/wf yolo <packet-slug>` does: [yolo.md](yolo.md) Steps 0.3 to 0.5, then Step 1 onward. Then run `then.next` while the run works.
- **The delegate digest does not hold the walk.** In a delegate run, the hand-back of yolo.md Step 2 ends with the digest question "Reverse any of these?". In the walk, do not ask it at the end of the run. Write the numbered list of the digest in chat. `next` gives the digest as an entry of kind `digest` when the walk asks it. Until the person answers, each delegate decision stands.
- A stop request stops the run at its next stage boundary, as in yolo.

### `wait`

A driver runs in this checkout. Wait for the run to end, and hand back per yolo.md Step 2. Then run `then.next`.

### `driver-stop`

The last run stopped (`stoppedAt`, `reason`). Write `tell`, and follow the person's answer. To go on, resume the driver on `args.slug` per yolo.md "Resuming", as `launch-driver` does. The person can also skip the work packet (below).

### `built`

The run reached its endpoint. Run `command` at once. It also pushes the work, so CI runs at the end of each work packet. It opens the PR of the list as a draft the first time, or again when the stored PR merged or closed (`publish` in the result). Report `publish` in one line. It is never a question: a push or a PR that fails is a note to the person, not a stop.

### `ask` — the questions of the walk

The script decides when the walk asks the person. Ask every entry of `ask` in one call of the host question tool. Each entry names its work packet with `key` and `slug`. Its `kind` says how to write it:
- `fidelity`: the rows of `## Decision Fidelity` in `07-review.md` that the person has not approved. Only a live `approval` entry in the decision store of the work packet approves a row ([_decisions.md](_decisions.md)). Write the `rows` in chat as a numbered list. Each row gives the key, the carried decision word for word (`decision`), the verdict and the evidence. Then ask one question: "Approve all (Recommended)" or "Fix some". With "Fix some", the free-text answer names the numbers to fix; approve every other row.
- `try-out`: the work packet has `try-out: yes`. Tell the person how to run the work packet: the build command, the screen or the command to open, and each acceptance criterion of the entry (`acceptance`) to try, word for word. Ask one question: the work packet works, or describe the problem.
- `digest`: the `entries` of the delegate digest, as the end digest of [yolo.md](yolo.md) "Delegate mode" writes them, with its question "Reverse any of these?".
- `ahead`: every work packet that may run waits for a skipped one. Show the person each skipped work packet with its reason. Then show each candidate with its title and its `why-here` note, word for word: the reason it comes after the work packets before it. Ask which candidates may run ahead of the work packets in `waitsFor`. Never answer for the person. Record the answer with `then.record`, with the keys that the person named. When the person names none, run `then.next` with `--end`.

Record each answer:
- **Approve a row.** Record the approval in the work packet's workflow with `decide add --kind approval --key <decision-key> --answer approved` per [_decisions.md](_decisions.md). Put the question and the person's words in `--question`.
- **The try-out works.** Record it with `decide add --kind try-out --key try-out --answer works` per [_decisions.md](_decisions.md). Put the question and the person's words in `--question`.
- **A digest answer.** Record each reversal with `decide add --by person`, with the same key and the same `--slice` as the entry it reverses. Then run `<cmd> digest "<root>" <source-slug> <packet-key> --answer "<the person's words>"`. A reversal is a problem to fix.
- **A row to fix, a try-out problem, a reversal.** A defect never becomes a new slice, and the walk does not reopen the roster. Write every problem of this answer into one `<wf-dir>/../<packet-slug>/.draft/found.json`, one entry each: `{ "findings": [ { "key": <a stable key>, "dimension": "intent-fidelity", "severity": "HIGH", "file": <the file, when known, else null>, "issue": <the problem text>, "fix": <what must change> } ] }`. The key is the decision key of the row, or `try-out-<n>`. For a try-out problem, use the dimension `try-out`. Run `node "<skill-dir>/scripts/wf.mjs" findings add "<root>" <packet-slug> <wf-dir>/../<packet-slug>/.draft/found.json --source review --dimensions <the dimensions>` once. Never run `findings add` twice for one dimension in one answer: each call is a run of its dimensions, and it resolves the open findings of those dimensions that it does not list. `next` then gives `fix-run`.

When the problem is new scope and not a defect of this work packet, and the source is a brainstorm, the person can add it to the list as a new work packet with `/wf intake brainstorm <source-slug> add <text>` instead. Then record the approval or the try-out with the person's words.

### `fix-run`

Launch the driver on `args.slug` as `launch-driver` does, in review-findings mode: `reviewFindings: true` in the args of the workflow runtime, or `--review-findings` on `wf.mjs drive`. The driver skips every built slice. The slug-wide review fixes each finding, one step and one commit, and stops. It does not scan its own fix commits.

### `done`

Run `command`. It refuses unless the work packet is `built`, the fidelity table has no unapproved row, and the try-out is recorded for a work packet with `try-out: yes`. It refuses with `busy: true` while the driver of a later work packet runs in this checkout, or while the checkout has changes outside `.ai/`: run `then.next` after that run ends. It merges the trunk, moves the end branch `packets/<source-slug>--<packet-key>`, sets `base-branch` back to the trunk, and pushes. On the stacked shape it runs `gh stack sync` instead of the trunk merge; a `conflict: stack` result names the rebase steps for the person. When the result has `conflict: trunk` or `refused: trunk`, show the error, and ask the person to merge the trunk by hand. Report the work packet in one line. When the PR of the list merges later, the close questions of all its work packets come as one question.

### `end`

Ask what `ask` lists, and record the answers. When an answer needs a fix, run `then.next`: it gives `fix-run` first. Then report the work packets of `doneThisCall`, the next work packet with its step (`nextPacket`), the skipped work packets, and the work packets of `needDesign`. End with `tell` ([_chat-return.md](_chat-return.md)).

### `hand-off`

Every work packet is `done` or `dropped`. Ask what `ask` lists, and record the answers. When an answer needs a fix, run `then.next` first. Then hand off per "Ship" (below), and write `tell`.

## Skip a work packet

Only the person skips a work packet, in chat. A design that is not settled, a form that the person runs, a run that stopped or a conflict can block a work packet. When the person says to go on without it, record the skip with the person's words: `<cmd> skip "<root>" <source-slug> <packet-key> --reason "<the person's words>"`. Never skip a work packet on your own.

- A skipped work packet keeps its state. `next` never picks it, and it asks none of its questions.
- A later work packet runs only when the person lets it run ahead. The list is a strict order: work packet N may use what work packets 1 to N−1 built. The script cannot see what a work packet uses, so `next` asks the person (the entry `ahead`).
- A work packet that runs ahead reviews from the end branch of the last done or built work packet before it. The skipped work packet, when it runs later, reviews from the newest end branch on the list branch.
- A skipped `built` work packet holds nothing: its work is on the list branch.
- `skip` refuses while the list branch holds work of the work packet that is not built. Then the person finishes the work packet, or drops it and reverts its commits by hand.
- `skip` refuses on the stacked shape: each layer starts from the layer below it.
- `<cmd> unskip "<root>" <source-slug> <packet-key>` takes the skip back. It refuses while a work packet that runs ahead has work that is not built.

## Ship

The PR phase of ship needs all of these:
- each work packet is `done` or `dropped`. A skipped work packet is neither;
- no work packet has an unapproved fidelity row;
- the open-RIM gate of the PR phase passes for each work packet. `/wf ship` runs that gate.

At `done`, the `base-branch` of each work packet is the trunk again, so ship works as on any workflow. Before ship, run `node "<skill-dir>/scripts/wf.mjs" record set "<root>" <packet-slug> index handoff-lead=<the slug of the last done packet>` for each done work packet.

**One PR for the list.** This is the default. Tell the person to type `/wf ship packets/<source-slug>`. The batch mode of its PR phase packages every slug on the list branch in one PR. In the PR body, list each work packet with its title, the result of its acceptance criteria, and its decision fidelity table. Then ship stops at its go/no-go gate and ships the PR as usual.

**The draft PR.** The first `built` opens the PR of the list as a draft, and each later `built` and `done` pushes to it, so CI runs at the end of each work packet. The PR phase of ship finds the draft (`isDraft` of `gh pr view --json`), writes its real title and body, and marks it ready with `gh pr ready` before it watches CI ([handoff.md](handoff.md) Procedure step 7, T5).

**Stacked PRs.** When `.ai/ship-plan.md` has `pr-shape: stacked`, each build work packet is one layer of a gh-stack stack, and its end branch `packets/<source-slug>--<packet-key>` is the layer. The first layer starts from the trunk (`gh stack init`), and each later layer from the layer below (`gh stack add`). No trunk merge enters a layer: `done` runs `gh stack sync`, which rebases the stack onto the trunk and pushes with `--force-with-lease`, and `built` and `done` run `gh stack submit --auto`, which opens one draft PR per layer. Ship each layer as its own PR, bottom first, or merge the whole stack with `gh stack merge <top pr-number> --yes --<method>`; that merge is all-or-nothing. The list branch `packets/<source-slug>` is not used. CAUTION: the stacked shape rewrites the layers at each sync. Do not commit to a layer from another checkout while the walk runs.

**An early handoff.** The person can hand off between work packets. Then the handoff packages the done work packets only: a work packet with no implemented slice is not ready, and the batch mode skips it. After that PR merges, what happens to the list branch depends on how it merged. After a merge commit, the old commits are on the trunk, so the list branch goes on: the next `done` merges the trunk into it, and the next PR shows only the new work. After a squash or a rebase merge, the old commits are not on the trunk, so the next PR must not start from the old list branch. Then ask the person whether to delete the list branch and the end branches of the shipped work packets, and delete them only on a yes. `land` then creates the list branch again from the trunk, and `start` uses the trunk as the base, because no end branch is left.

WARNING: do not delete a remote branch, a tag or a release without the person's yes. These deletions cannot be undone.

After the last ship, tell the person that `/wf retro packets/<source-slug>` runs the batch retro over every work packet on the list branch.
