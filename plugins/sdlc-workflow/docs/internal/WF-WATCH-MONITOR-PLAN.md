# WF-WATCH-MONITOR-PLAN — one session-long watch for yolo and campaign

Status **BUILT 2026-10-08, not released: F2–F9 built; F1 not built, because probe P1 fails on the Desktop app (section 9)** · Date **2026-10-08** · Plugin **v9.182.0** · Owner **jayte**
Follows: [YOLO-COMMENTARY-PLAN.md](YOLO-COMMENTARY-PLAN.md) (the watch and the commentary) and its open question Q4. Used by: [WF-CAMPAIGN-PLAN.md](WF-CAMPAIGN-PLAN.md).

## 1. Why

The watch script `scripts/yolo-watch.mjs` and its event rules work. The way the session starts the watch costs most of the tokens, and two bugs make the watch miss what it exists to catch. The evidence comes from the two real campaign runs.

| Problem | Evidence |
|---|---|
| The Monitor tool stops the watch after 30 minutes at most, and the session restarts it | SoccerManager session `29b05b7e` (wave 2, 2026-10-06 → 10-07, 26 h): 122 Monitor calls, about 110 forced by the 30-minute limit. 98 turns did nothing but restart the watch: 41% of all cache-read tokens of the run. Secbot session `0d535924`: 16 restarts overnight, each one announced in chat, against rule C3. |
| Every wake re-reads the whole context | 250k–270k tokens per wake in SoccerManager, 140k–170k in Secbot. In SoccerManager, 243 of 252 turns were started by a notification. |
| The campaign watch reads only the main checkout | The drives write their journals in their worktrees. SoccerManager: the campaign watch was started 41 times and gave 0 events. Secbot: the watch read an old journal for 2 h 35 min (21:11 → 23:46). |
| A restart resets the stale clock | `lib/live-events.mjs:208` counts silence from `max(lastLineAt, watchStartMs)`, and every restart sets a new `watchStartMs`. When the run's longest gap is more than 30 minutes, `stale` can never fire. Two Secbot agents hung for about an hour each; the empty 30-minute expiries found them, not `stale`. |
| Duplicate and orphaned watches | SoccerManager L7601: an older watch on the same unit still ran after a relaunch. Secbot `545df5e1`: two watches gave the same events, and one push went out twice. |
| The commentary record was skipped | SoccerManager campaign: 0 `note` calls, so `work/campaign/commentary.md` stayed empty. Secbot overnight: 0 notes for 11 stage ends and 7 commits. |

Already fixed in v9.182.0 (`d50891fa`), so not part of this plan: the old usage reading that gave a pause and a reset every minute, and the Windows rename error (EPERM) on `.watch-state.json`.

### The fixes

Each fix names the problem, what this plan builds, where the design is, the wave that builds it, and its state. Section 4.8 says how each built fix departs from the design.

| # | Problem | What this plan builds | Design | Wave | State |
|---|---|---|---|---|---|
| F1 | The watch dies every 30 minutes, and the session spends a turn to restart it. | A plugin monitor that Claude Code starts at the first `/wf` and keeps running until the session ends. The session tells it what to watch through a claim file named by its session id. The Monitor-tool watch stays as the fallback. | 3, 4.1, 4.2, 4.5, 4.6 | W0, W3, W5 | **Not built.** Neither deadline-free watch starts in the Desktop app (section 9). F2 and F5 cut the restarts instead: one watch per campaign session, not one per drive. |
| F2 | The campaign watch reads only the main checkout, so it sees no event of a drive in a worktree. | The watch reads each unit's worktree path from the campaign records, and it reads the unit's journal there. | 4.3, 4.8 | W2 | Built. The watch also reads the commits and the protected files in the worktree, so a drive starts no watch of its own. |
| F3 | A hung agent never raises `stale`, because each restart resets the silence count. | Silence counts from the last journal line only. | 4.4 T1, T2, 4.8 | W1 | Built, as `keptWatchFrom`. |
| F4 | The model skipped the `commentary.md` notes, so the record stayed empty. | The script writes a line to `commentary.md` for each stage start and commit. The model still replies in chat for every event. | 4.7 | W4 | Built. |
| F5 | Duplicate and orphaned watches gave the same events twice. | One monitor process per session (the lock of M4), and one claim per run. A relaunch updates the claim; it does not start a second watch. | 4.8 | W3 | Built with locks, not claims (4.8). |
| F6 | Every `stale` event in the two campaigns was a false alarm (13 in SoccerManager, 1 at 20 minutes in Secbot). | Read each false alarm again against the F3 rule. When the 20-minute floor is the cause, raise the floor. | 4.4 T3, 4.8 | W1 | Built with the transcript signal, not a higher floor (4.8). |
| F7 | The only campaign push failed: "Mobile push not sent (Remote Control inactive)". Nobody saw the failure. | At the campaign start, check for Remote Control once. When it is off, tell the person that phone pushes need `/rc`. | 10 Q1 | W5 | Built: one push at the first wave start tests it. |
| F8 | A unit that the budget held back was not reported. The person asked "Are both units now running", and the answer was "No". | At the wave start, when `<cmd> budget` gives a width under the number of prepared units, say in chat which units wait and why. | `_waves.md` step 5 | W5 | Built. |
| F9 | The session announced each restart in chat, against rule C3. | F1 removes the restarts. With the fallback watch, rule C3 stays, and `_commentary.md` repeats it in the fallback step. | 4.5 step 3 | W5 | Built: `_commentary.md` keeps C3, and the new `watch-replaced` and `watch-covered` events say not to restart. |

## 2. Decisions

| # | Decision | By |
|---|---|---|
| D1 | `stage-start` and `commit` events still wake the model, as today. Every event of `_commentary.md` 3.2 stays an event. | PO 2026-10-08 |
| D2 | The mod's live view is out of scope. This plan does not depend on it and does not change it. | PO 2026-10-08 |
| D3 | A plugin monitor (`monitors/monitors.json`) replaces the Monitor-tool watch on the hosts where the probes of W0 pass. | recommendation. **Result: P1 fails on the Desktop app, so no plugin monitor ships.** |
| D4 | The Monitor-tool watch stays as the fallback. The script keeps its current argument mode. | recommendation. **Result: the Monitor-tool watch stays the only watch.** |
| D5 | Channels, an MCP long-poll tool, and a `FileChanged` hook with `asyncRewake` are not used. Channels need a CLI start flag that the Desktop app does not have. The other two add code and give nothing that a plugin monitor does not give. | recommendation |

## 3. How a plugin monitor works

Not built (section 9). This section and 4.1, 4.2, 4.5 and 4.6 stay as the record of the design.

A plugin declares a command in `monitors/monitors.json`. Claude Code starts the command in the background and keeps it running until the session ends. Each stdout line reaches the model as a notification, the same as a Monitor-tool line. Source: https://code.claude.com/docs/en/plugins/components#monitors and `/plugins/manifest-reference#monitors`.

```json
[
  {
    "name": "wf-watch",
    "command": "node ${CLAUDE_PLUGIN_ROOT}/scripts/yolo-watch.mjs --session",
    "when": "on-skill-invoke:wf"
  }
]
```

- The `when` trigger names a skill. The plugin has one skill, `wf`, so the monitor starts on the first `/wf` of any kind in a session. A session with no run prints nothing and costs no tokens.
- The command gets no arguments from the session, and it cannot read `${user_config.*}`.
- The monitor does not start in a `-p` session, and it does not start where the Monitor tool is not available (for example with telemetry off).
- A plugin disabled in the middle of a session does not stop a running monitor.
- The docs give no deadline. "For the whole session" is the documented life.

## 4. Design

### 4.1 Claims: which runs a session watches

The monitor gets no arguments, so the session tells it what to watch through a claim file.

- **C1. Location.** `~/.claude/sdlc/watch/<sessionId>.json`. One file per session, outside the repo, so claims from several repos and several sessions never mix.
- **C2. Shape.** `{ "sessionId", "claims": [ { "projectRoot", "slug" } | { "projectRoot", "campaign" } ], "updatedAt" }`. A yolo claim names one slug. A campaign claim names the brainstorm slug.
- **C3. Subcommands.** `yolo-watch.mjs claim <projectRoot> <slug> --session <id>` and `claim <projectRoot> - --campaign <brainstorm> --session <id>` add a claim. `yolo-watch.mjs end …` (unchanged arguments) also removes the claim of that slug. A campaign claim is removed by the campaign-end line or by `end <root> - --campaign <b>`.
- **C4. Owner.** The claim file is named by the session id, so each session watches only its own runs. A second session in the same repo (for example the brainstorm session during a campaign) is not woken by the first session's runs.
- **C5. Takeover.** A person who resumes a campaign in a new session claims it again from that session. Before it writes, `claim` removes the same claim from every other session's file. The newest claim wins.
- **C6. Session id.** The skill text passes `${CLAUDE_SESSION_ID}` to `claim`. The monitor reads its own session id from its environment. Probe P2 confirms both. If the environment has no session id, use the fallback in 4.6.

### 4.2 Session mode of the script

`yolo-watch.mjs --session` is a new mode beside the current argument mode.

- **M1.** Read the claim file every 5 seconds. Start a watcher (`createWatcher`) for each new claim. Stop the watcher of each removed claim.
- **M2.** Emit one `watch-start` line when a claim is first seen: `{ "event": "watch-start", "slug" | "campaign", "projectRoot" }`. The session waits for this line (4.5).
- **M3.** Write a heartbeat to `~/.claude/sdlc/watch/<sessionId>.beat` on every poll.
- **M4.** Single instance. Take `~/.claude/sdlc/watch/<sessionId>.lock` with the process id. When a second instance finds a live process id in the lock, it exits without output. This covers a plugin reload that starts the monitor again.
- **M5.** Exit never on a run end. The process lives until the session ends. Between runs it prints nothing.
- **M6.** The offsets stay in `.watch-state.json` (S3), so a new process after a restart misses no event.

### 4.3 The campaign source

- **K1 (changed).** On each poll, the campaign watcher reads the units and their worktree paths from the campaign records (`lib/campaign.mjs`), and it watches each unit's journal where the drive writes it: in the worktree when the unit has one, in the main checkout when it does not. A new wave and a new unit are seen with no restart.
- The campaign journal stays in the main checkout, as today.
- This change applies to the argument mode too, so the fallback watch is no longer blind.

### 4.4 The stale clock

- **T1.** `judgeSilence` counts silence from `lastLineAt` only. `watchStartMs` no longer moves the start of the silence.
- **T2.** A new watch over a run whose newest line is already older than the limit gives `stale` once (the `staleFor` key already stops repeats).
- **T3.** Read the 13 false `stale` events of SoccerManager wave 2 and the 20-minute false alarm of Secbot `545df5e1` L1355 again, against the fixed rule. When the 20-minute floor is the cause, raise the floor and give the reason in `_control-file-ownership.md`.

### 4.5 Start and fallback in the session

1. Run `yolo-watch.mjs claim …`. The claim command prints the session's heartbeat age.
2. When a `watch-start` line for the claim arrives within 30 seconds, do nothing more.
3. When no `watch-start` line arrives within 30 seconds, start the current Monitor-tool watch with the current arguments, and follow the current re-arm rules for this run. Restart the fallback watch without a chat message (rule C3, F9).
4. At each wake from a Workflow completion, run `yolo-watch.mjs ping --session <id>`. When the heartbeat is older than 60 seconds, the plugin monitor stopped (for example because it gave too many events). Start the Monitor-tool watch for the open claims.

### 4.6 Fallback for a missing session id

Use this only when probe P2 fails.

- The monitor creates a watch id at start, writes `~/.claude/sdlc/watch/<watchId>.json`, and prints one `watch-ready` line with the id at the first `/wf`. That costs one turn per session.
- The session passes `--watch <watchId>` to `claim` in place of `--session`.
- The post-compaction re-read of `SessionStart(compact)` must keep the watch id. Put it in `.ai/workflows/<slug>/.watch-id` for a yolo run and in `work/campaign/.watch-id` for a campaign.

### 4.7 The commentary record

- **R1.** The script appends a fact line to `commentary.md` for each `stage-start` and `commit` event: the slice, the stage and the time, or the commit hash and subject. In a campaign, the line goes to the slug's file and to `work/campaign/commentary.md` (K4).
- **R2.** The model still writes the chat reply for every event (D1), and it still writes the full notes for stage end, decision, stop, `protected-change`, `stale`, run end, wave end and campaign end.
- **R3.** The record is then complete even when the model skips a note, which is what happened in both campaigns.

### 4.8 As built

The Monitor-tool watch stays. These parts depart from 4.1–4.7.

- **F2, the campaign source.** Every 20 seconds, the watch reads `work/campaign/ledger.json`. For each unit of a wave in a live state (`running`, `boundary`, `handoff`, `shipping`), it reads the journal where the drive writes it: in `units[key].worktree.path` when the folder of the slug exists there, else in the main checkout. In a worktree, it also reads the commits on the slug branch and the protected files (the defaults, the config list, and the slug's `steer.md` paths). A unit that a later wave adds is watched from that moment. When the source of a slug moves, the lines of the new journal that are older than the move are history. The states stay in the main checkout. A drive in a campaign therefore starts no watch of its own. In SoccerManager wave 2, three watches ran at once and were started 122 times; one watch needs about a third of those starts.
- **F3, the silence count.** `keptWatchFrom` keeps the first watch's start across restarts while the run is live: the run wrote a line after that start, and its newest line is not `run-end`. Otherwise the restart counts from its own start, as before. The journal rule counts from `max(lastLineAt, watchFrom)`.
- **F5, one watch per journal.** A watch writes a lock for each journal it reads, in `<tmp>/sdlc-watch-locks/<hash of the journal path>.json`, never in a workflow folder (a slug commit stages that folder, and local records copy it). A newer watch takes the lock, and the older watch emits `watch-replaced` and exits. A slug watch that finds a live campaign lock on its journal emits `watch-covered` and exits. A lock whose holder process is dead is taken again. Claims (4.1) were for the plugin monitor, which takes no arguments. The Monitor-tool watch gets its slugs as arguments, so it needs no claims.
- **F6, the stale rule.** The journal cannot tell a hang from a long agent. In 17 driver journals of SoccerManager, Secbot and lynket-browser, an `implement` agent ran 52 minutes at the median and 211 minutes at the 95th percentile, and a `verify` agent ran 27 and 111 minutes. No journal floor catches a 1-hour hang without false alarms. The running agent's own transcript can. A workflow agent writes `<projects>/<project>/<session>/subagents/workflows/wf_*/agent-*.jsonl` at each tool call, and the sibling `.meta.json` holds its label in `description`, which is the journal's `agent`. In 537 workflow agents of the two campaigns and one yolo run, the longest transcript silence was 10 minutes (the Bash limit) for every agent but three: 12.7 minutes, 15.8 minutes, and the real Secbot hang at 63.4 minutes (`verify:harness-cli-models`). So `AGENT_SILENT_MS` is 15 minutes. When the journal is silent for 15 minutes after an `agent-start`, the watch looks for the transcript with that label, written after the agent started. With one, the agent is stale after 15 minutes of transcript silence, and the event says `signal: transcript`. With none, the journal rule applies (`signal: journal`). The project folder name is the session's folder with every character other than a letter or a digit replaced by a dash. The watch looks under the folders of the watch root and of its working folder, and only in workflow folders written in the last 48 hours.

## 5. Probes (W0)

Run each probe in the Desktop Code tab first and in the CLI second. Record each result in a new section 9 of this file.

| # | Probe | Pass condition | When it fails |
|---|---|---|---|
| P1 | A plugin monitor with `when: on-skill-invoke:wf` starts and delivers lines | A test line printed 10 minutes after `/wf` reaches the model as a notification | Keep the Monitor-tool watch. Ship only W1 and W2. |
| P2 | The monitor process has the session id in its environment, and `${CLAUDE_SESSION_ID}` is replaced in the skill text | Both give the same id | Use 4.6. |
| P3 | Two sessions in one repo each get their own monitor process | Two process ids, two session ids | Use 4.6 ids, which are per process. |
| P4 | The monitor runs past 30 minutes | A line printed at 45 minutes and at 120 minutes arrives | Keep the Monitor-tool watch. |
| P5 | Compaction, `/clear` and `--resume` | Record whether the process survives each one, and whether a resume starts a new process | Write the result into 4.5 step 4. |
| P6 | A plugin reload in the middle of a session | Record whether a second process starts | M4 covers a second process. |
| P7 | Event volume | A burst of 20 lines in one minute does not stop the monitor | Hold `stage-start` and `commit` lines for up to 60 seconds and give them as one line batch. |

## 6. Files

| File | Change |
|---|---|
| `monitors/monitors.json` | Not built (section 9). |
| `scripts/yolo-watch.mjs` | `--session` mode (4.2), `claim` and `ping` (4.1, 4.5), claim removal in `end`, the campaign source (4.3), the fact lines (4.7). |
| `lib/live-events.mjs` | The stale clock (4.4). The mod also imports this file, so its live view gets the same fix. |
| `skills/wf/reference/yolo/_commentary.md` | The start and fallback steps (4.5) replace the Monitor start and the re-arm rule. K1 names the claim. Add R1–R3. |
| `skills/wf/reference/yolo.md` Step 1 | Run `claim` in place of the Monitor call. |
| `skills/wf/reference/campaign/_waves.md` step 4 | Run `claim … --campaign` once at the campaign start, not one watch per wave. |
| `skills/wf/reference/campaign/_waves.md` step 5 | F8: report the units that the budget holds back. |
| `skills/wf/reference/campaign.md` (campaign start) | F7: check for Remote Control once. |
| `docs/internal/YOLO-COMMENTARY-PLAN.md` | Close Q4 with a pointer to this plan. |
| `tests/unit/yolo-watch.test.mjs` | The tests of section 7. `judgeSilence` has no direct unit test today; add its W1 tests here. `hooks/mod/tests/live.test.ts` also imports `lib/live-events.mjs`, so run it after W1. |

## 7. Waves

Each wave is test-first: write the test, see it fail, then write the code.

| Wave | Content | Tests |
|---|---|---|
| W0 | Probes P1–P7 (section 5). Done 2026-10-08: P1 fails on Desktop (section 9). | none |
| W1 | The stale clock (4.4). Independent of the monitor; ship it first. | A run with a 40-minute longest gap and a 45-minute silence across two watch restarts gives `stale`. A restart alone gives no `stale`. |
| W2 | The campaign source (4.3), in both modes. | A unit with a worktree: a journal line in the worktree gives an event. A unit without one: a line in the main checkout gives an event. A unit added to the records after the watch starts is watched. |
| W3 | Locks (4.8, F5). Claims and session mode (4.1, 4.2) not built. | Claim, then journal line, then event. A removed claim stops its events. A claim of session A gives no event to session B. Takeover moves a claim. A second instance exits at once. The heartbeat file updates. |
| W4 | The fact lines (4.7). | A `stage-start` and a `commit` each append one line to `commentary.md`, and to the campaign file in a campaign. A re-read of the same journal appends nothing again. |
| W5 | The procedure (4.5), F7, F8, F9, and the reference files of section 6. | `npm test` passes. Read yolo.md Step 1 and `_waves.md` steps 4 and 5 against 4.5 and F8. |
| W6 | Live run: one overnight campaign on SoccerManager or Secbot. | The measures of section 8. |

Release rules: a change to `scripts/` or `lib/` needs `dist/` built again in the same commit. Stage files by path. Do not use `git add -A`, because other sessions edit this tree at the same time.

## 8. Measures

Measure on the W6 run and compare with SoccerManager wave 2.

| Measure | Today | Target |
|---|---|---|
| Turns that only restart the watch | 98 | 0 |
| Campaign events from worktree drives | 0 | every journal event of every unit |
| A hung agent (silent past the limit) gives `stale` | never past a 30-minute gap | within one poll after the limit |
| Duplicate events | present | 0 |
| `commentary.md` lines for stage starts and commits | 0 | one per event |
| Woken turns per event | about 1.7 (243 turns for 139 events) | 1.0 or less |

## 9. Probe results

Read on 2026-10-08 from the Claude Code 2.1.289 binary (`~/.local/bin/claude.exe`), the cached feature flags in `~/.claude.json`, the environment of this Desktop session, and the mod probe journal `~/.sdlc/mod-probe.jsonl`. The binary answers each probe, so no live session was needed.

| # | Result | Evidence |
|---|---|---|
| P1 | **Fails on the Desktop app.** | The function that arms plugin monitors returns at once when the session is not interactive (`if(ke())return`, with `ke()` = `!host.launchOptions.isInteractive()`). All 239 Desktop session rows of the mod probe journal report `interactive: false`. The arm hook also runs only in the interactive session component, and not for a remote session. In an interactive CLI session, a plugin monitor arms when the flag `tengu_amber_sentinel` is on (it is on for this account) and safe mode is off. |
| P1b | **The Monitor tool's own deadline-free option is hidden.** | The Monitor tool has a `persistent: true` input ("Run for the lifetime of the session (no timeout)"). The flag `tengu_breezy_crescent` selects the input form with a 30-minute cap and no `persistent`. The flag is on (cached `true`) for this account. |
| P2 | Passes for the Monitor tool. | The Bash environment of the session, which the Monitor tool shares, has `CLAUDE_CODE_SESSION_ID`. Not needed: no claims ship. |
| P3 | Not needed. | No plugin monitor ships. |
| P4 | Plugin monitors have no deadline. | The arm code passes `persistent`, and a persistent monitor sets no timer ("No timeout — runs until TaskStop or session end"). Moot on Desktop (P1). |
| P5 | Not run. | No plugin monitor ships. |
| P6 | A reload does not start a second plugin monitor. | The arm code keeps a set of `<plugin>:<name>` keys. The manifest schema says that the name is "used to dedupe so re-arming (plugin reload, repeat skill invoke) does not spawn duplicates". |
| P7 | Not measured. | The Monitor tool stops "monitors that produce too many events". The binary gives no number. SoccerManager wave 2 gave 139 events in 26 hours with no stop. |

Other facts that the build used:

- The skill name of a typed `/wf` and of a Skill-tool call is `sdlc-workflow:wf` (the Secbot transcripts). A plugin monitor for it needs `when: "on-skill-invoke:sdlc-workflow:wf"`.
- A plugin monitor command gets `${CLAUDE_PROJECT_DIR}` and runs in the session's working folder.
- A monitor process that exits reports its exit to the model. The `watch-replaced` and `watch-covered` lines say why, so the model does not start the watch again.

**When to look again.** A deadline-free watch becomes possible when the Desktop app runs sessions as interactive, or when `tengu_breezy_crescent` turns off. Then F1 removes the remaining restarts. To check, read `interactive` in the mod probe journal, and look for `persistent` in the Monitor tool's input.

## 10. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | F7: is a check for Remote Control at the campaign start wanted? The only campaign push failed with "Mobile push not sent (Remote Control inactive)". | Yes. Check once, and tell the person that phone pushes need `/rc`. Find how the session reads the Remote Control state in W0; when it cannot, say the rule once at the campaign start. |
| Q2 | When P7 fails, is a 60-second hold on `stage-start` and `commit` lines acceptable? | Yes. The lines still wake the model (D1), only grouped. |
| Q3 | Codex and pi have no Workflow tool and no plugin monitor. | No change on those hosts. yolo and campaign are Claude Code only. |
