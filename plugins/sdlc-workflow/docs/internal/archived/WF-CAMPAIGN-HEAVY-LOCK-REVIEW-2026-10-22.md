# Heavy-suite lock review: SoccerManager wave 4, 2026-10-21/22

**Status:** BUILT in v9.200.0 (F1–F6). LQ1–LQ4 answered 2026-10-22 (section 6): all four took the recommendation. The wave 4 drive keeps the steer and the 30-minute hold check (LQ4), sent to the drive session on 2026-10-22.

**As built:** `lib/campaign-locks.mjs` (hold forms, queue, `lockState`, `suiteListed`); `scripts/campaign.mjs` `heavy-run`, `lock status|reap`, the lease, `locks` in `status`; `lib/campaign.mjs` `isolationText` (the brief); `scripts/yolo-watch.mjs` (`locks` on the campaign look-in); `yolo/_commentary.md` C8; `campaign.md`, `campaign/_waves.md`, `campaign/_phases.md`, `verify/_deferrals.md`; tests in `tests/unit/campaign-heavy-lock-cli.test.mjs`. F6 (continue other work while waiting) is a brief rule, not a driver change.
**Run:** SoccerManager campaign `brainstorm-realism-additions-20260922`, wave 4, width 3, drive session `94c8c352`, workflow `wf_fde3e419`. The drive runs plugin **9.196.0** (`~/.claude/plugins/cache/.../9.196.0`). The lock code in v9.199.0 is the same (`scripts/campaign.mjs:687-745`).

## 1. What happened

Three units ran in parallel: `harness-core-harness-pass-rules-and-checks` (harness), `player-record-real-players-researched` (real-players), and `team-shape-tactics-phases-and-set-pieces` (team-shape). SoccerManager lists six heavy suites in `campaign.isolation.heavy-suites`, among them `npm test` and "every calibrate run". One unit at a time may run them, through `campaign.mjs lock acquire|release <slug>`.

Lock calls taken from the 64 sub-agent transcripts, and `lock-wait` lines from the three driver journals:

| Holder (agent) | Held | Length | What the lock was for | What the agent did while it held the lock |
|---|---|---|---|---|
| real-players implement `shot-models` (`abfdc6`) | 02:30 → 04:09 | 1 h 39 min | suites in a background job | implement work |
| team-shape implement `self-pass-check-and-fix` (`a8f3`) | 04:53 → about 07:11 (inferred from real-players' `lock-wait … holder team-shape` until 07:11) | about 2 h 18 min | acquire, suite and release chained in one background command | the chain ran the release only when the background job ended |
| real-players implement `first-touch-and-recovery` (`ab7be515`) | 08:56:18 → 11:14:27 | **2 h 18 min, released by hand** | `cargo test -p engine` (2 min 46 s); this suite is **not** in `heavy-suites` | release build, calibrate probes, edits to `rows.rs`, two commits, a 158 s change run; no release |

Waiting units (from the `lock-wait` lines, 5-minute polls):

| Unit | Waited | Total |
|---|---|---|
| team-shape | 02:21 → 04:07, 09:38 → 11:14 | about 3 h 20 min |
| harness | 07:17 → 07:52, 09:02 → 11:14 (still waiting at 11:14) | about 2 h 47 min |
| real-players | 02:04 → 02:10, 05:34 → 07:11 | about 1 h 43 min |

Overnight, the three units spent about **7 h 50 min** waiting for the lock. The longest hold had a few minutes of heavy work in it. With three units and one lock, width 3 ran as width 1 for most of the night.

At 11:07Z the drive session added a campaign-wide steer: "take the lock just before each heavy run and release it in the same command". At 11:14 it released the real-players lock by hand. Team-shape took the lock 15 seconds later. The real-players agent still believes that it holds the lock, so its next band run will not wait (the drive session reported this risk).

## 2. Root causes

**L1. The agent decides how long it holds the lock (H).** The brief (`lib/campaign.mjs:1528-1530`) says "Run `acquire` first … Run `release` after the suite ends". An implement agent runs a loop of test, fix, test. Releasing means waiting 5 minutes or more to get the lock back, so the agent keeps it through the whole loop. Nothing measures or limits the time from acquire to release.

**L2. The holder is the unit, not the agent or the process (H).** `lock acquire <slug>` writes `{holder: <slug>, at}`.
- A second agent of the same unit gets `acquired: true` while the first still holds the lock (00:48 and 00:59, real-players). The lock is re-entrant across agents.
- A release by one agent frees the lock that another agent of the same unit still uses.
- `holderGone` (`scripts/campaign.mjs:698-705`) frees the lock only when the unit's state ends a drive, or when its journal ends with `run-end`. While the unit lives, an idle holder keeps the lock for up to 3 hours (`LOCK_STALE_MS`).

**L3. The lock does not know whether a heavy process runs (H).** The process that runs `lock acquire` exits at once, so the lock has no live process to check (the comment at `:692-695` says so). A waiting unit cannot tell a running suite from an agent that is editing code.

**L4. The waiting is not fair (M).** Waiters poll every 5 minutes. A holder that releases and takes the lock again a few seconds later wins every time. Harness waited from 07:17. Real-players released at about 07:13, took the lock again at 07:48, and took it again at 08:56 after harness's short hold.

**L5. A release can fail without anyone seeing it (M).** At 07:48:10 a release failed with the fnm shell error ("We can't find the necessary environment variables…"). The agent took the lock again 10 seconds later, but the failed release left no trace in the journal. In a chained background command, the release runs only when the whole job ends.

**L6. The heavy-suite list and the agents' use of it do not match (M).** The agent took the lock for `cargo test -p engine`, which is not in the list, and then kept it. "Every calibrate run" includes short probes, so an implement loop needs the lock many times an hour, which pushes the agent to keep it (L1).

**L7. A waiting agent holds a token slot and does nothing (M).** The waiting happens inside the implement or verify agent, as a sleep loop. The slot that the driver gave it is used, and the agent costs tokens on each 5-minute line. The v9.197.0 machine slots (`heavy(fn, 'machine', { locks: true })`) cover verify, but implement runs heavy suites from inside a token slot.

## 3. Fixes

**F1. A command-scoped heavy run (fixes L1, L3, L5, L6).** Add `campaign.mjs heavy-run <root> <brainstorm> <slug> --agent <label> -- <command…>`:
1. Join the queue (F3) and wait in the process. Write a `lock-wait` journal line every 5 minutes with the holder and the queue position.
2. When the lock is granted, write `{holder: slug, agent, pid, command, at}`.
3. Spawn the command, pass its output through, and wait for it.
4. Release in a `finally` block, also when the command fails or is stopped. Write `heavy-run-end` with the exit code and the duration.

The brief changes from "acquire, then release" to "Run each heavy suite through `heavy-run`. Never call `lock acquire` yourself." The lock then lasts exactly as long as the suite, and the agent no longer controls it. A background job that runs `heavy-run` holds the lock only while its own suite runs.

**F2. The holder is a process (fixes L2, L3).** The lock records `pid` and `agent`. `otherHolder` treats a lock whose `pid` is not alive as free at once. The 3-hour stale rule stays as a backstop. `lock acquire` stays for compatibility but grants a 30-minute lease with no renewal (F4).

**F3. A fair queue (fixes L4).** `.scratch/campaign/heavy.queue` holds tickets in arrival order. The lock goes to the oldest live ticket. A ticket whose `pid` is gone is removed.

**F4. Hold limits and reporting (fixes L1 for the old path).**
- `lock status` shows the holder, agent, command, pid, held time, and the queue.
- The driver's 15-minute look-in reports any hold longer than 30 minutes with no live `pid` as "idle hold" and releases it. The person is told which agent lost the lock.

**F5. Heavy-suite hygiene (fixes L6).** The setup question in `campaign/_phases.md` asks for each suite's usual length, and offers to leave out short runs (under 2 minutes). `heavy-run` warns when it gets a command that is not in the list, and runs it anyway.

**F6. Waiting outside the token slot (fixes L7).** The implement and verify briefs say: when `heavy-run` waits, continue with the work that does not need the suite, and start `heavy-run` in the background. The driver's look-in counts the units that are waiting on the lock, so that a wave that runs at width 1 because of the lock is visible.

## 4. Files

- `scripts/campaign.mjs`: `heavy-run`, `lock status`, the queue, `pid` in the lock record, `otherHolder` with a pid check. Build `dist/`.
- `lib/campaign.mjs:1528-1530`: the brief line for each heavy suite.
- `skills/wf/reference/campaign.md:123` (the command table), `campaign/_waves.md:66`, `campaign/_phases.md:79` (setup question).
- `skills/wf/workflows/campaign-wave.js` (and yolo, if yolo uses the lock): the look-in idle-hold report. Edit `_shared.js` when the code is in the shared block, then run `npm run build`.
- Tests: `tests/unit/campaign-cli.test.mjs` (heavy-run releases on exit, on failure and on kill; a dead pid frees the lock; the queue order; a second agent of the same unit waits), and `campaign-wave.test.mjs` (idle-hold report).

## 5. The running drive

The drive runs 9.196.0 and must not stop (your request). Until wave 4 ends, the steer from 11:07Z and the hand release are the only means. The look-in of the drive session should check `heavy.lock` every 15 minutes and report a hold over 30 minutes. The fixes reach SoccerManager on the next wave after a release and a reinstall.

## 6. Questions

| # | Question | Options | Recommendation | Answer (2026-10-22) |
|---|---|---|---|---|
| LQ1 | How do agents use the lock after the fix? | (a) only through `heavy-run`; `lock acquire` stays as a 30-minute lease. (b) keep acquire and release, and add only the pid check and the idle-hold report. | (a) | (a) |
| LQ2 | Add the fair queue? | Yes / No. | Yes | Yes |
| LQ3 | When does this ship? | (a) its own small release now. (b) in the next planned release. | (a) | (a) |
| LQ4 | What does the running wave 4 drive do until it ends? | (a) keep the steer and the hand release, plus a 30-minute hold check in the look-in. (b) restart the drive on the new release when it ships. | (a) | (a) |
