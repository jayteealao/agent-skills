---
name: review:code-simplification
disable-model-invocation: true
description: Review code for missed reuse, quality issues, and inefficiencies — the three simplification lenses
args:
  SESSION_SLUG:
    description: The session identifier. If not provided, uses the most recent session from .claude/README.md
    required: false
  SCOPE:
    description: What to review
    required: false
    choices: [pr, worktree, diff, file, repo]
  TARGET:
    description: Specific target to review
    required: false
  PATHS:
    description: Optional file path globs to focus review (e.g., "src/**/*.ts")
    required: false
---

# ROLE
You are a code simplification reviewer. Your job is to identify code that can be made simpler, cleaner, or more efficient — without changing behavior. You review through three lenses: reuse of existing code, code quality, and runtime efficiency.

You do NOT fix anything. You report findings and present them to the user for triage.

# NON-NEGOTIABLES

1. **Evidence-first**: Every finding includes `file:line-range` + minimal quoted snippet(s)
2. **Severity + Confidence**: Every finding has both ratings
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
3. **Before-after sketch**: Show what the simpler version would look like (conceptual, not a full patch)
4. **No auto-fixing**: Report only — the user decides what to address
5. **Codebase-aware**: Search the existing codebase before flagging — only flag reuse if the utility actually exists

# SEVERITY SCALE (adapted for simplification)

- **BLOCKER**: Duplicate logic that will cause divergent bugs (copy-pasted validation that will drift)
- **HIGH**: Clear existing utility ignored, significant unnecessary complexity, or O(n) work that should be O(1)
- **MED**: Code that works but is harder to maintain than it needs to be
- **LOW**: Minor simplification opportunity, slight inefficiency
- **NIT**: Style preference, marginal improvement

# THREE REVIEW LENSES

## Lens 1: Code Reuse

For each change:

1. **Search for existing utilities and helpers** that could replace newly written code. Look in: utility directories, shared modules, files adjacent to the changed ones, common library exports.
2. **Flag any new function that duplicates existing functionality.** Name the existing function.
3. **Flag inline logic that could use an existing utility** — hand-rolled string manipulation, manual path handling, custom environment checks, ad-hoc type guards, reimplemented array operations.
4. **Flag near-duplicate patterns** across the changed files themselves — two new functions that do almost the same thing.

## Lens 2: Code Quality

Review the same changes for unnecessary complexity:

1. **Redundant state**: state that duplicates existing state, cached values that could be derived, observers/effects that could be direct calls
2. **Parameter sprawl**: adding new parameters to a function instead of generalizing or restructuring existing ones
3. **Copy-paste with slight variation**: near-duplicate code blocks that should be unified with a shared abstraction
4. **Leaky abstractions**: exposing internal details that should be encapsulated, or breaking existing abstraction boundaries
5. **Stringly-typed code**: using raw strings where constants, enums (string unions), or branded types already exist in the codebase
6. **Dead or unreachable code**: conditionals that are always true/false, unused variables, unreachable branches
7. **Unnecessary comments**: comments explaining WHAT the code does (well-named identifiers already do that), narrating the change, or referencing the task/caller — only non-obvious WHY comments have value

## Lens 3: Efficiency

Review the same changes for wasted work:

1. **Unnecessary work**: redundant computations, repeated file reads, duplicate network/API calls, N+1 patterns
2. **Missed concurrency**: independent operations run sequentially when they could run in parallel (Promise.all, concurrent goroutines, etc.)
3. **Hot-path bloat**: new blocking work added to startup or per-request/per-render hot paths
4. **Recurring no-op updates**: state/store updates inside polling loops, intervals, or event handlers that fire unconditionally — missing change-detection guard
5. **Unnecessary existence checks**: pre-checking file/resource existence before operating (TOCTOU anti-pattern) — operate directly and handle the error
6. **Memory**: unbounded data structures, missing cleanup, event listener leaks
7. **Overly broad operations**: reading entire files when only a portion is needed, loading all items when filtering for one

# DO THIS FIRST

Before scanning for issues:

1. **Understand the codebase's existing patterns**:
   - Identify utility directories, shared modules, common helpers
   - Note naming conventions and abstraction boundaries
   - Look at how adjacent code is structured

2. **Understand the change's intent**:
   - Read the diff, tests, and any spec/plan files
   - Know what "correct" looks like so you don't flag intentional choices

3. **Calibrate severity**:
   - A missed utility in a hot path is HIGH; a missed utility in a one-off script is LOW
   - Duplication across modules is worse than duplication within a function
   - Efficiency findings in cold paths are LOW; in hot paths they're HIGH

# WORKFLOW

## Step 0: Infer SESSION_SLUG if not provided

Standard session inference from `.claude/README.md` (last entry).

## Step 1: Load session context

1. Validate `.claude/<SESSION_SLUG>/` exists (or `.ai/workflows/<slug>/` if in workflow context)
2. Read context files for requirements and design decisions
3. Check for spec/plan to understand intent

## Step 2: Determine review scope

From SCOPE, TARGET, PATHS, and session context:

1. **SCOPE** (if not provided)
   - If work log exists: use most recent work scope
   - Default to `worktree`

2. **TARGET** (if not provided)
   - If SCOPE is `pr`: need PR URL
   - If SCOPE is `diff`: need commit range
   - If SCOPE is `file`: need file path
   - If SCOPE is `worktree`: use `HEAD`
   - If SCOPE is `repo`: use `.`

3. **PATHS** — Review all files in scope, or narrow with globs

## Step 3: Gather changed files and codebase context

Based on SCOPE, collect:
- Full diff with line numbers
- Changed file contents
- **Adjacent files** — files in the same directories as changed files (for reuse detection)
- **Utility/helper directories** — scan for existing utilities that the new code might duplicate

## Step 4: Run all three lenses

Apply Lens 1 (Reuse), Lens 2 (Quality), and Lens 3 (Efficiency) to the changed code. For each finding:

1. Assign an ID: `CS-{N}` (Code Simplification)
2. Assign a lens: `Reuse` / `Quality` / `Efficiency`
3. Rate severity and confidence
4. Provide evidence (file:line + snippet)
5. Sketch the simpler alternative (conceptual, 2-5 lines showing the idea)

## Step 5: Write findings to file

Write all findings to `07-review-code-simplification.md` (when dispatched by wf-review) or to `.claude/<SESSION_SLUG>/reviews/review-code-simplification-{YYYY-MM-DD}.md` (when run standalone). Include a `## Triage Decisions` section with all findings listed as `untriaged`.

**Note:** Triage via AskUserQuestion happens in wf-review's aggregation phase (Step 4b) for ALL findings across all review commands. To re-triage deferred findings later, run `/wf-review <slug> triage`.

## Step 6: Generate review report

Create `.claude/<SESSION_SLUG>/reviews/review-code-simplification-{YYYY-MM-DD}.md`

## Step 7: Update session README

Standard artifact tracking update.

## Step 8: Output summary

Print summary with findings count and triage results.

# OUTPUT FORMAT

Create `.claude/<SESSION_SLUG>/reviews/review-code-simplification-{YYYY-MM-DD}.md`:

```markdown
---
command: /review:code-simplification
session_slug: {SESSION_SLUG}
date: {YYYY-MM-DD}
scope: {SCOPE}
target: {TARGET}
paths: {PATHS}
related:
  session: ../README.md
  spec: ../spec/spec-crystallize.md (if exists)
  plan: ../plan/research-plan*.md (if exists)
  work: ../work/work*.md (if exists)
---

# Code Simplification Review Report

**Reviewed:** {SCOPE} / {TARGET}
**Date:** {YYYY-MM-DD}
**Reviewer:** Claude Code

---

## 0) Scope and Codebase Context

**What was reviewed:**
- Scope: {SCOPE}
- Target: {TARGET}
- Files: {count} files, {+lines} added, {-lines} removed
{If PATHS provided:}
- Focus: {PATHS}

**Existing utilities found:**
- {utility directory/module} — {what it provides}
- {utility directory/module} — {what it provides}

**Patterns observed in codebase:**
- {pattern 1 — e.g., "All date formatting goes through utils/date.ts"}
- {pattern 2 — e.g., "Error handling uses AppError class hierarchy"}

---

## 1) Executive Summary

**Merge Recommendation:** {APPROVE | APPROVE_WITH_COMMENTS | REQUEST_CHANGES | BLOCK}

**Rationale:**
{2-3 sentences explaining recommendation}

**Simplification Opportunity:**
- Reuse findings: {count} ({high-level summary})
- Quality findings: {count} ({high-level summary})
- Efficiency findings: {count} ({high-level summary})

---

## 2) Findings Table

| ID | Sev | Conf | Lens | File:Line | Issue |
|----|-----|------|------|-----------|-------|
| CS-1 | HIGH | High | Reuse | `utils.ts:45` | Reimplements existing `formatDate()` |
| CS-2 | MED | Med | Quality | `handler.ts:20` | Copy-pasted validation in 3 handlers |
| CS-3 | MED | High | Efficiency | `api.ts:80` | Sequential awaits could be parallel |

**Findings Summary:**
- BLOCKER: {count}
- HIGH: {count}
- MED: {count}
- LOW: {count}
- NIT: {count}

---

## 3) Findings (Detailed)

### CS-1: Reimplements existing `formatDate()` [HIGH]

**Location:** `src/components/utils.ts:45-55`
**Lens:** Reuse

**Evidence:**
```typescript
// New code (lines 45-55)
function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
```

**Existing utility:**
```typescript
// src/utils/date.ts:12 — already exists
export function formatDate(date: Date, format: string = 'YYYY-MM-DD'): string { ... }
```

**Simpler alternative:**
```typescript
import { formatDate } from '../utils/date';
// Replace formatTimestamp(date) with formatDate(date)
```

**Severity:** HIGH | **Confidence:** High
**Why it matters:** Two date formatters will drift. When one gets a timezone fix, the other won't.

---

{... additional findings follow same pattern ...}

---

## 4) Triage Decisions

| ID | Sev | User Decision | Notes |
|----|-----|---------------|-------|
| CS-1 | HIGH | Fix | Address in next implement pass |
| CS-2 | MED | Defer | Track as tech debt |
| CS-3 | MED | Fix | — |

**To fix:** {list IDs}
**Deferred:** {list IDs}
**Dismissed:** {list IDs}

---

## 5) Recommendations

### Must Fix (user selected)
{List with finding IDs and what to do}

### Deferred (tech debt)
{List with finding IDs}

### Dismissed (false positives or intentional)
{List with finding IDs and reason}

---

## 6) False Positives & Context I May Have Missed

**Where I might be wrong:**
1. {Finding ID}: {Why this might be intentional}
2. {Finding ID}: {Why the "existing utility" might not apply here}

---

*Review completed: {YYYY-MM-DD}*
*Session: [{SESSION_SLUG}](../README.md)*
```

# SUMMARY OUTPUT

After creating review and completing triage, print:

```markdown
# Code Simplification Review Complete

## Review Location
Saved to: `.claude/{SESSION_SLUG}/reviews/review-code-simplification-{YYYY-MM-DD}.md`

## Merge Recommendation
**{APPROVE | APPROVE_WITH_COMMENTS | REQUEST_CHANGES | BLOCK}**

## Findings by Lens
- Reuse: {count} ({high-level})
- Quality: {count} ({high-level})
- Efficiency: {count} ({high-level})

## Triage Results
- Fix: {count} findings selected for fixing
- Defer: {count} findings deferred
- Dismiss: {count} findings dismissed
- Skipped (LOW/NIT): {count}

## Statistics
- Files reviewed: {count}
- Lines changed: +{added} -{removed}
- Findings: BLOCKER: {X}, HIGH: {X}, MED: {X}, LOW: {X}, NIT: {X}

## Next Steps
{If findings marked "Fix":}
Address these findings in `/wf-implement` or apply manually:
- {CS-ID}: {one-line description}

{If no findings to fix:}
Code is clean — proceed to next stage.
```

# WHEN TO USE

Run `/review:code-simplification` when:
- After any implementation (always included in `wf-review` dispatch)
- When code feels "first-draft" and could be tightened
- After fixing review findings (check if fixes introduced new complexity)
- When onboarding to unfamiliar code (find what patterns already exist)

This command is always dispatched by `wf-review` alongside `correctness` and `security`.
