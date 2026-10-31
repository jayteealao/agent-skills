# Findings-ledger contract (shared)

This file is the single source for the **findings ledger** of a workflow. Three sources write
to it: the review stage (`review/_stage.md`), the audit intake mode (`intake/audit.md`) and the
PR-comment triage of handoff (`handoff/_pr-triage.md`). All three cite this file. None of them
restates it. A compressed audit slice does **not** write to the ledger: `_compressed-slice.md`
makes a slice-mode run one-shot, and the slice body says so.

The ledger exists so a re-run never loses history: prior findings keep their identity, cleared
findings are marked rather than deleted, and a reader can always distinguish what was
deliberately deferred from what was never seen.

## The ledger file

The ledger is `<wf-dir>/findings.yaml`. Only `wf.mjs findings` writes it. Never
edit `findings.yaml` by hand, and never copy its rows into a second ledger.

| Command | What it does |
|---|---|
| `wf.mjs findings add <root> <slug> <found.json> --source <s> [--slice <x>] --dimensions <a,b> [--files <a,b>]` | Merges the findings of one run by the merge law below. |
| `wf.mjs findings set <root> <slug> <id> <status> [--reason <r>] [--commit <sha>] [--decision <D-id>]` | Records a triage decision or a fix outcome on one entry. `--commit` names the commit of a fix step. `--decision` dismisses a finding that goes against a live answer, steer or approval of the person. |
| `wf.mjs findings table <root> <slug> [--source <s>] [--slice <x>]` | Prints the verdict and the findings table of a review file. |
| `wf.mjs findings metrics <root> <slug> [--source <s>] [--slice <x>]` | Prints the verdict, `commands-run` and the `metric-*` fields of a review file. |
| `wf.mjs findings list <root> <slug> [--open] [--json]` | Prints the entries. |

`<s>` is `review`, `audit` or `pr-bot`. A run with no `--slice` is a run of the whole work
packet. `found.json` is `{ "dimensions": [...], "affectedFiles": [...], "findings": [...] }`.
`affectedFiles` (or `--files`) is the scope of the run: the files of the work packet. The merge
drops a finding in any other file and counts it as `out-of-scope` in the `runs` entry. Each finding has
`dimension`, `severity` (BLOCKER, HIGH, MED, LOW or NIT), `file`, `line`, `issue`, and can have
`confidence`, `evidence`, `fix`, `key`, `preExisting`, `refuted` (the refuter's reason),
`changesAcceptance` and `needsRuntimeEvidence` (the experiment that settles the finding). Write `found.json` to `<wf-dir>/.draft/found.json`; the next run
replaces it. `dimensions` names every dimension that the run checked, also the clean ones: a
dimension that is not named clears nothing.

## The merge law

`wf.mjs findings add` applies these rules. They are in code so that no writer can skip one.

1. **Within-run dedupe.** Two findings of one run on the same file and line are one finding.
   It keeps the higher severity and names the other dimension in `also`.
2. **Re-surfaced finding.** A finding that matches an entry (the same source, scope and key, or
   the same file within 3 lines) keeps the entry's `id` and `surfaced-at`. `last-seen-at`
   moves. A `resolved` or `refuted` entry opens again and counts `reopened`.
3. **Net-new finding.** A finding with no match gets the next ID of its dimension prefix (the
   first three letters, upper case). An ID is never used again. The status is `open`, or
   `refuted` when the refuter refuted it.
4. **Resolve-sweep.** An `open` entry of the same source and scope, in a dimension that the run
   checked, that the run did not find again, becomes `resolved`. An entry of a dimension that
   the run did not check stays as it is.
5. **Triage decisions persist.** A run never changes `fixed`, `deferred`, `dismissed`,
   `could-not-fix` or `kept-by-person`. Only `wf.mjs findings set` changes a triage status. A
   `deferred`, `dismissed`, `could-not-fix` or `kept-by-person` status needs a reason.
6. **One `runs` entry per run**, with the dimensions, the raw count and the verdict.
7. **No row is deleted.** A refuted finding stays with the refuter's reason.

The verdict counts the open findings (status `open`, `deferred` or `could-not-fix`) that the
change made. A pre-existing finding is debt and is not a verdict input:

- An open BLOCKER → `dont-ship`.
- An open HIGH or MED, and no BLOCKER → `ship-with-caveats`.
- Otherwise → `ship`.

## A fix that changes an acceptance check

When the fix of a finding changes an acceptance check of the slice, or a confirmed design board
or `02c-craft.md` line, set `changesAcceptance: true` on the finding. The review does not ask
the person. It applies the fix and rewrites the check and the plan step in the same fix step,
per rule 5 of [_decisions.md](_decisions.md). When the fix goes against a decision of the person,
the review dismisses the finding with `wf.mjs findings set <id> dismissed --decision <D-id>`.

## The review file

A review file (`07-review.md`, or `07-review-<slice>.md` for a per-slice run) is written
**whole** on every run, from the ledger, as a draft that you put per [_records.md](_records.md). Take the table from `wf.mjs findings table` and the
frontmatter metrics from `wf.mjs findings metrics`. Do not merge into the old file and do not
edit rows in place: the ledger, not the file, keeps the history.

## What the law protects

- **Identity** — a finding's `id` and `surfaced-at` survive every re-run, so triage decisions
  and cross-run references stay attached to the same defect.
- **Honest clearing** — `resolved` is earned only by a re-run of the same dimension that no
  longer surfaces the finding. Deleting a row, skipping a dimension, or rewriting the file
  cannot clear anything.
- **Legible coverage** — because refuted and resolved rows are kept, a reader can tell a
  surface that was checked and found clean from a surface that was never read.
