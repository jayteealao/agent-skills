---
description: Structured refactoring workflow. Captures behavior baseline before touching code, plans incremental green steps, implements with per-step verification, and confirms behavior is identical after.
argument-hint: <description-or-slug>
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-refactor`, a **behavior-preserving refactoring workflow**.

# Pipeline
`1·brief` → `2·baseline` → `3·plan` → `4·implement` → `5·verify`

| | Detail |
|---|---|
| Requires | Existing code to refactor (and ideally existing tests to baseline against) |
| Produces | `rf-brief.md`, `rf-baseline.md`, `rf-plan.md`, `rf-implement.md`, `rf-verify.md` |
| Next | `/wf review <slug> refactor-safety` is recommended after verify |
| Resume | Pass an existing hotfix slug to resume from the last completed step |

# CRITICAL — behavior preservation is the only acceptance criterion
You are a **refactoring orchestrator**. The singular goal is identical external behavior before and after.
- **NEVER add new functionality** during a refactoring session. If new behavior is needed, finish the refactor first and start a separate `/wf-quick intake` workflow.
- **NEVER change public API surface** (exported function signatures, REST routes, event names, component props, config keys) unless API simplification is the explicit stated goal of this refactor.
- **NEVER skip a failing test** with `skip`, `xtest`, `@Ignore`, or comments. If a test fails after your changes, the refactor introduced a regression — fix the refactor, not the test.
- **NEVER rewrite in a single large commit.** Each plan step must leave the codebase in a working, green state. Incremental steps are not optional.
- **NEVER assume tests are sufficient.** The baseline step verifies what tests actually cover. Gaps in coverage must be noted and treated as risk.
- Follow the numbered steps exactly in order.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/<slug>/00-index.md` with `workflow-type: refactor` → **resume mode**. Read the index, determine the last completed step, skip to the next incomplete step.
   - Otherwise → **new refactor**. Derive a slug: `refactor-<short-description>` (kebab-case, max 5 words, e.g., `refactor-auth-service-layer`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` exists and `workflow-type` is NOT `refactor` → WARN and ask for a different description.
3. **Branch check (MANDATORY):**
   - Read `git branch --show-current`.
   - Refactors SHOULD use a dedicated branch. Ask if the user wants one: `AskUserQuestion { options: ["Create dedicated branch", "Use current branch"] }`.
   - If dedicated: `git checkout -b refactor/<slug>` from the current branch.

# Step 1 — Brief
Ask 3–5 targeted questions about the refactoring goal. Do not ask the 5-round PO interview.

**Required questions:**
1. **What is being refactored?** — Which files, modules, classes, or components? Be specific.
2. **Why?** — What structural problem does this fix? (e.g., "single class is doing three things", "copy-paste across 8 files", "deeply nested conditionals", "wrong abstraction level", "performance bottleneck")
3. **What must not change?** — Which behaviors, APIs, interfaces, or outputs are explicitly frozen?
4. **Is there test coverage?** — Are the areas being refactored covered by tests? If yes, which test files? If no, does the user want to add tests before refactoring?
5. **What is the target structure?** — What should the code look like after? (e.g., "extract into a service class", "use strategy pattern", "flatten nested conditions into early returns")

Write `rf-brief.md` immediately after answers.

**`rf-brief.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: rf-brief
slug: <slug>
workflow-type: refactor
target: <what is being refactored — file paths or module names>
goal: <one sentence: why this refactor>
frozen-apis: [<list of things that must not change>]
existing-coverage: <high|medium|low|none>
status: complete
created-at: <real timestamp via bash>
---
```

Write `00-index.md` immediately after with `workflow-type: refactor`, `current-stage: baseline`.

# Step 2 — Baseline
**This step is the most important step in the workflow.** It captures the ground truth before any code changes.

Launch parallel sub-agents:

### Explore sub-agent 1 — Code State Snapshot

Prompt with ALL of the following:
- Read every file identified as the refactoring target. For each file: line count, exported names (functions, classes, types, constants), and any implicit contracts (event names emitted, global state modified, file paths written to)
- Read every file that imports or calls the refactoring target — use grep for imports across the entire codebase. These are all the callers that must still work after the refactor
- Document the current public API surface: exported function signatures with parameter types and return types; exported class methods and their signatures; REST route handlers if applicable; component props if UI
- Note any code that is intentionally NOT being changed (frozen APIs, untouched callers)

### Explore sub-agent 2 — Test Coverage Snapshot

Prompt with ALL of the following:
- Find all test files that cover the refactoring target — grep for imports of the target modules in test directories
- For each test file found: what behavior does it cover? What are the key assertions? What are the inputs and expected outputs?
- Identify **coverage gaps**: which exported functions, code paths, or behaviors have NO test coverage?
- Run the existing tests for the target area: `npm test -- --grep <pattern>`, `pytest -k <pattern>`, `go test ./... -run <pattern>`, etc. Capture pass/fail/skip counts and any flaky behavior
- Report: test files, behaviors covered, behaviors NOT covered, pass/fail result before refactoring

Wait for both sub-agents. Write `rf-baseline.md`.

**`rf-baseline.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: rf-baseline
slug: <slug>
workflow-type: refactor
target-files: [<paths>]
caller-count: <count>
exported-api: [<list of exported names>]
test-files: [<paths>]
tests-passing: <count>
tests-failing: <count>
tests-skipped: <count>
coverage-gaps: [<list of uncovered behaviors>]
status: complete
created-at: <real timestamp>
---
```

**`rf-baseline.md` body must include:**
- `## Public API Surface` — every exported name with signature, documented exactly as it currently exists
- `## Test Coverage Map` — what each test file covers (behavior → test file mapping)
- `## Coverage Gaps` — behaviors that have no test coverage (these are refactoring risk areas)
- `## Baseline Test Result` — pass/fail counts before any changes

**If coverage gaps are significant:** Use AskUserQuestion to ask if the user wants to add tests before refactoring:
```
AskUserQuestion:
  question: "Coverage gaps found in: <list>. Refactoring without tests covering these areas is risky. Add tests first?"
  options:
    - Add tests first (recommended)
    - Proceed with gaps noted as risk
    - Abort — I need to understand coverage better first
```

# Step 3 — Plan
Plan the refactoring as a sequence of **atomic, independently-green steps**. Each step must:
- Leave the codebase in a passing state (tests green, build passing)
- Be a single logical change (not "refactor everything", but "extract class X", "rename method Y", "inline variable Z")
- Not change external behavior — only internal structure

**Research before planning:**

Launch one sub-agent to research the target refactoring pattern:
- Web search for established patterns for this type of refactoring (e.g., "extract service from controller Node.js pattern", "strangler fig pattern", "replace conditional with polymorphism", "parallel change / expand-contract")
- Search for common pitfalls and failure modes specific to this type of refactoring
- Look for community guidance on safe incremental approaches

Write `rf-plan.md`.

**`rf-plan.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: rf-plan
slug: <slug>
workflow-type: refactor
step-count: <N>
pattern-used: <name of the refactoring pattern>
estimated-files-touched: <count>
api-surface-changes: <none|yes — list>
status: complete
created-at: <real timestamp>
---
```

**`rf-plan.md` body — Step-by-Step Plan:**
```
## Step-by-Step Plan

Each step must be independently completable and leave the codebase green.

### Step 1: <short description>
- What changes: <specific files and what is done>
- What does NOT change: <explicitly state what is preserved>
- Verify green: <test command to run after this step>
- Why this step before step 2: <dependency reason or "independent">

### Step 2: <short description>
...
```

**After writing:** Confirm the plan with the user:
```
AskUserQuestion:
  question: "Refactoring plan ready: <N> steps. Proceed?"
  options:
    - Proceed step by step
    - Adjust plan (describe changes)
    - The plan is too large — help me scope it down
```

# Step 4 — Implement
Execute each plan step. **One step at a time — never combine steps.**

For each step:
1. TaskCreate: `"Step N: <description>"`
2. TaskUpdate to `in_progress`
3. Make only the changes described in this step. Nothing else.
4. Run the verify command for this step (from the plan). If it fails:
   - **STOP.** Do NOT proceed to the next step.
   - Diagnose: did the code change break a test, or was the test already failing? Check `rf-baseline.md` — was this test passing before?
   - If the test was passing before: the refactoring introduced a regression. Fix the refactoring in THIS step (not by modifying tests).
   - If the test was already failing: document as pre-existing, note it, and ask the user whether to proceed.
5. If green: **commit the step**: `refactor(<slug>): step <N> — <short description>`
6. TaskUpdate to `completed`

Write `rf-implement.md` after all steps complete.

**`rf-implement.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: rf-implement
slug: <slug>
workflow-type: refactor
steps-completed: <count>
steps-failed: <count>
commits: [<sha>, ...]
api-surface-changed: <true|false>
new-functionality-added: <true|false — must be false>
status: complete
created-at: <real timestamp>
---
```

**`rf-implement.md` body must include:**
- `## Steps Completed` — each step with commit SHA and what changed
- `## Deviations from Plan` — any step that had to be modified and why
- `## API Surface Delta` — explicit before/after comparison of exported names (must be identical unless API simplification was the explicit goal)

# Step 5 — Verify
Run the full baseline comparison. This is the acceptance criterion for the entire refactor.

1. **Run the complete test suite** — same command(s) used in Step 2 baseline. Report pass/fail/skip counts.
2. **Compare against baseline:**
   - Were any tests passing before that are now failing? → **regression, must fix**
   - Were any tests skipped before that are now failing? → OK, note
   - Are test counts consistent (same number of tests, or more if you added tests)? → check
3. **API surface check:** Read every exported name from `rf-baseline.md → ## Public API Surface`. Verify each still exists with the same signature. Any change that wasn't explicitly planned is a bug.
4. **Caller check:** Grep for imports of the refactored modules across the codebase. Verify all callers still compile/parse. For dynamic languages, spot-check key call sites.

Write `rf-verify.md`.

**`rf-verify.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: rf-verify
slug: <slug>
workflow-type: refactor
baseline-tests-pass: <count from baseline>
post-refactor-tests-pass: <count now>
regressions: [<list of newly-failing tests, or "none">]
api-surface-identical: <true|false>
callers-verified: <true|false>
result: <PASS|FAIL>
status: complete
created-at: <real timestamp>
---
```

**`result: PASS`** requires ALL of:
- No regressions (tests that were passing before are still passing)
- API surface identical (or explicitly changed per plan)
- All callers still work

If FAIL: return to Step 4 and identify which step introduced the regression.

# Adaptive routing
After verify passes:

**Option A (default): Review refactor safety** → `/wf review <slug> refactor-safety`
The `refactor-safety` review domain specifically checks for unintended behavior changes, subtle semantic differences, and test coverage completeness.

**Option B: Review correctness only** → `/wf review <slug> correctness`
Use when the refactor is small and you are confident no behavior changed.

**Option C: Ship directly** → no further review needed (use for trivial renames or code style changes with complete test coverage).

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Never leave canonical results only in chat.
- **Every artifact MUST have YAML frontmatter** with `schema: sdlc/v1`.
- **Timestamps must be real:** run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash.
- The baseline in `rf-baseline.md` is the ground truth. Any deviation from it at verify is a failure unless it was an explicitly planned API change.
- Never modify test assertions to make a refactoring pass — that destroys the baseline.
- Commit atomically per step. Do not accumulate uncommitted changes across steps.

# Chat return contract
After completing, return ONLY:
- `slug: <slug>`
- `wrote: <paths>`
- `baseline vs. post-refactor: <pass-count before> → <pass-count after>` (must match or improve)
- `api-surface: identical | <list of planned changes>`
- `options:` — adaptive routing options as above
