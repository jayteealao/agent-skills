---
description: Walk the list of one brainstorm or ideate folder, one work packet at a time, on one branch. The walk asks how far to go, opens each build work packet, stops for the design stage when a design is not settled, slices the work packet, runs the yolo driver, reads the decision fidelity table of the review, and pauses for a try-out when the person can try the work packet. A problem goes back into the work packet as a new slice. When the list is finished, the walk hands off one PR for the list. The first call on a folder with an old campaign ledger migrates it first.
argument-hint: <source-slug>
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `/wf campaign <source-slug>`, the **walk**. The source is a brainstorm folder or an ideate folder in `.ai/workflows/`. Its `work/index.md` (`type: list`) is the **list**: one work packet file `work/<packet-slug>.md` (`type: packet`) per work packet, in strict order. A brainstorm `done` or an ideate pick writes the list ([intake/brainstorm/_work.md](intake/brainstorm/_work.md)). Each work packet is one normal workflow, `.ai/workflows/<packet-slug>/`. The walk builds the work packets in list order, one work packet at a time, on the **list branch** `packets/<source-slug>`.

> **Hosts.** Step 10 launches the yolo driver, which is Claude Code only. Under Codex or pi, step 10 runs `/wf auto <packet-slug>` with the person in place of the driver ([_host-invocation.md](_host-invocation.md)). Every other step runs on every host.

## The rules of the walk

- **The scope is confirmed.** The person confirmed the goal, the scope, the acceptance criteria, `ux-impact`, `try-out` and the stack of each work packet at brainstorm `done`. Do not ask about them again. Do not re-word a carried decision.
- **The state is on disk.** The state of a work packet is the `state` field of its work packet file: `written`, `open`, `built`, `done`, or `dropped`. The walk keeps no other state, so a new call resumes at step 1.
- **The script writes the exact things.** Change the state of a work packet, the list branch, the end branches and `base-branch` only through the script. Do not edit a work packet file by hand.
- **The person decides.** The walk asks at each stop, each fidelity row, each try-out and each conflict. It never guesses past one.

A work packet has a key (`key`, the name on the board) and a slug (`packet-slug`, the name of its workflow folder). Each command takes the key, and it also accepts the slug. `<cmd>` stands for `node "<skill-dir>/scripts/campaign.mjs"`, with `<skill-dir>` per [_host-invocation.md](_host-invocation.md). `<root>` is the absolute root of the repo that owns `.ai/workflows/`, resolved as `yolo.md` Step 0.3 does. Each command prints one JSON object. When `ok` is `false`, show the `error` to the person in plain words, and do not continue to the next step.

## Step 0 — Resolve, and migrate an old campaign

1. The argument is the source slug. When it is empty, list the folders whose `work/index.md` has `type: list`, and ask which.
2. Run `<cmd> status "<root>" <source-slug>`. When the result has `migrate: true`, run the migration below. When the result has `migrate: finish`, run steps 8 and 9 of the migration. Then go to step 1.

### The migration

The source folder has an old campaign ledger (`work/campaign/ledger.json`) and no list. Its units are the old form of work packets. The person types no command for the migration.

1. Run `<cmd> migrate "<root>" <source-slug> report`. It writes `work/migration.md`. It changes no branch and deletes nothing.
2. When the result has `live: true`, stop. Tell the person that an old wave run is live, and that it must stop first.
3. When `blocked` is not empty, stop. List each wave PR of `blocked` that is not merged, and tell the person to merge it first. Otherwise the review and the PR of the first work packet include the earlier waves.
4. Show the report to the person in plain words: the shipped units, the in-flight units with their branches and uncommitted files, the units that are not started, the old worktrees, and the stray folders.
5. Run `<cmd> migrate "<root>" <source-slug> apply`. It brings the records of each in-flight unit home to the main checkout. It makes each shipped unit a `done` work packet and each in-flight unit an `open` work packet, and it puts the in-flight work packets first, in their old unit order.
6. For each entry of `records` with `conflicts`, show the person both versions: the main version, and the worktree version under `work/campaign/records/conflicts/`. Ask which version to keep, and write the kept version in the main checkout.
7. Regroup the units that are not started into work packets, with the person, in this session. For a brainstorm source, follow "Regroup" in [intake/brainstorm/_work.md](intake/brainstorm/_work.md). For an ideate source, follow "Regroup" in [intake/ideate.md](intake/ideate.md). The regroup confirms the whole list with the person and runs `<cmd> write`. The person can drop any work packet, an in-flight work packet too. A dropped in-flight work packet keeps its branch unmerged, and its carried decisions go back into the regroup.
8. Run `<cmd> migrate "<root>" <source-slug> finish`. It moves the old ledger folder to `work/archive/campaign/` and each stray folder to `work/archive/stray/`. It removes each old campaign worktree that is not the worktree of an in-flight work packet, with the guarded remove.
9. Show the person each worktree of `refused`, with its reason. The person decides what to do with it. When the entry has `ignoredAtRisk: true`, show its `ignored` files. When the person says yes, run `<cmd> remove-worktree "<root>" <source-slug> <path> --allow-ignored`.

CAUTION: do not run `git worktree remove --force` on an old campaign worktree. It deletes through a `node_modules` junction into the files that the junction points to. Remove an old worktree only with `<cmd> remove-worktree "<root>" <source-slug> <path>`.

## The walk

1. **Read the list.** Run `<cmd> status "<root>" <source-slug>`. The result gives `packets` (each work packet with its key, slug, form, state and try-out), `current` (the first work packet that is not `done` or `dropped`, with `step`, the next step of the walk for it), `needDesign` (the build work packets whose design is needed and not settled), and `finished`.
2. **Ask how far to go.** Ask this once per call, per [_gate-question.md](_gate-question.md): the next work packet only; a number of work packets (free text gives the number); the whole list. Count the work packets that reach `done` in this call against the answer.
3. **Open the written work packets.** For each build work packet with `state: written`, in list order, run `<cmd> open "<root>" <source-slug> <packet-key>`. Run `status` again. Show the person the work packets of `needDesign`, in list order, each with `/wf design <packet-slug>`. Tell the person that a later work packet can be designed between work packets, in this checkout, on the list branch. Design work in another worktree or on another branch does not reach the walk.
4. **Choose the next step.** When `finished` is `true`, or the count of step 2 is done, go to step 15. Otherwise act on `current.step`:

   | `current.step` | Do |
   |---|---|
   | `route` | Step 5. |
   | `open` | Step 3. |
   | `design` | Step 6. |
   | `slice`, `yolo` | Step 7, then step 8. A resumed work packet runs `start` again; `start` changes nothing already done. |
   | `fidelity` | Step 7, then step 11. |
   | `try-out` | Step 7, then step 12. |
   | `done` | Step 7, then step 14. |

5. **A work packet that is not a build work packet.** The form is `investigate`, `discover`, `rca` or `task`. Stop. Tell the person to type `current.route`, as "Type `<route>`". The mode starts the workflow `<packet-slug>` from the work packet file (`intake.md`, "List work packet"). When the `00-index.md` of that workflow has `status: complete` or `status: closed`, run `<cmd> close "<root>" <source-slug> <packet-key> done`. When the person drops a work packet, of any form, run `<cmd> close "<root>" <source-slug> <packet-key> dropped`. The command sets the state in the work packet file and on the work packet in the board. Then go to step 1.
6. **The design is not settled.** Stop. Show `current.reason` in plain words. Tell the person to type `/wf design <packet-slug>`. When the work packet file has `design-form: design-direction`, tell the person to type `/wf design direction from <source-slug>` first. The design stage reads the carried design thoughts of the work packet ([design/_carried.md](design/_carried.md)). When the person returns, go to step 1.
7. **Land on the list branch.** Run `<cmd> land "<root>" <source-slug>`. It switches the checkout to `packets/<source-slug>`, or creates the branch from the trunk. It never stashes and never forces. When git refuses the switch, show the person the files in the way, and ask.
8. **Start the work packet.** Run `<cmd> start "<root>" <source-slug> <packet-key>`. It sets `base-branch` of the work packet to the end branch of the build work packet before, or to the trunk for the first build work packet. For a migrated work packet, it first commits, rebases and merges the work of the unit branch into the list branch. When the result has `conflict`, stop. Ask the person to resolve the conflict by hand, then run `start` again.
9. **Slice the work packet.** When `03-slice.md` is absent, dispatch one subagent per [_subagents.md](_subagents.md) that follows [slice.md](slice.md) with these policy answers:
   - The scope, the acceptance criteria, `ux-impact` and the stack are confirmed. Do not ask about them again.
   - Cut one slice per capability: a group of mechanisms that verify checks together. The small outcomes of the capability become the steps of its plan. A slice has fewer than 40 steps. Do not size a slice by lines.
   - Aim for 10 slices. When the work packet needs more than 14, write them and return a warning.
   - Step 6c (review scope): `slug-wide`, recorded with `by: standing default`.
   - When `02c-craft.md` exists, map each slice to its surfaces and board keys, and write `ux-impact` into each slice file ([design/_lane.md](design/_lane.md), "One duty per stage").
   - An intent-bearing choice, for example a slice that drops or narrows an acceptance criterion, is a stop. Return it as a question.

   When the subagent returns the warning, tell the person the slice count, and continue. The person can split the work packet later. When the subagent returns a question, ask the person, then dispatch the subagent again with the answer. When the person already ran `/wf slice <packet-slug>`, skip this step.
10. **Run the yolo driver.** Launch the driver on the work packet slug in slug mode, as `/wf yolo <packet-slug>` does: [yolo.md](yolo.md) Steps 0.3 to 0.4, then Step 1 onward. Wait for the run to end, and hand back per yolo.md Step 2.
    - When the run stopped (`outcome.stoppedAt` is set), show the stop to the person and follow the answer. Resume the driver per yolo.md "Resuming". Do not continue to the next work packet.
    - When the run reached its endpoint, run `<cmd> built "<root>" <source-slug> <packet-key>`.
    - A stop request stops the run at its next stage boundary, as in yolo.
11. **Read the fidelity table.** The review rubric `intent-fidelity` writes `## Decision Fidelity` in `07-review.md`: `| Key | Verdict | Evidence | Approval |`, with the verdict `honored`, `narrowed` or `dropped` (`review/intent-fidelity.md`). `status` gives the rows that the person has not approved in `current.rows`: each row whose verdict is not `honored`. Only a line in `po-answers.md` approves a row. The script does not read the Approval column. When `current.reason` says that the table is absent or has no row for a carried key, go to step 10: the review runs again. For each row of `current.rows`, ask the person, up to four rows per batch: approve it, or fix it. Give the key, the carried decision word for word, the verdict and the evidence in the question text.
    - **Approve.** Append the line `- <decision-key>: approved — <the person's words>` under `## Decision fidelity approvals` in the work packet's `po-answers.md`. Add the heading when it is absent.
    - **Fix.** Go to step 13 with the row as the problem text.
12. **Pause for the try-out.** This step runs only for a work packet with `try-out: yes`: `ux-impact` is not `none`, or the work packet adds a user-facing command. An engine or platform work packet gets no pause. Tell the person how to run the work packet: the build command, the screen or the command to open, and each acceptance criterion of the work packet file to try, word for word. Ask one question: the work packet works, or describe the problem.
    - **Works.** Append the line `- try-out: works — <the person's words>` under `## Try-out` in the work packet's `po-answers.md`. Add the heading when it is absent. Go to step 14.
    - **A problem.** Go to step 13 with the person's words.
13. **Fix as new work.** Run the extension mode of intake on the work packet with the person: `/wf intake <packet-slug> <problem text>` (`intake/extend.md`). It adds a slice to the roster of the work packet. Run `<cmd> reopen "<root>" <source-slug> <packet-key>`, so that a new call also builds the slice. Then go to step 10. The driver plans, implements and verifies the new slice, and it runs the slug-wide review again over the whole work packet. When the problem is new scope and not a defect of this work packet, and the source is a brainstorm, the person can add it to the list as a new work packet with `/wf intake brainstorm <source-slug> add <text>` instead. Then record the approval of step 11 or the try-out of step 12 with the person's words.

    NOTE: a relaunch with only a steering entry changes no code: only the review runs again.
14. **Close the work packet.** Run `<cmd> done "<root>" <source-slug> <packet-key>`. It refuses unless the work packet is `built`, the fidelity table has no unapproved row, and the try-out is recorded for a work packet with `try-out: yes`. Then it merges the trunk, moves the end branch `packets/<source-slug>--<packet-key>` to HEAD, and sets `base-branch` back to the trunk. When the result has `conflict: trunk`, stop. Ask the person to merge the trunk by hand, then run `done` again. Report the work packet in one line, run `status` again, and go to step 4.
15. **End the call.** When `finished` is `true`, hand off (below). Otherwise report the work packets that reached `done` in this call, the next work packet with its step, and the work packets of `needDesign`. End with "Type `/wf campaign <source-slug>`" ([_chat-return.md](_chat-return.md)).

## Handoff and ship

The handoff needs all of these:
- each work packet is `done` or `dropped`;
- no work packet has an unapproved fidelity row;
- the open-RIM gate of `handoff.md` passes for each work packet.

At `done`, the `base-branch` of each work packet is the trunk again, so handoff and ship work as on any workflow. Before the handoff, set `handoff-lead: <the slug of the last done packet>` in the `00-index.md` of each done work packet.

**One PR for the list.** This is the default. Tell the person to type `/wf handoff packets/<source-slug>`. The batch mode packages every slug on the list branch in one PR. In the PR body, list each work packet with its title, the result of its acceptance criteria, and its decision fidelity table. Then `/wf ship packets/<source-slug>` ships it as usual.

**Stacked PRs are not built.** `.ai/ship-plan.md` has no key that asks for stacked PRs for a list, so every list hands off as one PR. An end branch also holds the trunk merge of `done`, so a PR between two end branches would show trunk changes as the work packet's own.

**An early handoff.** The person can hand off between work packets. Then the handoff packages the done work packets only: a work packet with no implemented slice is not ready, and the batch mode skips it. After that PR merges, ask the person whether to delete the list branch and the end branches of the shipped work packets, and delete them only on a yes. A squash merge leaves the old commits off the trunk, so the next PR must not start from the old list branch. Step 7 then creates the list branch again from the trunk, and `start` uses the trunk as the base, because no end branch is left.

WARNING: do not delete a remote branch, a tag or a release without the person's yes. These deletions cannot be undone.

After the last ship, tell the person that `/wf retro packets/<source-slug>` runs the batch retro over every work packet on the list branch.
