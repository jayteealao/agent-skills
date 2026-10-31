# Audit ledger — Steps 3 to 5 of a project audit

A project audit (`ship-plan/audit.md`, `observability/audit.md`) fans out its lenses in Steps 0 to 2. Then it applies the three steps below. The citing card fills the slots:

| Slot | Meaning | ship-plan | observability |
|---|---|---|---|
| `<ledger>` | the audit file. Its basename is the `kind` | `.ai/ship-plan-audit.md` | `.ai/observability-audit.md` |
| `<plan>` | the plan file that the audit reads | `.ai/ship-plan.md` | `.ai/observability.md` |
| `<audit>` | the audit command | `/wf project ship-plan audit` | `/wf project observability audit` |
| `<harm>` | what a real finding makes go wrong | a release | production debugging |

The citing card owns the lenses, the target examples and the routes (its Step 6). Step 6 also derives the verdict.

# Step 3 — Synthesize and refute

1. **Collect** all lens findings. **Dedupe** by `(target + root cause)`. Keep the most specific severity, merge the rationales, and tag the finding with each lens that raised it.
2. **Normalize the severity** to BLOCKER / HIGH / MED / LOW / NIT. Map any other scale first.
3. **Refute each BLOCKER and HIGH a second time.** Read the cited evidence yourself (the plan block, the file lines). Confirm that the failure scenario is real before the finding enters the ledger as `open`. If you cannot reproduce the reasoning from the evidence, lower its confidence or drop it.
4. **Give each survivor a stable `id`**: `<lens>:<target-slug>:<issue-slug>`. The ledger dedupes on the id across runs, so the same problem must always get the same id.
5. **Route each finding** with the table of Step 6 of the citing card.

# Step 4 — Merge into the accumulating ledger

`<ledger>` **accumulates**. Never overwrite it. Reconcile the survivors of this run against the prior `findings[]`:

- **Still present** (same `id`) → keep `status: open`. Set `last-seen` to this run. Refresh the severity and the evidence if they changed.
- **New** (an id not seen before) → add it with `status: open` and `surfaced-at: <this run>`.
- **Gone** (a prior `open` or `acknowledged` id that no lens raised this run) → set `status: resolved` and `resolved-at: <this run>`. If the target itself is gone, also resolve it, and note that the target vanished. Never delete a finding without a record.
- **Acknowledged** findings stay `acknowledged` until they disappear (→ resolved) or the user triages them again (`<audit> triage`).
- **Accepted** findings (`triage: accept`) keep that field while the id is still present. Step 5 asks only for ids that have no decision yet.

Write the ledger in this shape. The frontmatter holds the machine state. The body tells the story.

```markdown
---
kind: <basename of <ledger>>
audited-plan-version: <plan.plan-version>
plan-updated-at: <plan.updated-at>
last-run: <N>
verdict: <sound | ship-with-caveats | unsound>
triage-status: <complete | awaiting-user>
awaiting-since: <run N | ->        # awaiting-user only — the run that asked the gate; must equal last-run
runs:
  - run: <N>
    lens-scope: <all | the single lens>
    plan-version: <v>
    verdict: <...>
    counts: { blocker: <n>, high: <n>, med: <n>, low: <n>, nit: <n> }
findings:
  - id: <lens>:<target-slug>:<issue-slug>
    lens: <lens>
    target: <a plan block | file:line — the citing card gives examples>
    severity: <BLOCKER|HIGH|MED|LOW|NIT>
    confidence: <high|med|low>
    status: <open | acknowledged | resolved>
    surfaced-at: <run N>
    last-seen: <run N>
    resolved-at: <run N | ->
    triage: <accept | ->            # BLOCKER/HIGH only — set by Step 5; carried across runs while the id is unchanged
    route: <the exact fixer command>
---

## The Audit
<The state audited, then the verdict and the finding that most threatens <harm>, then the route forward.
Name what would actually go wrong, not a checklist. Plain language.>

## Verdict
<sound | ship-with-caveats | unsound> — <one sentence, tied to the highest-severity open finding>

## Open findings
<For each open finding, grouped by severity:>
### <id> — <severity> · <lens>
- **Target:** <plan block / file:line>
- **What:** <the defect, one or two sentences>
- **Evidence:** <the concrete cite>
- **Failure scenario:** <inputs/state → the wrong outcome for <harm>>
- **Route:** `<fixer command>`

## Resolved this run
<findings open last run and gone now — id + what it was + resolved-at>

## Acknowledged (proceeding with known risk)
<acknowledged findings + the recorded reason>
```

The ledger is a plain markdown file, like `<plan>`. It takes **no sibling `.yaml`**. Sibling files belong to the artifacts under `.ai/workflows/`.

# Step 5 — Triage the blockers and highs (interactive)

Before you finalize, triage each open **BLOCKER and HIGH** finding with the user as a gate question per [_gate-question.md](_gate-question.md). Ask one decision per finding, or batch them. Show the finding text, the failure scenario and the route. The options:

- **accept** — leave it `open`. It needs a fix.
- **acknowledge** — known or intentional. Record a freeform reason and set `status: acknowledged`. The ledger keeps it until it disappears.
- **reject** — a false positive. Drop it. If it comes back, tighten the lens id so that it stays dropped.

MED, LOW and NIT findings land as `open` without a question.

**Record each decision in the ledger in the same turn.** `accept` sets `triage: accept` on the finding. `acknowledge` sets `status: acknowledged` and records the reason. `reject` drops the finding. When each open BLOCKER and HIGH carries a decision, set `triage-status: complete`. If the turn must end while the user answers the gate (a host whose question tool ends the turn), set `triage-status: awaiting-user` with `awaiting-since: <last-run>`, and record the decisions on the next write. This escape lasts one run: a later run that still carries `awaiting-user` with an old `awaiting-since` must ask the gate again or record the decisions.

**The write hook enforces this step.** The post-write verifier blocks a write of `<ledger>` in three cases:

- an open BLOCKER or HIGH exists, and `triage-status` is neither `complete` nor `awaiting-user`;
- `triage-status` is `complete`, and such a finding has no `triage: accept`;
- `triage-status` is `awaiting-user`, and `awaiting-since` is not `last-run`.

Where the host wires an end-of-turn check for the ledger (see [_host-invocation.md](_host-invocation.md), managed-artifact enforcement), it runs the same check, so the turn cannot end on an untriaged ledger. `pending` is not a state of this step.

**`triage` mode** (the first token is `triage`) skips the fan-out. Read the ledger again, show each `acknowledged` finding, and let the user decide again (the plan may have changed since). Then write the ledger again and give the summary.
