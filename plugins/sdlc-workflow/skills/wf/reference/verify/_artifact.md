# Verify artifact schemas

`verify.md` steps 8 and 9 write these two files. Frontmatter carries every machine-readable field; the body is narrative.

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
---
```

Body: `# Verify Index`, then `## Recommended Next Stage`.

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
evidence-dir: ".ai/workflows/<slug>/verify-evidence/<slice-slug>/"
evidence-run-count: <N>                         # 1 for the first run; prior evidence archived to <slice-slug>-run-<N-1>/
security-scan-result: <pass | fail | skipped>  # BLOCKER if fail; skipped only when no tooling is installed
metric-a11y-violations-new: <N>                # new WCAG AA violations in slice-modified UI components
a11y-result: <pass | fail | not-automatable>   # HIGH if fail; not-automatable surfaces as a gap
cross-slice-regressions-found: <N>             # sibling slices that newly fail; 0 if first slice
metric-bundle-size-delta-pct: <N | "skipped">  # % change vs. base branch; HIGH if ≥ 20%
ac-staleness-checked: <true | false>
ac-stale-count: <N>
longitudinal-baseline-compared: <true | false | "skipped — <reason>">
stability-check-flaky-count: <N>               # criteria that differed across 3 drives; >0 is HIGH
adversarial-tests-run: <N>
adversarial-tests-failed: <N>                  # BLOCKER/HIGH adversarial findings
failure-mode-probes-run: <N>
cross-browser-delta: <"none" | "findings">     # HIGH if findings
web-vitals-lcp-ms: <N | null>                  # null if non-web
web-vitals-cls: <N | null>
web-vitals-inp-ms: <N | null>                  # HIGH if > 200 ms
consult-runs: []                     # [{trigger, provider, at}] per _consult-triggers.md
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
---
```

**`result` semantics.** `pass`: every AC met, and every user-observable AC has matching interactive evidence. `fail`: at least one AC is substantively not met (the code is wrong). `partial`: at least one AC is partially met, or `interactive-verification: deferred` is set on at least one user-observable AC. `blocked-runtime-evidence-missing`: at least one user-observable AC has no matching interactive evidence and no deferral annotation (procedural; it routes differently from `fail`).

**`interactive-verification` semantics.** `required` (default): the slice has user-observable AC and runtime evidence was produced for all. `deferred`: the environment could not support at least one; `defer-reason` is set. `not-applicable`: no user-observable AC; the gate did not apply.

## Body sections, in order

- `## The Verification` — first, and self-sufficient. Follow `_story-arc.md`: three beats in order (the state this stage inherited, the load-bearing decisions with reasons and counts, what this stage enables next plus the top open risk). Language follows `_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs.
- `## Verification Summary`
- `## Automated Checks Run` — one line per check: `command/check: result (pass/fail, summary)`.
- `## Interactive Verification Results` — per criterion: **Criterion**, **Platform & tool**, **Steps performed**, **Evidence** (`verify-evidence/<filename>`), **Observation**, **Result** (pass / fail / partial, with explanation). When none was needed: "Automated only — [reason]".
- `## Acceptance Criteria Status` — per criterion: **criterion** (quoted text or id), **kind** (`code-only` | `user-observable`, from the partition rule), **status** (met / partially met / not met / unverified / runtime-evidence-missing), **verification method** (automated / interactive / manual), **evidence** (test output / screenshot path / response capture / "(none — runtime evidence missing)"), **evidence-rung** (the highest rung that produced the evidence: `live | headless | emulator-or-container | cited-mock | uncited-mock | static | n-a`; `n-a` for `code-only` ACs). Task workflows (`workflow-type: task`) add two rungs from the contract (`EVIDENCE-SCHEMA-CONTRACT.md` §7): `attested` (a named external party or human confirmed the outcome, recorded with a citation; below `live`, above the mock rungs) and `asserted` (a claim with no independent read-back; task-land's `uncited-mock`; cannot close an AC). Re-reading a real, non-runtime system of record after acting (an `ls`, a `curl`, an API query) is `live`. Close with a rollup line (`evidence: live 2 / headless 1 / cited-mock 3`); `00-index.md` gets an `evidence-quality:` slug rollup (counts by rung) plus `metric-acceptance-mock-rung` = the count of user-observable ACs whose `evidence-rung` is `cited-mock`, `uncited-mock`, `static`, or `asserted`. The `kind` column makes the gate auditable.
- `## Issues Found` — `severity: issue` per line.
- `## Verify-Owned Fixes` — present when `fix-rounds-run > 0`. Table `| ID | Type | Triage | Sub-agent outcome | Regression test | Re-check result |` with values Fix / Skip / Escalate; Patched / Could not fix / N/A; `<path>` / `exempt: <reason>` / `n-a`; Pass / Still failing / Not re-run. Then `Commit: <SHA | "(no commit — branch-strategy: none)" | "(no files changed)">` and `Regression tests added: <N>`.
- `## Augmentation Verification` — only when `02c-craft.md` or `augmentations:` is non-empty: mock fidelity items (honored / deviations / unhonored, each with `file:line` and evidence), one row per augmentation re-check, outstanding design findings from `07-design-audit.md` / `07-design-critique.md`, instrumentation signal coverage from `04b-instrument.md`, experiment wiring from `04c-experiment.md` (flag, cohort, metrics, rollback), benchmark compare-mode delta from `05c-benchmark.md`.
- `## Security Scan` — CVE scan (tool, result, new critical/high count), secret detection (result, findings), SAST (result, new HIGH+ findings).
- `## Accessibility Gate` — tool used, new WCAG AA violations, per violation `rule-id: element — description`.
- `## Performance Gate` — bundle size delta (HIGH at ≥ +20%), build time delta, cold-start delta (service/CLI only).
- `## Cross-Slice Regression` — sibling slices checked (or "none — first slice"), regressions found, per regression `sibling-slug — test-suite: failure summary`.
- `## Longitudinal Delta` — per surface: baseline source (prior evidence run N | base branch screenshot | skipped), visual delta, interpretation (expected change | unexpected — flagged).
- `## Friction Notes` — perceptual and product-convention observations; informational unless escalated.
- `## Free Exploration Notes` — `<finding> — <informational | escalated to issue: <severity>>`.
- `## Adversarial Tests` — table `| Test | Result | Finding |` over empty submission, max-length input, double-click / rapid repeat, mid-flow interruption, offline / network failure; result pass / fail / n-a.
- `## Failure Mode Probes` — table `| Probe | Result | Finding |` over slow response (Fast 3G), concurrent session, session expiry mid-flow.
- `## Cross-Browser Delta` (web only) — primary browser, secondary browser (Firefox | WebKit), divergences found.
- `## Web Vitals` (web only, via Chrome DevTools Protocol) — LCP (good < 2500 ms), CLS (good < 0.1), INP (good < 200 ms; HIGH above).
- `## Gaps / Unverified Areas`, `## Freshness Research`, `## Recommendation`.
- `## Recommended Next Stage` — Option A `/wf review <slug> <slice-slug>` (converged or no issues), B `/wf verify <slug> <slice-slug>` (escalated; second round), C `/wf implement <slug> <slice-slug>` (escape hatch), D `/wf handoff <slug> <slice-slug>` (skip review), E `/wf plan <slug> <slice-slug>` (plan needs rethinking); each with its reason, listed only when applicable.

Then author free narrative fragments for any beat the structured page cannot tell, per [../_fragment-authoring.md](../_fragment-authoring.md) **Step F2** (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
