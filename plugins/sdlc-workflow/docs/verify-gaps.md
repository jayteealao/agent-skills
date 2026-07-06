# `/wf verify` — Gap Analysis

Analysis of stage 6 (`wf-verify`) weaknesses: structural gaps in the pipeline design, and the fundamental limitations of agent-driven observable verification compared to human QA.

---

## Part 1 — Structural Gaps in `/wf verify`

### 1. No cross-slice regression check

Verify runs per-slice in isolation. When slice B is verified, nothing checks that slice A still passes. The fix loop re-runs only the checks affected by slice B's issues — but a fix for slice B can silently break slice A's code with no guard. `/wf probe` covers slug-wide sweeps, but verify never triggers it automatically. Cross-slice regressions are invisible until review or, worse, ship.

### 2. No security scanning sub-agent

Sub-agents 1–4 cover static analysis, tests, interactive verification, and augmentation re-checks. None include SAST, dependency CVE scanning (`npm audit`, `cargo audit`, `pip-audit`), or secret detection. These land in `/wf review` at stage 7, meaning a slice with a hardcoded credential or a known-vulnerable dependency transitive import passes verify cleanly.

### 3. Fix loop commits before re-check confirms success — **RESOLVED**

> **Status: CURED** (re-checked 2026-07-06). The current fix-loop contract in `verify.md` requires
> the re-check to pass before any commit: *"Do NOT commit if any Fix-triaged re-check still
> fails"*, with `verify-owned-fix-commit: null` recorded when the round does not converge. Do not
> re-fix; the historical description below is retained for context only.

The commit condition (in the "Commit" section of the fix loop) was: *"at least one Fix sub-agent successfully modified files."* The re-check section appears earlier in the document, but the commit condition did not require re-check to pass — only that a file was changed. A fix sub-agent that modifies the wrong code path produced a commit, and the re-check failure was recorded after the commit was already written to git history.

### 4. Accessibility is not a first-class gate

Accessibility checks are defined in `runtime-adapters.md` under a shared "Accessibility checks" paragraph, meaning they only run if sub-agent 3 drives the adapter and the adapter recipe mentions them. There is no dedicated sub-agent, no WCAG verdict field in the artifact schema, and no hard block on regressions. The `design-harden` augmentation adds axe-core, but only if explicitly added during planning. A11y regressions can pass verify undetected.

### 5. No evidence versioning across re-invocations

When `convergence: escalated` and the user re-invokes verify, the new run overwrites the evidence directory (`.ai/workflows/<slug>/verify-evidence/<slice-slug>/`). There is no mechanism to diff evidence between rounds — it is impossible to determine whether the fix loop changed observable behavior, only whether the check passed or failed in the new run.

### 6. Performance gate is opt-in only

Unless the `benchmark` augmentation was explicitly added during planning (producing `05c-benchmark.md`), there is zero performance checking at verify. No default latency, bundle size, or memory baseline exists. A slice that introduces a 10× regression in a hot path passes verify cleanly if benchmarking was never opted into.

### 7. Fix sub-agents have no worktree isolation

Fix sub-agents are spawned with `model: sonnet` but modify files directly in the working tree with no rollback mechanism. The `Agent` tool supports `isolation: worktree` but the fix loop does not use it. If a fix sub-agent makes the situation worse, the damage is live in the branch with no automated recovery path.

### 8. `unconfirmed-auto-detect` stack is a soft warning, not a hard gate — **RESOLVED**

> **Status: CURED** (re-checked 2026-07-06). `verify.md` Step 0 now HARD-GATES on
> `stack.user-confirmed: false` — an `AskUserQuestion` confirmation is required before any
> sub-agent runs, the provenance is stamped in the artifact, and downstream stages retain refusal
> rights. Do not re-fix; the historical description below is retained for context only.

When `stack.user-confirmed: false`, verify stamped the artifact with `stack-source: unconfirmed-auto-detect` and emitted a warning, but still proceeded. Sub-agent 3 ran adapters against tooling the product owner never confirmed, and the verify artifact could reach `result: pass` with this provenance.

### 9. Freshness sub-agent (sub-agent 5) scope is too narrow

Sub-agent 5 fires only when external dependency state changes could affect test results. AC staleness is never checked. If the acceptance criteria in `03-slice.md` were written against a product understanding that has since shifted (API contract changed, design decision reversed), verify measures code against stale criteria and reports `pass`.

### 10. Observable AC heuristic has no authoring-time feedback loop

The partition of AC into `code-only` vs `user-observable` uses a heuristic applied at verify time. The `observable: true | false` correction annotation exists in the slice file, but nothing during `/wf slice` prompts for it. A miscategorized criterion is invisible until stage 6, and the only evidence of the miscall is the `kind:` column in the verify artifact — a field most readers never check.

---

## Part 2 — Ways Agent-Driven Observable Verification Falls Short of Human QA

### 1. Verification is AC-bound; exploration is not

Sub-agent 3 drives exactly what the criterion text names. A human QA tester doesn't stop at the acceptance criteria list — they click around, try adjacent features, notice things that feel wrong without having a criterion for them. The agent can only find failures that acceptance criteria predicted in advance. Human testers regularly find the bugs nobody thought to specify.

### 2. Evidence reading is criterion-anchored, not perceptual

When a human looks at a screen, they perceive the whole frame simultaneously — visual hierarchy, inconsistent spacing, a font that doesn't belong, text that is technically present but truncated in a degrading way. The agent reads a screenshot multimodally but is anchored to "does this satisfy the criterion text?" rather than "does this look and feel right?" Criterion-matching and perceptual quality are not the same thing.

### 3. No longitudinal product sense

A human tester who has used the app across versions has muscle memory. They immediately notice when a flow takes an extra tap, when a button moved, when a label changed subtly. This "it used to be here" signal is entirely absent from the agent. Each verify invocation starts cold — the agent only knows the current criterion and current evidence.

### 4. Race conditions and timing anomalies are invisible within tolerance

Adapter recipes use `waitForSelector` and fixed poll timeouts. A race condition that resolves within the timeout is invisible to the agent — the criterion passes. A human who sees a button flash into disabled state for half a second, or a loading spinner that briefly reappears, will pause and investigate. The agent captures a single frame after waiting and reports pass.

### 5. Error state and edge case discovery is passive

Sub-agent 3 only drives error cases when the AC explicitly describes an error scenario. A human QA tester instinctively tries bad inputs, submits empty forms, double-clicks buttons, refreshes mid-flow, and pastes invalid data. These adversarial micro-tests are how real bugs surface. The agent has no instinct to break things — it verifies what it was told to verify.

### 6. UX quality signals have no representation in the verdict

A human notices that a confirmation dialog is ambiguous, that a loading state provides no progress feedback, that an error message says "Something went wrong" with no actionable path. These are real quality signals that reduce user trust even when every AC passes. The agent has no channel to report them unless they map to a criterion — and they rarely do.

### 7. Cross-browser and cross-device divergence is not checked

The web adapter drives one browser with one driver. A human tester thinks about Firefox, Safari, and Chrome divergence reflexively. They check the mobile breakpoint, resize the window, switch input methods. The adapter protocol boots one environment and drives one surface. A layout that breaks only on Safari or only under pinch-zoom is invisible to verify.

### 8. Performance feel cannot be captured by evidence

Jank during scroll, input lag, transitions that feel cheap, a button that takes 300ms to visually respond — these are real UX degradations that do not appear in a screenshot and are not measured by Lighthouse metrics alone. A human tester experiences the running app as a sequence of interactions with real time between them. The agent captures static evidence at fixed checkpoints.

### 9. Failure investigation does not happen spontaneously

When something appears wrong in a screenshot, the agent compares it to the criterion and records a result. A human tester opens DevTools, checks the network tab, inspects the DOM structure, looks at what request failed and why. The adapter recipes provide for capturing console errors and network requests when the criterion involves API calls — but the agent does not pivot to investigate anomalies it notices but was not asked to investigate.

### 10. Happy-path shape of AC hides real-world failure modes

Acceptance criteria are nearly always happy-path-shaped: "given valid input, the result appears." The agent verifies this. A human tester thinks about what happens with real user data at volume, with slow connections, with interrupted flows, with concurrent sessions. A feature can satisfy every criterion while being fundamentally broken for a meaningful fraction of real users — and the agent will report `result: pass`.

### 11. No collaborative or contextual knowledge

A human tester knows what similar features look like elsewhere in the product, what the design system says about this component type, what the PM mentioned in standup. This contextual knowledge is what produces "this doesn't match how we've always done X" findings. The agent only has criterion text and workflow artifacts — it has no implicit knowledge of product conventions.

### 12. Intermediate states and flow feel are invisible

A screenshot captures one frame. A human experiences a flow as a sequence: the animation, the loading transition, the intermediate empty state before data loads, the micro-interaction feedback on click. The agent records the frame after `waitForSelector` resolves. Everything that happened between user action and final state — the experience of the flow — is not captured in evidence.

---

## Part 3 — Solutions: How All 12 Part 2 Gaps Are Addressed

All gaps are addressable via prompt engineering and adapter recipe changes. The constraint type (explicit attention, discrete evidence, no cross-session memory, context window scope) determines the mitigation approach.

### Gap 1 — AC-bound exploration → Free exploration step
**Solution:** A mandatory "free exploration" step (step 6) added to sub-agent 3. After all AC are verified, the agent sets aside the criteria list and navigates the surface for at least 3 minutes / 10 interactions as a first-time user. Findings are recorded under `## Free Exploration Notes`. Findings that contradict any AC are escalated to issues. **Constraint type:** explicit attention — fully addressable by prompting.

### Gap 2 — Criterion-anchored evidence reading → Perceptual review pass
**Solution:** A mandatory second-pass perceptual review (step 3c) added per criterion. After determining pass/fail against the criterion text, the agent makes an independent pass on the final screenshot asking "what do I notice independent of the criterion?" — visual hierarchy, spacing, font rendering, truncation, colour divergence. Recorded under `## Friction Notes`. **Constraint type:** explicit attention — fully addressable by prompting.

### Gap 3 — No longitudinal product sense → Baseline capture + prior evidence reading
**Solution:** A mandatory longitudinal baseline step (step 2b) added before driving. If prior evidence runs exist (from evidence versioning), those screenshots are used as the before-state. If not, the agent stashes, screenshots the base branch, and restores. Before/after comparison is recorded per criterion under `## Longitudinal Delta`. **Constraint type:** no cross-session memory — addressed by using the evidence versioning system (Gap 5 fix from Part 1) as the memory store.

### Gap 4 — Race conditions invisible within tolerance → Stability check + timing stress
**Solution:** Each criterion is driven 3 times (step 3b). If results diverge, the criterion is flagged as `stability: flaky` — a HIGH issue. The 3-run stability check is a reliable proxy for race conditions without requiring precise timing instrumentation. Separately, the adversarial tests (step 7) include a rapid-repeat test that surfaces debounce failures. **Constraint type:** discrete evidence — partially mitigated by multi-run sampling; race conditions faster than 3 sequential drives remain invisible.

### Gap 5 — Passive error discovery → Adversarial micro-tests
**Solution:** A fixed adversarial micro-test set (step 7) runs after free exploration, regardless of AC. Five tests: empty submission, max-length input, double-click/rapid repeat, mid-flow interruption, offline/network failure. These cover the most common classes of unspecified edge cases. BLOCKER/HIGH findings enter the main issue list. **Constraint type:** explicit attention — fully addressable by prompting.

### Gap 6 — UX quality signals have no verdict channel → Friction Notes
**Solution:** A `## Friction Notes` section added to the artifact template, with a corresponding `friction-notes:` schema field. Sub-agent 3 is instructed to record anything that caused it to pause, rethink, or diverge from product conventions — with a low bar ("if a first-time user would notice it, it belongs here"). These are informational and do not affect `result:`. **Constraint type:** explicit attention — fully addressable by prompting and schema addition.

### Gap 7 — Cross-browser divergence not checked → Cross-browser sweep in web adapter
**Solution:** A mandatory cross-browser sweep added to the web adapter's `## Observe` section in `runtime-adapters.md`. After verifying all criteria in the primary browser (Chromium), the same criteria are re-driven in Firefox (and WebKit if available) using Playwright's multi-browser API. Divergences are reported under `## Cross-Browser Delta` as HIGH issues. **Constraint type:** missing adapter recipe — fully addressable by adding the recipe.

### Gap 8 — Performance feel cannot be captured by evidence → Video recording + Web Vitals via CDP
**Solution:** Two additions to the web adapter:
(1) Mandatory video recording per criterion drive via Playwright's `recordVideo` option — captures animation quality, transition completeness, and jank that screenshots miss.
(2) Mandatory Web Vitals extraction via Chrome DevTools Protocol after each criterion drive — LCP, CLS, and INP are recorded as structured data. INP > 200 ms is a HIGH issue.
**Constraint type:** discrete evidence — video recording converts single-frame evidence to multi-frame; Web Vitals convert felt performance to measurable signals. Not 100% equivalent to human perception but closes the gap substantially.

### Gap 9 — Failure investigation does not happen spontaneously → Anomaly investigation mandate
**Solution:** An explicit "anomaly investigation mandate" (step 3d) added to the per-criterion drive protocol. When evidence contains anything unexpected — a console error, a network request to an unexpected endpoint, a visual element that should not be present — the agent is instructed to pivot: open DevTools via CDP, check the console and network tab, inspect the DOM, and report what it finds as a sub-finding. **Constraint type:** explicit attention — fully addressable by prompting.

### Gap 10 — Happy-path AC shape → Failure mode probes
**Solution:** A mandatory "failure mode probes" step (step 8) added after adversarial tests. For each user-observable AC, after the happy path, the agent probes: slow response (network throttling), concurrent session (second browser context), and session expiry mid-flow. These boundary conditions expose the most common real-world failure modes that AC never specify. **Constraint type:** explicit attention — fully addressable by prompting.

### Gap 11 — No collaborative context → Product context reading step
**Solution:** A mandatory "product context reading" step (step 0) added as the first action in sub-agent 3, before any driving. The agent reads `PRODUCT-CONTEXT.md`, `02b-design.md`, `02c-craft.md`, design audit/critique files, grepped similar components, and the git log for the affected files. It synthesises a "product conventions" mental model and holds all observations against it. **Constraint type:** context window scope — fully addressable as long as product conventions are written down anywhere in the repo. If no such files exist, the git log and similar components still provide substantial convention signal.

### Gap 12 — Intermediate states invisible → Multi-point screenshot protocol + video
**Solution:** Two additions:
(1) Multi-point screenshot capture (step 3a): t=0 (action trigger), t=250 ms (transition/loading state), and final (after `waitForSelector`). Three frames per criterion expose the full state transition.
(2) Video recording (Gap 8 solution, web adapter) captures every frame, not just three. For non-Playwright platforms, platform-native screen recording (`adb screenrecord`, `xcrun simctl io booted recordVideo`) achieves the same.
**Constraint type:** discrete evidence — three-frame sampling plus video converts single-frame evidence to a temporally complete record.
