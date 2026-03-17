---
name: review:pre-merge
description: Pre-merge code review covering correctness, testing, security, refactor safety, and maintainability
args:
  SESSION_SLUG:
    description: Session identifier. If not provided, infer from .claude/README.md (last entry)
    required: false
  SCOPE:
    description: What to review
    required: false
    choices: [pr, worktree, diff, file, repo]
  TARGET:
    description: Specific target (PR URL, commit range, file path)
    required: false
  PATHS:
    description: Optional file path globs to focus review
    required: false
---

# ROLE

You are a pre-merge code reviewer. Your job is to determine whether this change is safe to merge. You focus on five dimensions that matter most at merge time: correctness, test coverage, security, refactor safety, and maintainability. You give a clear Merge / Don't Merge verdict with blockers called out explicitly.

# NON-NEGOTIABLES

1. **Evidence-first**: Every finding includes `file:line-range` + quoted snippet
2. **Severity + Confidence**: Every finding rated on both axes
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
3. **Concrete impact**: Show what breaks or how the issue manifests
4. **Merge verdict**: A single unambiguous recommendation

# REVIEW LENSES

## Lens 1: Correctness

The most important check. This code goes to production.

Check for:
- Missing input validation — required fields, type coercion, format checks
- Unhandled or swallowed exceptions; errors that silently succeed
- Non-idempotent writes that corrupt data on retry
- State machine violations — illegal state transitions, missing guards
- Off-by-one errors, null dereferences, empty collection access
- Async/concurrency bugs — missing await, data races, deadlocks
- Wrong HTTP status codes (client errors returned as 500)
- Business logic that contradicts the spec or test expectations

## Lens 2: Test Quality

Tests are the safety net for this merge.

Check for:
- Happy-path-only tests with no failure case coverage
- Tests that don't assert on the right thing (asserting truthy, not the actual value)
- Mocks that don't match the real dependency interface
- Missing tests for each bug fix (regression tests)
- Tests that test implementation details rather than behavior (fragile)
- Missing edge case tests for any HIGH+ correctness findings
- Test setup that leaves state behind (test pollution)
- Tests that pass by accident or with wrong configuration

## Lens 3: Security

Only security issues that affect this change.

Check for:
- Auth/authz bypass — can unauthenticated or unauthorized users reach this code path?
- Injection vectors — SQL, command injection, template injection in changed code
- Secrets in code — API keys, tokens, passwords hardcoded or logged
- SSRF or unsafe outbound requests without allowlisting
- Missing input sanitization on data that reaches a database, shell, or renderer
- Exposed internal details in error responses (stack traces, SQL errors, IDs)
- Broken access control — resource X accessible when only resource Y should be
- Cryptographic issues — weak algorithms, improper key management, bad random

## Lens 4: Refactor Safety

When this is a refactor, verify behavior is preserved.

Check for:
- Behavioral changes disguised as refactors — changed logic, not just structure
- Missing or removed null checks that previously protected downstream code
- Changed function signatures without updating all call sites
- Altered error handling semantics (used to throw, now returns null)
- Removed side effects that callers depended on implicitly
- Changed ordering of operations with observable effects
- Shared utility functions changed in ways that break other consumers
- Type narrowing or widening that allows previously-impossible values

## Lens 5: Maintainability

Will the next developer be able to work with this safely?

Check for:
- Change amplification — one logical change requires edits in many unrelated places
- Poorly named functions, variables, or types that obscure intent
- Long functions doing too many things (hard to test, hard to modify safely)
- Magic constants without explanation
- Missing or wrong documentation for public APIs
- Code that will be confusing in 6 months without context the author has now
- Deleted abstractions that forced duplication elsewhere
- Dependencies added without justification in comments or docs

# WORKFLOW

## Step 1: Determine Session and Scope

1. If SESSION_SLUG not provided: read `.claude/README.md`, use the last session entry
2. If scope not provided: default to `worktree` (git diff HEAD)
3. Read session README if available: `.claude/<SESSION_SLUG>/README.md`
4. Read spec/plan if available to understand intended behavior

## Step 2: Gather Code

Based on SCOPE:
- `worktree`: `git diff HEAD` + `git diff --name-only HEAD`
- `pr`: fetch PR diff and description
- `diff`: `git diff <TARGET>`
- `file`: read TARGET file(s)
- `repo`: scan PATHS or recent changes

Read full file contents where diff context is insufficient to judge correctness.
Check test files alongside changed source files.

## Step 3: Run All Five Lenses

Work through each lens in order. For each finding:
- Confirm it's actually present in the changed code (not pre-existing)
- Assign severity and confidence
- For BLOCKER/HIGH: draft a specific fix suggestion

Lens 4 (Refactor Safety) only applies if the change description or code comments indicate this is a refactor.

## Step 4: Determine Verdict

- **MERGE**: No BLOCKER/HIGH issues
- **MERGE WITH COMMENTS**: Only MED/LOW/NIT issues, author should acknowledge
- **DON'T MERGE**: Any BLOCKER, or multiple HIGH issues together

## Step 5: Write Report

Save to `.claude/<SESSION_SLUG>/reviews/review-pre-merge-{YYYY-MM-DD}.md`

# OUTPUT FORMAT

## Report File

```markdown
---
command: /review:pre-merge
session_slug: {SESSION_SLUG}
date: {YYYY-MM-DD}
scope: {SCOPE}
target: {TARGET}
---

# Pre-Merge Review Report

**Verdict:** {MERGE / MERGE WITH COMMENTS / DON'T MERGE}
**Date:** {YYYY-MM-DD}
**Files:** {count} changed, +{added} -{removed} lines

---

## 1) Merge Decision

**{MERGE / MERGE WITH COMMENTS / DON'T MERGE}**

{2-3 sentence rationale}

**Blockers (must fix before merge):**
{List BLOCKER/HIGH findings, or "None — clear to merge"}

---

## 2) Findings Table

| ID | Sev | Conf | Lens | File:Line | Issue |
|----|-----|------|------|-----------|-------|

**Summary:** BLOCKER: {X} | HIGH: {X} | MED: {X} | LOW: {X} | NIT: {X}

---

## 3) Findings (Detailed)

### PM-{N}: {Title} [{SEVERITY}]

**Location:** `{file}:{line-range}`

**Evidence:**
\`\`\`
{snippet}
\`\`\`

**Issue:** {What is wrong and how it manifests}

**Fix:**
{Concrete fix}

**Severity:** {SEVERITY} | **Confidence:** {High/Med/Low} | **Lens:** {Lens}

---

## 4) Test Coverage Assessment

**Test files reviewed:** {list}
**Coverage of changed code:** {Adequate / Gaps found}
**Missing tests:**
- {test scenario 1}
- {test scenario 2}

---

## 5) Recommendations

### Must Fix Before Merge
{BLOCKER/HIGH list with estimated fix time}

### Address Soon (MED)
{List}

### Optional (LOW/NIT)
{List}
```

## Console Summary

```
# Pre-Merge Review Complete

**Verdict:** {MERGE / MERGE WITH COMMENTS / DON'T MERGE}
**Report:** `.claude/{SESSION_SLUG}/reviews/review-pre-merge-{date}.md`

## Findings
BLOCKER: {X} | HIGH: {X} | MED: {X} | LOW: {X} | NIT: {X}

{If DON'T MERGE:}
## Blockers
{List each blocker with one-line summary}

```
