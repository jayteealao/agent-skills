---
description: Verify that the selected slice meets acceptance criteria and is ready for review.
argument-hint: <slug> [slice]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

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

> **Auto second opinion (diagnosis).** After the perceptual review pass, **auto-invoke**
> `/consult codex <do these screenshots and observations actually satisfy the
> user-observable AC, or is something off?>` (pin `codex`/`claude`) when evidence is
> ambiguous or a gate is borderline. Skip when the AC is plainly met.

> **Verify against the real contract, not the remembered one.** When an acceptance
> criterion turns on how a dependency, framework, or SDK *actually* behaves — a return
> shape, an error path, a thrown type, a version-specific change — invoke the
> `study-sources` skill to read its **actual installed source** (`node_modules`, `~/.m2`,
> the Go/Rust/NuGet caches, Android SDK `sources/`, …) before ruling the criterion met or
> unmet. A `pass` judged against a recalled API is exactly the false-pass this stage exists
> to catch, and a `fail` blamed on the library may really be a misremembered signature.
> Match the version the project resolved. Read-only — reads land in gitignored `.scratch/`
> and never enter the verify evidence or the diff.

# CRITICAL — execution discipline
You are a **workflow orchestrator that owns its own triage→fix loop**.
- Run checks and compare results against acceptance criteria. Do NOT improvise fixes while checks are running.
- After all checks and the user-observable AC gate finish (Step 7.5), you own a **single-round, user-gated fix loop** (Step 7.6): triage every failure via `AskUserQuestion` (Fix / Skip / Escalate); `Fix` choices spawn sub-agents that apply the minimal patch; re-run only affected checks once, then finalize.
- ONE round only. If anything still fails, write `convergence: escalated` and route to re-invoke `/wf verify` or `/wf implement` — **do not loop again in this invocation**.
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
   - `workflow-type: rca` → **forwarded mode**. Source: `01-rca.md` (rich context) + synthesized `02-shape.md` + `05-implement-<slice-slug>.md` if planning ran.
   - `workflow-type: investigate` → **terminal analysis — not verified in place.** It produces option sketches, **no `02-shape.md`**, and no build; a chosen option is re-intaked via `/wf intake <option>` as a NEW workflow. A bare `investigate` slug has no implement record, so the prerequisite in Step 5 already STOPs; direct the user to `/wf intake <option>`.
   - `workflow-type: fix` / `hotfix` / `refactor` → **change-mode (compressed standard lifecycle).** Source: the **un-suffixed single-slice** standard files (`03-slice.md`, `04-plan.md`, `05-implement.md`) + the lead `01-<mode>.md` (`01-fix.md` / `01-hotfix.md` / `01-refactor.md`). Exactly **one** slice; `selected-slice` is its slug. Verify exactly as **standard mode** but use the un-suffixed filenames wherever a step names a `-<slice-slug>`-suffixed file. (For hotfix, focus on reproducing the incident symptom + the regression suite. For **refactor**, run the full baseline comparison from `02-shape.md` — re-run the baseline suite, check every `## Public API Surface` name still exists with the same signature, verify all callers still work; any unplanned deviation is a FAIL.)
   - `workflow-type: update-deps` → **self-managed.** update-deps self-authors `06-verify.md` inside its own flow; it should NOT use `/wf verify`. STOP and direct the user back to `/wf intake update-deps <slug>`.
   - `workflow-type: feature` (default) or unset → **standard mode**.
5. **Check prerequisites by mode:**
   - **Compressed mode**: `05-implement.md` (or `05-implement-<slice-slug>.md` if a slice was added) must exist. Acceptance criteria source is `01-quick.md`.
   - **Forwarded mode** (`rca`): `05-implement-<slice-slug>.md` (or `05-implement.md`) must exist. Acceptance criteria source is the synthesized `02-shape.md` plus the rich `01-rca.md`.
   - **Change-mode** (`fix` / `hotfix` / `refactor`): the un-suffixed `05-implement.md` must exist. Acceptance criteria source is `03-slice.md` + `01-<mode>.md` (refactor: also the `02-shape.md` baseline).
   - **Standard mode**: `05-implement-<slice-slug>.md` must exist.
   - All modes: if implement record shows `Status: Awaiting input` → STOP.
   - If `06-verify-<slice-slug>.md` (or `06-verify.md` in compressed mode) already exists → WARN: "This has already been verified. Running again will overwrite. Proceed?"
   - **Stack gate (do NOT silently re-detect):** Inspect the `stack:` block in `00-index.md` and `stack-source` in `04-plan-<slice-slug>.md` (standard/forwarded modes).
     - If `stack:` is **missing entirely** → STOP: "Stack fingerprint missing from `00-index.md`. Sub-agent 3 needs the PO-confirmed stack to pick adapters. Re-run `/wf intake <slug>` first." Verify must NOT re-detect — detection alone is insufficient evidence of intent.
     - If `stack.user-confirmed: false` → **HARD GATE.** `AskUserQuestion` header `"Stack unconfirmed"`, question `"stack: was auto-detected but the PO never confirmed it. Adapter selection may be wrong. (1) Stop and re-run intake Batch B. (2) Proceed with unconfirmed stack — result stamped weak-provenance and review/ship may refuse it."` Options: `Stop (recommended)` / `Proceed with unconfirmed stack`. Stop → STOP. Proceed → set `stack-source: unconfirmed-auto-detect` in frontmatter AND `## Caveats`. Never auto-proceed.
     - If `04-plan-<slice-slug>.md` carries `stack-source: unconfirmed-auto-detect` → propagate the same warning and frontmatter stamp (verification inherits the plan's stack provenance).
     - If `stack.user-confirmed: true` and plan agrees → proceed. Sub-agent 3 MUST intersect matched adapters with `stack.platforms`; companion skills used for evidence MUST come from `stack.available-skills`.
   - **Constraint-resolution gate (refuse inherited unresolved environment walls):** Read `## Verification Strategy` in the plan file. Every **user-observable** AC whose strategy names an environment dependency (credentials, device, external service, inbound callback, deploy target, missing infrastructure) must carry a `constraint-resolution:` line authored at plan time (`prerequisite-slice: <slug>` | `proxy+deferral: <named clearing event>` | `po-accepted: <reason>`). If **none of the three** is present, record the criterion under `constraint-resolution-missing:` in the verify frontmatter and treat as `blocked-runtime-evidence-missing` at Step 7.5 — the deferral hatch is **not available** for it. Routing: Option E (`/wf plan` — author the resolution), not Option F.
6. **Read the source context by mode:**
   - **Compressed mode**: `01-quick.md` (acceptance criteria + plan) + `05-implement.md`.
   - **Forwarded mode** (`rca`): `01-rca.md` + `02-shape.md` (synthesized) + `04-plan.md` (if exists) + `05-implement-<slice-slug>.md`.
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
   | `benchmark` (status: baseline) | Run the benchmark compare by loading `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/augment/benchmark.md` in compare mode. Compare results against the baseline numbers in `05c-benchmark.md`. Flag regressions exceeding the documented tripwires (>10% CPU / >25% memory by default). |
8. **Carry forward** `open-questions` from the index.
9. **Branch check:** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy: dedicated`, confirm the correct branch via `git branch --show-current` and switch if needed. Verification must run against the implementation branch, not the base branch.

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
- This gate is **separate from** the `benchmark` augmentation (detailed profiling). This gate adds a lightweight size/startup floor that runs every time.

**Security scanning (MANDATORY — runs on every slice):**
- **Dependency CVEs:** Run `npm audit --audit-level=high`, `cargo audit`, `pip-audit`, `go list -json -m all | nancy sleuth`, or the project's equivalent. Report: count of critical/high CVEs in files this slice changed vs. pre-existing. New CVEs introduced by this slice are BLOCKER issues.
- **Secret detection:** Run `git diff <base-branch>...HEAD | trufflehog --stdin` or `gitleaks detect --source=. --log-opts="<base>..<head>"` if available; otherwise grep the diff for patterns matching API key, secret, password, token, credential assignments in string literals. Any finding is a BLOCKER.
- **SAST (if tooling is present):** Run `semgrep --config=auto` on files this slice touched if semgrep is installed. Report new findings in slice-modified files at severity HIGH or above.
- Report: `security-scan-result: pass | fail | skipped` (skipped only when no tooling is installed and no patterns matched). New findings introduced by the slice are BLOCKER issues regardless of convergence verdict.

**`sdlc-debt:` marker hygiene (validation — runs on every slice):**
- Grep the slice diff for intentional-simplification markers: `git diff <base-branch>...HEAD | grep -nE 'sdlc-debt:'` (or scan the slice's changed files).
- For each marker found, validate two things:
  - **Well-formed:** the comment names a *ceiling* (the known limitation — global lock, O(n²) scan, naive heuristic, hard-coded value) AND an *upgrade path*. A bare `sdlc-debt:` with neither is a LOW finding.
  - **Recorded:** the shortcut appears in `05-implement-<slice-slug>.md` → `## Anything Deferred` or `## Known Risks / Caveats`. An unrecorded marker is invisible debt — a MED finding.
- A deliberate shortcut without its recorded ceiling is *unfinished*, not lazy. **Scope is THIS slice's diff only — verify VALIDATES freshly-written markers, not the repo's debt backlog** (that is retro's per-workflow reconcile and `/wf simplify codebase`'s on-demand sweep).
- Report: `debt-markers-found: <N>`, `debt-markers-malformed: <N>`, `debt-markers-unrecorded: <N>`. Malformed or unrecorded markers enter the Step 7.6 fix loop (Fix = make well-formed and record it; the shortcut itself is not undone).

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

**Skipped-gating-spec mapping (MANDATORY — a skip is a missing-evidence event, not a green):**
- A spec that did not execute — guard exit, `.skip`/`.todo`, missing env/secret, filtered out — produced **no** evidence for the AC it was designated to gate. It cannot inherit the suite's overall green.
- Map every skipped spec to the AC(s) it gates and record `skipped-gating-specs: [{spec, ac, precondition}]` (`precondition` = the unmet reason, e.g. `E2E_ADMIN_USER_EMAIL` unset). The AC gate (Step 7.5) routes each such AC through the ladder (another rung), a deferral with a probe receipt, or `blocked-runtime-evidence-missing`.

**Cross-slice regression check (MANDATORY when sibling slices have been verified):**
- Read `06-verify.md`. Collect every `slice-slug` with `result: pass` or `partial` that is NOT the current slice.
- For each sibling, identify `files-modified` from `05-implement-<sibling-slug>.md`. If any overlap with the current slice's `files-modified`, flag as a regression target.
- Re-run the test suite scoped to overlapping files (or the sibling's recorded test command from `06-verify-<sibling-slug>.md` `## Automated Checks Run`).
- Report: `cross-slice-regressions-found: <N>`, sibling slices re-checked, pass/fail per sibling. Any newly-failing sibling is a BLOCKER.
- If no sibling slices exist, record `cross-slice-regressions-found: 0` and note "no prior verified slices."

### Functional sub-agent 3 — Interactive & Runtime-Truth Verification

**This sub-agent is MANDATORY when the slice's AC contains any user-observable criterion** (see Step 7.5 — User-observable AC gate). Automated tests prove code correctness; this sub-agent proves user-visible behavior. A slice cannot reach `result: pass` if a user-observable AC has no matching interactive evidence.

**Platform recipes live in the adapter registry**, not inline:

> Read `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/runtime-adapters.md` and follow the recipe for every adapter whose detection signals match the repo (web / android / ios / cli / desktop / service / notebook / etc.). Adapter selection is documented at the top of that file.

**Climb the constraint-resolution ladder before deferring anything (MANDATORY).** "No device / no browser / no creds" is not a defer-reason — it is the *start* of a ladder climb. For each user-observable AC whose obvious path is blocked, climb the ladder for its class (runtime-adapters.md → *Constraint-resolution ladder*), **executing any tool bootstrap the plan's `## Verification Strategy` already authorized**, and record the highest rung that produced evidence. Defer ONLY the residual that no rung can reach. Three hard rules:

- **Static reasoning is never evidence for a user-observable AC.** "Decidable by reasoning" proves code correctness, not user-visible behavior. Drive the criterion; do not reason to a `pass`.
- **Verify the layer the AC is about — a user-observable mock is not met.** This generalizes the shipped integration-blindspot guard from "AC asserts a live integration" to *all* user-observable ACs: a user-observable AC whose highest achieved `evidence-rung` is `cited-mock`, `uncited-mock`, or `static` is **not met**. A mock-backed or static-reasoned pass is insufficient — climb the ladder (`runtime-adapters.md`; for a live integration, the emulator/testcontainer rung) or take the deferral path. Record the highest rung reached as `evidence-rung` on that AC (§ Acceptance Criteria Status).
- **Punting to a future slice is a deferral, not a pass.** "Will be verified during `<other slice>`" must register a deferral the later slice (or `/wf probe`) is obligated to clear — never grounds for `result: pass` on this slice.

**Mock provenance + fixture-fidelity (record where the shape came from).** Any mock/fixture that **emulates an external interface** — library stream/event shapes, HTTP payloads, SDK return types — records `mock-provenance: <node_modules path read | captured-real-output ref | docs URL>`. "From recollection" is **illegal**: an unrecorded provenance forces `evidence-rung: uncited-mock`.
- **Grep check.** When an AC's evidence rests on mocked external-interface events, grep the *installed* package for the mocked identifiers (event names, method names). **Zero hits ⇒ presumptively fictional ⇒ finding + cap that AC at `partial`.**
- **Fixture-fidelity spot-check.** Spot-check the fixture's shape against the real contract — the dependency's types/`.d.ts`, official docs, or one free schema-level call — and record `fixture-fidelity: checked | unchecked — <why>` per fixture. Spot-check only (shape/enum names), **not** a contract-test mandate; `/wf study-sources` is the natural tool. `fixture-fidelity: checked` is what upgrades a mock from `uncited-mock` to `cited-mock`.

**First-light (an integration whose real behaviour is unproven caps at `partial`).** When a slice introduces an external integration whose real behaviour has **not** been observed live in this workflow, register it in `00-index.md`:

```yaml
unproven-integrations:
  - name: <integration>
    introduced-by: <slice-slug>
    first-light: null   # ISO-8601 stamp of the first live observation; null = never yet observed live
```

While `first-light: null`, every AC depending on that integration caps at `partial` — mock/emulator rungs are proxies, never `pass`. Any live observation (a tagged smoke run, `/wf probe`, a live e2e) **stamps** `first-light` with its timestamp and lifts the cap.

**Mitigation-wiring is traceable — "the code exists" is not evidence.** Any mitigation the shape *mandates* (fallback, escape hatch, kill switch) must be evidenced by an AC that **exercises the wired path** — fault injection, a forced fallback, a flag flip — with the mitigation actually firing. Mitigation ACs are **code-only-forbidden**: their `kind` is `user-observable` and their evidence is the mitigation firing, never a static read that the branch is present.

Prompt the agent with ALL of the following:

0. **Read product context before driving (MANDATORY — Gap 11 fix).** Build a mental model of product conventions before matching adapters or driving any criterion:
   - Read `PRODUCT-CONTEXT.md` or `docs/product-conventions.md` at repo root if present.
   - Read `02b-design.md`, `02c-craft.md`, `07-design-audit.md`, `07-design-critique.md` if present — extract prescriptive UI/UX norms.
   - Grep for the 3 most similar existing components (by name or route); read them for visual and interaction conventions.
   - Read git log for the top 5 modified files (`git log --oneline -10 -- <file>`) for component history and prior reviewers' concerns.
   - Synthesize a one-paragraph "product conventions" note. Hold all observations against these conventions, not just the criterion text. Record divergences under `## Friction Notes` even when the criterion is technically met.

1. **Match adapters — constrained by confirmed stack.** Run every adapter's detection signal, then **intersect with `stack.platforms`** from `00-index.md`:
   - `stack.user-confirmed: true` → effective adapter set = `matched-adapters ∩ stack.platforms`. Exclude platforms not in `stack.platforms` and record the exclusion under `## Caveats`.
   - `stack.user-confirmed: false` OR `stack-source: unconfirmed-auto-detect` → run all matched adapters but stamp each evidence record `stack-confirmed: false`. `## Caveats` MUST state that adapter selection was not PO-confirmed.
   - `stack.platforms` empty after intersection → record `bootstrap-failure: { adapter: none, step: stack-intersection, remediation: "Re-run /wf intake to reconcile." }` and skip to teardown. Do NOT pick a default adapter.
   - Multi-match is common; drive all platforms in `stack.platforms`. Record final adapter keys under `adapters-used:`.
2. **Bootstrap each matched adapter** per its `Bootstrap` section. If any bootstrap step fails after documented resolution attempts, report `bootstrap-failure: { adapter, step, exit-code, output-tail, remediation }` and do NOT proceed past bootstrap for that adapter. The AC gate (Step 7.5) will refuse `result: pass` and require an `interactive-verification: deferred` annotation or a remediation pass via `/wf probe`.

2b. **Capture longitudinal baseline before driving (MANDATORY — Gap 3 fix).** Before driving any criterion, capture before-state screenshots:
   - If a prior evidence run exists at `.ai/workflows/<slug>/verify-evidence/<slice-slug>-run-*/`, use those as the before-state.
   - Otherwise, stash changes (`git stash --include-untracked`), boot the adapter against the base branch, screenshot each named surface, restore (`git stash pop`). Store as `baseline-<surface>.png`.
   - If stashing would destroy in-progress work (`git stash list` non-empty), record `longitudinal-baseline-compared: skipped — stash non-empty`.
   - Compare each post-drive screenshot against its baseline. Report visual deltas (layout, missing/new elements, color or typography shifts) under `## Longitudinal Delta`. A delta is a finding only if it contradicts the criterion or product conventions.

3. **For each user-observable AC**, follow the adapter's `Drive` and `Observe` recipes, with these mandatory extensions:

   **a. Multi-point evidence capture (Gap 12 fix):** Capture at three moments: initial response, transition/loading state, and final settled state. Name files accordingly (`-initial`, `-transition`, `-final`). Report per frame: loading indicator shown? Transitions clean? Any blank/broken intermediate state?

   **b. Stability check (Gap 4 fix):** Re-drive the criterion at least twice more without resetting state. If any re-drive differs (visual, console, response) flag it as `stability: flaky` — a HIGH issue indicating race conditions or state leakage. Record `stability-check-flaky-count: <N>`.

   **c. Perceptual review pass (Gap 2 fix):** After pass/fail, make a second independent pass on the final screenshot. Ask: *independent of the criterion, what do I notice?* Report on visual hierarchy, spacing, font rendering, alignment, truncated text, color divergences — anything that would make a first-time user pause. Record under `## Friction Notes` (informational unless they contradict product conventions from step 0).

   **d. Anomaly investigation mandate (Gap 9 fix):** If anything in evidence is unexpected (console error, unexpected network request, missing or extraneous element), do not just record and move on. Pivot: open DevTools console (via CDP or MCP), read the network tab, inspect the DOM. Report as a sub-finding. Never filter an anomaly as "probably unrelated" — record and let the reviewer decide.

   - Navigate or invoke the surface named in the criterion.
   - Perform the user actions described.
   - Apply the multi-point capture, stability check, perceptual review, and anomaly investigation protocols above.
   - Record: criterion id or quoted text, adapter used, evidence paths (all frames), stability result, perceptual notes, anomaly findings, pass/fail.
4. **Tear down each adapter** per its `Tear down` section. Idempotent — re-runs of verify must not leave the environment dirtier each pass.
5. **Run existing test suites** that target the same surface (Playwright/Cypress E2E for web, Maestro suites for Android, XCUITest for iOS, etc.) in addition to the per-criterion drives, when they exist. The adapter's `Drive` section names the relevant suite invocations.

6. **Free exploration (MANDATORY — Gap 1 fix).** After verifying all AC, set aside the criteria list and navigate as a first-time user. Cover every interactive element, at least one adjacent flow, and try reaching the outcome via a different path. Note anything surprising, incomplete, or broken. Record under `## Free Exploration Notes` — informational, do not affect `result:`, but visible to reviewers. Any finding that directly contradicts an AC becomes a standard issue.

7. **Adversarial micro-tests (MANDATORY — Gaps 5 & 10 fix).** After free exploration, run this fixed test set against the primary action surface, regardless of whether AC specify these scenarios:
   - **Empty submission:** Submit the primary form/action with no input. A crash or unhandled error is a BLOCKER; a graceful validation message is informational.
   - **Extreme input:** Paste a very large input into each text field (enough to stress field limits). A crash or UI breakage is HIGH; clean truncation or rejection is informational.
   - **Rapid repeat:** Trigger the primary action multiple times in rapid succession. Record whether duplicate submissions occur, whether debouncing works, or whether the UI breaks.
   - **Mid-flow interruption:** Navigate away mid-flow (back button, different route), then navigate back. Record whether state is preserved, cleared gracefully, or broken.
   - **Network failure:** Use the adapter's network simulation capability to trigger an offline or degraded-network state during the primary action. Record whether the error is handled gracefully or produces a crash/blank screen.
   Record all results under `## Adversarial Tests`. BLOCKER and HIGH findings enter the main issue list. Informational findings stay in the adversarial section.

8. **Failure mode probes (MANDATORY — Gap 10 fix).** For each user-observable AC, probe boundary conditions after the happy path:
   - **Slow response:** Enable network throttling (Fast 3G) and re-drive. Record loading states, timeout handling, final correctness.
   - **Concurrent session:** Open the surface in a second independent session and act simultaneously. Record state collisions, double-writes, or UI desync.
   - **Session expiry:** If auth is in scope, invalidate the session mid-flow and re-drive. Record whether expiry is handled gracefully or causes a crash/blank screen.
   Record under `## Failure Mode Probes`. Unhandled error states are HIGH issues.

The runtime-adapters.md `Evidence protocol` and `Accessibility checks` sections apply across all platforms; do not duplicate them here.

**Accessibility gate (MANDATORY for all UI adapters — web, android, ios, desktop):**

After driving each user-observable criterion, run an a11y scan on the exercised surface:
- **Web:** `axe-core` via `@axe-core/playwright` or `page.evaluate(() => axe.run())`; alternatively `npx @axe-core/cli <url>`. Report new WCAG AA violations only (diff against a baseline scan on the base branch if possible; otherwise all violations in modified components).
- **Android / iOS:** platform accessibility scanner if available (Accessibility Scanner APK via `adb install`); otherwise report "a11y scan: not-automatable" with a manual-verify note.
- **Result:** `a11y-result: pass | fail | not-automatable`. New WCAG AA violations in slice-modified components are HIGH issues.
- This gate fires regardless of `design-harden` augmentation. The augmentation adds a deeper scan; this gate is the minimum floor.

**Output to the calling stage:**
- `interactive-verification-results: [{criterion, adapter, evidence-paths: [t0, t250, final], stability-result, perceptual-notes, anomaly-findings, observation, result}, ...]`
- `bootstrap-failures: [{adapter, step, remediation}, ...]` (empty if all bootstrapped cleanly)
- `metric-interactive-checks-run: <N>`
- `metric-interactive-checks-passed: <N>`
- `a11y-result: <pass | fail | not-automatable>`
- `metric-a11y-violations-new: <N>` — new WCAG AA violations in slice-modified UI components
- `stack-source: <confirmed|unconfirmed-auto-detect>` — inherited from `00-index.md` `stack.user-confirmed` and `04-plan-<slice-slug>.md` `stack-source`; downstream stages may refuse `unconfirmed-auto-detect` without explicit override.
- `adapters-excluded-by-stack: [<key>, ...]` — adapters matched by detection but excluded because absent from `stack.platforms`; empty when stack was unconfirmed.
- `longitudinal-baseline-compared: <true | false | skipped — stash non-empty>`
- `stability-check-flaky-count: <N>` — criteria differing across 3 stability drives; >0 is HIGH
- `friction-notes: [<string>, ...]` — perceptual review and product-convention observations; informational
- `free-exploration-findings: [<string>, ...]` — open-ended exploration observations; AC contradictions become standard issues
- `adversarial-tests-run: <N>` — count executed
- `adversarial-tests-failed: <N>` — count producing BLOCKER or HIGH findings
- `failure-mode-probes-run: <N>`
- `cross-browser-delta: <none | findings>` — HIGH if findings
- `web-vitals: {lcp: <ms>, cls: <score>, inp: <ms>}` — Core Web Vitals via CDP; INP > 200 ms is HIGH

### Functional sub-agent 4 — Augmentation Re-verification (only if `02c-craft.md` or `00-index.md` `augmentations:` list is non-empty)

Launch ONLY if `02c-craft.md` exists or `augmentations:` list is non-empty. Enforces contracts the standard test suites do not catch.

> **`verify` is the design consumer that *measures it* (when `stack.ui ≠ ∅`).** The a11y / perf / responsive / web-vitals gates above are the **measurable design floor** for any UI slice, and the per-augmentation re-checks below confirm each *applied* transform actually hit its goal. The canonical laws and absolute bans behind that floor are single-sourced in `skills/wf/reference/design/_design-context.md` — load its Accessibility law + Absolute bans when `stack.ui ≠ ∅` (even if no `02b`/`02c` exists) so the measurable checks match the design canon. These numbers are measured **once, here** — `/wf review`'s design-audit dimension (and ad-hoc `/wf design audit`) *interpret* them from `06-verify-*.md` rather than re-running axe-core, so the two stages can never disagree about the same measurement. Record them in the verify report so audit can read them.

Prompt with:

**Mock fidelity inventory check (when `02c-craft.md` is present):**
- Read `02c-craft.md` → `## Mock fidelity inventory`. For each item, check `05-implement-<slice-slug>.md` → `## Visual Contract Honored` to find its disposition (honored or deviation).
- For "honored" items: open the cited file:line and verify the item is actually implemented as described. Do not trust the implementation record blindly.
- For "deviation" items: surface in the verify report. Deviations are not failures by default (may be valid trade-offs) but must be visible.
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
| `benchmark` (status: baseline) | Run the benchmark compare by loading `augment/benchmark.md` in compare mode. Compare against `05c-benchmark.md` baseline. Flag regressions exceeding documented tripwires (default >10% CPU / >25% memory). |

**Reporting:**
- Pass: all mock fidelity items honored, all augmentation type-checks pass, no critical findings outstanding.
- Fail: list each failure with severity. These become BLOCKER or HIGH issues for `wf-review`.

### Web research sub-agent 5 — Freshness: Dependencies, AC Staleness, and Standards Drift

Launch when ANY: (a) any test failure occurred, (b) plan was written more than 14 days ago (check `created-at` in `04-plan-<slice-slug>.md`), or (c) slice modifies an integration point with an external API or schema.

Prompt with:

**Dependency drift:**
- If any test failures occur, check whether the failing library/API has released breaking changes since the plan was written
- Web search for known test compatibility issues with the project's dependency versions
- Check if test fixtures or mock data reference external schemas/APIs that may have changed

**AC staleness check (MANDATORY when plan age > 14 days or slice touches external integrations):**
- For each AC criterion naming an external API, schema, protocol, or third-party service: web search for breaking changes or deprecations since the plan's `created-at` date.
- Flag stale criteria as `ac-stale: true` with a one-line change description. AC staleness surfaces under `## Freshness Research` and routes to `/wf plan` (Option E) if drift is material.
- Record `ac-staleness-checked: true | false` and `ac-stale-count: <N>`.

Merge all sub-agent results. For each check, record: command run, pass/fail, relevant output. Do NOT fix issues here — the fix loop runs in Step 7.6 after all results are merged and the AC gate has partitioned issues.

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
- **Conditional inputs are mandatory when present.** If a file in this command's *Conditional inputs* row exists on disk, read it and honor it in the output — existence is optional, consumption is required; silent omission is a contract violation.
- **Evidence versioning across re-invocations:** When `06-verify-<slice-slug>.md` already exists, do NOT overwrite the previous evidence directory. Move existing evidence to a timestamped snapshot: `mv .ai/workflows/<slug>/verify-evidence/<slice-slug>/ .ai/workflows/<slug>/verify-evidence/<slice-slug>-run-<N>/` where `N` = `fix-rounds-run` + 1. New evidence goes into the fresh `<slice-slug>/` directory so reviewers can compare `<slice-slug>-run-1/` vs. `<slice-slug>/`.
- **Re-verify writes back; the index never contradicts a slice.** When a re-invocation changes a per-slice outcome, update `06-verify-<slice-slug>.md` `result` and `updated-at` **in place**, then re-derive the master `06-verify.md` rollup. The index MUST NOT report `pass` for a slice whose per-slice file says `result: fail`. Rule of order: change the slice file first, then the index; never the index alone.

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
7.5. **Apply the user-observable AC gate** (see "User-observable AC gate" section below). Partition AC into `code-only` vs `user-observable`. For every `user-observable` AC, require a matching entry in `interactive-verification-results`. If any has no match AND no `interactive-verification: deferred` annotation, write `result: blocked-runtime-evidence-missing` and list the missing AC in `## Issues Found`.
7.6. **Single-round verify-owned fix loop** (see "Verify-owned fix loop" section below). Snapshot `metric-issues-found-initial`. Triage each failure via `AskUserQuestion`; `Fix` choices spawn sub-agents; re-run only affected checks once. Record `fix-rounds-run`, `convergence`, `metric-issues-found-final`. ONE round only — if anything still fails, finalize with `convergence: escalated` and route to re-invoke verify or `/wf implement`.
8. Mark "Write 06-verify" task `in_progress`. **Write `06-verify-<slice-slug>.md`** (per-slice file, see template below). Mark `completed`.
9. **Write/update `06-verify.md`** (master index with links to all per-slice verify files).
10. Update `00-index.md` accordingly and add files to `workflow-files`.

# Adaptive routing — evaluate what's actually next

Routing is **driven by `convergence:`** plus the post-fix-loop `result:`. Verify owns the fix loop; `/wf implement` survives only as a manual escape.

After the fix loop, present ALL viable options:

**Option A: Review** → `/wf review <slug> <selected-slice>`
Use when: `convergence: not-needed` OR `convergence: converged` AND `result: pass`.
**Compact recommended if verify was lengthy** — test output, fix sub-agent chatter, and debugging context is noise for review dispatch.

**Option B: Re-invoke verify for a second round** → `/wf verify <slug> <selected-slice>`
Use when: `convergence: escalated` AND the user wants another fix round. Each invocation has its own audit trail; state the unresolved issues clearly before recommending this.

**Option C: Escalate to manual implement (escape hatch)** → `/wf implement <slug> <selected-slice>`
Use when: Remaining issues need design rethink, multi-file restructuring, or input verify cannot supply — re-invoking verify would just escalate again.

**Option D: Skip review, go to Handoff** → `/wf handoff <slug> <selected-slice>`
Use when: Solo project, already externally reviewed, or trivial fix. Only suggest when there is a clear reason AND `result: pass`.

**Option E: Revisit Plan** → `/wf plan <slug> <selected-slice>`
Use when: Verification revealed a fundamental approach flaw, not just a bug. Dominates Option C when the issue is "wrong approach" rather than "wrong code".

**Option F: Re-verify in a capable environment, or apply a deferral** → `/wf verify <slug> <selected-slice>` (re-run) OR amend with `interactive-verification: deferred`
Use when: `result: blocked-runtime-evidence-missing` and the fix loop could not produce the missing evidence. Either move to a capable environment or annotate with a deferral reason. Deferrals block ship but not review/handoff. A deferral is only lawful over a *probed* incapability (see attempt-before-declare) and is unavailable for criteria in `constraint-resolution-missing:` — those route to Option E.

**Option G: Slug-wide runtime probe** → `/wf probe <slug>`
Use when: Per-slice verify passed but you want a slug-wide runtime sweep (e.g., cross-slice integration breakage). Probe observes the whole artifact, not one slice.

Write ALL viable options (not just the default) into `## Recommended Next Stage`.

# User-observable AC gate (MANDATORY)

Runs in Step 7.5. **Runtime evidence is required for every user-observable AC. No evidence, no pass.**

## Partitioning AC into code-only vs user-observable

Read every AC entry from `03-slice-<slice-slug>.md` (or the compressed-mode equivalent — see Step 0.4 source-mode rules). For each AC entry, apply this two-step rule:

**Authoring note (for `/wf slice` authors):** The `observable:` annotation corrects heuristic miscalls and MUST be set at slice-authoring time. Tag ambiguous criteria with `<!-- observable: true -->` or `<!-- observable: false -->` immediately after the text. Criteria naming an internal function whose outcome is user-visible MUST be `observable: true`; criteria with a user-visible outcome fully covered by an existing automated assertion may be `observable: false`. When in doubt, omit the tag — but tag now if you know the heuristic will miscall.

**Step A — explicit override wins.** If the AC entry carries an `observable: true | false` annotation (inline tag or comment in the slice file), that value is final. Authors use this to correct heuristic miscalls.

**Step B — heuristic when unannotated.** When the AC entry has no `observable` annotation, the gate considers it user-observable when any of the following hold:
- It names a visible surface (screen, page, route, view, panel, dialog, command output).
- It names a user action (click, tap, type, submit, run, invoke, navigate).
- It declares an observable post-condition (renders, appears, displays, returns, prints, succeeds, redirects).

Criteria that fail all three checks are treated as `code-only` (e.g., "the new util function handles null inputs") and the interactive gate does not fire for them.

Record the partition under `## Acceptance Criteria Status` — every AC entry has a `kind: code-only | user-observable` column so reviewers see which criteria the gate evaluated.

## Matching user-observable AC against interactive evidence

For each `user-observable` AC, look in the sub-agent 3 results for a matching `interactive-verification-results` entry. Match by AC id (when AC entries carry ids) or by quoted text overlap (sub-agent 3 records the criterion text it drove).

- **Matched, result: pass** → AC counts as met.
- **Matched, result: fail** → AC counts as not met. `## Issues Found` lists the failure.
- **Matched, result: partial** → AC counts as partially met. List the gap.
- **Not matched** → AC has no runtime evidence. The gate refuses `result: pass` for the slice.

**User-observable mock is not met (the generalized integration-blindspot guard).** Regardless of a sub-agent's local pass, a user-observable AC whose `evidence-rung` is `cited-mock`, `uncited-mock`, or `static` is **not met** — the evidence proves code shape, not user-visible behavior. Climb the ladder (`runtime-adapters.md`) to a real rung (`live`/`headless`/`emulator-or-container`) or take the deferral path. A skipped gating spec (see `skipped-gating-specs`) that no other rung evidenced routes the same way.

## Result writeback

After matching:

| Condition | `result:` value to write |
|---|---|
| All AC met (code-only via test suites, user-observable via interactive evidence) | `pass` |
| At least one user-observable AC has no matching interactive evidence AND no deferral annotation | `blocked-runtime-evidence-missing` |
| At least one AC's designated gating spec was skipped, no other rung evidenced it, and no deferral annotation | `blocked-runtime-evidence-missing` |
| At least one AC fails or is partial, but every user-observable AC has runtime evidence (positive or negative) | `fail` or `partial` |

`blocked-runtime-evidence-missing` is procedural (evidence not produced), not substantive (code wrong). Routing differs: `fail` → `/wf implement`; `blocked-runtime-evidence-missing` → re-run in a capable environment or apply a deferral annotation.

**Write-time enforcement (post-write-verify gate — the R7 backstop).** The `post-write-verify` hook **HARD-BLOCKS** a `verify` artifact whose `result: pass` contradicts its evidence: `metric-acceptance-met < metric-acceptance-total`, or `interactive-verification: deferred`. The `mockEvidenceGate` extension additionally **hard-blocks `result: pass` while `metric-acceptance-mock-rung > 0`** — a user-observable AC row carrying `evidence-rung: cited-mock | uncited-mock | static` cannot pass (opt out `hooks.mockEvidenceGate: false`, default ON). It **forbids** the invented `metric-acceptance-unverified-interactive` field and **warns** when shadow-deferral prose ("deferred to user/manual", "UNVERIFIED-INTERACTIVE", "will be verified during `<slice>`", "decidable by static reasoning") co-occurs with `result: pass`. Reconcile `result` with the evidence or take the honest `partial` + deferral path. (Opt out per-repo with `hooks.verifyResultGate: false` / `hooks.verifyDeferralLint: false`.)

## Escape hatch — `interactive-verification: deferred`

Deferral is a **last resort**: it is honest only after the constraint-resolution ladder (runtime-adapters.md) has been climbed and each rung's outcome recorded. Defer only the residual that no rung can reach.

**The defer-reason MUST enumerate the rungs tried — a defer-reason that names no attempted rung is rejected.** Replace "no Android emulator/device" with "Robolectric covers the state machine (9/9); Roborazzi golden covers the visual; AVD boot attempted (failed: HAXM unavailable); residual = live multi-touch pointer routing." Bare phrases — "no emulator", "no creds", "deferred to user", "decidable by static reasoning" — are not acceptable defer-reasons; each must show the ladder was climbed first.

**Attempt before declare (positive-evidence capability probes).** "The environment cannot produce X" may be written ONLY after *executing* a capability probe and recording its literal command + output tail — `firebase projects:list` / `gcloud auth application-default print-access-token` for deploy credentials, `adb devices` for devices, an env-var check for keyed services, one spec run past the guard for credential-gated suites. A defer-reason with no recorded probe is invalid. Read-only introspection probes are always allowed unprompted; quota-consuming or traffic-sending probes follow the ladder's pre-authorization rule.

**A skipped-guard sweep is an error, not a deferral.** When every spec exits via a credential/environment guard (0 specs executed), the criterion is `blocked-runtime-evidence-missing` with the unmet precondition named ("set `E2E_ADMIN_USER_EMAIL`/`_PASSWORD` and re-run") — NEVER `interactive-verification: deferred`. Deferral is reserved for evidence no reachable rung can produce.

**A per-AC skip is the same error, one AC deep.** When *some* specs ran green but the spec that is the **designated evidence for a specific AC** was skipped (guard exit, `.skip`/`.todo`, missing env/secret, filtered out), that AC produced **no** evidence — it cannot inherit the suite's green. Route it through the ladder (another rung), or defer with a probe receipt, or write `blocked-runtime-evidence-missing`. This is the per-AC companion to the all-skipped sweep above; the skipped specs are recorded as `skipped-gating-specs: [{spec, ac, precondition}]` (Step 4 Test Execution).

To proceed without a hard fail once the residual is genuinely environment-bound, the slice author may add to the per-slice verify file frontmatter:

```yaml
interactive-verification: deferred
interactive-verification-defer-reason: "<rungs tried + the residual that survives them — not a bare 'no device'>"
```

When this annotation is present on a slice:
- The gate writes `result: partial` (not `pass`) with a note that runtime evidence was deferred.
- The deferral is appended to `00-index.md` under `runtime-evidence-deferrals` (see schema below).
- `/wf review` and `/wf handoff` proceed with a soft warning; `/wf ship` HARD-BLOCKS until every deferral is cleared by a subsequent `/wf probe` run that produces matching evidence, or by re-running verify in a capable environment.

**Decision (recorded in plan §2.4):** No silent skip. Every deferral is named, dated, and surfaces in progress view and dashboard. The block bites at ship, not earlier — in-flight work waiting on an environment is not stalled mid-pipeline.

## 00-index.md additions for deferrals

When a slice's verify writes a deferral, append to the workflow index:

```yaml
runtime-evidence-deferrals:
  - slice: <slice-slug>
    reason: "<verbatim defer-reason>"
    deferred-at: "<iso-8601>"
    cleared-by: null    # set to <probe-descriptor> when a probe run clears the deferral
    repeat-of: <slice-slug>   # ONLY when this deferral's constraint matches an earlier entry — see below
    absorbed-by: [<slice-slug>, ...]   # slices that inherit this open deferral instead of clearing it
    needed-by: <slice-slug>   # the slice that consumes this prerequisite; set at plan time
```

**Repeat-deferral marker.** Before appending, scan existing `runtime-evidence-deferrals` for an entry naming the *same environment dependency* (fuzzy match — same credential gate, device class, or missing service). On a match, append `repeat-of: <slice-slug of the first occurrence>`: the accumulation becomes visible in the artifact, `/wf status`, and dashboard. A wall paid twice is plan's tripwire — the next plan for this slug MUST scope the harness that retires it or record `harness-declined: <reason>` (see plan.md's repeat-deferral tripwire).

**Deferral stacking is a stop, not an absorption.** When a later slice would inherit an open deferral rather than clear it, append its slug to `absorbed-by`. Absorbing a deferral into a **third** slice is a **STOP**: verify surfaces it as a decision — *"foundation gap: N slices now stack on unproven `<X>` — provision the clearing event now, or PO-accept explicitly"* — and records the resolution in `po-answers.md`. Do not silently let the stack grow.

**`needed-by` escalation.** External prerequisites and deferrals carry `needed-by: <slice>` (the consuming slice, set at plan time). When the `needed-by` slice reaches `complete` while the prerequisite is still unmet (`cleared-by: null`), the deferral's status **escalates** — a completed consumer standing on an unmet prerequisite is a surfaced decision, not a quiet carry-forward.

`/wf status` and `/wf ship` read this list. `/wf ship` refuses to start while any entry has `cleared-by: null`.

# Verify-owned fix loop (MANDATORY — single round, user-gated)

Runs in Step 7.6, after all checks (Step 4) and the AC gate (Step 7.5) have produced an issue inventory. Bounded to **one round** — re-runs require re-invoking `/wf verify`. Conforms to [_fix-loop.md](_fix-loop.md); everything below is verify-specific parameterization.

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

Triage is **always required**. Verify never silently auto-fixes. If the user picks `Skip` for everything, the loop ends with `convergence: not-needed` and failures remain recorded.

## Fix dispatch (single round)

For each issue triaged `Fix`, sequentially (one at a time):
1. `TaskUpdate` a new task: `subject: "Fix [{ID}]: {title}"`, `activeForm: "Fixing [{ID}]"`, `metadata: { slug, stage: "verify-fix", slice: "<slice-slug>", issueId: "{ID}" }`.
2. Spawn ONE sub-agent **with explicit `model: sonnet` and `isolation: worktree`** on the `Task` call (REQUIRED — both flags must be set; the model pin follows [_fix-loop.md](_fix-loop.md) rule 3, and worktree isolation additionally prevents a bad fix from landing in the working tree until it is verified).

   The worktree is cleaned up if the sub-agent makes no changes. If it does make changes, the worktree path and branch are returned — do NOT merge into the main working tree until Step 3 (sanity-check) passes.

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

If at least one `Fix` sub-agent successfully modified files **AND all re-checks for `Fix`-triaged issues passed**: follow the shared commit discipline ([_fix-loop.md](_fix-loop.md) rule 7) with message `fix(<slug>): verify-time fixes for <slice-slug>`, and record the commit SHA in the verify artifact `## Verify-Owned Fixes` section.

**Do NOT commit if any `Fix`-triaged re-check still fails.** Record `convergence: escalated`, leave the working tree as-is, and route to re-invoke verify. A partial-fix commit must not enter git history.

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

Record `regression-tests-added: <N>` in the frontmatter. A **code-bug** fix with neither a test path nor an exemption reason is a MED finding (`fix landed without its regression test`). Lint/format, config, tooling, and docs fixes are exempt (`n-a`).

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
regression-tests-added: <N>                     # regression tests added by Fix sub-agents; a code-bug fix with neither a test nor an exemption is a MED finding
constraint-resolution-missing: []               # user-observable AC whose plan-named env dependency has no constraint-resolution: line; deferral hatch unavailable — route to /wf plan
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
- `blocked-runtime-evidence-missing` — at least one user-observable AC has no matching interactive evidence AND no deferral annotation (procedural failure; routing differs from `fail`).

**`interactive-verification` field semantics:**
- `required` (default) — slice has user-observable AC; runtime evidence produced for all.
- `deferred` — slice has user-observable AC; environment could not support at least one; `defer-reason` MUST be set.
- `not-applicable` — no user-observable AC; gate did not apply.

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
- **evidence-rung**: the HIGHEST rung that produced the recorded evidence for this AC — `live | headless | emulator-or-container | cited-mock | uncited-mock | static | n-a` (`n-a` for `code-only` ACs with no runtime surface).

Per-slice rollup line under this section (`evidence: live 2 / headless 1 / cited-mock 3`). `00-index.md` gets an `evidence-quality:` slug rollup (counts by rung) plus `metric-acceptance-mock-rung` frontmatter = the count of user-observable ACs whose `evidence-rung` is `cited-mock`, `uncited-mock`, or `static`.

The `kind` column makes the AC gate auditable — reviewers can see at a glance which criteria the gate evaluated and which it skipped.

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

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
