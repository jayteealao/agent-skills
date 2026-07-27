# Control-file ownership (single source)

Two files are written by nearly every `/wf` stage and by every driver:

- `.ai/workflows/<slug>/00-index.md` — the workflow's own control file (status, roster, progress, deferral ledger, RIM ledger, charter).
- `.ai/workflows/INDEX.md` — the global registry.

They are the only files in the system with **many concurrent writers**, and until this contract existed they were written blind. A background `/wf yolo` driver and a foreground session would both hold reads taken minutes apart, and the second writer's edit would be rejected as *"File has been modified since read"* — repeatedly, in clusters, with no rule to fall back on. Worse, a **dead** driver's final write once ambushed a foreground session two hours later, because nothing said the driver had stopped and nothing said its last write might be half-finished.

This file is the shared rule. `yolo.md`, `auto.md`, and the write-bearing stage references cite it rather than restating it.

## The rule

**1. Re-read immediately before every edit.** Never edit a control file from a copy read earlier in the same agent or session. The gap between read and write is exactly where the other writer lives.

**2. An edit rejection means the other writer moved — not that your string is wrong.** Re-read, re-derive your change against the *new* content, and retry **once**. Do not hunt for a stale string to force through, and do not rewrite the whole file to dodge the conflict. Both of those turn a benign race into lost work.

**3. While a driver is live for a slug, that slug's control files are driver-owned.** A foreground session may still write them — the driver holds no lock — but it writes under rules 1 and 2 and expects to lose a race sometimes. What it must **not** do is start a second driver (`auto` or another `yolo`) for the same slug.

**4. A presumed-dead driver's writes are suspect until reconciled.** Judge liveness by the staleness rule below — never by a file existing. Once a driver is presumed dead, treat its last writes as possibly half-finished: re-read fresh from disk, and where an artifact on disk contradicts what `00-index.md` claims, **trust the artifact and correct the index**. The artifact is written by the stage that did the work; the index is a summary of it.

**5. One writer per fact.** Where two places could record the same thing, exactly one of them is the record and the other cites it. This is the same principle that governs deferrals (recorded once in `terminal.deferrals[]`, never duplicated into `residual[]`) and slice status (written back at drive time, not re-derived by every later reader).

## The staleness rule — deciding whether the other writer is still there

Rules 3 and 4 both turn on one question: *is a driver actually running right now?* Answer it from **recency**, never from existence.

> **A journal silent for longer than its own longest observed inter-agent gap is presumed dead. Say "presumed dead since `<last entry>`", never "still running".**

The evidence is the driver's heartbeat journal, `.ai/workflows/<slug>/.driver-journal.jsonl` — an append-only JSONL file to which every agent a driver dispatches writes one line when it starts and one when it finishes (`at`, `run`, `seq`, `event`, `agent`, `phase`, `stage`, `slice`). The yardstick is the run's **own cadence**, not a fixed timeout: a driver whose slices take 40 minutes is healthy at 35 minutes of silence, and one whose agents return every 3 minutes is not. Take the largest gap between consecutive entries of the newest run, and compare the elapsed time since the last entry against it, with a 20-minute floor so a single slow first agent is never called dead.

Three states, and only three:

| What the journal shows | What you may say |
|---|---|
| Last entry inside the run's cadence | "running — last seen at `<stage>` `<n>` min ago" |
| Silent beyond its own longest gap, no terminal entry | "**presumed dead** since `<timestamp>`, mid-`<stage>`" |
| Last entry is the terminal hand-back | "completed at `<timestamp>`" |

No journal at all → *"no driver journal — I can't tell whether one ran."* That is the honest answer, and it is not the same as "nothing is running".

Why this is written down at all: a background driver died 17 minutes into a run, the harness task registry lost the task entirely (`TaskGet` → "Task not found"), and the artifact trail simply stopped. The next session then told the user the driver was "currently re-verifying older slices" — reasoning purely from the trail *existing* — and the user made a stop-or-continue decision on that fiction. Existence is not liveness. The same discipline applies to any claim about work you did not watch, including another session's (see [_chat-return.md](_chat-return.md)).

## What this is not

Not a lock, not a lease, not a queue. There is no coordination primitive here and none is wanted — the cost of one lost race is a re-read, while the cost of a lock is a stuck workflow when the holder dies. This contract makes the losing case *designed and cheap* instead of surprising.

See also: [_additive-write.md](_additive-write.md) for how a *revisable artifact* is rewritten (snapshot + ledger), which is a different question from who may write a *control* file when.
