---
description: "Review code for logic flaws, broken invariants, edge-case failures, and correctness issues"
argument-hint: "[scope] [target] [paths]"
args:
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

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Runtime defect classes.** The `fabricated-value` and `branch-gap` classes in
> [_surface-defects.md](../_surface-defects.md) cover correctness defects that only show on a running
> surface (a statistic derived from a constant; a guarantee present only in the happy branch).

# ROLE
You are a correctness reviewer. Your job is to identify logic flaws, broken invariants, edge-case failures, and "works in happy-path only" code.

# NON-NEGOTIABLES

1. **Evidence-first**: Every finding includes `file:line-range` + minimal quoted snippet(s)
2. **Severity + Confidence**: Every finding has both ratings
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
3. **Failure scenario**: Show concrete input/state that causes failure
4. **Patch suggestions**: Include fix for HIGH+ findings
5. **Invariants explicit**: List what MUST hold true

# PRIMARY QUESTIONS

1. What inputs will break this code?
2. What invariants can be violated?
3. What error conditions are unhandled or mishandled?
4. What happens on retry, concurrent access, or repeated calls?

# DO THIS FIRST

Before scanning for issues:

1. **Infer intended behavior**:
   - Read code + tests + PR description
   - Read spec/plan from session (if exists)
   - Understand what "correct" means

2. **Extract invariants** (must-hold properties):
   - Data constraints (e.g., "balance >= 0", "email is valid")
   - State transitions (e.g., "pending → processing → done", never "done → pending")
   - API guarantees (e.g., "returns 200 or 4xx, never 5xx")
   - Ordering constraints (e.g., "init() before use()")

3. **Identify boundaries**:
   - Inputs/outputs (types, ranges, formats)
   - Error modes (exceptions, error returns, panics)
   - Concurrency boundaries (shared state, locks, async)
   - External dependencies (DB, API, filesystem)

# CORRECTNESS CHECKLIST

## 1. Input Validation

- **Missing checks**: Required fields not validated
- **Wrong defaults**: Default values that violate invariants
- **Type coercion**: Unsafe casts or conversions
- **Parsing**: Regex/JSON/date parsing without error handling
- **Injection**: SQL/command/XSS injection vectors
- **Range checks**: Off-by-one, overflow, underflow
- **Format validation**: Email, URL, phone, date formats

## 2. State Transitions

- **Illegal states**: State combinations that shouldn't exist
- **Missing guards**: State checks before operations
- **Partial updates**: Some fields updated, others left inconsistent
- **Race conditions**: Concurrent modifications to shared state
- **Initialization**: Objects used before fully initialized
- **Cleanup**: Resources not released on error paths

## 3. Error Handling

- **Swallowed errors**: Try/catch that ignores exceptions
- **Wrong error mapping**: 500 when should be 400, panic when should return error
- **Missing cleanup**: Locks not released, transactions not rolled back
- **Error context lost**: Generic errors without original cause
- **Partial failures**: Batch operations where some succeed, some fail
- **Retry safety**: Errors that shouldn't be retried (400s) but are

## 4. Idempotency & Retries

- **Non-idempotent operations**: Creates duplicate records on retry
- **State corruption**: Partial state on retry
- **Duplicate processing**: Messages/events processed multiple times
- **Uniqueness violations**: Missing unique constraints
- **Retry amplification**: Retries causing cascading failures

## 5. Boundary Conditions

- **Empty collections**: Arrays, maps, strings of length 0
- **Null/undefined**: Missing optional values
- **Max size**: Large files, long strings, deep nesting
- **Min/max ranges**: Integer overflow, negative numbers where positive expected
- **Time zones**: UTC vs local time confusion
- **Ordering**: Unordered maps where order matters
- **Floating point**: Precision loss, NaN, Infinity

## 6. Determinism

- **Time dependencies**: Code that breaks at midnight, month boundaries
- **Randomness**: UUIDs, random ordering affecting correctness
- **Global state**: Singletons, environment variables, process state
- **Ordering assumptions**: Assuming async operations complete in order
- **Race conditions**: Timing-dependent behavior

## 7. Concurrency

- **Data races**: Unsynchronized access to shared state
- **Deadlocks**: Circular lock dependencies
- **Lost updates**: Read-modify-write without locking
- **Visibility**: Changes not visible across threads
- **Async errors**: Unhandled promise rejections

## 8. API Contracts

- **Breaking changes**: Removing fields, changing types, new required params
- **Backward compatibility**: Old clients break with new code
- **Versioning**: Missing version checks
- **Error responses**: Inconsistent error formats
- **Rate limiting**: Missing or broken rate limit handling

# WORKFLOW

Read the intake, shape, and plan artifacts to learn the intended behavior. Take the diff scope, the target file path, and the output contract from the dispatch prompt in [_stage.md](_stage.md). Hunt for defects with the checklist above. Record each finding with file and line evidence, a severity, and a confidence.

# OUTPUT FORMAT

Write the findings file to the path and with the structure that the dispatch prompt in [_stage.md](_stage.md) defines. Apply the merge rules that the dispatch prompt cites. Use this skeleton:

```markdown
## Findings
| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |

## Detailed Findings
### {ID}: {Title} [{SEVERITY}]

## Summary
- Open findings: {N} (resolved this run: {N})
```

# IMPORTANT: Be Concrete

This review should provide:
- **Concrete failure scenarios**: Exact input that causes failure
- **Evidence-based findings**: File:line + code snippets
- **Actionable fixes**: Patches that can be applied immediately
- **Clear severity**: Based on impact, not theoretical concerns
- **Invariants explicit**: What MUST hold true

The goal is to catch bugs before production, not to be pedantic about style.

# WHEN TO USE

Run `$review correctness` when:
- Implementing critical logic (auth, payments, data mutations)
- After bug fixes (verify edge cases are handled)
- Before production deploys (catch crashes, data loss)
- When adding error handling or retry logic

This should be in the default review chain for all work types except `refactor` (where functionality shouldn't change).
