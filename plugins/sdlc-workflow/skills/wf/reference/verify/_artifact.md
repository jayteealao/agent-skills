# Verify artifact schemas

`verify.md` steps 8 and 9 write these two records. Write the draft of each record to `<wf-dir>/.draft/<name>`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` ([_records.md](../_records.md)). Frontmatter carries every machine-readable field; the body is the contract that review, handoff, and design audit read. Raw check output goes to `verify-evidence/<slice-slug>/checks.md`.

## `06-verify.md` (master index)

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
recommended-routes:
  - invocation: "/wf review <slug> <slice-slug>"
    reason: "<one phrase>"
    default: true
---
```

Body: `# Verify Index`, then one line per slice: `<slice-slug>: <result> — 06-verify-<slice-slug>.md`.

## `06-verify-<slice-slug>.md` (per-slice verify)

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
verified-head: "<the HEAD sha>"                 # only when the result is clean: pass, or a partial with only deferrals
metric-checks-run: <N>
metric-checks-passed: <N>
metric-acceptance-met: <N>
metric-acceptance-total: <N>
metric-acceptance-user-observable: <N>          # AC partitioned as user-observable
metric-acceptance-code-only: <N>                # AC partitioned as code-only
metric-interactive-checks-run: <N>
metric-interactive-checks-passed: <N>
metric-issues-found: <N>                        # final count (== metric-issues-found-final)
metric-issues-found-initial: <N>                # snapshot before the fix loop
metric-issues-found-final: <N>                  # snapshot after the fix loop
fix-rounds-run: <0 | 1>                          # 0 if no issues or no Fix triage decisions; 1 if the loop ran
convergence: <not-needed | converged | escalated>
verify-owned-fix-commit: "<SHA | null>"         # null if no fixes landed, re-check still failed, or branch-strategy: none
regression-tests-added: <N>                     # a code-bug fix with neither a test nor an exemption is a MED finding
constraint-resolution-missing: []               # user-observable AC whose plan-named env dependency has no constraint-resolution: line; route to /wf plan
interactive-verification: <required | deferred | not-applicable>
interactive-verification-defer-reason: "<string>"  # required when interactive-verification == deferred
adapters-used: [<key>, ...]                     # runtime adapters driven
bootstrap-failures: []                          # {adapter, step, remediation} from sub-agent 3
evidence-dir: "<wf-dir>/verify-evidence/<slice-slug>/"
evidence-run-count: <N>                         # 1 for the first run; prior evidence archived to <slice-slug>-run-<N-1>/
security-scan-result: <pass | fail | skipped>  # BLOCKER if fail; skipped only when no tooling is installed
metric-a11y-violations-new: <N>                # new WCAG AA violations in slice-modified UI components
a11y-result: <pass | fail | not-automatable>   # HIGH if fail; not-automatable surfaces as a gap
accepted-by: <decision id | delegate>          # only when a live decision accepts a failing item
accepted-at: <ISO 8601>
accepted-items: []                             # the accepted items, one line each
cross-slice-regressions-found: 0               # verify runs no sibling suite; the packet-end full suite covers it
stack-source: <confirmed | unconfirmed-auto-detect>   # Step 0.5 stack gate; downstream stages may refuse unconfirmed-auto-detect
skipped-gating-specs: []                       # [{spec, ac, precondition}] from sub-agent 2
debt-markers-found: <N>                        # sdlc-debt: markers in this slice's diff (sub-agent 1)
debt-markers-malformed: <N>                    # no ceiling or no upgrade path
debt-markers-unrecorded: <N>                   # absent from the implement record
metric-bundle-size-delta-pct: <N | "skipped">  # only with benchmark or a performance AC; % change vs. base branch; HIGH if ≥ 20%
ac-staleness-checked: <true | false>
ac-stale-count: <N>
longitudinal-baseline-compared: <true | false | "skipped — <reason>">
stability-check-flaky-count: <N>               # criteria that differed across 3 drives; >0 is HIGH
adversarial-tests-run: <N>
adversarial-tests-failed: <N>                  # BLOCKER/HIGH adversarial findings
failure-mode-probes-run: <N>
cross-browser-delta: <"none" | "findings">     # HIGH if findings
web-vitals-lcp-ms: <N | null>                  # null if non-web; WARN if > 2500 ms
web-vitals-cls: <N | null>                     # WARN if > 0.1
web-vitals-inp-ms: <N | null>                  # HIGH if > 200 ms
design-comparison: <pairs | no-screens | not-applicable>  # no-screens: no visual pass, no mock-fidelity pass
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
next-invocation: "/wf review <slug> <slice-slug>"
recommended-routes:            # Adaptive routing options A–G, when applicable
  - invocation: "/wf review <slug> <slice-slug>"
    reason: "<one phrase>"
    default: true
---
```

**`result` semantics.** `pass`: every AC met, and every user-observable AC has matching interactive evidence. `fail`: at least one AC is substantively not met (the code is wrong). `partial`: at least one AC is partially met, or `interactive-verification: deferred` is set on at least one user-observable AC. `blocked-runtime-evidence-missing`: at least one user-observable AC has no matching interactive evidence and no deferral annotation (procedural; it routes differently from `fail`).

**`interactive-verification` semantics.** `required` (default): the slice has user-observable AC and runtime evidence was produced for all. `deferred`: the environment could not support at least one; `defer-reason` is set. `not-applicable`: no user-observable AC; the gate did not apply.

## Body sections, in order

- `## Verification Summary`
- `## Automated Checks Run` — one line per check: `command/check: result (pass/fail, summary)`. The full output is in `verify-evidence/<slice-slug>/checks.md`.
- `## Acceptance Criteria Status` — per criterion: **criterion** (quoted text or id), **kind** (`code-only` | `user-observable`, from the partition rule), **status** (met / partially met / not met / unverified / runtime-evidence-missing), **verification method** (automated / interactive / manual), **evidence** (test name / `verify-evidence/<slice-slug>/<file>` path / "(none — runtime evidence missing)"), **evidence-rung** (the highest rung that produced the evidence: `live | headless | emulator-or-container | cited-mock | uncited-mock | static | n-a`; `n-a` for `code-only` ACs). Task workflows (`workflow-type: task`) add two rungs from the contract (`EVIDENCE-SCHEMA-CONTRACT.md` §7): `attested` (a named external party or human confirmed the outcome, recorded with a citation; below `live`, above the mock rungs) and `asserted` (a claim with no independent read-back; task-land's `uncited-mock`; cannot close an AC). Re-reading a real, non-runtime system of record after acting (an `ls`, a `curl`, an API query) is `live`. Close with a rollup line (`evidence: live 2 / headless 1 / cited-mock 3`); `00-index.md` gets an `evidence-quality:` slug rollup (counts by rung) plus `metric-acceptance-mock-rung` = the count of user-observable ACs whose `evidence-rung` is `cited-mock`, `uncited-mock`, `static`, or `asserted`. Set both fields with one `wf.mjs record set "<root>" <slug> index` call. The `kind` column makes the gate auditable.
- `## Issues Found` — `severity: issue` per line.
- `## Verify-Owned Fixes` — present when `fix-rounds-run > 0`. Table `| ID | Type | Triage | Sub-agent outcome | Regression test | Re-check result |` with values Fix / Skip / Escalate; Patched / Could not fix / N/A; `<path>` / `exempt: <reason>` / `n-a`; Pass / Still failing / Not re-run. Then `Commit: <SHA | "(no commit — branch-strategy: none)" | "(no files changed)">` and `Regression tests added: <N>`.
- `## Augmentation Verification` — only when `02c-craft.md` or `augmentations:` is non-empty: mock fidelity items (honored / deviations / unhonored, each with `file:line` and evidence), one row per augmentation re-check, outstanding design findings from `07-design-audit.md` / `07-design-critique.md`, instrumentation signal coverage from `04b-instrument.md`, experiment wiring from `04c-experiment.md` (flag, cohort, metrics, rollback), benchmark compare-mode delta from `05c-benchmark.md`.
- `## Design Comparison` — only when the slice builds a surface that `02c-craft.md` `surfaces:` names. With approved screens, write one row per screen key: `| Key | Approval picture | Capture | Differences |`. The approval picture is the picture of the screen at `approval-commit` (`design/_surface.md`). The capture is the path that `wf.mjs design capture-path` prints, or `none — <reason>` when the stack cannot capture the surface. Set `design-comparison: pairs`. With no approved screen, write "No screens" and set `design-comparison: no-screens`; then report no visual pass and no mock-fidelity pass. With no drawn surface, omit the section and set `design-comparison: not-applicable`.
- `## Design Audit` — only when `02c-craft.md` names `screens:` ([_augmentation.md](_augmentation.md)). The platform and how each target was measured (browser, `uiautomator dump`, UI Automation, or read from code). Then a table `| Severity | Rule | Where | Problem | Fix |`, where **Where** is `file:line` or a screen key. A blocker or high row is also a line of `## Issues Found`. With no finding, write "No finding".
- `## Accessibility Gate` — tool used, new WCAG AA violations, per violation `rule-id: element — description`.
- `## Performance Gate` — bundle size delta (HIGH at ≥ +20%), build time delta, cold-start delta (service/CLI only), and the web vitals (web only: INP above 200 ms is HIGH; LCP above 2500 ms and CLS above 0.1 are WARN, per `runtime-adapters/web.md`).
- `## Friction Notes` — perceptual and product-convention observations; informational unless escalated.
- `## Free Exploration Notes` — `<finding> — <informational | escalated to issue: <severity>>`.
- `## Adversarial Tests` — table `| Test | Result | Finding |` over empty submission, max-length input, double-click / rapid repeat, mid-flow interruption, offline / network failure; result pass / fail / n-a.
- `## Cross-Browser Delta` (web only) — primary browser, secondary browser (Firefox | WebKit), divergences found.
- `## Caveats` — stack provenance (`stack-source`), adapters excluded by the stack, and any other limit on the evidence.
- `## Gaps / Unverified Areas`, `## Freshness Research`, `## Recommendation`.

## `verify-evidence/<slice-slug>/checks.md` (check output)

No frontmatter. No stage reads it; it is the audit record. Write, in order: the raw output of each automated check; per user-observable criterion, the platform, tool, steps performed, evidence paths, and observation; the security scan output (CVE, secret detection, SAST); the cross-slice regression runs; the longitudinal delta per surface; the failure mode probes (`| Probe | Result | Finding |` over slow response, concurrent session, session expiry). Put each finding from these checks in `## Issues Found` as well.
