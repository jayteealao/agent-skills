# Milestone-Based Workflow

This document explains how milestones work across the session workflow commands.

## Overview

When a feature is large enough to require slicing:

```
/start-session
  → /spec-crystallize (defines full scope)
    → /scope-triage (slices into MVP, M1, M2, M3)
      → /research-plan MILESTONE: mvp (plans MVP only)
        → /work (executes MVP)
          → /research-plan MILESTONE: m1 (plans M1 only)
            → /work MILESTONE: m1 (executes M1)
              → ... continue for M2, M3
```

## File Structure with Milestones

```
.claude/csv-bulk-import/
  ├── spec/
  │   └── spec-crystallize.md          # Full scope (all milestones)
  ├── plan/
  │   ├── scope-triage.md              # Defines MVP, M1, M2, M3 boundaries
  │   ├── research-plan-mvp.md         # How to build MVP
  │   ├── research-plan-m1.md          # How to build M1
  │   ├── research-plan-m2.md          # How to build M2
  │   └── research-plan-m3.md          # How to build M3 (if needed)
  ├── work/
  │   ├── work-mvp.md                  # MVP implementation checkpoints
  │   ├── work-m1.md                   # M1 implementation checkpoints
  │   ├── work-m2.md                   # M2 implementation checkpoints
  │   └── work-m3.md                   # M3 implementation checkpoints
  └── README.md                         # Session overview
```

## Command Behavior with Milestones

### `/scope-triage`
**Input:** Full scope (from spec or inputs)
**Output:** `plan/scope-triage.md` with:
- MVP definition (Option A/B/C)
- M1 definition
- M2 definition
- M3 definition (optional)

**Key sections:**
- Section 2: MVP Slice
- Section 3: Milestone 1
- Section 4: Milestone 2
- Section 5: Milestone 3

### `/research-plan MILESTONE: mvp`
**Reads:**
- `scope-triage.md` → Extracts MVP section (Section 2)
- `spec-crystallize.md` → Full spec for reference

**Focuses on:**
- Only features marked "in" for MVP
- Ignores features deferred to M1/M2/M3

**Outputs:**
- `plan/research-plan-mvp.md`

**Frontmatter includes:**
```yaml
milestone: mvp
related:
  triage: ../plan/scope-triage.md
  spec: ../spec/spec-crystallize.md
```

### `/work` (for MVP)
**Reads:**
- Auto-detects most recent plan: `research-plan-mvp.md`
- `scope-triage.md` → Validates MVP scope
- `spec-crystallize.md` → For acceptance criteria

**Outputs:**
- `work/work-mvp.md` with checkpoints

**Done when:**
- All MVP acceptance criteria met (from triage Section 2)

### `/research-plan MILESTONE: m1`
**Reads:**
- `scope-triage.md` → Extracts M1 section (Section 3)
- `research-plan-mvp.md` → What was already built
- `work-mvp.md` → What actually got implemented
- `spec-crystallize.md` → Full spec for reference

**Focuses on:**
- Only features marked for M1
- References MVP as foundation
- Plans incremental changes

**Outputs:**
- `plan/research-plan-m1.md`

**Frontmatter includes:**
```yaml
milestone: m1
related:
  triage: ../plan/scope-triage.md
  previous_plan: ./research-plan-mvp.md
  spec: ../spec/spec-crystallize.md
```

**Document includes:**
```markdown
## Built in Previous Milestones

**MVP (completed):**
- {Summary of MVP implementation}
- See: [research-plan-mvp.md](./research-plan-mvp.md)
```

### `/work MILESTONE: m1`
**Reads:**
- Auto-detects most recent plan: `research-plan-m1.md`
- `work-mvp.md` → What was built in MVP

**Outputs:**
- `work/work-m1.md` with checkpoints

**Done when:**
- All M1 acceptance criteria met

## Example: Complete Flow

### Step 1: Start and Spec
```bash
/start-session
EXPLANATION: Need CSV bulk import with preview, validation, duplicate detection, rollback, scheduled imports, and dashboard

# Creates session, infers it's a new_feature

/spec-crystallize
INPUTS: Full feature description with all capabilities

# Creates: spec/spec-crystallize.md (defines ALL features)
```

### Step 2: Triage into Milestones
```bash
/scope-triage
INPUTS: {can reference spec or provide description}

# Creates: plan/scope-triage.md
# Defines:
#   MVP: Upload, preview, basic validation, commit
#   M1: Duplicate detection, rollback
#   M2: Scheduled imports
#   M3: Admin dashboard
```

### Step 3: Plan MVP
```bash
/research-plan
MILESTONE: mvp  # Or omit - defaults to mvp if triage exists

# Reads:
#   - scope-triage.md Section 2 (MVP)
#   - spec-crystallize.md (for context)
# Focuses ONLY on MVP features
# Creates: plan/research-plan-mvp.md
```

### Step 4: Execute MVP
```bash
/work
CHECKPOINT: Start implementing CSV upload endpoint

# Reads:
#   - research-plan-mvp.md (auto-detected)
#   - scope-triage.md (validates MVP scope)
# Creates: work/work-mvp.md
# Works through MVP checkpoints...

/work
CHECKPOINT: Continue with preview functionality
# Appends to work/work-mvp.md

# ... continue until MVP done
```

### Step 5: Plan M1
```bash
/research-plan
MILESTONE: m1

# Reads:
#   - scope-triage.md Section 3 (M1)
#   - research-plan-mvp.md (what was built)
#   - work-mvp.md (what was actually implemented)
#   - spec-crystallize.md (for context)
# Focuses on M1 features (duplicate detection, rollback)
# Creates: plan/research-plan-m1.md
# Includes section: "Built in Previous Milestones"
```

### Step 6: Execute M1
```bash
/work
MILESTONE: m1  # Or omit - auto-detects research-plan-m1.md

# Reads:
#   - research-plan-m1.md (auto-detected)
#   - work-mvp.md (what exists from MVP)
# Creates: work/work-m1.md
# Includes section: "Previous Milestones Completed"
# Works through M1 checkpoints...
```

### Step 7: Continue for M2, M3
```bash
/research-plan MILESTONE: m2
/work MILESTONE: m2

/research-plan MILESTONE: m3
/work MILESTONE: m3
```

## Auto-Detection Rules

### `/research-plan` without MILESTONE
- If `scope-triage.md` exists: defaults to `mvp`
- If no triage exists: plans full scope

### `/work` without MILESTONE
- Auto-detects most recent plan in priority order:
  1. `research-plan-m3.md` (if exists)
  2. `research-plan-m2.md` (if exists)
  3. `research-plan-m1.md` (if exists)
  4. `research-plan-mvp.md` (if exists)
  5. `research-plan.md` (if exists)

## When NOT to Use Milestones

Skip `/scope-triage` and milestones for:
- Simple features (< 2 weeks complexity)
- Bug fixes
- Refactors
- Well-scoped work

In these cases:
```bash
/start-session
  → /spec-crystallize (optional)
    → /research-plan (no MILESTONE - plans full scope)
      → /work (no MILESTONE - executes full plan)
```

Files created:
- `plan/research-plan.md` (no milestone suffix)
- `work/work.md` (no milestone suffix)

## Key Principles

1. **Spec defines "what"** - Full scope, all features
2. **Triage defines "when"** - MVP vs M1 vs M2 vs M3
3. **Research-plan defines "how"** - Implementation approach per milestone
4. **Work executes** - Checkpoints per milestone

5. **One plan per milestone** - Separate files for each
6. **Plans reference previous** - M1 plan references MVP, M2 references M1, etc.
7. **Auto-detection** - Commands find the right plan/work log automatically

8. **Milestone independence** - Each milestone is a shippable increment
9. **Progressive refinement** - Later milestones can adjust based on learnings
