---
description: Verify that the selected slice meets acceptance criteria and is ready for review.
argument-hint: <slug> [slice]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `$wf verify`, **stage 6 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → `6·verify` → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md` |
| Conditional inputs (mandatory when present) | `02c-craft.md` (mock fidelity inventory MUST be re-verified), `04b-instrument.md` (signals MUST fire), `04c-experiment.md` (flag/cohort/metrics MUST work), `05c-benchmark.md` baseline (compare-mode re-run REQUIRED), `augmentations:` list in `00-index.md` (every entry MUST trigger a type-specific re-check — see Step 0.6) |
| Produces | `06-verify-<slice-slug>.md` + updates `06-verify.md` master |
| Next | `$wf review <slug> <selected-slice>` (when `convergence: not-needed` or `converged` and `result: pass`). When `convergence: escalated`: re-invoke `$wf verify <slug> <selected-slice>` for a second round, or escalate to `$wf implement <slug> <selected-slice>` as a manual escape. |
| Skip-to | `$wf handoff <slug> <slice>` if review is unnecessary (solo project, trivial change, already peer-reviewed externally) — only valid when `result: pass`. |

> **Auto second opinion (diagnosis).** After the perceptual review pass, **auto-invoke**
> `$consult codex <do these screenshots and observations actually satisfy the
> user-observable AC, or is something off?>` (pin `codex`/`claude`) when evidence is
> ambiguous or a gate is borderline. Skip when the AC is plainly met.

# CRITICAL — execution discipline
You are a **workflow orchestrator that owns its own triage→fix loop**.
- Run checks and compare results against acceptance criteria. Do NOT improvise fixes while checks are running.
- After all checks and the user-observable AC gate finish (Step 7.5), own a **single-round, user-gated fix loop** (Step 7.6): triage every failure in chat as a short numbered list (Fix / Skip / Escalate); `Fix` choices spawn sub-agents that apply the minimal patch; re-run only affected checks once, then finalize.
- ONE round only. If anything still fails, write `convergence: escalated` and route to re-invoke `$wf verify` or `$wf implement` — **do not loop again in this invocation**.
- Do NOT review, handoff, or ship — those are later stages.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps. The fix loop runs only in Step 7.6, never before checks complete.
- Your only output is the workflow artifacts, the dispatched fix sub-agents, and the compact chat summary defined below.
- If you catch yourself about to start fixing code outside Step 7.6, STOP and return to the next unfinished step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Resolve the slice-slug**: If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
4. **Determine workflow source mode** from `00-index.md` `workflow-type`:
   - `workflow-type: quick` → **compressed mode**. Source: `01-quick.md` (acceptance criteria + plan in single doc) + `05-implement.md`. No per-slice files.
   - `workflow-type: rca` / `investigate` → **forwarded mode**. Source: `01-rca.md` / `01-investigate.md` (rich context) + synthesized `02-shape.md` + `05-implement-<slice-slug>.md` if planning ran.
   - `workflow-type: fix` / `hotfix` / `refactor` → **change-mode (compressed standard lifecycle).** Source: the **un-suffixed single-slice** standard files (`03-slice.md`, `04-plan.md`, `05-implement.md`) + the lead `01-<mode>.md` (`01-fix.md` / `01-hotfix.md` / `01-refactor.md`). Exactly **one** slice; `selected-slice` is its slug. Verify exactly as **standard mode** but use the un-suffixed filenames wherever a step names a `-<slice-slug>`-suffixed file. (For hotfix, focus on reproducing the incident symptom + the regression suite. For **refactor**, run the full baseline comparison from `02-shape.md` — re-run the baseline suite, check every `## Public API Surface` name still exists with the same signature, verify all callers still work; any unplanned deviation is a FAIL.)
   - `workflow-type: update-deps` → **self-managed.** update-deps self-authors `06-verify.md` inside its own flow; it should NOT use `$wf verify`. STOP and direct the user back to `$wf intake update-deps <slug>`.
   - `workflow-type: feature` (default) or unset → **standard mode**.
5. **Check prerequisites by mode:**
   - **Compressed mode**: `05-implement.md` (or `05-implement-<slice-slug>.md` if a slice was added) must exist. Acceptance criteria source is `01-quick.md`.
   - **Forwarded mode**: `05-implement-<slice-slug>.md` (or `05-implement.md`) must exist. Acceptance criteria source is the synthesized `02-shape.md` plus the rich `01-rca.md` / `01-investigate.md`.
   - **Change-mode** (`fix` / `hotfix` / `refactor`): the un-suffixed `05-implement.md` must exist. Acceptance criteria source is `03-slice.md` + `01-<mode>.md` (refactor: also the `02-shape.md` baseline).
   - **Standard mode**: `05-implement-<slice-slug>.md` must exist.
   - All modes: if implement record shows `Status: Awaiting input` → STOP.
   - If `06-verify-<slice-slug>.md` (or `06-verify.md` in compressed mode) already exists → WARN: "This has already been verified. Running again will overwrite. Proceed?"
   - **Stack gate (do NOT silently re-detect):** Inspect the `stack:` block in `00-index.md` and `stack-source` in `04-plan-<slice-slug>.md` (standard/forwarded modes).
     - If `stack:` is **missing entirely** → STOP: "Stack fingerprint missing from `00-index.md`. Sub-agent 3 needs the PO-confirmed stack to pick adapters. Re-run `$wf intake <slug>` first." Verify must NOT re-detect — detection alone is insufficient evidence of intent.
     - If `stack.user-confirmed: false` → **HARD GATE — do not proceed silently.** Ask the user in chat: "stack: was auto-detected but the PO never confirmed it. Adapter selection may be wrong. (1) Stop and re-run intake Batch B to confirm the stack first. (2) Proceed with unconfirmed stack — result stamped weak-provenance and review/ship may refuse it." Stop → STOP. Proceed → set `stack-source: unconfirmed-auto-detect` in the verify slice frontmatter AND `## Caveats`. Never auto-proceed.
     - If `04-plan-<slice-slug>.md` carries `stack-source: unconfirmed-auto-detect` → propagate the same warning and frontmatter stamp (verification inherits the plan's stack provenance).
     - If `stack.user-confirmed: true` and plan agrees → proceed. Sub-agent 3 MUST intersect matched adapters with `stack.platforms`; companion skills used for evidence MUST come from `stack.available-skills`.
   - **Constraint-resolution gate (refuse inherited unresolved environment walls):** Read `## Verification Strategy` in the plan file. Every **user-observable** AC whose strategy names an environment dependency (credentials, device, external service, inbound callback, deploy target, missing infrastructure) must carry a `constraint-resolution:` line authored at plan time (`prerequisite-slice: <slug>` | `proxy+deferral: <named clearing event>` | `po-accepted: <reason>`). If **none of the three** is present, record the criterion under `constraint-resolution-missing:` in the verify frontmatter and treat as `blocked-runtime-evidence-missing` at Step 7.5 — the deferral hatch is **not available** for it. Routing: Option E (`$wf plan` — author the resolution), not Option F.
6. **Read the source context by mode:**
   - **Compressed mode**: `01-quick.md` (acceptance criteria + plan) + `05-implement.md`.
   - **Forwarded mode**: `01-rca.md` or `01-investigate.md` + `02-shape.md` (synthesized) + `04-plan.md` (if exists) + `05-implement-<slice-slug>.md`.
   - **Change-mode** (`fix` / `hotfix` / `refactor`): `01-<mode>.md` + `03-slice.md` (acceptance criteria) + `04-plan.md` + `05-implement.md` (all un-suffixed; refactor also reads the `02-shape.md` baseline).
   - **Standard mode**:
     - `03-slice-<slice-slug>.md` — acceptance criteria to verify against
     - `04-plan-<slice-slug>.md` — what was planned (to check deviations)
     - `05-implement-<slice-slug>.md` — what was actually implemented
     - `02-shape.md` — overall spec context
   - All modes also read `po-answers.md` if it exists.
7. **Read augmentation verification context (`02c-craft.md` is mandatory when present):**
   `02c-craft.md` — **MUST read if it exists** — extract `## Mock fidelity inventory`. Each item is an additional AC. Cross-reference `05-implement-<slice-slug>.md` → `## Visual Contract Honored` to confirm each was honored in code.

   Read the `augmentations:` list in `00-index.md`. For each entry, read the referenced artifact and apply the type-specific re-check:

   | Type | Re-check during verify |
   |---|---|
   | `design-<sub>` | Read `design-notes/<sub>-<timestamp>.md` → `## Verification needed`. Re-run those specific checks (e.g., `harden` → re-run a11y; `optimize` → re-run perf; `adapt` → re-run responsive across breakpoints). |
   | `design-audit` | Read `07-design-audit.md`. Re-check that all "critical" or "high" findings have been resolved in code. |
   | `design-critique` | Read `07-design-critique.md`. Note any prescriptive feedback that should have been actioned. |
   | `instrument` | Read `04b-instrument.md`. For each designed signal, confirm the implementation actually emits the log/metric/trace. Run the affected code path and observe the signal fires (live or via tests). Report any missing signals. |
   | `experiment` | Read `04c-experiment.md`. Confirm: (a) feature flag is wired correctly; (b) cohort split logic produces the documented distribution; (c) primary/secondary/guardrail metrics fire on the expected events; (d) rollback path works. |
   | `benchmark` (status: baseline) | Run the benchmark compare by loading `skills/wf/reference/augment/benchmark.md` in compare mode. Compare results against the baseline numbers in `05c-benchmark.md`. Flag regressions exceeding the documented tripwires (>10% CPU / >25% memory by default). |
8. **Carry forward** `open-questions` from the index.
9. **Branch check:** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy: dedicated`, confirm the correct branch via `git branch --show-current` and switch if needed. Verification must run against the implementation branch, not the base branch.

# Parallel verification
When verification spans multiple concerns, launch parallel sub-agents per [_subagents.md](_subagents.md): independent AC groups go to parallel read-only children, each returning evidence; the parent composes the verify artifact and the verdict. Do not spin up sub-agents when a single test command covers everything.

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

**Default performance gate (MANDATORY — runs on every slice, even without the `benchmark` augmentation):**
- **Bundle size (web):** If a build was produced, compare the output artifact size against the base branch: `git stash && npm run build && du -sh dist/ && git stash pop && npm run build && du -sh dist/`. A size increase ≥ 20% in any chunk is a HIGH issue. Record `metric-bundle-size-delta-pct`.
- **Build time delta:** Record the wall-clock time of the current build vs. the base branch build (from git stash comparison above if run, otherwise from CI cache statistics). A build time increase ≥ 30% is a WARN.
- **Startup time (service/CLI):** If the adapter is `service` or `cli`, measure cold-start time (`time curl -s localhost:<port>/health` after a fresh start). A cold-start increase ≥ 15% vs. the base branch is a HIGH issue.
- Skip the base-branch comparison if `git stash` would destroy in-progress work (check `git stash list` first; if non-empty, record `metric-bundle-size-delta-pct: skipped — stash non-empty` and proceed). In that case, still record the absolute artifact size.
- This gate is **separate from** the `benchmark` augmentation. The augmentation adds detailed profiling; this gate adds a lightweight size/startup floor that runs every time.

**Security scanning (MANDATORY — runs on every slice):**
- **Dependency CVEs:** Run `npm audit --audit-level=high`, `cargo audit`, `pip-audit`, `go list -json -m all | nancy sleuth`, or the project's equivalent. Report: count of critical/high CVEs in files this slice changed vs. pre-existing. New CVEs introduced by this slice are BLOCKER issues.
- **Secret detection:** Run `git diff <base-branch>...HEAD | trufflehog --stdin` or `gitleaks detect --source=. --log-opts="<base>..<head>"` if available; otherwise search the diff for patterns matching API key, secret, password, token, credential assignments in string literals. Any finding is a BLOCKER.
- **SAST (if tooling is present):** Run `semgrep --config=auto` on files this slice touched if semgrep is installed. Report new findings in slice-modified files at severity HIGH or above.
- Report: `security-scan-result: pass | fail | skipped` (skipped only when no tooling is installed and no patterns matched). New findings introduced by the slice are BLOCKER issues regardless of convergence verdict.

**`sdlc-debt:` marker hygiene (validation — runs on every slice):**
- Grep the slice diff for intentional-simplification markers: `git diff <base-branch>...HEAD | grep -nE 'sdlc-debt:'` (or scan the slice's changed files).
- For each marker found, validate two things:
  - **Well-formed:** the comment names a *ceiling* (the known limitation — global lock, O(n²) scan, naive heuristic, hard-coded value) AND an *upgrade path*. A bare `sdlc-debt:` with neither is a LOW finding.
  - **Recorded:** the shortcut appears in `05-implement-<slice-slug>.md` → `## Anything Deferred` or `## Known Risks / Caveats`. An unrecorded marker is invisible debt — a MED finding.
- This is the debt analog of "non-trivial logic leaves its check behind": a deliberate shortcut without its recorded ceiling is *unfinished*, not lazy. **Scope is THIS slice's diff only — verify VALIDATES freshly-written markers, it does NOT aggregate the repo's debt backlog** (that is retro's per-workflow reconcile and `$wf simplify codebase`'s on-demand sweep).
- Report: `debt-markers-found: <N>`, `debt-markers-malformed: <N>`, `debt-markers-unrecorded: <N>`. Malformed or unrecorded markers are findings that enter the Step 7.6 fix loop (Fix = make the marker well-formed and record it; the code shortcut itself is not undone here).

### Functional sub-agent 2 — Test Execution

Prompt the agent with ALL of the following:

**Unit tests:**
- Identify which test files cover the slice's affected code (search / list files in the repository for imports of affected modules in test files)
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

**Cross-slice regression check (MANDATORY when sibling slices have been verified):**
- Read `06-verify.md` (master verify index). Collect every `slice-slug` listed with `result: pass` or `result: partial` that is NOT the current slice.
- For each sibling slice, identify its `files-modified` list from `05-implement-<sibling-slug>.md`. If any sibling's files overlap with the current slice's `files-modified`, flag the sibling as a potential regression target.
- Re-run the test suite scoped to the overlapping files (or the sibling's recorded test command from its `06-verify-<sibling-slug>.md` `## Automated Checks Run` section).
- Report: `cross-slice-regressions-found: <N>`, list of sibling slices re-checked, pass/fail per sibling. Any sibling that newly fails is a BLOCKER issue.
- If no sibling slices exist (first slice), record `cross-slice-regressions-found: 0` and note "no prior verified slices."

### Functional sub-agent 3 — Interactive & Runtime-Truth Verification

**This sub-agent is MANDATORY when the slice's AC contains any user-observable criterion** (see Step 6.5 — User-observable AC gate). Automated tests prove code correctness; interactive verification proves user-visible behavior. A slice cannot reach `result: pass` if a user-observable AC has no matching interactive evidence.

**Platform recipes live in the adapter registry**, not inline:

> Read `runtime-adapters.md` and follow the recipe for every adapter whose detection signals match the repo (web / android / ios / cli / desktop / service / notebook / etc.). Adapter selection is documented at the top of that file.

**Climb the constraint-resolution ladder before deferring anything (MANDATORY).** "No device / no browser / no creds" is not a defer-reason — it is the *start* of a ladder climb, not the end. For each user-observable AC whose obvious path is blocked, climb the ladder for its class (runtime-adapters.md → *Constraint-resolution ladder*), executing any tool bootstrap the plan's `## Verification Strategy` already authorized, and record the highest rung that produced evidence. Defer ONLY the residual that no rung can reach. Three hard rules:

- **Static reasoning is never evidence for a user-observable AC.** A "decidable by reasoning over the truth table" note proves *code correctness*, not user-visible behavior. Drive the criterion; do not reason past it to a `pass`.
- **Verify the layer the AC is about.** If the AC asserts a live integration (a real query, a rules/permission check, an index-backed lookup), a mock-backed pass is insufficient — climb to the emulator/testcontainer rung before `pass`. A mocked integration does not verify a user-observable AC about that integration.
- **Punting to a future slice is a deferral, not a pass.** "Will be verified during `<other slice>`" must register a deferral that the later slice (or `$wf probe`) is obligated to clear — never grounds for `result: pass` on this slice.

Prompt the agent with ALL of the following:

0. **Read product context before driving (MANDATORY — Gap 11 fix).** Before matching adapters or driving any criterion, build a mental model of product conventions so that observations can be held against them:
   - Read `PRODUCT-CONTEXT.md` or `docs/product-conventions.md` at repo root if either exists.
   - Read `02b-design.md`, `02c-craft.md`, `07-design-audit.md`, `07-design-critique.md` if present — extract any prescriptive UI/UX norms.
   - Search / list files in the repository for the 3 most similar existing components to the surface being verified (by component name or route). Read them for visual and interaction conventions.
   - Read the git log for the top 5 files this slice modified (`git log --oneline -10 -- <file>`) to understand the component's history and prior reviewers' concerns.
   - Synthesize a one-paragraph "product conventions" note. Hold all observations during the drive against these conventions — not just against the criterion text. Record divergences from convention under `## Friction Notes` even when the criterion is technically met.

1. **Match adapters — constrained by confirmed stack.** Run every adapter's detection signal against the repo. Then **intersect the matches with `stack.platforms`** from `00-index.md`:
   - If `stack.user-confirmed: true` → the effective adapter set is `matched-adapters ∩ stack.platforms`. If detection finds a platform NOT in `stack.platforms` (e.g., an incidental `package.json` in an Android repo), exclude it — the PO did not confirm that surface as in-scope. Record the exclusion under `## Caveats` so the report explains why the adapter was skipped.
   - If `stack.user-confirmed: false` OR `stack-source: unconfirmed-auto-detect` → run all matched adapters but stamp each evidence record with `stack-confirmed: false`. The verify report's `## Caveats` section MUST state that adapter selection was not PO-confirmed.
   - If `stack.platforms` is empty after intersection → record `bootstrap-failure: { adapter: none, step: stack-intersection, remediation: "Confirmed stack lists no platforms matching repo detection. Re-run $wf intake to reconcile." }` and skip to teardown. Do NOT pick a default adapter to fill the gap.
   - Multi-match (e.g., web + service) is common and must be driven when both are in `stack.platforms`. Record the final adapter keys under `adapters-used:` in the verify report.
2. **Bootstrap each matched adapter** per its `Bootstrap` section. If any bootstrap step fails after the adapter's documented resolution attempts, report `bootstrap-failure: { adapter, step, exit-code, output-tail, remediation }` and do NOT proceed past bootstrap for that adapter. The user-observable AC gate (Step 6.5) will then refuse `result: pass` and require either an `interactive-verification: deferred` annotation or a remediation pass via `$wf probe`.

2b. **Capture longitudinal baseline before driving (MANDATORY — Gap 3 fix).** Before driving any criterion on the current branch, capture before-state screenshots for each surface named in the AC:
   - Check whether a prior evidence run exists at `.ai/workflows/<slug>/verify-evidence/<slice-slug>-run-*/`. If prior evidence exists, read those screenshots as the before-state — no git stash needed.
   - If no prior evidence exists, stash current changes (`git stash --include-untracked`), boot the adapter against the base branch, screenshot each named surface, then restore (`git stash pop`). Store these as `baseline-<surface>.png` in the evidence directory.
   - If stashing would destroy in-progress work (check `git stash list` first), skip the baseline capture and record `longitudinal-baseline-compared: skipped — stash non-empty`.
   - During the drive phase, compare each criterion's post-drive screenshot against its baseline. Report visual deltas (layout changes, missing elements, new elements, color or typography shifts) under `## Longitudinal Delta` for each criterion. A delta is informational — it is only a finding if it contradicts the criterion or product conventions.

3. **For each user-observable AC**, follow the adapter's `Drive` and `Observe` recipes, with these mandatory extensions:

   **a. Multi-point evidence capture (Gap 12 fix):** Do not capture only the final settled state. For each criterion drive, capture evidence at three distinct moments: the initial response immediately after triggering the action, the transition or loading state while the system is processing, and the final settled state after the action completes. Name files to reflect the moment (`-initial`, `-transition`, `-final` or equivalent). Report on each frame: was a loading indicator shown? Did transitions complete cleanly? Was there any blank, broken, or inconsistent intermediate state?

   **b. Stability check (Gap 4 fix):** After the first drive produces a result, re-drive the same criterion at least twice more without resetting state. If any re-drive produces a different outcome — different visual state, different console output, different response — flag the criterion as `stability: flaky`. Flaky criteria are HIGH issues indicating race conditions or state leakage. Record `stability-check-flaky-count: <N>`.

   **c. Perceptual review pass (Gap 2 fix):** After determining pass/fail against the criterion text, make a second independent pass on the final screenshot. Ask: *independent of the criterion, what do I notice about this screen?* Report on: visual hierarchy, spacing consistency, font rendering, element alignment, truncated text, color divergences, anything that would make a first-time user pause. Record under `## Friction Notes` (informational unless they contradict product conventions from step 0).

   **d. Anomaly investigation mandate (Gap 9 fix):** When reading evidence (screenshot, response body, console output), if anything appears unexpected — a console error, a network request to an unexpected endpoint, an element present/absent unexpectedly — pivot: open DevTools console (via CDP or MCP browser tools), read the network tab, inspect the DOM. Report as a sub-finding. Never filter an anomaly as "probably unrelated" — record and let the reviewer decide.

   - Navigate or invoke the surface named in the criterion.
   - Perform the user actions described.
   - Apply the multi-point capture, stability check, perceptual review, and anomaly investigation protocols above.
   - Record: criterion id or quoted text, adapter used, evidence paths (all frames), stability result, perceptual notes, anomaly findings, pass/fail.
4. **Tear down each adapter** per its `Tear down` section. Idempotent — re-runs of verify must not leave the environment dirtier each pass.
5. **Run existing test suites** that target the same surface (Playwright/Cypress E2E for web, Maestro suites for Android, XCUITest for iOS, etc.) in addition to the per-criterion drives, when they exist. The adapter's `Drive` section names the relevant suite invocations.

6. **Free exploration (MANDATORY — Gap 1 fix).** After verifying all AC, set aside the criteria list and navigate the surface as a first-time user. Cover every interactive element, at least one adjacent flow, and try reaching the same outcome via a different path. Note anything that surprises, feels incomplete, or breaks — even if every AC passes. Record under `## Free Exploration Notes` (informational; does not affect `result:`, but reviewer-visible). A finding that directly contradicts any AC becomes a standard issue.

7. **Adversarial micro-tests (MANDATORY — Gaps 5 & 10 fix).** After free exploration, run this fixed test set regardless of whether AC specify these scenarios:
   - **Empty submission:** Submit with no input. Crash or unhandled error = BLOCKER; graceful validation = informational.
   - **Extreme input:** Paste a very large input into each text field. Crash or UI breakage = HIGH; clean truncation/rejection = informational.
   - **Rapid repeat:** Trigger the primary action multiple times rapidly. Record duplicate submissions, debouncing, or UI breakage.
   - **Mid-flow interruption:** Navigate away mid-flow then back. Record whether state is preserved, cleared gracefully, or broken.
   - **Network failure:** Trigger offline or degraded-network during the primary action. Crash or blank screen = HIGH; graceful error = informational.
   Record under `## Adversarial Tests`. BLOCKER and HIGH findings enter the main issue list; informational findings stay in the adversarial section.

8. **Failure mode probes (MANDATORY — Gap 10 fix).** For each user-observable AC, after the happy path, probe boundary conditions AC never specify:
   - **Slow response:** Enable Fast 3G throttling and re-drive. Record loading states, timeout handling, and final result correctness.
   - **Concurrent session:** Open the same surface in a second session and perform the same action simultaneously. Record state collisions, double-writes, or UI desync.
   - **Session expiry:** If auth is in scope, invalidate the session mid-flow and re-drive. Record graceful handling vs. crash/blank screen.
   Record under `## Failure Mode Probes`. Unhandled error states are HIGH issues.

The `runtime-adapters.md` `Evidence protocol` and `Accessibility checks` sections apply across all platforms; do not duplicate them here.

**Accessibility gate (MANDATORY for all UI adapters — web, android, ios, desktop):**

After driving each user-observable criterion, run an a11y scan on the surface just exercised:
- **Web:** run `axe-core` via `@axe-core/playwright` or `page.evaluate(() => axe.run())` if axe is injected. Alternatively: `npx @axe-core/cli <url>`. Capture new WCAG AA violations only (diff against a baseline scan of the same route on the base branch if possible; otherwise report all violations found in modified components).
- **Android / iOS:** run the platform's built-in accessibility scanner (`adb shell am start -a android.intent.action.MAIN -n com.google.android.marvin.talkback/.TalkBackService` is not scriptable; use Accessibility Scanner APK via `adb install` if available, or report "a11y scan: not-automatable" with a note to manually verify).
- **Result:** `a11y-result: pass | fail | not-automatable`. Any new WCAG AA violation in a component this slice introduced or modified is a HIGH issue (not BLOCKER by default, but surfaces in triage).
- This gate fires whether or not `design-harden` augmentation is present. The augmentation adds a deeper scan; the gate adds a minimum floor.

**Output to the calling stage:**
- `interactive-verification-results: [{criterion, adapter, evidence-paths: [t0, t250, final], stability-result, perceptual-notes, anomaly-findings, observation, result}, ...]`
- `bootstrap-failures: [{adapter, step, remediation}, ...]` (empty if all bootstrapped cleanly)
- `metric-interactive-checks-run: <N>`
- `metric-interactive-checks-passed: <N>`
- `a11y-result: <pass | fail | not-automatable>`
- `metric-a11y-violations-new: <N>` — new WCAG AA violations in slice-modified UI components
- `stack-source: <confirmed|unconfirmed-auto-detect>` — inherited from `00-index.md` `stack.user-confirmed` and `04-plan-<slice-slug>.md` `stack-source`. Downstream stages (review, handoff, ship) may refuse to proceed on `unconfirmed-auto-detect` without explicit override.
- `adapters-excluded-by-stack: [<key>, ...]` — adapters whose detection signals matched but were filtered out because they were not in `stack.platforms`. Empty list when stack was unconfirmed (no intersection performed).
- `longitudinal-baseline-compared: <true | false | skipped — stash non-empty>` — whether a before/after screenshot comparison was performed
- `stability-check-flaky-count: <N>` — criteria that produced different results across the 3 stability drives; >0 is a HIGH issue
- `friction-notes: [<string>, ...]` — observations from the perceptual review and product-convention audit; informational, not issues
- `free-exploration-findings: [<string>, ...]` — unexpected observations from the open-ended exploration step; findings that contradict AC become standard issues
- `adversarial-tests-run: <N>` — count of adversarial micro-tests executed
- `adversarial-tests-failed: <N>` — count that produced BLOCKER or HIGH findings
- `failure-mode-probes-run: <N>` — count of failure mode probes executed
- `cross-browser-delta: <none | findings>` — summary of cross-browser divergence from the web adapter sweep; findings are HIGH issues
- `web-vitals: {lcp: <ms>, cls: <score>, inp: <ms>}` — Interaction to Next Paint and Core Web Vitals from CDP; INP > 200 ms is HIGH

### Functional sub-agent 4 — Augmentation Re-verification (only if `02c-craft.md` or `00-index.md` `augmentations:` list is non-empty)

Launch ONLY if `02c-craft.md` exists or any entry appears in `00-index.md` `augmentations:`. This sub-agent enforces contracts the standard test suites do not catch.

> **`verify` is the design consumer that *measures it* (when `stack.ui ≠ ∅`).** The a11y / perf / responsive / web-vitals gates above are the **measurable design floor** for any UI slice, and the per-augmentation re-checks below confirm each *applied* transform actually hit its goal. The canonical laws and absolute bans behind that floor are single-sourced in `design/_design-context.md` — load its Accessibility law + Absolute bans when `stack.ui ≠ ∅` (even if no `02b`/`02c` exists) so the measurable checks match the design canon. These numbers are measured **once, here** — `$wf review`'s design-audit dimension (and ad-hoc `$wf design audit`) *interpret* them from `06-verify-*.md` rather than re-running axe-core, so the two stages can never disagree about the same measurement. Record them in the verify report so audit can read them.

Prompt with:

**Mock fidelity inventory check (when `02c-craft.md` is present):**
- Read `02c-craft.md` → `## Mock fidelity inventory`. For each item, check `05-implement-<slice-slug>.md` → `## Visual Contract Honored` to find its disposition (honored or deviation).
- For "honored" items: open the cited file:line and verify the item is actually implemented as described. Do not trust the implementation record blindly.
- For "deviation" items: surface the deviation in the verify report. Deviations are not failures by default — they may be valid trade-offs — but they must be visible.
- Visual spot-check: load the affected page/route in the browser tool selected above. Compare screenshot against `02c-craft.md` → `## North-star mock` (path to image). Report any composition, hierarchy, or signature-move regressions.

**Augmentation type-specific checks (for each entry in `augmentations:` list):**

| Type | Check |
|---|---|
| `design-harden` | Run a11y scan (axe-core or framework equivalent) on `files-modified`. Report any new WCAG AA violations. |
| `design-optimize` | Re-measure performance (Lighthouse / DevTools profile / framework perf test) on the modified surface. Compare against the documented improvements. Flag regressions. |
| `design-adapt` | Re-test responsive behavior at the documented breakpoints. Confirm mobile + tablet + desktop work. |
| `design-colorize` / `design-typeset` / `design-polish` / `design-bolder` / `design-quieter` / `design-delight` / etc. | Visual diff against the augmentation's `## What changed` section. Confirm changes are present and no regressions to surrounding UI. |
| `design-audit` | Read `07-design-audit.md`. Re-check that "critical" / "high" findings are resolved. |
| `design-critique` | Read `07-design-critique.md`. Note actioned-vs-unactioned recommendations. |
| `instrument` | Read `04b-instrument.md`. For each designed signal, exercise the affected code path and confirm the log/metric/trace fires (via tests, live observation, or search the repository on log output). Report any missing signals. |
| `experiment` | Read `04c-experiment.md`. Confirm: feature flag is wired, cohort split produces documented distribution, all metrics (primary/secondary/guardrail) fire on the right events, rollback path works. |
| `benchmark` (status: baseline) | Run the benchmark compare by loading `skills/wf/reference/augment/benchmark.md` in compare mode. Compare against `05c-benchmark.md` baseline. Flag regressions exceeding documented tripwires (default >10% CPU / >25% memory). |

**Reporting:**
- Pass: all mock fidelity items honored, all augmentation type-checks pass, no critical findings outstanding.
- Fail: list each failure with severity. These become BLOCKER or HIGH issues for `$wf review`.

### Web research sub-agent 5 — Freshness: Dependencies, AC Staleness, and Standards Drift

Launch when ANY of the following: (a) any test failure occurred, (b) the plan was written more than 14 days ago (check `created-at` in `04-plan-<slice-slug>.md`), or (c) the slice modifies an integration point with an external API or schema.

Prompt with:

**Dependency drift:**
- If any test failures occur, check whether the failing library/API has released breaking changes since the plan was written
- Web search for known test compatibility issues with the project's dependency versions
- Check if test fixtures or mock data reference external schemas/APIs that may have changed

**AC staleness check (MANDATORY when plan age > 14 days or slice touches external integrations):**
- Read the acceptance criteria from `03-slice-<slice-slug>.md`. For each criterion that names an external API, schema, protocol, or third-party service: web search for breaking changes or deprecations announced since the plan's `created-at` date.
- If any criterion references behavior of an external dependency that has since changed, flag it as `ac-stale: true` with a one-line description of the change. AC staleness is not a verify failure — it surfaces as a `## Freshness Research` finding and routes to `$wf plan` (Option E) if the drift is material.
- Record `ac-staleness-checked: true | false` and `ac-stale-count: <N>` in the output.

Merge all sub-agent results. For each check, record: command run, pass/fail, relevant output. Do NOT fix issues at this stage — the fix loop runs once in Step 7.6 after all checks and the AC gate have finished.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, get the current UTC time per [_timestamp.md](_timestamp.md). Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Ask the user directly in chat** for multiple-choice PO questions (structured decisions, confirmations), presenting options as a short numbered list. Use freeform chat for open-ended questions. Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- **Conditional inputs are mandatory when present.** If a file in this command's *Conditional inputs* row exists on disk, read it and honor it in the output — existence is optional, consumption is required; silent omission is a contract violation.
- **Evidence versioning across re-invocations:** When `06-verify-<slice-slug>.md` already exists (i.e., this is a re-run), do NOT overwrite the previous evidence directory. Before writing new evidence, move the existing evidence to a timestamped snapshot: `mv .ai/workflows/<slug>/verify-evidence/<slice-slug>/ .ai/workflows/<slug>/verify-evidence/<slice-slug>-run-<N>/` where `N` is the re-run count (read from the existing artifact's `fix-rounds-run` field + 1). New evidence goes into the fresh `<slice-slug>/` directory. This preserves a diff-able record of what changed between rounds — reviewers can compare `<slice-slug>-run-1/` vs. `<slice-slug>/` to see whether fixes changed observable behavior.
- **Re-verify writes back; the index never contradicts a slice.** When a re-invocation changes a per-slice outcome (e.g. `fail` → `pass` after a fix round, or a deferral clears), update that per-slice `06-verify-<slice-slug>.md`'s `result` and `updated-at` **in place**, then re-derive the master `06-verify.md` rollup from the per-slice files. The verify-index MUST NOT report `pass` (or "re-verified" / "all-slices-passing") for a slice whose own per-slice file still says `result: fail` — that stale-artifact contradiction hides a real failure behind a green rollup. Rule of order: change the slice file first, then the index; never the index alone.

# Chat return contract
After writing files, return per [_chat-return.md](_chat-return.md) — narrative lead in the artifact's `## The Verification` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `result: <pass | fail | partial | blocked-runtime-evidence-missing>`
- `convergence: <not-needed | converged | escalated>` — include the `fix-rounds-run` count and a one-line "what the loop did" summary when `convergence != not-needed`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. Confirm the selected slice.
2. Determine the relevant verification commands from the repo.
3. **Build a work-tracking checklist** from acceptance criteria in `03-slice-<slice-slug>.md`. List each check and AC criterion. Work sequentially through each.
4. **Run checks.** For each check:
   a. Run or evaluate the check (using parallel sub-agents if multi-concern): lint, typecheck, tests, build, smoke tests, manual checks.
   b. Record the result. If the check failed, note the failure. Do NOT fix yet — the user-gated fix loop runs once in Step 7.6 after all checks finish and the AC gate has partitioned issues.
5. **Verify acceptance criteria.** For each AC criterion:
   a. Compare results with the criterion from `03-slice-<slice-slug>.md` and `02-shape.md`.
   b. Record: met / not met / partial, with evidence or reason.
6. If verification reveals gaps caused by external dependency behavior or standards drift, run a freshness pass and record it.
7. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
7.5. **Apply the user-observable AC gate** (see "User-observable AC gate" section below). Partition AC into `code-only` vs `user-observable`. For every `user-observable` AC, require a matching entry in `interactive-verification-results` (from sub-agent 3). If any user-observable AC has no matching entry AND no `interactive-verification: deferred` annotation, the per-slice verify file MUST be written with `result: blocked-runtime-evidence-missing` (NOT `pass`) and the missing AC listed in `## Issues Found`. The gate is the load-bearing change that closes the "verified but actually broken" leak.
7.6. **Single-round verify-owned fix loop** (see "Verify-owned fix loop" section below). Snapshot the issue list as `metric-issues-found-initial`. Triage each failing check and each unmet user-observable AC in chat, presenting options as a short numbered list. For every `Fix` decision, spawn a sub-agent that applies the minimal patch. Re-run only the affected checks once. Record `fix-rounds-run`, `convergence`, and the resulting `metric-issues-found-final`. ONE round only — if anything still fails, finalize with `convergence: escalated` and route the user to re-invoke verify (or to `$wf implement` as a manual escape).
8. **Write `06-verify-<slice-slug>.md`** (per-slice file, see template below).
9. **Write/update `06-verify.md`** (master index with links to all per-slice verify files).
10. Update `00-index.md` accordingly and add files to `workflow-files`.

# Adaptive routing — evaluate what's actually next

Routing is **driven by `convergence:`** plus the post-fix-loop `result:`. Verify no longer routes to `$wf implement` as the default fix path — the fix loop is owned by this stage. `$wf implement` survives only as a manual escape.

After completing the fix loop, evaluate the results and present the user with ALL viable options:

**Option A: Review** → `$wf review <slug> <selected-slice>`
Use when: `convergence: not-needed` OR `convergence: converged` AND `result: pass`.
**Compact recommended if verify was lengthy** — test output and fix sub-agent chatter is noise for review dispatch.

**Option B: Re-invoke verify for a second round** → `$wf verify <slug> <selected-slice>`
Use when: `convergence: escalated` and the user wants another fix round. Each round requires a fresh invocation for its own audit trail. State unresolved issues clearly before recommending.

**Option C: Escalate to manual implement (escape hatch)** → `$wf implement <slug> <selected-slice>`
Use when: remaining issues need design rethink, multi-file restructuring, or input verify cannot supply — re-invoking verify would just escalate again.

**Option D: Skip review, go to Handoff** → `$wf handoff <slug> <selected-slice>`
Use when: solo project, change was already externally reviewed, or trivial fix where review adds no value. Only when `result: pass`.

**Option E: Revisit Plan** → `$wf plan <slug> <selected-slice>`
Use when: verification revealed a fundamental flaw in the approach — the plan needs rethinking (dominates Option C when the issue is "wrong approach" rather than "wrong code").

**Option F: Re-verify in a capable environment, or apply a deferral** → `$wf verify <slug> <selected-slice>` (re-run) OR amend with `interactive-verification: deferred`
Use when: `result: blocked-runtime-evidence-missing` and the fix loop could not produce missing evidence. Either move to an environment that supports the interactive checks, or annotate with a deferral reason. Deferrals do not block review or handoff but block ship. A deferral is only lawful over a *probed* incapability (see the escape hatch's attempt-before-declare rule) and is unavailable for criteria listed in `constraint-resolution-missing:` — those route to Option E.

**Option G: Slug-wide runtime probe** → `$wf probe <slug>`
Use when: Per-slice verify passed, but you want a slug-wide runtime sweep against the running artifact (e.g., to catch cross-slice integration breakage). Probe is the backward re-entry counterpart to the per-slice interactive gate — it observes the whole artifact, not one slice's surface.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

# User-observable AC gate (MANDATORY)

This gate closes the "verified but actually broken" leak. It runs in Step 7.5. The rule: **runtime evidence is required for every user-observable AC. No evidence, no pass.**

## Partitioning AC into code-only vs user-observable

Read every AC entry from `03-slice-<slice-slug>.md` (or the compressed-mode equivalent — see Step 0.4 source-mode rules). For each AC entry, apply this two-step rule:

**Authoring note (for `$wf slice` authors):** The `observable:` annotation is the only mechanism to correct a heuristic miscall, and must be set at slice-authoring time. Tag ambiguous criteria with `<!-- observable: true -->` or `<!-- observable: false -->` immediately after the criterion text. Criteria that name an internal function but whose outcome is user-visible MUST be tagged `observable: true`; criteria describing a user-visible outcome fully covered by an existing automated assertion may be tagged `observable: false`. When in doubt, omit the tag and let the heuristic run — tag it now only if a miscall would block verify.

**Step A — explicit override wins.** If the AC entry carries an `observable: true | false` annotation (inline tag or comment in the slice file), that value is final. Authors use this to correct heuristic miscalls.

**Step B — heuristic when unannotated.** When the AC entry has no `observable` annotation, the gate considers it user-observable when any of the following hold:
- It names a visible surface (screen, page, route, view, panel, dialog, command output).
- It names a user action (click, tap, type, submit, run, invoke, navigate).
- It declares an observable post-condition (renders, appears, displays, returns, prints, succeeds, redirects).

Criteria that fail all three checks are treated as `code-only` (e.g., "the new util function handles null inputs") and the interactive gate does not fire for them.

Record the partition under `## Acceptance Criteria Status` — every AC entry has a `kind: code-only | user-observable` column so reviewers can see which criteria the gate evaluated.

## Matching user-observable AC against interactive evidence

For each `user-observable` AC, look in the sub-agent 3 results for a matching `interactive-verification-results` entry. Match by AC id (when AC entries carry ids) or by quoted text overlap (sub-agent 3 records the criterion text it drove).

- **Matched, result: pass** → AC counts as met.
- **Matched, result: fail** → AC counts as not met. `## Issues Found` lists the failure.
- **Matched, result: partial** → AC counts as partially met. List the gap.
- **Not matched** → AC has no runtime evidence. The gate refuses `result: pass` for the slice.

## Result writeback

After matching:

| Condition | `result:` value to write |
|---|---|
| All AC met (code-only via test suites, user-observable via interactive evidence) | `pass` |
| At least one user-observable AC has no matching interactive evidence AND no deferral annotation | `blocked-runtime-evidence-missing` |
| At least one AC fails or is partial, but every user-observable AC has runtime evidence (positive or negative) | `fail` or `partial` |

`blocked-runtime-evidence-missing` is distinct from `fail`: the failure is procedural (evidence not produced) rather than substantive (AC shown unmet). Routing differs — `fail` → `$wf implement`; `blocked-runtime-evidence-missing` → re-run verify in a capable environment or apply a deferral annotation.

**Write-time enforcement (post-write-verify gate — the R7 backstop).** These result rules are not honor-system. The `post-write-verify` hook **HARD-BLOCKS** a `verify` artifact whose `result: pass` contradicts its evidence: `metric-acceptance-met < metric-acceptance-total`, or `interactive-verification: deferred`. It also **forbids** the invented `metric-acceptance-unverified-interactive` field (use the deferral hatch instead), and **warns** when shadow-deferral prose ("deferred to user/manual", "UNVERIFIED-INTERACTIVE", "will be verified during `<slice>`", "decidable by static reasoning") co-occurs with `result: pass`. Reconcile `result` with the evidence or take the `partial` + deferral path. (Opt out per-repo with `hooks.verifyResultGate: false` / `hooks.verifyDeferralLint: false`, default is on.)

## Escape hatch — `interactive-verification: deferred`

A deferral is a **last resort that must be paid for**: it is honest only AFTER the constraint-resolution ladder (runtime-adapters.md) has been climbed and each rung's outcome recorded. Defer only the residual that no rung can reach.

**The defer-reason MUST enumerate the rungs tried — a defer-reason that names no attempted rung is rejected.** Replace "no Android emulator/device" with "Robolectric covers the state machine (9/9); Roborazzi golden covers the visual; AVD boot attempted (failed: HAXM unavailable); residual = live multi-touch pointer routing." Bare phrases — "no emulator", "no creds", "deferred to user", "decidable by static reasoning" — are not acceptable defer-reasons; each must show the ladder was climbed first.

**Attempt before declare (positive-evidence capability probes).** "The environment cannot produce X" may be written ONLY after *executing* a capability probe and recording its literal command + output tail in the artifact — `firebase projects:list` / `gcloud auth application-default print-access-token` for deploy credentials, `adb devices` for devices, an env-var presence check for keyed services, one spec run past the guard for credential-gated suites. A defer-reason asserting incapability with no recorded probe is invalid. Read-only probes are always allowed unprompted; anything that consumes quota or sends traffic follows the ladder's pre-authorization rule.

**A skipped-guard sweep is an error, not a deferral.** When an interactive suite runs and every spec exits via a credential/environment guard (0 specs executed), the criterion is `blocked-runtime-evidence-missing` with the guard's unmet precondition named ("set `E2E_ADMIN_USER_EMAIL`/`_PASSWORD` and re-run") — NEVER `interactive-verification: deferred`. Deferral is reserved for evidence no reachable rung can produce.

To proceed without a hard fail once the residual is genuinely environment-bound, the slice author may add to the per-slice verify file frontmatter:

```yaml
interactive-verification: deferred
interactive-verification-defer-reason: "<rungs tried + the residual that survives them — not a bare 'no device'>"
```

When this annotation is present:
- The gate writes `result: partial` (not `pass`) with a note that runtime evidence was deferred.
- The deferral is appended to `00-index.md` under `runtime-evidence-deferrals` (see schema below).
- `$wf review` and `$wf handoff` proceed with a soft warning; `$wf ship` HARD-BLOCKS until every deferral is cleared by a subsequent `$wf probe` run or by re-running verify in a capable environment.

**Decision (recorded in plan §2.4):** No silent skip. Every deferral is named, dated, and surfaces in the slug's progress view and dashboard. The block bites at ship, not earlier, so work legitimately waiting on an environment is not stalled mid-pipeline.

## 00-index.md additions for deferrals

When a slice's verify writes a deferral, append to the workflow index:

```yaml
runtime-evidence-deferrals:
  - slice: <slice-slug>
    reason: "<verbatim defer-reason>"
    deferred-at: "<iso-8601>"
    cleared-by: null    # set to <probe-descriptor> when a probe run clears the deferral
    repeat-of: <slice-slug>   # ONLY when this deferral's constraint matches an earlier entry — see below
```

**Repeat-deferral marker.** Before appending, scan `runtime-evidence-deferrals` for an entry naming the *same environment dependency* (fuzzy match — same credential gate, device class, missing service). On a match, append `repeat-of: <slice-slug of the first occurrence>`: the accumulation becomes visible in the artifact, `$wf status`, and the dashboard instead of hidden across per-slice records. A wall hit a second time is plan's tripwire — the next plan for this slug MUST either scope the harness that retires it or record `harness-declined: <reason>` (see plan.md's repeat-deferral tripwire).

`$wf status` and `$wf ship` read this list. `$wf ship` refuses to start while any entry has `cleared-by: null`.

# Verify-owned fix loop (MANDATORY — single round, user-gated)

This loop lets `$wf verify` finalize a passing or substantively-blocked artifact without bouncing the user to `$wf implement` for routine fixes. It runs in Step 7.6, AFTER all checks (Step 4) and the user-observable AC gate (Step 7.5) have produced an issue inventory. Bounded to **one round** — re-runs require the user to re-invoke `$wf verify`. Conforms to [_fix-loop.md](_fix-loop.md); everything below is verify-specific parameterization.

## Inputs to the loop

Aggregate the issue list:
- Every check that failed from Step 4.
- Every AC marked not met from Step 5.
- Every user-observable AC the gate refused for missing runtime evidence (Step 7.5).
- Every augmentation re-check that failed (mock fidelity, signal coverage, experiment wiring, benchmark regression).

Record the count as `metric-issues-found-initial`. If the count is **zero**, set `fix-rounds-run: 0`, `convergence: not-needed`, and skip the rest of this section.

## Triage protocol

For each issue, ask the user in chat as a short numbered list. Batch up to 4 issues per message. Each issue:
- Identify: issue type, one-line summary, file:line or check name.
- Options:
  1. Fix — Spawn a sub-agent to apply the minimal patch in this run.
  2. Skip — Leave as-is; surfaces in the verify artifact under Issues Found.
  3. Escalate — Out of scope for verify — route to `$wf implement` or back to plan.

Triage is **always required** — verify never silently auto-fixes. If the user picks `Skip` for everything, the loop ends with `convergence: not-needed` and the failures stay recorded.

## Fix dispatch (single round)

For each issue triaged `Fix`, sequentially (one at a time):
1. Spawn ONE sub-agent with this prompt:
   ```
   Fix the following verify-stage issue in the codebase:

   Issue ID: {ID}
   Type: {check-failure | unmet-ac | runtime-evidence-missing | augmentation-regression}
   Location: {file:line OR check-name}
   Observation: {raw output or AC criterion text}
   Suggested fix: {one-line suggestion, if any}

   Read the file(s) at the specified location. Understand the issue.
   Apply the minimal fix that resolves the issue without introducing
   new problems. Do NOT change anything beyond what is needed for this
   specific issue. Do NOT refactor.

   Regression test (REQUIRED for code bugs): if this issue is a code
   bug — not a lint/format, config, tooling, or docs finding — add a
   MINIMAL regression test that fails before your patch and passes
   after it. Write the test first when the check that caught the issue
   is re-runnable. If a regression test is genuinely not possible,
   state why in one line; the orchestrator records it as an exemption.
   Never weaken, delete, or skip an existing test to make a check
   pass — that is the one forbidden test edit.

   Return a brief summary of what you changed, including the regression
   test path (or the one-line exemption reason).
   ```
2. When the sub-agent returns: read the changed file(s); sanity-check the patch addresses the issue without obviously breaking sibling code. If correct, accept. If wrong, discard and record `COULD NOT FIX`.

## Re-check (single round)

After every `Fix` sub-agent has returned, re-run ONLY the checks whose original failures were triaged `Fix`:
- If lint was the only failing check and was triaged Fix → re-run lint.
- If a specific test file was the failure → re-run just that test file (or the smallest suite that covers it).
- If an AC was unmet for a code reason → re-evaluate the AC against the patched code (or re-run the relevant interactive adapter for user-observable AC).
- If an AC was unmet for missing runtime evidence → re-run the adapter capture for that AC.

Do NOT re-run unrelated checks. Do NOT re-run `Skip` or `Escalate` issues' checks.

Compute `metric-issues-found-final` over the post-fix state.

## Convergence verdict

| Condition | `convergence:` | `result:` (after the gate of Step 7.5 is re-applied to the post-fix state) |
|---|---|---|
| `metric-issues-found-initial == 0` | `not-needed` | unchanged from gate verdict |
| `metric-issues-found-final == 0` AND no `Escalate` decisions | `converged` | `pass` (unless deferral keeps it at `partial`) |
| `metric-issues-found-final > 0` OR any `Escalate` decision | `escalated` | gate's verdict over the post-fix state (`fail`, `partial`, or `blocked-runtime-evidence-missing`) |

When `convergence: escalated`:
- Adaptive routing surfaces "Option B: Re-invoke `$wf verify` to attempt another fix round" and "Option C: `$wf implement` (manual escape)" — never auto-loop.
- The `## Issues Found` body lists the still-broken issues with their triage decision attached (`Skip` and `Escalate`, plus any `Fix` that the sub-agent could not resolve).

## Commit (only when fixes landed AND re-check passed)

If at least one `Fix` sub-agent successfully modified files **AND all re-checks for `Fix`-triaged issues passed**: follow the shared commit discipline ([_fix-loop.md](_fix-loop.md) rule 7) with message `fix(<slug>): verify-time fixes for <slice-slug>`, and record the SHA in `## Verify-Owned Fixes`.

**Do NOT commit if any `Fix`-triaged re-check still fails.** Record `convergence: escalated`, leave the working tree as-is, and route the user to re-invoke verify. A commit that does not resolve its issue must not enter git history.

## Fix Status table (in artifact body)

The verify artifact gains a `## Verify-Owned Fixes` section when `fix-rounds-run > 0`:

```
## Verify-Owned Fixes

| ID | Type | Triage | Sub-agent outcome | Regression test | Re-check result |
|----|------|--------|-------------------|-----------------|-----------------|
| {ID} | {issue-type} | Fix / Skip / Escalate | Patched / Could not fix / N/A | <path> / exempt: <reason> / n-a | Pass / Still failing / Not re-run |

Commit: <SHA or "(no commit — branch-strategy: none)" or "(no files changed)">
Regression tests added: <N>
```

Record `regression-tests-added: <N>` in frontmatter. A **code-bug** fix whose row shows neither a regression-test path nor an exemption reason is a finding — append to `## Issues Found` as MED (`fix landed without its regression test`). Lint/format, config, tooling, and docs fixes are exempt (`n-a`).

# Verify artifact schemas

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
next-invocation: "$wf review <slug> <slice-slug>"
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
result: <pass|fail|partial|blocked-runtime-evidence-missing>
metric-checks-run: <N>
metric-checks-passed: <N>
metric-acceptance-met: <N>
metric-acceptance-total: <N>
metric-acceptance-user-observable: <N>          # count of AC partitioned as user-observable
metric-acceptance-code-only: <N>                # count partitioned as code-only
metric-interactive-checks-run: <N>
metric-interactive-checks-passed: <N>
metric-issues-found: <N>                        # final count (== metric-issues-found-final)
metric-issues-found-initial: <N>                # snapshot BEFORE the fix loop
metric-issues-found-final: <N>                  # snapshot AFTER the fix loop (== metric-issues-found)
fix-rounds-run: <0 | 1>                          # 0 if no issues OR no Fix triage decisions; 1 if the loop ran
convergence: <not-needed | converged | escalated>
verify-owned-fix-commit: "<SHA | null>"         # null if no fixes landed, re-check still failed, or branch-strategy: none
regression-tests-added: <N>                     # regression tests added by Fix sub-agents; a code-bug fix with neither a test nor an exemption is a MED finding
constraint-resolution-missing: []               # user-observable AC whose plan-named env dependency has no constraint-resolution: line; deferral hatch unavailable — route to $wf plan
interactive-verification: <required | deferred | not-applicable>
interactive-verification-defer-reason: "<string>"  # required when interactive-verification == deferred
adapters-used: [<key>, ...]                     # which runtime adapters were driven
bootstrap-failures: []                          # list of {adapter, step, remediation} from sub-agent 3
evidence-dir: ".ai/workflows/<slug>/verify-evidence/<slice-slug>/"
evidence-run-count: <N>                         # 1 for first run; increments on re-invocations; prior evidence archived to <slice-slug>-run-<N-1>/
security-scan-result: <pass | fail | skipped>  # BLOCKER if fail; skipped only when no tooling installed
metric-a11y-violations-new: <N>                # new WCAG AA violations in slice-modified UI components
a11y-result: <pass | fail | not-automatable>   # HIGH issue if fail; not-automatable surfaces as a gap
cross-slice-regressions-found: <N>             # sibling slices that newly fail after this slice's changes; 0 if first slice
metric-bundle-size-delta-pct: <N | "skipped">  # % change in output artifact size vs. base branch; HIGH if ≥ 20%
ac-staleness-checked: <true | false>
ac-stale-count: <N>                            # AC entries referencing external APIs/schemas that have changed
longitudinal-baseline-compared: <true | false | "skipped — stash non-empty">
stability-check-flaky-count: <N>               # criteria that differed across 3 stability drives; >0 is HIGH
adversarial-tests-run: <N>
adversarial-tests-failed: <N>                  # BLOCKER/HIGH adversarial findings
failure-mode-probes-run: <N>
cross-browser-delta: <"none" | "findings">     # HIGH if findings; detail in ## Cross-Browser Delta section
web-vitals-lcp-ms: <N | null>                  # Largest Contentful Paint; null if non-web
web-vitals-cls: <N | null>                     # Cumulative Layout Shift
web-vitals-inp-ms: <N | null>                  # Interaction to Next Paint; HIGH if > 200 ms
tags: []
refs:
  index: 00-index.md
  verify-index: 06-verify.md
  slice-def: 03-slice-<slice-slug>.md
  plan: 04-plan-<slice-slug>.md
  implement: 05-implement-<slice-slug>.md
  review: 07-review-<slice-slug>.md
  adapters: runtime-adapters.md
next-command: wf-review
next-invocation: "$wf review <slug> <slice-slug>"
---
```

**`result` field semantics:**
- `pass` — every AC met; every user-observable AC has matching interactive evidence (or every user-observable AC is annotated as deferred).
- `fail` — at least one AC is substantively not met (the code is wrong).
- `partial` — at least one AC is partially met OR `interactive-verification: deferred` is set on at least one user-observable AC.
- `blocked-runtime-evidence-missing` — at least one user-observable AC has no matching interactive evidence AND no deferral annotation. This is procedural failure, not substantive failure; the routing recommendation differs from `fail`.

**`interactive-verification` field semantics:**
- `required` (default) — slice has at least one user-observable AC; runtime evidence was produced for all of them.
- `deferred` — slice has at least one user-observable AC; environment could not support runtime evidence for at least one; `defer-reason` MUST be set.
- `not-applicable` — slice has no user-observable AC; the gate did not apply.

# Verify: <slice-name>

## The Verification
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Voice per `_narrative-voice.md` — no "This verification implements…" openings. 1–4 short paragraphs. -->

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
For each criterion, record:
- **criterion**: quoted text or id
- **kind**: `code-only` | `user-observable` (from the partition rule)
- **status**: met / partially met / not met / unverified / runtime-evidence-missing
- **verification method**: automated (test suite) / interactive (runtime adapter) / manual
- **evidence**: test output / screenshot path / response capture / console output / "(none — runtime evidence missing)"

The `kind` column is what makes the user-observable AC gate auditable. A reviewer reading the verify report can see at a glance which criteria the gate evaluated and which it skipped.

## Issues Found
- severity: issue

## Augmentation Verification (only if `02c-craft.md` or `augmentations:` list is non-empty)
- **Mock fidelity items** (from `02c-craft.md`): <N honored / <N deviations / <N unhonored>
  - <item>: <pass/fail> at <file:line>, evidence: <screenshot path or test output>
- **Per-augmentation re-checks** (one row per `augmentations:` entry):
  - <type> (artifact: <path>): <pass/regression>, evidence: <path>
- **Outstanding design findings** (from `07-design-audit.md` / `07-design-critique.md`): <N critical / <N high>
  - <finding>: <resolved/outstanding>
- **Instrumentation signal coverage** (from `04b-instrument.md`): <N firing / <N missing>
- **Experiment wiring** (from `04c-experiment.md`): <pass/fail> — flag, cohort, metrics, rollback
- **Benchmark compare-mode delta** (from `05c-benchmark.md`): <within tripwires / regression>

## Security Scan
- **CVE scan:** `<tool>` — `<pass | fail | skipped>`, `<N>` new critical/high CVEs introduced by this slice
- **Secret detection:** `<pass | fail | skipped>`, findings: `<none | list>`
- **SAST:** `<pass | fail | skipped>`, new HIGH+ findings in slice-modified files: `<N>`

## Accessibility Gate
- **Tool used:** `<axe-core | not-automatable | none>`
- **New WCAG AA violations in slice-modified components:** `<N>`
- Per-violation: `<rule-id>`: `<element>` — `<description>`

## Performance Gate
- **Bundle size delta:** `<+N% | -N% | skipped — stash non-empty>` (HIGH if ≥ +20%)
- **Build time delta:** `<+N% | -N% | not-measured>`
- **Cold-start delta (service/CLI only):** `<+N% | -N% | not-applicable>`

## Cross-Slice Regression
- **Sibling slices checked:** `<list or "none — first slice">`
- **Regressions found:** `<N>`
- Per regression: `<sibling-slug>` — `<test-suite>`: `<failure summary>`

## Longitudinal Delta
For each criterion surface, comparison between baseline (base branch or prior evidence run) and current:
- **Surface**: `<route / screen / command>`
- **Baseline source**: `<prior evidence run N | base branch screenshot | skipped>`
- **Visual delta**: `<none | description of change>`
- **Interpretation**: `<expected change from this slice | unexpected — flagged>`

## Friction Notes
Perceptual observations and product-convention divergences recorded independently of AC pass/fail. Informational — not issues unless explicitly escalated.
- `<observation>`

## Free Exploration Notes
Observations from open-ended exploration beyond the AC list:
- `<finding>` — `<informational | escalated to issue: <severity>>`

## Adversarial Tests
Results of the fixed adversarial micro-test set:
| Test | Result | Finding |
|---|---|---|
| Empty submission | pass / fail / n-a | |
| Max-length input | pass / fail / n-a | |
| Double-click / rapid repeat | pass / fail / n-a | |
| Mid-flow interruption | pass / fail / n-a | |
| Offline / network failure | pass / fail / n-a | |

## Failure Mode Probes
Results of boundary condition probes beyond the happy path:
| Probe | Result | Finding |
|---|---|---|
| Slow response (Fast 3G) | pass / fail / n-a | |
| Concurrent session | pass / fail / n-a | |
| Session expiry mid-flow | pass / fail / n-a | |

## Cross-Browser Delta
Web-only. Results of re-driving AC in a second browser after primary verification:
- **Primary browser**: `<Chromium | other>`
- **Secondary browser**: `<Firefox | WebKit>`
- **Divergences found**: `<N>` — list any layout breakage, missing elements, or rendering differences

## Web Vitals
Web-only. Core Web Vitals captured via Chrome DevTools Protocol during the primary drive:
- **LCP** (Largest Contentful Paint): `<N ms>` — good < 2500 ms
- **CLS** (Cumulative Layout Shift): `<score>` — good < 0.1
- **INP** (Interaction to Next Paint): `<N ms>` — HIGH if > 200 ms; good < 200 ms

## Gaps / Unverified Areas
- ...

## Freshness Research

## Recommendation

## Recommended Next Stage
- **Option A:** `$wf review <slug> <slice-slug>` — converged or no issues; ready for review [reason]
- **Option B:** `$wf verify <slug> <slice-slug>` — escalated; re-invoke for a second fix round [reason, only if applicable]
- **Option C:** `$wf implement <slug> <slice-slug>` — escape hatch; remaining issues need manual implement [reason, only if applicable]
- **Option D:** `$wf handoff <slug> <slice-slug>` — skip review [reason, if applicable]
- **Option E:** `$wf plan <slug> <slice-slug>` — plan needs rethinking [reason, if applicable]

---

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
