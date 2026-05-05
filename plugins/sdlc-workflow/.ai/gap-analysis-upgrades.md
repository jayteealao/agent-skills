---
schema: sdlc/v1
type: analysis
title: "Gap Analysis: Built-in Tool Upgrades for sdlc-workflow"
created-at: "2026-04-02"
updated-at: "2026-04-03"
status: in-progress
note: "D4 and D7 absorbed into D1 (TaskCreate across 6 commands)"
priority-order: [D1, D3, E1, E2, E6, D2, D5, E3, E7, D6, D8, E4, E5]
---

# Gap Analysis — Upgrade Opportunities (D1–D8)

Concrete changes to existing sdlc-workflow commands that leverage Claude Code built-in tools not currently used.

---

## D1 — Task-based progress tracking across 6 workflow commands

**Priority:** High
**Status:** Implemented in v7.2.0
**Affects:** `wf-implement`, `wf-verify`, `wf-review`, `wf-handoff`, `wf-ship` (+ merged D4, D7)
**Built-in tools:** TaskCreate, TaskUpdate, TaskList, TaskGet

### Current behavior
All workflow commands communicate progress through chat output only. Multi-step work (plan execution, review fixes, test runs, merge sequences) has no structured tracking. If context compacts mid-stage, progress state is lost.

### Proposed change
Use TaskCreate to build a structured task list at the start of every multi-step stage. Each trackable item becomes a task with subject, description, activeForm, and metadata. Tasks are linked with `addBlockedBy`/`addBlocks` where ordering matters. TaskUpdate marks tasks `in_progress` before starting and `completed` when done. The user sees real-time progress in the CLI spinner via `activeForm`.

### Tool API reference (subset used)

| Tool | Purpose |
|---|---|
| `TaskCreate` | Create a task (status: `pending`). Fields: `subject`, `description`, `activeForm`, `metadata` |
| `TaskUpdate` | Update a task: set `status` (`pending` → `in_progress` → `completed` or `deleted`), `addBlockedBy`, `addBlocks`, `description`, `metadata` |
| `TaskList` | List all tasks with summary (id, subject, status, blockedBy) |
| `TaskGet` | Get full task details by ID |

Key capabilities:
- **Dependencies:** `addBlockedBy: ["1"]` on task 2 means task 2 cannot start until task 1 completes. Use this for sequential steps where order matters (e.g., merge sequence).
- **Spinner:** `activeForm` shows present-continuous text in the CLI spinner while task is `in_progress` (e.g., "Rebasing onto main").
- **Metadata:** Arbitrary key-value pairs. Use for workflow context: `{ slug, stage, slice, findingId }`.
- **Survives compaction:** Tasks persist independently of conversation context.

### Commands and their task designs

#### 1. `wf-implement` (normal mode)
**Source:** `04-plan-<slice-slug>.md` → `## Step-by-Step Plan`

```
TaskCreate for each plan step + bookkeeping:
  T1: subject: "Step 1: <description>"
      activeForm: "Implementing <description>"
      metadata: { slug, stage: "implement", slice: "<slug>" }
  T2: subject: "Step 2: <description>"
      addBlockedBy: ["T1"]  ← only if step depends on prior step
      ...
  TN: subject: "Write 05-implement-<slice-slug>.md"
      addBlockedBy: [all implementation tasks]
  TN+1: subject: "Atomic commit"
        activeForm: "Committing implementation"
        addBlockedBy: ["TN"]

Before starting each step:
  TaskUpdate(taskId: "T1", status: "in_progress")
After completing:
  TaskUpdate(taskId: "T1", status: "completed")

If a step is blocked or fails:
  TaskUpdate(taskId: "T1", description: "BLOCKED: <reason>")
  → Follow existing error handling (STOP, recommend fix)
```

**Dependency strategy:** Plan steps are often sequential (step 2 builds on step 1), but not always. Read the plan and set `addBlockedBy` only where there's a genuine dependency. Independent steps (e.g., "add config key" and "add test file") have no dependency and can be worked in any order.

#### 2. `wf-implement` (reviews mode)
**Source:** `07-review.md` → findings table (BLOCKER/HIGH/MED)

```
TaskCreate after parsing findings:
  T1: subject: "Fix [R1] BLOCKER: <title>"
      description: "Location: <file>:<line>\nIssue: <description>\nFix: <suggestion>"
      activeForm: "Fixing [R1]: <title>"
      metadata: { slug, stage: "implement-reviews", findingId: "R1", severity: "BLOCKER" }
  T2: subject: "Fix [R2] HIGH: <title>"
      metadata: { slug, stage: "implement-reviews", findingId: "R2", severity: "HIGH" }
      ...
  TN: subject: "Update 07-review.md fix status"
      addBlockedBy: [all fix tasks]
  TN+1: subject: "Atomic commit: review fixes"
        addBlockedBy: ["TN"]

Each finding is fixed sequentially by a sub-agent. After each:
  TaskUpdate(taskId, status: "completed")
  — or if fix fails:
  TaskUpdate(taskId, description: "COULD NOT FIX: <reason>")
  TaskUpdate(taskId, status: "completed")  ← still mark done, record failure in description
```

**Dependency strategy:** Findings are independent by default (no `addBlockedBy` between them). The sub-agent dispatch in the existing reviews mode already handles sequencing. Only the bookkeeping tasks (update review file, commit) are blocked by all fixes.

#### 3. `wf-verify`
**Source:** repo test commands + `03-slice-<slice-slug>.md` acceptance criteria

```
TaskCreate at start of verification:
  T1: subject: "Run lint + typecheck"
      activeForm: "Running lint and typecheck"
      metadata: { slug, stage: "verify", slice: "<slug>" }
  T2: subject: "Run unit tests"
      activeForm: "Running unit tests"
  T3: subject: "Run integration tests"
      activeForm: "Running integration tests"
      addBlockedBy: ["T2"]  ← integration after unit
  T4: subject: "AC: <acceptance criterion 1>"
      activeForm: "Verifying: <criterion 1>"
  T5: subject: "AC: <acceptance criterion 2>"
      ...
  TN: subject: "Write 06-verify-<slice-slug>.md"
      addBlockedBy: [all check/AC tasks]

If a check fails:
  TaskUpdate(taskId, status: "completed",
    description: "FAILED: <test output summary>")
  → Do NOT fix. Continue checking remaining items.
  → Failures are recorded in the verify artifact and
    recommend /wf implement to fix.
```

**Dependency strategy:** Lint/typecheck has no dependency (can run first or in parallel with unit tests). Integration tests are blocked by unit tests. Acceptance criteria checks are independent of each other. The final write task is blocked by all checks.

#### 4. `wf-review`
**Source:** selected review commands (step 2 output)

```
TaskCreate after command selection:
  T1: subject: "Review: correctness"
      activeForm: "Dispatching correctness review"
      metadata: { slug, stage: "review", command: "correctness" }
  T2: subject: "Review: security"
      activeForm: "Dispatching security review"
      metadata: { slug, stage: "review", command: "security" }
  T3: subject: "Review: testing"
      ...
  TN: subject: "Aggregate + deduplicate findings"
      activeForm: "Aggregating review findings"
      addBlockedBy: [all review dispatch tasks]
  TN+1: subject: "Write 07-review.md + verdict"
        addBlockedBy: ["TN"]

Review sub-agents run in parallel. As each returns:
  TaskUpdate(taskId, status: "completed")
Aggregation starts only after all dispatches complete (enforced by blockedBy).
```

**Dependency strategy:** All review command dispatches are independent (no `addBlockedBy` between them — they run as parallel sub-agents). Aggregation is blocked by all dispatches. Writing the verdict is blocked by aggregation.

#### 5. `wf-handoff`
**Source:** fixed handoff sequence

```
TaskCreate at start of handoff:
  T1: subject: "Read branch strategy + prior artifacts"
      activeForm: "Reading workflow artifacts"
      metadata: { slug, stage: "handoff" }
  T2: subject: "Write handoff summary"
      activeForm: "Writing handoff summary"
      addBlockedBy: ["T1"]
  T3: subject: "Generate Diátaxis docs"
      activeForm: "Generating documentation"
      addBlockedBy: ["T2"]
      ← skip (TaskUpdate status: "deleted") if docs-needed: false
  T4: subject: "Push branch to remote"
      activeForm: "Pushing branch"
      addBlockedBy: ["T3"]
      ← skip if branch-strategy is not dedicated
  T5: subject: "Create pull request"
      activeForm: "Creating PR"
      addBlockedBy: ["T4"]
      ← skip if branch-strategy is not dedicated
  T6: subject: "Write 08-handoff.md"
      activeForm: "Writing handoff artifact"
      addBlockedBy: ["T5"]
```

**Dependency strategy:** Strictly sequential — each step depends on the prior. Use `TaskUpdate(status: "deleted")` to skip inapplicable tasks (no docs, no branch) rather than leaving them pending.

#### 6. `wf-ship`
**Source:** fixed merge sequence

```
TaskCreate at start of ship:
  T1: subject: "Ask rollout questions"
      activeForm: "Asking rollout questions"
      metadata: { slug, stage: "ship" }
  T2: subject: "Run freshness research"
      activeForm: "Researching release readiness"
      addBlockedBy: ["T1"]
  T3: subject: "Write release readiness assessment"
      activeForm: "Writing readiness assessment"
      addBlockedBy: ["T2"]
  T4: subject: "Get go/no-go confirmation"
      activeForm: "Awaiting go/no-go"
      addBlockedBy: ["T3"]

If branch-strategy is dedicated AND go/conditional-go:
  T5: subject: "Rebase <branch> onto <base-branch>"
      activeForm: "Rebasing onto <base-branch>"
      addBlockedBy: ["T4"]
  T6: subject: "Verify CI passes"
      activeForm: "Checking CI status"
      addBlockedBy: ["T5"]
  T7: subject: "Merge PR #<N>"
      activeForm: "Merging pull request"
      addBlockedBy: ["T6"]
  T8: subject: "Clean up branch"
      activeForm: "Cleaning up branch"
      addBlockedBy: ["T7"]
  T9: subject: "Write 09-ship.md"
      activeForm: "Writing ship artifact"
      addBlockedBy: ["T8"]

If any step fails (rebase conflicts, CI failure):
  TaskUpdate(taskId, status: "completed",
    description: "FAILED: <reason>")
  → STOP the sequence. Do not continue to dependent tasks.
  → Downstream tasks stay pending (their blockedBy is unresolved).
  → Recommend /wf implement to fix, then re-run /wf ship.

If go-nogo is no-go:
  TaskUpdate(T5..T8, status: "deleted")
  → Ship file records the decision but no merge happens.
```

**Dependency strategy:** Strictly sequential chain. The `addBlockedBy` chain ensures that if any step fails and stays incomplete, all downstream tasks remain blocked. This is the highest-value use of dependency tracking — the merge sequence is the riskiest part of the workflow, and explicit dependencies make it resumable.

### Commands that do NOT use task tracking
| Command | Reason |
|---|---|
| `wf-intake` | Freeform PO conversation, no discrete steps |
| `wf-shape` | Research + spec writing, single deliverable |
| `wf-slice` | Analysis output, single deliverable |
| `wf-plan` | Research-heavy, deliverable is the plan file |
| `wf-retro` | Reflective, single deliverable |

### Implementation pattern (shared across all 6 commands)

```
1. BEFORE doing any work:
   a. Parse the source artifact for trackable items
   b. TaskCreate each item with subject, description, activeForm, metadata
   c. TaskUpdate to set addBlockedBy where ordering matters
   d. Metadata on every task: { slug: "<slug>", stage: "<stage-name>" }

2. BEFORE starting each item:
   a. TaskUpdate(taskId, status: "in_progress")
   b. Only one task should be in_progress at a time

3. AFTER completing each item:
   a. TaskUpdate(taskId, status: "completed")
   b. If the item failed: update description with failure details,
      then mark completed (the failure is recorded, not hidden)

4. For inapplicable items (e.g., no docs needed, no branch to push):
   a. TaskUpdate(taskId, status: "deleted")
   b. This removes them from the list cleanly

5. At the end of the stage:
   a. TaskList to confirm all tasks are completed or deleted
   b. Any remaining pending tasks indicate incomplete work
```

### Metadata convention

All tasks created by sdlc-workflow use this metadata shape:
```json
{
  "slug": "<workflow-slug>",
  "stage": "<stage-name>",
  "slice": "<slice-slug>",        // omit if not slice-specific
  "findingId": "<R1>",            // only in reviews mode
  "severity": "<BLOCKER|HIGH|…>", // only in reviews mode
  "command": "<review-command>"   // only in wf-review
}
```

This allows TaskList output to be filtered or queried by workflow context if needed.

---

## D2 — `wf-implement`: EnterWorktree option for isolated implementation

**Priority:** Medium
**Affects:** `skills/wf/reference/implement.md`
**Built-in tool:** EnterWorktree / ExitWorktree

### Current behavior
Implementation happens directly in the working tree. If the user has uncommitted changes or other work in progress, implementation can conflict.

### Proposed change
When `branch-strategy: dedicated`, offer worktree-based implementation. The workflow creates a git worktree for the feature branch, implements there, and merges back.

### Design
```
1. At Step 0.9 (branch check), if branch-strategy is dedicated:
   a. Ask user: "Implement in isolated worktree? (recommended if you have other work in progress)"
   b. If yes: EnterWorktree → creates .worktrees/<slug>-<slice-slug>/
   c. Implement in worktree — all file operations happen there
   d. Atomic commit in worktree
   e. ExitWorktree — returns to main working tree
2. If no or branch-strategy is shared/none: current behavior unchanged
```

### Trade-offs
- **Pro:** Zero risk of conflicting with user's other work
- **Pro:** Can abandon implementation cleanly (just delete worktree)
- **Con:** Adds complexity to the flow
- **Con:** Some tools (IDE, test runners) may not handle worktree paths well

---

## D3 — SessionStart hook for workflow discovery

**Priority:** High
**Status:** Implemented in v7.3.0
**Affects:** New files: `hooks/hooks.json`, `hooks/scripts/workflow-discovery.sh`
**Built-in tool:** Hook event: SessionStart

### Current behavior
Users must remember which workflow they were working on and which stage comes next. No automatic context on conversation start.

### Proposed change
A SessionStart hook that scans `.ai/workflows/*/00-index.md` for active workflows and surfaces them at the start of every conversation.

### Design
```yaml
# hooks/session-start.md
---
name: workflow-discovery
event: SessionStart
---
```

Hook prompt:
```
Scan .ai/workflows/*/00-index.md for any workflow where status is not
"complete" or "abandoned". For each active workflow, extract:
- slug, title, current-stage, status, selected-slice, branch, open-questions

If active workflows exist, display a compact summary:
  "Active workflow: <slug> — stage <N> (<stage-name>), status: <status>"
  "Next: <recommended-next-command>"
  "Branch: <branch> (on correct branch: yes/no)"

If open-questions exist, surface them.
If no active workflows, say nothing.
```

### Why this matters
- Eliminates the "where was I?" problem after context compaction or new session
- Automatically warns if user is on wrong branch
- Surfaces blockers (open questions, awaiting-input status) immediately

---

## D4 — `wf-ship`: merge sequence covered by D1 task tracking

**Priority:** High (absorbed into D1)
**Status:** Merged into D1 — `wf-ship` is one of the 6 commands that gets TaskCreate tracking.

See D1 → "6. `wf-ship`" for the specific task design. The merge sequence (rebase, CI, merge, cleanup) uses a strict `addBlockedBy` chain — if any step fails, all downstream tasks stay blocked, making the sequence resumable.

---

## D5 — Standardize PO questions via AskUserQuestion

**Priority:** Medium
**Status:** Implemented in v7.4.0
**Affects:** All commands that ask PO questions (wf-intake, wf-shape, wf-implement, wf-ship)
**Built-in tool:** AskUserQuestion

### Current behavior
PO questions are asked as numbered lists in chat. Format varies between stages. Some use "Respond with A/B/C", others are freeform. User answers are manually parsed.

### Proposed change
All PO interactions use `AskUserQuestion` with structured options where applicable.

### Design
```
Current (wf-intake):
  "1. What is the branch strategy?
   A) dedicated — new branch for this work
   B) shared — use current branch
   C) none — no git management"

Proposed (wf-intake):
  AskUserQuestion(
    question: "What is the branch strategy for this workflow?",
    options: [
      "dedicated — new branch, PR at handoff, merge at ship",
      "shared — commits on current branch, no PR",
      "none — no git management, artifacts only"
    ]
  )
```

### Stages affected
| Stage | Questions | Type |
|---|---|---|
| wf-intake | Branch strategy, scope, priority | Options + freeform |
| wf-shape | Appetite, risk tolerance | Options |
| wf-implement (reviews) | "Fix now or defer?" per finding | Options |
| wf-ship | Merge strategy, confirmation | Options + confirmation |

### Trade-offs
- **Pro:** Consistent UX, structured responses, easier to parse
- **Pro:** Works better with non-interactive contexts (CI, automation)
- **Con:** Less conversational — some PO interactions benefit from freeform
- **Recommendation:** Use AskUserQuestion for multiple-choice, keep freeform for open-ended

---

## D6 — PostToolUse hook for auto-staging during implement

**Priority:** Low
**Status:** Implemented in v7.5.0
**Affects:** `hooks/hooks.json`, `hooks/scripts/auto-stage.sh`
**Built-in tool:** Hook event: PostToolUse (on Write/Edit)

### Current behavior
Atomic commit happens once at the end of implementation (step 12). If implementation is long and context compacts, uncommitted work could be described but not saved.

### Proposed change
Optional PostToolUse hook that auto-stages files written during `wf-implement`. The final atomic commit at step 12 captures everything, but intermediate saves protect against context loss.

### Design
```yaml
# hooks/post-implement-commit.md (OPTIONAL — user must opt in)
---
name: auto-stage-implement
event: PostToolUse
tool: Write,Edit
---
```

Hook prompt:
```
If an active workflow exists with current-stage: implement and
branch-strategy is dedicated or shared:
  - git add <the file just written/edited>
  - Do NOT commit — just stage

This ensures that if context is lost, a simple `git stash` or
`git commit` preserves all work.
```

### Trade-offs
- **Pro:** Protects against context loss during long implementations
- **Con:** Auto-staging could capture unintended files
- **Con:** Adds overhead to every file write
- **Recommendation:** Off by default, opt-in via plugin settings

---

## D7 — `wf-verify`: covered by D1 task tracking

**Priority:** Medium (absorbed into D1)
**Status:** Merged into D1 — `wf-verify` is one of the 6 commands that gets TaskCreate tracking.

See D1 → "3. `wf-verify`" for the specific task design. Checks and acceptance criteria each become a task. Failed checks are marked completed with failure details in the description — verify does NOT fix, only reports.

---

## D8 — Notification events for stage transitions

**Priority:** Low
**Affects:** All stage commands
**Built-in tool:** Hook event: Notification

### Current behavior
Stage completion is communicated via chat output only. If the user is not watching, they miss it.

### Proposed change
Fire a Notification event when a stage completes, especially for long-running stages (implement, verify, ship).

### Design
```
At the end of each stage command, after writing artifacts:
  Notification(
    title: "sdlc-workflow",
    message: "<slug>: <stage-name> complete → next: <recommended-next>"
  )
```

### Stages where this matters most
- `wf-implement` — can run for a long time
- `wf-verify` — test suites can be slow
- `wf-ship` — merge + CI checks involve waiting

### Trade-offs
- **Pro:** User gets desktop notification when stage finishes
- **Con:** Requires Notification hook support (may not be available in all environments)
- **Con:** Low value if user is actively watching

---

## New Capabilities (E1–E7) — Summary

These are new commands/hooks, not upgrades to existing ones. Documented separately for scope clarity.

| ID | What | Priority | Type |
|---|---|---|---|
| E1 | `wf-status` — dashboard across all workflows | High | New command |
| E2 | `wf-validate` — PreToolUse hook for frontmatter integrity | High | New hook |
| E3 | `wf-context` + PreCompact hook — save state before compaction | Medium | New hook + command |
| E4 | `wf-fork` — parallel slice implementation via Teams pattern | Low | New command |
| E5 | `wf-query` — search workflows by metadata | Low | New command |
| E6 | `wf-skip` — first-class stage skipping with audit trail | High | New command |
| E7 | CronCreate for stale workflow alerts | Medium | New hook |
