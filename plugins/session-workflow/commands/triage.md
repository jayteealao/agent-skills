---
name: triage
description: Triage and categorize pending findings in the file-based todo system
argument-hint: "[optional: source type like 'review' or 'debug']"
allowed-tools: Skill(file-todos)
---

Read all pending todos in the .claude/todos/ directory.

Present all findings one by one for triage. The goal is to go through each item and decide whether to approve it, skip it, or modify it.

**IMPORTANT: DO NOT CODE ANYTHING DURING TRIAGE!**

This command is for:

- Triaging code review findings
- Processing debug session results
- Reviewing performance analysis
- Handling any categorized findings that need tracking

## Progress Tracking

The todo files themselves track progress - no separate tracking needed.

**Triage flow:**
- Present each finding from `.claude/todos/*-pending-*.md`
- User decides: yes (approve) / next (skip) / custom (modify)
- Approved: Rename file `pending` -> `ready`, update YAML frontmatter `status: ready`
- Skipped: Delete the todo file
- Custom: Update file, then approve or skip

**Progress is visible in the filesystem:**
```bash
# See all pending findings
ls .claude/todos/*-pending-*.md

# See approved findings (ready to work on)
ls .claude/todos/*-ready-*.md

# Track progress: count files
echo "Pending: $(ls .claude/todos/*-pending-*.md 2>/dev/null | wc -l)"
echo "Ready: $(ls .claude/todos/*-ready-*.md 2>/dev/null | wc -l)"
```

## Workflow

### Step 1: Present Each Finding

For each finding, present in this format:

```
---
Issue #X: [Brief Title]

Severity: P1 (CRITICAL) / P2 (IMPORTANT) / P3 (NICE-TO-HAVE)

Category: [Security/Performance/Architecture/Bug/Feature/etc.]

Description:
[Detailed explanation of the issue or improvement]

Location: [file_path:line_number]

Problem Scenario:
[Step by step what's wrong or could happen]

Proposed Solution:
[How to fix it]

Estimated Effort: Small (< 2 hours) / Medium (2-8 hours) / Large (> 8 hours)

---
Do you want to add this to the todo list?
1. yes - approve this todo
2. next - skip and delete this item
3. custom - modify before deciding
```

### Step 2: Handle User Decision

**When user says "yes":**

1. **Update existing todo file:**
   - Rename file from `{id}-pending-{priority}-{desc}.md` -> `{id}-ready-{priority}-{desc}.md`
   - Update YAML frontmatter: `status: pending` -> `status: ready`
   - Keep issue_id, priority, and description unchanged

2. **Update YAML frontmatter:**

   ```yaml
   ---
   status: ready
   priority: p1
   issue_id: "042"
   tags: [category, relevant-tags]
   dependencies: []
   ---
   ```

3. **Update Work Log** with triage approval entry

4. **Confirm approval:** "Approved: `{filename}` (Issue #{issue_id}) - Status: **ready**"

**When user says "next":**

- **Delete the todo file** - Remove it from .claude/todos/ since it's not relevant
- Skip to the next item
- Track skipped items for summary

**When user says "custom":**

- Ask what to modify (priority, description, details)
- Update the information
- Present revised version
- Ask again: yes/next/custom

### Step 3: Continue Until All Processed

- Process all items one by one
- Track progress via file renames and deletions

### Step 4: Final Summary

After all items processed:

```markdown
## Triage Complete

**Total Items:** [X]
**Todos Approved (ready):** [Y]
**Skipped:** [Z]

### Approved Todos (Ready for Work):

- `042-ready-p1-fix-fk-constraint.md` - Foreign key constraint issue
- `043-ready-p2-add-eager-loading.md` - Performance improvement

### Skipped Items (Deleted):

- Item #5: [reason] - Removed from .claude/todos/

### Next Steps:

1. View approved todos:
   ```bash
   ls .claude/todos/*-ready-*.md
   ```

2. Start working on approved items with `/workflows:work`

3. As you work, update todo status:
   - Ready -> Complete (rename file: ready -> complete, update frontmatter)
```

Present options:

```markdown
What would you like to do next?

1. Run /workflows:work to start on ready todos
2. Commit the todo files
3. Nothing for now
```

## Important Implementation Details

### Status Transitions During Triage

**When "yes" is selected:**
1. Rename file: `{id}-pending-{priority}-{desc}.md` -> `{id}-ready-{priority}-{desc}.md`
2. Update YAML frontmatter: `status: pending` -> `status: ready`
3. Update Work Log with triage approval entry
4. Confirm: "Approved: `{filename}` (Issue #{issue_id}) - Status: **ready**"

**When "next" is selected:**
1. Delete the todo file from .claude/todos/ directory
2. Skip to next item
3. No file remains in the system

### Progress Tracking

Every time you present a todo as a header, include:
- **Progress:** X/Y completed (e.g., "3/10 completed")

### Do Not Code During Triage

- Present findings
- Make yes/next/custom decisions
- Update todo files (rename, frontmatter, work log)
- Do NOT implement fixes or write code
- That's for /workflows:work phase

## Integration

### Skills
- **file-todos** - Todo file format and lifecycle management

### Commands
- **/debug** - Creates todos that feed into triage
- **/workflows:work** - Execute on triaged/approved todos
- **/workflows:compound** - Document solutions after work is done
