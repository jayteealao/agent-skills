---
description: "Modernize mode of intake — backfill an older workflow's artifacts to the schema the installed plugin now expects (charter, intent-risk ledger, wall-ownership and clearing-event fields on deferrals, revision ledgers). Slug-REQUIRED: `$wf intake <existing-slug> modernize`. Additive only: it fills absent fields from what the artifacts already say and NEVER rewrites a recorded decision, verdict, or acceptance criterion. Detected automatically by intake on an existing slug and offered as a first-class option."
argument-hint: <existing-slug> modernize [dry-run]
---

You are running **intake in modernize mode** — bringing a workflow that was authored under an older
plugin schema up to what the installed references now read.

> The External Output Boundary, the narrative-fragment tier, and the workflow-registry/slug
> semantics come from `_intake-context.md`, which the `intake` dispatcher loaded before this
> reference. Do not restate or fork those rules here.

# Why this mode exists

A long-lived workflow outlives several plugin releases. Its `00-index.md` was written before the
charter block existed, before the intent-risk ledger, before deferrals carried `wall-ownership` — and
every newer stage that reads those fields quietly gets nothing. Nothing *breaks*; things just stop
working silently, which is worse, because the gate that would have caught a problem simply never
fires.

The old path was an escape hatch: the user answered "didn't mean to extend" to the extension prompt
and the model improvised a backfill from scratch. That improvisation happened at least twice. Doing
it the same way each time is the entire point of making it a mode.

# The cardinal rule: additive only

Modernize **fills absent fields from what the artifacts already say.** It never:

- rewrites or re-words a recorded decision, verdict, acceptance criterion, or defer-reason;
- changes a `status`, `result`, `convergence`, or `verdict`;
- invents a charter commitment, a risk, or a wall classification that the artifacts do not support;
- clears a deferral, or narrows one.

Where the artifacts do not answer a field, the field is **left absent and reported** — never guessed.
A backfilled `wall-ownership: external` that nobody actually decided is worse than no field at all,
because every later stage will treat it as a recorded triage verdict. Absence is honest; a
confabulated record is not.

# Step 0 — Detect the era

Read `.ai/workflows/<slug>/00-index.md` and the stage artifacts it lists, and check each marker
below. Detection is by **feature presence**, not by a version number — workflows do not record which
plugin wrote them, and marker presence is what the consuming references actually test.

| Marker | Absent means | Backfill source |
|---|---|---|
| `charter:` on the index | charter-fidelity checkpoints never run (`$wf yolo` skips them entirely) | the intake artifact's `## Charter` section, verbatim; if the intake has none, leave absent |
| `intent-risks:` on the index | the RIM ledger is invisible to shape, verify, status deep, and the mid-build discover checkpoint | shape's recorded risks/assumptions; leave absent when shape recorded none |
| `wall-ownership:` on each open deferral | the ownership triage is skipped — `code-owned` walls get deferred instead of surfaced | the defer-reason's own words when they clearly name the wall; otherwise **leave absent and list it** as needing a re-triage |
| `clearing-event:` on each open deferral | the deferral is indefinite by construction and reads as progress forever | the defer-reason when it names a provisionable act; otherwise leave absent and list it |
| `clearing-probe:` on each open deferral | nobody notices when the clearing event happens | only when the artifacts already contain the probe command; never invent one |
| `revisions:` / `revision-count` on revisable artifacts | provenance of past edits is unrecoverable | seed a single `rev: 1` entry with `trigger: manual`, `because: "pre-ledger artifact"` — do **not** reconstruct a history that was never recorded |
| `slices[].status` on the index | drivers cannot tell a skipped slice from a live one | the per-slice artifacts' own terminal state on disk |
| `evidence-rung:` on user-observable AC rows | the mock-evidence gate cannot fire | the verify artifact's recorded evidence, when it is explicit; otherwise leave absent |

# Step 1 — Report before writing (MANDATORY)

Show the user, before touching anything:

1. **Backfillable** — field, target file, and the exact source the value comes from.
2. **Not backfillable** — field and *why the artifacts cannot answer it*, plus the command that
   would: a wall with no recorded ownership needs `$wf probe <slug>` or a re-verify, not a guess.
3. **Untouched** — say plainly that no decision, verdict, or criterion will change.

`$wf intake <slug> modernize dry-run` stops here and writes nothing. Otherwise confirm once in chat
(ask and wait) and proceed.

# Step 2 — Write

1. Apply only the confirmed backfills. Refresh `updated-at` on every file touched.
2. Follow [_control-file-ownership.md](../_control-file-ownership.md) for `00-index.md` and the
   registry — re-read immediately before each edit, retry once on a modified-since-read rejection.
3. Per [_additive-write.md](../_additive-write.md), snapshot each revisable artifact you change and
   append one `revisions:` entry with `trigger: manual` and `because: "schema modernization"`.
4. Leave every non-backfillable field **absent**. Do not write a placeholder, an empty string, or an
   `n-a` — a junk value is indistinguishable from a real one to the gates that read it, and that
   ambiguity is exactly what the evidence-schema contract exists to eliminate.

# Step 3 — Chat return

```
wf intake modernize complete: <slug>

<Narrative — what era this workflow was authored in, what is now readable that was not, and what
 still needs a real run to answer.>

Backfilled: <field → file, one per line, with its source>
Still absent: <field → what would produce it (a command), one per line, or "none">
Unchanged: every recorded decision, verdict, and acceptance criterion
Artifacts: <files touched>
Next: <the command that resolves the largest remaining gap, or the workflow's own next step>
```

Framing rules are single-sourced in [_chat-return.md](../_chat-return.md).

# What this mode is NOT

- **Not a re-run.** It reads what the artifacts recorded; it never re-derives, re-verifies, or
  re-decides anything.
- **Not a repair tool.** A workflow whose *content* is wrong needs the stage that owns that content.
  Modernize only addresses the schema envelope around it.
- **Not automatic.** Intake *detects* drift and offers this mode; it never modernizes silently. An
  unannounced rewrite of someone's artifacts is not a favour.
