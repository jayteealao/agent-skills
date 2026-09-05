# Review stage — sub-agent prompts (Steps 3 and 4c of `_stage.md`)

Load this file from `_stage.md` Step 3 and Step 4c. The first section holds the prompt every review sub-agent receives and the per-dimension output contract that prompt carries. The second section holds the fix sub-agent prompt.

## Step 3 — the review sub-agent prompt

Substitute the per-slice or slug-wide variant based on the current `review-scope`. Resolve every `<skill-dir>` to an absolute path per [_host-invocation.md](../_host-invocation.md) before dispatch — a child has no citing file to resolve a relative path against.

```
Execute the review command at `<skill-dir>/reference/review/{command-name}.md`.

Scope:
  - Per-slice mode: `git diff HEAD` (working-tree diff for the current slice)
  - Slug-wide mode: `git diff <base-branch>...HEAD` (full branch diff)
Workflow slug: {slug}
Review scope: {review-scope}                              # per-slice or slug-wide
Selected slice: {slice or "(none — slug-wide)"}

Read the command file and follow its WORKFLOW exactly. Perform the review for the given scope.

PRE-EXISTING determination (per finding, MANDATORY): check whether the finding's flagged
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

IMPORTANT: Write your complete review findings to the file:
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
High/Med/Low, status open|deferred|dismissed|fixed|could-not-fix|resolved, the `Pre` column
(`pre-existing: true|false` from the diff test), and the `surfaced-at` date. Keep resolved
rows for history; mark them clearly.)

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

Then author the rich siblings next to that `.md` (do NOT leave this for the orchestrator):
  1. Write `<stem>.yaml` — schema `siblingYamlSchemas.review-dimension` in
     `tests/frontmatter.schema.json` (`artifact: review-dimension`, `dimension`,
     `parent`, `rev`, `verdict`, `summary`, `counts`, `findings`), scoped to THIS
     dimension only. (`<stem>` = the review `.md` filename without `.md`.)
     - `findings:` = **OPEN findings only** (status open|deferred|could-not-fix). Resolved/
       fixed/dismissed findings live in the `.md` body, not the `.yaml` — this keeps the
       rendered heatmap + counts honest about live state. Each `.yaml` finding carries
       `surfaced-at` + `status` + `pre-existing` (additive fields; schema-validated).
     - `counts:` = OPEN counts. `rev:` = number of times this dimension file has been
       written (increment the prior `.yaml`'s `rev` by 1; first write = 1).
  2. Write `<stem>.html.fragment` — one
     `<section class="fragment-review-dimension" data-artifact="review-dimension">`
     per the per-dimension shape in `<skill-dir>/reference/review/_artifact.md` (Step 5c) and
     `<skill-dir>/reference/_fragment-authoring.md`.
Managed-artifact enforcement (the host's write hook, `<skill-dir>/reference/_host-invocation.md`) BLOCKS the `.md` write when the sibling
`.yaml` is missing — write the `.yaml` first (or in the same turn). If this
dimension has zero OPEN findings (clean, or everything resolved), set `fragment: none`
in the `.md` frontmatter instead of authoring an empty fragment.

Write the files, then return a brief summary of what you found.
```

## Step 4c — the fix sub-agent prompt

This is the same fix prompt shape used by `/wf implement reviews` mode — kept identical so behavior matches when the user routes through either path. Every fix sub-agent LEADS its return with the `Method:` line.

```
Fix the following review finding in the codebase:

Finding ID: {ID}
Source review command: {command}
Severity: {severity}
Location: {file}:{line-range}
Issue: {issue description}
Suggested fix: {fix suggestion}

Read the file(s) at the specified location. Understand the issue.
Apply the minimal fix that resolves the issue without introducing
new problems. Do NOT change anything beyond what is needed for this
specific finding. Do NOT refactor. Do NOT broaden scope.

The suggested fix names a METHOD, not only an outcome. Follow it. You
may deviate if it is wrong or impossible — but disclose that FIRST,
not in a closing note.

After fixing, verify your change is correct:
- The fix addresses the specific issue described
- Run the narrowest real check for the files you touched (the repo's
  formatter/linter for that language, or the covering test) and report
  its exit status — do not assert "no new failures" without running one
- The surrounding code still makes sense

Return, in this order:
  Method: as-prescribed | deviated
  (if deviated) what was suggested / what you did instead / why
  Self-check: <command> → exit <N>
  A brief summary of what you changed and whether the fix is confirmed.
```
