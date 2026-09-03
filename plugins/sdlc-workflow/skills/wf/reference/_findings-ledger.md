# Findings-ledger contract (shared)

This file is the single source for the **accumulating findings ledger** — the merge law that
governs every `07-review*` file family. Two surfaces own such a ledger: the review stage
(`review/_stage.md`, slug-wide and per-slice) and the audit intake mode (`intake/audit.md`).
Both cite this file. Neither restates it. A compressed audit slice does **not** accumulate —
`_compressed-slice.md` makes a slice-mode run one-shot, and the slice body says so.

The ledger exists so a re-run never loses history: prior findings keep their identity, cleared
findings are marked rather than deleted, and a reader can always distinguish what was
deliberately deferred from what was never seen.

## The merge law

Before writing any ledger file, READ the existing target (plus its sibling `.yaml`) if it is
present. It holds prior findings with stable IDs, `surfaced-at` stamps, and triage statuses.
MERGE this run's findings into it. Never overwrite the file wholesale, and never delete a row.

1. **Within-run cross-dimension dedupe.** Two findings from this run are duplicates when they
   share a `file:line` (or overlapping range), share a root cause across categories, or one is
   the symptom of the other's cause. Merge duplicates into ONE finding: keep the highest
   severity, the most specific evidence, the most actionable fix, and combine category labels.
2. **Re-surfaced finding** (matches a prior finding by file:line or root cause) → KEEP the prior
   `id` and `surfaced-at`, set `last-seen-at` to now, refresh evidence and severity only when
   this run's version is more specific, and PRESERVE the prior triage `status`. When the prior
   status was `resolved`, flip it back to `open` and note that it re-surfaced.
3. **Net-new finding** (no prior match) → allocate the next ID in that dimension's prefix
   sequence (max existing + 1; never reuse a retired ID), `status: open`, and set
   `surfaced-at = last-seen-at = now`.
4. **Resolve-sweep.** A prior `open` finding whose dimension WAS re-run this invocation but was
   NOT re-surfaced is set `status: resolved`, `resolved-at: now` — the dimension looked again,
   so absence means cleared. Keep the row; never delete it. Findings from dimensions NOT re-run
   carry forward untouched — absence of a run clears nothing.
5. **Triage decisions persist.** Findings at `deferred`, `dismissed`, `fixed`, or
   `could-not-fix` keep that status untouched unless re-surfaced (then update `last-seen-at`
   only). Re-triage is its own explicit operation, never a side effect of a re-run.
6. **Append one `runs:` entry per invocation** to the master ledger's frontmatter (timestamp,
   dimensions run, verdict snapshot). PRESERVE `created-at` from the first run; only
   `updated-at` moves.
7. **Emit the FULL merged set** — open AND closed rows — not just this run's deltas. Sibling
   `.yaml` projections carry OPEN findings only (open | deferred | could-not-fix); closed
   history lives in the `.md` body.

Get `now` from one real UTC timestamp per run, per [_timestamp.md](_timestamp.md). Never guess
a timestamp.

## What the law protects

- **Identity** — a finding's `id` and `surfaced-at` survive every re-run, so triage decisions
  and cross-run references stay attached to the same defect.
- **Honest clearing** — `resolved` is earned only by a re-run of the same dimension that no
  longer surfaces the finding. Deleting a row, skipping a dimension, or rewriting the file
  cannot clear anything.
- **Legible coverage** — because refuted and resolved rows are kept, a reader can tell a
  surface that was checked and found clean from a surface that was never read.
