# Control-file ownership (single source)

Two files are written by nearly every `/wf` stage and by every driver:

- the index of the workflow (`00-index.md`, held in `state.yaml` and `meta.yaml`) — status, stage, progress, deferral ledger, RIM ledger, charter;
- `.ai/workflows/INDEX.md` — the global registry, which `wf.mjs index` and `wf.mjs status` rebuild.

They are the only records in the system with **many concurrent writers**. A **dead** driver's last write can also be half-finished, and nothing else says the driver stopped.

This file is the shared rule. `yolo.md` and the write-bearing stage references cite it rather than restating it.

## The rule

**1. Change an index field with `wf.mjs record set`.** The command reads the index, merges the change and writes it in one step, so it loses no field of another writer. See [_records.md](_records.md).

**2. A draft of the whole index replaces the whole index.** Write one only when a stage makes the index (intake) or rewrites most of it. Get the index with `record get` immediately before you write the draft, and put the draft at once. The gap between the read and the put is where the other writer lives.

**3. While a driver is live for a slug, that slug's control files are driver-owned.** A foreground session may still write them — the driver holds no lock — but it writes under rules 1 and 2. What it must **not** do is start a second driver (another `yolo`) for the same slug.

**4. A presumed-dead driver's writes are suspect until reconciled.** Judge liveness by the staleness rule in `_liveness.md` — never by a file existing. Once a driver is presumed dead, treat its last writes as possibly half-finished: re-read fresh from disk, and where a stage record contradicts what the index claims, **trust the stage record and correct the index**. The artifact is written by the stage that did the work; the index is a summary of it.

**5. One writer per fact.** Where two places could record the same thing, exactly one of them is the record and the other cites it. This is the same principle that governs deferrals (recorded once in `terminal.deferrals[]`, never duplicated into `residual[]`) and slice status (written back at drive time, not re-derived by every later reader).

## Append-only files beside the index

Two JSONL files sit next to the index. Each has one kind of writer and one kind of row. A `.jsonl` file triggers no render and no stale flag.

| File | Writer | Row |
|---|---|---|
| `index-history.jsonl` | any stage or driver that removes history from the index | `{"at":"<ISO-8601>","kind":"note\|next-commentary\|subpass\|migrated","text":"<text>","stage":"<stage or null>"}` |
| `.driver-journal.jsonl` | the agents a driver dispatches | heartbeat rows only (the staleness rule in `_liveness.md`) |

- `index-history.jsonl` holds what the index no longer needs: YAML comment prose, old next-step commentary, and finished sub-pass telemetry. Append one row for each item you remove, then remove it from the index. The deferral list (cleared entries too), the intent risks, the charter and the `revisions:` ledger stay in the index.
- Write only driver heartbeat rows to `.driver-journal.jsonl`. The liveness check reads its newest line as the driver's state, so any other row makes a live run look dead or a dead run look alive.

## What this is not

Not a lock, not a lease, not a queue. There is no coordination primitive here and none is wanted — the cost of one lost race is a re-read, while the cost of a lock is a stuck workflow when the holder dies. This contract makes the losing case *designed and cheap* instead of surprising.

See also: [_additive-write.md](_additive-write.md) for how a *revisable artifact* is rewritten (snapshot + ledger), which is a different question from who may write a *control* file when.
