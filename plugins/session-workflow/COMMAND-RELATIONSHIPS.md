# Command Relationships & Flow

This document clarifies how session workflow commands build on each other.

## Artifact Hierarchy

```
Session Context (README.md)
    ↓
    ├─> Spec (spec/spec-crystallize.md) ──┐
    │   "WHAT we're building"             │
    │                                      ↓
    └─> Plan (plan/research-plan.md) ─────┤
        "HOW we're building it"            │
        (reads spec if exists)             │
                                           ↓
        Work Log (work/work.md)
        "Implementation checkpoints"
        (reads BOTH spec and plan)
```

## Command Relationships

### `/start-session`
- **Creates**: Session structure and README
- **Reads**: Nothing (bootstraps)
- **Next command**: `/spec-crystallize` (for features) or `/repro-harness` (for bugs)

### `/spec-crystallize`
- **Creates**: `spec/spec-crystallize.md`
- **Reads**:
  - Session README (for context)
  - Codebase (for patterns)
- **Awareness**: Session-only
- **Output**: Specification defining WHAT to build
- **Next command**: `/research-plan`

### `/research-plan`
- **Creates**: `plan/research-plan.md`
- **Reads**:
  - Session README (for context)
  - **Spec** (if exists) - uses as authoritative source for requirements
  - Repro harness (if exists, for bugs)
  - Codebase (extensive research)
- **Awareness**: Session + Spec
- **Output**: Implementation plan defining HOW to build
- **Relationship**: PICKS UP FROM spec-crystallize
  - For NEW_FEATURE: Spec is authoritative source
  - Plan implements what spec defines (doesn't redefine it)
- **Next command**: `/work`

### `/work`
- **Creates**: `work/work.md` (checkpoint log)
- **Reads**:
  - Session README (for context)
  - **Spec** (if exists) - for acceptance criteria, edge cases, contracts
  - **Plan** (if exists) - for implementation steps
  - Existing work log (if continuing)
- **Awareness**: Session + Spec + Plan
- **Output**: Implementation checkpoints with verification
- **Relationship**: PICKS UP FROM BOTH spec and plan
  - **Spec is "what"** - acceptance criteria, requirements, contracts
  - **Plan is "how"** - implementation steps, approach, testing strategy
  - **Work needs both** to execute correctly
- **Priority for done definition**:
  1. Acceptance criteria from spec (most detailed)
  2. Success criteria from session README
  3. Done definition from plan

## Key Principles

### 1. Spec is Optional but Recommended
- Not all work types need a spec (e.g., simple bug fixes, refactors)
- For NEW_FEATURE and GREENFIELD_APP, spec is highly recommended
- Commands gracefully handle missing spec

### 2. Spec → Plan → Work (Linear Flow)
```
/spec-crystallize → /research-plan → /work
      ↓                   ↓              ↓
  defines WHAT       defines HOW     executes
```

### 3. Each Command Reads Predecessors
- Plan reads spec (if exists)
- Work reads spec (if exists) AND plan (if exists)
- Work prioritizes spec for acceptance criteria

### 4. Spec and Plan are Complementary
- **Spec**: Product-focused, "what" we're building
  - Requirements (functional, non-functional)
  - API/UI contracts
  - Edge cases and error handling
  - Acceptance criteria (Given/When/Then)
- **Plan**: Engineering-focused, "how" we're building
  - Design options and trade-offs
  - Step-by-step implementation
  - Test strategy
  - Observability and rollout

## Example Flow: New Feature (Small Scope)

```bash
# Step 1: Start session
/start-session
EXPLANATION: Need CSV bulk import with preview and duplicate detection

# Creates: .claude/csv-bulk-import/README.md
# Session slug: csv-bulk-import
# Work type: new_feature

# Step 2: Crystallize spec (defines WHAT)
/spec-crystallize
INPUTS: Users upload CSV, preview data, commit to database with duplicate detection

# Creates: .claude/csv-bulk-import/spec/spec-crystallize.md
# Contains: Requirements, contracts, edge cases, acceptance criteria

# Step 3: Research and plan (defines HOW)
/research-plan
INPUTS: Implement the CSV bulk import feature from the spec

# Reads: spec-crystallize.md (authoritative source)
# Creates: .claude/csv-bulk-import/plan/research-plan.md
# Contains: Design options, step-by-step plan, testing strategy

# Step 4: Execute (does WORK)
/work
CHECKPOINT: Start implementing CSV upload endpoint

# Reads: BOTH spec-crystallize.md AND research-plan.md
# - Spec for: acceptance criteria, edge cases, contracts
# - Plan for: implementation steps, approach
# Creates: .claude/csv-bulk-import/work/work.md
# Contains: Implementation checkpoints with verification
```

## Example Flow: New Feature (Large Scope with Milestones)

```bash
# Step 1: Start session
/start-session
EXPLANATION: CSV bulk import with preview, validation, duplicate detection, rollback, scheduled imports, and dashboard

# Step 2: Spec full scope
/spec-crystallize
INPUTS: {Full feature description with all capabilities}

# Creates: .claude/csv-bulk-import/spec/spec-crystallize.md
# Contains: ALL features (full scope)

# Step 3: Triage into milestones
/scope-triage
INPUTS: {Reference spec or provide description}

# Reads: spec-crystallize.md
# Creates: .claude/csv-bulk-import/plan/scope-triage.md
# Defines: MVP (upload, preview, commit)
#          M1 (duplicate detection, rollback)
#          M2 (scheduled imports)
#          M3 (admin dashboard)

# Step 4: Plan MVP
/research-plan
MILESTONE: mvp  # Or omit - defaults to mvp

# Reads: scope-triage.md Section 2 (MVP only)
# Creates: .claude/csv-bulk-import/plan/research-plan-mvp.md
# Plans: Only MVP features

# Step 5: Execute MVP
/work
CHECKPOINT: Start implementing MVP

# Reads: research-plan-mvp.md (auto-detected)
# Creates: .claude/csv-bulk-import/work/work-mvp.md
# Executes: MVP checkpoints

# Step 6: Plan M1 (after MVP done)
/research-plan
MILESTONE: m1

# Reads: scope-triage.md Section 3 (M1)
#        research-plan-mvp.md (what was built)
# Creates: .claude/csv-bulk-import/plan/research-plan-m1.md
# Plans: M1 features building on MVP

# Step 7: Execute M1
/work
MILESTONE: m1  # Or omit - auto-detects research-plan-m1.md

# Reads: research-plan-m1.md
# Creates: .claude/csv-bulk-import/work/work-m1.md
# Executes: M1 checkpoints

# Continue for M2, M3...
```

## Example Flow: Bug Fix

```bash
# Step 1: Start session
/start-session
EXPLANATION: Checkout returns 500 error on discount code application

# Creates: .claude/checkout-500-discount/README.md
# Session slug: checkout-500-discount
# Work type: error_report

# Step 2: Create reproduction (optional but recommended)
/repro-harness
BUG_REPORT: 500 error when applying discount codes in checkout

# Creates: .claude/checkout-500-discount/incidents/repro-harness.md
# Contains: Reproduction steps, failing test

# Step 3: Research and plan
/research-plan
INPUTS: Fix the 500 error on discount code application

# Reads: repro-harness.md (if exists)
# NO SPEC (not needed for bug fix)
# Creates: .claude/checkout-500-discount/plan/research-plan.md
# Contains: Root cause analysis, fix strategy

# Step 4: Execute
/work
CHECKPOINT: Fix discount code validation logic

# Reads: research-plan.md (no spec exists for bug fix)
# Creates: .claude/checkout-500-discount/work/work.md
# Contains: Fix implementation checkpoints
```

## Summary: What Each Command Knows

| Command | Reads Session | Reads Spec | Reads Plan | Reads Work Log |
|---------|---------------|------------|------------|----------------|
| `/start-session` | Creates it | - | - | - |
| `/spec-crystallize` | ✅ | - | - | - |
| `/research-plan` | ✅ | ✅ (if exists) | - | - |
| `/work` | ✅ | ✅ (if exists) | ✅ (if exists) | ✅ (if exists) |

## Important Notes

1. **All commands infer SESSION_SLUG** from last entry in `.claude/README.md` if not provided

2. **Spec and plan are complementary, not redundant**:
   - Spec: Product requirements and contracts
   - Plan: Engineering approach and steps

3. **Work needs both spec and plan** (if they exist):
   - Spec for acceptance criteria and requirements
   - Plan for implementation approach

4. **Commands are optional based on work type**:
   - NEW_FEATURE: spec → plan → work
   - ERROR_REPORT: (repro) → plan → work
   - REFACTOR: plan → work
   - GREENFIELD_APP: spec → plan → work

5. **Each command updates session README** to track progress
