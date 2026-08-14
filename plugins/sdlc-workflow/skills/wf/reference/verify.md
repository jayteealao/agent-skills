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
> user-observable AC, or is something off?>` (pinning `codex`/`claude` keeps it free).
> **Fire it** — don't defer it to next-steps — whenever any AC is judged met by
> *inference* rather than direct observation, or any AC verification is deferred
> (headless/device wall, pre-registered manual re-run). Skip only when every AC is
> plainly met by direct observed evidence.

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
- After all checks and the user-observable AC gate finish (Step 7.5), you own a **single-round, user-gated fix loop** (Step 7.6): mechanical classes (lint / format / marker-syntax) auto-fix without a question; triage every other failure via `AskUserQuestion` (Fix / Skip / Escalate); `Fix` choices spawn parallel worktree-isolated sub-agents that apply the minimal patch; re-run only affected checks once, then finalize.
- ONE round only. If anything still fails, write `convergence: escalated` and route to re-invoke `/wf verify` or `/wf implement` — **do not loop again in this invocation**.
- Do NOT review, handoff, or ship — those are later stages.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely. The fix loop runs only in Step 7.6, never before checks complete.
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
   - `workflow-type: fix` / `hotfix` / `refactor` → **change-mode (compressed standard lifecycle).** Source: the **un-suffixed single-slice** standard files (`03-slice.md`, `04-plan.md`, `05-implement.md`) + the lead `01-<mode>.md` (`01-fix.md` / `01-hotfix.md` / `01-refactor.md`). Exactly **one** slice; `selected-slice` is its slug. Verify exactly as **standard mode** but use the un-suffixed filenames wherever a step names a `-<slice-slug>`-suffixed file. (For hotfix, focus on reproducing the incident symptom + the regression suite. For **refactor**, run the full baseline comparison from `02-shape.md` — re-run the literal `## Baseline Command` recorded there, diff its pass/fail/skip counts against `## Baseline Test Result`, check every `## Public API Surface` name still exists with the same signature, verify all callers still work; any unplanned deviation is a FAIL.)
   - `workflow-type: update-deps` → **self-managed.** update-deps self-authors `06-verify.md` inside its own flow; it should NOT use `/wf verify`. STOP and direct the user back to `/wf intake update-deps <slug>`.
   - `workflow-type: feature` (default) or unset → **standard mode**.
5. **Check prerequisites by mode:**
   - **Compressed mode**: `05-implement.md` (or `05-implement-<slice-slug>.md` if a slice was added) must exist. Acceptance criteria source is `01-quick.md`.
   - **Forwarded mode** (`rca`): `05-implement-<slice-slug>.md` (or `05-implement.md`) must exist. Acceptance criteria source is the synthesized `02-shape.md` plus the rich `01-rca.md`.
   - **Change-mode** (`fix` / `hotfix` / `refactor`): the un-suffixed `05-implement.md` must exist. Acceptance criteria source is `03-slice.md` + `01-<mode>.md` (refactor: also the `02-shape.md` baseline).
   - **Standard mode**: `05-implement-<slice-slug>.md` must exist.
   - All modes: if implement record shows `Status: Awaiting input` → STOP.
   - If `06-verify-<slice-slug>.md` (or `06-verify.md` in compressed mode) already exists → note the re-run in chat and proceed. [_additive-write.md](_additive-write.md) snapshots the prior revision and appends the `revisions:` ledger; no permission question is needed.
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
- **Bundle size (web):** If a build was produced, compare the output artifact size against the base branch via a **temporary worktree** — never a stash: `git worktree add <tmp-dir> <base-branch>`, build in the worktree, `du -sh` both outputs, then `git worktree remove <tmp-dir>`. The working tree's in-progress state stays untouched. A size increase ≥ 20% in any chunk is a HIGH issue. Record `metric-bundle-size-delta-pct`.
- **Build time delta:** Record the wall-clock time of the current build vs. the base branch build (from the worktree comparison above if run, otherwise from CI cache statistics). A build time increase ≥ 30% is a WARN.
- **Startup time (service/CLI):** If the adapter is `service` or `cli`, measure cold-start time (`time curl -s localhost:<port>/health` after a fresh start). A cold-start increase ≥ 15% vs. the base branch is a HIGH issue.
- If the worktree comparison is impossible (for example `git worktree` unavailable), record `metric-bundle-size-delta-pct: skipped — <reason>` and still record the absolute artifact size.
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

**Charter scenario (when the slice carries the `charter scenario executes through step N` standing AC).** The charter scenario is a **user-observable** AC: run it as INTERACTIVE verification through its covered steps — same browser/adapter rungs and the same constraint-resolution ladder as any user-observable AC, never a static-reasoning `pass`. It is **subject to first-light**: a scenario whose critical dependency is still `first-light: null` caps at `partial`. A slug can NEVER finish with its charter scenario never having run against reality — the final slice's scenario (all steps) must reach a real rung before ship. Skip when no slice carries the standing AC (compressed modes / no `## Charter Scenario`).

**Mitigation-wiring is traceable — "the code exists" is not evidence.** Any mitigation the shape *mandates* (fallback, escape hatch, kill switch) must be evidenced by an AC that **exercises the wired path** — fault injection, a forced fallback, a flag flip — with the mitigation actually firing. Mitigation ACs are **code-only-forbidden**: their `kind` is `user-observable` and their evidence is the mitigation firing, never a static read that the branch is present.

Prompt the agent with ONE coherent charter that covers the following:

0. **Read product context before driving (MANDATORY).** Read `PRODUCT-CONTEXT.md` or `docs/product-conventions.md` at repo root, and `02b-design.md` / `02c-craft.md` / `07-design-audit.md` / `07-design-critique.md`, when present; skim the most similar existing components and their recent git history. Synthesize a one-paragraph "product conventions" note and hold every observation against it, not just the criterion text. Record divergences under `## Friction Notes` even when the criterion is technically met.

1. **Match adapters — constrained by confirmed stack.** Run every adapter's detection signal, then **intersect with `stack.platforms`** from `00-index.md`:
   - `stack.user-confirmed: true` → effective adapter set = `matched-adapters ∩ stack.platforms`. Exclude platforms not in `stack.platforms` and record the exclusion under `## Caveats`.
   - `stack.user-confirmed: false` OR `stack-source: unconfirmed-auto-detect` → run all matched adapters but stamp each evidence record `stack-confirmed: false`. `## Caveats` MUST state that adapter selection was not PO-confirmed.
   - `stack.platforms` empty after intersection → record `bootstrap-failure: { adapter: none, step: stack-intersection, remediation: "Re-run /wf intake to reconcile." }` and skip to teardown. Do NOT pick a default adapter.
   - Multi-match is common; drive all platforms in `stack.platforms`. Record final adapter keys under `adapters-used:`.
2. **Bootstrap each matched adapter** per its `Bootstrap` section. If any bootstrap step fails after documented resolution attempts, report `bootstrap-failure: { adapter, step, exit-code, output-tail, remediation }` and do NOT proceed past bootstrap for that adapter. The AC gate (Step 7.5) will refuse `result: pass` and require an `interactive-verification: deferred` annotation or a remediation pass via `/wf probe`.

2b. **Capture longitudinal baseline before driving (MANDATORY).** Before driving any criterion, capture before-state screenshots:
   - If a prior evidence run exists at `.ai/workflows/<slug>/verify-evidence/<slice-slug>-run-*/`, use those as the before-state.
   - Otherwise, create a **temporary worktree at the base branch** (`git worktree add <tmp-dir> <base-branch>`), boot the adapter against it, screenshot each named surface, then remove the worktree (`git worktree remove <tmp-dir>`). Store as `baseline-<surface>.png`. Never stash — the working tree's in-progress state stays untouched.
   - Compare each post-drive screenshot against its baseline. Report visual deltas (layout, missing/new elements, color or typography shifts) under `## Longitudinal Delta`. A delta is a finding only if it contradicts the criterion or product conventions.

3. **For each user-observable AC**, follow the adapter's `Drive` and `Observe` recipes, and gather evidence a reviewer can trust:
   - **Capture the moments that show the behavior** — initial response, transition/loading state, final settled state — named `-initial` / `-transition` / `-final`. Report any blank or broken intermediate state.
   - **Re-drive the criterion at least twice more** without resetting state. A differing re-drive is `stability: flaky` — a HIGH issue. Record `stability-check-flaky-count: <N>`.
   - **Make one perceptual pass on the final state**: independent of the criterion, what would a first-time user notice? Record under `## Friction Notes` (informational unless it contradicts product conventions from step 0).
   - **Investigate every anomaly** (console error, unexpected network request, missing or extraneous element) to a sub-finding — DevTools console, network tab, DOM. Never filter an anomaly as "probably unrelated"; record it and let the reviewer decide.

   - Navigate or invoke the surface named in the criterion.
   - Perform the user actions described.
   - Apply the multi-point capture, stability check, perceptual review, and anomaly investigation protocols above.
   - Record: criterion id or quoted text, adapter used, evidence paths (all frames), stability result, perceptual notes, anomaly findings, pass/fail.
4. **Tear down each adapter** per its `Tear down` section. Idempotent — re-runs of verify must not leave the environment dirtier each pass.
5. **Run existing test suites** that target the same surface (Playwright/Cypress E2E for web, Maestro suites for Android, XCUITest for iOS, etc.) in addition to the per-criterion drives, when they exist. The adapter's `Drive` section names the relevant suite invocations.

6. **Free exploration (MANDATORY).** After verifying all AC, set aside the criteria list and navigate as a first-time user. Cover every interactive element, at least one adjacent flow, and try reaching the outcome via a different path. Note anything surprising, incomplete, or broken. Record under `## Free Exploration Notes` — informational, do not affect `result:`, but visible to reviewers. Any finding that directly contradicts an AC becomes a standard issue.

7. **Adversarial micro-tests (MANDATORY).** After free exploration, probe the failure modes the primary action surface **invites** — empty, extreme, repeated, interrupted, degraded — where applicable to that surface (a read-only dashboard invites no empty-submission test; a form invites them all): empty submission, oversized input, rapid repeat, mid-flow interruption (navigate away and back), and simulated network failure. A crash or unhandled error is a BLOCKER; UI breakage is HIGH; graceful handling is informational. Record all results under `## Adversarial Tests`; name any mode skipped as inapplicable and why. BLOCKER and HIGH findings enter the main issue list.

8. **Failure mode probes (MANDATORY).** For each user-observable AC whose surface invites them, probe boundary conditions after the happy path: slow response (network throttling), concurrent session (a second independent session acting simultaneously), and session expiry (when auth is in scope). Record under `## Failure Mode Probes`; unhandled error states are HIGH issues.

The runtime-adapters.md `Evidence protocol` and `Accessibility checks` sections apply across all platforms; do not duplicate them here.

**Incidental defects observed while driving** are recorded against the shared classes in `_surface-defects.md` (`dead-affordance`, `error-surface-leak`, `ambiguous-copy`, `terminal-wait`, `fabricated-value`, `dependency-collapse`, `branch-gap`, `boundary-overflow`) so verify, probe and review speak one vocabulary. Verify does not run the full sweep — an exhaustive surface pass is `probe … sweep`.

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
- `longitudinal-baseline-compared: <true | false | skipped — <reason>>`
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
Apply the early-stop guard in [_autonomy-guards.md](_autonomy-guards.md) before ending the turn. After writing files, return per [_chat-return.md](_chat-return.md) — narrative lead in the artifact's `## The Verification` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `result: <pass | fail | partial | blocked-runtime-evidence-missing>`
- `convergence: <not-needed | converged | escalated>` — include the `fix-rounds-run` count and a one-line "what the loop did" summary when `convergence != not-needed`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. Confirm the selected slice.
2. Determine the relevant verification commands from the repo.
3. **Track the stage's units in the task tracker** — one task per check (lint, typecheck, tests, build, …) and one per acceptance criterion from `03-slice-<slice-slug>.md`, plus the artifact write. Keep statuses truthful as results land.
4. **Run checks** (parallel sub-agents if multi-concern): lint, typecheck, tests, build, smoke tests, manual checks. Record a failed check as `FAILED: <output summary>` on its task. Do NOT fix yet — the user-gated fix loop runs once in Step 7.6 after all checks finish and the AC gate has partitioned issues.
5. **Verify acceptance criteria.** Compare results with each criterion from `03-slice-<slice-slug>.md` and `02-shape.md`. Record an unmet criterion as `NOT MET: <reason>` on its task.
6. If verification reveals gaps caused by external dependency behavior or standards drift, run a freshness pass and record it.
7. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
7.5. **Apply the user-observable AC gate** (see "User-observable AC gate" section below). Partition AC into `code-only` vs `user-observable`. For every `user-observable` AC, require a matching entry in `interactive-verification-results`. If any has no match AND no `interactive-verification: deferred` annotation, write `result: blocked-runtime-evidence-missing` and list the missing AC in `## Issues Found`.
7.6. **Single-round verify-owned fix loop** (see "Verify-owned fix loop" section below). Snapshot `metric-issues-found-initial`. Auto-fix mechanical classes; triage each remaining failure via `AskUserQuestion`; `Fix` choices spawn parallel worktree-isolated sub-agents; re-run only affected checks once. Record `fix-rounds-run`, `convergence`, `metric-issues-found-final`. ONE round only — if anything still fails, finalize with `convergence: escalated` and route to re-invoke verify or `/wf implement`.
8. Mark "Write 06-verify" task `in_progress`. **Write `06-verify-<slice-slug>.md`** (per-slice file, see template below). Mark `completed`.
9. **Write/update `06-verify.md`** (master index with links to all per-slice verify files).
10. Update `00-index.md` accordingly and add files to `workflow-files`. **Then promote the slice's roster status** — in `03-slice.md`'s `slices:` entry for this slice, `result: pass` sets `status: complete`; any other result (`fail`, `partial`, `blocked-runtime-evidence-missing`) leaves it at `status: in-progress`. A deferral-only `partial` is **not** complete — the AC still owes runtime evidence, and `/wf ship` blocks on it. Set only this slice's entry; do not touch siblings, do not renumber, and never move an entry that `close.md` set to `skipped`.

    This is the second half of the write-back `implement.md` step 12 starts. Handoff's aggregate mode collects only `complete`/`in-progress` roster entries, so a slice left at `defined` is invisible to packaging no matter how much of it was actually built and verified.

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

**CI/pipeline configuration cannot clear on `static` evidence.** An AC whose deliverable is *the pipeline itself* — a `.github/workflows/*.yml`, a CI job definition, a release or deploy workflow, a commit-hygiene or lint gate, a container build spec — is a program whose runtime is the CI runner. Reading it and finding it plausible is exactly the `static` rung, and `static` does not evidence a program's behavior here any more than it does anywhere else. The failure this closes: a slice authored its own workflow YAML, a `/health` end-to-end job, and commit-hygiene gates, earned a `ship` verdict on read-it-and-reason evidence, and **first contact with a real CI run** surfaced a doubled pnpm version across five files, a secretless-CI false-red, six commitlint failures, and a real SSR-XSS.

So such an AC records `evidence-rung` no lower than the **free static battery**, and that battery is **not optional**:

- run the repo's own formatter/linter over the changed config (`actionlint`, `yamllint`, `prettier --check`, whatever the repo already ships);
- **check every version literal against the repo's own declarations** — the package manager version in the workflow vs `packageManager`/lockfile, the language runtime vs `.nvmrc`/`.tool-versions`/`go.mod`, the action refs vs what the repo pins elsewhere. Version drift between a workflow and its repo is the single most common shape of this defect;
- **lint the graph** — job `needs` references resolve, no cycles, referenced jobs and reusable workflows exist, matrix keys are consumed;
- name which steps depend on secrets and state explicitly what a secretless run does (a job that silently red-lights without a secret is a false failure the team learns to ignore).

This is the same battery `/wf ship-plan build` already runs against pipeline outputs; a slice that authors CI does not get to skip it merely because it arrived through the slice door.

A **real-executor** probe — `act`, a draft-PR smoke run, a scratch branch push — stays **recommended, not required**: its cost/benefit is the project's call. But when one is run, it is the rung that actually clears the AC, and the deferral path applies unchanged when it cannot be: probe the incapability, name the rung, record the receipt.

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

**Classify the wall before deferring it (`wall-ownership` — MANDATORY).** Every deferral records
`wall-ownership: code-owned | environment-negotiable | external`, decided by the ladder's triage
question (runtime-adapters.md → *Classify the wall before you climb it*): **would a change to code in
THIS repo dissolve this wall?** A hard-coded host/port/endpoint in a debug source set, a fixture uid
production rules reject, a harness reading exactly one env-var name — those are `code-owned` walls
wearing environmental costumes, and the deferral hatch is **unavailable** to them until the
repo-change option has been surfaced as a decision: scoped in this slice, scoped as a prerequisite
slice/harness, or declined on the record (`harness-declined: <reason>`). "The port is held" is a
symptom; `const PORT = 8080` in your own debug build is the wall. Deferring the symptom re-pays it
every slice while the cure sits unwritten.

**Attempt before declare (positive-evidence capability probes).** "The environment cannot produce X" may be written ONLY after *executing* a capability probe and recording its literal command + output tail — `firebase projects:list` / `gcloud auth application-default print-access-token` for deploy credentials, `adb devices` for devices, an env-var check for keyed services, one spec run past the guard for credential-gated suites. A defer-reason with no recorded probe is invalid. Read-only introspection probes are always allowed unprompted; quota-consuming or traffic-sending probes follow the ladder's pre-authorization rule.

**Provision-before-declare, and provisioning must persist.** Before declaring an environment wall, check whether the repo (or the plan's `## Verification Strategy`) already ships provisioning for exactly this capability — a `scripts/create-*-avd.ps1`, an emulator bootstrap, a seed script — and RUN it; a wall whose cure sits unexecuted in the repo is not a wall (one slug deferred device evidence for days while the plan's own AVD-creation script sat unrun). Capability provisioned *inside this run* counts only if it persists beyond the run: invoke the repo's script, or write one and record its path in the evidence — an emulator "provisioned" only inside a subagent's ephemeral context does not exist afterward, and its false wall re-stands for every later stage. Environment claims are also **subagent-untrusted**: when a delegated verify reports "no device / port held / no emulator", the orchestrating context re-executes that probe itself once before accepting the deferral — stale relayed environment facts once calcified into a days-long false wall that human pushback dissolved in minutes (and the real device evidence then exposed 4 defects the all-green mocked verifies had missed).

**A skipped-guard sweep is an error, not a deferral.** When every spec exits via a credential/environment guard (0 specs executed), the criterion is `blocked-runtime-evidence-missing` with the unmet precondition named ("set `E2E_ADMIN_USER_EMAIL`/`_PASSWORD` and re-run") — NEVER `interactive-verification: deferred`. Deferral is reserved for evidence no reachable rung can produce.

**A per-AC skip is the same error, one AC deep.** When *some* specs ran green but the spec that is the **designated evidence for a specific AC** was skipped (guard exit, `.skip`/`.todo`, missing env/secret, filtered out), that AC produced **no** evidence — it cannot inherit the suite's green. Route it through the ladder (another rung), or defer with a probe receipt, or write `blocked-runtime-evidence-missing`. This is the per-AC companion to the all-skipped sweep above; the skipped specs are recorded as `skipped-gating-specs: [{spec, ac, precondition}]` (Step 4 Test Execution).

To proceed without a hard fail once the residual is genuinely environment-bound, the slice author may add to the per-slice verify file frontmatter:

```yaml
interactive-verification: deferred
interactive-verification-defer-reason: "<rungs tried + env-remediation attempted + the residual that survives them — not a bare 'no device'>"
interactive-verification-wall-ownership: code-owned | environment-negotiable | external
```

When this annotation is present on a slice:
- The gate writes `result: partial` (not `pass`) with a note that runtime evidence was deferred.
- The deferral is appended to `00-index.md` under `runtime-evidence-deferrals` (see schema below).
- `/wf review` and `/wf handoff` proceed with a soft warning; `/wf ship` HARD-BLOCKS until every deferral is cleared by a subsequent `/wf probe` run that produces matching evidence, or by re-running verify in a capable environment.
- **Clearing evidence must match the AC's direction.** A prove-fail-closed AC (a gate/guard/health-check catching a failure — see shape.md's direction rule) is cleared only by evidence of the *failure branch firing*: an induced fault caught, a bad input rejected, a forced timeout falling back. A green happy-path run clears only the prove-pass half. Refusing the mismatch here is the whole point — one "unhealthy revision caught" AC was cleared by a perfectly healthy release, recording the gate as proven when it had never once fired. When the mismatch is detected, say what evidence *would* qualify (the fault to inject) instead of clearing.

**A clearing event names an actor, not a hope (MANDATORY).** `cleared-by` must target a
*provisionable* event — something a person or a run can **cause**: "after `<slice>` lands the
configurable-port change, run `/wf probe <slug>` with the emulator on any free port", "cleared by the
`-rc.N` prerelease CI run", "cleared once `scripts/create-verify-avd.ps1` has been run on this host."
Passive waits are **not** clearing events: "once host port 8080 frees", "when a device becomes
available", "when the environment allows" pin the deferral to state nobody in the loop controls, so
it is indefinite by construction — and it will read as progress in `/wf status` while nothing can
ever move it. When the only honest clearing event is passive, that is itself the finding: either
provision the capability (which nearly always means the wall was `code-owned` or
`environment-negotiable` all along — re-run the ownership triage), or record an explicit PO
acceptance that this AC waits on an uncontrolled event. A `code-owned` wall can never have a passive
clearing event: its clearing event is a change you are able to write.

**One writer per fact — a deferral is recorded ONCE.** The deferral lives in exactly one place per surface: the frontmatter annotation on the slice, the `runtime-evidence-deferrals` entry in `00-index.md`, and — when a driver is orchestrating — the structured `deferrals[]` return, each carrying the probe receipt. Do **not** additionally park a bare copy in the sibling "residual / could-not-fix" list; that list carries only what is **not** a deferral. Two copies of one deferral, receipted in one place and bare in the other, read to any consumer as two different ACs — one of them apparently un-probed. That exact asymmetry false-stopped a fully compliant slice and cost two whole autonomous runs before the consumer was taught to normalize it. Normalizing at the consumer is a patch; emitting once is the fix.

**A fail is not a deferral, in either direction.** A deferral says *evidence could not be produced*; a `fail` says *the behavior is wrong*. An AC you actually drove and found broken is `result: fail` and is recorded as a failure — never in `deferrals[]`, never in the index ledger. The reverse is equally binding on consumers: a run report may not re-label a recorded fail as a deferral, because that tells the user to go collect evidence for a defect. One verify recorded two ACs as fails with zero deferrals and the driver's summary listed both as deferrals.

**Decision (recorded in plan §2.4):** No silent skip. Every deferral is named, dated, and surfaces in progress view and dashboard. The block bites at ship, not earlier — in-flight work waiting on an environment is not stalled mid-pipeline.

## 00-index.md additions for deferrals

When a slice's verify writes a deferral, append to the workflow index:

```yaml
runtime-evidence-deferrals:
  - slice: <slice-slug>
    reason: "<verbatim defer-reason>"
    deferred-at: "<iso-8601>"
    wall-ownership: code-owned | environment-negotiable | external   # ladder triage verdict
    clearing-event: "<the provisionable act that clears this — never a passive wait>"
    clearing-probe: "<ONE side-effect-free command answering 'has that act happened yet?'>"
    cleared-by: null    # set to <probe-descriptor> when a probe run clears the deferral
    repeat-of: <slice-slug>   # ONLY when this deferral's constraint matches an earlier entry — see below
    absorbed-by: [<slice-slug>, ...]   # slices that inherit this open deferral instead of clearing it
    needed-by: <slice-slug>   # the slice that consumes this prerequisite; set at plan time
```

**`clearing-probe` — how anyone finds out the event happened (STRONGLY EXPECTED).** A clearing event that names a provisionable act is only half the job; something has to *notice* when the act occurs. So a deferral whose clearing event is provisionable should also carry a **one-line, side-effect-free command that answers "has it happened yet?"** — `adb devices | grep -q emulator`, `curl -sf localhost:8080/health`, `test -f .env.e2e`, `gh run list --workflow release -L1 --json conclusion`. The ownership triage already forced the author to know what would clear the wall, so writing the check costs one line.

`/wf status <slug>`, `/wf yolo` orientation, and `/wf probe` orientation **execute** these at their cheap moments (one command each, short timeout) and flag hits — *"deferral AC6's clearing event appears satisfied — run `/wf probe <slug>` now."* It is a **tripwire, not a gate**: nothing is cleared automatically, and the probe stage still owns evidence. This exists because one AC's clearing event ("device available for the AC6 run") was satisfied **in the same session** — emulator booted, branch app installed, on screen — and nothing noticed; the retro recorded "AC6 shipped uncleared." Omit the field only when no single command can answer the question (a human judgement, a third-party release); an omitted probe is a silent "nobody is watching this one".

**Repeat-deferral marker.** Before appending, scan existing `runtime-evidence-deferrals` for an entry naming the *same environment dependency* (fuzzy match — same credential gate, device class, or missing service). On a match, append `repeat-of: <slice-slug of the first occurrence>`: the accumulation becomes visible in the artifact, `/wf status`, and dashboard. A wall paid twice is plan's tripwire — the next plan for this slug MUST scope the harness that retires it or record `harness-declined: <reason>` (see plan.md's repeat-deferral tripwire).

**Deferral stacking is a stop, not an absorption.** When a later slice would inherit an open deferral rather than clear it, append its slug to `absorbed-by`. Absorbing a deferral into a **third** slice is a **STOP**: verify surfaces it as a decision — *"foundation gap: N slices now stack on unproven `<X>` — provision the clearing event now, or PO-accept explicitly"* — and records the resolution in `po-answers.md`. Do not silently let the stack grow. **Re-run the ownership triage at the STOP, do not inherit the original verdict**: a wall first classified `external` under time pressure is exactly the kind that turns out `code-owned` on a second look, and a stack of three is the loudest signal available that the first classification deserves re-examination. "Provision the clearing event" is the *default* branch here, not a co-equal option — PO-accept is for walls genuinely outside the team's reach.

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

**Mechanical classes auto-fix — no question.** An issue whose class is `lint`, `format`, or `marker-syntax` is reversible, in-worktree, and mechanical: triage it `Fix` yourself, without `AskUserQuestion`, and report what was auto-fixed — with diffs — in the round summary. Anything unclassified, scope-changing, or behavior-changing still asks.

For each remaining issue, call `AskUserQuestion`. Batch up to 4 issues per call. Each question:
- **header**: an issue identifier (e.g., `LINT-1`, `AC-3`, `RUNTIME-MISSING-2`, `BENCH-REG`).
- **question**: `"{issue type}: {one-line summary} at {file:line or check name}"`.
- Options:
  - `Fix` / label: "Fix this now", description: "Spawn a sub-agent to apply the minimal patch in this run."
  - `Skip` / label: "Skip", description: "Leave as-is for now; will surface in the verify artifact under Issues Found."
  - `Escalate` / label: "Escalate", description: "Out of scope for verify — route to `/wf implement` or back to plan."

Triage of non-mechanical issues is **always required**. Outside the mechanical carve-out above, verify never silently auto-fixes. If the user picks `Skip` for everything, the loop ends with `convergence: not-needed` and failures remain recorded.

## Fix dispatch (single round)

Dispatch a fix sub-agent for **every** issue triaged `Fix` **in parallel** (single message, multiple Task calls) — each fix runs in its own worktree, so concurrent patches cannot collide; the sanity-check in step 3 is the merge gate. For each issue:
1. Add a tracker task: `subject: "Fix [{ID}]: {title}"`, `metadata: { slug, stage: "verify-fix", slice: "<slice-slug>", issueId: "{ID}" }`.
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

   The suggested fix names a METHOD, not only an outcome. Follow it. If
   you conclude it is wrong or impossible you may deviate — but say so
   in the FIRST line of your return, not in a closing note.

   Return, in this order:
     Method: as-prescribed | deviated
     (if deviated) what was suggested / what you did instead / why
     A brief summary of what you changed, including the regression test
     path (or the one-line exemption reason).
   ```
3. As each sub-agent returns: read the changed file(s) from the worktree path; sanity-check the patch against **both** the issue and the suggested fix's method ([_fix-loop.md](_fix-loop.md) rule 5). A `Method: deviated` return is never merged on the subagent's own say-so — re-read the patch against what was suggested and decide deliberately; when the suggestion carried an explicit prohibition, a deviation touching it is discarded, not merged. If the patch looks correct, merge the worktree changes into the main working tree (e.g., `git checkout <worktree-branch> -- <changed-files>`). **If two patches overlap on the same lines**, merge one, then re-dispatch the other against the merged state — serial for the conflicting pair only. If the patch is wrong, discard the worktree without merging and record `COULD NOT FIX`.
4. Complete the tracker task. If the sub-agent could not fix, record `COULD NOT FIX: <reason>` on the task and treat this issue as `convergence: escalated` material in the next step.

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
longitudinal-baseline-compared: <true | false | "skipped — <reason>">
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
<!-- STORY SECTION — first, and self-sufficient. MUST follow `_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language MUST follow `_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

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

**Task rungs (contract §7).** Task workflows (`workflow-type: task`, standalone or compressed slice) place two further rungs on the same ladder: `attested` — a named external party or human confirmed the outcome, recorded with a citation — sits below `live` and above the mock rungs; `asserted` — a claim of success with no independent read-back — is task-land's `uncited-mock` and cannot close an AC. Re-reading a real, non-runtime system of record after acting (an `ls`, a `curl`, an API query) **is** `live`. The definitions and the gate rule are the contract's (`EVIDENCE-SCHEMA-CONTRACT.md` §7); do not restate them elsewhere.

Per-slice rollup line under this section (`evidence: live 2 / headless 1 / cited-mock 3`). `00-index.md` gets an `evidence-quality:` slug rollup (counts by rung) plus `metric-acceptance-mock-rung` frontmatter = the count of user-observable ACs whose `evidence-rung` is `cited-mock`, `uncited-mock`, `static`, or `asserted`.

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
- **Bundle size delta:** `<+N% | -N% | skipped — <reason>>` (HIGH if ≥ +20%)
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
