# YOLO-COMMENTARY-PLAN — a built-in watch and running commentary for yolo and campaign

Status **W0–W3 and W5 shipped v9.178.0; W4 run on the campaign trial 2026-10-03 — see section 7** · Date **2026-10-02** · Plugin **v9.176.0** · Owner **jayte**
Used by: [WF-CAMPAIGN-PLAN.md](WF-CAMPAIGN-PLAN.md), section 20. This plan is Stage B2 of the campaign plan (section 5): it ships first, and it helps single-slug yolo runs without the campaign.

## 1. Why

In SoccerManager session `e06c6e80-9cec-4a8b-a402-2e6fd6ba94e2`
(2026-09-30 → 2026-10-02), the person ran `/wf yolo engine-modules`. The
person then asked "give me running commentaries as each stage completes".
The main session built a watch by hand and kept it alive for about two days.
The commentary was useful:

- **Stage ends.** After each stage ended, the main session read the stage's record. It then said in plain words what the stage built, what it decided, and how many errors it recovered from, for example "Implement on fast-model ended at 21:05 UTC … It made 7 commits."
- **Intent-bearing decisions.** The commentary flagged them: "One decision needs your attention. The stage recorded decision D6 as intent-bearing."
- **Commits.** It narrated each new commit in one or two sentences.
- **Notifications.** It sent a push notification when a stage was about to write to `PRODUCT.md`, which held the person's uncommitted edits.
- **Questions.** The person asked questions between events, for example "What suite runs 3 times". The person also steered the run, for example "Stop yolo after the current verify, add this to steer.md then restart yolo".

The hand-built watch had these costs:

| Problem | Evidence |
|---|---|
| `tail -F` missed journal lines on Windows | "The watch missed two events" (2026-09-30 21:12). Replaced by a 20-second poll loop. |
| The Monitor tool expires after 30 minutes at most | 459 Monitor calls. 415 assistant messages only said that the watch was re-armed. |
| The watch grew by hand | Four versions: journal only → polled journal → journal and commits → journal, commits, and a hash of `PRODUCT.md` and `DESIGN.md`. |
| The person had to ask for it again | After each yolo relaunch, the person or the main session re-armed the watch. |
| No graceful stop | "Stop yolo after the current verify" had no mechanism. yolo has no stop-at-next-boundary request. |
| The commentary did not survive compaction | The session compacted at least twice. The commentary existed only in chat. |

## 2. Goal

`/wf yolo <slug>` starts the watch and the commentary by itself. `/wf campaign` uses the same watch over several slugs. The person never builds or re-arms a watch.

## 3. Parts

### 3.1 The watch script

Add `scripts/yolo-watch.mjs`, a Node script that runs on Windows, macOS, and Linux.

```
node <pluginRoot>/scripts/yolo-watch.mjs <projectRoot> <slug> [<slug> ...] [--since <seq>]
```

- **S1.** Poll; do not tail. Read each `.driver-journal.jsonl` by byte offset every 5 seconds. Poll the git HEAD of each worktree or checkout every 20 seconds. A poll does not depend on file-change events, so it works on Windows.
- **S2.** Write one JSON line to stdout per event. The events are listed in 3.2. Write nothing else, because every stdout line becomes a chat notification.
- **S3.** Persist the offsets to `.ai/workflows/<slug>/.watch-state.json`. A re-armed watch starts where the last watch stopped and misses no event.
- **S4.** Exit by itself when the run ends. That is, the journal shows the driver's last agent ended, or the driver's outcome is written. The last line is the `run-end` event.
- **S5.** Read the protected-file list from `steer.md` and from `yolo.protectedFiles` in `.ai/sdlc-config.json`. Hash these files every 20 seconds. Detect the person's uncommitted edits at start with `git status --porcelain`.

### 3.2 Events

| Event | Source | Commentary |
|---|---|---|
| `stage-start` | journal `agent-start` for a stage agent | One line: the slice, the stage, the time. |
| `stage-end` | journal `agent-end` | The full stage note (3.3). |
| `commit` | new commits on the branch | One or two sentences per commit. |
| `decision` | a stage record with an `intent-bearing` decision, or `awaiting-input` | A full note and a push notification. |
| `protected-change` | a protected file hash changes | A full note and a push notification. |
| `stale` | no journal line for longer than the liveness rule allows (`_control-file-ownership.md:24-40`: the run's longest gap, with a 20-minute floor). A `lock-wait` journal line (campaign plan, section 13) counts as activity. | A warning and a push notification. |
| `stop` | a HARD-STOP or a hand-back in the outcome | Why the run stopped, and the resume command. Push notification. |
| `run-end` | the driver ended | The run summary. Push notification. |
| `usage` | the newest reading in `~/.claude/sdlc/usage/` crosses a budget line (campaign plan, section 17; from its Stage D3) | One line with both windows and their reset times. A pause gets a full note and a push notification. |
| `usage-reset` | the reset time of a pause passes, or a new sample is under the budget | The main session resumes the run. One line. |

Scout, classifier, and branch agents produce no event. In the session they were noise.

### 3.3 The commentary rules

Add `reference/yolo/_commentary.md`. The main session follows it when an event arrives.

- **C1.** For `stage-end`, read the stage record (`04-plan`, `05-implement`, `06-verify`, or `07-review`), then say:
  - what the stage built or found
  - what it decided, with the class of each decision
  - how many errors it recovered from, and whether any error stopped it
  - what comes next
- **C2.** Use plain words and STE. Explain a term the person has not seen. The session's best notes did this, for example "My guess was wrong: this slice is not about engine speed."
- **C3.** Say nothing when the watch is re-armed. A re-arm is not news.
- **C4.** Append each note to `.ai/workflows/<slug>/commentary.md` with its time. After a compaction, the main session reads this file to continue the story. The person can read the file later.
- **C5.** Send a push notification only for `decision`, `protected-change`, `stale`, `stop`, and `run-end`. These are the events that change what the person does next.
- **C6.** Answer the person's questions between events from the records, not from memory. The Monitor events do not block the conversation.

### 3.4 Stop at the next boundary

Add a stop request. The person says "stop after the current verify", or "stop after this stage", in chat.

- **G1.** The main session writes `{action: "stop", after: "<stage>|current"}` to `.ai/workflows/<slug>/.control.json`. The campaign's usage pause uses the same file ([WF-CAMPAIGN-PLAN.md](WF-CAMPAIGN-PLAN.md), section 17.4). A plain yolo run can use it for a usage pause too: on a usage-limit error, the main session writes `{action: "pause", reason, until}`.
- **G2.** The Workflow script has no file access (`yolo.js:18-23`), so the driver cannot read the file itself. Every agent prompt tells the agent to read the control file first, fresh, by path, as it reads `steer.md`. When the condition is met, the agent does no work and returns `status: "stopped"`. The driver then ends cleanly with `stoppedAt: 'stop-request'`. The main session deletes the file.
- **G3.** The commentary reports the stop and the resume command. A steering change written at the same time reaches the next run through `steer.md` as today.

This is a control file, not a steering instruction. A steering instruction tells the stages how to work. A stop request tells the driver when to end.

### 3.5 Where it starts

- **yolo.md.** After the `Workflow(...)` call, start the watch with `Monitor`, with `timeout_ms` at the 30-minute maximum. When a watch expires and the run is still live, re-arm it without a chat message (C3).
- **Relaunch.** A yolo relaunch re-uses the same watch state (S3). The person does not ask for the watch again.
- **Opt-out.** The person says "quiet" to end the commentary. The watch keeps running for `stop`, `stale`, and `run-end` only. Convention over flags.
- **Host.** The Monitor tool is Claude Code only. yolo is Claude Code only too. On a host without Monitor, the watch does not start, and the run is unchanged.

## 4. In the campaign

The campaign runs the same script over every slug in the active wave and over the campaign journal.

- **K1.** One watch per wave: `yolo-watch.mjs <projectRoot> <slug-1> <slug-2> ...`. In the campaign's Stage C the source is the main checkout. From Stage D1 each slug's worktree is its source.
- **K2.** For parallel slugs, a `stage-end` gets one line, not a full note. Three slugs at once would otherwise flood the chat. The full note comes at a slug's `run-end`.
- **K3.** Campaign events get full notes:
  - `wave-start`
  - `merge`
  - `wave-verify`
  - `drift` (with the class)
  - `fidelity` (with each narrowed or dropped decision)
  - `wave-end`
  - `wave-ready` (the version, the tag, and the try-it note; push notification)
  - `work-changed` (the brainstorm's `work-revision` changed: what was added, and which packets need prepare; push notification)
  - `pr-opened`, `ci-result`, `merged`, `released` (push notification), and `asked` (push notification), from handoff and ship (campaign plan, section 16.5)
  - `refuter` (the refuter's verdict on an as-built note or a fidelity checkpoint; campaign plan, section 11.3)
  - `prepare-waiting` (slugs of the next wave wait for prepare; push notification)
- **K4.** Campaign notes append to `work/campaign/commentary.md`. Each slug's notes also go to its own `commentary.md`.
- **K5.** A stop request can name one slug, the wave ("stop after this wave"), or the campaign.
- **K6.** The watch runs only in the campaign session (campaign plan, section 8). While the person prepares slugs in that session, the commentary gives one line per event, and holds the full notes until the prepare batch ends. Push-notification events still notify at once.

## 5. Build waves

| Wave | Content |
|---|---|
| W0 | Red-first tests for `yolo-watch.mjs`: offsets survive a restart; no event is lost across a re-arm; the script exits at run end; a stale journal emits `stale`; the script runs on Windows paths. |
| W1 | `yolo-watch.mjs` and the event set. |
| W2 | `reference/yolo/_commentary.md`, the yolo.md start and re-arm rules, `commentary.md`, and the "quiet" opt-out. |
| W3 | The stop request (G1–G3) in `yolo.js` and yolo.md. Add a test that the driver ends cleanly at the boundary. |
| W4 | Live run on one SoccerManager slug. |
| W5 | The campaign parts (K1–K6), built with the campaign plan's steps C3–C7, and the worktree sources with step D1. |

## 6. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Is the commentary on by default? | Yes. The person asked for it, and "quiet" turns it off. |
| Q2 | Is `commentary.md` committed? | Yes. It is the person's record of the run, like the stage artifacts. |
| Q3 | Which files are protected by default? | `PRODUCT.md`, `DESIGN.md`, and any file with uncommitted edits when the run starts. |
| Q4 | Could a mod replace the Monitor watch? A mod timer runs between turns without starting one (`$.clock.every`), reads the journal with `$.fs.read`, shows a status line entry and toasts, and wakes the session with `$.prompt.submit`. It needs no 30-minute re-arm. | Evaluate in W0 beside the Monitor watch. The Monitor watch stays the default until a mod watch is proven in the CLI and the Desktop app. Mods need Claude Code 2.1.287 or later. |

## 7. Build status

Built 2026-10-03, after v9.177.1, not yet released.

| Wave | State | Where |
|---|---|---|
| W0 | Built. 16 tests. The tests were written with the script, not before it, so they are not red-first. | `tests/unit/yolo-watch.test.mjs` |
| W1 | Built. All ten events. | `scripts/yolo-watch.mjs` |
| W2 | Built. | `skills/wf/reference/yolo/_commentary.md`, yolo.md Step 1 and Step 2 |
| W3 | Built. 5 tests, with stub agents for `driveChain`. | `yolo.js` (`stopCheckClause`, `stopKindOf`, `STAGE_RESULT.status`), `tests/unit/skills/yolo-stop-request.test.mjs` |
| W4 | Run on the campaign scratch trial (3 slugs, 2 waves) instead of a SoccerManager slug. It found and fixed 4 bugs, each with a red-first test: a missed wave-start, merged journals replayed as new events, false stale events on a re-armed watch, and a wave-end that ended the watch of the next wave. | `scripts/yolo-watch.mjs`, `tests/unit/yolo-watch.test.mjs` |
| W5 | Built with campaign Stage C. K1–K6: one watch per wave over its slugs and the campaign journal, `parallel` on each stage end, the campaign events, `note --campaign`, and `control --campaign --scope`. 5 tests. Width 1 only until campaign Stage D1 runs slugs in parallel. | `scripts/yolo-watch.mjs`, `reference/yolo/_commentary.md` "In a campaign" |

Departures from the plan:

- **Run end (S4).** The Workflow script has no file access, so it writes no outcome to disk. The watch ends on a `run-end` journal line, which the main session appends with `yolo-watch.mjs end` when the Workflow returns. Without that line, a journal whose newest line is an `agent-end` and that stays silent past the liveness limit gives an inferred `run-end`.
- **The stop check reads the journal.** "stop after verify" holds when the journal has a verify `agent-end` later than the request's `requestedAt`. A comparison with the last stage the driver ended would stop at once when an earlier slice ended a verify.
- **Which agents check.** The first agent of each stage: plan, implement, the first verify round, the review (the rubric selection agent when the review fans out), and the update-deps exec. A verify fix round and the review scouts do not check, so a stop never lands inside a stage.
- **Subcommands.** The main session writes the control file and the notes through `yolo-watch.mjs control` and `note`. The file gets a real clock, and no write hook runs on it.
- **A first watch skips the journal history.** It reads the history for the cadence only. `--since <seq>` emits the newest run's lines after that seq.
- **`stopped`, not `paused`.** A pause returns `status: stopped` with `stopKind: pause`, and the driver ends with `stoppedAt: usage-pause`. The campaign plan (17.4) names the status `paused`; the campaign maps it when it is built.
- **Usage.** The watch reads `~/.claude/sdlc/usage/<sessionId>.json` in the shape of the campaign plan 17.1. Nothing writes that file until the usage guard (campaign Stage D3) is built, so `usage` and `usage-reset` stay silent until then. The budget lines are the new `yolo.usageBudget` config.
- **Q4 (a mod watch).** Not evaluated. The Monitor watch is the default.

