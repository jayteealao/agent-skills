# `/wf verify` — Gap Analysis

Analysis of stage 6 (`wf-verify`) weaknesses: structural gaps in the pipeline design, and the fundamental limitations of agent-driven observable verification compared to human QA.

---

## Part 1 — Structural Gaps in `/wf verify`

### 1. No cross-slice regression check

Verify runs per-slice in isolation. When slice B is verified, nothing checks that slice A still passes. The fix loop re-runs only the checks affected by slice B's issues — but a fix for slice B can silently break slice A's code with no guard. `/wf-quick probe` covers slug-wide sweeps, but verify never triggers it automatically. Cross-slice regressions are invisible until review or, worse, ship.

### 2. No security scanning sub-agent

Sub-agents 1–4 cover static analysis, tests, interactive verification, and augmentation re-checks. None include SAST, dependency CVE scanning (`npm audit`, `cargo audit`, `pip-audit`), or secret detection. These land in `/wf review` at stage 7, meaning a slice with a hardcoded credential or a known-vulnerable dependency transitive import passes verify cleanly.

### 3. Fix loop commits before re-check confirms success

The commit condition (in the "Commit" section of the fix loop) is: *"at least one Fix sub-agent successfully modified files."* The re-check section appears earlier in the document, but the commit condition does not require re-check to pass — only that a file was changed. A fix sub-agent that modifies the wrong code path produces a commit, and the re-check failure is recorded after the commit is already written to git history.

### 4. Accessibility is not a first-class gate

Accessibility checks are defined in `runtime-adapters.md` under a shared "Accessibility checks" paragraph, meaning they only run if sub-agent 3 drives the adapter and the adapter recipe mentions them. There is no dedicated sub-agent, no WCAG verdict field in the artifact schema, and no hard block on regressions. The `design-harden` augmentation adds axe-core, but only if explicitly added during planning. A11y regressions can pass verify undetected.

### 5. No evidence versioning across re-invocations

When `convergence: escalated` and the user re-invokes verify, the new run overwrites the evidence directory (`.ai/workflows/<slug>/verify-evidence/<slice-slug>/`). There is no mechanism to diff evidence between rounds — it is impossible to determine whether the fix loop changed observable behavior, only whether the check passed or failed in the new run.

### 6. Performance gate is opt-in only

Unless the `benchmark` augmentation was explicitly added during planning (producing `05c-benchmark.md`), there is zero performance checking at verify. No default latency, bundle size, or memory baseline exists. A slice that introduces a 10× regression in a hot path passes verify cleanly if benchmarking was never opted into.

### 7. Fix sub-agents have no worktree isolation

Fix sub-agents are spawned with `model: sonnet` but modify files directly in the working tree with no rollback mechanism. The `Agent` tool supports `isolation: worktree` but the fix loop does not use it. If a fix sub-agent makes the situation worse, the damage is live in the branch with no automated recovery path.

### 8. `unconfirmed-auto-detect` stack is a soft warning, not a hard gate

When `stack.user-confirmed: false`, verify stamps the artifact with `stack-source: unconfirmed-auto-detect` and emits a warning, but still proceeds. Sub-agent 3 runs adapters against tooling the product owner never confirmed, and the verify artifact can reach `result: pass` with this provenance. Review and handoff *may* refuse on `unconfirmed-auto-detect`, but verify itself does not block.

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
