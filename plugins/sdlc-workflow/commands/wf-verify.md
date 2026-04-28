---
name: wf-verify
description: Verify that the selected slice meets acceptance criteria and is ready for review.
argument-hint: <slug> [slice]
disable-model-invocation: true
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-verify`, **stage 6 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → `6·verify` → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md` |
| Produces | `06-verify-<slice-slug>.md` + updates `06-verify.md` master |
| Next | `/wf-review <slug> <selected-slice>` (if passing) or `/wf-implement <slug> <selected-slice>` (if fixes needed) |
| Skip-to | `/wf-handoff <slug> <slice>` if review is unnecessary (solo project, trivial change, already peer-reviewed externally) |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT fix issues you find — only report them. Fixes belong in `/wf-implement`.
- Do NOT review, handoff, or ship — those are later stages.
- Your job is to **run checks and compare results against acceptance criteria**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start fixing code, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Resolve the slice-slug**: If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
4. **Check prerequisites:**
   - `05-implement-<slice-slug>.md` must exist. If missing → STOP. Tell the user: "Run `/wf-implement <slug> <slice-slug>` first."
   - If it shows `Status: Awaiting input` → STOP.
   - If `06-verify-<slice-slug>.md` already exists → WARN: "This slice has already been verified. Running again will overwrite. Proceed?"
5. **Read the slice's full context:**
   - `03-slice-<slice-slug>.md` — acceptance criteria to verify against
   - `04-plan-<slice-slug>.md` — what was planned (to check deviations)
   - `05-implement-<slice-slug>.md` — what was actually implemented
   - `02-shape.md` — overall spec context
   - `po-answers.md`
6. **Carry forward** `open-questions` from the index.
7. **Branch check:** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy` is `dedicated`, confirm you are on the correct branch (`git branch --show-current`). If not, switch to it. Verification must run against the implementation branch, not the base branch.

# Parallel verification
When verification spans multiple concerns, launch parallel sub-agents. Do not spin up sub-agents when a single test command covers everything.

### Functional sub-agent 1 — Static Analysis & Build

Prompt the agent with ALL of the following:

**Lint & format checks:**
- Detect the project's linter(s) from config files (`.eslintrc*`, `biome.json`, `ruff.toml`, `.golangci.yml`, `Cargo.toml [lints]`, etc.)
- Run the lint command: `npm run lint`, `ruff check .`, `golangci-lint run`, `cargo clippy`, etc.
- Report: pass/fail, count of errors vs. warnings, which errors are in files this slice changed vs. pre-existing

**Type checking:**
- Detect the type system (`tsconfig.json`, `mypy.ini`, `pyright`, Go compiler, Rust compiler)
- Run the type check: `npx tsc --noEmit`, `mypy .`, `go build ./...`, `cargo check`, etc.
- Report: pass/fail, type errors in slice-affected files vs. pre-existing

**Build verification:**
- Run the project build command: `npm run build`, `go build ./...`, `cargo build`, `make`, etc.
- Report: success/failure, build warnings, output artifact verification

### Functional sub-agent 2 — Test Execution

Prompt the agent with ALL of the following:

**Unit tests:**
- Identify which test files cover the slice's affected code (grep for imports of affected modules in test files)
- Run those specific tests first with verbose output
- Then run the full unit test suite to check for regressions
- Report: total/passed/failed/skipped, any failures with full error output, test duration

**Integration tests:**
- Identify integration test suites that cover the affected area
- Run them with verbose output
- Report: total/passed/failed/skipped, any failures with full error output
- Note any tests that are flaky (check git log for recent skip/unskip patterns)

**Coverage (if available):**
- Run tests with coverage enabled if the project has it configured
- Report coverage percentage for the files this slice changed
- Flag any new code paths with 0% coverage

### Functional sub-agent 3 — Interactive & Visual Verification (when acceptance criteria require it)

Launch when `02-shape.md` → `## Verification Strategy` or `04-plan-<slice>.md` → `## Test / Verification Plan` identifies acceptance criteria that need interactive verification. This is how you verify the feature **actually works the way a human would experience it** — automated tests prove code correctness, but interactive verification proves the user-visible behavior.

Prompt the agent with ALL of the following. Adapt to the project's platform:

**Web applications — tool selection (in priority order):**

1. **dev-browser** (preferred) — check if installed: `command -v dev-browser`. If not installed, tell the user:
   > "Interactive web verification requires `dev-browser`. Install with: `npm install -g dev-browser && dev-browser install`. See https://github.com/SawyerHood/dev-browser"

   If available, use dev-browser for all web verification. It provides Playwright's full Page API in a sandboxed QuickJS runtime with persistent pages across scripts:
   ```bash
   dev-browser --headless <<'SCRIPT'
   const page = await browser.getPage("verify");
   await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
   // interact with the page
   await page.click("button#submit");
   await page.waitForSelector(".success-message");
   // capture screenshot evidence
   const buf = await page.screenshot();
   await saveScreenshot(buf, "verify-criterion-name.png");
   // get AI-friendly DOM snapshot for reasoning
   const snapshot = await page.snapshotForAI();
   console.log(JSON.stringify(snapshot));
   SCRIPT
   ```
   - Use **persistent named pages** (`browser.getPage("verify")`) to maintain state across multiple verification scripts (e.g., login once, then verify multiple pages)
   - Use `page.snapshotForAI()` to get LLM-optimized DOM snapshots for reasoning about page structure
   - Screenshots are saved to `~/.dev-browser/tmp/` — copy them to the evidence directory
   - Use `--connect` flag instead of `--headless` if the user has a running Chrome with remote debugging enabled

2. **Chrome MCP tools** (fallback) — if `mcp__claude-in-chrome__*` tools are available in the session:
   - Use `mcp__claude-in-chrome__navigate` to load pages
   - Use `mcp__claude-in-chrome__read_page` to inspect content
   - Use `mcp__claude-in-chrome__computer` for interactions (click, type)
   - Use `mcp__claude-in-chrome__get_page_text` to read page content
   - Use `mcp__claude-in-chrome__read_console_messages` to check for errors
   - Use `mcp__claude-in-chrome__read_network_requests` to verify API calls

3. **Playwright directly** (if configured in the project) — run existing Playwright test suites or write inline scripts

**Web verification flow:**
- Start the dev server if not already running (`npm run dev`, `yarn dev`, etc.)
- For each interactive acceptance criterion:
  - Navigate to the relevant page/route
  - Perform the user actions described in the criterion (click, type, navigate, submit forms)
  - Capture a screenshot as evidence
  - **Read the screenshot** to confirm the expected visual state (correct content rendered, layout intact, no error states, expected UI elements visible)
  - Check the browser console for errors
  - Check network requests if the criterion involves API calls: verify correct requests sent, responses received
- Run any existing Playwright/Cypress E2E test suites that cover the affected area
- Run accessibility checks: axe-core scan via Playwright (`@axe-core/playwright`), eslint-plugin-jsx-a11y, or built-in browser accessibility audit

**Android applications (adb / Maestro):**
- Build and install the app: `./gradlew installDebug` or equivalent
- Launch the app on emulator or connected device: `adb shell am start -n <package>/<activity>`
- For each interactive acceptance criterion:
  - If Maestro flows exist for this feature, run them: `maestro test <flow>.yaml`
  - If no Maestro flow exists, use adb commands to navigate: `adb shell input tap`, `adb shell input text`, `adb shell input keyevent`
  - Capture a screenshot: `adb shell screencap /sdcard/verify-<criterion>.png && adb pull /sdcard/verify-<criterion>.png`
  - **Read the screenshot** to confirm the expected visual state
  - Check logcat for errors: `adb logcat -d *:E` filtered to the app's package
  - If Maestro assertions are available: `assertVisible`, `assertNotVisible`, `assertText`
- Run any existing Maestro test suites: `maestro test maestro/`

**iOS applications:**
- Build and install on simulator: `xcodebuild` or `flutter run`
- Use `xcrun simctl` for simulator interaction, screenshots: `xcrun simctl io booted screenshot verify-<criterion>.png`
- Run existing XCUITest or Detox test suites if available

**CLI / terminal applications:**
- Run the command with the relevant inputs
- Capture stdout/stderr as evidence
- Verify output matches expected format and content
- Test error cases: wrong arguments, missing files, permission errors

**Desktop applications:**
- Launch the app and use available automation tools (PyAutoGUI, Playwright for Electron, etc.)
- Capture screenshots of the relevant UI states

**For ALL platforms — evidence protocol:**
1. For each interactive criterion, produce: a screenshot or output capture, a pass/fail determination, and a brief explanation of what was observed
2. If a screenshot shows unexpected behavior, describe exactly what is wrong
3. Store evidence files in `.ai/workflows/<slug>/verify-evidence/` (create the directory if needed)
4. Reference evidence files in the verification report

**Accessibility checks (all UI platforms):**
- If an accessibility linter exists, run it on affected components
- Check that new/modified interactive elements have appropriate ARIA attributes, labels, keyboard handling
- Verify color contrast, focus indicators, and screen reader compatibility if tools are available

### Web research sub-agent 4 — Freshness Impact on Test Results (only if external dependencies could affect tests)

Launch ONLY if test results could be affected by external dependency state changes. Prompt with:

**Dependency drift:**
- If any test failures occur, check whether the failing library/API has released breaking changes since the plan was written
- Web search for known test compatibility issues with the project's dependency versions
- Check if test fixtures or mock data reference external schemas/APIs that may have changed

Merge all sub-agent results. For each check, record: command run, pass/fail, relevant output. Do NOT fix issues — only report them.

# Purpose
Verify that the selected slice meets acceptance criteria and is ready for review.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Use AskUserQuestion** for multiple-choice PO questions (structured decisions, confirmations). Use freeform chat for open-ended questions. Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. Confirm the selected slice.
2. Determine the relevant verification commands from the repo.
3. **Create task list.** Read acceptance criteria from `03-slice-<slice-slug>.md`. Use TaskCreate for each check and criterion:
   - Check tasks: `subject: "Run lint + typecheck"`, `activeForm: "Running lint and typecheck"`, `metadata: { slug, stage: "verify", slice: "<slice-slug>" }`. Similarly for unit tests, integration tests, build, etc.
   - AC tasks: `subject: "AC: <criterion text>"`, `activeForm: "Verifying: <criterion>"`.
   - Dependency: integration tests `addBlockedBy` unit tests. All other checks are independent.
   - Final task: "Write 06-verify-<slice-slug>.md" — `addBlockedBy: [all check and AC tasks]`.
4. **Run checks.** For each check task:
   a. `TaskUpdate(taskId, status: "in_progress")`.
   b. Run or evaluate the check (using parallel sub-agents if multi-concern): lint, typecheck, tests, build, smoke tests, manual checks.
   c. `TaskUpdate(taskId, status: "completed")`. If the check failed, update description first: `TaskUpdate(taskId, description: "FAILED: <output summary>")` then mark completed. Do NOT fix — fixes belong in `/wf-implement`.
5. **Verify acceptance criteria.** For each AC task:
   a. `TaskUpdate(taskId, status: "in_progress")`.
   b. Compare results with the criterion from `03-slice-<slice-slug>.md` and `02-shape.md`.
   c. `TaskUpdate(taskId, status: "completed")`. If not met, update description: `TaskUpdate(taskId, description: "NOT MET: <reason>")`.
6. If verification reveals gaps caused by external dependency behavior or standards drift, run a freshness pass and record it.
7. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
8. Mark "Write 06-verify" task `in_progress`. **Write `06-verify-<slice-slug>.md`** (per-slice file, see template below). Mark `completed`.
9. **Write/update `06-verify.md`** (master index with links to all per-slice verify files).
10. Update `00-index.md` accordingly and add files to `workflow-files`.

# Adaptive routing — evaluate what's actually next
After completing verification, evaluate the results and present the user with ALL viable options:

**Option A: Review** → `/wf-review <slug> <selected-slice>`
Use when: All checks pass. Acceptance criteria are met. Ready for a code review.
**Compact recommended if verify was lengthy** — test output and debugging context is noise for review dispatch.

**Option B: Fix and re-implement** → `/wf-implement <slug> <selected-slice>`
Use when: Tests fail, lint errors, type errors, or acceptance criteria are not met. Clearly describe what needs fixing.

**Option C: Skip review, go to Handoff** → `/wf-handoff <slug> <selected-slice>`
Use when: This is a solo project with no reviewer, OR the change was already externally reviewed (e.g., pair-programmed), OR it's a trivial fix where formal review adds no value. Only suggest this when there is a clear reason.

**Option D: Revisit Plan** → `/wf-plan <slug> <selected-slice>`
Use when: Verification revealed a fundamental flaw in the approach, not just a bug — the plan itself needs rethinking.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `06-verify.md` (master index):

```yaml
---
schema: sdlc/v1
type: verify-index
slug: <slug>
status: in-progress
stage-number: 6
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
slices-verified: <N>
slices-total: <N>
tags: []
refs:
  index: 00-index.md
  implement-index: 05-implement.md
next-command: wf-review
next-invocation: "/wf-review <slug> <slice-slug>"
---
```

# Verify Index

## Recommended Next Stage

---

Write `06-verify-<slice-slug>.md` (per-slice verify):

```yaml
---
schema: sdlc/v1
type: verify
slug: <slug>
slice-slug: <slice-slug>
status: complete
stage-number: 6
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
result: <pass|fail|partial>
metric-checks-run: <N>
metric-checks-passed: <N>
metric-acceptance-met: <N>
metric-acceptance-total: <N>
metric-interactive-checks-run: <N>
metric-interactive-checks-passed: <N>
metric-issues-found: <N>
evidence-dir: ".ai/workflows/<slug>/verify-evidence/"
tags: []
refs:
  index: 00-index.md
  verify-index: 06-verify.md
  slice-def: 03-slice-<slice-slug>.md
  plan: 04-plan-<slice-slug>.md
  implement: 05-implement-<slice-slug>.md
  review: 07-review.md
next-command: wf-review
next-invocation: "/wf-review <slug> <slice-slug>"
---
```

# Verify: <slice-name>

## Verification Summary

## Automated Checks Run
- command/check: result (pass/fail, summary)

## Interactive Verification Results
For each criterion that required interactive verification:
- **Criterion**: what was being verified
- **Platform & tool**: what was used (Playwright, Maestro, adb, browser automation, etc.)
- **Steps performed**: what actions were taken
- **Evidence**: path to screenshot/recording/output (`verify-evidence/<filename>`)
- **Observation**: what was seen in the screenshot/output
- **Result**: pass / fail / partial — with explanation

If no interactive verification was needed: "Automated only — [reason]"

## Acceptance Criteria Status
- criterion: met / partially met / not met / unverified
- verification method: automated / interactive / manual
- evidence: test output / screenshot path / console output

## Issues Found
- severity: issue

## Gaps / Unverified Areas
- ...

## Freshness Research

## Recommendation

## Recommended Next Stage
- **Option A:** `/wf-review <slug> <slice-slug>` — [reason]
- **Option B:** `/wf-implement <slug> <slice-slug>` — fix issues [reason, if applicable]
- **Option C:** `/wf-handoff <slug> <slice-slug>` — skip review [reason, if applicable]
