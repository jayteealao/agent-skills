# Review stage — the review sub-agent prompt (Step 3 of `_stage.md`)

Load this file from `_stage.md` Step 3, in mode `select` only. It holds the prompt that every review sub-agent receives and the output contract of each dimension. The fix sub-agent prompt of Step 4c is in [_fix-prompt.md](_fix-prompt.md).

## Step 3 — the review sub-agent prompt

Substitute the per-slice or slug-wide variant based on the current `review-scope`. Resolve every `<skill-dir>` to an absolute path per [_host-invocation.md](../_host-invocation.md) before dispatch — a child has no citing file to resolve a relative path against.

```
Execute the review rubric at `<skill-dir>/reference/review/{command-name}.md`.
Focus: {the triggered `###` sections, or "all sections" for a core rubric}

Scope:
  - Per-slice mode: `git diff HEAD` (working-tree diff for the current slice)
  - Slug-wide mode: `git diff <base-branch>...HEAD` (full branch diff)
Workflow slug: {slug}
Review scope: {review-scope}                              # per-slice or slug-wide
Selected slice: {slice or "(none — slug-wide)"}

Read the rubric. When Focus names sections, read those `###` sections of `# What to look for` plus `# Severity calibration`; otherwise read every section. Perform the review for the given scope.

PRE-EXISTING determination (per finding, mandatory): check whether the finding's flagged
line(s) appear in the workflow diff above. Lines untouched by this workflow's diff →
`pre-existing: true` (the defect was already on the base branch); lines the diff
added/modified → `pre-existing: false`. For moved or renamed code where the diff test is
ambiguous, use `git blame` as the tiebreaker — reviewer judgment decides. A re-run may flip
a prior finding's `pre-existing` value if the diff has since grown to touch those lines.

ACCUMULATE — do not overwrite. Before writing, READ your target file below if it already
exists (plus its sibling `.yaml`). It holds prior findings for THIS dimension with stable
IDs and `surfaced-at` stamps. MERGE your fresh findings into it by the findings-ledger
merge law: READ the shared reference `<skill-dir>/reference/_findings-ledger.md` and apply
its rules 2–5 to this dimension's file (re-surfaced findings keep prior id/surfaced-at;
net-new get max+1; resolve-sweep what you did not re-surface; triaged statuses persist).
Get `now` from the real UTC timestamp per `<skill-dir>/reference/_timestamp.md`. Emit the FULL merged set (open AND resolved), not just this run's deltas.

Write your complete review findings to the file:
  - Per-slice: `.ai/workflows/{slug}/07-review-{slice-slug}-{command-name}.md`
  - Slug-wide: `.ai/workflows/{slug}/07-review-{command-name}.md`

Use this structure for the file (YAML frontmatter first, then markdown):

```yaml
---
schema: sdlc/v1
type: review-command
slug: {slug}
review-scope: {per-slice|slug-wide}
slice-slug: {slice or "" if slug-wide}
review-command: {command-name}
status: complete
updated-at: "{timestamp}"
metric-findings-total: {N}        # OPEN findings only (status open|deferred|could-not-fix)
metric-findings-blocker: {N}      # OPEN blockers with pre-existing: false — pre-existing defects never count here
metric-findings-high: {N}         # OPEN highs with pre-existing: false
metric-findings-pre-existing: {N} # OPEN findings with pre-existing: true (any severity) — surfaced as debt, not verdict input
metric-findings-resolved: {N}     # findings cleared on a re-run (status resolved)
result: clean | issues-found | blockers-found    # by OPEN findings
tags: []
refs:
  review-master: {07-review-{slice-slug}.md | 07-review.md}
---
```

# Review: {command-name}

## Findings
| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
(ALL findings — open AND resolved — with severity BLOCKER/HIGH/MED/LOW/NIT, confidence
High/Med/Low, status open|deferred|dismissed|fixed|could-not-fix|resolved|kept-by-person, the `Pre` column
(`pre-existing: true|false` from the diff test), and the `surfaced-at` date. Keep resolved
rows for history; mark them clearly.)

A finding against a frozen board (`design/r<N>/`) or a `02c-craft.md` line gets triage `needs-amend`. It stays open: only the person amends, keeps (`kept-by-person`) or defers it.

## Detailed Findings
### {ID}: {Title} [{SEVERITY}]
**Location:** `{file}:{line-range}`
**Evidence:**
```
{snippet}
```
**Issue:** {description}
**Fix:** {suggestion for HIGH+}
**Severity:** {level} | **Confidence:** {High/Med/Low} | **Pre-existing:** {true/false}
**Status:** {status} | **Surfaced:** {surfaced-at} | **Last seen:** {last-seen-at}{ | **Resolved:** {resolved-at} if resolved}

## Summary
- Open findings: {N}    (resolved this run: {N})
- Open blockers: {N}    (pre-existing excluded; pre-existing findings: {N})
- Status: {Clean / Issues Found / Blockers Found}

Then author the rich sibling next to that `.md` (do NOT leave this for the orchestrator):
  Write `<stem>.yaml` — schema `siblingYamlSchemas.review-dimension` in
     `schemas/frontmatter.schema.json` (`artifact: review-dimension`, `dimension`,
     `parent`, `rev`, `verdict`, `summary`, `counts`, `findings`), scoped to THIS
     dimension only. (`<stem>` = the review `.md` filename without `.md`.)
     - `findings:` = **OPEN findings only** (status open|deferred|could-not-fix). Resolved/
       fixed/dismissed findings live in the `.md` body, not the `.yaml` — this keeps the
       counts honest about live state. Each `.yaml` finding carries
       `surfaced-at` + `status` + `pre-existing` (additive fields; schema-validated).
     - `counts:` = OPEN counts. `rev:` = number of times this dimension file has been
       written (increment the prior `.yaml`'s `rev` by 1; first write = 1).
Write the `.yaml` in the same turn as the `.md`. If this dimension has zero OPEN
findings (clean, or everything resolved), write no `.yaml`.

Write the files, then return a brief summary of what you found.
```
