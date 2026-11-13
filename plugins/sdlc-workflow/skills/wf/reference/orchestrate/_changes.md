# Changes during a run (single source)

[../orchestrate.md](../orchestrate.md) cites this file for a contract that changes after its approval, for a list that the run takes from the campaign walk, and for the way back to the walk. `<o>` stands for `node "<skill-dir>/scripts/orchestrate.mjs"`.

## A contract change

No agent edits an approved outcome. A change is proposed, the person answers, and then the script applies it.

1. Write the changes to a JSON file:

   ```json
   { "changes": [
       { "kind": "add", "outcome": { "id": "OUT-AUTH-004", "says": "...", "kind": "behaviour", "proof": { "surface": "...", "evidence": "..." }, "source": "D-31" } },
       { "kind": "rewrite", "outcome": { "id": "OUT-AUTH-002", "says": "...", "kind": "measure", "proof": { "command": "..." }, "source": "D-32" } },
       { "kind": "drop", "id": "OUT-AUTH-003" }
     ],
     "list-revision": 7 }
   ```

   `list-revision` is there only when the change comes from a list that changed.
2. Run `<o> change propose <root> <slug> <file> --why "<why>"`. Until the person answers, the contract stays as it was.
3. Show the changes to the person in chat as one numbered list, and ask one question with the host question tool: approve, or refuse.
4. Run `<o> change approve <root> <slug> --words "<the person's words>"`, or `change refuse`.
5. After an approval:
   - A rewritten outcome is `open` again, also when its old form had passed.
   - Dispatch the scenario agent for each new or rewritten outcome of kind `behaviour` or `design`, and tell it to remove the scenarios of each dropped outcome.
   - A new outcome goes into a later milestone: write the milestones again.
   - A light-path contract that now has more than 2 outcomes moves to the full path. The command says so.
6. Work in flight. A builder can finish a unit for an outcome that the person then rewrites or drops. For a rewrite, write fix units. For a drop of built work, ask the person: revert it, or keep it. Revert only on a yes, with new revert commits, and never with a rewrite of history.

The person changes a contract from an instruction or an intake with `/wf orchestrate <slug> <the new words>`: write the words as changes, and follow the steps above.

## A source that changes

The person can reopen a brainstorm at any time, also while the run works on its list. The rules of "Reopening a list" in [../intake/brainstorm/_work.md](../intake/brainstorm/_work.md) hold as they are: the brainstorm session owns the board and the work packet files, each change of the list adds 1 to `list-revision`, and a started work packet is never rewritten.

1. **The run does not stop.** Builders go on with the outcomes that the change does not touch.
2. **`state` shows it.** Run `<o> state <root> <slug>` before each milestone and each validation round. When the list has a newer revision, the result has `source-changed`, with the path of `work/changes.md`.
3. **Each new entry of the changes file is a proposed contract change:**

   | Change in the list | Proposed contract change |
   |---|---|
   | A new work packet | `add` its outcomes |
   | A new decision about a work packet with no built unit | `rewrite` the outcomes of that work packet |
   | A new work packet of form `extension`, `fix` or `hotfix` on built work | `add` its outcomes. The passed outcomes of the built work keep their state. |
   | A cut of a work packet with no built unit | `drop` its outcomes |
   | A cut of built work (`scope: pending-cut`) | Ask the person: revert or keep. Nothing is removed before the answer. |

4. **One approval for one reopen.** Put all the changes of one reopen into one proposal, with the new `list-revision`, and follow "A contract change".

## Taking over a walk

`/wf orchestrate <slug>`, with the slug of the source workflow, can take a list that the campaign walk has started. `<o> take-over <root> <source-slug>-run <source-slug>` does these:

- It refuses while a driver of the walk is live on a work packet of the list. Tell the person to stop that run first.
- It marks the list as owned by this run. While the mark is there, `campaign.mjs next` refuses the list and names the run.
- It prints one proposed outcome for each acceptance criterion of each work packet, with the key of its work packet:
  - a `done` work packet gives outcomes with `"state": "passed"`;
  - a `built`, `open`, `written` or skipped work packet gives open outcomes. The code of a `built` work packet is on the list branch, so its outcomes usually pass at the first validation;
  - a `dropped` work packet gives none.

Give each proposed outcome its kind and its proof, interview the person on what the list left open, and write the contract file with the `source` that the command printed. The end proof runs each outcome on the final build, the passed ones of the walk included. So work that the walk approved is also proved against the running product.

## The way back to the walk

The list can return to the walk at a clean boundary: each work packet is either fully passed or untouched. The person asks for it with `/wf orchestrate <slug> hand back`, or in plain words.

1. Run `<o> hand-back <root> <slug> start`. It prints each work packet as `passed`, `started` or `untouched`. A work packet is started when a unit that serves one of its outcomes has a commit.
2. **Start nothing new.** The script refuses a builder unit for an untouched work packet.
3. **Finish what is started.** Go on with the build, the validation and the fix work of the started work packets only, until each of their outcomes is `passed`. When a milestone mixes outcomes of started and untouched work packets, write the milestones again with the untouched ones in a later milestone.
4. **Show what blocks.** A started work packet with a `held` or `unproven` outcome blocks the return. Show each one to the person in chat, with its question. The person answers the question, or tells you to revert the commits of that work packet. Revert with new revert commits, never with a rewrite of history. A reverted work packet whose outcomes are open again, with no commit left, is untouched: propose a rewrite of nothing, and record the revert as a decision of the person.
5. **Prove the boundary.** Run the end proof over the outcomes of the passed work packets, with the reserve set, and `<o> measure`.
6. Run `<o> evidence <root> <slug>`, then `<o> hand-back <root> <slug> finish`. It refuses while a work packet is started, or while a passed outcome has no pass of the end proof at the current commit. Then run the `campaign.mjs accept` command that it prints: each passed work packet becomes `done` in the walk, with the validation records of the run as its proof in place of the fidelity rows and the try-out, and the owner mark comes off.
7. Tell the person which work packets are done and which are untouched, and that `/wf campaign <source-slug>` goes on from the first work packet that is not done.
