---
description: Verify that the selected slice meets acceptance criteria and is ready for review.
argument-hint: <slug> [slice]
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
| Conditional inputs (mandatory when present) | `02c-craft.md` (mock fidelity inventory MUST be re-verified), `04b-instrument.md` (signals MUST fire), `04c-experiment.md` (flag/cohort/metrics MUST work), `05c-benchmark.md` baseline (compare-mode re-run REQUIRED), `augmentations:` list in `00-index.md` (every entry MUST trigger a type-specific re-check — see Step 0.6) |
| Produces | `06-verify-<slice-slug>.md` + updates `06-verify.md` master |
| Next | `/wf review <slug> <selected-slice>` (when `convergence: not-needed` or `converged` and `result: pass`). When `convergence: escalated`: re-invoke `/wf verify <slug> <selected-slice>` for a second round, or escalate to `/wf implement <slug> <selected-slice>` as a manual escape. |
| Skip-to | `/wf handoff <slug> <slice>` if review is unnecessary (solo project, trivial change, already peer-reviewed externally) — only valid when `result: pass`. |

# CRITICAL — execution discipline
You are a **workflow orchestrator that owns its own triage→fix loop**.
- You run checks and compare results against acceptance criteria. You do NOT improvise fixes while checks are running.
- After all checks and the user-observable AC gate finish (Step 7.6), you own a **single-round, user-gated fix loop**: every failing check and every unmet AC is triaged via `AskUserQuestion` (Fix / Skip / Escalate), and `Fix` choices spawn sub-agents that apply the minimal patch. You re-run only the affected checks once, then finalize the artifact.
- ONE round only. If anything still fails after that round, write `convergence: escalated` and route the user to re-invoke `/wf verify` or to `/wf implement` as a manual escape — **do not loop again in this invocation**.
- Do NOT review, handoff, or ship — those are later stages.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps. The fix loop only runs in Step 7.6, never before checks complete.
- Your only output is the workflow artifacts, the dispatched fix sub-agents, and the compact chat summary defined below.
- If you catch yourself about to start fixing code outside the Step 7.6 sub-agent dispatch, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Resolve the slice-slug**: If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
4. **Determine workflow source mode** from `00-index.md` `workflow-type`:
   - `workflow-type: quick` → **compressed mode**. Source: `01-quick.md` (acceptance criteria + plan in single doc) + `05-implement.md`. No per-slice files.
   - `workflow-type: rca` / `investigate` → **forwarded mode**. Source: `01-rca.md` / `01-investigate.md` (rich context) + synthesized `02-shape.md` + `05-implement-<slice-slug>.md` if planning ran.
   - `workflow-type: fix` / `hotfix` / `refactor` → **change-mode (compressed standard lifecycle).** Source: the **un-suffixed single-slice** standard files (`03-slice.md`, `04-plan.md`, `05-implement.md`) + the lead `01-<mode>.md` (`01-fix.md` / `01-hotfix.md` / `01-refactor.md`). Exactly **one** slice; `selected-slice` is its slug. Verify exactly as **standard mode** but use the un-suffixed filenames wherever a step names a `-<slice-slug>`-suffixed file. (For hotfix, focus on reproducing the incident symptom + the regression suite. For **refactor**, run the full baseline comparison from `02-shape.md` — re-run the baseline suite, check every `## Public API Surface` name still exists with the same signature, verify all callers still work; any unplanned deviation is a FAIL.)
   - `workflow-type: update-deps` → **self-managed.** update-deps self-authors `06-verify.md` inside its own flow; it should NOT use `/wf verify`. STOP and direct the user back to `/wf intake update-deps <slug>`.
   - `workflow-type: feature` (default) or unset → **standard mode**.
5. **Check prerequisites by mode:**
   - **Compressed mode**: `05-implement.md` (or `05-implement-<slice-slug>.md` if a slice was added) must exist. Acceptance criteria source is `01-quick.md`.
   - **Forwarded mode**: `05-implement-<slice-slug>.md` (or `05-implement.md`) must exist. Acceptance criteria source is the synthesized `02-shape.md` plus the rich `01-rca.md` / `01-investigate.md`.
   - **Change-mode** (`fix` / `hotfix` / `refactor`): the un-suffixed `05-implement.md` must exist. Acceptance criteria source is `03-slice.md` + `01-<mode>.md` (refactor: also the `02-shape.md` baseline).
   - **Standard mode**: `05-implement-<slice-slug>.md` must exist.
   - All modes: if implement record shows `Status: Awaiting input` → STOP.
   - If `06-verify-<slice-slug>.md` (or `06-verify.md` in compressed mode) already exists → WARN: "This has already been verified. Running again will overwrite. Proceed?"
   - **Stack gate (do NOT silently re-detect):** Inspect the `stack:` block in `00-index.md` and `stack-source` in `04-plan-<slice-slug>.md` (standard/forwarded modes).
     - If `stack:` is **missing entirely** → STOP. Tell the user: "Step 0.5 stack fingerprint is missing from `00-index.md`. Verify's interactive sub-agent (functional sub-agent 3) needs the PO-confirmed stack to pick adapters and companion skills. Re-run `/wf intake <slug>` to capture it before verifying." Verify must NOT re-detect — sub-agent 3 below constrains adapter matching against `stack.platforms`, so detection alone is insufficient evidence of intent.
     - If `stack.user-confirmed: false` → **HARD GATE — do not proceed silently.** Call `AskUserQuestion` with header `"Stack unconfirmed"` and question `"stack: was auto-detected but the PO never confirmed it. Sub-agent 3 will run against unconfirmed tooling — adapter selection may be wrong. Options: (1) Stop and re-run intake Batch B to confirm the stack first. (2) Proceed with unconfirmed stack — verify will stamp result as weak-provenance and review/ship may refuse it."` Options: `Stop (recommended)` / `Proceed with unconfirmed stack`. If the user chooses Stop → STOP. If the user explicitly chooses Proceed → set `stack-source: unconfirmed-auto-detect` in the verify slice frontmatter AND surface it under `## Caveats`. Never auto-proceed.
     - If `04-plan-<slice-slug>.md` carries `stack-source: unconfirmed-auto-detect` → propagate the same warning and frontmatter stamp. Verification inherits the plan's stack provenance — if the plan was built on weak truth, the verify report says so.
     - If `stack.user-confirmed: true` and plan agrees → proceed. Sub-agent 3 MUST intersect matched adapters with `stack.platforms`; companion skills used for evidence MUST come from `stack.available-skills`.
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
   `02c-craft.md` — **if the file exists you MUST read it** — extract `## Mock fidelity inventory`. Each item is an additional acceptance criterion that verify must check. Cross-reference `05-implement-<slice-slug>.md` → `## Visual Contract Honored` to confirm each item was honored in code.

   Read the `augmentations:` list in `00-index.md`. For each entry, read the referenced artifact and apply the type-specific re-check:

   | Type | Re-check during verify |
   |---|---|
   | `design-<sub>` | Read `design-notes/<sub>-<timestamp>.md` → `## Verification needed`. Re-run those specific checks (e.g., `harden` → re-run a11y; `optimize` → re-run perf; `adapt` → re-run responsive across breakpoints). |
   | `design-audit` | Read `07-design-audit.md`. Re-check that all "critical" or "high" findings have been resolved in code. |
   | `design-critique` | Read `07-design-critique.md`. Note any prescriptive feedback that should have been actioned. |
   | `instrument` | Read `04b-instrument.md`. For each designed signal, confirm the implementation actually emits the log/metric/trace. Run the affected code path and observe the signal fires (live or via tests). Report any missing signals. |
   | `experiment` | Read `04c-experiment.md`. Confirm: (a) feature flag is wired correctly; (b) cohort split logic produces the documented distribution; (c) primary/secondary/guardrail metrics fire on the expected events; (d) rollback path works. |
   | `benchmark` (status: baseline) | Run `/wf benchmark <slug>` in compare mode. Compare results against the baseline numbers in `05c-benchmark.md`. Flag regressions exceeding the documented tripwires (>10% CPU / >25% memory by default). |
8. **Carry forward** `open-questions` from the index.
9. **Branch check:** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy` is `dedicated`, confirm you are on the correct branch (`git branch --show-current`). If not, switch to it. Verification must run against the implementation branch, not the base branch.

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

**Default performance gate (MANDATORY — runs on every slice, even without the `benchmark` augmentation):**
- **Bundle size (web):** If a build was produced, compare the output artifact size against the base branch: `git stash && npm run build && du -sh dist/ && git stash pop && npm run build && du -sh dist/`. A size increase ≥ 20% in any chunk is a HIGH issue. Record `metric-bundle-size-delta-pct`.
- **Build time delta:** Record the wall-clock time of the current build vs. the base branch build (from git stash comparison above if run, otherwise from CI cache statistics). A build time increase ≥ 30% is a WARN.
- **Startup time (service/CLI):** If the adapter is `service` or `cli`, measure cold-start time (`time curl -s localhost:<port>/health` after a fresh start). A cold-start increase ≥ 15% vs. the base branch is a HIGH issue.
- Skip the base-branch comparison if `git stash` would destroy in-progress work (check `git stash list` first; if non-empty, record `metric-bundle-size-delta-pct: skipped — stash non-empty` and proceed). In that case, still record the absolute artifact size.
- This gate is **separate from** the `benchmark` augmentation. The augmentation adds detailed profiling; this gate adds a lightweight size/startup floor that runs every time.

**Security scanning (MANDATORY — runs on every slice):**
- **Dependency CVEs:** Run `npm audit --audit-level=high`, `cargo audit`, `pip-audit`, `go list -json -m all | nancy sleuth`, or the project's equivalent. Report: count of critical/high CVEs in files this slice changed vs. pre-existing. New CVEs introduced by this slice are BLOCKER issues.
- **Secret detection:** Run `git diff <base-branch>...HEAD | trufflehog --stdin` or `gitleaks detect --source=. --log-opts="<base>..<head>"` if available; otherwise grep the diff for patterns matching API key, secret, password, token, credential assignments in string literals. Any finding is a BLOCKER.
- **SAST (if tooling is present):** Run `semgrep --config=auto` on files this slice touched if semgrep is installed. Report new findings in slice-modified files at severity HIGH or above.
- Report: `security-scan-result: pass | fail | skipped` (skipped only when no tooling is installed and no patterns matched). New findings introduced by the slice are BLOCKER issues regardless of convergence verdict.

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

**Cross-slice regression check (MANDATORY when sibling slices have been verified):**
- Read `06-verify.md` (master verify index). Collect every `slice-slug` listed with `result: pass` or `result: partial` that is NOT the current slice.
- For each sibling slice, identify its `files-modified` list from `05-implement-<sibling-slug>.md`. If any sibling's files overlap with the current slice's `files-modified`, flag the sibling as a potential regression target.
- Re-run the test suite scoped to the overlapping files (or the sibling's recorded test command from its `06-verify-<sibling-slug>.md` `## Automated Checks Run` section).
- Report: `cross-slice-regressions-found: <N>`, list of sibling slices re-checked, pass/fail per sibling. Any sibling that newly fails is a BLOCKER issue.
- If no sibling slices exist (first slice), record `cross-slice-regressions-found: 0` and note "no prior verified slices."

### Functional sub-agent 3 — Interactive & Runtime-Truth Verification

**This sub-agent is MANDATORY when the slice's AC contains any user-observable criterion** (see Step 6.5 — User-observable AC gate). It is how you verify the feature **actually works the way a human would experience it** — automated tests prove code correctness, but interactive verification proves the user-visible behavior. A slice cannot transition to `result: pass` if a user-observable AC has no matching interactive evidence.

**Platform recipes live in the adapter registry**, not inline:

> Read `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/runtime-adapters.md` and follow the recipe for every adapter whose detection signals match the repo (web / android / ios / cli / desktop / service / notebook / etc.). Adapter selection is documented at the top of that file.

Prompt the agent with ALL of the following:

0. **Read product context before driving (MANDATORY — Gap 11 fix).** Before matching adapters or driving any criterion, build a mental model of product conventions so that observations can be held against them:
   - Read `PRODUCT-CONTEXT.md` or `docs/product-conventions.md` at repo root if either exists.
   - Read `02b-design.md`, `02c-craft.md`, `07-design-audit.md`, `07-design-critique.md` if present — extract any prescriptive UI/UX norms.
   - Grep the codebase for the 3 most similar existing components to the surface being verified (by component name or route). Read them for visual and interaction conventions.
   - Read the git log for the top 5 files this slice modified (`git log --oneline -10 -- <file>`) to understand the component's history and prior reviewers' concerns.
   - Synthesize a one-paragraph "product conventions" note. Hold all observations during the drive against these conventions — not just against the criterion text. Record divergences from convention under `## Friction Notes` even when the criterion is technically met.

1. **Match adapters — constrained by confirmed stack.** Run every adapter's detection signal against the repo. Then **intersect the matches with `stack.platforms`** from `00-index.md`:
   - If `stack.user-confirmed: true` → the effective adapter set is `matched-adapters ∩ stack.platforms`. If detection finds a platform NOT in `stack.platforms` (e.g., an incidental `package.json` in an Android repo), exclude it — the PO did not confirm that surface as in-scope. Record the exclusion under `## Caveats` so the report explains why the adapter was skipped.
   - If `stack.user-confirmed: false` OR `stack-source: unconfirmed-auto-detect` → run all matched adapters but stamp each evidence record with `stack-confirmed: false`. The verify report's `## Caveats` section MUST state that adapter selection was not PO-confirmed.
   - If `stack.platforms` is empty after intersection → record `bootstrap-failure: { adapter: none, step: stack-intersection, remediation: "Confirmed stack lists no platforms matching repo detection. Re-run /wf intake to reconcile." }` and skip to teardown. Do NOT pick a default adapter to fill the gap.
   - Multi-match (e.g., web + service) is common and must be driven when both are in `stack.platforms`. Record the final adapter keys under `adapters-used:` in the verify report.
2. **Bootstrap each matched adapter** per its `Bootstrap` section. If any bootstrap step fails after the adapter's documented resolution attempts, the sub-agent reports `bootstrap-failure: { adapter, step, exit-code, output-tail, remediation }` and does NOT proceed past bootstrap for that adapter. The user-observable AC gate (Step 6.5) will then refuse `result: pass` and require either an `interactive-verification: deferred` annotation with a reason, or a remediation pass via `/wf probe` once the environment is repaired.

2b. **Capture longitudinal baseline before driving (MANDATORY — Gap 3 fix).** Before driving any criterion on the current branch, capture before-state screenshots for each surface named in the AC:
   - Check whether a prior evidence run exists at `.ai/workflows/<slug>/verify-evidence/<slice-slug>-run-*/`. If prior evidence exists, read those screenshots as the before-state — no git stash needed.
   - If no prior evidence exists, stash current changes (`git stash --include-untracked`), boot the adapter against the base branch, screenshot each named surface, then restore (`git stash pop`). Store these as `baseline-<surface>.png` in the evidence directory.
   - If stashing would destroy in-progress work (check `git stash list` first), skip the baseline capture and record `longitudinal-baseline-compared: skipped — stash non-empty`.
   - During the drive phase, compare each criterion's post-drive screenshot against its baseline. Report visual deltas (layout changes, missing elements, new elements, color or typography shifts) under `## Longitudinal Delta` for each criterion. A delta is informational — it is only a finding if it contradicts the criterion or product conventions.

3. **For each user-observable AC**, follow the adapter's `Drive` and `Observe` recipes, with these mandatory extensions:

   **a. Multi-point evidence capture (Gap 12 fix):** Do not capture only the final settled state. For each criterion drive, capture evidence at three distinct moments: the initial response immediately after triggering the action, the transition or loading state while the system is processing, and the final settled state after the action completes. Name files to reflect the moment (`-initial`, `-transition`, `-final` or equivalent). Report on each frame: was a loading indicator shown? Did transitions complete cleanly? Was there any blank, broken, or inconsistent intermediate state?

   **b. Stability check (Gap 4 fix):** After the first drive produces a result, re-drive the same criterion at least twice more without resetting state. If any re-drive produces a different outcome — different visual state, different console output, different response — flag the criterion as `stability: flaky`. Flaky criteria are HIGH issues indicating race conditions or state leakage. Record `stability-check-flaky-count: <N>`.

   **c. Perceptual review pass (Gap 2 fix):** After determining pass/fail against the criterion text, make a second independent pass on the final screenshot. Ask: *independent of the criterion, what do I notice about this screen?* Report on: visual hierarchy, spacing consistency, font rendering, element alignment, truncated text, color that diverges from surrounding conventions, anything that would make a first-time user pause. Record these observations under `## Friction Notes` (not under issues — they are informational unless they contradict product conventions from step 0).

   **d. Anomaly investigation mandate (Gap 9 fix):** When reading evidence (screenshot, response body, console output), if anything appears unexpected — a console error, a network request to an unexpected endpoint, a visual element that is present but should not be, or absent but should be — do not just record the observation and move on. Pivot: open the browser DevTools console (via CDP or MCP browser tools), read the network tab for the relevant time window, inspect the DOM for the anomalous element. Report what you find as a sub-finding attached to the criterion. Never filter an anomaly as "probably unrelated" — record and let the reviewer decide.

   - Navigate or invoke the surface named in the criterion.
   - Perform the user actions described.
   - Apply the multi-point capture, stability check, perceptual review, and anomaly investigation protocols above.
   - Record: criterion id or quoted text, adapter used, evidence paths (all frames), stability result, perceptual notes, anomaly findings, pass/fail.
4. **Tear down each adapter** per its `Tear down` section. Idempotent — re-runs of verify must not leave the environment dirtier each pass.
5. **Run existing test suites** that target the same surface (Playwright/Cypress E2E for web, Maestro suites for Android, XCUITest for iOS, etc.) in addition to the per-criterion drives, when they exist. The adapter's `Drive` section names the relevant suite invocations.

6. **Free exploration (MANDATORY — Gap 1 fix).** After verifying all AC, set aside the criteria list entirely and navigate the surface as a first-time user would. Cover every interactive element on the surface, at least one adjacent flow the feature connects to, and try reaching the same outcome via a path different from the one the AC describes. Note anything that surprises you, feels incomplete, or breaks — even if every AC passes. Record findings under `## Free Exploration Notes`. These are informational and do not affect `result:`, but surface as reviewer-visible observations. A finding that directly contradicts any AC becomes a standard issue.

7. **Adversarial micro-tests (MANDATORY — Gaps 5 & 10 fix).** After free exploration, run this fixed test set against the primary action surface, regardless of whether AC specify these scenarios:
   - **Empty submission:** Submit the primary form/action with no input. A crash or unhandled error is a BLOCKER; a graceful validation message is informational.
   - **Extreme input:** Paste a very large input into each text field (enough to stress field limits). A crash or UI breakage is HIGH; clean truncation or rejection is informational.
   - **Rapid repeat:** Trigger the primary action multiple times in rapid succession. Record whether duplicate submissions occur, whether debouncing works, or whether the UI breaks.
   - **Mid-flow interruption:** Navigate away mid-flow (back button, different route), then navigate back. Record whether state is preserved, cleared gracefully, or broken.
   - **Network failure:** Use the adapter's network simulation capability to trigger an offline or degraded-network state during the primary action. Record whether the error is handled gracefully or produces a crash/blank screen.
   Record all results under `## Adversarial Tests`. BLOCKER and HIGH findings enter the main issue list. Informational findings stay in the adversarial section.

8. **Failure mode probes (MANDATORY — Gap 10 fix).** For each user-observable AC, after verifying the happy path, probe the boundary conditions that AC never specify:
   - **Slow response:** Enable network throttling (Fast 3G or equivalent) and re-drive the criterion. Record whether loading states appear, whether timeouts are handled, whether the final result is still correct.
   - **Concurrent session:** Open the same surface in a second independent session and perform the same action simultaneously. Record whether state collisions, double-writes, or UI desync occur.
   - **Session expiry:** If authentication is in scope, invalidate the session mid-flow (remove or expire the token or cookie) and re-drive. Record whether expiry is handled gracefully or causes a crash/blank screen.
   Record all results under `## Failure Mode Probes`. Findings that expose unhandled error states are HIGH issues.

The runtime-adapters.md `Evidence protocol` and `Accessibility checks` sections apply across all platforms; do not duplicate them here.

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

Launch ONLY if any of these exist: `02c-craft.md`, or any entry in `00-index.md` `augmentations:` list. This sub-agent enforces contracts that the standard test suites do not catch.

> **`verify` is the design consumer that *measures it* (when `stack.ui ≠ ∅`).** The a11y / perf / responsive / web-vitals gates above are the **measurable design floor** for any UI slice, and the per-augmentation re-checks below confirm each *applied* transform actually hit its goal. These numbers are measured **once, here** — `/wf review`'s design-audit dimension (and ad-hoc `/wf design audit`) *interpret* them from `06-verify-*.md` rather than re-running axe-core, so the two stages can never disagree about the same measurement. Record them in the verify report so audit can read them.

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
| `instrument` | Read `04b-instrument.md`. For each designed signal, exercise the affected code path and confirm the log/metric/trace fires (via tests, live observation, or grep on log output). Report any missing signals. |
| `experiment` | Read `04c-experiment.md`. Confirm: feature flag is wired, cohort split produces documented distribution, all metrics (primary/secondary/guardrail) fire on the right events, rollback path works. |
| `benchmark` (status: baseline) | Run `/wf benchmark <slug>` in compare mode. Compare against `05c-benchmark.md` baseline. Flag regressions exceeding documented tripwires (default >10% CPU / >25% memory). |

**Reporting:**
- Pass: all mock fidelity items honored, all augmentation type-checks pass, no critical findings outstanding.
- Fail: list each failure with severity. These become BLOCKER or HIGH issues for `wf-review`.

### Web research sub-agent 5 — Freshness: Dependencies, AC Staleness, and Standards Drift

Launch when ANY of the following is true: (a) any test failure occurred, (b) the plan was written more than 14 days ago (check `created-at` in `04-plan-<slice-slug>.md`), or (c) the slice modifies an integration point with an external API or schema. This sub-agent previously only ran on test failures — it now also catches AC staleness and standards drift proactively.

Prompt with:

**Dependency drift:**
- If any test failures occur, check whether the failing library/API has released breaking changes since the plan was written
- Web search for known test compatibility issues with the project's dependency versions
- Check if test fixtures or mock data reference external schemas/APIs that may have changed

**AC staleness check (MANDATORY when plan age > 14 days or slice touches external integrations):**
- Read the acceptance criteria from `03-slice-<slice-slug>.md`. For each criterion that names an external API, schema, protocol, or third-party service: web search for breaking changes or deprecations announced since the plan's `created-at` date.
- If any criterion references behavior of an external dependency that has since changed, flag it as `ac-stale: true` with a one-line description of the change. AC staleness is not a verify failure — it surfaces as a `## Freshness Research` finding and routes to `/wf plan` (Option E) if the drift is material.
- Record `ac-staleness-checked: true | false` and `ac-stale-count: <N>` in the output.

Merge all sub-agent results. For each check, record: command run, pass/fail, relevant output. Do NOT fix issues at this stage — the user-gated fix loop runs once in Step 7.6 after all check results are merged and the AC gate has partitioned issues.

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
- **Conditional inputs are mandatory when present.** If any file listed in the *Conditional inputs* row of this command's preamble exists on disk, you MUST read it and the stage's output MUST honor it as described. Existence is what's optional; consumption is required. Silent omission of a present artifact is a workflow contract violation, not a permitted shortcut.
- **Evidence versioning across re-invocations:** When `06-verify-<slice-slug>.md` already exists (i.e., this is a re-run), do NOT overwrite the previous evidence directory. Before writing new evidence, move the existing evidence to a timestamped snapshot: `mv .ai/workflows/<slug>/verify-evidence/<slice-slug>/ .ai/workflows/<slug>/verify-evidence/<slice-slug>-run-<N>/` where `N` is the re-run count (read from the existing artifact's `fix-rounds-run` field + 1). New evidence goes into the fresh `<slice-slug>/` directory. This preserves a diff-able record of what changed between rounds — reviewers can compare `<slice-slug>-run-1/` vs. `<slice-slug>/` to see whether fixes changed observable behavior.

# Chat return contract
After writing files, return — lead with the substance first, then the receipt:
- **narrative:** a short prose paragraph (not bullets) telling the story of what this stage produced — what it *is* and how, the key decisions and counts, and the top risk or caveat. The router leads the chat summary with this paragraph; the fields below are the receipt beneath it.
- `slug: <slug>`
- `wrote: <path>`
- `result: <pass | fail | partial | blocked-runtime-evidence-missing>`
- `convergence: <not-needed | converged | escalated>` — include the `fix-rounds-run` count and a one-line "what the loop did" summary when `convergence != not-needed`
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
   c. `TaskUpdate(taskId, status: "completed")`. If the check failed, update description first: `TaskUpdate(taskId, description: "FAILED: <output summary>")` then mark completed. Do NOT fix yet — the user-gated fix loop runs once in Step 7.6 after all checks finish and the AC gate has partitioned issues.
5. **Verify acceptance criteria.** For each AC task:
   a. `TaskUpdate(taskId, status: "in_progress")`.
   b. Compare results with the criterion from `03-slice-<slice-slug>.md` and `02-shape.md`.
   c. `TaskUpdate(taskId, status: "completed")`. If not met, update description: `TaskUpdate(taskId, description: "NOT MET: <reason>")`.
6. If verification reveals gaps caused by external dependency behavior or standards drift, run a freshness pass and record it.
7. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
7.5. **Apply the user-observable AC gate** (see "User-observable AC gate" section below). Partition AC into `code-only` vs `user-observable`. For every `user-observable` AC, require a matching entry in `interactive-verification-results` (from sub-agent 3). If any user-observable AC has no matching entry AND no `interactive-verification: deferred` annotation, the per-slice verify file MUST be written with `result: blocked-runtime-evidence-missing` (NOT `pass`) and the missing AC listed in `## Issues Found`. The gate is the load-bearing change that closes the "verified but actually broken" leak.
7.6. **Single-round verify-owned fix loop** (see "Verify-owned fix loop" section below). Snapshot the issue list as `metric-issues-found-initial`. Triage each failing check and each unmet user-observable AC via `AskUserQuestion`. For every `Fix` decision, spawn a sub-agent that applies the minimal patch. Re-run only the affected checks once. Record `fix-rounds-run`, `convergence`, and the resulting `metric-issues-found-final`. ONE round only — if anything still fails, finalize with `convergence: escalated` and route the user to re-invoke verify (or to `/wf implement` as a manual escape).
8. Mark "Write 06-verify" task `in_progress`. **Write `06-verify-<slice-slug>.md`** (per-slice file, see template below). Mark `completed`.
9. **Write/update `06-verify.md`** (master index with links to all per-slice verify files).
10. Update `00-index.md` accordingly and add files to `workflow-files`.

# Adaptive routing — evaluate what's actually next

Routing is **driven by `convergence:`** plus the post-fix-loop `result:`. Verify no longer routes to `/wf implement` as the default fix path — the fix loop is owned by this stage. `/wf implement` survives only as a manual escape.

After completing the fix loop, evaluate the results and present the user with ALL viable options:

**Option A: Review** → `/wf review <slug> <selected-slice>`
Use when: `convergence: not-needed` OR `convergence: converged` AND `result: pass`. Verify is clean (either nothing failed, or the one-round fix loop resolved everything). Ready for a code review.
**Compact recommended if verify was lengthy** — test output, fix sub-agent chatter, and debugging context is noise for review dispatch.

**Option B: Re-invoke verify for a second round** → `/wf verify <slug> <selected-slice>`
Use when: `convergence: escalated` AND the user wants to attempt another round of fixes on the remaining issues. Verify enforces a one-round cap per invocation; a second round requires a fresh invocation so each round has its own audit trail. State the unresolved issues clearly before recommending this.

**Option C: Escalate to manual implement (escape hatch)** → `/wf implement <slug> <selected-slice>`
Use when: The remaining issues are not mechanically fixable by a single-finding sub-agent — they need design rethink, multi-file restructuring, or input the verify agent cannot supply. Use this when re-invoking verify would just escalate again.

**Option D: Skip review, go to Handoff** → `/wf handoff <slug> <selected-slice>`
Use when: This is a solo project with no reviewer, OR the change was already externally reviewed (e.g., pair-programmed), OR it's a trivial fix where formal review adds no value. Only suggest this when there is a clear reason AND `result: pass`.

**Option E: Revisit Plan** → `/wf plan <slug> <selected-slice>`
Use when: Verification revealed a fundamental flaw in the approach, not just a bug — the plan itself needs rethinking. This dominates Option C when the issue is "wrong approach" rather than "wrong code".

**Option F: Re-verify in a capable environment, or apply a deferral** → `/wf verify <slug> <selected-slice>` (re-run) OR amend with `interactive-verification: deferred`
Use when: `result: blocked-runtime-evidence-missing` and the fix loop could not produce the missing evidence (the environment could not support the interactive checks — no emulator, no API key, no device, etc.). Either move to an environment where the interactive checks can run, or annotate the slice with a deferral reason. Deferrals will not block review or handoff but will block ship.

**Option G: Slug-wide runtime probe** → `/wf probe <slug>`
Use when: Per-slice verify passed, but you want a slug-wide runtime sweep against the running artifact (e.g., to catch cross-slice integration breakage). Probe is the backward re-entry counterpart to the per-slice interactive gate — it observes the whole artifact, not one slice's surface.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

# User-observable AC gate (MANDATORY)

This gate closes the "verified but actually broken" leak. It runs in Step 7.5 of the numbered steps above. The rule is simple: **runtime evidence is required for every user-observable AC. No evidence, no pass.**

## Partitioning AC into code-only vs user-observable

Read every AC entry from `03-slice-<slice-slug>.md` (or the compressed-mode equivalent — see Step 0.4 source-mode rules). For each AC entry, apply this two-step rule:

**Authoring note (for `/wf slice` authors):** The `observable:` annotation is the only mechanism to correct a heuristic miscall, and it must be set at slice-authoring time — not discovered at verify time. When writing AC entries in `03-slice-<slice-slug>.md`, tag any criterion whose classification is ambiguous: `<!-- observable: true -->` or `<!-- observable: false -->` immediately after the criterion text. Criteria that name an internal function but whose observable outcome is user-visible MUST be tagged `observable: true`; criteria that describe a user-visible outcome that is fully covered by an existing automated assertion with no need for a live adapter run may be tagged `observable: false`. When in doubt, omit the tag and let the heuristic run — but if the slice author knows the heuristic will miscall, tag it now to avoid a blocked result at stage 6.

**Step A — explicit override wins.** If the AC entry carries an `observable: true | false` annotation (inline tag or comment in the slice file), that value is final. Authors use this to correct heuristic miscalls.

**Step B — heuristic when unannotated.** When the AC entry has no `observable` annotation, the gate considers it user-observable when any of the following hold:
- It names a visible surface (screen, page, route, view, panel, dialog, command output).
- It names a user action (click, tap, type, submit, run, invoke, navigate).
- It declares an observable post-condition (renders, appears, displays, returns, prints, succeeds, redirects).

Criteria that fail all three checks are treated as `code-only` (e.g., "the new util function handles null inputs") and the interactive gate does not fire for them.

Record the partition in the verify artifact under `## Acceptance Criteria Status` — every AC entry has a `kind: code-only | user-observable` column. This is what allows reviewers to see which criteria the gate considered relevant.

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

The new `blocked-runtime-evidence-missing` variant is distinct from `fail` because the failure is procedural (evidence was not produced) rather than substantive (evidence shows the AC is not met). The downstream routing for the two differs — `fail` recommends `/wf implement` to fix the code; `blocked-runtime-evidence-missing` recommends either re-running verify in an environment that supports the interactive checks, or applying a deferral annotation if the environment cannot support them.

## Escape hatch — `interactive-verification: deferred`

Some AC are user-observable but genuinely cannot be probed in the current environment (no emulator, no staging API key, no physical device, etc.). To proceed without a hard fail, the slice author may add to the per-slice verify file frontmatter:

```yaml
interactive-verification: deferred
interactive-verification-defer-reason: "<one-line explanation>"
```

When this annotation is present on a slice:
- The gate writes `result: partial` (not `pass`) with a note that runtime evidence was deferred.
- The deferral is appended to `00-index.md` under `runtime-evidence-deferrals` (see schema below).
- `/wf review` and `/wf handoff` proceed with a soft warning; `/wf ship` HARD-BLOCKS until every deferral is cleared by a subsequent `/wf probe` run that produces matching evidence, or by re-running verify in a capable environment.

**Decision (recorded in plan §2.4):** No silent skip. Every deferral is named, dated, and surfaces in the slug's progress view and dashboard. The block bites at ship, not earlier, so in-flight work that legitimately waits on an environment is not stalled mid-pipeline.

## 00-index.md additions for deferrals

When a slice's verify writes a deferral, append to the workflow index:

```yaml
runtime-evidence-deferrals:
  - slice: <slice-slug>
    reason: "<verbatim defer-reason>"
    deferred-at: "<iso-8601>"
    cleared-by: null    # set to <probe-descriptor> when a probe run clears the deferral
```

`/wf-meta status`, `/wf-meta next`, and `/wf ship` read this list. `/wf ship` refuses to start while any entry has `cleared-by: null`.

# Verify-owned fix loop (MANDATORY — single round, user-gated)

This loop is what lets `/wf verify` finalize either a passing artifact or a substantively-blocked one without bouncing the user back to `/wf implement` for routine fixes. It runs in Step 7.6, AFTER all checks (Step 4) and the user-observable AC gate (Step 7.5) have produced an issue inventory. It is bounded to **one round** by contract — re-runs require the user to re-invoke `/wf verify`.

## Inputs to the loop

Aggregate the issue list:
- Every check task whose description starts with `FAILED:` from Step 4.
- Every AC task marked `NOT MET:` from Step 5.
- Every user-observable AC the gate refused for missing runtime evidence (Step 7.5).
- Every augmentation re-check that failed (mock fidelity, signal coverage, experiment wiring, benchmark regression).

Record the count as `metric-issues-found-initial`. If the count is **zero**, set `fix-rounds-run: 0`, `convergence: not-needed`, and skip the rest of this section.

## Triage protocol

For each issue, call `AskUserQuestion`. Batch up to 4 issues per call. Each question:
- **header**: an issue identifier (e.g., `LINT-1`, `AC-3`, `RUNTIME-MISSING-2`, `BENCH-REG`).
- **question**: `"{issue type}: {one-line summary} at {file:line or check name}"`.
- Options:
  - `Fix` / label: "Fix this now", description: "Spawn a sub-agent to apply the minimal patch in this run."
  - `Skip` / label: "Skip", description: "Leave as-is for now; will surface in the verify artifact under Issues Found."
  - `Escalate` / label: "Escalate", description: "Out of scope for verify — route to `/wf implement` or back to plan."

The triage is **always required**. Verify never silently auto-fixes. If the user picks `Skip` for everything, the loop is over with `convergence: not-needed` and the existing failures stay recorded.

## Fix dispatch (single round)

For each issue triaged `Fix`, sequentially (one at a time):
1. `TaskUpdate` a new task: `subject: "Fix [{ID}]: {title}"`, `activeForm: "Fixing [{ID}]"`, `metadata: { slug, stage: "verify-fix", slice: "<slice-slug>", issueId: "{ID}" }`.
2. Spawn ONE sub-agent **with explicit `model: sonnet` and `isolation: worktree`** on the `Task` call (REQUIRED — both flags must be set; fix-loop sub-agents must not silently inherit the parent session's model, and worktree isolation prevents a bad fix from landing in the working tree until it is verified). Sonnet handles read-issue-then-patch-code well without Opus cost.

   The worktree is automatically cleaned up if the sub-agent makes no changes. If the sub-agent does make changes, the worktree path and branch are returned in the result — do NOT merge them into the main working tree until Step 3 (sanity-check) passes.

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
   specific issue. Do NOT refactor. Do NOT touch tests unless the
   issue is a test failure that requires a test edit.

   Return a brief summary of what you changed.
   ```
3. When the sub-agent returns: read the changed file(s) from the worktree path; sanity-check the patch addresses the issue and does not obviously break sibling code. If the patch looks correct, merge the worktree changes into the main working tree (e.g., `git checkout <worktree-branch> -- <changed-files>`). If the patch is wrong, discard the worktree without merging and record `COULD NOT FIX`.
4. `TaskUpdate(taskId, status: "completed")`. If the sub-agent could not fix, record `description: "COULD NOT FIX: <reason>"` then mark completed and treat this issue as `convergence: escalated` material in the next step.

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
- Adaptive routing surfaces "Option B: Re-invoke `/wf verify` to attempt another fix round" and "Option C: `/wf implement` (manual escape)" — never auto-loop.
- The `## Issues Found` body lists the still-broken issues with their triage decision attached (`Skip` and `Escalate`, plus any `Fix` that the sub-agent could not resolve).

## Commit (only when fixes landed AND re-check passed)

If at least one `Fix` sub-agent successfully modified files **AND all re-checks for `Fix`-triaged issues passed** AND `branch-strategy` is `dedicated` or `shared`:
- Stage every file the fix sub-agents touched.
- Commit with message: `fix(<slug>): verify-time fixes for <slice-slug>`.
- Record the commit SHA in the verify artifact `## Verify-Owned Fixes` section.
- Do NOT push.
- If `branch-strategy: none`, skip the commit; the fixes remain in the working tree.

**Do NOT commit if any `Fix`-triaged re-check still fails.** In that case, record `convergence: escalated`, leave the working tree as-is, and route the user to re-invoke verify. A commit that does not resolve the issue it was meant to fix must not enter git history — it would make the audit trail misleading.

## Fix Status table (in artifact body)

The verify artifact gains a `## Verify-Owned Fixes` section when `fix-rounds-run > 0`:

```
## Verify-Owned Fixes

| ID | Type | Triage | Sub-agent outcome | Re-check result |
|----|------|--------|-------------------|-----------------|
| {ID} | {issue-type} | Fix / Skip / Escalate | Patched / Could not fix / N/A | Pass / Still failing / Not re-run |

Commit: <SHA or "(no commit — branch-strategy: none)" or "(no files changed)">
```

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
next-invocation: "/wf review <slug> <slice-slug>"
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
  adapters: ${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/runtime-adapters.md
next-command: wf-review
next-invocation: "/wf review <slug> <slice-slug>"
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
- **Option A:** `/wf review <slug> <slice-slug>` — converged or no issues; ready for review [reason]
- **Option B:** `/wf verify <slug> <slice-slug>` — escalated; re-invoke for a second fix round [reason, only if applicable]
- **Option C:** `/wf implement <slug> <slice-slug>` — escape hatch; remaining issues need manual implement [reason, only if applicable]
- **Option D:** `/wf handoff <slug> <slice-slug>` — skip review [reason, if applicable]
- **Option E:** `/wf plan <slug> <slice-slug>` — plan needs rethinking [reason, if applicable]

---

## Step — Write free narrative fragments

Beyond the structured page, this artifact ships one or more **free narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings of **unrestricted raw HTML** that tell a story the rendered page can't on its own — a bespoke diagram, a before/after flow, a state machine, an annotated mock, or an interactive widget. Author **as many as the story needs**; there is **no contract, no scoping, and no sibling `.yaml`** for these. Prefix the label with `NN-` (`01-`, `02-`, …) to order them; they inject raw-inline below the page body. See [_fragment-authoring.md](_fragment-authoring.md) Step F2 and [narrative-fragments.md](../../../reference/narrative-fragments.md).
