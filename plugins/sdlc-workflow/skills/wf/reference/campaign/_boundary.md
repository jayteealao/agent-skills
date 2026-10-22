# Campaign boundary: the agents between the drives

The wave driver (`workflows/campaign-wave.js`) runs these steps as agents, after every unit of the wave finished or moved out. Each agent reads this file and follows the one section that its prompt names. The paths in the prompt are absolute. Run git as `git -C <projectRoot>`, or as `git -C <wave worktree>` when the prompt names the wave worktree. The agents of the drive itself follow [_drive.md](_drive.md).

- The campaign folder is `.ai/workflows/<brainstorm-slug>/work/campaign/`. An agent writes only the files that its section names.
- An agent never edits `ledger.json`, the board, a packet, or a slug's artifacts. The campaign session records the outcome with `campaign.mjs wave <n> record`.
- CAUTION: do not run `git add -A` or `git add .`. They stage work that belongs to another session. Stage each file by its path.
- CAUTION: do not push. The wave branch is pushed by handoff, after its verify passed.

## Slug output

1. Check out the slug branch, in its worktree when it has one. When a tracked file has uncommitted changes, do not stash and do not force: return `status: failed` with the reason. Untracked files, such as the watch state, do not block.
2. Run the recipe's `build-cmd`. When it fails, return `built: false` and the last 30 lines of its output as `failure`. A build failure is a verify failure for the slug.
3. Copy each path or glob of the recipe's `artifacts` to the output folder.
4. The build label is `wave-<n>.<slug>+<first 7 characters of the branch tip sha>`. Write it to `LABEL.txt` in the output folder, with the recipe's `try` text below it.
5. Return `built: true`, the `label`, and the output folder as `path`.

## Merge

1. Check out the wave branch in the wave worktree, `.scratch/campaign/<run-id>/wt/wave-<n>`. The boundary setup agent adds it with `campaign.mjs worktree wave-<n> add` before the merge ([_drive.md](_drive.md), "Boundary setup"); add it with `git -C <projectRoot> worktree add <path> <wave branch>` only when it does not exist. Never remove a worktree: the campaign session does that, through its guarded `remove`. The main checkout stays on the trunk, where the rolling prepare writes. When a tracked file has uncommitted changes, return `status: failed`. Untracked files do not block.
2. Merge each slug branch in the order that the prompt gives, one at a time: `git -C <checkout> -c rerere.enabled=true merge --no-ff <slug branch> -m "<the slug's change in product language>"`. The boundary setup agent computes the order with `campaign.mjs merge-order <n>`: a unit that another unit merged in (`merge-in`) merges before that unit.
   - The rerere cache is in the common git folder, which every worktree shares. A conflict that `merge-in` resolved earlier replays here, so do not resolve it a second time. Check the replayed files, then finish the merge.
   - The prompt can name carried units. A carried unit is inside its carrier's branch at its own tip. Do not merge a carried unit. Report it as merged, with the carrier's merge commit sha.
3. On a conflict, apply this table. Then either finish the merge, or run `git merge --abort` and record that slug as not merged.

| File | Rule |
|---|---|
| `.ai/workflows/INDEX.md` | Regenerate the conflicting rows from each slug's `00-index.md`. Never merge the rows by hand. |
| The brainstorm's board, `01-brainstorm.md`, and the packets | Abort this slug's merge. A yolo run never writes them, so a change there is a fault to report. |
| `.ai/solutions/`, `.ai/ship-plan*`, `.ai/design/*` | Abort this slug's merge. yolo does not write them. |
| `design/boards.json`, `design/boards/`, `design/r*/`, `design/source/`, `design/sketches/` of any workflow | Abort this slug's merge. A drive never writes the boards (`design/_boards.md`). |
| `design/captures/` of any workflow | A change is allowed: a drive writes its verify captures there. On a conflict, keep the slug branch's version. |
| Code | Resolve the conflict only when both sides keep their tests green and no `provides` line changes. Run the tests of both slugs after the resolution. Otherwise abort this slug's merge. |
| A file of a merge note | The prompt lists the merge notes as EXPECTED CONFLICTS. Apply the rules of [_order.md](_order.md), "Merge notes": regenerate a generated file once, renumber a version, convert a row to the newer format. A conflict that needs a product decision: abort this slug's merge. |

4. When the prompt names the CAMPAIGN CONVENTIONS, the slugs regenerated no generated file. After the last merge, regenerate each generated file whose input a merged slice changed, once, with the project's own generator. Commit each regenerated file by path.
5. Append one `merge` event per slug, as the prompt says, with `result` `merged` or `stopped`.
6. Return `merged` (in merge order, each with the merge commit sha) and `notMerged` (each with the reason).

## Quiet-window checks

A drive defers a timed check with `kind: quiet-window` when the machine was too busy for the check's own limit (`reference/verify/_deferrals.md`, "The quiet-window deferral"). The boundary runs these checks after every drive of the wave ended, before the merges, one unit at a time. No drive runs, so the machine is quiet.

1. Check out the slug branch, in its worktree when it has one. Do not change any tracked file.
2. Run each check that the prompt gives, in the order of the prompt. The prompt takes them from the slug's `00-index.md` `runtime-evidence-deferrals`: each entry with `kind: quiet-window` and no `cleared-by`.
3. Run the check's `command` once. Measure the time from the start to the end.
4. Compare the result and the time with the check's `limit`. The check passes only when the command exits with 0 and the measured value is in the limit.
5. For each passed check, set `cleared-by: boundary wave-<n> <UTC time>` on its entry in `00-index.md`, and commit the file on the slug branch by path.
6. Return `status` (`complete`, or `failed` when a command could not run), `passed` (true only when every check passed), and `results`: one `{ slice, command, limit, measured, passed }` per check.

A failed check makes the unit `needs-fix`, as a failed verify does. The boundary does not merge that unit.

## Wave verify

1. Find the project's test commands: the commands that the merged slugs' latest `06-verify*.md` files ran, and the CI workflow's test job. Run each once on the wave branch tip.
2. When a command fails and the prompt allows fix rounds, apply the verify rules of `reference/verify.md`: diagnose, apply the smallest fix, commit it on the wave branch by path, and run every command again. Use at most the number of rounds that the prompt gives. Before you call a failure an environment wall, climb the env-remediation rung of `reference/runtime-adapters/_ladder.md`.
3. When the prompt allows no fix round, fix nothing.
4. Return `green`, `rounds`, the `commands` you ran, and the failing output tail as `failures`.

## Trial merge

The trial merge runs while other units of the wave still walk, each time a unit finishes. It finds a fault of the merged wave before the boundary. It never changes a unit branch or the wave branch, and it pushes nothing.

1. Use only the scratch worktree that the prompt names. When it does not exist, add it detached at the wave base. When it exists, reset it hard to the wave base, and clean it.
2. Merge each branch of the prompt, in its order, with rerere on. On a conflict that rerere does not replay, abort that merge, list the unit and its files in `conflict`, and continue with the next branch.
3. Run the wave verify commands once (see "Wave verify", step 1). Fix nothing. When the prompt gives ports, set them for each command: the units walk on their own ports.
4. Return `merged`, `conflict`, `green`, the `commands` you ran, and the failing output tail as `failures`.

A red trial with no conflict, after a green trial without the new unit, names that unit. The driver gives the unit one fix round on its own branch (`trial-fix@<slug>`), then runs the trial again. The fix agent changes only its own unit's code. The boundary setup removes the scratch worktree with `git worktree remove`, with no `--force`.

## Revert search

1. Run exactly the git command that the prompt gives: a revert of one merge (`git revert -m 1 --no-edit <merge sha>`), or a revert of an earlier revert, which merges a slug again.
2. Run the wave verify commands once, as in "Wave verify" step 1. Fix nothing.
3. Return `green`, the `commands`, the `failures`, and the new commit `sha`.

## Wave review

Each unit's own review ran inside its walk and wrote the unit's review record. The wave review looks only for the defects where units meet. It runs in the wave worktree, after the wave verify is green. Its record is `review/wave-<n>.md` with its sibling `review/wave-<n>.yaml`.

1. **Attribute.** One read-only agent lists the files of each unit's own commits. For each unit of the prompt, run `git -C <wave worktree> log --no-merges --name-only --format= <wave base>..<merge sha>^2 --not <each merged-in sha>`. A file that came in through a `merge-in` then counts for the unit that wrote it. Return `{ units: [{ key, files }] }`, and write nothing. The driver maps each file to the units that changed it.
2. **Scope.** The driver selects the scope from the attribution:
   - `contract-only`: no file has two or more units, no `merge-in` ran, the wave has no needs entry, and the focus list is empty. Only the contract scout and the steering scout run.
   - `full`: every other wave.
3. **Select.** For the `full` scope, one agent selects the rubrics over `git diff <wave base>...<wave branch>`, by `review/_stage.md` Step 2 and `review/_select.md`. The selection always has `correctness` and `architecture`.
4. **Scouts.** One scout runs for each rubric, over the wave diff, with the attribution and the focus list. Each scout follows the cross-unit rule:
   - Report only a finding that needs two or more units to show. Examples: a call across units, a shared file, a duplicated helper, a migration order, or a value that one unit writes and another unit reads.
   - Do not report a finding that one unit's own diff shows. That finding already passed that unit's review.
   - Name the units of each finding in `units`.

   The contract scout reads every context file. A `provides` line that the wave diff does not meet is HIGH, and a broken `expects` line is HIGH. The steering scout reads the campaign `steer.md`.
5. **Refute.** The refuters check the findings, as in the unit review. One refuter checks up to 4 findings of one rubric, and at most 12 refuters run: the groups grow when they must. When a refuter is not sure, the finding is refuted. A refuter also refutes a finding that one unit's own diff alone shows.
6. **Write.** One wave review writer does the triage, the fix loop, and the ledger of the review stage, with the autonomous review policy. Its prompt names the stage reference. The writer takes a heavy slot.
   - Fix code on the wave branch only, in the wave worktree.
   - Write `review/wave-<n>.md` and `review/wave-<n>.yaml`, with the units of each finding.
   - Do not write a unit's review record.
   - When the prompt gives an answer to a wave question, apply it ([_drive.md](_drive.md), "Resume actions", wave-review).
   - Return `verdict`, `blockerCount`, `open` (each with `id`, `severity`, `units`, and `issue`), `fixed`, `committed`, `revert`, and `path`.
7. **Verify again.** When the writer committed a fix, the wave verify runs again, with up to 2 fix rounds. When the verify stays red, the wave asks a question `w<n>-wave-<k>`, and the writer runs again with the answer.
8. **`dont-ship`.** When the verdict is `dont-ship`, or the writer returned units in `revert`, the driver applies this rule:
   - When every open finding names the same one unit, and no other unit merged that unit in or carries it, the driver reverts that unit's merge. The revert uses the "Revert search" step, which appends a `wave-revert` event. That unit becomes `needs-fix`, and the other units stay merged.
   - Otherwise, the wave asks a question `w<n>-wave-<k>` ([_drive.md](_drive.md), "Park"). The run waits for the answer, and the writer then runs again with the answer.

## As-built note

Write `as-built/<slug>.md` for a person and `as-built/<slug>.json` for the drift check.

1. Read the slug's packet (`work/<slug>.md`), its `02-shape.md` `## Intake Fidelity` table, its latest `07-review*.md`, its `00-index.md` `runtime-evidence-deferrals`, and the diff of its merge commit (`git -C <projectRoot> show -m --stat <merge sha>` and the full diff).
2. For each `provides` line of the packet, record one of:
   - `met`, with the evidence: a commit, a `file:line`, and a test that exercises it;
   - `changed`, with the difference in one sentence;
   - `missing`.
3. For each carried decision, record its disposition from the Intake Fidelity table and the review: `honoured`, `narrowed`, or `dropped`, with the person's quoted answer when there is one.
4. Copy the decision digest from the prompt, every `## Assumptions` entry of the slug's plans, and every deferral with its receipt.
5. List the wave review findings that the prompt gives for this unit, each with its id, and `fixed` or `open` ("Wave review").
6. Record the merge commit and the slug output (its label and folder).
7. Write the JSON file in this shape:

```json
{
  "key": "<packet key>",
  "slug": "<slug>",
  "merge": "<sha>",
  "lines": [{ "key": "<provides key>", "status": "met|changed|missing", "evidence": "<commit, file:line, test>", "note": "<the difference>" }],
  "decisions": [{ "key": "<item key>", "disposition": "honoured|narrowed|dropped", "answer": "<the person's quoted answer, or null>" }],
  "refuted": false
}
```

8. Link the refuter's file `../refute/<slug>.md` from the note. The refuter writes it next.

## Refuter

The agents that built a slug do not grade it alone. Check each claim of the file that the prompt names.

1. For each `met` line and each `honoured` decision, try to show that it is false: read the cited `file:line`, read the diff, and run the named test.
2. A claim that you disprove becomes `changed`, `missing`, or `narrowed`, with your evidence. A claim that you cannot check, for example because its test cannot run, becomes `unverified`.
3. Write your verdict on each claim to `refute/<slug>.md` (for a fidelity file: `refute/fidelity-wave-<n>.md`).
4. For an as-built note, update the statuses in `as-built/<slug>.json` to your verdicts, and set `"refuted": true`. Change nothing else in it.
5. Return the counts `upheld`, `changed`, and `unverified`.

## Fidelity checkpoint

Write `fidelity/wave-<n>.md`. For every carried decision of each merged slug, one row: the item key, the decision's text, its disposition from the slug's as-built JSON (after the refuter), and the person's quoted answer for a `narrowed` or `dropped` decision. A `narrowed` or `dropped` decision with no quoted answer from the person goes to `unratified`; return the dropped ones in `unratifiedDropped` too. With the standing default `fidelity-narrowing: accept-and-carry`, the driver accepts a narrowing and carries it in the record. A drop with no answer stops the campaign before the next wave until the person answers it.

## Wave output

1. Check out the wave branch tip. Run the recipe's `build-cmd`, and copy the `artifacts` to the output folder. The label is `wave-<n>+<first 7 characters of the tip sha>`; write it to `LABEL.txt`.
2. Write `waves/wave-<n>.md`, the try-it note, for a person, not for an agent:
   - the build label, and the version when the wave shipped;
   - what changed for a person, slug by slug, in plain words;
   - the slugs that moved to a later wave, and why;
   - how to install or run the output (the recipe's `try`);
   - what to try first, taken from the slugs' acceptance criteria;
   - known limits: deferrals, `partial` verify results, `unverified` refuter lines, the open wave review findings, and open risks;
   - how to report a bug: `/wf intake brainstorm <brainstorm-slug> add <text>`, in the brainstorm session.
3. Append the `wave-ready` event.

## Drift check

Before wave n, compare each unit of wave n with what its dependencies actually built.

1. Read `ledger.json` for the units of wave n, each one's packet for its `expects` lines, and the `as-built/*.json` of each slug that a line names. Use only notes with `"refuted": true`.
2. For each as-built line with `status: changed` that an `expects` line of wave n names, decide its class and write it into that line as `"class"`:
   - `implementation-detail`: a name or a place differs, and the contract is the same;
   - `contract`: a data shape differs, or a capability is missing.

   Change nothing else in the file.
3. Run `node "<campaign script>" drift "<projectRoot>" <brainstorm-slug> <n>`. It writes `drift/wave-<n>.md` and `drift/<key>.json`, and appends the `drift` event.
4. Return the keys with a `contract` difference and the keys with only `implementation-detail` differences. A contract difference stops that unit and its dependents; the person decides.
