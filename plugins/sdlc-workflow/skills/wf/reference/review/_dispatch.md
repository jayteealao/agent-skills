# Review stage — the scout and refuter prompts (Steps 3 and 3b of `_stage.md`)

Load this file from `_stage.md` Step 3, in mode `select` only. It holds the prompt that every review scout receives (Step 3) and the prompt of a refuter (Step 3b). A scout and a refuter write no file: each returns its result in its reply, and the coordinator merges the results into the ledger of [_findings-ledger.md](../_findings-ledger.md). The fix sub-agent prompt of Step 4c is in [_fix-prompt.md](_fix-prompt.md).

## Step 3 — the scout prompt

Substitute the per-slice or slug-wide variant based on the current `review-scope`. Resolve every `<skill-dir>` to an absolute path per [_host-invocation.md](../_host-invocation.md) before dispatch — a child has no citing file to resolve a relative path against.

```
Execute the review rubric at `<skill-dir>/reference/review/{command-name}.md`.
Focus: {the triggered `###` sections, or "all sections" for a core rubric}

Scope:
  - Slug-wide mode: `git diff <base-branch>...HEAD` (the whole branch of the work packet)
  - Per-slice mode: `git diff HEAD` (working-tree diff for the current slice)
Workflow slug: {slug}
Review scope: {review-scope}
Selected slice: {slice or "(none — slug-wide)"}
Acceptance checks: {the acceptance criteria of the slices in scope, from the brief}

Read the rubric. When Focus names sections, read those `###` sections of `# What to look for`
plus `# Severity calibration`; otherwise read every section. Perform the review for the scope.

PRE-EXISTING determination (per finding, mandatory): check whether the flagged line(s) appear
in the diff above. Lines untouched by the diff → `preExisting: true` (the defect was already on
the base branch); lines the diff added or modified → `preExisting: false`. For moved or renamed
code where the diff test is ambiguous, use `git blame` as the tiebreaker.

ACCEPTANCE CHECKS: when the fix of a finding changes an acceptance check above, or an approved
screen (`.ai/design/screens/`) or a `02c-craft.md` line, set `changesAcceptance: true`. Do not
soften the finding to avoid the question.

Write no file. Return only this JSON object:
{ "dimension": "{command-name}",
  "findings": [ { "dimension": "{command-name}", "severity": "BLOCKER|HIGH|MED|LOW|NIT",
                  "confidence": "High|Med|Low", "file": "<path>", "line": "<n or n-m>",
                  "issue": "<one sentence>", "evidence": "<a short snippet>",
                  "fix": "<the minimal fix, for HIGH and above>",
                  "preExisting": false, "changesAcceptance": false } ] }
A clean dimension returns "findings": [].
```

## Step 3b — the refuter prompt

Send each group of up to 4 findings to one refuter. A refuter gets the findings, not the scout's reasoning.

```
Try to refute each finding below against the code at HEAD. A finding is refuted when the code
does not do what the finding says, when a guard elsewhere prevents the failure, or when the
claimed failure cannot happen with the inputs that reach the code. Read the code; do not
reason from the finding's text alone. When you cannot refute a finding, it stands.

Findings:
{the findings, as JSON, each with its index}

Write no file. Return only this JSON object:
{ "verdicts": [ { "index": <n>, "refuted": true|false, "reason": "<one sentence with file:line>" } ] }
```
