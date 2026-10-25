# Review stage — the review file template (Step 5 of `_stage.md`)

Load this file from `_stage.md` Step 5. It holds the `07-review[-<slice-slug>].md` template. The file is written whole on every run, from the findings ledger `findings.yaml` ([_findings-ledger.md](../_findings-ledger.md)). Take every count from `wf.mjs findings metrics` and the findings table from `wf.mjs findings table`, with the scope of the run. Never count findings by hand.

## The template

```yaml
---
schema: sdlc/v1
type: review
slug: <slug>
review-scope: <slug-wide|per-slice>
slice-slug: <slice-slug or "" if slug-wide>
status: complete
stage-number: 7
created-at: "<iso-8601>"        # the first run's timestamp — keep it from the old file
updated-at: "<iso-8601>"        # this run's timestamp
# The next 14 fields are the output of `wf.mjs findings metrics`, unchanged:
verdict: <ship|ship-with-caveats|dont-ship>
commands-run: [correctness, security, ...]
metric-commands-run: <N>
metric-findings-total: <N>
metric-findings-raw: <N>
metric-findings-blocker: <N>     # handoff's blocker gate reads this field
metric-findings-high: <N>
metric-findings-med: <N>
metric-findings-low: <N>
metric-findings-nit: <N>
metric-findings-pre-existing: <N>
metric-findings-resolved: <N>
metric-findings-fixed: <N>       # ship's release notes read it
metric-findings-total-ever: <N>
fix-commit: "<SHA | null>"       # the review-time fix commit of this run, if any
modes: [select]                  # the modes of THIS run (review.md ## Requires); omit the key when none applies
tags: []
refs:
  index: 00-index.md
  findings: findings.yaml
  # Slug-wide mode:
  shape: 02-shape.md
  slice-index: 03-slice.md
  implements: [05-implement-<slice-1>.md, 05-implement-<slice-2>.md, ...]
  verifies: [06-verify-<slice-1>.md, 06-verify-<slice-2>.md, ...]
  # Per-slice mode (replace the four slug-wide keys above with these):
  slice-def: 03-slice-<slice-slug>.md
  implement: 05-implement-<slice-slug>.md
  verify: 06-verify-<slice-slug>.md
next-command: <key of the default route>
next-invocation: "/wf <key> <slug> [<slice>]"   # equals the default route's invocation
recommended-routes:              # every viable option from _stage.md Adaptive routing; exactly one default
  - invocation: "/wf ship <slug>"
    reason: "<one phrase>"
    default: true
  - invocation: "/wf review <slug> [<slice>]"
    reason: "<one phrase>"
---
```

# Review

## Verdict

**{Ship / Ship with caveats / Don't Ship}**

{3-4 sentence rationale. Name the most critical finding. State whether any blockers exist. Say what this run did: the net-new, seen-again and resolved counts that `findings add` printed, and how many findings the refuters refuted.}

## Decision Fidelity

Only when `00-index.md` records `origin-packet` and the scope is slug-wide; omit it otherwise. One row per carried decision of the origin work packet, in the order of the work packet file, per [intent-fidelity.md](intent-fidelity.md) "Decision Fidelity table". The campaign walk reads this table.

| Key | Verdict | Evidence | Approval |
|---|---|---|---|
| {key} | {honored / narrowed / dropped} | {file:line} | {{entry id}: {key} approved / —} |

## Domain Coverage

| Domain | Command | Status |
|--------|---------|--------|
| {domain} | `{command}` | {Clean / Issues / Blockers} |

## Findings

{The output of `wf.mjs findings table`, unchanged: open rows first, then the closed rows (resolved, refuted, fixed, dismissed) for history.}

## Open Findings (Detailed)

One section per open BLOCKER and HIGH finding of this scope, from its ledger entry:

### {ID}: {issue} [{SEVERITY}]

**Location:** `{file}:{line}` | **Source:** {dimension and `also`}
**Evidence:** {evidence}
**Fix:** {fix}
**Confidence:** {confidence} | **Surfaced:** {surfaced-at} | **Last seen:** {last-seen-at}

## Pre-existing Debt

The open findings with `pre-existing: true`: the defect is on the base branch, on lines this diff did not touch. They do NOT count toward the verdict or the blocker gate but are real debt. Route each to `/wf intake fix <description>` (defects) or `/wf intake refactor <description>` (structural). Omit this section when there are none.

| ID | Sev | Source | File:Line | Issue | Suggested routing |
|----|-----|--------|-----------|-------|-------------------|
| {ID} | {SEV} | {dimension} | {file}:{line} | {one-line issue} | `/wf intake fix\|refactor <desc>` |

## Fix Status

Present once any finding of this scope has status `fixed` or `could-not-fix`. One row per such entry of the ledger.

| ID | Sev | Status | Commit | Notes |
|----|-----|--------|--------|-------|
| {ID} | {SEV} | fixed / could-not-fix | {SHA or —} | {the reason of a could-not-fix, or a one-line summary} |

## Soft Findings

Informational observations that are not findings: each verify `## Friction Notes` and `## Free Exploration Notes` entry, with its source file. Write "None" when there are none.

## Recommendations

### Must Fix
{The open BLOCKER and HIGH findings, and each `could-not-fix` finding with its reason}

### Should Fix
{The open MED findings}

### Deferred
{The `deferred` findings with their reasons — re-triage later via `/wf review <slug> triage`}

### Consider
{The open LOW and NIT findings}
