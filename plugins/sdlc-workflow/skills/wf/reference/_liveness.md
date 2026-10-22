# Liveness: is the other writer still there (single source)

This file judges whether a driver, a background run, or another session is still working. `status` (the detail view) and `yolo` load it. [_control-file-ownership.md](_control-file-ownership.md) rules 3 and 4 and [_chat-return.md](_chat-return.md) cite it.

## The staleness rule

Rules 3 and 4 of [_control-file-ownership.md](_control-file-ownership.md), and every status line about a driver, turn on one question: *is a driver actually running right now?* Answer it from **recency**, never from existence.

> **A journal silent for longer than its own longest observed inter-agent gap is no longer running. When its newest entry is an `agent-start`, that agent never returned: say "presumed dead since `<last entry>`", never "still running". When its newest entry is an `agent-end`, every agent returned: say "stopped at `<stage>`".**

The evidence is the driver's heartbeat journal, `.ai/workflows/<slug>/.driver-journal.jsonl` — an append-only JSONL file to which every agent a driver dispatches writes one line when it starts and one when it finishes (`at`, `run`, `seq`, `event`, `agent`, `phase`, `stage`, `slice`). The yardstick is the run's **own cadence**, not a fixed timeout: a driver whose slices take 40 minutes is healthy at 35 minutes of silence, and one whose agents return every 3 minutes is not. Take the largest gap between consecutive entries of the newest run, and compare the elapsed time since the last entry against it, with a 20-minute floor so a single slow first agent is never called dead.

Three states, and only three:

| What the journal shows | What you may say |
|---|---|
| Last entry inside the run's cadence | "running — last seen at `<stage>` `<n>` min ago" |
| Silent beyond its own longest gap, newest entry an `agent-start` | "**presumed dead** since `<timestamp>`, mid-`<stage>`" |
| Silent beyond its own longest gap, newest entry an `agent-end` | "stopped at `<stage>` (`<status>`) at `<timestamp>`" |

No journal at all → *"no driver journal — I can't tell whether one ran."* That is the honest answer, and it is not the same as "nothing is running".

The watch (`scripts/yolo-watch.mjs`) has a better signal for a running agent: the agent's own transcript, which grows at each tool call. One tool call lasts 10 minutes at most. When the transcript of the agent in the newest `agent-start` wrote nothing for 15 minutes, the agent hangs, even when the journal is inside its cadence. A long agent that still writes its transcript is running, even past the journal's cadence. The watch uses the journal rule above only when it finds no transcript.

Existence is not liveness: an artifact trail outlives the driver that wrote it, and the harness task registry can lose a task entirely. The same discipline applies to any claim about work you did not watch, including another session's (see below).

## Claims about work you did not watch

A chat return often has to say something about work happening *elsewhere* — a background driver, another session, a spawned task. Two rules apply.

- **Liveness is judged by recency, never by existence.** Before saying a driver or background run is "still running", apply the staleness rule above: compare when its heartbeat journal was last written against the run's own observed cadence.

- **Cross-session activity claims require repo evidence.** A system-reminder saying a spawned task is "running independently" is a statement about a **chip**, not about work occurring. Before asserting that another session is doing, or has done, something — and *especially* before predicting a conflict with it — check the repo: the branch, recent commits, the target files. If the repo shows nothing, say *"a task chip exists; I can't see whether it ran."* Confident narration about invisible work is worse than silence: it is unfalsifiable until the user does your checking for you.
