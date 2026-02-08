---
name: debug
description: Analyze errors, stack traces, and logs to identify root causes and recommend fixes
argument-hint: "[optional: error description or paste error logs]"
allowed-tools: Skill(error-analysis)
---

# Debug Command

Systematically analyze errors, stack traces, and logs to identify root causes and implement fixes.

## Usage

```bash
# Analyze inline error
/debug "TypeError: Cannot read property 'id' of undefined"

# Analyze with stack trace
/debug "
Error: Connection refused
  at Database.connect (src/db/connection.ts:23)
  at async initialize (src/server.ts:45)
"

# Analyze log file
/debug logs/application.log

# Interactive mode (will prompt for details)
/debug
```

## Progress Tracking

The todo files created in Phase 4 are the output - no separate tracking needed.

**5-phase workflow:**
1. Parse error information -> Extract error details
2. Categorize error -> Determine type/severity
3. Root cause analysis -> Use error-analysis skill
4. Fix recommendations -> Hotfix + long-term solutions
5. Create action items -> **Write todo files to `.claude/todos/`**

**Output: Todo files using file-todos skill format**

Each action item becomes a todo file:
- Immediate actions -> `{id}-ready-p1-{description}.md`
- Short-term actions -> `{id}-ready-p2-{description}.md`
- Long-term actions -> `{id}-pending-p3-{description}.md`

## Workflow

### Phase 1: Gather Error Information

**If arguments provided ($ARGUMENTS):**
- Parse error message, stack trace, logs from input
- Extract key details automatically

**If no arguments:**

Use AskUserQuestion to gather error context:

```yaml
questions:
  - question: "How frequently does this error occur?"
    header: "Frequency"
    multiSelect: false
    options:
      - label: "One-time occurrence"
        description: "Error happened once, cannot reproduce. May be transient issue."
      - label: "Intermittent (rare)"
        description: "Happens occasionally, hard to predict. Likely race condition or edge case."
      - label: "Recurring (daily)"
        description: "Happens regularly under specific conditions. Consistent pattern exists."
      - label: "Constant (blocking)"
        description: "Happens every time, blocking development. Critical issue."

  - question: "What environment is affected?"
    header: "Environment"
    multiSelect: true
    options:
      - label: "Production"
        description: "Affecting live users or deployed service"
      - label: "Staging"
        description: "Caught in pre-production"
      - label: "Development"
        description: "Only seen locally"
```

**Then prompt for additional details:**
- Error message
- Stack trace (if available)
- Error logs (paste or file path)
- When it occurred
- What user was doing
- Recent changes (deploy, config change, dependency update, etc.)

**Analysis depth based on frequency:**
- **One-time:** Quick analysis, suggest monitoring
- **Intermittent:** Deep RCA with hypothesis testing for race conditions
- **Recurring:** Pattern analysis, identify common factors
- **Constant:** Immediate hotfix priority, thorough RCA afterward

**Default:** If no answer provided, assume "Recurring (daily)"

### Phase 2: Analyze Error

Perform systematic error analysis using the error-analysis skill:

1. **Error Classification**
   - Type (runtime, compile, infrastructure, etc.)
   - Category (null reference, connection, timeout, etc.)
   - Severity (critical, high, medium, low)

2. **Root Cause Analysis**
   - Hypotheses (what could cause this)
   - Evidence for each hypothesis
   - Confirmed root cause
   - Timeline/sequence of events

3. **Codebase Investigation**
   - Read the files referenced in the stack trace
   - Check recent changes to those files
   - Look for related patterns in the codebase
   - Check `.claude/solutions/` for similar previously-solved issues

### Phase 3: Present Analysis Report

Format findings as a structured report:

```markdown
# Error Analysis Report

## Summary
[Brief description of error and impact]

**Error Type:** [Type]
**Severity:** Critical / High / Medium / Low
**Status:** Root cause identified

---

## Error Details

**Message:** [Error message]
**Location:** [file:line]
**Stack Trace:**
[Stack trace]

**Context:**
- Environment: [env]
- Frequency: [occurrences]

---

## Root Cause Analysis

### Hypotheses Evaluated
1. **[Hypothesis 1]**
   - Evidence: [Evidence]
   - Result: [Confirmed/Rejected]

### Confirmed Root Cause
[Detailed explanation of root cause]

---

## Fix Recommendations

### Immediate Fix (Hotfix)

**File:** `[file_path:line]`

```[language]
// Before
[old code]

// After
[new code]
```

### Long-term Fixes

1. **[Fix 1 Title]**
   - Description: [Description]
   - Effort: Small/Medium/Large
   - Priority: High/Medium/Low
```

### Phase 4: Auto-Create Todos for Fixes

After presenting the analysis report, automatically create todo files in `.claude/todos/` for all action items:

For each action item:
- **Immediate actions** -> Create as `{id}-ready-p1-{description}.md` (Priority 1, ready to work)
- **Short-term actions** -> Create as `{id}-ready-p2-{description}.md` (Priority 2)
- **Long-term actions** -> Create as `{id}-pending-p3-{description}.md` (Priority 3, needs planning)

**Todo file format:** (use file-todos skill patterns)

```yaml
---
status: ready     # or pending for long-term items
priority: p1      # p1 (immediate), p2 (short-term), p3 (long-term)
issue_id: "042"
tags: [bug-fix, error-handling]
dependencies: []
---

# [Action Item Title]

## Problem Statement
[From error analysis - the root cause]

## Proposed Solution
[From fix recommendations]

## Technical Details
- **Affected Files**: [Files from analysis]
- **Effort**: [Small/Medium/Large]
- **Risk**: [Low/Medium/High]

## Acceptance Criteria
- [ ] Fix implemented as specified
- [ ] Tests added to prevent regression
- [ ] Verified in development environment
- [ ] No regressions introduced

## Work Log

### [Date] - Created from Debug Session
**Source:** `/debug` command analysis
**Root Cause:** [Brief root cause]
**Priority Rationale:** [Why this priority]
```

**Determine next issue ID:**
```bash
# Find highest issue ID in .claude/todos/
ls .claude/todos/ 2>/dev/null | grep -E '^[0-9]+' | sed 's/-.*$//' | sort -n | tail -1

# Increment by 1 for each new todo
```

### Phase 5: Summary

Present final summary:

```markdown
## Debug Session Complete

**Error:** [Brief error description]
**Root Cause:** [Root cause in one sentence]
**Fix Status:** Recommendations provided and todos created

---

### Todos Created

**Total:** [X] todos created in `.claude/todos/`

**By Priority:**
- P1 (Immediate): [count] todos
- P2 (Short-term): [count] todos
- P3 (Long-term): [count] todos

### Next Steps

1. Apply hotfix: [file:line]
2. Run `/triage` to review and prioritize todos
3. Run `/workflows:work` to execute on ready todos
4. Use `/workflows:compound` to document the solution after fixing
```

## Integration

This command integrates with:

### Skills
- **error-analysis** - Error patterns and RCA techniques (bound via `allowed-tools`)
- **file-todos** - Todo file format and patterns (referenced for todo creation)

### Commands
- **/triage** - Triage action items if prioritization needs adjustment
- **/workflows:work** - Execute on ready todos
- **/workflows:compound** - Document the solution after fixing

## Related Commands

- `/triage` - Triage findings and create todos
- `/workflows:compound` - Document the fix after resolving
