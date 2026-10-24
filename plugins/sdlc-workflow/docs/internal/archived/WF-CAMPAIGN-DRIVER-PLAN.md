# WF-CAMPAIGN-DRIVER-PLAN — a wave driver of its own for `/wf campaign`

Status **BUILT: W0a shipped in v9.185.1; W1–W6 and the W8 cutover ship together in v9.186.0 (PO 2026-10-16: one release, hard cutover). W7, the live run, is open and is not a gate. Section 14 lists where the build differs from this text.** · Date **2026-10-17** · Plugin **v9.186.0** · Owner **jayte**
Follows: [WF-CAMPAIGN-PLAN.md](WF-CAMPAIGN-PLAN.md) (the campaign), [WF-CAMPAIGN-RUN-FIXES-PLAN.md](WF-CAMPAIGN-RUN-FIXES-PLAN.md) (C1–C9), [WF-WATCH-MONITOR-PLAN.md](../WF-WATCH-MONITOR-PLAN.md) (the watch). Evidence: the SoccerManager campaign run, waves 2 and 3, 2026-10-06 → 2026-10-10.

## 1. Why

Today the campaign session is the orchestrator of each wave. For each unit, it works through ten steps of [_waves.md](../../skills/wf/reference/campaign/_waves.md) step 5 by hand, launches one yolo Workflow for the unit, records the outcome, and then launches `campaign-boundary.js`. yolo was built for one slug. It walks one roster in order, and the campaign cannot see inside a drive.

| Problem | Cause |
|---|---|
| A unit that needs another unit's slice stops, waits, and starts again | yolo is a closed box to the campaign. The campaign learns that a slice passed verify only from the watch's `stage-end` event, so C1 needs a stop (`stoppedAt: 'waits'`), a `merge-in` by the session, and a relaunch |
| The session does the steps of each unit by hand | The steps sit between two Workflow runs, so only the session can run them. Each step uses session context, and 11 compactions in the SoccerManager run each had to restate the rules |
| Two units change the same file, and the campaign finds out at the boundary | Each yolo drive plans its own slug. No step compares the plans of two units (the `ROWS_FORMAT` conflict of C7) |
| The review runs once for each slug, but the wave ships as one PR | Each drive runs its own review fan-out over its own branch. No review reads the merged wave diff before handoff |
| An intent-bearing stop ends the whole drive | yolo has one roster. The campaign has independent units that can continue |
| The width limits whole drives, not the heavy work | `campaign.width` counts yolo drives. A plan is read-only and a verify loads the machine, but both count the same (C4) |

This plan builds a new Workflow driver, `skills/wf/workflows/campaign-wave.js`, that runs every stage of every unit of one wave itself. It does not call `yolo.js`. It reimplements the parts of yolo that a wave needs, in the form that fits a wave, and it takes over `campaign-boundary.js`.

## 2. Decisions

| # | Decision | By |
|---|---|---|
| D1 | The wave driver is a separate script. It shares no code with `yolo.js` at run time or at build time. It copies the yolo helpers that it needs, and changes them where a wave needs a change. | PO 2026-10-16 |
| D2 | The wave driver never calls `yolo.js` and never calls `workflow()`. Every stage agent reads the same stage reference (`plan.md`, `implement.md`, `verify.md`, `review.md`) that yolo's stage agents read. | PO 2026-10-16 |
| D3 | One Workflow run drives one wave: the drives of the units, then the boundary, then the wave review. Mode `drift` stays a separate run of the same script. | recommendation |
| D4 | The script schedules slices, not drives. Each unit walks its own roster in order. A slice of unit A that needs a slice of unit B waits inside the run, and the driver runs the `merge-in` when B's slice clears. No drive stops and starts again for a wait. | recommendation |
| D5 | The artifacts stay the same. Each unit keeps its `00-index.md` stages, its stage files, its `.driver-journal.jsonl`, and its review record. `/wf yolo <slug>`, `/wf handoff`, `/wf ship`, the watch, and the mod read them unchanged. | recommendation |
| D6 | A resume does not use `resumeFromRunId`. Agents run in parallel, so the order of the agent calls is not fixed, and the cache matches calls in order. A resume launches the driver again, and the ledger and the disk give each unit's state (D22). | recommendation |
| D7 | An intent-bearing stop, a stage stop, or a merge conflict parks one unit, not the run. A unit that waits on a parked unit keeps waiting, because the parked unit can continue when its answer comes. It parks only when the parked unit moves out of the wave. The other units continue. | recommendation, changed by D16 |
| D8 | The boundary runs only over a settled wave: every unit is finished, or the person moved it out. While a unit is parked, the run waits for the person's answer (D16) and the boundary does not start. | PO 2026-10-16 (Q3) |
| D9 | Two reviews. Each unit gets its full review inside its walk, on its own branch, before it finishes: one slug-wide review, or its per-slice reviews. This review writes the unit's review record, as yolo's review does. After the merge, one wave review reads the merged wave diff for the defects that only show where units meet, and writes a wave review record in the campaign folder. | PO 2026-10-16 (Q1) |
| D10 | The driver finds the files that two units share before any code exists (D23). For a shared file with no contract change, the driver creates a needs entry in the ledger at once. The entry acts like a packet `needs` entry: it makes a wait, and `merge-in` closes it. At the next wave boundary, the session writes the entry into the packet through the brainstorm. A shared contract line is intent-bearing: the unit parks, and the session asks. | PO 2026-10-16 (Q2) |
| D11 | The driver changes the ledger only through `campaign.mjs`, through a bookkeeping agent (section 5.2). The driver never edits `ledger.json` by hand. The session records the wave outcome with one command, `wave <n> record`. | recommendation |
| D12 | The driver is Claude Code only, as yolo is. Under another host, the campaign stops before a wave, as it does today. | inherits WF-CAMPAIGN-PLAN |
| D13 | The yolo path stays available behind `campaign.driver: yolo` until the live run passes. After the cutover, the campaign code leaves `yolo.js`, and `campaign-boundary.js` is deleted (W8). | PO 2026-10-16 (Q5) |
| D14 | Parity tests run one table of cases against the copied helpers of both drivers. The tests share no code. They fail when a fix reaches one copy and misses the other. | PO 2026-10-16 (Q4) |
| D15 | `wave <n> launch` checks every unit before it adds any worktree. When one unit cannot get a worktree (disk or path), the launch refuses the whole wave, names each unit and its cause, and adds nothing. The person frees the disk or sets a shorter root, then launches again. | PO 2026-10-16 (Q6) |
| D16 | An answer reaches a parked unit inside the same run. One waiter agent blocks on `campaign.mjs await` until a reply is in the ledger. Every stage agent and every slice write-back also reports the replies that it finds. When a reply arrives, the unit continues by the resume action of its park kind (section 5.5), with the answer in the prompt. The run does not end for an escalation. | PO 2026-10-16 |
| D17 | No blocking escalation tool (an MCP server or a mod tool that a stage agent calls and that blocks until the answer). The waiter of D16 gives the same latency, and it frees the stopped stage's slots while the person decides (section 5.5b). | recommendation (Q8) |
| D18 | The width follows the budget during the run, not only at launch. Every stage agent and every slice write-back reads `campaign.mjs budget`, and the driver sets the number of heavy slots to the width that it returns: 1 at `slow`, the set width again at `ok`. Width 0 stops the run as a usage pause (section 5.4a). | PO 2026-10-16 |
| D19 | The wave driver needs an isolation contract. Every unit runs in its own worktree. Without a contract, `launch` refuses with `isolation-required`. Before W8, the session then drives that wave on the yolo path. From W8, the setup asks for a contract, and a contract with `parallel: false` runs the wave driver at width 1, still in worktrees. The driver never works in the main checkout. | PO 2026-10-16 (Q9) |
| D20 | Every `campaign.mjs` command that changes the ledger holds a ledger lock while it reads, changes and writes the ledger. The session and the driver's agents then never overwrite each other's changes. This ships first, in W0a. | PO 2026-10-16 (Q11) |
| D21 | A wait is pinned to a commit. A slice clears when its verify passed, its per-slice review (when the unit has one) is clean, and its write-back ran `slice-done`. `slice-done` records the commit of the cleared slice. `merge-in --at <sha>` merges exactly that commit, not the branch tip. | review 2026-10-16 |
| D22 | A launch again is safe. `launch` reuses each worktree, keeps each unit's ledger state, and passes the open questions, the cleared slices and the waits in the args. When every unit is finished, the relaunch runs `mode: boundary` and skips the drive. | review 2026-10-16 |
| D23 | Each unit plans all of its slices before any unit implements: yolo's plan fan-out and plan reconcile, copied. Then one cross-unit reconcile compares the file lists of every plan of every unit. Shared files are found before any code exists. | review 2026-10-16 |
| D24 | The slice write-back runs one CLI command, `slice-done`. It commits the records, records the cleared commit, marks the waits that the slice meets, reads the budget, and returns the open answers. The order of these steps is code, not prompt. | review 2026-10-16 |
| D25 | One live run for each wave. `launch` records the run in `waves[n].run` and refuses while that run is live. While the run is live, `status` gives `next.action: driving`, never `merge-in`, and `/wf yolo` refuses a slug of the wave (section 5.13). The run stays live until `wave <n> record`, or until its journals are silent for 20 minutes. | review 2026-10-16 |
| D26 | Each park kind has an away answer: the answer that the session gives while the person is away, or "hold" (section 5.5). An away answer is recoverable. It runs once for each unit and kind; a second park of the same kind holds. A held question gets a push notification, and the boundary waits for the person's answer (D8). | review 2026-10-16 |
| D27 | The driver records its own decisions as campaign journal events: each park, resume, derived needs entry, change of the heavy slots, and wave review revert. `recap` and `back` list them after the `decided` entries (section 5.9 item 10). | review 2026-10-16 |
| D28 | A stop request for one slug says what follows: `--then move` moves the unit out with no question, and `--then hold` parks it until the person says "continue". When the person does not say, the session asks before it writes the request. | review 2026-10-16 |

## 3. Engine limits that shape the design

These limits come from the Workflow tool reference. The design depends on each one.

| Limit | Effect on the design |
|---|---|
| A script has no file access, no clock, and no Node API. `Date.now()` and `new Date()` throw. | Every read, write, git command, and ledger change is an agent. Each unit orient mints the unit's run id from its own clock, as yolo's orient does. |
| One concurrency cap for the run: min(16, CPUs − 2) agents at once. Excess calls queue. | Every unit and every fan-out shares one cap. The driver adds its own heavy-slot limit on top (section 5.4a). |
| At most 1000 agents in the lifetime of a run. | The driver counts its agent calls and reserves the largest size of each fan-out before it starts it (section 5.12). A launch again continues from the ledger and the disk. P11 measures the real count. |
| `parallel()` is a barrier. Plain `Promise` code works inside a script. | Each unit's walk is one async function. The driver awaits all walks with `Promise.allSettled`, so a fault in one walk does not end the others. A wait is a promise that resolves when its slice clears. The heavy slots are a promise queue whose size can change. |
| A script cannot cancel an agent that runs. | A driver-made stop writes a cancel marker that the waiter reads (section 5.10). P9 checks whether a script can return while an agent still runs. |
| `resumeFromRunId` replays the longest unchanged prefix of agent calls, in order. | D6: no cache resume. |
| A run takes no input while it runs. | The person answers in the session. The driver reads only files that the session writes: the control files, `steer.md`, and the ledger. An answer reaches the run through the ledger, read by the waiter agent (D16). |
| A Bash call of an agent lasts at most 10 minutes. | The waiter calls `campaign.mjs await` with a limit of 540 seconds, at most 6 times, then returns. P14 checks the cost of one waiter. |

## 4. What moves where

| Work | Today | After |
|---|---|---|
| Worktree add, context file, `00-index.md` branch fields, unit state `running` | The session, by hand, for each unit (step 5.1–5.4) | One CLI command, `wave <n> launch`, before the run. It refuses the whole wave when one unit cannot get a worktree (D15), and it is safe to run again (D22) |
| The drives | One yolo Workflow per unit | The wave driver |
| Finding files that two units share | Nobody, until the boundary | The cross-unit reconcile, after every unit planned (D23) |
| Waits and `merge-in` | The session, on the watch's `stage-end` event, then a relaunch | The wave driver, inside the run, pinned to the cleared commit (D21) |
| Unit outcome records (`finished --digest`, `waiting`, `stopped`) | The session, after each drive | The wave driver's bookkeeping agents |
| The run-end note, the watch end, and the records commit of each unit (step 5.8, 5.9) | The session | The wave driver: `slice-done` for each slice, and `slice-done --final` at the end (D24) |
| Slug output (step 5.10) | A boundary run for each unit | The wave driver, when the unit finishes |
| The unit review | One fan-out inside each drive | One fan-out inside each unit's walk, over the unit's own commits |
| An escalation in a unit | The unit's drive ends. The session asks, then launches the drive again | The unit parks and asks. The session records the answer with `reply` while the run goes on, and the unit continues in the same run (D16) |
| Needs entries that the packets do not declare | Found by the person, or at the boundary | Created by the driver in the ledger (D10); written into the packet by the session at the next boundary |
| The boundary setup (`wave <n> set boundary`, `worktree wave-<n> add`, `merge-order <n>`) | The session (step 6) | The wave driver's boundary setup agent |
| The boundary (merge, verify, revert search, as-built, refuter, fidelity, wave output) | `campaign-boundary.js` | The wave driver |
| The wave review | None | One fan-out over the merged wave diff, after the wave verify |
| Drift check | `campaign-boundary.js` mode `drift` | The wave driver, mode `drift` |
| The wave record (`merged`, `needs-fix`, `stopped` for each unit) | The session, one command for each unit | One command, `wave <n> record --outcome <file>` |
| Worktree removal, `branch -d` of merged slug branches | The session (step 6) | The session, after `record`. `worktree remove` can need the person (`outsideKept`). While the person is away, the cleanup waits for `back`, because the away limits forbid a deletion (section 5.13) |
| Prepare, the start of a wave, handoff, ship, questions, away mode, push notifications, usage-limit detection | The session | The session. Away mode answers by the park kind (D26), and the session never launches a second run of a live wave (D25, section 5.13) |

## 5. Design

### 5.1 Arguments

`wave <n> launch` prints the `args` object, and the session passes it as is.

`launch` refuses with `{ ok: false, error: 'isolation-required' }` when the project has no usable isolation contract (D19). Before W8, the session then drives the wave on the yolo path.

Before it changes anything, `launch` checks every unit of the wave that has no worktree yet: the path check of C6, and the disk need of C5 for those units together (the largest size in `disk-history` times the number of those units, plus `min-free-gb`). When one check fails, `launch` returns `{ ok: false, blocked: [{ key, cause: 'disk' | 'path', detail }] }`, adds no worktree, and changes no file (D15). The session shows the list to the person.

`launch` also reads the budget, as `budget` does. When the width is 0, `launch` returns `{ ok: false, paused: { until, reason } }` and changes no file. The session then runs `pause <until> <reason>`, as [_waves.md](../../skills/wf/reference/campaign/_waves.md) step 5 says today.

`launch` refuses with `{ ok: false, error: 'run-live', run, newestAt }` while `waves[n].run` names a run that is live (D25). A run is live until `wave <n> record` clears `waves[n].run`, or until the newest line of the campaign journal and of every unit journal of that run is older than 20 minutes, the silence limit of `judgeSilence`. The waiter's `await` appends a `waiter` line to the campaign journal at each call, so a run that only waits for an answer stays live. When `launch` succeeds, it writes `waves[n].run = { id: campaignRunId, at }` and appends a `run-start` event to the campaign journal.

`launch` is safe to run again (D22):

1. It reuses a worktree that exists (`worktree <key> add` already returns `reused: true`).
2. It keeps each unit's ledger state. `finished` stays `finished`, `stopped` stays `stopped`, and `waiting` becomes `running`.
3. It sets `rerere.enabled` once in the common git config, so that two `merge-in` commands never write the config at the same time.
4. It gives `mode: 'boundary'` when every unit of the wave is `finished` or moved out.

```js
{
  mode: 'wave' | 'boundary' | 'drift',
  projectRoot, referenceRoot, brainstorm, wave,
  campaignRunId,                        // the run id of this wave run; the per-unit run ids come from orient
  waveBranch, base,
  campaignDir,                          // absolute .../work/campaign
  campaignControlPath,                  // absolute .../work/campaign/.control.json
  campaignSteerPath,                    // absolute .../work/campaign/steer.md
  cancelPath,                           // absolute .scratch/campaign/<campaignRunId>/wave-<n>/cancel (section 5.10)
  width,                                // the heavy slots at the start: the width of <cmd> budget at launch
  widthMax,                             // the set width (campaign.width, or 1 with parallel: false); the run never goes above it (D18)
  stopBefore: null | 'boundary',        // 'boundary' only for the live probe of W3L
  output,                               // the setup answer
  records: 'tracked' | 'local',
  agentCeiling: 900,
  units: [{
    key, slug, form, order,
    root,                               // the worktree path
    branch,                             // campaign/<b>/wave-<n>--<slug>
    contextPath,                        // absolute context/<slug>.md, in the main checkout
    reviewScope: 'slug-wide' | 'per-slice',
    state,                              // the ledger state at launch
    runId,                              // the unit's run id of an earlier run of this wave, or null
    cleared: [{ slice, sha }],          // the slices that cleared in an earlier run (D21)
    waits: [{ from, through, before, why, source, state, sha }],   // packet and derived entries; state open | ready | met | rejected
    questions: [{ id, kind, stage, slice, answer, by, move, consumed }],   // this unit's questions of this wave
  }],
  waveQuestions: [{ id, kind, answer, by, consumed }],   // the questions of the wave review (section 5.8)
}
```

### 5.2 The units, and the bookkeeping agents

The driver builds one object for each unit at the start: its paths (`root`, journal, control file, `steer.md`, context file), its run id, its own heartbeat counter, its roster, its questions, and its state. Every prompt of a unit takes the paths from that object. The paths of yolo (`JOURNAL_PATH`, `CONTROL_PATH`, `STEER_PATH`) become fields of the unit, not constants.

A **bookkeeping agent** is a Sonnet agent that runs only the `campaign.mjs` and git commands of [_drive.md](../../skills/wf/reference/campaign/_drive.md), and edits no code. These agents are bookkeeping agents:

| Agent | When | What it runs |
|---|---|---|
| Slice write-back | At the end of each slice, after the slice cleared | yolo's write-back of `00-index.md`, then `slice-done <key> <slice>` (D24) |
| Wait agent | Before the implement of a slice with a wait | `unit <key> waiting --on`, then `merge-in --at`, then `unit <key> running` (section 5.6) |
| Park agent | When a unit parks | `unit <key> stopped --route`, then `ask`, then a `waiting` journal line, then `journal park` (section 5.5) |
| Resume agent | When an answer arrives | `unit <key> running` and `journal resume`, then `question <id> consumed` after the resumed step ends |
| Event agent | When the driver adds a derived needs entry, changes the heavy slots, or reverts a unit after the wave review | `journal derived-need`, `journal width`, or `journal wave-revert` (section 5.9 item 10). The `needs add` agent and the revert step append their event themselves |
| Unit end agent | When the unit's review is clean | `slice-done <key> --final`, `unit <key> finished --digest`, the `run-end` line, the `commentary.md` run-end note, and `<watch> end` |
| Boundary setup agent | When the wave settles | `wave <n> set boundary`, `worktree wave-<n> add`, `merge-order <n>` |

The waiter (section 5.5a) is not a bookkeeping agent. It runs only `await`.

### 5.3 The run, phase by phase

1. **Orient.** One orient agent for each unit, all at once. Each agent is yolo's orient (yolo.js:819) without slice mode, the update-deps class, and the terminal-analysis types. A campaign unit is always a build form. Each agent reads the unit's driver journal for the previous run, reads the roster and the stage state, runs the design gate (step 5e), and runs the clearing-event tripwire. It mints a run id only when `units[].runId` is null; otherwise it keeps that run id and continues `seq` from the journal. When the worktree has `MERGE_HEAD`, and the ledger wait of that merge is still open, the agent runs `git merge --abort`, so the wait agent can merge again. A unit whose orient fails parks with kind `orient`. A unit that is `finished`, or `stopped` with an open question, gets no orient: it goes straight to its end state, or to waiting for its answer.
2. **Plan.** Each unit plans every slice that has no plan, all at once, with yolo's plan fan-out (yolo.js:2396), the plan bookkeeping agent, a second orient, and yolo's plan reconcile (`reconcilePlans`, yolo.js:2187). A plan takes no heavy slot. A unit whose orient found `reconcile-pending: true` runs the reconcile here.
3. **Cross-unit reconcile.** After every unit planned, one read-only agent reads every `04-plan-<slice>.yaml` of every unit (its `files` and `edges`) and every context file's `provides` and `expects` lines. It returns each pair of slices of two units that change the same file: `{ a, aSlice, b, bSlice, files, kind }`. Section 5.7 turns each pair into a derived needs entry or a question. This is the only barrier across units before the drive.
4. **Drive.** Each unit walks its roster (section 5.4). All walks run at once.
5. **Settle.** The wave settles when every walk ended finished, or the person moved the unit out (D8). While a unit is parked, the run waits for the answer (section 5.5a). The run returns before the boundary only on a stop request with `scope: campaign`, on a pause, at width 0, or at the agent ceiling, with `held: true` (section 5.10). With `stopBefore: 'boundary'`, the run returns here.
6. **Boundary setup.** The boundary setup agent runs `wave <n> set boundary`, `worktree wave-<n> add`, and `merge-order <n>`. The merge order and the carried units come from its result.
7. **Quiet-window checks, merge, wave verify, revert search.** These steps are the boundary steps of `campaign-boundary.js`, unchanged in meaning ([_boundary.md](../../skills/wf/reference/campaign/_boundary.md)). The merge regenerates `.ai/workflows/INDEX.md` from each slug's `00-index.md` (section 5.9 item 9).
8. **Wave review** (section 5.8).
9. **Record.** As-built notes, the refuter, and the fidelity checkpoint, as in `campaign-boundary.js`.
10. **Output.** The wave output and the try-it note.
11. **Hand back.** The driver returns the wave outcome (section 5.11).

`mode: 'boundary'` starts at step 6.

### 5.4 One unit's walk

A unit's walk is yolo's `driveRoster` (yolo.js:2468) and `driveChain` (yolo.js:1743) for one unit, with these changes:

1. **Waits.** Before the implement of slice S, the walk awaits every wait whose `before` is S (section 5.6). Every plan exists already (section 5.3 step 2), so no wait appears after the walk passed its slice.
2. **Heavy slots.** Some agents take a heavy slot first. The number of heavy slots starts at `width` and follows the budget (section 5.4a). A verify that runs a command of `campaign.isolation['heavy-suites']` still takes the cross-session file lock (`lock acquire`), because the slots do not reach another session.

   | Takes a heavy slot | Takes no heavy slot |
   |---|---|
   | implement; verify; the wall probe; the merge agent (it runs the tests of both units); the unit review writer; the slug output; the quiet-window checks; the boundary merge; the wave verify; the revert search; the wave review writer; the wave output | orient; plan; the plan bookkeeping and the plan reconcile; the cross-unit reconcile; review rubric selection; review scouts; refuters; the decision classifier; the charter checkpoint; the as-built note; the boundary refuter; the fidelity checkpoint; the drift check; the bookkeeping agents; the waiter |

3. **The slice clears.** A slice clears when its verify passed and, for a `per-slice` unit, its per-slice review is clean. Then the slice write-back runs `slice-done <key> <slice>` (section 5.6a). Only then do the waits on that slice resolve (D21).
4. **The unit review.** A unit with `review-scope: per-slice` runs each per-slice review inside the walk, after the slice's verify, as yolo does. A unit with `slug-wide` scope runs one review after its last slice cleared verify. Both are yolo's review fan-out (rubric selection, scouts, the steering scout, the contract scout, the refuters, the writer), copied, with these changes:
   - The review reads only the unit's own commits: `git log -p --no-merges <wave base>..HEAD --not <each merged-in sha>`. The code that came in through `merge-in` belongs to the other unit, and it passed that unit's checks.
   - At most 12 refuters run for one review. When a review has more than 12 findings, one refuter checks each group of 4 findings of the same rubric.
   - The review writer fixes code on the unit branch, takes a heavy slot, and writes the unit's review record. The scouts and refuters take none.
   - A `dont-ship` verdict, or an open blocker after the fix loop, parks the unit with kind `review`.
5. **The end.** When the unit review is clean, the unit builds its slug output (the "Slug output" section of `_boundary.md`). Then the unit end agent runs its commands (section 5.2). A wait with `through: finished` resolves here, with the sha of `slice-done --final`.

The charter checkpoint still runs every 3 slices. It also judges the carried decisions of section 1 of the context file, so a drift from a brainstorm decision shows during the wave, not only at the fidelity checkpoint.

Each walk runs inside `try`/`catch`. A walk that throws parks its unit with kind `driver-fault`, and each lock that it holds is released in `finally`.

### 5.4a The width during the run

Today the session reads `budget` before each drive starts, so a `slow` reading narrows the next start to 1. A wave run starts every unit at once, so the run must read the budget itself (D18):

1. Every stage agent runs `node campaign.mjs budget "<projectRoot>" <brainstorm>` in its stop check, and returns `budget: { state, width, until, reason }` in its result. The slice write-back gets the same reading from `slice-done`. The command reads a local file, so the reading costs no agent.
2. When the width is 0 at the start of a stage agent, the agent does no work and returns `stopped: usage-pause`.
3. The driver sets the number of heavy slots to `min(widthMax, width)` from the newest reading. A reading without data (`unknown`) keeps the set width, as `effectiveWidth` does (lib/campaign.mjs:810).
4. When the number of slots goes down, an agent that holds a slot keeps it until it ends. No new heavy agent starts while the number of agents in slots is at or above the new number.
5. When the number of slots goes up again (the reading is `ok` after the 5-hour window resets), the waiting heavy agents start, up to the new number.
6. When the width is 0, the driver stops the run as for `action: pause` (section 5.10), with the reading's `until` and `reason`. The session then runs `pause <until> <reason>`. The driver does not wait for the usage guard to write the pause into the control file.
7. The driver logs each change of the number of slots, an event agent appends a `width` event (D27), and the outcome lists the change in `widthChanges`.

The boundary agents and the wave review writer use the same heavy slots, so a `slow` reading also narrows the wave verify and the revert search.

Each agent that takes a heavy slot writes `"heavy": true` on its `agent-start` journal line. The mod can then show the holders of the slots without a lock file (W5).

### 5.5 Parking

A unit parks for one of the kinds of this table. When a unit parks, the park agent runs `unit <key> stopped --route "parked: <kind>: <reason>"`, then `ask <id> --wave <n> --unit <key> --kind <kind> [--stage <stage> --slice <slice>] "<question>"` with the context of the park, then appends a `waiting` line to the unit's journal, then appends a `park` event with the kind and the question id to the campaign journal. Every park asks exactly one question: the person then chooses how the unit continues. A stop request with `--then move` is the only exception: the unit moves out with no question (section 5.10).

| Kind | Cause | Resume action on an answer | Away answer (D26) |
|---|---|---|---|
| `stage` | A stage returns `hard-stop`, a stage gate fails, an intent-bearing decision stops a stage, or a verify does not converge | A resume orient (section 5.3 step 1, same run id), then the stopped stage again, with the "ANSWERED ESCALATION" clause. For implement, the clause also gives `<slice start sha>..HEAD` and the uncommitted files, with the rule: revise or undo this work to fit the answer. | A decision with options: the recommended option, by the away rules of `campaign.md`. An intent-bearing decision gets it only when the away words cover escalated decisions. A verify that does not converge: one more verify round, with the diagnosis of the stopped verify as the answer. A hard-stop or a failed stage gate: hold. |
| `review` | A `dont-ship` unit review, or an open blocker after the fix loop | Only the review writer runs again, with the stored findings (the review `.yaml`) and the answer. When the answer accepts the finding as it is, the writer records the person's override as a decision, and the unit finishes. No new fan-out runs. | One more fix loop of the writer, with the open blockers as the answer. Never accept a finding as it is: an override is the person's decision. |
| `merge-conflict` | The merge agent aborts a `merge-in` (section 5.6 step 4) | The merge agent runs again with the answer as its rule, then the wait agent runs `merge-in` again. | Hold. |
| `contract` | A pair of slices of the cross-unit reconcile, or a `crossUnit` report, changes a `provides` or `expects` line | Approved: `contract <key> amend --line <line key> --text "<new text>"` records the change, and `context` writes it into the context file of every unit that carries or expects the line. Each stage agent reads the context fresh, so the change reaches the other units at their next agent. Refused: the plan of the slice runs again with the answer. | Refused, so the plan keeps the contract, only when the away words cover escalated decisions. Otherwise hold. Never approve a contract change. |
| `needs-cycle` | `needs add` refuses an entry because it closes a cycle (section 5.7) | The answer names the slice order. The driver adds the entry that the answer gives, or moves one unit out. | Hold. |
| `deadlock` | Section 5.6 step 6 | The answer names the wait to drop (`needs <key> remove` for a derived entry) or the unit to move out. | Hold. |
| `moved-dependency` | A unit that this unit waits on moves out of the wave | The answer drops the wait, and the unit continues without it, or the unit moves out too. | Hold. |
| `orient` | The unit's orient fails | The orient runs again. When it fails again, the unit parks again with a new question. | The orient runs again. |
| `slug-stop` | A stop request with `scope: slug` and `--then hold` names the unit (section 5.10) | The answer "continue" resumes the unit as for `stage`. Any other answer moves the unit out. | Hold. The person asked for the stop. |
| `driver-fault` | The walk threw (section 5.4) | A resume orient, then the walk continues from the disk state. | The resume, as on an answer. |
| `wave-review` | A wave question (section 5.8 step 8) | The writer runs again with the answer. | Hold. |

An away answer runs once for each unit and kind. When the unit parks again with the same kind, the question holds. The session records each away answer with `decided <id> --why "away: <the rule of this column>"`, so the recap shows it. A question of the classes `shared-env`, `external-party` or `irreversible` always holds, whatever its kind.

For each question that holds, the session sends one push notification with the question id, the unit, and the question. The question then waits for the person, and the boundary waits with it (D8). The units that do not wait on it continue.

A unit that waits on a parked unit does not park. It keeps waiting (D7). The other walks continue. A stop request with `scope: campaign`, or a pause, stops every walk (section 5.10). A request with `scope: wave` is for the session: the driver ignores it, as the boundary does today.

**Question ids.** The id of a unit question is `w<n>-<key>-<k>`, where k is 1 plus the number of earlier questions of that unit in the ledger. A wave question is `w<n>-wave-<k>`. `ask` with an id that is open and the same text returns the open question and changes nothing, so a repeated park agent does not fail.

### 5.5a Answers inside the run

An escalation does not end the run. The unit parks, the question goes to the person, and the unit continues in the same run when the answer comes.

1. **The question reaches the person.** `ask` appends an `asked` event to the campaign journal. `asked` is already a campaign event of the watch (`CAMPAIGN_EVENTS`, yolo-watch.mjs:84), so the watch reports it to the session while the run goes on. The session asks the person with the full context, by the standing rules.
2. **The answer goes into the ledger.** The session runs `reply <id> --by person "<answer>"`. When the person moves the unit out of the wave, the session runs `reply <id> --by person --move "<answer>"`. When the person is away, the session answers by the away rules (D3 and D4 of the run-fixes plan) and by the away column of section 5.5 (D26), and runs `decided <id> …`. A question that holds gets a push notification, and no answer. `decided` also answers the open question `<id>`, with `by: session`. Today `decided` writes only `ledger.decided` and leaves the question open (campaign.mjs:1210-1232), so W0a changes it.
3. **The waiter.** While one or more questions of the wave are open, the driver keeps one waiter agent alive. The waiter runs `node campaign.mjs await "<projectRoot>" <brainstorm> --wave <n> --max 540` through Bash, at most 6 times. At the start of each call, the command appends a `waiter` line with the run id to the campaign journal, so the run stays live (D25). The command reads the ledger, the campaign control file, the budget, and the cancel marker every 10 seconds. It reads the open questions of the wave again at each read, so a question that is asked after the waiter started is in the list. It returns at the first of these events:
   - a question of the wave has an answer that is not consumed: `{ answered: [{ id, unit, kind, answer, by, move }] }`;
   - the control file has a stop with `scope: campaign`, or a pause: `{ stopped: true }`;
   - the budget width is 0: `{ paused: { until, reason } }`;
   - the cancel marker exists: `{ cancelled: true }`;
   - 540 seconds passed: `{ timeout: true }`. The waiter then calls the command again.

   After 6 calls, the waiter returns `timeout`. When questions stay open, the driver starts a new waiter. The waiter takes no heavy slot. It takes one slot of the engine's concurrency cap.
4. **The free checks.** Every stage agent runs `await --wave <n> --max 0` as the last command of its stop check, and `slice-done` returns the same list. An answer can then arrive before the waiter sees it, at no extra agent.
5. **One resume for each answer.** The driver keeps one state for each question: `open`, `seen`, `consumed`. The first source that reports an answer moves the question to `seen` and starts the resume. The driver ignores every later report of the same answer. The resume agent runs `question <id> consumed` after the resumed step ends, so `await` no longer returns that answer, also after a relaunch.
6. **The unit continues.** For an answer without `--move`, the resume agent runs `unit <key> running`, and the unit continues by the resume action of its kind (section 5.5). The stage that runs again records the answer as the decision, with class `intent-bearing`, the answer quoted, and `by`. The waits of other units on this unit stayed open while it was parked, so they resolve as usual.
7. **The unit moves out.** For an answer with `--move`, the unit stays `stopped`, with the route `moved by the person`. Every wait on it rejects, and each unit that waits on it parks with kind `moved-dependency`.
8. **The ceiling.** A waiter that only calls `await` again uses tool calls, not agents. Each new waiter uses one agent of the ceiling, so an hour of waiting costs about one agent.

The waiter can wait for hours, for example overnight when the person is away and the away words do not cover the decision. The run then stays alive, and the units that do not wait on the question continue.

The review of 2026-10-16 also proposed to start the waiter only when no walk can make progress, and to rely on the free checks while walks run. That saves the engine slot, but an answer could then wait for the end of a slice of another unit. D16 asks for an answer to reach the unit at once, so the waiter starts as soon as a question is open. P14 measures the cost, and Q12 decides.

### 5.5b Why no blocking escalation tool

A blocking escalation tool has two ends: a stage agent calls it with a question, the call blocks until the person answers, and the agent continues with the answer in its context. It could be an MCP server or a mod tool. The plan does not build it (D17), for these reasons:

| Point | Blocking tool | Park and waiter (D16) |
|---|---|---|
| Time from the answer to the work | Seconds | Seconds: the waiter reads the ledger every 10 seconds |
| Slots while the person decides | The stopped agent keeps its heavy slot and its engine slot. Two escalations in implement or verify can stop every other unit's heavy work | The stopped stage ends and frees both. The waiter takes one engine slot for all questions |
| Stop requests and pauses | Do not reach an agent that is blocked in a tool call, unless the tool also reads the control files | The waiter reads the control file, the budget, and the cancel marker |
| Waits of many hours | A tool call has a time limit. A wait of many hours needs a loop of bounded waits anyway | A loop of bounded waits by design |
| A run that dies while it waits | The agent's context is lost, so the disk path (the artifact, the answered question) must exist anyway | The disk path is the only path |
| What it costs to build | A new MCP server in the plugin (it has none today) or a tool from the mod (the mod in this repo gives no tool to subagents), and an exception to the rule of `_subagents.md` that children never ask | One CLI command (`await`) and one prompt clause |
| What it saves | The stopped stage does not run again | The stopped stage runs again and reads its own artifact |

The only gain of the blocking tool is the second run of the stopped stage. W7 measures that cost (section 11). When it is large, the blocking tool is a later item, as Q8.

### 5.6 Waits and merge-in

A wait `{ from, through, before }` belongs to unit A and names unit `from`. It moves through these states: `open`, `ready` (with the sha of the cleared slice), `met`, or `rejected`.

1. **Ready.** When the slice `through` of `from` clears, `slice-done` marks each open wait on it as `ready` with the sha of that slice, and returns the list. For `through: finished`, `slice-done --final` does this. The driver resolves the wait promise with the sha.
2. **Already cleared.** When a wait opens on a slice that cleared earlier (a relaunch, or a derived entry), the wait is `ready` at once with the sha from `units[from].cleared`.
3. **Merge.** Before the implement of slice `before`, A's walk awaits the wait. No agent of A runs at that moment, because the walk is between two slices. Then the wait agent runs `unit A waiting --on "<from>: <through>"`, `merge-in A <from> --at <sha>`, and `unit A running`. `merge-in --at` merges that commit, not the branch tip (D21), and records it in `merged-in`. The wait is `met`.
4. **Conflict.** When the result has `conflict`, a merge agent follows the "Merge" section of `_boundary.md` for that one merge, in A's worktree, with rerere. Then the wait agent runs `merge-in` again to record it. When the merge agent aborts, A parks with kind `merge-conflict`.
5. **Park and move.** When `from` parks, every wait on it stays open, and A keeps waiting. When `from` moves out of the wave, every wait on it rejects, and A parks with kind `moved-dependency`.
6. **Deadlock.** When every walk that is not finished is waiting, no wait can become ready, no question is open, and the run is not stopping, the driver parks the waiting units with kind `deadlock`. A walk that waits on a parked unit with an open question is not a deadlock: the waiter waits for the answer.
7. **Stop.** When the run stops (section 5.10), every open wait promise resolves with `stopped`, not with a rejection, so no unit parks for the stop.

A cycle cannot form through the packets' `needs` (`checkCampaignSet` refuses it). A derived needs entry can form one, so `needs add` checks for cycles too (section 5.7).

A slug-wide unit can change a slice after it cleared, because its review runs after its last slice. The unit that merged the cleared commit then has the older code. The boundary merge combines both, and the wave review reads the result.

yolo's stop condition (d) (yolo.js:298) stays in the stop clause of plan and implement agents as a second guard. When it fires, the driver has a scheduling fault: it treats the stop as a wait, logs it, and awaits the wait.

### 5.6a `slice-done`

`node campaign.mjs slice-done "<projectRoot>" <brainstorm> <key> <slice> [--final]` runs under the ledger lock (D20), and does these steps in order:

1. **Records.** With tracked records, it commits `.ai/workflows/<slug>/` by path on the unit branch, with the message `chore(<slug>): record <slice>`. It leaves out the run-time files: `.watch-state.json`, `.driver-journal.jsonl`, `commentary.md`, `cost.jsonl`, `.read-ledger.jsonl`. With `--final`, it commits the journal and the commentary too, after the `run-end` line. With local records, it runs the sync of `worktree <key> sync` and commits nothing.
2. **Cleared.** It appends `{ slice, sha: HEAD, at }` to `units[key].cleared`. With `--final`, the slice is `finished`.
3. **Waits.** It marks each open wait of another unit on this slice as `ready` with the sha.
4. **Budget.** It reads the budget.
5. **Answers.** It reads the answers of the wave that are not consumed.

It returns `{ sha, ready: [{ key, from, through, sha }], budget, answered }`.

`merge-in` leaves the same run-time files out of its dirty check, with git pathspecs. The records commit then cannot leave a tracked file that blocks a merge (W0a).

### 5.7 Derived needs entries

A derived needs entry is a `needs` entry that the driver creates in the ledger, for a dependency that no packet declares (D10).

1. **Sources.** The cross-unit reconcile (section 5.3 step 3) reports pairs of slices. A plan agent that runs during the walk, for example after a re-challenge, reports a shared file in a new result field, `crossUnit: [{ key, slice, files, kind }]`. `kind` is `order` when the two slices only touch the same file, and `contract` when a `provides` or `expects` line of either unit would change.
2. **Direction.** For a pair `{ a, aSlice, b, bSlice }`, the unit that is later in packet order needs the earlier unit. When a is earlier, the entry is on b: `from: a`, `through: aSlice`, `before: bSlice`. When b is earlier, the entry is on a: `from: b`, `through: bSlice`, `before: aSlice`.
3. **Order.** For `order`, a bookkeeping agent runs `needs <key> add --from <from> --through <through> --before <before> --why "<files>" --by driver --source <cross-unit | plan:<slice>>`. The script:
   - does nothing, and returns `exists: true`, for an entry that matches an entry of the packet or of the ledger on `from`, `through` and `before`;
   - checks for a cycle at slice level: the nodes are the slices of the units, each unit's slices follow in roster order, and each wait is an edge. An entry that closes a cycle is refused, and the unit parks with kind `needs-cycle`;
   - when the slice `before` already passed its implement, adds no wait, records the pair in `waves[n].focus`, and returns `late: true`. The wave review reads the focus list (section 5.8);
   - otherwise writes the entry into `ledger.units[key]['derived-needs']` with `by`, `at` and `source`, opens its wait (section 5.6 steps 1 and 2), and writes the context file again;
   - for a new entry and for a `late` pair, appends a `derived-need` event to the campaign journal (D27).
4. **Contract.** For `contract`, the unit parks with kind `contract`, because the decision is intent-bearing (class 6 of `_decision-classes.md`). No entry is created.
5. **Packets.** The driver never writes a packet, because the brainstorm owns the packets. The wave outcome lists each derived entry. At the next wave boundary, the session writes each entry into its packet through `/wf brainstorm <brainstorm-slug> add`, then runs `replan`. `unitOf` then reads the entry from the packet, and `replan` drops the ledger copy that matches it on `from`, `through` and `before`.

`needs <key> list` shows the entries of a unit to the session. `needs <key> remove` drops a derived entry, for the `deadlock` resume.

### 5.8 The wave review

Each unit's own review already ran inside its walk (section 5.4 item 4) and wrote the unit's review record. Handoff reads that record: `07-review.md` for a slug-wide unit, and `07-review-<slice>.md` for each slice of a per-slice unit (handoff.md:67-68). The wave review looks only for what a unit review cannot see: the defects where units meet. It runs in the wave worktree, after the wave verify is green.

1. **Attribute.** One read-only agent lists, for each unit, its own commits: the commits of `<wave base>..<unit merge sha>^2` with `--no-merges`, without the commits that its `merged-in` entries brought in. It lists the files of each commit. The driver maps each file to the units that changed it, in code.
2. **Scope.** When no file has two or more units, no `merge-in` ran, the wave has no needs entry, and `waves[n].focus` is empty, only the contract scout and the steering scout run. Otherwise the full review runs.
3. **Select.** One agent selects the rubrics over `git diff <base>...<wave branch>`, by `review/_stage.md` Step 2 and `review/_select.md`, as yolo's `driveReview` does (yolo.js:1520). The selection always includes `correctness` and `architecture`.
4. **Scouts.** One scout for each rubric reads the wave diff, the attribution, and the focus list. Each scout prompt says: report only a finding that needs two or more units to show, for example a call across units, a shared file, a duplicated helper, a migration order, or a value that one unit writes and another unit reads. A finding that one unit's own diff shows already passed that unit's review. One contract scout reads every unit's context file: a `provides` line that the wave diff does not meet is HIGH, and a broken `expects` line is HIGH. One steering scout reads the campaign `steer.md`.
5. **Refute.** Refuters as in the unit review, with the same limit of 12. A refuter also refutes a finding that one unit's diff alone shows.
6. **Write.** One wave review writer follows `review.md` for the triage, the fix loop and the ledger, with the autonomous review policy. It fixes code on the wave branch and takes a heavy slot. It writes `work/campaign/review/wave-<n>.md` and its sibling `.yaml`, with the units of each finding. It never writes a unit's review record.
7. **Verify again.** When the writer committed a fix, the wave verify runs again, with up to 2 fix rounds.
8. **A `dont-ship` verdict.**
   - When every open blocker names one unit, and no other unit merged that unit in (`merged-in`) or carries it, the driver reverts that unit's merge with the revert step of the revert search, runs the verify, and records the unit as `needs-fix`. The revert step appends a `wave-revert` event (D27). The other units stay merged.
   - Otherwise, the park agent asks a wave question with kind `wave-review`, and the run waits for the answer with the waiter, as for a unit question (D16). The answer names the units to revert, or accepts the findings. The writer then runs again with the answer.

The as-built note of each unit lists the wave review findings that name the unit, fixed or open. The try-it note lists the open findings under "known limits". `/wf ship` takes release-note inputs only from the `07-review-*.yaml` of the slugs (ship.md:69), so a wave review finding reaches the release notes only through the as-built note and the wave PR text.

### 5.9 The journals

The watch, the mod, the recap, and the forecast read the driver journals. The wave driver keeps every field that they read:

1. One journal for each unit, at `<unit root>/.ai/workflows/<slug>/.driver-journal.jsonl`.
2. The run id of a unit has the form `YYYYMMDDTHHMMSSZ-<slug>`. `runStartFromId` (yolo.js:2262) and `shortStamp` (lib/campaign.mjs:390) parse this prefix. The watch compares `run` for equality (live-events.mjs:157-159).
3. `seq` counts up for each unit, from 0 at the first orient. A resume orient continues it.
4. Every line has `stage` and `slice` fields, as yolo's lines do.
5. **The label changes.** The agent label of a unit agent, and the journal's `agent` field, become `<stage>:<slice>@<slug>`. Two units can have slices of the same name, and the Workflow progress view and the watch's transcript finder would mix them. The transcript finder matches the journal's `agent` field exactly against the description in `.meta.json` (yolo-watch.mjs:192, 208), so it needs no change when P10 passes. `stageOf` (live-events.mjs:60-75) strips `@<slug>`. `journal.ts` imports `stageOf`, so it needs no change. `buildRecap`, `stageMinutesFromJournals` and stop condition (b) split on the first `:`, so they need no change.
6. Every unit line has `"driver":"campaign-wave"` and `"campaign":"<brainstorm>"`. `live-events.mjs` then gives `/wf campaign <brainstorm>` as the resume command, not `/wf yolo <slug>` (live-events.mjs:194).
7. The agents of the wave (cross-unit reconcile, boundary, wave review) write to `.campaign-journal.jsonl` with `phase` and `wave`, as the boundary agents do today (campaign-boundary.js:57).
8. **States.** A unit is `running` while its walk runs, `waiting` while the wait agent merges, and `stopped` while it is parked. The park agent appends a `waiting` line to the unit's journal with the question id. `judgeSilence` (live-events.mjs:217-229) treats a newest `waiting` line as silent by design, as it treats `run-end`, so the watch does not report an inferred `run-end` after 20 minutes. The mod reads the journals of `running`, `waiting` and `stopped` units of a running wave, and shows the route or the question of each one (W5). Today it reads `running` units only (register.ts:721).
9. **INDEX.md.** The wave driver's copy of `CONTROL_FILE_RULE` covers only the unit's `00-index.md`. The stage agents do not write `.ai/workflows/INDEX.md`, so this shared file is never dirty in a worktree and never conflicts between two units. The boundary merge regenerates its rows from each slug's `00-index.md`, by the rule of `_boundary.md`.
10. **The driver's own decisions** (D27). The driver appends one campaign journal event for each decision that it takes without the person:

    | Event | Fields |
    |---|---|
    | `run-start` | `run`, `wave`, the units (written by `launch`) |
    | `park` | `key`, `kind`, `question`, `reason` |
    | `resume` | `key`, `question`, `by` |
    | `derived-need` | `key`, `from`, `through`, `before`, `why`, `source`, `late` |
    | `width` | `from`, `to`, `state`, `until` |
    | `wave-revert` | `key`, `merge`, the blockers |
    | `waiter` | `run`, `wave`, the open question ids |

    `buildRecap` (lib/campaign.mjs:413) keeps today's events, and today it keeps only `at`, `event`, `key` and `wave` of each event (:429). It gets a new list, `driver`, with the full fields of `park`, `resume`, `derived-need`, `width` and `wave-revert`. It leaves out `waiter`, `agent-start` and `agent-end`. Each unit of the recap also lists its open questions with their ids and its waits with their states. The session writes the recap in this order: the intent-bearing `decided` entries, the other `decided` entries, the driver's own decisions, each unit's stages and commits, the questions that hold, and the time against the forecast.

The mod writes `.read-ledger.jsonl` at the session root, not in a worktree (hooks/mod/register.ts:1434-1449). The wave driver's read-check report reads the main checkout's file for each unit. yolo reads `${projectRoot}`, which is the worktree in a campaign, so yolo misses these rows today.

### 5.10 Stop requests and pauses

Each stage agent reads two control files fresh: the unit's own `.control.json` and the campaign `.control.json`. The rules of yolo's stop clause (yolo.js:294) hold, with these scopes:

| Request | Effect |
|---|---|
| `scope: campaign`, stop | The run stops. The run returns `held: true`, `stoppedAt: stop-request`. |
| `scope: slug`, stop, `--then hold` | That unit parks with kind `slug-stop`, and asks "Continue <slug>?". |
| `scope: slug`, stop, `--then move` | That unit moves out with no question, with the route `moved by the person`. Every wait on it rejects, as in section 5.5a step 7. |
| `scope: wave` | For the session only. The run finishes. |
| `action: pause` (the usage guard, or the person) | The run stops. The run returns `stoppedAt: usage-pause`, and the open questions stay in the ledger for the next launch. |
| Width 0 from a stage agent or from `slice-done` (section 5.4a) | The same as `action: pause`. The outcome carries the reading's `until` and `reason`, and the session runs `pause <until> <reason>`. |
| The agent ceiling (section 5.12) | The run stops. The run returns `stoppedAt: agent-ceiling`, and the session launches again. |

**How the run stops.** The driver sets its `stopping` flag, then:

1. It resolves every open wait promise with `stopped` (section 5.6 step 7).
2. No new stage agent starts. Each walk returns at its next await.
3. For a stop that the driver made (width 0 from a stage agent, or the ceiling), a bookkeeping agent runs `await --wave <n> --cancel`. The command writes the cancel marker at `cancelPath`, and the waiter returns within 10 seconds. A stop from a control file reaches the waiter directly.
4. The deadlock check does not run while the run stops.

`launch` deletes the cancel marker of the wave.

The stop request of one slug comes from `<watch> control … stop <after> --campaign <b> --scope slug --then move|hold` (D28). `--then` is required with `--scope slug`. When the person asks to stop a slug and does not say what follows, the session asks "move it out of the wave, or hold it until you say continue?" before it writes the request. A request without `--then`, from an older watch, counts as `hold`.

The boundary agents keep the stop check of `campaign-boundary.js` (campaign-boundary.js:70-74).

### 5.11 The outcome

```js
{
  ok, mode, wave, campaignRunId, held, stoppedAt, reason,
  until,                                // with stoppedAt: usage-pause, from the budget reading
  agentsUsed,
  widthChanges: [{ readingAt, state, from, to }],
  units: [{
    key, slug,
    state: 'running' | 'stopped' | 'finished' | 'merged' | 'needs-fix',   // the ledger states
    park: null | '<kind of section 5.5>', moved,
    stoppedAt, reason, route, waitsFor,
    cleared: [{ slice, sha }],
    questions: [{ id, kind, asked, answer, by, move, waitedMinutes }],
    decisionDigest, runtimeEvidenceDeferrals, substantiveFailures, reconciled,
    clearingEventsSatisfied, subagentErrors, deferralPressure, steering,
    charterCheckpoints, readCheck, priorDriver, output,
  }],
  derivedNeeds: [{ key, from, through, before, why, source }],
  focus: [{ a, aSlice, b, bSlice, files }],
  waveReview: { scope: 'full' | 'contract-only', rubrics, raw, survived, verdict, fixed, open, path, questions },
  boundary: { quiet, merged, notMerged, needsFix, verify, asBuilt, fidelity, output },
  stopBeforeNextWave,
}
```

The unit fields carry the names of yolo's hand-back fields, so the hand-back rules of [yolo.md](../../../skills/wf/reference/yolo.md) Step 2 apply to each unit. The session writes the outcome to `.scratch/campaign/<campaignRunId>/wave-<n>/outcome.json` and runs `wave <n> record --outcome <path>`, for every outcome. `record` clears `waves[n].run` (D25). For an outcome with `held: true`, `record` writes only the unit states, the cleared slices and the questions, and the wave stays `running` for the next launch.

### 5.12 The agent ceiling

The driver counts its agent calls. Before it starts a step that runs more than one agent, it reserves the largest size of that step:

| Step | Reserve |
|---|---|
| A unit review or the wave review | 1 selection + one scout for each selected rubric + the contract and steering scouts + 12 refuters + 1 writer |
| The plan of one unit | one plan for each slice that has no plan + 1 plan bookkeeping + 1 orient + 1 reconcile |
| The boundary | 1 setup + one quiet check for each unit + 1 merge + 3 verify rounds + one revert step for each unit + 4 for the record + 2 for the output |

When the count plus the reserve is more than `agentCeiling`, the driver does not start the step, and it stops the run with `stoppedAt: agent-ceiling` (section 5.10). The relaunch then continues from the ledger and the disk. When every unit is finished, the relaunch runs `mode: 'boundary'` and uses no orient.

### 5.13 The session around the run

The session stays the person's partner while the run goes on. Most session commands write a file that every stage agent reads fresh, so they reach the run at the next stage agent with no change.

| Command | With the wave driver |
|---|---|
| `steer <key\|wave-<n>\|all>` | Unchanged. Each unit reads its own `steer.md` and the campaign `steer.md` at each stage agent. |
| `rule add\|remove` | Unchanged. The rules are for the session, through `status`. The driver does not read them. A rule for the code is steering. |
| `pause` and the usage guard | The run stops with `stoppedAt: usage-pause` (section 5.10). After the reset, the session runs `resume`, then `launch`, and the relaunch keeps each unit's state (D22). |
| Stop after this wave (`scope: wave`) | Unchanged. The run finishes the wave, and the session starts no next wave. |
| Stop the campaign (`scope: campaign`) | The run stops with `held: true`. The questions stay in the ledger. |
| Stop one slug (`scope: slug`) | `--then move` or `--then hold` (D28, section 5.10). |
| `away --words` | The session answers each question by the away column of section 5.5 (D26), with `decided <id>`. The unit continues in the same run. No relaunch. |
| `back` and `recap` | The recap of section 5.9 item 10. `back` then lists the steps that waited for the person: the cleanup, handoff, and each question that holds. |
| `status` after a compaction | `next.action: driving` while the run is live (D25). |

**A compaction while the run goes on.** The run and the session share one process, so the run continues through a compaction. `status` then gives `next.action: driving` with `{ wave, run, newestAt }`, before `merge-in` and `running`. The session shows where the wave stands, answers the open questions, and prepares `next.prepare`. It does not run `launch`, `merge-in`, or `unit <key> <state>` for a unit of the wave: the driver owns these steps. When `status` has open questions, it gives `next.action: ask` with the same `driving` field. With `driving`, the session records each answer with `reply` or `decided` only, and the driver continues the unit.

**`/wf yolo` on a slug of the run.** `campaign.mjs owner "<projectRoot>" <slug>` reads the ledger of each brainstorm of the repo (`.ai/workflows/*/work/campaign/ledger.json`). It returns `{ owned: true, brainstorm, wave, run }` when a live run (D25) drives the slug. Step 0 of `yolo.md` runs `owner` when the args have no `contextPath`. When the slug is owned, yolo stops before orient and names `/wf campaign <brainstorm>`, the session that drives the slug. A drive of the yolo path has `contextPath`, so the check does not stop it.

**Overnight.** The person runs `away`, and the run goes on. This is the flow until `back`:

1. Each unit walks its roster. A question with an away answer gets that answer at once, with `decided`, and its unit continues.
2. A question that holds gets a push notification. Only its unit, and the units that wait on it, stop. The others continue.
3. When the wave settles, the boundary runs: merge, wave verify, wave review, record and output. All of it stays on the wave branch, which is not the trunk, so the away limits allow it.
4. When a question holds, the wave does not settle, and the boundary waits for the person (D8).
5. The run returns. The session runs `wave <n> record`. It does not run the cleanup (worktree removal and `branch -d`), and it does not start handoff, because the away limits forbid a deletion and a push.
6. While the person is away, the session does not start the next wave. When the next wave is prepared, the session can run `wave <n+1> start` and `launch`, only when the away words name the next wave.

The computer must stay awake, and the Claude Code session must stay open, because the run ends with the session (section 12).

## 6. What the wave driver takes from yolo

Each row is one function of `yolo.js`. "Copy" means the code moves with no change in meaning, and only its paths become unit fields.

| yolo.js | Wave driver | Change |
|---|---|---|
| `heartbeatClause` (:114) | `heartbeat(u, …)` | The journal, run id and counter of unit `u`. New fields `driver`, `campaign`, and `heavy`. The label gets `@<slug>`. |
| `CONTROL_FILE_RULE` (:136) | Copy | For the unit's `00-index.md` only. Not for `INDEX.md` (section 5.9 item 9). |
| `steeringClause` (:156), `steeringDigest` (:220) | Copy | The campaign steer file is always present. |
| `campaignClause` (:254) | Copy | Always on. |
| `stopCheckClause` (:294), `stopKindOf` (:329) | Copy | Condition (d) stays as a guard (section 5.6). The clause also runs `budget` and the free check `await --max 0` (sections 5.4a and 5.5a). |
| `requiresClause` (:341), `promptFedLine` (:353) | Copy | — |
| `judgeLiveness` (:366), `deadDriverClause` (:397) | Copy | One verdict for each unit. |
| `DECISION_CONTRACT` (:418) | Copy | `by` for an answered escalation. |
| `POLICY` plan, implement, verify, review (:439) | Copy | The plan policy adds the `crossUnit` field. `update-deps` is not copied. |
| `ORIENT_RESULT` (:535), `orient` (:819) | `UNIT_ORIENT`, `orientUnit(u, { resume })` | No slice mode, no terminal types, no update-deps, no RCA branch. A resume orient keeps the run id and `seq`. The `MERGE_HEAD` check. |
| `ensureBranch` (:994) | Not copied | Every unit has a worktree on its unit branch (D19). |
| `reChallengeClause` (:1046) | Copy | — |
| `STAGE_RESULT` (:683), `runStage` (:1074) | `runStage(u, …)` | `crossUnit` and `budget` in the result. A "PARALLEL UNITS" clause names the other units and their plan files, which all exist (D23). An "ANSWERED ESCALATION" clause when the stage runs again after an answer. |
| `writeBackSliceStatus` (:1194) | Copy | Runs `slice-done` as its last command (D24). |
| `verifyClean` (:1262), `acKey` (:1281), `probeGaps` (:1297), `evaluateGate` (:1723) | Copy | — |
| `driveVerify` (:1319) | Copy | Inside a heavy slot. |
| `driveWallProbe` (:1411) | Copy | Inside a heavy slot. |
| `classifyDecisions` (:1445) | Copy | — |
| `driveReview` (:1509) | `reviewUnit(u, slice)`, copied, for every unit; `waveReview()`, new, for the wave | `reviewUnit` runs inside the walk over the unit's own commits, with at most 12 refuters (section 5.4 item 4). `waveReview` is section 5.8. |
| `runUpdateDepsExec` (:1634), `driveUpdateDeps` (:1673) | Not copied | No campaign packet form is update-deps. |
| `driveChain` (:1743) | `walkSlice(u, slice)` | Waits before implement; heavy slots; the slice clears before `slice-done`. |
| `collectDeferrals` (:1828) through `deferralPressure` (:1993), with `classificationIndex` (:1883), `isRuntimeEvidenceClass` (:1906) and `collectSubagentErrors` (:1967); `decisionDigest` (:2024) | Copy | Applied to each unit's results. |
| `charterCheckpoint` (:2095) | Copy | Also judges the carried decisions. |
| `clearingTripwire` (:2119) | Copy | — |
| Plan fan-out (:2396), `reconcilePlans` (:2187) | Copy, always on | Section 5.3 step 2 (D23). |
| `readLedgerReport` (:2287), `readCheckRows` (:2267), `runStartFromId` (:2262) | Copy | Reads the main checkout's read ledger (section 5.9). |
| `driveRoster` (:2468), work ordering (:2459) | `walkUnit(u)` | The bounded re-challenge sweep still runs after the unit's real work. |
| Hand-back assembly (:2548-2648) | `unitOutcome(u)` | One for each unit. |

From `campaign-boundary.js`, the wave driver takes `quietRun`, `merge`, `waveVerify`, `revertStep`, `asBuilt`, `refute`, `fidelity`, `waveOutput`, `slugOutput` and `drift`. The prompts stay the same, and the agents keep following `_boundary.md`.

## 7. Files

| File | Change |
|---|---|
| `skills/wf/workflows/campaign-wave.js` | New: the wave driver. |
| `scripts/stage-yolo-driver.mjs` | Add `campaign-wave` to `DRIVERS` (:46). |
| `scripts/campaign.mjs` | W0a: the ledger lock around every command that changes the ledger (D20); a retry of the rename in `writeAtomic` on `EPERM` and `EBUSY`; the pid check of `withRecordsLock` in `lock`; `decided <id>` also answers the open question `<id>`; `ask` returns an open question with the same id and text; `merge-in` leaves the run-time files out of its dirty check. W1: `wave <n> launch` (section 5.1), `slice-done` (section 5.6a), `merge-in --at <sha>`, `needs <key> add\|list\|remove` (section 5.7), `contract <key> amend`, `wave <n> record --outcome <path>`, `await --wave <n> --max <seconds>` and `await --wave <n> --cancel` (section 5.5a), `question <id> consumed`. `ask` gets `--unit`, `--kind`, `--stage` and `--slice`. `reply` gets `--by` and `--move`, and appends an `answered` event to the campaign journal. `launch` writes `waves[n].run` and refuses with `run-live`; `record` clears it; `await` appends the `waiter` line (D25). `owner <slug>` (section 5.13). `back` lists the cleanup, handoff and the questions that hold. |
| `lib/campaign-records.mjs` | `withRecordsLock` (:252) is the lock of D20, on `work/campaign/ledger.lock`. |
| `lib/campaign.mjs` | Derived needs entries in the ledger (`units[key]['derived-needs']`), with a slice-level cycle check. `units[key].cleared`. The wait states `open`, `ready`, `met`, `rejected`, with `sha`. `waveWaits` opens waits from both kinds of entry, and marks a wait `ready` when its slice cleared. `replan` drops a derived entry that a packet now declares. `waves[n].focus`. `amended-contracts` in the context file. `wave launch`, `wave record` and `await` logic as pure functions. `campaign.driver` read from the config. `nextAction` (:630-650) gives `driving` while `waves[n].run` is live, before `merge-in`, and adds the `driving` field to `ask` (D25). `runLive(ledger, journals, now)` as a pure function. `buildRecap` (:413) gets the `driver` list and the questions and waits of each unit (section 5.9 item 10). |
| `schemas/sdlc-config.schema.json` | W0a: the four isolation keys that the code reads but the schema refuses: `quiet-suites`, `outside-root`, `worktree-root`, `build-depth` (`isolationOf`, lib/campaign.mjs:776-797). The refusal gives a warning only, because `loadConfig` is not strict (lib/config.mjs:224-230), but campaign.mjs:215-216 tells Windows users to add these keys. W1: `campaign.driver: yolo \| wave`. |
| `lib/live-events.mjs` | `stageOf` (:60-75) strips `@<slug>` from the slice. The `stop` event (:194) takes the resume command from `driver` and `campaign`. `judgeSilence` (:217-229) treats a newest `waiting` line as silent by design. |
| `scripts/yolo-watch.mjs` | `control … stop --scope slug` requires `--then move\|hold` and writes it into the request (D28). Only when P10 fails: the transcript finder (:172-216) reads the slug from the prompt's first line. |
| `skills/wf/reference/yolo.md` | Step 0: without `contextPath`, run `campaign.mjs owner`, and stop when a live wave run owns the slug (section 5.13). |
| `lib/cost-ledger.mjs` | An agent that wrote nothing is booked by the `@<slug>` of its label, not by the run's last write (:420, :427). A wave agent with no `@<slug>` is booked to the campaign. |
| `hooks/mod/live/register.ts` | W0a: the worktree path in `pollCampaign` (:723). It tries `.scratch/campaign/<run-id>/wt/<slug>/`, but the worktrees are at `<worktree-root or .scratch/cw>/<stamp>/w<n>-<i>` since v9.182.0. Use `ledger.units[key].worktree.path`. W5: read the journals of `running`, `waiting` and `stopped` units (:721), and show the slot holders from the `heavy` field. |
| `skills/wf/reference/campaign/_drive.md` | New: the procedures of the wave driver's own agents: unit orient and resume orient, the cross-unit reconcile, each bookkeeping agent of section 5.2, the merge-in conflict, the waiter, and the "ANSWERED ESCALATION" rule for each park kind. |
| `skills/wf/reference/campaign/_boundary.md` | New section "Wave review" (section 5.8: the attribution, the scope, the scout rule, the wave review record, the `dont-ship` rule). The as-built note lists the wave review findings of its unit. The try-it note lists the open ones. The header names the wave driver. |
| `skills/wf/reference/campaign/_waves.md` | "Run a wave" steps 3–6 become: launch (and what to do when it is blocked, paused, or refused for isolation), then run the wave driver, then record, then the cleanup of step 6. The width rules of step 5 move into the driver (section 5.4a). A run that returns `stoppedAt: usage-pause` makes the session run `pause <until> <reason>`, then launch the wave again after the reset. A new section "Questions while the run goes": at each `asked` event of the watch, ask the person with the full context, then run `reply --by person`, or `reply --by person --move` when the person moves the unit out; when the person is away, answer by the away rules with `decided <id>`. A new boundary step: write each derived needs entry of the outcome into its packet through `/wf brainstorm <brainstorm-slug> add`, then `replan`. Run `record` for every outcome, also a held one. While the person is away, leave the cleanup of step 6 and handoff for `back`. |
| `skills/wf/reference/campaign.md` | The description, the hosts note, "What the campaign is", the unit states, the new commands, and the files (`work/campaign/review/wave-<n>.md` and `.yaml`). The `next.action` table: a new row `driving`, and the `ask` row with `driving` (section 5.13). "Away mode": step 2 answers by the away column of section 5.5; step 3 records an intent-bearing answer with `decided`, and the unit continues in the run with no relaunch; a new step sends one push notification for each question that holds; step 4 writes the recap in the order of section 5.9 item 10, then lists the steps that waited (section 5.13, "Overnight"). The stop request of one slug: `--then move\|hold` (D28). |
| `skills/wf/reference/campaign/_phases.md` | The width paragraph: the wave driver needs a contract (D19). The design amend launches the wave driver again. "Reopen pick-up" covers the derived needs entries that the session writes into packets through the brainstorm. |
| `skills/wf/reference/yolo/_commentary.md` | "In a campaign": the watch follows one wave run. |
| `skills/wf/reference/_host-invocation.md` (:50), `docs/site/guides/autonomous-drivers.html` (:96), `docs/site/reference/commands.html` (:113) | The sentences that say that the waves run yolo. W6 searches the other docs for the same sentence. |
| `dist/` | Build again in the same commit as each `lib/` or `scripts/` change (`npm run build`). |
| `CHANGELOG.md` | One entry for each release. |
| W8 only: `skills/wf/workflows/yolo.js`, `skills/wf/workflows/campaign-boundary.js` | Remove `contextPath`, `campaignControlPath`, condition (d), the contract scout and the campaign steer file from yolo. Delete `campaign-boundary.js`. |

## 8. Probes (W0)

| Probe | Question | Pass | When it fails |
|---|---|---|---|
| P9 | Do many awaits on plain promises, a promise queue whose size changes during the run, and more agent calls than the cap work in one Workflow run, with no lost call and no deadlock? Can the script return while an agent still runs? | A test run of 6 walks, slots that go from 2 to 1 to 2, and 30 short agents ends with every result. The answer to the second question is known. | Use `pipeline()` per unit and accept a fixed slice order. When the script cannot return while an agent runs, a stop waits for the waiter's current `await` call, at most 540 seconds, and the plan says so. |
| P10 | Does the label of a Workflow `agent()` reach the subagent's `meta.json` description, so that the watch's transcript finder sees `@<slug>`? | The description equals the label. | Keep the label `<stage>:<slice>` and put the slug in the prompt's first line. The finder then reads the prompt. |
| P11 | How many agents does one slice use, and how many does one review use? | Count the `agent-start` lines for each run in the SoccerManager wave 2 and 3 journals, with the review agents apart. A wave of 6 units stays under 900. | Lower the reserve of section 5.12, and say that a large wave runs in two launches. |
| P12 | Does the cost hook find the description of each subagent in `subagents/workflows/<run>/`? The hook lists the same folders (cost-ledger.mjs:394-397) where the watch reads `.meta.json` (yolo-watch.mjs:187-192). | The hook sees the description for each subagent. | Keep today's attribution and record the gap in the plan. |
| P14 | Can one Workflow agent call a 540-second Bash command 6 times in a row, with no engine time limit on the agent? What does one hour of waiting cost in tokens? | The agent returns after 54 minutes, and the cost for each hour is known. | Lower the number of calls of one waiter. Each new waiter costs one agent of the ceiling. |

### Results (2026-10-16 and 2026-10-17)

The probes ran in a cloud session, except P11, which reads the SoccerManager journals on the operator machine.

- **P9 passed.** 6 walks, slots that went from 2 to 1 to 2, and 30 short agents ended in 87 seconds with 30 of 30 results, no lost call and no deadlock. `Promise.allSettled` and a plain-promise gate worked. The script can return while an agent is queued: the engine then ends the run at once and drops that agent with no error. The driver therefore awaits every agent that it starts, also the event flush that a width change starts, and the harness test checks that no agent is out when the driver returns.
- **P10 passed.** The `description` of each `agent-<id>.meta.json` equals the label (`w2:0` gives "w2:0"). The file is beside `agent-<id>.jsonl` in `subagents/workflows/<run>/`. The transcript finder of the watch needs no change.
- **P11 is an estimate.** The journaled agents of one slice are 4 to 5 (median 4.3, from 25 yolo runs of SoccerManager). The review fan-out agents write no journal line, so the reserve of section 5.12 (26 for each review) stays. A wave of 6 units with 4 slices each and a review for each slice uses about 830 agents. A larger wave stops at `agent-ceiling`, and the next launch continues from the ledger and the disk.
- **P12 passed with P10.** The cost hook lists the same folders. W5 reads `agent-<id>.meta.json` and books a silent agent by the `@<slug>` of its label, and a silent wave agent to the campaign.
- **P14 passed with a change.** The Bash tool refuses a foreground `sleep 540`. A Node wait of 540 seconds is not refused: one agent ran it 6 times and returned after 54.4 minutes with no engine error. The cost was about 417k tokens for each hour, almost all of it cache writes: each wake after 9 minutes found the prompt cache gone. The waiter therefore runs `await --max 270` at most 12 times, so each wake stays inside the 5-minute cache.

P13 of the earlier draft is answered by the code: `merge-in` ignores untracked files and refuses any changed tracked file (campaign.mjs:723-724). W0a turns it into a test.

## 9. Waves

Each wave is test-first: write the test, see it fail, then write the code.

| Wave | Content | Tests |
|---|---|---|
| W0a | Its own release, before any driver work. The ledger lock (D20) and the rename retry. The pid check in `lock`. `decided <id>` answers the open question. `ask` with the same open id and text. `merge-in` leaves the run-time files out of its dirty check. The four isolation keys in the schema. The `pollCampaign` worktree path. These are live defects of the yolo path today. | Two processes that each run 50 `unit` and `reply` commands at the same time lose no change. A lock of a dead pid is taken over at once. `decided q1` closes the open question `q1`, with `by: session`. A second `ask q1` with the same text returns the open question. `merge-in` merges when only `.driver-journal.jsonl` and `commentary.md` changed, and refuses when a tracked source file changed, and ignores untracked files. A config with `worktree-root` passes validation. The live view finds a unit journal at its ledger worktree path. |
| W0 | Probes P9–P12 and P14. | — |
| W1 | CLI: `wave <n> launch`, `slice-done`, `merge-in --at`, `needs <key> add\|list\|remove`, `contract <key> amend`, `wave <n> record`, `await`, `question <id> consumed`, `ask --unit --kind --stage --slice`, `reply --by --move`. `campaign-wave` in `DRIVERS`. `campaign.driver` in the schema and in `lib/campaign.mjs`. The live run of D25: `waves[n].run`, `runLive`, `next.action: driving`, `owner`. The recap of D27. `--then` in the watch's stop request (D28). | `launch` adds each worktree, writes each context file, sets `branch` and `base-branch`, sets each unit `running`, and prints args that match section 5.1. Without a contract, it refuses with `isolation-required`. When one unit fails the disk check or the path check, it returns `blocked` with each unit and its cause, adds no worktree, and changes no file. With a `slow` reading, `width` is 1 and `widthMax` is the set width; with a `pause` reading, it returns `paused` and changes no file. A second `launch` reuses the worktrees, checks the disk only for new units, keeps `finished` and `stopped`, passes the questions, the cleared slices and the waits, and gives `mode: boundary` when every unit is finished. `slice-done` commits the records without the run-time files, records `cleared`, marks the waits on the slice `ready` with the sha, and returns the budget and the open answers; with local records, it syncs and commits nothing. `merge-in --at` merges that commit, not the tip. `needs add` writes a derived entry and opens its wait; does nothing for a matching entry; refuses a slice-level cycle; records a focus entry and adds no wait for a slice that passed its implement. After a packet declares the same entry, `replan` drops the ledger copy. `contract amend` reaches the context file of each unit that carries or expects the line. `record` applies an outcome file. `await --wave` returns an answer that `reply` writes, also for a question that was asked after the call started; returns `stopped` on a campaign stop or a pause, `paused` at width 0, `cancelled` after `--cancel`, `timeout` after `--max`; with `--max 0`, it returns at once; it does not return a consumed answer. `reply --move` records `move: true`, and `reply --by` records `by`. `stage-yolo-driver --driver campaign-wave` stages the file. A second `launch` while the newest journal line of the run is 5 minutes old refuses with `run-live`; at 25 minutes, it succeeds. A `waiter` line keeps the run live. `record` clears `waves[n].run`, also for a held outcome, which keeps the wave `running`. With a live run, `status` gives `driving`, not `merge-in`, also when a wait is `ready`; with an open question, it gives `ask` with `driving`. `owner <slug>` returns `owned: true` for a slug of a live run, and `owned: false` after `record`. `recap` lists a `park`, a `derived-need` and a `width` event with their full fields in `driver`, leaves out `waiter` lines, and lists each unit's open questions and waits. `control … stop --scope slug` without `--then` fails; with `--then move`, the request carries it. |
| W2 | The driver core: args, unit objects, copied clauses and schemas, copied pure helpers, `orientUnit` with the resume mode and the `MERGE_HEAD` check, the plan phase with the fan-out and the reconcile, `walkUnit` and `walkSlice` with the stage gates, `classifyDecisions`, the slice write-back with `slice-done`, the wall-probe sweep, the charter checkpoint, `reviewUnit` for slug-wide and per-slice units, the heavy slots and their table, the budget readings, the stop checks, the ceiling reserve, `allSettled` and the `driver-fault` park, the unit outcome. | A whole-script harness (section 10). Two independent units, width 2: at most 2 heavy agents at once; every plan, scout and bookkeeping agent runs outside a slot; every plan of both units ends before the first implement. A slug-wide unit runs one review after its last verify, over its own commits only, and writes `07-review.md`; a per-slice unit writes `07-review-<slice>.md` after each verify. A review with 20 findings runs at most 12 refuters. A `dont-ship` unit review parks the unit with kind `review`; an answer that accepts the findings runs only the writer, and the unit finishes. A deferral-only partial verify proceeds; a deferral with no probe gets one corrective round, then a hard-stop. Width 3, three units: after a stage agent returns `slow`, the agents in slots end, and then at most 1 heavy agent runs at once; after a later `ok`, up to 3 run again; `widthChanges` lists both changes. A stage agent that returns width 0 stops the run with `stoppedAt: usage-pause` and `until`. A stop with `scope: campaign` stops both walks; `scope: slug` parks one with kind `slug-stop`. When the count plus the reserve of a review passes the ceiling, the review does not start, and the run stops with `stoppedAt: agent-ceiling`. A walk that throws parks its unit with kind `driver-fault`, releases its slot, and the other walk finishes. A resume orient keeps the run id, and `seq` counts on. Every unit label ends with `@<slug>`, every journal line has `stage` and `slice`, and every heavy agent's `agent-start` line has `heavy: true`. The records commit runs at the end of each slice and leaves out the run-time files. The charter checkpoint judges the carried decisions. The read-check report reads the main checkout's read ledger. A `through: finished` wait resolves after the unit end agent. The parity tests of section 10. |
| W3 | The cross-unit reconcile, derived needs entries, waits and `merge-in --at`, the merge agent for a conflict, parking with every kind, the resume actions, the waiter and the free checks, deadlock detection, the stop of open waits. | B's slice 2 waits for A's slice 1: no implement of B's slice 2 starts before A's slice 1 cleared and the merge-in returns `ok`; the merge-in merges the sha of the cleared slice, also when A's slice 2 committed after it. The cross-unit reconcile finds a shared file in two plans, and the later unit gets a derived entry before any implement; `derivedNeeds` lists it. A wait on a slice that cleared in an earlier run is `ready` at once. A conflict runs the merge agent, then `merge-in` again; an abort parks B with kind `merge-conflict`, and each unit that waits on B keeps waiting. An intent-bearing stop in A parks A, asks one question with id `w<n>-<A>-1`, and an independent C finishes. While A is parked, B, which waits on A, keeps waiting. When the mock waiter returns an answer, A's resume orient and the stopped stage run again, the stage prompt carries the "ANSWERED ESCALATION" clause with `by`, A finishes, and B continues, all in the same run. For implement, the clause carries the slice start sha. An answer from a free check resumes A with no waiter answer. An answer that the waiter and a free check both report resumes A once. An answer with `move` parks B with kind `moved-dependency`. A question asked while the waiter runs reaches the waiter. Only one waiter runs at a time, and after 6 calls a new waiter starts. A campaign stop resolves the open waits with `stopped`, parks no unit, ends the waiter, and the run returns `held`. A ceiling stop writes the cancel marker. `crossUnit` of kind `contract` parks the unit and creates no entry; an approved contract change reaches the other units' context files. An entry that closes a cycle parks the unit with kind `needs-cycle`. Two waits that can never resolve park both units with kind `deadlock`; a waiting unit whose dependency has an open question is not a deadlock. Each park appends a `park` event, each resume a `resume` event, each derived entry a `derived-need` event, and each change of the slots a `width` event. A stop request of one slug with `--then move` moves the unit out with no question, and its waiters park with kind `moved-dependency`; with `--then hold`, the unit parks with kind `slug-stop` and one question. A request without `--then` counts as `hold`. |
| W3L | Live probe: one wave of two units with one `needs`, with `stopBefore: 'boundary'`. The session then runs `campaign-boundary.js` as today. | The waits, the merge-in, and one answer inside the run work on a real run. The measures of section 11 that do not need the boundary. |
| W4 | The boundary setup, the boundary steps from `campaign-boundary.js`, the wave review, the hold of D8, `mode: boundary`, mode `drift`. | The boundary setup agent runs `wave <n> set boundary`, `worktree wave-<n> add` and `merge-order <n>`. The merge regenerates `INDEX.md`. The wave review attributes a file that came through a merge-in to the unit that wrote it. With no shared file, no merge-in, no needs and no focus, only the contract and steering scouts run. Every scout prompt carries the rule "only findings across two or more units", and a refuter refutes a finding that one unit's diff alone shows. The writer writes `review/wave-<n>.md` and its `.yaml`, and changes no unit's review record. A `dont-ship` blocker on one unit that no other unit merged in reverts that unit, which becomes `needs-fix`, and the others stay merged. A blocker on two units, or on a unit that another unit merged in, asks a wave question, the run waits, and the answer runs the writer again. The as-built note lists its unit's wave findings. A parked unit holds the boundary. A relaunch with every unit finished runs `mode: boundary` and no orient. The boundary tests that do not exist today: merge order with a carried unit, the revert search with one breaker, the quiet-window failure, F3 `stopBeforeNextWave`. |
| W5 | The readers: `live-events.mjs`, `cost-ledger.mjs`, `register.ts`; `yolo-watch.mjs` only when P10 failed. | A line with `@<slug>` gives the right stage and slice. A wave driver stop gives `/wf campaign <b>`. A newest `waiting` line gives no inferred `run-end` after 20 minutes. A silent scout is booked to its own slug, and a wave agent to the campaign. The mod shows `waiting` and `stopped` units with their route or question, and the slot holders. |
| W6 | The references and the docs of section 7, with the away mode and the `driving` action of section 5.13. `campaign.driver` default `yolo`. | `requires-tables` and the doc tests pass. The eval case `campaign` still passes. A doc test finds no "relaunch the drive" in the away mode of `campaign.md`. |
| W7 | Live run: one wave with two or more units and one `needs`, on SoccerManager or Secbot, with `campaign.driver: wave`. The person runs `away` for one part of the run, and one compaction happens while the run goes on. | The measures of section 11. After the compaction, the session runs no second `launch`. While away, each question gets its away answer or holds with a push notification, and the session runs no cleanup. `back` shows the driver's own decisions. |
| W8 | Cutover, as its own release: default `wave`; remove the campaign code from `yolo.js` and its tests; delete `campaign-boundary.js`. The setup asks for an isolation contract for every campaign (D19). | `yolo-campaign.test.mjs` is deleted with the code that it tests. `yolo-stop-request` and `yolo-gates` still pass. |

Release rules: a change to `scripts/` or `lib/` needs `dist/` built again in the same commit, and a schema change changes the `buildId` (`runtime-parity.test.mjs`). Stage files by path. Do not use `git add -A`, because other sessions edit this tree at the same time. A release is done only when `origin/master` carries it.

## 10. Tests

**The whole-script harness.** The pattern of `tests/unit/skills/yolo-artifact-split.test.mjs:36-62`: build the script as an `AsyncFunction` with `args`, `agent`, `log`, `phase` and `parallel` injected. The mock `agent` answers by the label (`plan:s1@a`, `verify:s1@a`, `bookkeeping:…`, `scout:correctness`), records each call with its start and end order, and can hold a call open, so a test can check what runs at the same time. A new file `tests/unit/skills/campaign-wave.test.mjs` holds the scenarios of W2–W4.

**The parity tests.** The two drivers share no code (D1), so a fix in one copy can miss the other. `tests/unit/skills/driver-parity.test.mjs` extracts the copied pure helpers from both files with the `extractFn` pattern (`yolo-campaign.test.mjs:15-29`): `verifyClean`, `acKey`, `probeGaps`, `evaluateGate`, `collectDeferrals`, `reconcileDeferrals` with `classificationIndex` and `isRuntimeEvidenceClass`, `collectSubstantiveFailures`, `collectSubagentErrors`, `decisionDigest`, `judgeLiveness`, `readCheckRows`, `runStartFromId`. A helper that calls another helper is extracted together with it. The test runs one table of cases against each copy, and both copies must give the same answers. The test does not share code. It only shows when the two copies differ. When a difference is intended, the case table names it.

**The CLI tests.** `tests/unit/campaign-driver-cli.test.mjs`, with the `makeRepo()` pattern of `campaign-run-fixes-cli.test.mjs:45`, which has the isolation and local-records options. The ledger lock test of W0a starts two child processes.

## 11. Measures

Measure on the W7 run. Compare with SoccerManager waves 2 and 3.

| Measure | Today | Target |
|---|---|---|
| Session steps for each wave between "start" and handoff | 10 for each unit, plus the boundary | 4: `launch`, the run, `record`, the cleanup; plus one `reply` for each question, and the derived needs entries through the brainstorm |
| Relaunches for a wait | 1 for each wait | 0 |
| Time from the needed slice's clear to the merge-in | From the watch's event to the session's next turn | Under 2 minutes |
| Merge-ins of unverified code | Possible (the tip) | 0: each merge-in merges the cleared sha |
| Reviews of the merged wave diff before handoff | 0 | 1 |
| Conflicts found first at the boundary | 1 (`ROWS_FORMAT`) | 0: the cross-unit reconcile finds them |
| Undeclared needs found only when the person asks | 3 (wave 3) | 0: the driver creates each one |
| Agents for each wave | From P11 | At most the yolo count, plus the cross-unit reconcile, the wave review, one waiter for each hour of open questions, and one resume for each answer |
| Units that stop the whole drive for one question | Every intent-bearing stop | 0: only the unit parks |
| Time from the person's reply to the next agent of the unit | The session's next turn, then a relaunch | Under 1 minute |
| Relaunches for an escalation | 1 for each escalation | 0 |
| Lost ledger changes | Not measured | 0 |
| Tokens to run a stopped stage again after its answer | Not measured | Measured, for Q8 |
| Tokens of one hour of waiting | Not measured | Measured, for Q12 |
| Heavy agents that start after a `slow` reading, while another heavy agent runs | 0 at the next drive start, but a drive that runs keeps its full work | 0, from the next stage agent |
| Compaction summaries that restate the per-unit steps | Most of 11 | 0 |
| Second launches of a live run | Not measured | 0 |
| Hours that the boundary waits while away, for a question with an away answer | Not measured | 0 |
| Driver decisions that the recap does not show | Not measured | 0 |

## 12. Risks

| Risk | Answer |
|---|---|
| The copied helpers drift from yolo's | The parity tests (section 10). After W8, the campaign code leaves yolo, so each copy has one owner. |
| The scheduler hangs | Deadlock detection (section 5.6 step 6). A stop resolves every open wait (step 7). P9 checks the engine. |
| The session and the driver change the ledger at the same time | The ledger lock (D20), shipped first in W0a. |
| The 1000-agent cap | The reserve of section 5.12 and a clean stop. P11 measures. `mode: boundary` avoids the orients of a relaunch. |
| A launch again repeats work | `launch` keeps each unit's state (D22). Each unit orient skips the stages that are clean on disk, as yolo does. The bookkeeping commands are safe to run twice: `unit <key> <state>` sets a state, `ask` returns the open question, `needs add` does nothing for a matching entry, and `merge-in` refuses a closed wait. |
| The plan phase waits for the slowest unit's plans | Plans are light and take no heavy slot. The cross-unit reconcile needs every plan, so the barrier is the price of finding shared files before code exists. |
| A plan written before the earlier slices exist goes stale | yolo's plan reconcile already handles this for one slug, and the wave driver copies it (D23). A re-plan during the walk reports `crossUnit`. |
| Two reviews use more agents than one | The wave review runs only the contract and steering scouts when the units share nothing (section 5.8 step 2). The refuter limit and the reserve bound the count. |
| The wave review and a unit review disagree about one finding | The unit review judges the unit's own commits. The wave review refutes a finding that one unit's diff alone shows (section 5.8 step 5), so the two reviews do not judge the same finding twice. |
| The cost record books silent agents to the wrong slug | W5 changes the attribution (P12). |
| A long wait for an answer costs tokens and holds one engine slot | One waiter serves all open questions. Each call blocks for 540 seconds, so an hour of waiting is about 7 tool calls and one agent. P14 measures the cost, and Q12 decides. |
| The session ends while the run waits | The run ends with the session. The questions stay in the ledger. The next launch passes them, each unit goes straight to its state, and the waiter starts again on the open questions. |
| One run holds a whole wave, so a fault in the script stops every unit | A fault in one walk parks only that unit (`driver-fault`). A fault outside the walks stops the run, and a launch again continues from the ledger. `campaign.driver: yolo` stays until W8. |
| Two drivers work in one worktree: a second `launch` after a compaction, or `/wf yolo <slug>` from the person | `waves[n].run`, `next.action: driving`, the `run-live` refusal, and the `owner` check of `yolo.md` (D25). |
| A run that died stays "live", so `launch` refuses | The run is live only while its journals have a line in the last 20 minutes. The refusal names the age of the newest line, so the session knows when to launch again. |
| An away answer takes a wrong turn overnight | Every away answer is recoverable and runs once for each unit and kind (D26). The recap lists each one first, with its rule, and nothing reaches the trunk before `back`. |
| A held question stops the wave all night | Only its unit and the units that wait on it stop. The push notification reaches the person. The boundary waits by D8. |
| A project cannot build in a worktree | Before W8, the yolo path stays. W7 and the setup question show whether such a project exists. After W8, such a project cannot run a campaign until it fixes its build paths. |

## 14. As built (v9.186.0)

Where the code differs from the text above, the code is the truth.

| Item | As built |
|---|---|
| Cutover | One release with W1–W6 and W8 (PO 2026-10-16). There is no `campaign.driver` key and no yolo path for a wave. `campaign-boundary.js` and `yolo-campaign.test.mjs` are deleted. yolo has no `contextPath`, no `campaignControlPath`, no condition (d), no contract scout and no campaign steer file. `stage-yolo-driver` stages `yolo` or `campaign-wave` only. |
| D19 | `orient` records the tool gap `isolation` when the project has no usable contract. `launch` refuses with `isolation-required`. |
| Condition (d) | The open-wait check applies to the implement stage only. A plan needs no merged code. |
| `await --seen` | The waiter passes the ids of the questions that the driver already has, so an answer that the driver saw does not return again. |
| Waiter cost | `await --max 270`, at most 12 times for each waiter agent (P14). |
| `question consumed` | The resumed stage agent runs it. There is no separate agent for it. |
| `launch --mode drift` | Gives the args of the drift check only, with no worktree. |
| Slug stop | A "continue" answer to a `slug-stop` question needs the session to clear the stop request first. A request without `--then` counts as `hold`. |
| Plan fan-out | The `crossUnit` list of a plan agent is not used. The cross-unit reconcile after the plans covers it. |
| Width events | A width change flushes its event at once, on one chain that the driver awaits before it returns (P9). |
| Waiter cancel | A `cancelled` result with no stop of this run stops the run with `waiter-cancelled`, so no parked unit waits for ever. |
| Tests | `tests/unit/skills/campaign-wave.test.mjs` runs the whole driver with a mock agent (36 scenarios of W2–W4). `driver-parity.test.mjs` keeps 23 copied helpers equal to yolo's. `campaign-wave-cli.test.mjs` covers W1. |

## 13. Questions

The PO answered Q1–Q6 and Q9–Q11 on 2026-10-16.

| # | Question | Answer |
|---|---|---|
| Q1 | One wave review with a writer for each unit, or a full review for each unit plus a wave review? | **A review for each unit plus a wave review** (D9). The recommendation was the wave review alone. |
| Q2 | When the driver finds a shared file that no `needs` names, what does it do? | **It creates a needs entry** (D10): in the ledger at once, and in the packet through the brainstorm at the next wave boundary. A contract change still parks the unit and asks. |
| Q3 | When a unit parks, does the boundary wait for the person, or does the wave ship without the unit? | **Wait** (D8). |
| Q4 | Keep the parity tests, although the drivers share no code? | **Yes** (D14). |
| Q5 | Remove the campaign code from `yolo.js` at the cutover? | **Yes** (D13, W8). |
| Q6 | A unit that cannot get a worktree at launch (disk or path)? | **Block the launch** (D15). The recommendation was to move the unit to the next wave. |
| Q7 | Should the bookkeeping agents use Haiku 5.5? | Open. Not in this plan: Haiku routing is a proposal of its own (2026-10-08), and the bookkeeping agents use Sonnet, as yolo's mechanical agents do. |
| Q8 | Build a blocking escalation tool (an MCP server or a mod tool) that a stage agent calls and that blocks until the answer? | Open. Recommendation: no (D17, section 5.5b). Decide after W7 measures the cost of a second run of a stopped stage. |
| Q9 | Without an isolation contract, how does the wave driver run? | **It needs a contract** (D19). The earlier draft held the main checkout with a lock, and the review showed that the lock breaks with committed records. |
| Q10 | Which findings of the 2026-10-16 review go into the plan? | **All of them, and the improvements** (D20–D24, section 5.12, W0a, W3L). |
| Q11 | Ship the fixes that do not need the driver first? | **Yes, as W0a** (D20). The cost attribution stays in W5, because it needs the `@<slug>` label of P10. |
| Q12 | Start the waiter only when no walk can make progress, to save the engine slot? | Open. Recommendation: no, because an answer could then wait for the end of another unit's slice (section 5.5a). Decide after P14 measures the cost of a waiter. |
