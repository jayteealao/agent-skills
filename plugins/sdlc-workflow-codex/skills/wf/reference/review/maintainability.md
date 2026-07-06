---
description: "Review code for long-term readability, ease of change, and reduced change amplification"
argument-hint: "[scope] [target] [paths]"
args:
  SESSION_SLUG:
    description: The session identifier. If not provided, uses the most recent session from .ai/workflows/
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

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.ai/dep-updates/...`), stage names or numbers, skill names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

# ROLE
You are a maintainability reviewer. Your job is to improve long-term readability and ease of change while avoiding unnecessary refactors.

# NON-NEGOTIABLES

1. **Evidence-first**: Every finding includes `file:line-range` + minimal quoted snippet(s)
2. **Severity + Confidence**: Every finding has both ratings
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
3. **Change scenario**: Show what kind of change becomes difficult
4. **Refactor suggestions**: Smallest improvement first, then larger options
5. **Cost/benefit**: Only suggest refactors that reduce future friction

# PRIMARY QUESTIONS

1. How easy is it to understand what this code does?
2. How easy is it to change this code without breaking other parts?
3. How easy is it to add new features without touching many files?
4. Are conventions consistent enough that patterns are predictable?

# MAINTAINABILITY CHECKLIST

## 1. Cohesion
- **Single Responsibility**: Does each file/module/class do one clear job?
- **Mixed concerns**: Business logic mixed with I/O, UI, or infrastructure?
- **God objects**: Classes that do too many things
- **Utility dumping grounds**: Files that collect unrelated helpers

## 2. Coupling
- **Dependency direction**: Are dependencies minimal and directional (no cross-layer leaks)?
- **Circular dependencies**: Modules that depend on each other
- **Cross-layer leaks**: UI depending on DB, business logic depending on HTTP
- **Hidden coupling**: Global state, event buses, implicit ordering
- **Interface segregation**: Large interfaces forcing dependencies on unused methods

## 3. Complexity
- **Deep nesting**: > 3 levels of if/for/while
- **Long functions**: > 50 lines (rule of thumb)
- **Boolean soup**: Multiple boolean flags controlling behavior
- **Unclear control flow**: Early returns mixed with nested conditions
- **Cyclomatic complexity**: Too many code paths

## 4. Naming
- **Intent-revealing**: Names explain "what" and "why", not just "how"
- **Ambiguous terms**: "data", "info", "manager", "handler", "utils"
- **Misleading names**: Name suggests X but does Y
- **Inconsistent terms**: "user" vs "account" vs "profile" for same concept
- **Magic numbers**: Unnamed constants

## 5. Duplication
- **Logic duplication**: Same algorithm repeated with minor variations
- **Structural duplication**: Similar patterns that should be abstracted
- **Acceptable duplication**: Better than wrong abstraction (case-by-case)
- **Configuration duplication**: Same values scattered across files

## 6. Encapsulation
- **Invariant enforcement**: Are invariants checked in one place or scattered?
- **Leaky abstractions**: Implementation details exposed
- **Data classes**: Objects with getters/setters but no behavior
- **Tell, don't ask**: Code that queries object state then acts on it

## 7. Comments
- **Explain "why"**: Context, trade-offs, non-obvious decisions
- **Not "what"**: Code already shows what it does
- **Stale comments**: Comments that contradict code
- **Missing high-level docs**: No module-level explanation

## 8. Change Amplification
- **Shotgun surgery**: Small feature requires edits in many files
- **Fragile base class**: Changes to base break many subclasses
- **Rigid hierarchy**: Adding variant requires new abstraction layer
- **Configuration sprawl**: Feature flags scattered across codebase

## 9. API Ergonomics (Internal)
- **Ceremonial call sites**: Too much boilerplate to use
- **Misleading APIs**: Easy to use wrong, hard to use right
- **Inconsistent patterns**: Similar operations done differently
- **Poor defaults**: Common case requires configuration

# REFACTOR PHILOSOPHY

**When to refactor:**
- High friction: Change amplification proven by recent changes
- Low risk: Refactor has clear benefit and low breakage risk
- Clear improvement: Before/after is objectively better

**When NOT to refactor:**
- Working code: If it's not causing problems, leave it
- Speculative: "Might need to change later"
- Style preference: Just different, not better
- During feature work: Refactor separately or not at all

**Smallest refactor first:**
1. Rename variables/functions (clarify intent)
2. Extract functions (reduce complexity)
3. Move code (improve cohesion)
4. Extract classes (separate concerns)
5. Refactor abstractions (last resort)

# WORKFLOW

## Step 0: Infer SESSION_SLUG if not provided

Infer the session slug from the most recent session entry in `.ai/workflows/`.

## Step 1: Load session context

1. Validate `.ai/workflows/<SESSION_SLUG>/` exists
2. Read `.ai/workflows/<SESSION_SLUG>/README.md` for context
3. Check for spec to understand requirements
4. Check for plan to understand design decisions
5. Check for work log to see what changed recently

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

3. **PATHS** (if not provided)
   - Review all files in scope
   - Can be narrowed with globs

4. **CONTEXT** (if not provided)
   - Extract from plan (design decisions, conventions)
   - Extract from work log (refactor intent)
   - Extract from codebase (existing patterns)

## Step 3: Gather changed files and code

Based on SCOPE:
- For `pr`: Get diff from PR
- For `worktree`: Get git diff HEAD
- For `diff`: Get git diff for range
- For `file`: Read specific file(s)
- For `repo`: Scan recent changes

Use shell + git commands and your native file-editing tools to get:
- List of changed files
- Diffs with line numbers
- Full file contents where needed
- Related files (imports, callers)

## Step 4: Analyze module structure

For each changed file:

1. **Purpose**: What does this module do?
   - Read file/class/function names
   - Read comments/docstrings
   - Identify main responsibility

2. **Cohesion**: Does it do one thing?
   - Count distinct responsibilities
   - Identify mixed concerns (I/O + logic, UI + business)
   - Look for "and" in names (e.g., "ParseAndValidate")

3. **Size**: Is it too large?
   - Count lines of code (excluding tests)
   - Count number of functions/classes
   - Identify "god objects"

4. **Dependencies**: What does it import?
   - List imports
   - Identify cross-layer dependencies
   - Check for circular dependencies

## Step 5: Analyze coupling

1. **Dependency graph**:
   - For each module, list dependencies
   - Identify dependency direction (UI → Business → Data)
   - Flag reverse dependencies (Data → Business, Business → UI)

2. **Circular dependencies**:
   - Look for A imports B, B imports A
   - Flag modules that depend on each other

3. **Cross-layer leaks**:
   - UI importing DB models
   - Business logic importing HTTP request types
   - Data layer importing UI components

4. **Hidden coupling**:
   - Global state (singletons, globals)
   - Event buses (implicit ordering)
   - File system state (temp files, locks)

## Step 6: Analyze complexity

For each function/method:

1. **Length**: Count lines (excluding blanks/comments)
   - Flag functions > 50 lines
   - Flag functions > 100 lines as HIGH

2. **Nesting depth**: Count max nesting level
   - Flag depth > 3
   - Flag depth > 5 as HIGH

3. **Cyclomatic complexity**: Count decision points
   - Count if/else, switch/case, &&, ||, try/catch
   - Flag complexity > 10
   - Flag complexity > 20 as HIGH

4. **Control flow**:
   - Early returns mixed with nested conditions?
   - Multiple return points (> 5)?
   - Boolean flags controlling behavior?

## Step 7: Analyze naming

For each identifier (file, class, function, variable):

1. **Intent-revealing**: Does name explain purpose?
   - "process()" vs "validateAndFormatCsvRows()"
   - "data" vs "parsedUserRecords"
   - "flag" vs "shouldSendWelcomeEmail"

2. **Ambiguous terms**:
   - "manager", "handler", "processor", "utils"
   - "data", "info", "obj", "result"
   - "do", "handle", "process"

3. **Misleading names**:
   - "get" that modifies state
   - "validate" that also transforms
   - "process" that does multiple things

4. **Consistency**:
   - Same concept with different names?
   - Same name for different concepts?

## Step 8: Analyze duplication

1. **Exact duplication**:
   - Copy-pasted functions with minor changes
   - Duplicated validation logic
   - Repeated error handling patterns

2. **Structural duplication**:
   - Similar patterns (map → filter → reduce)
   - Similar APIs (create/update/delete endpoints)
   - Similar test structures

3. **Assess if abstraction helps**:
   - Will these evolve together or separately?
   - Does abstraction clarify or obscure?
   - Is duplication cost > abstraction cost?

## Step 9: Analyze encapsulation

1. **Invariant enforcement**:
   - Are invariants checked at boundaries?
   - Or scattered across codebase?

2. **Data classes**:
   - Objects with only getters/setters?
   - Behavior in separate "service" classes?
   - Could behavior move to object?

3. **Tell, don't ask**:
   - Code that queries object state then acts?
   - Could object make decision itself?

## Step 10: Analyze comments

1. **Useful comments**:
   - Explain "why" (trade-offs, constraints, non-obvious decisions)
   - Link to issues/tickets
   - Warn about gotchas

2. **Redundant comments**:
   - Restate code (// increment counter)
   - Obvious statements (// constructor)

3. **Stale comments**:
   - Comments that contradict code
   - TODOs from years ago

## Step 11: Assess change amplification

1. **Recent changes**:
   - Look at git history
   - Find features that touched many files
   - Identify patterns (every feature needs A, B, C, D)

2. **Hypothetical changes**:
   - "Add new upload type" - how many files?
   - "Change validation logic" - where does it ripple?
   - "Add new field to user" - how many updates?

3. **Quantify**:
   - Count files that would need changes
   - Assess if coupling is necessary or accidental

## Step 12: Generate review report

Create `.ai/workflows/<SESSION_SLUG>/reviews/review-maintainability-{YYYY-MM-DD}.md`

## Step 13: Update session README

Standard artifact tracking update.

## Step 14: Output summary

Print summary with merge recommendation and key improvements.

# OUTPUT FORMAT

Create `.ai/workflows/<SESSION_SLUG>/reviews/review-maintainability-{YYYY-MM-DD}.md`:

```markdown
---
skill: $review maintainability
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

# Maintainability Review Report

**Reviewed:** {SCOPE} / {TARGET}
**Date:** {YYYY-MM-DD}
**Reviewer:** Codex

---

## 0) Scope, Intent, and Conventions

**What was reviewed:**
- Scope: {SCOPE}
- Target: {TARGET}
- Files: {count} files, {+lines} added, {-lines} removed
{If PATHS provided:}
- Focus: {PATHS}

**Intent:**
{From CONTEXT, spec, or plan}
- {What this code is meant to do}
- {Design goals}
- {Refactor intent if any}

**Team conventions:**
{From CONTEXT or inferred from codebase}
- {Naming convention 1}
- {File organization pattern 1}
- {Architecture pattern 1}

**Review focus:**
- Cohesion: Does each module have a clear purpose?
- Coupling: Are dependencies minimal and directional?
- Complexity: Are functions/classes easy to understand?
- Naming: Are names intent-revealing?
- Change amplification: How easy is it to add features?

---

## 1) Executive Summary

**Merge Recommendation:** {APPROVE | APPROVE_WITH_COMMENTS | REQUEST_CHANGES | BLOCK}

**Rationale:**
{2-3 sentences explaining recommendation}

**Top Maintainability Issues:**
1. **{Finding ID}**: {Issue} - {Impact on future changes}
2. **{Finding ID}**: {Issue} - {Impact on future changes}
3. **{Finding ID}**: {Issue} - {Impact on future changes}

**Overall Assessment:**
- Cohesion: {Excellent | Good | Mixed | Poor}
- Coupling: {Minimal | Acceptable | High | Tangled}
- Complexity: {Simple | Manageable | Complex | Overwhelming}
- Consistency: {Excellent | Good | Inconsistent | Chaotic}
- Change Amplification: {Low | Moderate | High | Severe}

---

## 2) Module Structure Analysis

Overview of changed modules and their responsibilities:

| Module | Lines | Responsibilities | Cohesion | Dependencies | Verdict |
|--------|-------|------------------|----------|--------------|---------|
| `upload/handler.ts` | 250 | Parse, validate, store, email | ❌ Mixed | 8 | Split concerns |
| `lib/parser.ts` | 120 | CSV parsing | ✅ Focused | 2 | Good |
| `api/routes.ts` | 180 | Route definitions | ✅ Focused | 5 | Good |
| `utils/helpers.ts` | 300 | 15 unrelated utils | ⚠️ Dumping ground | 12 | Organize |

**Observations:**
- {X} files have clear single responsibility
- {Y} files have mixed concerns (should split)
- {Z} files are utility dumping grounds (should organize)

---

## 3) Coupling Analysis

### Dependency Graph

```
┌─────────────┐
│     UI      │ (api/routes.ts)
└─────┬───────┘
      │
      ▼
┌─────────────┐
│  Business   │ (services/upload.ts)
└─────┬───────┘
      │
      ▼
┌─────────────┐
│    Data     │ (db/users.ts)
└─────────────┘
```

**Cross-layer violations found:**
- ❌ `db/users.ts` imports `http.Request` (Data → UI)
- ❌ `api/routes.ts` imports `db.Connection` (UI → Data, skips Business)

### Circular Dependencies

| Module A | Module B | Issue |
|----------|----------|-------|
| `user.ts` | `auth.ts` | A imports B, B imports A |

**Recommendations:**
- Extract shared types to separate file
- Introduce interface to break cycle

---

## 4) Findings Table

| ID | Severity | Confidence | Category | File:Line | Issue |
|----|----------|------------|----------|-----------|-------|
| MA-1 | HIGH | High | Cohesion | `handler.ts:50-200` | Mixed concerns: business + I/O |
| MA-2 | MED | High | Complexity | `process.ts:100-180` | Function too long (80 lines) |
| MA-3 | MED | Med | Naming | `utils.ts:30` | Ambiguous name "processData" |
| MA-4 | LOW | High | Duplication | `routes.ts:*` | Repeated error handling |

**Findings Summary:**
- BLOCKER: {count}
- HIGH: {count}
- MED: {count}
- LOW: {count}
- NIT: {count}

---

## 5) Findings (Detailed)

### MA-1: Mixed Concerns - Business Logic + I/O in One Function [HIGH]

**Location:** `src/upload/handler.ts:50-200`

**Evidence:**
```typescript
// Lines 50-200 (150 lines!)
async function handleUpload(req: Request, res: Response) {
  // Parsing (I/O)
  const file = req.file;
  const content = await file.text();

  // Validation (Business logic)
  if (!content) throw new Error('Empty file');
  const rows = parseCsv(content);

  // More validation (Business logic)
  for (const row of rows) {
    if (!isValidEmail(row.email)) throw new Error('Invalid email');
  }

  // Database operations (I/O)
  const users = await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.users.insert(row);
    }
  });

  // Email sending (I/O)
  for (const user of users) {
    await sendWelcomeEmail(user.email);
  }

  // HTTP response (I/O)
  res.json({ success: true, count: users.length });
}
```

**Issue:**
Function mixes four distinct concerns:
1. HTTP handling (request/response)
2. File parsing (CSV → objects)
3. Business logic (validation, transaction)
4. External I/O (email sending)

This violates Single Responsibility Principle.

**Impact:**
- **Change amplification**: Changing validation requires touching HTTP handler
- **Testing difficulty**: Can't test business logic without HTTP mocks
- **Reusability**: Can't reuse validation in batch jobs or CLI
- **Complexity**: 150-line function is hard to understand

**Severity:** HIGH
**Confidence:** High
**Category:** Cohesion (Mixed Concerns)

**Change scenario:**
```
Q: How would you add a "bulk import from S3" feature?
A: Would need to duplicate all business logic because it's
   tightly coupled to HTTP request/response.
```

**Smallest Fix:**
Extract business logic to separate function:

```diff
--- a/src/upload/handler.ts
+++ b/src/upload/handler.ts
@@ -48,50 +48,15 @@

 async function handleUpload(req: Request, res: Response) {
-  const file = req.file;
-  const content = await file.text();
-
-  if (!content) throw new Error('Empty file');
-  const rows = parseCsv(content);
-
-  for (const row of rows) {
-    if (!isValidEmail(row.email)) throw new Error('Invalid email');
-  }
-
-  const users = await db.transaction(async (tx) => {
-    for (const row of rows) {
-      await tx.users.insert(row);
-    }
-  });
-
-  for (const user of users) {
-    await sendWelcomeEmail(user.email);
-  }
+  const content = await req.file.text();
+  const users = await processUpload(content);

   res.json({ success: true, count: users.length });
 }
+
+// New: Pure business logic, no HTTP dependencies
+async function processUpload(csvContent: string): Promise<User[]> {
+  if (!csvContent) throw new ValidationError('Empty file');
+
+  const rows = parseCsv(csvContent);
+
+  for (const row of rows) {
+    if (!isValidEmail(row.email)) {
+      throw new ValidationError(`Invalid email: ${row.email}`);
+    }
+  }
+
+  const users = await db.transaction(async (tx) => {
+    for (const row of rows) {
+      await tx.users.insert(row);
+    }
+  });
+
+  for (const user of users) {
+    await sendWelcomeEmail(user.email);
+  }
+
+  return users;
+}
```

**Benefit:**
- Business logic now reusable (CLI, S3, API)
- Testable without HTTP mocks
- Each layer can change independently
- Clear separation of concerns

---

{Continue with MA-2 through MA-4 following same pattern}

---

## 6) Change Amplification Analysis

Analysis of how changes ripple through the codebase:

### Scenario 1: Add New Upload Type (e.g., JSON import)

**Files that would need changes:**
1. `api/routes.ts` - New route definition
2. `services/upload.ts` - New upload handler (due to MA-1 coupling)
3. `lib/parser.ts` - New parser (good - expected)
4. `db/migrations/*.sql` - Schema changes (good - expected)
5. `utils/validation.ts` - New validation (could be shared)

**Assessment:**
- ⚠️ Moderate amplification due to MA-1 (coupled HTTP + business logic)
- If MA-1 is fixed: Only files 1, 3, 4 need changes (expected)

---

## 7) Positive Observations

Things done well (for balance):

✅ **Good module organization:** Core modules have clear responsibilities
✅ **Consistent naming:** Routes follow RESTful conventions
✅ **Good type safety:** Most functions have explicit types

---

## 8) Recommendations

### Must Fix (HIGH findings)

1. **MA-1**: Split HTTP handler from business logic
   - Action: Extract `processUpload()` function
   - Rationale: Enables reusability, testability, reduces change amplification
   - Estimated effort: 20 minutes

### Should Fix (MED findings)

2. **MA-2**: Extract long function into smaller functions
   - Action: Extract validate/normalize/save/log functions
   - Rationale: Improves readability, testability
   - Estimated effort: 15 minutes

3. **MA-3**: Rename ambiguous function
   - Action: Rename to `validateAndSaveUserRecords`
   - Rationale: Clarifies intent, reveals side effects
   - Estimated effort: 5 minutes

### Consider (LOW/NIT findings)

4. **MA-4**: Extract error handling middleware
   - Action: Create `asyncHandler` wrapper or use Express middleware
   - Rationale: Centralize error handling, reduce duplication
   - Estimated effort: 10 minutes

---

## 9) False Positives & Disagreements Welcome

**Where I might be wrong:**

1. **MA-1 (Mixed concerns)**: If this is a one-off endpoint with no reusability need, separation might be overkill
2. **MA-2 (Long function)**: If the 4 sections are tightly coupled and always change together, extraction might not help
3. **MA-4 (Duplication)**: Current duplication is manageable; abstraction might introduce indirection without much benefit

I'm optimizing for long-term maintainability. If short-term ship is more important, that's a valid trade-off!

---

*Review completed: {YYYY-MM-DD}*
*Session: [{SESSION_SLUG}](../README.md)*
```

# SUMMARY OUTPUT

After creating review, print:

```markdown
# Maintainability Review Complete

## Review Location
Saved to: `.ai/workflows/{SESSION_SLUG}/reviews/review-maintainability-{YYYY-MM-DD}.md`

## Merge Recommendation
**{APPROVE | APPROVE_WITH_COMMENTS | REQUEST_CHANGES | BLOCK}**

## Key Issues
1. **{Finding ID}**: {Issue} - Impact: {Change scenario}
2. **{Finding ID}**: {Issue} - Impact: {Change scenario}
3. **{Finding ID}**: {Issue} - Impact: {Change scenario}

## Statistics
- Files reviewed: {count}
- Lines changed: +{added} -{removed}
- Findings: BLOCKER: {X}, HIGH: {X}, MED: {X}, LOW: {X}, NIT: {X}
- Cohesion: {X} focused modules, {Y} mixed concerns
- Coupling: {X} cross-layer violations, {Y} circular dependencies

## Change Amplification
- Low: {count} scenarios
- Moderate: {count} scenarios
- High: {count} scenarios

## Refactor Cost/Benefit
Total effort for HIGH+MED fixes: {X} minutes
Total benefit: {description}

## Quick Actions
{If HIGH+ findings exist:}
Apply refactors from findings: MA-1, MA-2, MA-3
Estimated time: {X} minutes
Key benefit: {primary benefit}

{If no HIGH findings:}
Minor improvements suggested, not blocking merge.

## Next Steps
{If REQUEST_CHANGES:}
1. Fix HIGH severity findings (change amplification, mixed concerns)
2. Consider MED findings if time allows
3. Re-review after refactors

{If APPROVE_WITH_COMMENTS:}
1. Consider addressing MED findings in follow-up
2. LOW/NIT findings optional
3. OK to merge as-is
```

# IMPORTANT: Pragmatic, Not Dogmatic

This review should be:
- **Pragmatic** about refactoring (only when clear benefit)
- **Evidence-based** about change amplification (show actual scenarios)
- **Balanced** about duplication (sometimes better than wrong abstraction)
- **Cost-aware** about refactors (estimate effort vs benefit)
- **Humble** about conventions (team may have good reasons)

The goal is to ship maintainable code, not to achieve perfect architecture.

# WHEN TO USE

Run `$review maintainability` when:
- Before merging features (catch mixed concerns early)
- After refactors (verify improvement)
- When code reviews mention "hard to follow"
- Before adding similar features (identify change patterns)

This should be in the default review chain for `new_feature` and `refactor` work types.
