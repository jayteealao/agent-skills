# Verify sub-agent charters

`verify.md` Step 4 dispatches these charters per [../_subagents.md](../_subagents.md). Children may build, boot, and drive; they never edit source. Each returns evidence; the parent composes the artifact and the verdict. Inject the active `steer.md` entries into every prompt ([../_steering.md](../_steering.md)).

### Functional sub-agent 1 — Static Analysis & Build

Prompt the agent with all of the following.

**Lint and format.** Detect the linters from config files (`.eslintrc*`, `biome.json`, `ruff.toml`, `.golangci.yml`, `Cargo.toml [lints]`). Run them (`npm run lint`, `ruff check .`, `golangci-lint run`, `cargo clippy`). Report pass/fail, errors vs warnings, and which errors sit in files this slice changed vs pre-existing.

**Type checking.** Detect the type system (`tsconfig.json`, `mypy.ini`, `pyright`, the Go or Rust compiler); run it (`npx tsc --noEmit`, `mypy .`, `go build ./...`, `cargo check`); report pass/fail and slice-affected vs pre-existing errors.

**Build.** Run the project build (`npm run build`, `go build ./...`, `cargo build`, `make`); report success/failure, warnings, and the output artifact.

**Default performance gate (every slice, with or without the `benchmark` augmentation).**
- **Bundle size (web):** compare the output artifact size against the base branch through a temporary worktree, never a stash: `git worktree add <tmp-dir> <base-branch>`, build there, `du -sh` both outputs, `git worktree remove <tmp-dir>`. The working tree's in-progress state stays untouched. A size increase ≥ 20% in any chunk is HIGH. Record `metric-bundle-size-delta-pct`.
- **Build time delta:** wall-clock time of the current build vs the base-branch build (from the worktree comparison, else CI cache statistics). An increase ≥ 30% is a WARN.
- **Startup time (service/CLI):** measure cold start (`time curl -s localhost:<port>/health` after a fresh start). An increase ≥ 15% vs the base branch is HIGH.
- If the worktree comparison is impossible, record `metric-bundle-size-delta-pct: skipped — <reason>` and the absolute artifact size. This gate is the lightweight floor; the `benchmark` augmentation adds profiling.

**Security scanning (every slice).**
- **Dependency CVEs:** `npm audit --audit-level=high`, `cargo audit`, `pip-audit`, `go list -json -m all | nancy sleuth`, or the project's equivalent. New critical/high CVEs introduced by this slice are BLOCKER.
- **Secret detection:** `git diff <base-branch>...HEAD | trufflehog --stdin` or `gitleaks detect --source=. --log-opts="<base>..<head>"` when available; otherwise grep the diff for API key, secret, password, token, and credential assignments in string literals. Any finding is BLOCKER.
- **SAST:** `semgrep --config=auto` on touched files when semgrep is installed; report new HIGH+ findings in slice-modified files.
- Report `security-scan-result: pass | fail | skipped` (`skipped` only when no tooling is installed and no pattern matched). New findings are BLOCKER regardless of the convergence verdict.

**`sdlc-debt:` marker hygiene (this slice's diff only).** Run `git diff <base-branch>...HEAD | grep -nE 'sdlc-debt:'`. A marker is **well-formed** when it names a ceiling (the known limitation: global lock, O(n²) scan, naive heuristic, hard-coded value) and an upgrade path; a bare marker is LOW. A marker is **recorded** when the shortcut appears in `05-implement-<slice-slug>.md` `## Anything Deferred` or `## Known Risks / Caveats`; an unrecorded marker is invisible debt, MED. Verify validates freshly written markers, not the repo's debt backlog (that is retro's reconcile and `/wf simplify codebase`). Report `debt-markers-found`, `debt-markers-malformed`, `debt-markers-unrecorded`; malformed or unrecorded markers enter the Step 7.6 fix loop (Fix = make it well-formed and record it; the shortcut itself stays).

### Functional sub-agent 2 — Test Execution

Prompt the agent with all of the following.

**Unit tests.** Identify the test files covering the slice's affected modules (grep imports); run them first with verbose output; then run the full unit suite for regressions. Report total/passed/failed/skipped, failures with full error output, and duration.

**Integration tests.** Identify and run the suites covering the affected area with verbose output; report the same counts; note flaky tests (recent skip/unskip patterns in git log).

**Coverage (when configured).** Report coverage for the files this slice changed; flag new code paths at 0%.

**Skipped-gating-spec mapping (a skip is a missing-evidence event, not a green).** A spec that did not execute (guard exit, `.skip`/`.todo`, missing env or secret, filtered out) produced no evidence for the AC it gates and cannot inherit the suite's green. Map every skipped spec to its AC and record `skipped-gating-specs: [{spec, ac, precondition}]` (`precondition` = the unmet reason, such as `E2E_ADMIN_USER_EMAIL` unset). The AC gate (Step 7.5) routes each such AC through another rung, a deferral with a probe receipt, or `blocked-runtime-evidence-missing`.

**Cross-slice regression check (when sibling slices were verified).** Read `06-verify.md`; collect every other slice with `result: pass` or `partial`. For each sibling, read `files-modified` from `05-implement-<sibling-slug>.md`; an overlap with this slice's `files-modified` marks a regression target. Re-run the suite scoped to the overlapping files (or the sibling's recorded command from `06-verify-<sibling-slug>.md` `## Automated Checks Run`). Report `cross-slice-regressions-found: <N>` and pass/fail per sibling; a newly failing sibling is BLOCKER. No siblings → `cross-slice-regressions-found: 0` and "no prior verified slices."

### Functional sub-agent 3 — Interactive & Runtime-Truth Verification

**Required when the slice's AC contains any user-observable criterion** (verify.md Step 7.5). Automated tests prove code correctness; this sub-agent proves user-visible behavior. A slice cannot reach `result: pass` while a user-observable AC has no matching interactive evidence.

Platform recipes live in the adapter registry, not inline:

> Read `<skill-dir>/reference/runtime-adapters.md` (the coordinator resolves `<skill-dir>` per [../_host-invocation.md](../_host-invocation.md) before this line reaches a child) and follow the recipe for every adapter whose detection signals match the repo (web / android / ios / cli / desktop / service / notebook). Adapter selection is documented at the top of that file.

**Climb the constraint-resolution ladder before deferring anything.** "No device / no browser / no creds" is the start of a ladder climb, not a defer-reason. For each blocked user-observable AC, climb the ladder for its class (runtime-adapters.md → *Constraint-resolution ladder*), executing any tool bootstrap the plan's `## Verification Strategy` authorized, and record the highest rung that produced evidence. Defer only the residual no rung can reach. Three hard rules:
- **Static reasoning is never evidence for a user-observable AC.** "Decidable by reasoning" proves code correctness, not user-visible behavior. Drive the criterion; do not reason to a `pass`.
- **Verify the layer the AC is about; a user-observable mock is not met.** A user-observable AC whose highest `evidence-rung` is `cited-mock`, `uncited-mock`, or `static` is not met. Climb the ladder (for a live integration, the emulator/testcontainer rung) or take the deferral path. Record the highest rung reached as `evidence-rung` on that AC.
- **Punting to a future slice is a deferral, not a pass.** "Will be verified during `<other slice>`" registers a deferral the later slice (or `/wf probe`) is obligated to clear; it never grounds `result: pass` on this slice.

**Mock provenance and fixture fidelity.** Any mock or fixture that emulates an external interface (library stream/event shapes, HTTP payloads, SDK return types) records `mock-provenance: <node_modules path read | captured-real-output ref | docs URL>`; "from recollection" is illegal, and an unrecorded provenance forces `evidence-rung: uncited-mock`. When an AC's evidence rests on mocked external-interface events, search the installed package for the mocked identifiers (event names, method names); zero hits ⇒ presumptively fictional ⇒ a finding and a cap of `partial` on that AC. Spot-check each fixture's shape against the real contract (the dependency's types or `.d.ts`, official docs, or one free schema-level call) and record `fixture-fidelity: checked | unchecked — <why>` per fixture. Spot-check only (shape and enum names), not a contract-test mandate; `/study-sources` is the natural tool. `fixture-fidelity: checked` is what upgrades a mock from `uncited-mock` to `cited-mock`.

**First-light.** When a slice introduces an external integration whose real behaviour was never observed live in this workflow, register it in `00-index.md`:

```yaml
unproven-integrations:
  - name: <integration>
    introduced-by: <slice-slug>
    first-light: null   # ISO-8601 stamp of the first live observation; null = never observed live
```

While `first-light: null`, every AC depending on that integration caps at `partial`; mock and emulator rungs are proxies, never `pass`. Any live observation (a tagged smoke run, `/wf probe`, a live e2e) stamps `first-light` with its timestamp and lifts the cap.

**Charter scenario.** When the slice carries the `charter scenario executes through step N` standing AC, run it as interactive verification through its covered steps, on the same rungs and the same ladder as any user-observable AC, never a static-reasoning `pass`. It is subject to first-light: a scenario whose critical dependency is still `first-light: null` caps at `partial`. A slug never finishes with its charter scenario unrun against reality: the final slice's scenario (all steps) reaches a real rung before ship. Skip when no slice carries the standing AC (compressed modes, no `## Charter Scenario`).

**Mitigation wiring is traceable; "the code exists" is not evidence.** Any mitigation the shape mandates (fallback, escape hatch, kill switch) is evidenced by an AC that exercises the wired path (fault injection, a forced fallback, a flag flip) with the mitigation firing. Mitigation ACs are `user-observable`; a static read that the branch is present is not their evidence.

Prompt the agent with one coherent charter that covers the following:
0. **Read product context before driving.** Read `PRODUCT-CONTEXT.md` or `docs/product-conventions.md` at repo root, and `02b-design.md` / `02c-craft.md` / `07-design-audit.md` / `07-design-critique.md` when present; skim the most similar existing components and their recent git history. Synthesize a one-paragraph "product conventions" note and hold every observation against it, not only the criterion text. Record divergences under `## Friction Notes` even when the criterion is met.
1. **Match adapters, constrained by the confirmed stack.** Run every adapter's detection signal, then intersect with `stack.platforms` from `00-index.md`. `stack.user-confirmed: true` → effective set = `matched-adapters ∩ stack.platforms`; record exclusions under `## Caveats`. `stack.user-confirmed: false` or `stack-source: unconfirmed-auto-detect` → run all matched adapters, stamp each evidence record `stack-confirmed: false`, and state in `## Caveats` that selection was not PO-confirmed. Empty intersection → record `bootstrap-failure: { adapter: none, step: stack-intersection, remediation: "Re-run /wf intake to reconcile." }` and skip to teardown; do not pick a default adapter. Multi-match is common; drive all platforms in `stack.platforms`. Record final keys under `adapters-used:`.
2. **Bootstrap each matched adapter** per its `Bootstrap` section. On a failure after documented resolution attempts, report `bootstrap-failure: { adapter, step, exit-code, output-tail, remediation }` and do not proceed past bootstrap for that adapter; the AC gate then refuses `result: pass` and requires an `interactive-verification: deferred` annotation or a `/wf probe` remediation pass.
2b. **Capture the longitudinal baseline before driving.** Use a prior evidence run at `.ai/workflows/<slug>/verify-evidence/<slice-slug>-run-*/` as the before-state; otherwise create a temporary worktree at the base branch (`git worktree add <tmp-dir> <base-branch>`), boot the adapter against it, screenshot each named surface as `baseline-<surface>.png`, then `git worktree remove <tmp-dir>`. Never stash; the working tree's in-progress state stays untouched. Compare each post-drive screenshot against its baseline and report deltas (layout, missing or new elements, color or typography shifts) under `## Longitudinal Delta`; a delta is a finding only when it contradicts the criterion or product conventions.
3. **For each user-observable AC**, follow the adapter's `Drive` and `Observe` recipes: navigate or invoke the surface named in the criterion, perform the user actions, capture the moments that show the behavior (`-initial` / `-transition` / `-final`; report blank or broken intermediate states), re-drive the criterion at least twice more without resetting state (a differing re-drive is `stability: flaky`, HIGH; record `stability-check-flaky-count`), make one perceptual pass on the final state (`## Friction Notes`), and investigate every anomaly (console error, unexpected network request, missing or extraneous element) to a sub-finding through the console, network tab, and DOM; never filter one as "probably unrelated". Record criterion id or text, adapter, evidence paths (all frames), stability result, perceptual notes, anomaly findings, pass/fail.
4. **Tear down each adapter** per its `Tear down` section, idempotently; re-runs of verify leave the environment no dirtier.
5. **Run existing suites** that target the same surface (Playwright/Cypress E2E, Maestro, XCUITest) when they exist; the adapter's `Drive` section names them.
6. **Free exploration.** After verifying all AC, set the criteria aside and navigate as a first-time user: every interactive element, at least one adjacent flow, a different path to the outcome. Record under `## Free Exploration Notes` (informational; a finding that contradicts an AC becomes a standard issue).
7. **Adversarial micro-tests.** Probe the failure modes the primary action surface invites (a read-only dashboard invites no empty-submission test; a form invites them all): empty submission, oversized input, rapid repeat, mid-flow interruption (navigate away and back), simulated network failure. A crash or unhandled error is BLOCKER; UI breakage is HIGH; graceful handling is informational. Record under `## Adversarial Tests`, naming any mode skipped as inapplicable and why; BLOCKER and HIGH findings enter the main issue list.
8. **Failure mode probes.** For each user-observable AC whose surface invites them: slow response (network throttling), concurrent session (a second independent session acting simultaneously), session expiry (when auth is in scope). Record under `## Failure Mode Probes`; unhandled error states are HIGH.

The `runtime-adapters.md` `Evidence protocol` and `Accessibility checks` sections apply across all platforms. **Incidental defects observed while driving** are recorded against the shared classes in [../_surface-defects.md](../_surface-defects.md) (`dead-affordance`, `error-surface-leak`, `ambiguous-copy`, `terminal-wait`, `fabricated-value`, `dependency-collapse`, `branch-gap`, `boundary-overflow`) so verify, probe, and review speak one vocabulary; verify does not run the full sweep, which is `probe … sweep`.

**Accessibility gate (all UI adapters: web, android, ios, desktop).** After driving each user-observable criterion, scan the exercised surface. Web: `axe-core` via `@axe-core/playwright`, `page.evaluate(() => axe.run())`, or `npx @axe-core/cli <url>`; report new WCAG AA violations only (diff against a base-branch baseline scan when possible, else all violations in modified components). Android/iOS: the platform accessibility scanner when available (Accessibility Scanner APK via `adb install`), else "a11y scan: not-automatable" with a manual-verify note. Record `a11y-result: pass | fail | not-automatable`; new WCAG AA violations in slice-modified components are HIGH. This floor fires regardless of the `design-harden` augmentation, which adds a deeper scan.

**Output to the calling stage:** `interactive-verification-results: [{criterion, adapter, evidence-paths: [t0, t250, final], stability-result, perceptual-notes, anomaly-findings, observation, result}, ...]`; `bootstrap-failures: [{adapter, step, remediation}, ...]`; `metric-interactive-checks-run: <N>`; `metric-interactive-checks-passed: <N>`; `a11y-result`; `metric-a11y-violations-new: <N>`; `stack-source: <confirmed | unconfirmed-auto-detect>` (inherited from `00-index.md` `stack.user-confirmed` and `04-plan-<slice-slug>.md` `stack-source`; downstream stages may refuse `unconfirmed-auto-detect` without explicit override); `adapters-excluded-by-stack: [<key>, ...]` (matched by detection but absent from `stack.platforms`; empty when the stack was unconfirmed); `longitudinal-baseline-compared: <true | false | skipped — <reason>>`; `stability-check-flaky-count: <N>` (>0 is HIGH); `friction-notes: [<string>, ...]`; `free-exploration-findings: [<string>, ...]`; `adversarial-tests-run: <N>`; `adversarial-tests-failed: <N>`; `failure-mode-probes-run: <N>`; `cross-browser-delta: <none | findings>` (HIGH if findings); `web-vitals: {lcp: <ms>, cls: <score>, inp: <ms>}` (Core Web Vitals via CDP; INP > 200 ms is HIGH).

### Functional sub-agent 4 — Augmentation Re-verification (only if `02c-craft.md` or `00-index.md` `augmentations:` list is non-empty)

Launch only if `02c-craft.md` exists or the `augmentations:` list is non-empty. Enforces contracts the standard test suites do not catch.

> **`verify` is the design consumer that measures (when `stack.ui ≠ ∅`).** The a11y / perf / responsive / web-vitals gates above are the measurable design floor for any UI slice, and the per-augmentation re-checks below confirm each applied transform hit its goal. The canonical laws and absolute bans behind that floor are single-sourced in `design/_design-context.md`: load its Accessibility law and Absolute bans when `stack.ui ≠ ∅`, even without `02b`/`02c`, so the measurable checks match the design canon. These numbers are measured once, here; `/wf review`'s design-audit dimension (and ad-hoc `/wf design audit`) interpret them from `06-verify-*.md` rather than re-running axe-core, so the two stages never disagree about one measurement. Record them in the verify report so audit can read them.

**Mock fidelity inventory check (when `02c-craft.md` is present).** For each item in `02c-craft.md` `## Mock fidelity inventory`, find its disposition in `05-implement-<slice-slug>.md` `## Visual Contract Honored`. "Honored" items: open the cited file:line and confirm the item is implemented as described; do not trust the implementation record blindly. "Deviation" items: surface them in the verify report (not failures by default, but visible). Visual spot-check: load the affected route in the browser tool selected above and compare the screenshot against `02c-craft.md` `## North-star mock`; report composition, hierarchy, or signature-move regressions.

**Type-specific checks (per `augmentations:` entry):**

| Type | Check |
|---|---|
| `design-harden` | a11y scan (axe-core or framework equivalent) on `files-modified`; report new WCAG AA violations. |
| `design-optimize` | Re-measure performance (Lighthouse / DevTools profile / framework perf test) on the modified surface against the documented improvements; flag regressions. |
| `design-adapt` | Re-test responsive behavior at the documented breakpoints; confirm mobile, tablet, and desktop work. |
| `design-colorize` / `design-typeset` / `design-polish` / `design-bolder` / `design-quieter` / `design-delight` | Visual diff against the augmentation's `## What changed`; confirm the changes are present and surrounding UI did not regress. |
| `design-<sub>` (other) | Read `design-notes/<sub>-<timestamp>.md` `## Verification needed` and re-run those checks (`harden` → a11y; `optimize` → perf; `adapt` → responsive). |
| `design-audit` | Read `07-design-audit.md`; confirm every "critical" and "high" finding is resolved in code. |
| `design-critique` | Read `07-design-critique.md`; note actioned vs unactioned recommendations. |
| `instrument` | Read `04b-instrument.md`; for each designed signal, exercise the affected path and confirm the log/metric/trace fires (tests, live observation, or log grep); report missing signals. |
| `experiment` | Read `04c-experiment.md`; confirm the feature flag is wired, the cohort split produces the documented distribution, primary/secondary/guardrail metrics fire on the expected events, and the rollback path works. |
| `benchmark` (status: baseline) | Load `augment/benchmark.md` in compare mode; compare against the `05c-benchmark.md` baseline; flag regressions past the documented tripwires (default >10% CPU / >25% memory). |

**Reporting.** Pass: all mock fidelity items honored, all type checks pass, no critical finding outstanding. Fail: each failure with severity; these become BLOCKER or HIGH issues for `/wf review`.

### Web research sub-agent 5 — Freshness: Dependencies, AC Staleness, and Standards Drift

Launch when any of these holds: a test failure occurred; the plan is older than 14 days (`created-at` in `04-plan-<slice-slug>.md`); the slice modifies an integration point with an external API or schema.

**Dependency drift.** For each failure, check whether the failing library or API released breaking changes since the plan was written; search for known test-compatibility issues with the project's dependency versions; check whether fixtures or mock data reference external schemas or APIs that changed.

**AC staleness (when plan age > 14 days or the slice touches external integrations).** For each AC naming an external API, schema, protocol, or third-party service, search for breaking changes or deprecations since the plan's `created-at`. Flag stale criteria `ac-stale: true` with a one-line change description; staleness is not a verify failure, it surfaces under `## Freshness Research` and routes to `/wf plan` (Option E) when the drift is material. Record `ac-staleness-checked: true | false` and `ac-stale-count: <N>`.
