# Changelog

All notable changes to the sdlc-workflow plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed — `/wf` skill progressive-disclosure optimization (9.104.0)

A two-round, behavior-preserving optimization of the `/wf` skill tree in BOTH trees (main + Codex mirror). Nothing was removed — no key, mode, gate, or template; text either moved behind a conditional load or was single-sourced and cited.

- **Conditional loading.** `handoff`'s GitHub machinery (CI watch, fix-subagent contract, T5.1 PR-comment triage) hoisted into `reference/_pr-ci-handoff.md`, read only when the PR/CI path is active — a local-branch handoff never loads it. `review.md` split into a 67-line entry (Step 00 + the full ad-hoc section) and `reference/review/_stage.md`, loaded only on a slug match — an ad-hoc `/wf review <dimension>` now loads ~7KB instead of ~73KB.
- **New single-source references**, each with a fingerprint drift-guard test (the `_output-boundary.md` pattern): `_fix-loop.md` (the seven fix-dispatch invariants shared by verify/review/implement-reviews/handoff), `_chat-return.md` (the leaf-side chat-return framing; also fixes two contract contradictions — `ship-plan/edit.md`'s "Return only:" and `ship/announce.md`'s missing narrative requirement), `_additive-write.md` (the snapshot→bump→append revisable-artifact contract for intake/shape/slice/handoff/retro).
- **Dedup sweeps.** The free-narrative-fragments paragraph (46 byte-identical copies restating `_fragment-authoring.md` Step F2), the chat-return framing (3 drifted dialects across 28 files/tree), the story-section register restatement (20 drifted variants across 46 copies), the consult-blockquote policy tail (36), and the conditional-inputs paragraph (14) — all now cite their canonical home. `SKILL.md`'s always-loaded tier drops its triple roster statement and two long blockquotes.
- **Prose compression.** The nine largest stage references per tree (verify, plan, review stage body, handoff, ship, simplify, implement, shape, probe) tightened 4.5–14.3% each under a strict contract — headings byte-for-byte, every step/gate/threshold/enum/template/link preserved — verified by before/after heading-inventory diffs and a cross-tree heading comparison.
- Net: main skills tree −2,304/+891 lines; Codex mirror −2,145/+786. New test `tests/unit/skills/shared-reference-drift.test.mjs` (4 tests) enforces single-source-or-fail-CI for the new shared references and the review split, in both trees.

### Fixed — renderers for the `solution` and `ship-rollback` artifact types (9.103.0)

The two artifact types introduced in 9.100.0 (feedback-loops W1/W4) shipped without dedicated renderers, so their views degraded to the plain `fallbackRender` page and the e2e acceptance run reported `no renderer for: solution, ship-rollback`.

- **`renderers/solution.mjs`.** The durable cross-workflow learning (`.ai/solutions/<category>/<slug>.md`, distilled by `/wf retro`) now renders as a frontmatter card + a promoted `category`/`status` metric row + the Problem/Learning/How-to-apply narrative. `status: superseded` tones the badge amber; `source-workflow` (slug or list) becomes the lede.
- **`renderers/ship-rollback.mjs`.** The runbook-driven reversal record (`09-rollback-<run-id>.md`, written by `/wf ship … rollback`) renders a decision/outcome metric row colored by value — the go/no-go gate and the `rollback-verify-result` (pass → green, fail → red), plus `steps-executed` / `steps-irreversible` and the reversed `run-id`.
- Both use the shared `renderSimple` base (like `close-record`); the build auto-discovers them as `dist/renderers/<type>.mjs` entrypoints, and `loadRenderer` resolves them by frontmatter `type`. The e2e acceptance run now reports `no renderer for: (none)`.

### Removed — retired `wf-meta` + `wf-docs` skills deleted completely (9.102.0)

The `wf-meta` and `wf-docs` skills — dissolved into `/wf` keys back in 9.98.0 and kept only as redirect stubs since — are now deleted outright in both trees. The grace period is over: typing the old `/wf-meta …` / `/wf-docs …` names no longer resolves to a tombstone; `/wf`'s own unknown-key handler still prints the mapping to the successor keys (`/wf status`, `/wf recap`, `/wf docs`, etc.), so callers are not left stranded.

- **Skills deleted:** `skills/wf-meta/` and `skills/wf-docs/` in both `plugins/sdlc-workflow` and `plugins/sdlc-workflow-codex` (SKILL.md + the Codex `agents/openai.yaml`). The still-live artifact-type/renderer/schema plumbing named `wf-meta`/`wf-docs` (the `00-index.md` / `01-fix.md` intake lanes and the docs pipeline artifacts, now produced by `/wf` keys) is untouched.
- **Manifest de-advertised.** `plugin.json` and the marketplace catalog no longer describe "four skill-mode routers (`/wf`, `/wf-meta`, `/wf-docs`, `/review`)" — the surface is `/wf` (the single entry point) plus `/review`.
- **Doc-site.** The dedicated `reference/wf-meta.html` and `reference/wf-docs.html` pages are removed, their sidebar-nav entries dropped from the generator, and the adjacent pagers re-stitched. Broader stale `/wf-meta …` prose scattered across tutorials/how-tos remains owned by the separate deferred doc-site content-dissolve workstream.

### Added — feedback-loops R3: semantic leak guards, advisory-first (9.101.0)

Third and final feedback-loop release — the only runtime-code slice. The External Output Boundary graduates from an *instruction* to an optional *wall*.

- **`lib/leak-lexicon.mjs`.** The internal-vocabulary lexicon is derived **from `_output-boundary.md`'s predicate**: the internal roots (`.ai/**`, `.claude/**` — `.codex/**` in that tree's copy) are parsed out of the canonical file, so the prose rule and the hooks can never disagree; the vocabulary patterns are the concrete low-false-positive tokens (`/wf <key>` command strings, `wf-<stage>` skill tokens, `NN-stage` artifact stems, the `sdlc/v1` schema tag). Bare English stage-name words ("plan", "review", "ship") are deliberately NOT matched.
- **Two new PreToolUse guards** (three hooks' scope in two entry points): `leak-guard-bash` scans the message-bearing arguments of publishing commands — `git commit`/`git tag` messages, `gh pr create` titles/bodies, `gh release create|edit` notes (never the whole command, so reading internal files is never flagged); `leak-guard-write` scans writes to public documentation paths (README*, CHANGELOG*, CONTRIBUTING*, `docs/` outside the internal roots).
- **Default OFF, advisory-first.** New `semantic` config block in `.ai/sdlc-config.json`: `{ "enabled": false, "mode": "advisory" }`. Advisory emits a systemMessage naming the matched vocabulary; `"enforce"` denies the call with the same message. The graduation gate: run advisory across real workflows and promote to enforce only at a ~0 observed false-positive rate.
- **Isolation:** both guards respect the external-model dispatch sentinel and never fire inside dispatch child processes; guard errors never break the tool call (advisory infrastructure fails open).
- Known Phase-1 limits: `--body-file`/`-F` contents are not read (the file *path* is still scanned), and the guards are wired in the **Claude tree's hooks only** — the bundles ride the shared runtime payload into the Codex mirror, but Codex-native hook wiring waits for the advisory graduation. Later hook phases stay in the semantic-hooks plan.

### Added — feedback-loops R2: knowledge compounding, repeat-deferral tripwire, ship rollback (9.100.0)

Second feedback-loop release: the corpus that makes workflows learn from each other, the tripwire that stops the same environment wall being paid twice, and a runbook-driven reversal phase under `ship`.

- **`.ai/solutions/` knowledge corpus (W1).** `retro` gains a distillation step: after the sub-agent merge it distills **0–3 durable learnings** (each must recur, be non-obvious, AND be actionable — zero is legitimate) into `.ai/solutions/<category>/<slug>.md` with a new `solution` frontmatter type (closed category set: architecture, testing, build-tooling, process, domain, gotcha, misc) plus an `INDEX.md` line, deduping against existing entries before writing (update, don't duplicate). `plan` gains the consumer: a **learnings scan** alongside the reuse scan that matches the slice's goal/scope against the index and reports a new `## Applied Learnings` section — what the plan does differently per matched learning, or an explicit "No applicable learnings found." Validation hooks treat `.ai/solutions/<category>/*.md` as schema-validated artifacts (INDEX.md exempt; no sibling-fragment demands — asserted by tests in both trees).
- **Repeat-deferral tripwire (W2g).** `plan` scans the slug's `runtime-evidence-deferrals`: when a slice is about to name an environment dependency an earlier deferral already named, the plan must either scope the harness that retires the wall or record `harness-declined: <reason>` — silence is non-compliant. `verify` contributes the signal by stamping `repeat-of: <first-occurrence>` on repeated deferrals. Cross-slug detection rides the W1 corpus (a repeated wall is a prime distillation candidate).
- **`/wf ship <slug> rollback [<run-id>]` (W4).** A new user-gated rollback phase mirroring the announce shortcut: loads the completed run's recorded steps, authors a reversal runbook with every row marked reversible or irreversible (irreversible steps — sent announcements, published packages, forward-only migrations — surface as **mitigations**, never silently skipped; version bumps are forward-fixed, not reverted), gates on an explicit Go/No-Go, executes idempotently, verifies the prior state via the plan's `rollback-verify-cmd`, and writes `09-rollback-<run-id>.md` (new `ship-rollback` type) while stamping the original run `rolled-back: true` + `rollback-artifact`. `ship-plan` Block E gains the conventions it reads (`rollback-cmd`, `rollback-verify-cmd`, `prior-artifact-retention`, `irreversible-steps[]`); without them the phase degrades to a git-level runbook and says so. Manual only — `auto`/`yolo` never trigger it; no canary auto-rollback.

### Changed — feedback-loops R1: External Output Boundary single-sourced; verify/review/plan hardening (9.99.0)

First of three feedback-loop hardening releases (the prose/reference release; the solutions corpus and ship rollback land in R2, the leak hooks in R3).

- **External Output Boundary single-sourced.** The MANDATORY boundary block — previously inlined in 64 skill files (plus one command) per tree and drifted into at least four wordings — now lives in ONE canonical `wf/reference/_output-boundary.md`, rewritten **predicate-first**: internal = anything under `.ai/**` / `.claude/**` (`.codex/**` in the Codex tree) plus workflow vocabulary, so new internal directories are covered by construction instead of by editing 64 files. Every other file carries a 3-line citation. A new conventions test (`tests/unit/skills/output-boundary.test.mjs`) fails the build if the full body reappears anywhere else or a citation link breaks — in either tree.
- **Verify fix loop: regression-test mandate.** Every Fix-triaged **code bug** must land with a minimal regression test that fails before / passes after the patch (test-first when the catching check is re-runnable); `regression-tests-added` is recorded in the artifact, and a code-bug fix with neither a test nor an exemption reason is itself a MED finding. The old "do NOT touch tests" guard inverts to "never weaken/delete a test to make a check pass".
- **Review findings gain `pre-existing: true|false`.** Determined by the diff test (flagged lines untouched by the workflow diff → pre-existing; `git blame` tiebreaker for moved code). Pre-existing findings — including BLOCKERs — no longer count toward the Ship verdict or `metric-findings-blocker`; they surface in a new `## Pre-existing Debt` bucket routed to `/wf intake fix|refactor`, keeping the verdict about *this change*. Additive optional field on the review / review-dimension sibling schemas.
- **Constraint forethought — three cures for the "verification needs prod" failure shape** (2026-07-06 transcript audit of 10 real sessions):
  - **Force-scope rule** at `shape` + `plan`: a named environment dependency on a user-observable AC's critical path must resolve — *before plan completes* — to a prerequisite slice/harness, a proxy-AC + named clearing event, or explicit PO risk-acceptance (per-AC `constraint-resolution:` line; hard-gated at plan; verify Step 0 refuses to inherit an unresolved wall and closes its deferral hatch for it). "Known limitation — document at handoff" is illegal wording when an AC depends on the limitation. Outcome-metric ACs additionally require a pre-deploy proxy AC.
  - **Three new constraint-ladder classes** in `runtime-adapters.md`: **auth-gated runtime** (test-credential seeding → emulator debug build variant → injected-session harness), **inbound-callback** (dev tunnel → protocol-mode swap → recorded-callback replay), and **infra-prerequisite** (provision-as-a-verify-step → containerized stand-in) — plus the cross-cutting rule that a **staging deploy is a legitimate verify rung** when the ship plan defines a non-prod environment.
  - **Positive-evidence capability probes.** Verify may declare "environment cannot produce X" only after *executing* a probe and recording its literal command + output; a suite whose specs all exit via a credential guard is `blocked-runtime-evidence-missing` (an unmet precondition to fix), never a silent deferral. `yolo`'s auto-deferral is lawful only over a probed incapability.
- **Doc hygiene.** `docs/verify-gaps.md` Gaps 3 and 8 annotated as already cured (fix-loop no-commit-on-failed-recheck; unconfirmed-stack hard gate) so a future session doesn't re-fix them.

### Changed — `wf-meta` + `wf-docs` dissolved into `/wf`; surface compacted to 20 keys (9.98.0)

The last two sibling routers are retired, making `/wf` the *single* SDLC entry point (the third and final subsume after `wf-quick`→`/wf` and `wf-design`→`/wf design`). `/wf` is reframed from "one stage artifact per key" to **one SDLC operation per key**, and the resulting surface is compacted from a would-be 28 keys down to **20**, grouped in families: 10 stages, 5 standalone/drivers (`design`/`probe`/`simplify`/`auto`/`yolo`), 2 navigation (`status`/`recap`), lifecycle control (`close`), and 2 routers (`ship-plan`/`docs`).

- **Navigation folds into `status`.** `/wf status` absorbs `next` (it prints the exact next command in its detail view) and `sync` (it reconciles `.ai/workflows/INDEX.md` idempotently on every run; `/wf status <slug> deep` runs the reality-drift check + writes the sync report). No `/wf-meta next`/`sync` keys.
- **`resume` → `recap`.** Renamed and rewritten to recap what a workflow *has done so far* in plain language (whole workflow or one slice), and to **explain** a plan/shape/review/findings artifact (`/wf recap <slug> <focus>` — the former `how` D/E explain modes). `how`'s research modes route to the `deep-research` skill. Aux artifact `90-resume.md`/`type:resume` → `90-recap.md`/`type:recap` (renderer `recap.mjs`; `resume` kept a release as a schema alias).
- **`amend` dropped entirely; `extend` auto-routed.** There is no in-place amend — corrections are a new slice or a fix. `/wf intake <existing-slug> <free scope>` auto-routes to **extension** (net-new slices) via the new `intake/extend.md` mode; convention over flags, no keyword. Ship-plan block-editing survives as `/wf ship-plan edit`.
- **`skip` folds into `close`.** `/wf close <slug> <slice>` closes/skips a *slice* (slice is the unit now; stage-skip retired); `/wf close <slug> [reason]` still archives the whole workflow.
- **`announce` folds into `ship`.** Post-publish comms is a phase of `ship`; `/wf ship <slug> announce` re-runs comms only. `announce.md` relocated to `wf/reference/ship/announce.md`.
- **Augmentations become a `shape` decision.** `instrument`/`experiment`/`benchmark`/`profile` are no longer keys — `shape` authors an `## Augmentation Plan` (`augmentations-needed` frontmatter) and `plan`/`implement`/`verify` apply it (loading `wf/reference/augment/<type>.md` as internal sub-procedures). Ad-hoc profiling stays reachable via `/wf probe`.
- **`ship-plan` + `docs` routers.** `/wf ship-plan {init,build,edit}` consolidates the former `init-ship-plan`/`build-pipeline`/`amend ship-plan`. `/wf docs` is the former `/wf-docs` (orchestrator or a single Diátaxis primitive), relocated under `wf/reference/docs/`.
- **`review` unified.** `/wf review` is now the single review surface: `<slug>` runs the workflow stage, `<dimension>` / `sweep <aggregate>` runs ad-hoc (the former standalone `sdlc-workflow:review` skill, folded in; its 33 rubrics relocated to `wf/reference/review/`).
- **Skills removed.** `imagegen` (expired deprecated alias), `wide-event-observability` (folded into the `instrument` augmentation as its deep reference), and `sdlc-workflow:review` (folded into `/wf review`). Net plugin skills: `wf`, `consult`, `imagery`, `uiproto`, `error-analysis`, `refactoring-patterns`, `test-patterns`.
- **Retired siblings.** `wf-meta` and `wf-docs` SKILL.md become one-release redirect stubs mapping every old member to its new command; the `wf/SKILL.md` dispatcher also carries the redirect messaging. Schema drops the two amendment types; renderers drop the amendment renderers.

### Removed — session-start orientation message stripped (9.97.0)

The `session-start-orient` hook no longer emits a workflow-orientation `systemMessage` into context. It is now a pure background-maintenance hook: it enqueues the whole-repo dashboard render and self-heals the tray, and injects nothing into the session.

- **Why.** The orientation summary was redundant with the `/wf` commands, which each re-read their workflow's `00-index.md` on invocation (and the `auto`/`yolo` drivers additionally run their own branch-posture check). The injected message also carried a cost: an authoritative, occasionally-stale nudge — including an imperative "Next:" line — that could skew an unrelated session toward workflow work. Resume after a compaction is unaffected: it was already driven by the commands re-reading disk, not by this message.
- **Both trees.** The Claude hook (`hooks/session-start-orient.mjs`) drops the workflow scan, the summary builder, and the render-lag advisory; the native Codex hook (`hooks/session-start.mjs`) drops its own `orient()`/`formatSummary`/`toCodexInvocation`/`readFrontmatter`. The bootstrap-render and tray-heal paths are untouched.
- **Dead code removed.** The now-unused `currentGitBranch` and `stringifyField` exports are deleted from `lib/hook-utils.mjs` (session-start-orient was their sole caller). No artifact **types**, renderers, schemas, or fragments changed.
- Docs (`reference/hooks.html`, README, `HOOKS-SEMANTIC-PLAN.md`) reconciled to the new behavior. Claude and Codex trees at parity.

### Changed — design brief + contract fold into the lifecycle; `craft` retired (9.96.0)

The design **Producer** (`craft`) is dissolved: its work is split across the stages that already own each concern, so UI work rides the normal `shape → plan → implement → verify` flow instead of a separate design command that owned the downstream build.

- **`shape`** now authors the design **brief** `02b-design.md` inline when the work has UI surface (`stack.ui ≠ ∅`), as plain discovery — register, color strategy, scene sentence, anti-goals, state inventory, and `recommended-references:`. It leaves the image gate unresolved (no `image-gate` written to `02b` — the field's only schema values are `pass`/`skipped:*`); it does not run image probes or a confirm gate.
- **`plan`** owns both design gates. When a brief exists without a contract, plan resolves the image gate (north-star probes via `imagery`) and the visual-direction confirm gate, then authors the visual **contract** `02c-craft.md` (following the new `design/contract.md` procedure) — before finalizing the plan steps so the mock-fidelity inventory and implementation contract become concrete steps.
- **`implement`** absorbs the build discipline and the critique-and-fix pass: it applies the contract and cited references, holds UI to the `_design-context.md` floor, applies `_component-craft.md` for reusable components, and runs a mandatory critique pass when a contract was present.
- **`/wf design`** is now a transforms-and-analysis dispatcher: the 15 transforms + `audit`/`critique`/`extract`/`setup`/`teach` (20 commands, down from 21). The `craft` command and the Producer category are removed; `design/craft.md` is deleted and replaced by `design/contract.md` (contract authoring) and the reframed `design/shape.md` (brief authoring). There is no `/wf design <slug> craft`.
- The dispatcher preflight (`design.md` Step 1) now conditionally loads `_component-craft.md` when a transform's target is a reusable design-system component, so a standalone `/wf design <transform>` on a component is held to the same DX-first-API / defaults / naming bar as the `implement` lifecycle path — closing a gap where only `extract` referenced that reference.
- Design-craft reference hygiene: the secondary homes carrying ported motion guidance now cite their MIT source (`optimize.md`, `delight.md`), the WAAPI / CSS-variable performance rules are de-duplicated to a single home in `animate.md`, `_design-context.md` documents its per-stage consumer contract, and `plan`/`implement` now load the specific craft home (`animate.md` / `polish.md` / `typeset.md`) for off-`/wf design` UI work instead of stopping at the floor summary.
- The `design`/`design-contract` artifact **types**, renderers, schemas, and fragments are unchanged — only authorship moved — so the runtime buildId is unaffected. Doc-site, `_design-context.md` gates, and every cross-reference (slice/verify/review/handoff/retro/intake, imagery/uiproto callers) updated.
- Claude and Codex trees at parity.

### Changed — `consult` is now model-invocable and auto-runs across the lifecycle (9.96.0)

Reverses the "always opt-in, never auto" posture for `consult` only. The read-only second-opinion oracle now runs when the model judges it worthwhile, instead of never (an audit found it had never once fired since shipping).

- **Model-invocable.** `consult/SKILL.md` sets `disable-model-invocation: false`; the model can now call it. It **auto-invokes** at the plan, design, review, and diagnosis (verify / root-cause) judgment points, including inside the autonomous `/wf auto` and `/wf yolo` drivers (their "Not a consult trigger" exclusions are removed).
- **Consent gate removed — for consult only.** The `externalDispatch.enabled` re-check and exit-3 are deleted from `consult/scripts/dispatch.mjs`; `imagery` and `uiproto` keep the flag and the script-level trust boundary untouched. `lib/hub-config.mjs` is unchanged, so the runtime buildId is unaffected.
- **Cost bounded by pinning, not by a flag.** Any model-initiated run pins a free subscription CLI (`codex`/`claude`); the paid REST oracles are never fanned out unattended. Read-only sandbox, credential scrub, and hook-isolation guarantees are preserved — only *consent* was removed, not *safety*.
- The ~18 lifecycle offer callouts are reconciled: the 4 auto-sites carry active "auto-invoke when it adds value" language; the rest drop the now-false gate clause and permit self-run when it clearly helps.
- Claude and Codex trees at parity.

### Added — verifiability-first AC authoring + constraint-aware verification (9.95.0)

Closes the "verified but actually broken" leak class: acceptance criteria authored without a verification path, then rationalized past at verify with a static-reasoning `pass` or a bare "no emulator" deferral. The fix moves verifiability **upstream** — decided where each criterion is born and planned — and adds a mechanical backstop so a false pass cannot be written.

- **`shape`** records the target verification environment and a per-outcome Observation Model (how and where each success is observed) before any acceptance criterion text exists.
- **`slice`** now authors every user-observable criterion *with* its verification path: a justified `observable:` partition and an inline `verify: { method, env, fixture, rung }` stub. A user-observable criterion with no nameable verification method is re-scoped or pre-registered as a deferral at authoring time — never left to "decide later".
- **`plan`** gains a first-class `## Verification Strategy`: per criterion, the tool + constraint-ladder rung, whether the target environment satisfies it, what must be **built** to make it verifiable (those become plan steps), and a fallback chain. Tool-absence is resolved here with the product owner (route back through shape, or an authorized verify-time bootstrap), so verify never improvises an un-planned install.
- **`implement`** treats the planned verification seams (fixtures, deterministic state, test ids, an authorized install) as part of *done* and records them in `## Verification Seams Built`.
- **`verify`** mandates a constraint-resolution ladder before any deferral; defer-reasons must enumerate the rungs tried; static reasoning is never evidence for a user-observable criterion; a mock never satisfies an integration criterion; punting to a future slice is a deferral, not a pass; and a re-verify writes back to the per-slice file so the index can never claim `pass` over a slice that still reads `fail`.
- **`runtime-adapters`** hosts the canonical constraint-resolution ladder (web / android / backend / deploy-time) that plan and verify point to, plus per-adapter recipes (viewport-controllable browsers for responsive criteria, device-free Robolectric/Roborazzi first on Android, the emulator rung for integration criteria).
- **Enforcement backstop (write-time).** The post-write validator now HARD-BLOCKS a verification record whose `result: pass` contradicts its evidence (acceptance met < acceptance total, or an interactive verification marked deferred); the schema forbids the invented `metric-acceptance-unverified-interactive` field; and a non-blocking lint warns on shadow-deferral prose under a passing result. Both gates are opt-out via `hooks.verifyResultGate` / `hooks.verifyDeferralLint`. Clearance is now evidence-only; product-owner risk-acceptance moves to a distinct `ship-override-authorization: { by, at, reason }` so a prose string can no longer silently unlock ship. The result vocabulary also gains the contract's `blocked-runtime-evidence-missing` state.
- Claude and Codex trees at parity.

### Added — consult offered across the full lifecycle + design-craft expansion (9.94.0)

Building on the `consult` oracle skill, the read-only second-opinion panel is now **offered — never auto-run — at every judgment point in the lifecycle**, and the design references gain a deeper, single-sourced craft vocabulary.

- **Consult lifecycle touchpoints.** An opt-in `/consult` callout now rides every stage where an external second opinion pays off: `shape`, `slice`, `plan`, the `rca`/`investigate`/`ideate` intake modes, `implement`, `verify`, `/wf review`, `handoff`, `ship`, `retro`, `probe`, `simplify`, the four perf/observability augmentations, `wf-docs`, and the `wf-meta` utilities `announce`/`init-ship-plan`/`build-pipeline`. Each is gated by `externalDispatch.enabled` and surfaced as an offer, never fired automatically; the `implement`/`simplify` callouts carry an explicit "skip for routine runs" caveat.
- **The autonomous drivers opt out.** `auto` and `yolo` execute stage references in-process, so each gains a "Not a consult trigger" rule — `auto` never surfaces the offer (it would defeat the low-friction sequencing it exists for) and `yolo` never fires it (opt-in/never-automatic, with no human to accept). The interactive `design` driver deliberately keeps the offers.
- **Design-craft knowledge propagated.** The craft specifics in `animate`/`polish`/`typeset` now extend across all 15 design-touching references in both trees, single-sourced through `_design-context.md` so the slice/plan/implement/verify/review stages inherit the same vocabulary.
- Claude and Codex trees at parity; every change is a source-read reference, so the only runtime/dist change is the version stamp.

### Added — external-model dispatch: `consult`, `imagery`, `uiproto` (9.93.0)

The plugin can now send prompts to *external* models as part of the workflow and fold the results back into the in-house pipeline — always opt-in, gated behind a single `externalDispatch.enabled` config flag (default `false`). Dispatch lives in a shared `lib/` module fronted by a `SDLC_DISPATCH_ACTIVE` sentinel that short-circuits the write hooks while an external call is in flight, so a dispatched sub-agent never re-enters the plugin's own validation.

- **`consult`** — external models as **read-only oracles**: plan critique, code/implementation review, design analysis, diagnosis, second opinion. Fans out to every available provider by default (codex, claude, gemini, openai; a provider keyword narrows to one) and returns a panel of opinions, never editing the repo. Offered — never auto-run — by `/review` and `/wf review` for a cross-model check on a verdict.
- **`imagery`** — image generation from a prompt, fanning out across built-in `image_gen`, gpt-image-2, and nano-banana into a variant set (or one with a provider keyword). **Supersedes `imagegen`**, now deprecated and kept one release as a thin alias.
- **`uiproto`** — prototypes a UI component/screen, fanning out to Google Stitch + an LLM side-by-side, writing a self-contained sandboxed HTML fragment. Internal to `/wf design`.
- Claude and Codex trees at parity; the only runtime/dist change is the config flag plus the hook sentinel early-exit.

### Added — `motion` and `interface-craft` review dimensions (9.93.0)

`/review` and `/wf review` grow from 31 to 33 dimensions, adapting two MIT-licensed design-engineering skill packs into the plugin's review rubrics and design references.

- **`motion`** reviews animation, transition, and gesture code against a craft bar — the frequency framework ("should it animate at all"), strong custom easing curves, sub-300 ms UI budgets, interruptibility, origin/physicality, GPU-only properties, and gesture physics. Adapted from Emil Kowalski's animations.dev philosophy.
- **`interface-craft`** reviews the static visual detail that compounds into polish — concentric border radius, optical alignment, shadows-over-borders, pure-black/white image outlines, tabular numbers, text-wrapping, and minimum hit areas. Adapted from Jakub Krehel's "details that make interfaces feel better".
- Both register in the `ux` sweep and in the `wf-review` selection logic (interface-craft always-on for frontend changes; motion conditional on animation diffs). The design `animate`/`polish`/`typeset` references gain the same specifics, scoped to the product register so brand motion license is untouched, so the guidance also flows into the build pipeline.

### Added — narrative voice: a story section that opens every artifact (9.92.0)

Addresses a long-standing complaint that the artifacts read like dead technical documents — accurate, but no story. Every `/wf` artifact now opens with a prose **story section** named after its stage (`## The Plan`, `## The Verification`, …): a self-sufficient lead a reader can read *alone* to understand what was produced, the load-bearing decisions and counts, and the top risk. The structured sections below it stay terse and technical, so the narrative and the reference data stop fighting in one register.

- **One source of truth for the voice.** `skills/wf/reference/_narrative-voice.md` defines the section, names the register (Sebastian Raschka's technical essays, each signature anchored to a real line), lists the craft levers and the banned tells, carries the `## The <Stage>` mapping table, and ships a seven-stage before/after exemplar gallery. Every stage reference and the router's chat-summary rule now point here, so the voice cannot drift across releases.
- **Story renders first.** A new `renderers/_story.mjs` lifts the leading `## The <Stage>` section out of the body so the doc-site renders it above the figure and the structured cards — and ahead of the narrative fragments at the page foot — with a quiet lead treatment in `assets/sdlc.css`. Artifacts with no story section render exactly as before.
- **Swept across the lifecycle, both trees.** Every artifact-producing reference gained the story section and had its old "tell the story like a colleague" directive repointed at the voice spec: the ten core stages, `simplify`/`probe`/`ideate`, the four augmentations, the intake modes, and design `audit`/`critique`. The Claude and Codex trees are at content parity.

### Added — `sdlc-debt:` marker lifecycle: validate (verify) · reconcile (retro) · sweep (simplify) (9.91.0)

Closes the loop the YAGNI ladder (9.90.0) opened. The `sdlc-debt:` markers `wf-implement` writes now have a full lifecycle, with each stage doing a **distinct verb at its own scope** rather than one stage "harvesting" everything:

- **`verify` — validate (per-slice).** A marker-hygiene check in the static-analysis sub-agent greps the slice diff for `sdlc-debt:`, asserting each is well-formed (names a ceiling + upgrade path) and recorded in `05-implement`'s `## Anything Deferred` / `## Known Risks`. Malformed/unrecorded markers enter the existing fix loop. Slice-scoped — does not aggregate.
- **`retro` — reconcile (per-workflow).** Analysis sub-agent 1 harvests this workflow's markers into a new `## Deferred Debt` section, classifying each `act-now` vs `accept`; act-now items route to the existing Option B follow-up (`/wf intake fix`/`refactor`). Scoped to the workflow's own debt, not the repo.
- **`simplify` — sweep (on-demand).** New Step 1b greps the resolved scope (repo-wide for `codebase`) for markers and folds each into the aggregate as a pre-classified finding routed through the existing matrix. Mapped to `category: quality` so no sibling-YAML schema change.

Reference-content only; both Claude and Codex trees at content parity. No new artifacts, schemas, or renderers — each verb reuses machinery the stage already had (verify's diff-grep + fix loop, retro's Option-B routing, simplify's finding matrix).

### Added — YAGNI build-avoidance ladder across shape, plan, and implement (9.90.0)

A simplicity-first **build-avoidance ladder** now runs through the three generative stages, split by altitude so the "does this need to exist?" question is asked once, early, where trimming cascades through every downstream stage. Adapted from the [ponytail](https://github.com/DietrichGebert/ponytail) "lazy senior dev" skill — the ladder *plus* its non-negotiable safety carve-outs, not bare "do less" (which ponytail's own benchmark shows is both less effective and less safe).

- **`shape` — rung 1 (scope restraint).** Round 5 of the discovery interview now leads with a PO-facing restraint question ("do you actually need X, or does Y cover it?"), routing speculative gold-plating and premature generality to `## Out of Scope` with a logged rationale. Bounded: it never trims what the user explicitly asked for, nor a non-functional requirement (security, accessibility, data integrity).
- **`plan` — rungs 2–4 (build-avoidance).** The reuse-scan sub-agent is generalized into a four-rung ladder (stdlib → native-platform → reuse → minimum new code); the web-research sub-agent checks stdlib/platform built-ins before endorsing a dependency; the `## Reuse Opportunities` plan section becomes `## Simplicity Ladder`; and the auto-review overengineering check references the ladder.
- **`implement` — rungs 5–6 + carve-outs.** A new "Build discipline" section adds a code-level ladder (stdlib/native over helpers, direct calls over wrappers, no single-use abstractions), a **NON-NEGOTIABLE** "lazy ≠ negligent" guard (validation, error handling, security, accessibility, calibration, and explicit acceptance criteria never trimmed), and an `sdlc-debt:` marker convention for intentional shortcuts that feeds the existing `## Anything Deferred` / `## Known Risks` sections and is harvestable by `/wf simplify codebase`.

Reference-content only (skills are source-read); both the Claude and Codex skill trees carry the change at content parity (sole divergence: the `$wf` command prefix in Codex).

### Changed — `wf-design` subsumed into `/wf design` (9.82.0)

The standalone `/wf-design` router is retired. Design is now **one `wf` sub-command, `/wf design`,
run as a compressed workflow** — the producer that authors the brief + visual contract and then
drives the downstream lifecycle stages itself. The 22 design commands (`craft`, the 15 transforms,
`audit`, `critique`, `extract`, `setup`, `teach`) are *arguments* to this one key, never their own
keys. The 14-key `wf` table grows to 15.

- **Producer / dispatcher.** The old `wf-design/SKILL.md` brain becomes `skills/wf/reference/design.md`.
  `/wf design <slug> <cmd>` resolves the slug by exact existence check (never fuzzy), produces the
  design spec, then drives `slice → plan → implement → verify` itself — **no hand-back** to `/wf slice`
  (closing the latent `craft → implement` skip). `/wf design <cmd>` (no slug) runs the full
  `intake → … → retro` lifecycle. A per-category flow span decides how far the flow travels.
- **Shared library relocated.** `skills/wf-design/reference/*` (15 transforms + `brand` + `product` +
  the 7 operator playbooks) moves to `skills/wf/reference/design/`. A new
  `skills/wf/reference/design/_design-context.md` is the single source for the register, the design
  laws, the absolute bans, the preflight gates + 4 inspection sub-agents, and the image gate —
  loaded by both the producer and the consuming stages.
- **The consumption gradient.** `slice` (structures around it), `plan` (cites it), `implement`
  (applies it + registers `design-<sub>` augmentations), `verify` (measures the a11y/perf/responsive
  floor once), and `review` (judges it via `design-audit` + `design-critique` fan-out dimensions)
  each pull their slice of design knowledge, gated behind `stack.ui ≠ ∅`. a11y/perf are measured once
  in `verify` and interpreted in `review`/`audit` (single source of truth). `intake`/`shape` route to
  `/wf design` when `stack.ui ≠ ∅`.
- **Renderer.** `STAGE_NAV` keeps `design`/`design-contract`/`design-brief` under `shape` and adds the
  orphaned `design-audit`/`design-critique` under `review`. Artifact `type:` values are unchanged, so
  the renderers and snapshots are otherwise untouched.
- **Docs.** `reference/wf-design.html` + `how-to/use-design.html` rewritten to the `/wf design` model;
  the `/wf-design` sidebar label updated across the site; both manifest descriptions drop `/wf-design`
  (six → five routers). The Codex tree mirrors the skill edits (`$wf design`).

### Added — the tray now self-heals a RUNNING stale process after an upgrade (9.81.0)

The autostart launcher self-heal (`refreshAutostart`, run from session-start-orient) re-stamps the Startup launcher
to the current bundle + a durable node, so the *next* logon launches the right tray. But a tray that is **already
running** from a prior version's bundle — the common case right after a plugin upgrade — kept executing the stale
code until the user next logged in or restarted it by hand (observed 2026-06-17: a tray still on the `9.74.0`
bundle while the hub, plugin, and rendered views had all moved to `9.80.0`). The hub already reaps + respawns a
daemon whose `runtimeVersion` drifts (`lib/hub-lifecycle.mjs` / `lib/serve-lifecycle.mjs`); the tray had no
equivalent. This adds one.

- **`lib/tray-lifecycle.mjs`** — `reconcileRunningTray()` discovers running trays (Windows-first, via a WMI/CIM
  process scan), compares each one's launched **bundle path** to the current one (the same path-equality the
  launcher's `launcherTargetsCurrent` already uses — the version dir is encoded in the path, and the tray has no
  IPC surface to query), and on a mismatch kills the stale process and respawns the current bundle through the
  existing detached hidden-launch machinery (`lib/detach.mjs` + `resolveDurableNodePath`). Decision table: no tray
  → `none`; only current → `unchanged` (left alone); stale + a current one also up → `killed-stale` (reap the
  duplicate, **no** second spawn); stale, none current → `respawned`. Every OS/exec/spawn seam is injectable.
- **`scripts/tray-heal.mjs`** — a thin entrypoint the session-start hook spawns **detached** so orientation never
  blocks on the process scan (the same pattern as the bootstrap render + hub-ensure).
- **`hooks/session-start-orient.mjs`** — `healRunningTray()` runs the reconcile, gated on win32 + autostart-enabled,
  and **debounced** via a `~/.sdlc/.tray-heal` marker (≤ once / 60 s) so we neither scan on every session start nor
  let two near-simultaneous sessions both respawn (a brief duplicate-icon race). `SDLC_DISABLE_TRAY_HEAL=1` opts out.
- 10 unit tests (`tests/unit/lib/tray-lifecycle.test.mjs`) cover the parser, the path-equality helpers, and the full
  reconcile table — including the two required cases (a stale tray triggers a respawn; a current tray is left alone).

### Added — explicit controlled runtime upgrade with rollback (9.80.0)

NATIVE-INTEROP-REWRITE-PLAN "Controlled Runtime Upgrade" — the last open Workstream C deliverable. SessionStart
stays adoption-first; this is the deliberate, atomic path to swap the live machine-wide hub to a *different*
shared-runtime build, with automatic rollback if the new runtime fails to come up healthy — so the machine is
never left without a working hub.

- **`controlledUpgrade({ pluginRoot, allowDowngrade, confirm })`** (`lib/hub-lifecycle.mjs`). Resolves the
  requested runtime (the target `pluginRoot`'s manifest) and the previous one (the live hub's PID record), then:
  under `~/.sdlc/hub-upgrade.lock` materializes + verifies the new build while the old hub keeps serving; under
  `hub.lock` (the brief swap window, which blocks a racing SessionStart from starting a competitor) writes a
  durable rollback record → stops the old hub → frees the port → starts the new one → confirms health, registry
  visibility, and the expected build. On any failure it rolls the hub back to the previous runtime and restarts
  it. Success keeps the previous build in the store for the next rollback window.
- **Never downgrades implicitly.** A requested runtime older than the active one is refused unless both
  `allowDowngrade` and `confirm` are passed (pure, unit-tested `upgradeDecision` + `compareVersions`).
- **`startHubFromRuntimeRoot`** extracted from `startHubFromStore` so the op can start an arbitrary runtime
  (the new build, or the previous one on rollback) with an explicit identity, not just the bundled `RUNTIME`.
- **CLI** `scripts/hub-upgrade.mjs` (`npm run hub:upgrade`, bundled to `dist/`): `node <runtimeRoot>/dist/hub-upgrade.mjs [--plugin-root <path>] [--allow-downgrade --yes]`.

Proven with real detached hubs in an `SDLC_HOME` sandbox: an upgrade swaps the live hub to a new build and
retains `~/.sdlc` state; a deliberately-unhealthy runtime rolls back to the previous build (plan test items 9 & 10).

### Changed — sub-command chat returns are now a narrative, not a receipt (9.79.0)

Every artifact-producing sub-command (`/wf plan`, `shape`, `slice`, `implement`, `verify`, `review`, …) now ends its chat return with a short **narrative paragraph** that *tells the user what happened* — for `plan`, what the plan **is** (the approach) and how it gets built, with the file/step counts and the top risk woven in; for `implement`, what was built and how; for `verify`, what was checked and the result. The scannable anchors stay — the `complete:` header, `Artifacts:`, `Next:`, and (for `/review`) the `Verdict:`/`Findings:` line — but they now sit *beneath* the prose. Previously a bare receipt (`slug` / `wrote` / `options`) was all that landed in chat: you saw *that* `04-plan-<slice>.md` was written, never *what the plan said*.

**Root cause.** The v9.19.0 Final Summary Contract lives in each router's `# Step N — Emit Final Summary` and was correct, but two instructions defeated it: (1) every stage reference's `# Chat return contract` told the model to **"return ONLY"** a slug/wrote/options receipt, and (2) the router's key-facts line was *optional* ("Skip if there's nothing material") and deferred to that reference as the content spec. The model resolved the conflict by emitting the receipt and skipping the substance. (v9.19.0 had deliberately made summaries terse and field-shaped for scannability; this release re-optimises that same surface for comprehension — narrative prose, anchors retained.)

**The fix** (applied to both the Claude and native-Codex skill trees, ~72 skill files):

- **Routers (all 6)** — the Final Summary format now leads with a mandatory **narrative** placeholder; the old "Key facts" rule became a "Narrative" rule **REQUIRED for any sub-command that produces an artifact**; the `Artifacts:`/`Next:` anchors move below the prose. `/review` keeps `Verdict` + `Findings` and `/wf-design` keeps `Register` + `Image gate` as scannable anchors after the narrative; the `8-line` cap was relaxed to "compact". Read-only displays (`status`, `resume`, `how`) stay exempt.
- **Receipt references (38)** — the `wf/*` stages, `wf-quick/*`, and the artifact-producing `wf-meta` actions (`sync`/`amend`/`extend`/`next`) replace "return ONLY" with "lead with the substance first, then the receipt" and carry a `narrative:` directive as the first field, above the slug/wrote/options anchors.
- **Hand-off references (22)** — the augmentations (`instrument`/`experiment`/`benchmark`/`profile`), the `wf-quick` investigative commands, and `wf-meta` `skip`/`close` now lead with a narrative paragraph, keeping their structured field block as anchors beneath it.

### Decisions (recorded)

1. **Narrative over terse fields, anchors retained.** Per product-owner direction, the chat return optimises for being *told what happened*, not for scanning a form — but the machine-scannable anchors (`Artifacts`/`Next`/`Verdict`/`Findings`) stay so routing and go/no-go remain at a glance.
2. **Fix at both layers.** The router mandate is the enforcement; softening the references removes the contradiction at its source so the two no longer fight. Neither alone is robust — the reference's emphatic "ONLY" would keep pulling against a router-only fix.
3. **Scope by symptom, not pattern.** Read-only displays (`status`, `resume`, `how`) keep their "return ONLY the dashboard/brief" — there the rendered view *is* the substance.
4. **Brand-neutral inserts** keep the Claude and Codex skill twins byte-identical — verified by de-duplicating each inserted line across its file set (the reference narrative directive collapses to one unique line across 38 files; the hand-off directive to one across 20; the router rule to two, `wf`'s richer variant plus the shared generic).

### Files

- **Routers (12):** `skills/{wf,wf-quick,wf-meta,wf-docs,wf-design,review}/SKILL.md` in both `plugins/sdlc-workflow` and `plugins/sdlc-workflow-codex`.
- **References (60):** the 15 `wf/*` + `wf-quick/*` receipt refs and 4 `wf-meta` receipt refs, plus 11 hand-off refs (incl. `benchmark`'s two mode blocks), in both trees.
- **Version:** `.claude-plugin/plugin.json`, `package.json`, `renderers/_shell.mjs`, `.claude-plugin/marketplace.json` (sdlc 9.78.0 → 9.79.0; marketplace 1.104.0 → 1.105.0), and 53 doc-site brand stamps. Codex `runtime/**` re-synced (buildId parity). Skill `.md` edits need no rebuild — they are not part of the bundled runtime.

### Changed — per-repo serving is now opt-in; the hub is the default sole server (9.78.0)

`hub-config.perRepoServe` now defaults to **`false`** (was `true`). A standalone per-repo serve daemon spawns
ONLY when the key is explicitly `true`; at the default — `false`, or absent — `ensureServeLifecycle` reaps any
running per-repo daemon and declines to spawn, so the machine-wide hub is the sole server. This removes the
last way a per-repo daemon can squat the hub port by default (the inbox-vanishes-behind-one-repo failure) and
makes "the hub serves everything" the zero-config behavior.

- **Opt-in semantics everywhere, not just the default constant.** Every reader now treats *only* `=== true` as
  enabled: the server gate (`serve-lifecycle`, was `=== false` to disable → now `!== true`), the tray checkmark
  (`perRepoServeEnabled`, which also reads OFF on a missing/torn config instead of defaulting ON), and the
  toggle. A sparse or partially-read config resolves OFF — "false at all times" holds however the config is read.
- **Trade-off:** a repo that opts out of the hub (`view.hub.enabled:false`) no longer gets a standalone fallback
  daemon automatically — set `perRepoServe:true` to restore it.

Full suite green (420, +1 default-off regression test); doc-site `serve`/`sunflower-view` updated.

### Added — the native Codex package carries the shared runtime, byte-for-byte (9.77.0)

NATIVE-INTEROP-REWRITE-PLAN Workstream D — the first deliverable that puts a real runtime inside
`plugins/sdlc-workflow-codex`. The Codex plugin now ships the complete shared runtime payload and can start,
render, serve, and heal the hub with no Claude plugin installed and no runtime `npm install`.

- **One payload definition, two consumers.** `lib/runtime-store.mjs` now EXPORTS `PAYLOAD_DIRS`/`PAYLOAD_FILES`
  and `copyRuntimePayload`, so the bytes the hub materializes into `~/.sdlc/runtime/<buildId>` and the bytes the
  Codex package ships are copied from the SAME definition — they cannot drift.
- **Shared buildId algorithm (`lib/runtime-buildid.mjs`).** Extracted from `scripts/build.mjs` so the build
  generator and the new verifier compute the digest identically. The hash is taken over `(relpath-from-root,
  bytes)`, so an identical payload at any root (Claude plugin, Codex `runtime/`, or the machine store) reproduces
  the same `buildId` — that's what makes "Claude buildId == Codex buildId" mechanically true rather than asserted.
- **Self-contained verifier (`scripts/verify-runtime.mjs`, bundled into `dist/`).** Ships INSIDE the runtime, so
  either package proves locally that its payload reproduces its claimed `buildId`:
  `node <runtimeRoot>/dist/verify-runtime.mjs`.
- **Sync + parity gate (`scripts/sync-codex-runtime.mjs`).** `npm run sync:codex` mirrors the payload into the
  Codex package and writes `runtime-baseline.json` (release provenance); `npm run verify:codex` is the
  cross-package byte-for-byte parity gate (identical manifest + buildId + per-file hash over all 197 files).

Proven: the Codex runtime boots the hub standalone (`startedBy.host: codex`, identical `buildId`); full Claude
suite green (419, +5 buildId tests); new Codex `runtime-parity` suite green; build deterministic; cross-package
parity OK.

### Added — machine-wide runtime store + the hub starts under a cross-host lock (9.76.0)

NATIVE-INTEROP-REWRITE-PLAN Workstream C / Phase 2 — the rest of the cross-host hub lifecycle, built on the
9.75.0 runtime identity and the proven cross-host lock. The hub no longer depends on the plugin cache that
started it, and simultaneous Claude+Codex activation yields exactly one hub.

- **Machine-wide immutable runtime store (`lib/runtime-store.mjs`).** Each plugin MATERIALIZES its bundled
  runtime into `~/.sdlc/runtime/<buildId>/` (atomic: copy to a temp dir then rename into place — never a
  partial overwrite; idempotent: an already-verified build is reused) and the hub is started from THERE. So
  uninstalling/upgrading the starter plugin can't pull files out from under a long-running hub. `active-runtime.json`
  records the runtime backing the live hub. GC safeguards never reap the active runtime, the live-hub-PID
  runtime, the caller's bundled build, or any same-`runtimeVersion` build.
- **`ensureHubLifecycle` is adoption-first under the cross-host lock.** A healthy compatible hub is adopted on a
  LOCK-FREE fast path; only start/reap/recover enters the `~/.sdlc/hub.lock` critical section, where a
  double-checked re-probe means a hub a peer host started while we waited is adopted, not reaped. The adoption
  decision is extracted to a pure, unit-tested `decideHubAction`. The hub spawns from the store; the PID record
  carries `runtimeRoot`.
- **The render seam resolves the active machine runtime.** `resolveRenderEntrypoint` now resolves the live hub
  PID record's `runtimeRoot` → `active-runtime.json` → the caller's bundled root, so every render (including a
  hook-spawned fallback) runs the active runtime and stamps the active `buildId`, whichever host started the hub.

Live-smoke-verified end to end (materialize → start-from-store → adopt-on-second-call → clean stop); 27 new
unit tests (runtime-store, decideHubAction, plus the 12 cross-host-lock spike tests); full suite green.

### Added — shared runtime identity: the hub becomes cross-host-shareable (9.75.0)

NATIVE-INTEROP-REWRITE-PLAN Workstream B / Phase 1 — the prerequisite that lets the Claude plugin
(`sdlc-workflow`) and the native Codex plugin (`sdlc-workflow-codex`) share one machine-wide hub and one
renderer runtime without thrashing. **No single-host behaviour change** (today `runtimeVersion` equals the
package version, so adoption, reaping, and stale-render healing behave exactly as before).

- **`runtime-manifest.json` + `lib/runtime-manifest.mjs`.** A host-neutral identity both packages carry
  identically: `runtimeVersion` (the shared renderer/hub release line) and `buildId` (a deterministic sha256
  over the shared runtime payload — `dist/` + `assets/` + `components/` + `schemas/`). Generated by the build
  so `runtimeVersion` tracks the package version and `buildId` always matches the freshly built `dist/`.
- **Hub adoption keys on `runtimeVersion`, not the package version.** `hub-lifecycle.mjs` now *adopts* a
  healthy, protocol-compatible, same-`runtimeVersion` hub regardless of which host/package started it — and
  never reaps it (Settled Decision 24). A genuine `runtimeVersion` mismatch still reaps + respawns (preserving
  single-host upgrade pickup); a protocol-incompatible hub is left running with a diagnostic rather than
  silently replaced. The hub's `/__sdlc/health` and `~/.sdlc/hub.pid` now carry structured identity
  (`hub.{name,protocolVersion,runtimeVersion,buildId}` + `startedBy.host`), with the legacy top-level `version`
  kept as a migration alias.
- **Render freshness keys on `buildId`.** `.last-render` now stamps `buildId`; the stale-render healer and the
  render version-gate compare it (falling back to `runtimeVersion` for legacy markers), so two hosts of the
  same release never consider each other's output stale. The standalone per-repo daemon and the tray's
  stale-detection move to the same shared identity.

### Changed — render-dispatch post-review cleanup (9.74.0)

Quality pass over the 9.73.0 render-dispatch code (no behaviour change):

- **Write hook off the schema-compile path.** `render-on-artifact-write.mjs` reads the few `view.*` scalars it
  needs with a lightweight raw JSON read instead of `loadConfig` (whose Ajv schema compile ran on every
  cold-spawned hook invocation); schema validation stays in `post-write-verify`.
- **Shared ensure-hub helper.** New `lib/ensure-hub.mjs` (`ensureHubEnabled` + `spawnHubEnsure`) replaces the
  duplicated enable-guard + detached spawn in both the write hook and SessionStart — and gives SessionStart the
  `.render-errors.log` failure reporting it was missing.
- **One reconcile timer in the standalone daemon.** `render-sunflower-serve.mjs` folds the heal pass and the
  queue drain into a single timer (mirroring the hub's `reconcile()`), removing the dual-timer / close-handler
  asymmetry.
- **Smaller render-queue surface.** `fail()` collapses its two identical write-then-remove branches; the child
  -error log uses the correct `render-queue:` tag; an unreachable `coalesce` null-guard and a redundant bucket
  composite-key + `Set` dedup are removed.

### Changed — rendering moves out of the hooks into the hub: a durable render queue (9.73.0)

Implements RENDER-DISPATCH-PLAN — the prerequisite for the native Codex host. Instead of every
managed-artifact write spawning its own short-lived `render-sunflower`, the write hook now **reports** the
change to a durable per-repo queue and the long-running serving daemon **renders** it through the shared
bounded engine. One renderer (the daemon) keeps `.last-render` version identity consistent, which is what a
second host plugin needs to stop the stale-render healer from thrashing.

- **New `lib/render-queue.mjs`.** A maildir-style queue at `<repo>/.ai/_view/.render-queue/` (atomic
  temp+rename records, `.processing/` claim dir, `.failed/` ceiling dir, `.status.json`). `enqueue` /
  `readPending` / `coalesce` / `claim` / `ack` / `fail` / `reclaimOrphans` / `writeStatus`, plus
  `createRenderQueueDrainer` (the per-tick + startup-catch-up drain controller). Host-neutral — the future
  Codex hooks reuse `enqueue()` verbatim; `enqueuedBy.host` is provenance only.
- **The heal controller is the one bounded engine.** `lib/heal-render.mjs` gains `submit()` / `isBusy()`,
  funnelling queue-driven renders through the SAME `inFlight` (per-repo) / concurrency-cap / `pump` /
  `spawnOne` machinery as the stale-render heal — so a queue render and a heal render for one repo can never
  run concurrently and clobber the view. `resolveRenderEntrypoint()` is now the single renderer-resolution
  seam (the one place native interop later repoints at the active machine runtime).
- **Both daemons drain.** `hub-serve` drains every registered repo on its reconcile tick + an immediate
  startup catch-up; the standalone `render-sunflower-serve` does the same for its one repo (on a timer that
  runs regardless of the heal toggle). `/__sdlc/health` gains a `renderQueue` block.
- **Coalescing keeps it bounded.** A burst of writes to one bucket renders once (`--only <bucket>/**`); a
  `bootstrap` request or several touched buckets collapse to one whole-repo `--bootstrap` pass. Off-pipeline
  buckets (`simplify`/`profiles`/`dep-updates`/`ideation`) now render incrementally via the queue instead of
  only at the next bootstrap.
- **Hub-down resilience.** When no daemon answers, the write hook still enqueues durably, makes a
  best-effort detached `hub-ensure` start attempt (which also registers the repo), and records the failure in
  `.status.json` / `.render-errors.log`; the queued change renders at the hub's startup catch-up. SessionStart
  surfaces a one-line "N renders pending — hub unreachable" advisory. There is **no inline-render fallback** —
  views lag rather than rendering inline.
- **Config + rollback.** New `view.renderDispatch: "hub" | "inline"` (default `hub`; `inline` restores the
  exact legacy per-write spawn — the rollback / A-B switch), `view.ensureHubOnWrite`, and
  `view.renderQueue.maxPending`. New detached helper `scripts/hub-ensure.mjs`; new env kill switch
  `SDLC_DISABLE_ENSURE_HUB=1`. +26 tests (`render-queue.test.mjs` + hook dispatch cases).

### Fixed — tray autostart launcher self-heals to the current version + durable node path (9.72.0)

After a plugin upgrade relocates the tray bundle (`…/<version>/dist/tray.mjs`), an **enabled** autostart
launcher kept pointing at the *prior* version's bundle. The only code that rewrites the launcher
(`refreshAutostart`) ran exclusively from inside a live tray (`scripts/tray.mjs`) — but a stale launcher
can't start the tray, so it could never self-heal (chicken-and-egg). The next logon then launched the old
version, or nothing.

- **Headless self-heal.** `hooks/session-start-orient.mjs` now calls `refreshAutostart` on every session
  start (no-op when autostart is disabled or already current), re-stamping an enabled launcher to **this**
  install's tray bundle even while the tray is dead. Fail-open — orientation never breaks on it.
- **Durable node path.** New `resolveDurableNodePath()` in `lib/tray-autostart.mjs`: an `fnm` per-shell
  `fnm_multishells/<pid>_<ts>/node.exe` path (ephemeral — fnm deletes it on shell exit, so the launcher
  silently dies at the next logon) is swapped for fnm's stable `aliases/default` node. Non-fnm paths
  (system node, nvm, volta) pass through untouched; falls back to `execPath` when no durable candidate
  exists, so it can never regress. Now the default `nodePath` for `enableAutostart`/`refreshAutostart`,
  so the tray's own enable/refresh sites inherit it too.

### Added — `craft` authors its own rich `design-contract` fragment (9.71.0)

`/wf-design craft` now authors a rich layer for its **own** output (`02c-craft.md`, `type: design-contract`),
not just the design brief's `design` fragment. The visual contract becomes the **14th rich-tier type** — reversing
the earlier Gap-D call that left contract pages prose-only "with no plausible near-term interactive layer."

- **Schema.** New `siblingYamlSchemas.design-contract` branch (`artifact`/`component`/`tokens`/`states`/`sizes`/`themes`,
  plus optional `contract[]` per-element rows and `anti-patterns[]`). `required[]` is intentionally minimal and the type
  is **not** added to `SIBLING_YAML_VALIDATED_TYPES` — it joins the write-time hard-validate allowlist only once a real
  authored sibling proves the shape (the established n≠1 policy).
- **Enforce + validate.** `design-contract` added to `RICH_TIER_TYPES` (`post-write-verify` hard-blocks `02c-craft.md`
  written without its sibling `.yaml`; a missing `.html.fragment` nudges) and to `verify-fragment.mjs`'s allowed set.
- **Render.** `design-contract.mjs` now reads the sibling YAML (falling back to frontmatter), renders the interactive
  fragment, and suppresses the static coverage matrix when a fragment is present — mirroring `design-critique.mjs`.
- **Author contract.** `skills/wf-design/reference/craft.md` gains a mandatory step to write `02c-craft.yaml` +
  `02c-craft.html.fragment` (`<section class="fragment-design-contract" data-artifact="design-contract">`).

### Added — CSS containment for free narrative fragments (9.71.0)

Free narrative fragments (Tier 2) are now **CSS-contained by default**, closing the one bleed vector that survived even
on the serve path (the daemon CSP allows `style-src 'unsafe-inline'`). Each fragment's `<style>` rules are wrapped in a
native `@scope (.nfrag[data-label="<label>"])`, so a global selector (`body`, `*`, `.card`) can only match inside that
fragment's own wrapper — never the page chrome above it or a sibling fragment.

- Inline `style="…"`, class usage, and design-token inheritance are untouched, preserving "narrative blend."
- Scripts remain out of scope (already neutralised by the serve `script-src 'self'` CSP).
- Browsers without `@scope` (pre-2023) ignore the scoped block → the fragment renders unstyled rather than bleeding
  (safe degradation).
- New `view.scopeNarrativeCss` config key (default `true`); set `false` to inject `<style>` verbatim/unscoped.


### Added — free narrative fragments: unrestricted, raw-inline HTML for any artifact (9.70.0)

Fragments now come in **two tiers**. The existing typed fragment (`<stem>.html.fragment`, exactly one per artifact,
contract-bound and projected from the sibling `.yaml`) is unchanged. On top of it, **any** artifact written by **any**
subcommand may now ship any number of **free narrative fragments** named `<stem>.<label>.html.fragment` — completely
unrestricted raw HTML the agent authors to tell whatever story the artifact needs (a bespoke architecture diagram, a
before/after flow, a state machine, an interactive widget), with **no** envelope, scoping, `sdlc:fragment-ready` dispatch,
sibling `.yaml`, or determinism rule.

- **Discovery + injection.** The renderer scans the directory holding each `.md` for `<stem>.<label>.html.fragment`
  siblings, sorts them by filename (an `NN-` label prefix gives explicit order), and injects their raw HTML **raw-inline**
  below the page body inside a single positional `<section class="narrative-fragments">`. Injection happens at one central
  seam after the renderer returns, so it works for all typed renderers AND the generic fallback — i.e. for every artifact
  type, not just the rich tier.
- **Raw inline, not sandboxed** (the deliberate choice): maximum narrative blend (fragments inherit the page's design
  tokens and flow as part of the document), at the cost of no isolation — a global selector or thrown script in one fragment
  can affect the rest of the page. Views are gitignored/local-only, so the concern is page-breakage, not exfiltration.
- **Verifier.** `verify-fragment.mjs` now classifies each `.html.fragment` by filename (reusing the renderer's
  `classifyFragmentName`) and **exempts** free fragments from the envelope contract; the typed fragment is still fully
  enforced. (Also fixes a latent array-vs-object return on the no-section path.)
- **Staleness.** Adding/editing/removing a free fragment marks its artifact stale on both the additive and bootstrap render
  paths, so the page re-renders without a `--clean`.
- **Escape hatch.** `view.narrativeFragments: false` in `.ai/sdlc-config.json` suppresses all free fragments repo-wide
  (the typed fragment is unaffected). New reference: `reference/narrative-fragments.md`; the two shared fragment-contract
  docs and all six artifact-producing routers now point to it.

### Fixed — rendered slice counts now follow the slice roster after `wf-meta extend` (9.69.0)

`/wf-meta extend` adds net-new slices by bumping the slice roster (`03-slice.md`: `total-slices` + `slices[]`) and writing new
slice files — but it never re-bumps the implement-stage roll-up (`implement-index.slices-total`) or a stored `{done,total}`
progress counter. Several rendered surfaces read those stranded fields and kept showing pre-extend counts.

- **Implement station** (slug-overview stage stripe + the mobile stepper, which share one annotation function) now derives its
  denominator from the slice roster and its numerator from the max of the roll-up's `slices-implemented`, live implement-leaf
  completions, and roster completions. "3/5 slices" becomes "3/7" after extending to seven, instead of stranding at "3/5".
- **Header progress metric** reconciles a `{done,total}` counter's denominator up to the live roster total (never shrinking it),
  so progress is shown over the current slice count rather than the count at the time the counter was last written.
- **Implementation index page** shows `implemented / total` (roster-backed) in its lede, badge, and `slices` metric instead of a
  bare implemented-count that silently hid the newly-added, not-yet-implemented slices.
- **`/wf-meta extend`** now also reconciles author-written counts in the slice-index body — any "N slices" summary sentence and
  the `## Recommended Order` list — the one slice-number surface a renderer cannot recompute because it lives in free prose.

### Fixed — off-pipeline artifacts (`simplify`/`profiles`/`dep-updates`/`ideation`) now render on the bootstrap path (9.68.0)

A `/simplify` run wrote a fully-authored rich artifact under `.ai/simplify/<run-id>.{md,yaml,html.fragment}`, but it never
appeared in `.ai/_view/`. Two components each deferred to the other: the PostToolUse render hook
(`hooks/render-on-artifact-write.mjs`) skips off-pipeline writes "for the next bootstrap render", but the bootstrap planner
(`bootstrapMain`) only freshness-scanned workflow slugs + `project` + `docs` — never the off-pipeline roots. So these artifacts
rendered nowhere except a manual unscoped full render. A second, compounding defect: the work-set match path gave off-pipeline
kinds a bare `storageRel` with no bucket prefix, so even a `--only simplify/**` job matched nothing.

- **`OFF_PIPELINE_BUCKET`** — new single source of truth mapping each off-pipeline kind to its `.ai/_view/<bucket>/` subdir
  (`profile`→`profiles`, `deps`→`dep-updates`), shared by the work-set match path and the bootstrap job glob so they cannot drift.
- **`filterStoragePath`** now namespaces off-pipeline kinds with their bucket, so `--only <bucket>/**` can target them. The
  no-`--only` additive pass ignores this string, so the change is targeting-only.
- **`bootstrapMain`** resolves the four off-pipeline roots and adds a freshness loop (mirroring the `docs`/`project` blocks) that
  schedules `--only <bucket>/**` jobs via `classifyRenderState`; new `offPipelineInputs()` folds sibling `.yaml`/`.fragment` mtimes
  into the staleness check. `runRenderJob` now also forwards `--dep-updates`/`--ideation`.
- **Tests:** `tests/unit/lib/bootstrap-offpipeline.test.mjs` (3 subprocess tests) — `--only simplify/**` renders; bootstrap
  schedules `render simplify (missing)`; skips when fresh.

### Removed — router-migration verification apparatus + `router-metadata.json` (9.67.0)

The router migration finished at v9.0.0-alpha; its verification scaffolding had become pure friction — every
`skills/*/reference/*.md` edit required re-stamping a `migration-manifest.json` bodyHash. Stripped the whole apparatus.

- **Deleted (19 files):** `scripts/verify-router-migration.mjs` (the 8-check verifier), `scripts/migrate-router.mjs`,
  `scripts/verify-routing-resolution.mjs`, the three `scripts/relocate-wf*.mjs` one-shot relocators,
  `scripts/rewrite-review-refs.mjs`, `tests/migration-fixtures.json`, the 4 `migration-manifest.json`, all 6
  `router-metadata.json`, and `.github/workflows/verify-router-migration.yml`.
- **`router-metadata.json` was runtime-read; its data is inlined, not lost.** `skills/review/SKILL.md` already
  duplicated the 7 aggregate compositions and the model split in prose — that prose is now source-of-truth (model rule:
  `haiku` default; `architecture`/`refactor-safety`/`security` → `sonnet`). Every `wf-quick`/`wf-meta` reference already
  named its literal model; only the "resolved from `router-metadata.json`" provenance clause was removed.
- **`npm run verify`** is now `verify-doc-site.mjs` only. The fragment-validity contract (the former Check 7) still runs
  standalone via `node scripts/verify-fragment.mjs`; write-time sibling-presence enforcement via the hook is unchanged.
- `.gitattributes` LF rule kept (now justified by the snapshot / fragment-determinism `sha256`, not the manifest).
  341 tests pass; build-freshness unaffected (none of the deleted scripts are build entry points).

### Fixed — sibling-YAML validation lens + plan false-positive; allowlist now {plan, review, design, simplify-run, ship-run} (9.66.0)

The post-write-verify hook keys the sibling-`.yaml` schema on the `.md`'s `type:` (`fragmentOwningType`), not the
`.yaml`'s own `artifact:` field. Re-validating that way against the FULL artifact corpus across the registered repos
exposed that v9.62.0 reconciled `plan` against a single artifact — so 12/12 real `plan` siblings would have been
BLOCKED (exit 2) once installed. The schema fixes shipped runtime-read in the prior commit; this bundles the allowlist
correction and bumps the version.

- **plan** reconciled against all 12 real siblings: `modules` accept id-form, name-form, or plain strings; `rev` ≥ 0;
  `files[].delta` = number | string | `{ add, rem }`; `risks` no longer require `title` and allow severity `resolved`;
  `edges[].kind` is a free string.
- **ship-run** reconciled (no required `artifact`; free-form stage `name`/`status`; free-string check `kind`) and ADDED
  to the allowlist — it has 2 real siblings (they omit `artifact:`, which an earlier field-keyed scan missed).
- **review** findings accept `{triage,status,message}` as well as `{confidence,action,msg}`; dimensions accept the live
  per-severity `{key,status,blocker,high,med}` shape.
- **review-dimension** REMOVED from the allowlist: per-dimension reviews are authored as `type: review-command`, so the
  hook (keying on `.md` type) never reaches the `review-dimension` schema — the entry was dead. Its schema stays
  reconciled for other consumers.
- Every allowlisted type now passes its ENTIRE real corpus (plan 12/12, review 3/3, design 1/1, simplify-run 1/1,
  ship-run 2/2); adversarial malformed shapes still rejected. The 9 unexercised / sibling-less types stay out.

### Added — reconcile + write-validate 4 more sibling-YAML types against the real corpus (9.65.0)

Continues the `plan` reconciliation. Scanned all 71 sibling `.yaml` files across the 6 registered repos
and found only 5 of 15 artifact types are exercised anywhere: `plan` (done), `review`, `review-dimension`,
`design`, `simplify-run`. Reconciled the four against the live corpus and added them to the write-time
validation allowlist; all four now pass their *entire* real corpus while malformed shapes are still rejected.

- **`review-dimension`** — `summary` cap raised 500→2000 (real summaries run to ~571 chars); `findings[].line`
  accepts `null`/string (real reviews emit null lines). 29/29 real artifacts pass.
- **`review`** — dropped `parent`/`model`/`run_at` from `required` (real aggregates omit them); `dimensions[]`
  accepts the live per-severity `{key,status,blocker,high,med}` shape alongside legacy `{name,count}`; findings
  accept the `{triage,status,message}` convention as well as `{confidence,action,msg}` (`msg` no longer
  required). 3/3 pass.
- **`design`, `simplify-run`** — already accepted their real artifacts; added to the allowlist as-is (n=1 each).
- **`SIBLING_YAML_VALIDATED_TYPES`** = {plan, review, review-dimension, design, simplify-run}. The other 10 types
  (`description`, `rca`, `design-critique`, `design-audit`, `profile`, `benchmark`, `experiment`, `instrument`,
  `ship-run`, `sync-report`) have **no real artifact in any registered repo**, so their schemas can't be
  validated empirically and stay OUT of the allowlist — adding a guessed schema would arm a write-time block
  (exit 2) on the first author of that type. They join only when a real artifact proves the schema.
- New unit coverage mirrors the real review/review-dimension shapes + malformed rejection.

### Docs — sync the `plan` reference to the reconciled sibling-YAML schema (9.64.0)

v9.62.0 reconciled `siblingYamlSchemas.plan` and wired write-time validation, but documented the
convention only in the schema's `description` fields — routing *around* the `verify-router-migration`
content-integrity gate rather than through it. This brings the canonical reference into agreement and
re-stamps the manifest the honest way.

- **`skills/wf/reference/plan.md` → Step F** now describes the live sibling-`.yaml` convention authors
  actually write: `modules` as `string | {id,label,role}`; `files[]` carrying the `status` change-type
  (what the file-change topology colors by — *not* `role`, which is now a free-string category), the
  `module` id-ref, string/`~` `loc`, and object-or-string `planned_change`; `edges` `kind`/`type`/`label`;
  `risks` `severity`/`detail`/`mitigation`. Documents that `post-write-verify` **blocks (exit 2)** a
  malformed `plan` sibling `.yaml` (gated by `hooks.validateSiblingYaml`).
- **`skills/wf/migration-manifest.json`** re-stamped via `migrate-router --router wf` so the gate passes
  on the edited body — only the `plan` entry's `bodyHash`/`bodyBytes` (and the regenerated timestamp)
  moved; no other reference touched.
- No code or schema change — reference doc + manifest only. Version bumped so the doc-site brand and the
  bundled `PLUGIN_VERSION` stay single-sourced.

### Added — serving daemons heal version-stale views in the background (9.63.0)

The render-time version gate (9.60.0) forces a clean re-render whenever a view's recorded
`.last-render` version differs from the running plugin — but only when a render is *invoked*. After an
upgrade, a quiescent repo's already-rendered pages stayed frozen at the old version (old markup under
freshly-recopied CSS = a split-brain page) until something happened to re-render it. The serving
daemons now supply the missing caller, off the HTTP request path. See STALE-RENDER-HEAL-PLAN.

- **Heal controller** (`lib/heal-render.mjs`) — a bounded, level-triggered healer. The hub's
  reconcile tick (and a new timer on the standalone fallback daemon) asks it to `consider` each view
  every tick; on version drift it spawns a background `render-sunflower --clean` for that repo
  (`cwd=repoRoot` — the renderer has no `--project-root` flag), and the existing `.last-render` watch
  fires live-reload so open tabs refresh. Triply bounded: a `maxConcurrent` cap, a per-repo
  `cooldownMs`, and a `maxAttempts` ceiling that surfaces a visible `failed` state instead of
  respawning a wedged render forever.
- **Decoupled from requests** — heal is timer-driven, never request-driven, so a remote GET over a
  public binding can never trigger a render. Drift heals in either direction (the installed daemon's
  version is authoritative for the machine); an unversioned pre-9.60 view counts as stale.
- **Config** (`staleRender` in the machine-wide `~/.sdlc/hub-config.json`) — `heal` defaults **on**;
  `maxConcurrent:1`, `cooldownMs:60000`, `maxAttempts:3`. Reaches both daemons via env at spawn
  (`SDLC_STALE_RENDER`, like `codeBrowser`). `heal:false` keeps detection-only — the hub still flags
  `stale` in health.
- **Observability** — `/__sdlc/health` now reports each entry's `renderedVersion` + `stale` (read
  live from `.last-render`) and a top-level `heal` snapshot (`inFlight`/`queued`/`failed`); the
  registry entry carries `renderedVersion` too.
- Tests: a heal-controller unit suite (drift detection, the bounds, retry→failed, direction-agnostic
  healing, spawn shape) and hub integration (reconcile heals a stale view via an injected spawn stub;
  health flags `stale` with heal off).

### Changed — reconciled the `plan` sibling-YAML schema to the live convention + wired write-time validation (9.62.0)

Follow-up to 9.61.0. The crash was one symptom of a deeper drift: `siblingYamlSchemas.plan`
described a dialect agents no longer author, and `validateSiblingYaml` (the validator that would
have caught it) existed but was **never called outside tests**. Reconciled the contract so the
schema, renderer, and a newly-wired hook all agree.

- **Schema** (`tests/frontmatter.schema.json`) — `siblingYamlSchemas.plan` now matches what agents
  write: `modules` accepts `string | {id,label,role}`; `files[]` gains `module` (id ref) and
  `status` (change-type) and accepts a category `role`, string/`~`-prefixed `loc`, and string
  `planned_change`; `edges` accepts `type`/`label`; `risks` accepts `severity`/`detail`/`id`/
  `mitigation`; `history` accepts an array; `parent`/`rev`/`risks` are no longer required. Verified
  the real authored corpus validates while genuinely-malformed YAML (e.g. a `modules` object with no
  `id`) is still rejected.
- **Renderer** (`renderers/plan.mjs`) — the file-change topology now colors by `status` (falling
  back to a recognized `role`, else `modified`). Fixes a latent bug where the new convention's
  category `role` (`config`/`ui`/…) matched none of `new`/`deleted`/`external`, silently painting
  every file as "modified."
- **Hook** (`hooks/post-write-verify.mjs`) — wired `validateSiblingYamlFile` into write-time
  verification: a present sibling `.yaml` for a reconciled type is validated against its schema and
  BLOCKS (exit 2) on a violation. Scoped to `SIBLING_YAML_VALIDATED_TYPES` (currently `plan`) so the
  14 not-yet-reconciled type schemas can't false-positive; gated by the new
  `hooks.validateSiblingYaml` config flag (default true, opt-out).
- Tests for the reconciled schema (rich + legacy accepted, malformed rejected), the `status`-based
  coloring, and the hook block + opt-out.

### Fixed — rich object-form sibling YAML no longer crashes a renderer into prose-dropping fallback (9.61.0)

**Root cause — a renderer crash silently dropped the markdown prose.** A plan slice whose sibling
`.yaml` authored `modules:` in the rich object form (`- id / label / role`, with files referencing
them via `module:`) crashed `renderers/plan.mjs`: `fileTopologySvg` assumed `modules` was an array
of path-prefix *strings* and called `b.mod.toUpperCase()` on an object → `TypeError`. The render
dispatch catches any typed-renderer throw and falls back to a generic renderer whose body logic was
`fragment ? fragment : prose` (XOR) — so for a fragment-bearing artifact the **entire markdown prose
vanished**, leaving only the fragment. The page was also frozen at an old `data-sdlc-version` because
no re-render had run since, masking it as staleness; re-rendering on current code reproduced the
throw deterministically.

**Fixes.**
- `fileTopologySvg` now normalises `modules` to `{ key, label }`, accepting both legacy path-prefix
  strings and `{ id, label, role }` objects, and buckets files by their declared `module:` id (else
  by path prefix). The module label is coerced to a string before display. Legacy string-form plans
  render byte-identically (snapshots unchanged).
- Guarded the remaining string-method-on-YAML-value sites of the same class: plan data-flow lane
  labels (`renderers/plan.mjs`) and the RCA timeline/causal-chain `kind`/`title`/`body`
  (`renderers/rca.mjs`).
- `renderers/plan.mjs` wraps figure construction in a guard: a malformed sibling YAML degrades the
  figure to the placeholder topology instead of taking down the whole render.
- Structural safety net: the generic fallback renderer (`scripts/render-sunflower.mjs`) now emits
  **both** the fragment and the markdown prose, so no future typed-renderer crash can silently drop
  an author's prose.
- Regression tests cover object-form modules (prose + fragment + topology survive) and figure
  degradation.

### Fixed — template/version changes now re-render every page; mobile nav surface polish (9.60.0)

**Root cause — stale chrome after template changes.** The additive (incremental) render keys
dirtiness on source-artifact mtime vs output-HTML mtime only (`renderers/_mtime.mjs#isDirty`), with
no template/renderer/CSS/version component. So a shell or stylesheet change that bumps the plugin
version *without touching any artifact* left every already-rendered page frozen at its old chrome —
while the unconditionally-recopied assets raced ahead, producing split-brain pages (current CSS over
stale markup). Observed in the wild: an `osce` dashboard stamped `data-sdlc-version="9.35.0"`
serving the pre-9.53 tabbar (Home/Overview/Up, no bottom sheet) under v9.59 CSS — the entire 9.53
nav unification had never reached it.

- **Version gate.** `.last-render` now records `version`, and a render forces a clean pass when the
  recorded version differs from the running `PLUGIN_VERSION`. A missing/unparseable record (first
  render, or post-clean) stays additive — no clean loop. Verified end-to-end: an unchanged
  re-render still skips every artifact page (no perf regression); a version-rewound re-render
  rewrites all of them.
- `PLUGIN_VERSION` is now **exported** from `renderers/_shell.mjs` and shared by the renderer and
  the manifest, so the script no longer carries its own version literal (one fewer bump-spot).

**Mobile nav surface (`<=720px`).**

- **Active tab on deep pages.** The bottom tabbar lit no tab below depth 2 (Overview was active
  only at depth exactly 2), so stage/artifact pages lost their "you are here" cue. Overview now
  owns the section root *and everything nested under it* — exactly one tab is always active.
- **Breadcrumb truncation fixed end.** The appbar crumb clipped the *current* segment off-screen on
  deep trails (only the last item got ellipsis, with no shrink discipline). It now pins the current
  segment to the right and fade-clips the ancestor chain on the left.
- **Honest disclosure semantics.** The menu sheet dropped its misleading `role="dialog"` (it traps
  no focus and inerts no background) and is now a plain labelled disclosure; `sdlc.js` moves focus
  into the sheet on open and restores it to the menu control on close.
- **Redundant footer hidden on mobile** (its up/updated/md links all live in the menu sheet), and
  the tabbar's hardcoded translucent fill became a `--paper-glass` token so a future theme has one
  override point.

Five new shell regression tests pin the tabbar active-state and the disclosure semantics. Renderers
are bundled, so `dist/` is rebuilt in the same commit.

### Changed — slug dashboard stats are now all derived from artifacts, so they're always current (9.59.0)

Follow-up to 9.58.0. The slug-overview callout band (and mobile tiles) read `LOC TOUCHED`,
`TESTS`, and `BLOCKERS` from `00-index` frontmatter fields that nothing maintains, so they showed
a permanent `—`/`0`. Every value now derives from the artifacts on disk via one shared
`slugStats()` helper (used by the desktop band, the mobile tiles, and the verify caption, so they
can't drift):

- **LOC TOUCHED** — lines added + removed from the implement roll-up (`metric-total-lines-*`),
  summed across implement leaves when no roll-up exists. (osce: `26.2k`.)
- **REVIEWS** — the count of review *dimensions* (`review-command`), excluding the `review` index
  roll-up (which was inflating it by one). (osce: `14`.)
- **BLOCKERS** — blocked slices in the roster plus verify leaves flagged `has-blockers`, instead
  of a never-written index field. (osce: `0`.)
- **TESTS → CHECKS** — the cell is **relabelled CHECKS** and shows the verify-stage gate checks
  passed (`metric-checks-passed`, passed/run when any failed) — the structured verification metric
  this workflow actually records. The label is honest: the schema has no unit-test count (those
  live only in prose). (osce: `175`.) Index fm overrides still win where a human sets one.

Two `osce`-shaped regression assertions pin the derived band values. Renderers are bundled, so
`dist/` is rebuilt in the same commit.

### Fixed — slug dashboard miscounted slices, progress, and LOC by reading leaf artifacts instead of roll-ups (9.58.0)

The slug overview (`00-index`) and slice-index dashboards recomputed their headline numbers by
scanning per-artifact leaf files, whose frontmatter tracks a *different* thing than the dashboard
shows — so wherever the leaf and the index roll-up diverged, the UI showed the (younger, wronger)
leaf. On a completed 16-slice workflow this surfaced as five contradictions:

- **Slice count off by one** (`17 slices`, was `14`). `stageArtifacts` counted a stage's own
  `*-index` roll-up as a work item — `03-slice.md` is itself type `slice-index`. It now counts
  work-item types only, which also de-inflates the plan/implement/verify/ship counts.
- **Implement progress wrong** (`1/16`, should be `16/16`). The caption counted slice-**stage**
  file statuses (all `defined`, one stray `complete`) instead of the implement roll-up. It now
  reads `05-implement.md`'s `slices-implemented`/`slices-total`, falling back to implement-leaf
  completions over the slice roster.
- **Slice-index card showed `complete 0`** while badged `complete`. The card counted the leaf
  `defined` statuses; it now overlays the index's authoritative `slices[].status` roster onto
  each leaf (keeping the leaf's richer per-slice metadata).
- **`PROGRESS 0/0`** — a schema mismatch: `progress` is a stage→status map (`intake: complete`…),
  not a `{done,total}` counter. It's now read as the map it is (`done = count(complete)`).
- **`LOC TOUCHED —`** — read from the index frontmatter, where it's never written; it now derives
  from the implement roll-up's `metric-total-lines-added/removed`.

Every change keeps a graceful fallback to the prior leaf-derived behavior when a roll-up is
absent, so sparse/early workflows don't regress. Two `osce`-shaped regression tests lock the
counts in. (Two related presentation issues — non-monotonic per-stage dates and queued stations
showing per-slice artifacts — are tracked separately.)

### Fixed — code browser was unusable on phones; mobile is now single-pane master-detail (9.57.0)

The in-browser code browser (v9.52.0) only ever had a desktop layout. Its sole mobile rule
stacked the two panes and capped the file tree at `45vh`, so tapping a file rendered it
*below* a 365 px tree that never collapsed — on a 375×812 phone the viewer landed at y=439
with ~44 % of the screen, and you had to scroll past the whole tree to read what you tapped.
The 3-item topbar also crammed into 375 px and wrapped to a ragged 60 px.

Mobile (`≤720px`) is now a proper **single-pane master-detail** flow:

- The tree owns the full screen until a file is chosen; the empty "Select a file" viewer no
  longer eats the lower half.
- Selecting a file sets `.cb-detail` on the split, which swaps the tree out for a full-height
  viewer (code starts at the top, not below the tree). A `‹ Files` bar returns to the tree
  with the expansion state preserved.
- The topbar collapses to one tidy row (`brand · code ⎇ branch`); the "read-only working
  tree" hint is dropped and the crumb truncates instead of wrapping.

Desktop is byte-for-byte unchanged — the swap rules are scoped inside the `≤720px` media
query, so the `.cb-detail` class is inert above the breakpoint and both panes stay visible.
Implemented in the code-browser bundle's own chrome (`view-src/code-browser/`), independent of
the v9.53.0 served-page nav, and rebuilt into `dist/code-browser.{js,css}`.

### Fixed — mobile nav chrome never rendered; navigation unified across all viewports (9.53.0)

The M-S1 mobile appbar + tabbar have been **dead since they landed**: their reveal rules
(`.m-appbar { display:block }` in the ≤720px responsive block) sat *earlier* in `sdlc.css`
than the mobile component library's default-hidden rule (`.m-appbar, .m-tabbar { display:none }`)
— same specificity, so the later hide always won. Since the desktop `.b-topbar` is also
hidden at ≤720px, phones rendered **no chrome at all**. The reveals now live in the mobile
library's own media block, after the hide rule, with NOTE comments in both places so they
can't drift apart again.

On top of the fix, the navigation surface is now one model — brand/home, breadcrumb trail,
real page actions — rendered per viewport from the same shell inputs:

- **Mobile menu sheet** (`<=720px`): the tabbar's redundant *Up* tab (it duplicated the
  appbar's ← back) is replaced by **Menu**, a CSS-only bottom sheet (`#m-menu` checkbox +
  label, the hub landing's CSP-safe no-JS pattern) listing **Places** (brand → home, every
  breadcrumb level, current page marked `aria-current`) and **Links** (`md ↗` source,
  `↑ up`, updated date). `sdlc.js` layers Escape-to-close, close-on-navigate, and a
  bfcache `pageshow` reset on top.
- **Serve-time hooks flow to phones.** The sheet carries the same `class="brand"` anchor
  and `class="actions"` cell as the desktop topbar, and the hub's brand→hub-root rewrite +
  `code ↗` injection are now **global** (the actions pattern widened to
  `class="actions[^"]*"`) — so under the hub, mobile finally gets a path to the hub root
  and the code browser. Fixtures in the hub + code-browser tests now mirror the two-anchor
  shell and pin both rewrites.
- **Honest desktop topbar.** The fake `⌘K to search · viewing as you` chrome is removed
  (no handler ever existed; VIEW-FEATURE-IDEAS #1/#9 — a real palette remains future work);
  the actions cell now holds the real `md ↗` source link plus the injected `code ↗`. In the
  720–880px band the breadcrumb truncates with an ellipsis instead of disappearing.
- **Hub landing gets its first responsive rules** (`<=720px`): tighter padding, wrapping
  inbox rows, full-width reason pills, larger tab touch targets.
- Stale version stamps fixed: the shell's `?v=` asset cache-buster (9.35.0 → current; was
  flagged in CODEBASE-BROWSER-PLAN) and the `INDEX.yaml` manifest version. Returning
  browsers actually fetch the new CSS/JS.

### Added — in-browser code browser for every served repo (9.52.0)

Every served repo now has a read-only **source browser** — a lazy file tree plus a
syntax-highlighted viewer — at `/r/<id>/__code/` under the hub and `/__code/` under the
standalone daemon. The repo topbar gains a serve-time **code ↗** link and each hub landing
card a **code →** affordance. It browses the *working tree*: gitignored files are shown and
badged `ignored` (generated artifacts and local files are first-class), while `.git/`
internals and secret-shaped files (`.env*`, keys, certs) are never served.

- **Backend** (`lib/code-browser.mjs`): `tree`/`blob`/`raw` endpoints behind a dedicated
  containment kernel — string-level rejects, lexical prefix containment, post-symlink-realpath
  containment, and a deny gate applied to both the requested path and its resolved target (the
  layer that also closes Windows trailing-dot/8.3-alias tricks). Ignored-badging via one
  TTL-cached `git ls-files --others --ignored --directory` spawn; text blobs cap at
  `maxBlobBytes` with a raw fallback; binaries are never inlined; `raw` serves text as
  `text/plain` (never `text/html`), marks every response `nosniff`, and attaches the strict CSP.
- **Frontend bundle** (`view-src/code-browser/` → committed `dist/code-browser.js|.css`):
  vendored kibo-ui tree + code-block components (animation dependency stripped, lazy
  per-folder loading added), React 19, and fine-grained no-WASM Shiki (`shiki/core` + the
  JavaScript RegExp engine) under a custom warm-paper TextMate theme. Nine grammars ship;
  `typescript`/`jsx` alias onto the `tsx` grammar so three overlapping JS-family grammars
  don't ship (~990 KiB minified total — above the plan's ~600 KB soft budget; the remainder
  is react-dom plus nine grammars with no redundancy left to trim). Tailwind v4 builds the
  CSS at build time (CSS-first `@theme`, no config file). Both artifacts are committed and
  served verbatim — end users still never `npm install`.
- **Build** (`scripts/build.mjs`): a second, browser-platform esbuild target plus a Tailwind
  CLI step in the same script; the CI freshness gate and the pre-commit rebuild now also
  trigger on `view-src/**` and smoke-check the bundle artifacts.
- **Config** (`~/.sdlc/hub-config.json` `codeBrowser.*`): `enabled` (machine-wide kill
  switch, default on), `maxBlobBytes`, `maxTreeEntries`, `lazyTree` (default on),
  `showIgnoredBadge`, `serveSecrets`, `denyGlobs`. Delivered to both daemons via env at
  spawn; config edits restart the hub via the existing hash-drift detection.
- **Security hardening shipped with the feature.** The standalone per-repo daemon gains the
  hub's Host-header allowlist on the new `__code` routes (a DNS-rebinding defence it
  previously lacked; view-route behaviour unchanged), with tailnet MagicDNS names admitted
  via `--allowed-hosts` exactly like the hub. `serveSecrets: true` is honored **only on a
  strictly-loopback binding** — under allow-all-hosts or an allowlisted tailnet Host the
  secret denylist stays active regardless, so changing the binding can never retroactively
  leak `.env` files.
- **Docs**: `reference/serve.html` documents every `codeBrowser.*` key, the deny-glob
  grammar, and the tailnet-exposure note (the source browser is a strictly larger surface
  than the rendered views).
- Tests: 25 new (kernel hostility incl. symlink escapes, deny grammar, walk badging/caps,
  blob kinds, both daemons end-to-end over HTTP, Host-gate allow/deny, secrets-vs-exposure).

### Fixed — render/hook project root anchored at the git toplevel (9.51.0)

Sessions parked in a repo subfolder minted stray `<subfolder>/.ai/_view` trees with empty
dashboards (three found in one live repo, one nested inside a workflow slug dir): the render
hook trusted the session cwd verbatim and the renderer used raw `process.cwd()`, while
registry identity already climbed to the git toplevel — the two layers disagreed about where
the project was.

- New `lib/project-root.mjs` `resolveProjectRoot()`: the nearest ancestor owning
  `.ai/workflows` wins (monorepo-safe, capped at the git toplevel; a stray `_view`-only dir
  never anchors), else the git toplevel, else the start dir unchanged (non-git fallback).
- Wired into the hooks' project-root resolution (including hook-log writers and the
  SessionStart bootstrap spawn), both stages of render-on-artifact-write, the renderer's
  main/bootstrap entrypoints, and the serve daemon's cwd-derived default — an explicit
  `--project-root` still wins.
- Covered by `tests/unit/lib/project-root.test.mjs` (subfolder cwd, slug-dir cwd with a stray
  `_view`, monorepo nearest-wins, non-git fallback).

### Added — hub serves the plugin docs site + uniform hub-aware navigation (9.50.0)

The multi-repo hub now serves the plugin's own documentation site and links it from the
inbox, and the serve-time "you are under the hub" rewrite is applied uniformly across every
page type instead of only `INDEX.html`. This closes the navigation story: from the inbox you
can reach every repo → slug → stage *and* the docs, and from any served page the brand takes
you back to the hub.

- **Docs at `/docs/`.** The hub serves `docs/site` (the first-party plugin docs) under
  `/docs/`, with a `/docs` → `/docs/` redirect so the docs' relative links resolve against the
  docs root. The inbox header gains a **Plugin docs →** link, present in the empty-registry
  state too (exactly what a brand-new user with no repos needs). Routing reuses the same
  audited containment kernel as the `/r/<id>/` repo routes, so a traversal can never escape the
  docs tree.
- **First-party docs CSP.** `/docs/` responses carry a relaxed CSP that admits the docs'
  inline nav script and the Mermaid CDN import; repo views keep the strict `script-src 'self'`
  (their `.html.fragment` output is semi-trusted). The relaxation is scoped to `/docs/` alone.
- **Uniform hub brand + live reload.** The serve-time transform (repo-id meta, live-reload
  injection, brand→hub rewrite) now keys on the `.html` extension, not just `INDEX.html`, so
  project-context pages (`project/PRODUCT.html`, `project/ship-plan.html`) get the same hub
  brand and live reload as every slug/stage page instead of being served untransformed.
- **Honest home affordance.** When the hub repoints the topbar brand at the hub root it now
  relabels it **“sdlc hub”** — clicking “.ai/workflows” and landing on the multi-repo hub was
  a label/destination mismatch. The breadcrumb's first “sdlc” crumb stays the repo-local home,
  giving a clean two-tier trail (hub → repo → slug → stage).
- **Shared-kernel `indexFile` option.** `resolveRequestPath` gained an `indexFile` option
  (default `INDEX.html`) so the docs' lowercase `index.html` resolves through the one audited
  path resolver rather than a second, divergent one.

### Added — slug-branch identity: repo-scoped registry ids + branch-aware hub (9.49.0)

The multi-repo hub keyed each registry entry's id off `hash(repoRoot + HEAD-branch)`.
That single choice produced three defects: **phantom duplicates** (rendering on `main`,
switching to `feat/x` in place, and re-rendering forked one entry into two that both pointed
at the same branch-blind `.ai/_view`), **aliased routes** (`/r/<id_main>/` and
`/r/<id_featx>/` served byte-identical last-render-wins content), and **no merge/delete
awareness**. Root cause: branch was treated as a property of the *checkout* (one volatile
HEAD) when it is really a property of the *slug* — every `00-index.md` already declares its
own schema-required `branch` / `branch-strategy` / `base-branch` / `pr-number`, loaded by the
scanner but never surfaced. This release moves branch *inside* the entry (per slug) and keys
identity off the repo. See `SLUG-BRANCH-IDENTITY-PLAN.md`.

- **Per-slug branch metadata (Slice 1).** `loadWorkflowIndex` + `collectSlugMeta` now surface
  `branch` / `branchStrategy` / `baseBranch` / `prNumber` / `prUrl` on each slugMeta row. The
  unset sentinels seen in live repos — `branch: ""` under `branch-strategy: none`, and
  `pr-number: 0` / `pr-url: ""` for no-PR — are normalised to `null` at this single plumbing
  point so downstream grouping and liveness never re-distinguish `""` from absent.
- **Repo-scoped identity + v1→v2 migration (Slice 2).** `computeEntryId` now hashes
  `repoRoot` ALONE; the collision rule is branch-insensitive; the checkout's HEAD is stored as
  informational `headBranch` (no longer identity). `REGISTRY_VERSION` is bumped to **2** and a
  pure-on-read migration re-keys v1 entries off `repoRoot` and merges any that collapse —
  unioning slugMeta by slug, latest `updatedAt` winning scalar fields, earliest `registeredAt`
  preserved. The same idempotent re-key powers the merged read view, so a stale pre-upgrade
  shard can't resurrect a phantom duplicate. **One-time route-URL break**: existing
  `/r/<id>/` bookmarks change once (ids drop the branch); they are *more* stable thereafter.
- **Repo → branch → slug grouping (Slice 3).** The hub landing page renders one card per
  repo (the worktree, a distinct `repoRoot`, gets its own card) with the HEAD branch shown as
  informational context, and groups that card's slugs into per-branch sub-lanes driven by
  `branch-strategy`: `dedicated` → its own lane, `shared` → a clustered lane, `none` → under
  `base-branch`/trunk (never a literal empty lane). The cross-repo inbox row now shows each
  slug's declared branch.
- **Branch liveness — soft badges (Slice 4).** New `lib/branch-liveness.mjs` classifies each
  slug's branch as `live` / `merged` / `gone` / `unknown` against its own repo (local git for
  ref-existence + base-ancestry; a best-effort, network-guarded `gh pr view` for merged PRs).
  Computed at render time and opportunistically refreshed on the hub's `reload()` (local-only,
  so a reload never blocks), it renders a soft `merged` / `branch gone` badge and a fourth
  inbox attention reason. It **never** deletes a slug or entry — the user closes the workflow.

Invariants preserved: `/r/<id>/` still routes through `validateEntry` (no widening of path
containment), the hub renders fully in-memory (all new fields ride in slugMeta — zero
per-request disk/git), and every liveness/registry write is best-effort and never throws.
Phase-0 survey of 8 live repos (≈50/50 gitignored-vs-committed `.ai/workflows`) confirmed the
branch sub-lanes earn their complexity. 265 tests pass; dist rebuilt.

### Changed — extend sibling-fragment enforcement to 3 more fragment-owning types (9.48.0)

v9.47.0 hard-blocked a missing sibling `.yaml` for the 10 fragment-owning types in
`post-write-verify`'s `RICH_TIER_TYPES`. But 3 more agent-authored types render a rich
tier through their own renderer (`review-dimension.mjs`, `design-audit.mjs`,
`design-critique.mjs`) yet were never gated — a missing sibling there got zero signal.
This release adds them to the block set (by their literal frontmatter `type:`):

- **`review-command`** — the per-dimension review files (`07-review-<command>.md`). These
  are written by the Step-3 review sub-agents, so this also closes a **delivery gap**:
  `skills/wf/reference/review.md` now injects the sibling-authoring step into the review
  sub-agent prompt (the sub-agent holds that dimension's findings in context), mirroring
  the v9.47.0 plan fix. A clean, zero-finding dimension opts out with `fragment: none`.
- **`design-audit`** (`/wf-design audit`) and **`design-critique`** (`/wf-design critique`)
  — both are orchestrator-written and already carried the "write the sibling `.yaml` +
  `.html.fragment`" directive, so adding them to the gate is sufficient.

The two remaining fragment-rendering types — `sync-report` (`/wf-meta sync`) and
`docs-index` (`/wf-docs`) — are deliberately left **ungated**: they are
automation-regenerable snapshots (`regenerable: true`), rewritten every run, so a hard
block would wedge the regenerator rather than prompt an author. Enforcement now covers
13 of the 15 fragment-rendering types; the 2 exclusions are by design.

### Fixed — rich-tier sibling fragments now actually get authored (9.47.0)

The sunflower "rich tier" (file-change topology, files-touched tables, verdict
heatmaps, deploy timelines) renders from a sibling `<stem>.yaml` + `<stem>.html.fragment`
written next to each rich artifact `.md`. In practice those siblings were **never
authored in live repos** — every rich page silently fell back to plain prose — for
two reasons this release fixes:

- **Routing gap (plan, parallel mode):** the per-slice plan files are written by
  sub-agents, but the MANDATORY "write the rich `.yaml` + fragment" step (Step F)
  lived only in the orchestrator's section and was never injected into the sub-agent
  prompt. `skills/wf/reference/plan.md` now makes sibling authoring an explicit part
  of each per-slice sub-agent's job, and requires the orchestrator to pass Step F
  into every sub-agent prompt.
- **No teeth (all rich types):** a rich `.md` written without its sibling `.yaml`
  produced only a **non-blocking** reminder, which agents routinely skipped. The
  `post-write-verify` hook now **BLOCKS (exit 2)** when a rich-tier artifact (`plan`,
  `review`, `design`, `ship-run`, `rca`, `benchmark`, `experiment`, `instrument`,
  `profile`, `simplify-run`) lands without its mandatory `.yaml`, and softly nudges
  when only the optional `.html.fragment` is missing. A contract-compliant agent
  (which writes the `.yaml` first) never trips the block.

Escapes: opt a single artifact out with `fragment: none` in its frontmatter (for a
rich artifact with genuinely no structured data to project); disable enforcement
repo-wide with `hooks.remindMissingFragments: false` in `.ai/sdlc-config.json` (now a
recognised config key — it was previously rejected by the config schema, a latent
bug also fixed here).

Also corrected the stale `slices/<slice>/04-plan.*` and `ship/<run-id>/09-ship-run.*`
**nested** path models in `plan.md`, `ship.md`, and `reference/fragment-author-contract.md`
to the **flat** layout the workflow actually emits (`04-plan-<slice>.*`,
`09-ship-run-<run-id>.*`) — writing siblings to a non-existent nested path was a third
way they went missing.

### Added — system-tray control app with opt-in logon autostart (9.46.0)

A user-launched **system-tray (notification-area) app** that controls the existing
sunflower hub — health summary, open dashboard, refresh registry, restart/stop,
open config/logs, per-repo-serve toggle, and an opt-in "Start at login" autostart.
Ships **fully self-contained** (committed Go helper binaries + icons + esbuild
bundle), so it runs on a fresh clone with **zero `npm install`**. See
`TRAY-APP-PLAN.md`. Run with `npm run tray` (or `node dist/tray.mjs`,
`.\scripts\tray.ps1`).

- **Pure, tested control layer.** `lib/tray-actions.mjs` (verbs: `getHealth`,
  `openDashboard`, `refreshRegistry`, `restartHub`, `stopHubAction`, `openConfig`,
  `openLogs`, `togglePerRepoServe`, `ensureHubOnLaunch`, …) and `lib/tray-format.mjs`
  (`formatHealth` + `fmtUptime`/`fmtBytes`/`fmtRelTime`) are pure/injectable — every
  icon state (hub-up, per-repo-up, down, stale) is a fixture unit test, no live
  server. New `writeHubConfig` completes the hub-config read/write pair.
- **Own the helper protocol (no systray2 JS dep).** `lib/tray-protocol.mjs` speaks
  the systray2 Go helper's line-delimited JSON directly. The npm package's binary
  resolver is cwd/`__dirname`-bound and breaks once esbuild bundles it; owning the
  ~120-line protocol fixes that *and* drops its heavy `request`/`fs-extra` transitive
  deps from the shipped bundle. The vendored binaries live in `bin/tray/`; the tray
  copies the right one to `~/.sdlc/bin/` (writable) before running.
- **Rides the shared build.** `scripts/tray.mjs` is a normal entrypoint in
  `scripts/build.mjs` → `dist/tray.mjs` (depth-1 ESM, deps inlined), covered by the
  existing dist/ freshness gate. A `--selfcheck` mode verifies binary + icon + format
  dep-free for CI. Icons are generated by `scripts/build-icon.mjs` (sunflower mark →
  `app-icon{,-down,-stale}.{ico,png}`).
- **Opt-in logon autostart (P5).** `lib/tray-autostart.mjs` writes a per-user
  launcher (Windows Startup `.vbs` / macOS LaunchAgent / Linux XDG) whose presence
  is the on/off state — no admin, no service. When enabled, the tray ensures the hub
  at logon (idempotent → adopts a running hub) and self-heals a launcher left
  pointing at a relocated bundle after an upgrade.
- **Provenance.** Helper binaries vendored from `systray2@2.1.4`'s `traybin/`. The
  one-off regen tools (`sharp`/`to-ico`/`systray2`) are intentionally **not** in
  `devDependencies` so `npm ci`/CI stays lean and vuln-free; regen commands are in
  `package.json` `comment:tray`.

### Changed — self-contained build: retire the runtime `npm install` (9.45.0)

A fresh marketplace install now runs with **zero manual steps and zero runtime
`node_modules`**. Every Claude-invoked entrypoint is esbuild-bundled (deps
inlined) into committed `dist/*.mjs`; the only `npm install` left is a
maintainer concern (building + tests). See `SELF-CONTAINED-BUILD-PLAN.md`.

- **Root cause it fixes.** The third-party deps (`markdown-it`, `js-yaml`,
  `ajv`/`ajv-formats`) reached users **only** via an undocumented manual
  `npm install` in the plugin dir. The **SessionStart hook** imports `loadConfig`
  → `lib/config.mjs`'s **top-level** `import 'ajv-formats'`, which throws at
  module-load (before any try/catch) on a fresh install — a silent hard-crash
  (Claude tolerates hook failures), so no orientation and no auto-render. It only
  "worked" on dev machines where `node_modules` was installed once.
- **Build (`scripts/build.mjs`, `npm run build`).** One esbuild call, many
  entrypoints → `dist/` at **depth-1** (`--format=esm --platform=node
  --target=node20`). The depth-1 invariant is load-bearing: bundled `lib/` code
  reads plugin-root files via `resolve(__dirname, '..', …)`, so emitting one
  level under the root preserves identical `..` semantics — **including shared
  chunks**, which are emitted flat in `dist/` (not a `chunks/` subdir) so a
  hoisted `lib/config.mjs` still resolves `../schemas` to the real plugin root.
- **Non-JS `lib/` assets are mirrored into `dist/`.** `build.mjs` copies every
  non-`.mjs` file in `lib/` beside the bundles, so a bundled lib module that
  resolves a runtime asset relative to its own location finds it at depth-1. The
  first such asset is `detach.mjs`'s `launch-hidden.vbs` (see the detached-spawn
  fix below) — the build carries it so the bundled path resolves.
- **Renderers are entrypoints + code-splitting.** `render-sunflower` loads
  renderers via a computed-path dynamic `import()` — the renderers (not the
  engine) are the `markdown-it`/`js-yaml` consumers. Bundling the engine alone
  would leave them loading from source and crashing on missing deps in prod. So
  all ~71 public renderers are their own entrypoints under `dist/renderers/`,
  and code-splitting inlines `markdown-it`/`ajv`/the shared `_*` helpers **once**
  into flat shared chunks (≈980 KiB total, not 71× duplicated).
- **Resolution (`lib/entrypoint.mjs`).** `resolveEntrypoint(pluginRoot, name)`
  returns `dist/<name>.mjs` when built, else `scripts/<name>.mjs` — used by the 4
  cross-spawn sites (`session-start-orient`, `render-on-artifact-write`,
  `hub-lifecycle`, `serve-lifecycle`). `loadRenderer` keys off the engine's own
  location (`RUNNING_FROM_DIST`): a dist engine loads dist renderers, a
  source-spawned engine (e2e/tests/dev) loads source renderers — no env flag, no
  stale-bundle footgun. `hooks/hooks.json` points directly at `dist/`.
- **Freshness (both gates).** CI (`.github/workflows/sdlc-build-freshness.yml`):
  `npm ci` → `npm run build` → `git diff --exit-code dist/`, then a **dep-free
  smoke** (`rm -rf node_modules`; run the engine, a renderer, and the
  session-start hook) proving the committed bundles need no deps. Build output is
  deterministic (verified byte-identical across runs; LF pinned via the existing
  `.gitattributes`, esbuild pinned via the lockfile). Opt-in pre-commit hook
  (`.githooks/pre-commit`, `npm run hooks:install`) rebuilds + stages `dist/`
  when build inputs change.
- **Deps.** `markdown-it`, `markdown-it-anchor`, `js-yaml`, `ajv`, `ajv-formats`
  moved `dependencies` → `devDependencies`; `esbuild` added; runtime
  `dependencies` is now **empty**. `package.json` version reconciled from the
  stale `9.40.0` to `9.45.0` (matching `plugin.json`).

### Fixed — Windows console flash on every detached spawn (9.45.0)

Every detached spawn (per-write render, SessionStart bootstrap, serve + hub daemons) flashed a
terminal window on Windows. **This supersedes the incomplete 9.44.1 attempt**, which added
`windowsHide: true` to the detached spawns — but `windowsHide` is silently *ignored* when
`detached: true` (nodejs/node#21825), so the flash persisted.

- **Root cause.** With `detached: true`, libuv sets `DETACHED_PROCESS`; the console-subsystem
  `node.exe` then implicitly allocates a *visible* console at startup, which `windowsHide`
  (`CREATE_NO_WINDOW`) cannot suppress in that combination. Survival, however, *requires*
  `detached` — a non-detached child is killed by the parent's process-group signal (verified).
  So the two requirements (no window, survives) appeared mutually exclusive.
- **Fix — `lib/launch-hidden.vbs` + a Windows branch in `lib/detach.mjs`.** On Windows the helper
  now launches through `wscript.exe`, a **GUI-subsystem** host that never allocates a console (so
  no flash regardless of `detached`), spawned with `detached: true` so the real process lands in a
  new process group and survives. The `.vbs` runs the command with hidden window style
  (`WshShell.Run cmd, 0, False`); `cwd`/`env` are inherited through. POSIX is unchanged. Fails open:
  if WSH is unavailable it reverts to the legacy detached spawn (flashes, but works).
- **Build-safe path.** The `.vbs` is resolved as `../lib/launch-hidden.vbs` so it survives esbuild
  bundling into `dist/` (depth-1): `lib/` (source) and `dist/` (bundled) both sit one level under
  the plugin root. Verified against the bundled chunk: wscript branch taken, child survives, full
  227-test suite green.

### Added — sunflower: sync-report renderer, mobile dual-DOM completion, verified visual tuning (9.44.0)

Closes the last gaps in the sunflower view's renderer coverage and mobile build.

- **`sync-report.mjs` — the one NEW standalone renderer still missing.** `hub-dashboard.mjs`
  and `profile.mjs` were already real; `sync-report` was a 5-line `renderSimple` stub. Built the
  full **schema → renderer → skill triple** the fragment-coverage plan had deferred:
  - **Schema** — new `siblingYamlSchemas["sync-report"]` in `tests/frontmatter.schema.json`
    (`branch` / `base_branch` / `ahead_count` / `behind_count` / `conflict_risk` /
    `rebase_status` / `stale_days` / `diverged_files[]` / `recommendation`).
  - **Renderer** — a verdict (`conflict_risk` → ship/caveats/no), a metric-row, a
    **diverging-bar figure** (commits ahead in `--accent` rising right, behind in `--med`
    rising left from a shared base node; `px_per_commit=25`, arm clamped at 360px, literal-hex
    SVG per the dashboard/plan convention so it stays deterministic), a `files-touched` drift
    table with `pos`/`neg` deltas + severity-blocker conflict chips, and a recommendation
    callout. **Dual-DOM mobile**: a 2×2 metric-tile grid + a directory-grouped file list with
    per-file conflict flags. Falls back to `renderSimple` when the sibling YAML is absent.
  - **Skill** — `wf-meta/reference/sync.md` Step 6b now mandates authoring `00-sync.yaml`
    (without it the page silently degrades to prose) and aligns the frontmatter with the
    `regenerable: true` additive-write contract (`synced-at`).
  - Added `.sw.ahead` / `.sw.behind` figure-legend swatches + a `.frow-flag` mobile helper;
    +2 golden snapshots.
- **Mobile dual-DOM completion (M-SLC-03 · M-S4).** `slice-index.mjs` and
  `implement-index.mjs` now wrap their illegible-at-phone-width Figure-5 (`sliceGridFigure`) in
  `.d-only`, so phones drop the grid and fall to the always-present, M-S5-styled card list —
  bringing dual-DOM coverage to 10 renderers. Added a **phone-S `@media ≤390px` tier**
  (tighter content padding, 22px headings, 19px appbar title, forced 2×2 metric-row, condensed
  tiles) for the 375–390px widths the 480px tier didn't cover (M-SYS-B01/B03/B04/T04).
- **Verified per-page visual tuning.** Each deviation cite was checked against live code (much
  of the backlog was already-closed or stale): **REV-07** verdict eyebrow `verdict` → `Verdict`
  (shared `_icons.verdictBlock`; review-dimension + design-audit goldens regenerated);
  **SYS-T03** body `line-height` 1.6 → 1.65 (matches `.prose`); **SYS-F05** `.figure-canvas svg`
  gains `max-width:100%` (no upscaling of narrow figures); **DSG-11** `.token-swatch` 14 → 20px;
  **PLN-19** plan-index "with blockers" metric only tints amber when > 0; **OVR-22** `.badge`
  11 → 12px. Skipped as stale/wrong (e.g. `OVR-17` wanted `.lede` where production correctly
  uses `.sdlc-lede`) or contract-risky (callout `aside`→`div`, verdict-md2html).

Full test suite 227/227, e2e acceptance 0 missing renderers / 0 schema warnings.

### Added — gap-closure: code-owner enforcement, branch-protection fidelity, security/env/merge/CI-ergonomics, derive-on-amend (9.43.0)

Follow-up to 9.42.0 closing four classes of gap (A–D) found in an audit of `init-ship-plan` /
`build-pipeline` / `amend`:

- **A — wired the cosmetic seams.** Branch-protection now sets `require_code_owner_reviews` whenever
  `governance.codeowners[]` is non-empty (Audit O flags it Non-compliant otherwise) — a generated
  `CODEOWNERS` was previously unenforced. `amend ship-plan` re-derives Block C `pre-merge-checks[]`
  and Block J `required-checks[]` when Block H or C changes (the single-source-of-truth they're
  derived from). `build-pipeline` now warns that generated hooks/CI are **inert until dev-deps +
  the framework install step are run**.
- **B — branch-protection fidelity.** The `gh api` payload gained `require_code_owner_reviews`,
  `required_conversation_resolution`, `required_linear_history`, `allow_force_pushes`/`allow_deletions`
  (locked by default), and switched to the current `checks` shape. New `mechanism: branch-protection
  | ruleset` (legacy default; ruleset payload documented), a **mechanism-mismatch guard**, and a
  **stronger-than-plan guard** (never silently weakens existing protection).
- **C — new contract surface.** **Block K — security & supply-chain gates** (SAST/CodeQL,
  dependency-audit, secret-scanning, SBOM, license policy; Audit P), aligned to
  [supply-chain.md](skills/review/reference/supply-chain.md). Extensions: per-environment GitHub
  **protection** (Block A → Audit Q), **merge controls** (Block J `merge` → Audit R), and
  **ci-ergonomics** — caching/matrix/release-concurrency/path-filters (Block C → Audit S). New
  discovery groups H/I read security tooling + repo topology (monorepo/workspaces). `build-pipeline`
  now mutates **three** gated remote settings (branch protection, environment protection, merge
  settings) instead of one — same Apply / Print-only / Skip gate each.
- **D — consistency.** Idempotency invariants on the inbound build steps (read-first/skip-if-equal;
  `gh api` PUT/PATCH are idempotent), a crisp "what this does NOT do" list on `build-pipeline`,
  broadened PR-title-linter detection (release-drafter / semantic-pull-request / commitlint), and
  the `init-ship-plan` boundary clarified (it authors; build-pipeline applies).

Plan blocks now run A–K; build-pipeline audits run A–S; the `amend` menu covers H–K.
[init-ship-plan.md](skills/wf-meta/reference/init-ship-plan.md),
[build-pipeline.md](skills/wf-meta/reference/build-pipeline.md),
[amend.md](skills/wf-meta/reference/amend.md), the 6 ship-plan templates,
[frontmatter.schema.json](tests/frontmatter.schema.json) (`security` + `repo-topology` documented),
and the doc site all updated.

### Added — full DX/CI/CD pipeline contract: inbound Blocks H–J + Audits K–O (9.42.0)

`init-ship-plan` and `build-pipeline` now cover the **entire** developer-experience +
CI + CD pipeline, not just the outbound release. The ship plan was CD-heavy and CI/DX-thin —
`pre-merge-checks[]` was an informational name list and `build-pipeline` was "GitHub
Actions only". Three new required-core blocks were appended to `.ai/ship-plan.md`
(existing A–G labels are unchanged, so `amend`/docs/handoff keep working):

- **Block H — code-quality gates** ([init-ship-plan.md](skills/wf-meta/reference/init-ship-plan.md)):
  format-check / lint / type-check / test-coverage (each `{tool,cmd}`), commit-message
  convention, and PR-title convention. Block H is now the canonical source of each
  pre-merge check's literal command; `ci-pipeline.pre-merge-checks[]` is derived from it.
- **Block I — local developer experience**: git-hook framework (husky/lefthook/pre-commit)
  with per-hook commands, `.editorconfig`, runtime-version files, task-runner targets,
  bootstrap command, CONTRIBUTING.
- **Block J — repo governance**: branch protection (with `apply-via: gh-api | manual`),
  CODEOWNERS, PR/issue templates, dependency automation (dependabot/renovate).

`build-pipeline` ([build-pipeline.md](skills/wf-meta/reference/build-pipeline.md)) grew
discovery Group F/G, **Audits K–O**, and implement Steps 8–12 to build all of it:
quality CI gates, commitlint + `action-semantic-pull-request` CI + config, local git
hooks, dev-experience files, and governance files. Its design contract changed from
"GitHub Actions only" to file-generation **plus one gated remote mutation** — branch
protection via `gh api -X PUT`, only when the plan opts in (`apply-via: gh-api`) and
only behind an explicit confirm gate with a "print commands only" escape hatch.

- [`amend.md`](skills/wf-meta/reference/amend.md): the ship-plan block menu + S2 mapping now
  cover H–J.
- [`SKILL.md`](skills/wf-meta/SKILL.md): broadened the `init-ship-plan` / `build-pipeline`
  dispatch one-liners.
- The 6 [ship-plan templates](skills/wf-meta/reference/ship-plan-templates/) each gained an
  `# Inbound DX seed values` block with ecosystem-appropriate defaults.
- [`frontmatter.schema.json`](tests/frontmatter.schema.json): documented `code-quality` /
  `local-dx` / `governance` as optional objects (the `ship-plan` branch stays open).
- Docs ([`_build_pages.py`](docs/site/_build_pages.py)): added the previously-missing
  `build-pipeline` row to the `/wf-meta` command table, a `#build-pipeline` section in
  `reference/wf-meta.html`, the discovery-led `init-ship-plan` refresh (10 blocks), and
  Blocks H–J in `reference/ship-plan-schema.html`.

### Added — handoff waits for CI + reviews; fixes run in subagents (9.41.0)

`/wf handoff` no longer declares PR readiness off a single `gh pr view` snapshot.
The old T5.3 "live readiness check" read check state once and set
`readiness-verdict: awaiting-input` whenever CI was still running — so handoffs
routinely stopped with CI still yellow and bot reviews not yet posted. Three
coordinated changes ([handoff.md](skills/wf/reference/handoff.md)):

- **New T5.0 — watch CI to green + settle reviews**, inserted *before* triage. A
  bounded poll loop (`## CI watch procedure`) drives the PR's checks to a terminal
  state; once green, a bounded settle window lets review-bots (coderabbit/greptile/
  etc.) post before triage runs. Configurable via new `ci-watch:` / `review-settle:`
  blocks in `00-index.md` (defaults: poll 30s, 30-min CI bound, 5-min bot settle).
- **T5.3 is now a final re-watch, not a snapshot.** Triage fixes and the rebase
  force-push both retrigger CI, so the verdict is recomputed against a freshly
  watched terminal state rather than a stale mid-run reading.
- **Fixes are delegated to subagents.** On CI red, a read-only diagnosis subagent
  proposes a fix (applies nothing); after user approval a fix subagent applies and
  commits it (`## Fix-subagent contract`). Review-thread fixes route the same way
  instead of running the implement-reviews coordinator inline — check logs, diffs,
  and patch churn stay out of the orchestrator context.

Policy: handoff **never blocks on human reviewers** — a missing required approval is
recorded as `awaiting-input`, not waited on. New frontmatter fields
(`ci-watch-conclusion`, `ci-watch-rounds`, `ci-watch-fix-rounds`,
`bot-reviews-landed`, `review-settle-elapsed-seconds`) with
[schema](tests/frontmatter.schema.json) coverage.

### Removed — dead PreCompact preserve hook (9.41.0)

Deleted `hooks/pre-compact-preserve.mjs` and its `PreCompact` entry in
[hooks.json](hooks/hooks.json). The hook wrote workflow-state "preserve this in the
summary" instructions to stdout, but Claude Code does **not** feed `PreCompact` stdout
to the compaction summarizer — only `UserPromptSubmit`, `UserPromptExpansion`, and
`SessionStart` have their stdout added to context. The hook was a silent no-op that
implied a guarantee (workflow state survives compaction) it never delivered.

Post-compaction reorientation is unchanged and was always carried by **SessionStart**
([session-start-orient.mjs](hooks/session-start-orient.mjs)): it re-fires with
`source: compact` and re-reads workflow state from the on-disk artifact files — the
durable, documented mechanism. Also removed the `pre-compact-preserve` unit test and
the README / doc-site references.

### Added — all-artifacts projection: 23 bespoke renderers + 2 discovery roots (9.40.0)

Every artifact the plugin writes now has a dedicated view-layer page. The only
intentional exceptions are `routing` (`90-next.md`, a regenerable duplicate of the
slug overview's next-command) and the schema-exempt `how-*` research notes. See
[ALL-ARTIFACTS-PROJECTION-PLAN.md](docs/internal/archived/ALL-ARTIFACTS-PROJECTION-PLAN.md).

Previously ~28 admitted/written types were either never discovered, dropped by
`resolveViewPath`, or rendered as a generic fallback card:

- **Discovery** ([render-sunflower.mjs](scripts/render-sunflower.mjs)): two new
  roots — `.ai/dep-updates/` (`__deps__`) and `.ai/ideation/` (`__ideation__`),
  with `--dep-updates`/`--ideation` flags; `discoverDocsArtifacts` now yields all
  `.md` under `.ai/docs/<run-id>/`, not just the index.
- **Path resolution** ([_paths.mjs](renderers/_paths.mjs)): new
  `PHASE_BY_BASENAME` entries (`01-discover`, `hf-*`, `rf-*`, `99-close`) and new
  `deps`/`ideation` kind branches. Hotfix/refactor steps group under
  `hotfix/` · `refactor/` view subtrees.
- **23 bespoke renderers**: 13 workflow lanes (`discover`, `fix-plan`,
  `investigate`, 4×`hf-*`, 5×`rf-*`, `close-record`), 4 `docs-*`, 5 `dep-*`, and
  `ideation` (a ranked idea table). A shared [_lane.mjs](renderers/_lane.mjs)
  factory backs the thin metric-card lanes; `ideation` renders bespoke.
- **Schema**: 6 new branches (`ideation` + 5 `dep-*`) in
  [frontmatter.schema.json](tests/frontmatter.schema.json) with foundation-test
  coverage. `how-*` stays deliberately schema-exempt.
- **Tests**: +24 renderer snapshots; the e2e acceptance corpus grows from 39 to
  62 render-eligible types, with `NOT_RENDERED` shrunk to just `routing`.
- **Docs**: [types.html](docs/site/reference/types.html) gains the quick-lane,
  dep-update, and off-pipeline-run sections.

### Added — quality gates: snapshot suite, e2e acceptance, mandatory fragments, doc pages (9.39.0)

Closes the verification-and-hygiene gaps from the post-release review (see
[QUALITY-GATES-PLAN.md](docs/internal/archived/QUALITY-GATES-PLAN.md)). Six independent improvements:

- **Golden-file snapshot suite** ([tests/unit/snapshots/](tests/unit/snapshots/)):
  a dependency-free harness (`snapshot-harness.mjs`) plus shared fixtures
  (`_fixtures.mjs`) snapshot 15 renderers × full/fallback/fragment variants
  (38 goldens under `tests/snapshots/`). A `fragment-determinism.test.mjs`
  property test asserts the 8 fragment-emitting renderers are byte-stable across
  repeated calls. New scripts: `test:snapshots`, `test:update` (cross-platform
  via `scripts/update-snapshots.mjs` — the plan's POSIX env-prefix doesn't work
  under npm on Windows). Substring-match tests couldn't catch a wrong badge
  colour or a dropped table column; snapshots can.
- **Fragment authoring is now required** wherever a sibling YAML is written —
  `profile`, `benchmark`, `experiment`, `instrument`, `simplify-run`, and
  `design-critique`/`design-audit` skill references all changed from conditional
  ("If you also write…" / "When also writing…") to a mandatory step, so the
  rich/fragment tier is finally exercised. No fragment-owning skill remains
  conditional. (The escape survives for the legitimate no-data case: no sibling
  YAML → no fragment.)
- **wf-docs intermediate types — schema test coverage**
  ([foundation.test.mjs](tests/unit/lib/foundation.test.mjs)): `docs-discover`,
  `docs-audit`, `docs-plan`, `docs-generate` already had `oneOf` branches and
  `pre-write-validate` listing; added the missing test rows (branch selectable,
  minimal fixture valid, missing `run-id` rejected).
- **End-to-end acceptance test** ([tests/e2e/acceptance.mjs](tests/e2e/acceptance.mjs)):
  a schema-driven generator plants one valid fixture per render-eligible type
  (admitted types minus an explicit fall-through exclusion set) and runs the real
  `render-sunflower.mjs --clean --diag`, gating on `[render] no renderer for:
  (none)`, `0 schema warnings`, no render exceptions, and per-type
  `data-artifact-type` coverage. New scripts: `test:e2e`, `render:diag`. A new
  admitted type that forgets its renderer fails the gate.
- **Doc-site reference pages**: [serve.html](docs/site/reference/serve.html)
  (machine-wide `~/.sdlc/hub-config.json` keys + security model — corrected from
  the plan's stale per-repo `view.serve` spec) and
  [types.html](docs/site/reference/types.html) (every admitted type → producer →
  storage → renderer → fragment-eligibility). Linked from the sidebar and pager
  chain (hooks → serve → types → glossary).
- **Cleanup**: [review-command.mjs](renderers/review-command.mjs) documented as a
  load-bearing alias (NOT dead code — `review-command` is still the emitted
  frontmatter type; removal gated on a future type rename). `verify_frontmatter.py`
  was already retired (v9.34.3). Open question #4 resolved — standalone
  `/wf-quick rca` writes to an ordinary `.ai/workflows/rca-<symptom>/` slug (no
  synthetic `__rca__`), discovered by the standard walk; documented in `rca.md`.
- **README**: new "Local development (view layer)" section documenting the npm
  scripts; corrected the stale claim that serve port/host/Tailscale live in
  per-repo `.ai/sdlc-config.json`.

### Changed — serve config is machine-only; per-repo `view.serve` removed (9.38.0)

Serve/daemon settings (`host`, `port`, `liveReload`, `tailscale`, and the
`perRepoServe` master switch) are now settable **only** in the machine-wide
`~/.sdlc/hub-config.json` — never in a repo's `.ai/sdlc-config.json`. This closes
the leak that the schema already implied (it called `view.hub.enabled` "the ONLY
per-repo hub field") and that caused this session's port-squat/dual-run bugs.

- **Schema** ([sdlc-config.schema.json](schemas/sdlc-config.schema.json)): the
  `view.serve` property is removed; `view` keeps `additionalProperties:false`, so
  a per-repo config containing `view.serve` is a **hard validation error**.
- **Per-repo defaults** ([config.mjs](lib/config.mjs)): the `view.serve` block is
  gone; a repo's only serve-related control is `view.hub.enabled` (participation).
- **Lifecycle** ([serve-lifecycle.mjs](lib/serve-lifecycle.mjs)): `ensureServeLifecycle`
  reads host/port/tailscale/liveReload from `hub-config.json`, not the per-repo
  config. The per-repo daemon is now purely the **standalone fallback** for a repo
  that opts out of the hub (`view.hub.enabled:false`); the `view.serve.enabled`
  force/dual-run knob (and its 4174 step-aside) is removed — when a hub is live it
  always serves the repo and no per-repo daemon runs.
- **Machine config** ([hub-config.mjs](lib/hub-config.mjs)): adds `liveReload`
  (default true) for the fallback daemon.

Migration: delete any `view.serve` block from `.ai/sdlc-config.json` and set the
equivalents in `~/.sdlc/hub-config.json`. +1 test (per-repo `view.serve` rejected);
existing config/foundation tests updated.

### Added — version-aware server reaping → deterministic new-install pickup (9.37.0)

Detached daemons survive plugin upgrades, so a new install used to keep serving
the OLD code until the daemon happened to die (the v9.30.2 zombie that started
this whole investigation). Now both servers stamp their plugin `version` (and the
hub its `entries[]` hub-marker) into `/__sdlc/health`, and the supervisors compare
it to their own `PLUGIN_VERSION`:

- [ensureHubLifecycle](lib/hub-lifecycle.mjs) probes the port identity-aware
  (`probeHubIdentity`) and resolves four cases in one check: **current + tracked**
  → adopt; **stale version** → reap + respawn (new-install pickup); **current but
  untracked** → reap + respawn (heals an orphaned `hub.pid`, the "hub won't
  restart" bug); **non-hub squatter** (no `entries[]`) → evict (the original
  wrong-page/403 bug). A `waitForGone` poll after the kill prevents an
  EADDRINUSE respawn race.
- [ensureServeLifecycle](lib/serve-lifecycle.mjs) reaps a per-repo daemon whose
  reported version differs (`probeServeIdentity`).

Verified live: a running hub with no version stamp was reaped and replaced
(`reaped stale hub v? → v9.36.0`), then adopted unchanged on the next pass
(`already running`), with the tailnet allowlist preserved across the swap.

### Fixed — slug overview surfaces per-slice plans + dead `.md` body links rewritten (9.37.0)

Two slug-navigation gaps. (1) The slug overview surfaced every *slice* inline
(`slicesPreview`) but had no equivalent for plans, so a per-slice plan was one hop
deeper than a slice; new `plansPreview` in [index.mjs](renderers/index.mjs) lists
them at parity, linking the rendered `plan/<slice>/INDEX.html` pages. (2) `md2html`
doesn't rewrite links and `resolveRefs` only covers `refs:` frontmatter, so prose
body links to sibling sources (`04-plan-behaviors.md`) pointed at `.md` files
absent from the view → 404. New `rewriteBodyLinks` in
[_link-graph.mjs](renderers/_link-graph.mjs), applied centrally in the orchestrator
([render-sunflower.mjs](scripts/render-sunflower.mjs)), rewrites internal `.md`
body links to their rendered pages via the slug pathMap; unknown/external links
pass through untouched (never introduces a broken link). +4 tests.

### Fixed — hub reachable over `tailscale serve` (durable tailnet Host allowlist) (9.36.0)

`tailscale serve` proxies tailnet requests to the hub preserving the MagicDNS
`Host` (e.g. `dragon.taild1fa8.ts.net`), which the hub's localhost-only
Host-header allowlist (DNS-rebinding defence) rejected with **403** — so the
tailnet URL was unreachable in a browser even though `127.0.0.1:4173` returned
200. The allowlist only relaxed via `--allow-all-hosts`, which
[ensureHubLifecycle](lib/hub-lifecycle.mjs) passed *only* for a `0.0.0.0` bind;
`serve` mode uses a `127.0.0.1` bind, so the flag never fired.

**Fix.** New [tailscaleDnsName()](lib/tailscale.mjs) discovers this node's
MagicDNS name (`tailscale status --json` → `Self.DNSName`); `ensureHubLifecycle`
calls it whenever `tailscale.enabled` and passes the name via a new
`--allowed-hosts` flag on [hub-serve.mjs](scripts/hub-serve.mjs). `hostAllowed`
admits those names **on top of** the localhost allowlist — a targeted addition,
**not** allow-all: any other foreign `Host` is still 403'd. Because discovery
runs at every (re)start, tailnet reachability survives supervisor restarts with
no hand-maintained config. Strictly safer than `--allow-all-hosts` (which admits
*any* Host). Covered by 2 new tests in
[tests/unit/lib/multi-repo-hub.test.mjs](tests/unit/lib/multi-repo-hub.test.mjs).

### Added — machine-wide `perRepoServe` kill switch so the hub can be the sole server (9.36.0)

A new `perRepoServe` field in `~/.sdlc/hub-config.json` (default `true`, prior
behaviour preserved). When set to `false`, [ensureServeLifecycle](lib/serve-lifecycle.mjs)
reaps any running per-repo daemon and refuses to spawn one — **overriding even a
repo's force `view.serve.enabled: true`**, because the switch is a machine-level
authority, not a per-repo preference. The hub already serves every registered
repo at `/r/<id>/`, so a per-repo daemon is pure redundancy whenever the hub
runs — and the only thing that can squat the hub's port 4173 and hide the
multi-repo inbox behind one repo's dashboard.

**Why.** A zombie pre-hub (v9.30.2) per-repo daemon was found holding 4173 while
the hub was down; because both server types answer `GET /__sdlc/health` with
`200`, the hub bootstrap couldn't tell them apart and the served root showed one
repo's dashboard instead of the inbox. `perRepoServe: false` removes the entire
class of failure for machines that run the hub as the single server. Default set
in [hub-config.mjs](lib/hub-config.mjs) `HUB_CONFIG_DEFAULTS`; enforced before the
hub guard so it fires even when no hub is currently alive. Covered by two new
tests in [tests/unit/lib/multi-repo-hub.test.mjs](tests/unit/lib/multi-repo-hub.test.mjs)
(default stays `true`; `false` declines to spawn despite `serve.enabled: true`).

### Added — registered wf-quick/wf-meta artifact types + prefix filenames; fixed announce/ship-plan/ship-runs-index/rca (9.35.0)

The follow-up promised in 9.34.5. A fine-tooth-comb audit found that whole
wf-quick and wf-meta lanes hit the same class of bug as `po-answers`: they write
artifacts under `.ai/workflows/<slug>/` with a `type:` that has no schema branch
and/or a filename that fails the `NN-` rule, so the pre/post-write hooks reject
them. Verified by running both hooks against each artifact.

**Schema — register the lane types.** New `quickMetaArtifactFrontmatter` branch
in [tests/frontmatter.schema.json](tests/frontmatter.schema.json) admits the 15
previously-unregistered lightweight types (`workflow-index`, `discover`,
`fix-plan`, `investigate`, `hf-brief|hf-plan|hf-implement|hf-verify`,
`rf-brief|rf-baseline|rf-plan|rf-implement|rf-verify`, `close-record`, `routing`)
on a known-type + schema/type/slug contract. Each `type` stays uniquely
discriminating, so the `oneOf` is unambiguous. (`workflow-index` already had a
renderer but no schema branch — the clearest sign these were intended.)

**Pre-write — allow the prefix filenames.** `validateFilename` in
[hooks/pre-write-validate.mjs](hooks/pre-write-validate.mjs) now allows the
`hf-`, `rf-`, and `skip-` prefixes (hotfix/refactor mini-pipelines + skip
records) alongside the existing `NN-` convention and named allowlist.

**Field-contract fixes:**
- `announce` template declared `type: announcement` (no such type) → fixed to
  `announce`; `announceFrontmatter.required` relaxed to schema/type/slug to match
  the real template (which emits `audiences`/`channels` lists + `created-at`, not
  the stale strict `title/status/scope/audience/channel/scheduled-at`).
- `shipPlanFrontmatter.required` realigned from the stray `title`/`status`/
  `source` (copied from project-context) to the `project-name`/`plan-version` the
  init-ship-plan template actually emits.
- `ship.md` `ship-runs-index` template was missing schema-required `updated-at`.
- `/wf-quick rca`'s synthesized `02-shape.md` was missing 8 shape-required fields.

Correctly-exempt, no change: `ideate`→`.ai/ideation/`,
`update-deps`→`.ai/dep-updates/`, `build-pipeline`→`.ai/pipeline-compliance.md`,
wf-design→`design-notes/`, wf-docs→`.ai/docs/`. Two regression tests added; two
gap-closure fixtures updated to the corrected ship-plan/announce contracts.
Suite 141/141.

### Removed — last 3 legacy shell hooks + refreshed hooks docs (9.34.5)

Completes the shell-hook retirement begun in 9.34.3. The final three unwired
parity twins under `hooks/scripts/` — `auto-stage.sh`, `pre-compact.sh`,
`workflow-discovery.sh` — are deleted (superseded by `post-write-auto-stage.mjs`,
`pre-compact-preserve.mjs`, `session-start-orient.mjs`). `hooks/scripts/` is now
empty and removed entirely; the stale "Parity table vs …sh" headers in the three
`.mjs` hooks are scrubbed.

The docs-site hooks reference
([docs/site/reference/hooks.html](docs/site/reference/hooks.html), source
[docs/site/_build_pages.py](docs/site/_build_pages.py)) is rewritten — it
described *four shell hooks* but the plugin ships *six Node hooks*. It now
documents `pre-write-validate`, `post-write-verify`, `post-write-auto-stage`,
`post-write-render`, `pre-compact-preserve`, and `session-start-orient` with
their real triggers and the `po-answers.md` / `design-notes/` carve-outs.

**Audit note (not fixed here):** a fine-tooth-comb pass over skill templates
surfaced a broader, pre-existing class of the same bug — several wf-quick
(`discover`, `fix`, `investigate`, `hotfix`, `refactor`) and wf-meta (`announce`,
`close`, `next`, `skip`) artifacts write under `.ai/workflows/<slug>/` with a
`type:` that has no schema branch and/or a filename that fails the `NN-` rule, so
they would be blocked by the pre/post-write hooks. The `ship-plan.md` template is
also missing schema-required `title`/`status`/`source`. Tracked for a dedicated
follow-up release (needs a register-types-vs-reroute-paths decision).

### Fixed — sunflower view P2 parity polish (9.34.4)

Closes the four P2 design-parity divergences from `SUNFLOWER-PARITY-FIX-PLAN.md`
against the `sdlc-handoff` reference (the P1 bugs and Slices 1–8 landed in
9.32.0). Verified by re-rendering real workflow artifacts.

- **Slug-overview stage stripe**: station dates now sit ~28px off the rail with
  the "you are here" marker stacked above (previously inverted), and the
  per-station caption is semantic — `plan`→"N revisions", `implement`→
  "done/total slices", `verify`→"N ✓" — each falling back to a plain artifact
  count when the signal isn't present.
- **Legend swatches** (`.figure-legend .sw.*`): aligned to the handoff palette
  (done=ink, blocked/deleted=desaturated tint, external/queued=dashed,
  review/modified=accent-soft) and added the missing `.sw.complete` rule the
  slice legend relied on (it had been rendering as a generic grey box).
- **`.frontmatter-card`**: now a responsive `repeat(auto-fit, minmax(180px,
  1fr))` grid; each entry is wrapped in a `<div>` in both emitters (the plan
  metadata card and the shared simple-renderer frontmatter dump) so label/value
  pairs stay together.

### Removed — retired the legacy shell hooks + Python frontmatter validator (9.34.3)

Completed the validator migration that the v9.26 CHANGELOG and
`QUALITY-GATES-PLAN.md` (Phase 6) scheduled for v9.28 but never landed. The hook
runtime has been native Node/Ajv since the HOOKS-NODE migration; the shell and
Python validators were dead-but-carried parity references, and keeping them in
sync was pure overhead (it's why the 9.34.1/9.34.2 carve-out had to be applied
in five places instead of two).

Deleted:
- `hooks/scripts/validate-workflow-write.sh` — superseded by
  [hooks/pre-write-validate.mjs](hooks/pre-write-validate.mjs). Not wired in
  [hooks.json](hooks/hooks.json).
- `hooks/scripts/verify-workflow-postwrite.sh` — superseded by
  [hooks/post-write-verify.mjs](hooks/post-write-verify.mjs). Not wired.
- `tests/verify_frontmatter.py` — the Python deep validator, replaced by
  `lib/schema-validator.mjs` (Ajv). Its parity test in
  `tests/unit/lib/foundation.test.mjs` (and the now-unused `findPython` helper +
  `spawnSync` import) is removed with it.

The stale "Parity table vs …sh" headers in both `.mjs` hooks and the README's
"remains as a parity reference" note are scrubbed. The artifact-validation
surface is now two enforcement points (the wired pre/post-write `.mjs` hooks),
both sharing `isProseLogPath`. `hooks/scripts/` still holds three other unwired
legacy twins (`auto-stage.sh`, `pre-compact.sh`, `workflow-discovery.sh`) — left
untouched here, candidates for a follow-up sweep.

### Fixed — `po-answers.md` post-write schema check + centralised exemption (9.34.2)

9.34.1 relaxed the *pre*-write hook so `po-answers.md` could be created — but the
PostToolUse verifier
([hooks/post-write-verify.mjs](hooks/post-write-verify.mjs)) still
schema-validated the written file against sdlc/v1 and rejected it (there is no
`po-answers` type). Net effect: the write went through, then a second hook
failed it. The prose-log exemption had only reached one of the two write hooks.

The "is this the product-owner prose log?" test is now a single shared
predicate — `isProseLogPath` in [lib/hook-utils.mjs](lib/hook-utils.mjs) —
consumed by **both** the pre-write validator and the post-write verifier, so the
carve-out can no longer drift between them (that drift was the 9.34.1 bug). The
exemption is mirrored in both shell parity twins
([validate-workflow-write.sh](hooks/scripts/validate-workflow-write.sh),
[verify-workflow-postwrite.sh](hooks/scripts/verify-workflow-postwrite.sh)) and
in [tests/verify_frontmatter.py](tests/verify_frontmatter.py) — which previously
also rejected a frontmatter-less `po-answers.md` on its "no YAML frontmatter"
check. A regression test asserts the post-write verifier skips `po-answers.md`
even when stray frontmatter is present.

### Fixed — `po-answers.md` write-validation regression (9.34.1)

The `PreToolUse` write-validate hook
([hooks/pre-write-validate.mjs](hooks/pre-write-validate.mjs)) blocked every
attempt to create `po-answers.md` — the cumulative product-owner Q/A log that
the intake, shape, plan, and ship stage references instruct you to create and
append to. Two gates rejected it: the `NN-stagename.md` filename convention
(no two-digit prefix) and the mandatory-frontmatter check. But `po-answers.md`
is a deliberately frontmatter-less *prose* log with no schema `type`, and
[tests/verify_frontmatter.py](tests/verify_frontmatter.py) already skips it for
exactly that reason — so the hook was stricter than the rest of the system and
contradicted its own stage references.

The hook now exempts `po-answers.md` from **both** gates (a `isProseLog`
carve-out), mirroring the existing `design-notes/` exemption and the Python
validator. No rename, no schema change: the canonical name stays
`po-answers.md`, and every stage reference remains correct as written. The
documented parity twin
([hooks/scripts/validate-workflow-write.sh](hooks/scripts/validate-workflow-write.sh))
gets the same carve-out, and a regression test asserts a frontmatter-less
`po-answers.md` write is allowed.

### Changed — Serve + hub now on by default (9.34.0)

The SDLC view is now **serve-first and hub-first out of the box**. Two shipped
defaults flipped in `lib/config.mjs` `DEFAULT_SDLC_CONFIG` (mirrored in
`schemas/sdlc-config.schema.json`):

- `view.serve.enabled`: `false → true` — a repo that renders now starts its
  local serve daemon without needing a `.ai/sdlc-config.json`.
- `view.hub.enabled`: `false → true` — every rendering repo now registers with
  and participates in the machine-wide multi-repo hub by default.

This **reverses the 9.33.0 contract** that hub participation was strictly opt-in
(`view.hub.enabled: false`). After upgrading, the first render in any repo will
bring up the per-repo serve daemon and join the single machine-wide hub on
`127.0.0.1:4173`. Exposure is unchanged: Tailscale stays off by default
(`view.serve.tailscale.enabled` and the hub's `tailscale.enabled` both remain
`false`), so nothing leaves localhost without an explicit opt-in.

To restore the previous quiet behaviour, set either flag back to `false` in a
repo's `.ai/sdlc-config.json` (`view.serve.enabled` / `view.hub.enabled`).

### Added — Multi-repo registry + one-service hub + aggregate landing page (9.33.0)

Implemented `MULTI-REPO-REGISTRY-PLAN.md` end to end (Phases 0–6). One browser
URL (`127.0.0.1:4173`) now shows every active SDLC workflow across all repos on
the machine — live reload, correct cross-repo isolation, zero port
proliferation. Strictly additive and opt-in: default behaviour is unchanged
(`view.hub.enabled: false`). Suite 134/134 (21 new multi-repo tests).

- **Phase 0 — shared primitives.** Extracted the symlink-escape containment
  kernel to [lib/resolve-request-path.mjs](lib/resolve-request-path.mjs)
  (the `/sdlc` strip is now an opt-in `stripPrefix` so a slug literally named
  `sdlc` is served correctly under the hub; the per-repo daemon keeps the strip
  via a thin wrapper) and `maybeConfigureTailscale` to
  [lib/tailscale.mjs](lib/tailscale.mjs). Byte-identical per-repo behaviour.
- **Phase 1 — registry.** [lib/registry.mjs](lib/registry.mjs): git
  repo+branch+worktree identity, branch-sensitive 12-char ids, `validateEntry`
  (viewDir must realpath under its own repoRoot and end in `.ai/_view` — a
  poisoned `viewDir:"C:\\"` is rejected on read AND write), lock-free per-entry
  shard writes (concurrent renders never lose an entry), writer-as-janitor
  (folds shards past a 100-shard cap), lazy pruning. A render registers itself
  right after the `.last-render` flush — best-effort, never affects render
  success. Per-repo schema gains `view.hub.enabled` (the only per-repo hub
  field; `additionalProperties:false`).
- **Phase 2 — hub daemon.** [scripts/hub-serve.mjs](scripts/hub-serve.mjs)
  routes `/r/<id>/...` to each repo's `.ai/_view` with per-`viewDir`
  containment. Security hardening over the read-only per-repo daemon: a
  Host-header allowlist on every request (defeats DNS-rebinding) and a
  `hub.pid` write token on every state-changing route (invariants #5/#6).
  [lib/hub-config.mjs](lib/hub-config.mjs) holds the machine-wide
  `~/.sdlc/hub-config.json` (Option C split-scope — singleton settings only,
  never committable); [lib/hub-lifecycle.mjs](lib/hub-lifecycle.mjs) mirrors
  serve-lifecycle with PID-gated stale-PID recovery and mints the token.
- **Phase 3 — cross-repo live reload.** One SSE stream; each viewDir is
  directory-watched (filtered on `.last-render`, Windows-safe). The hub injects
  `<meta name=sdlc-repo-id>` and the livereload client at serve time, so
  [assets/livereload.js](assets/livereload.js) reloads only the tab whose repo
  re-rendered (unconditional fallback for the per-repo daemon — backward
  compatible).
- **Phase 4 — landing page.** [renderers/hub-dashboard.mjs](renderers/hub-dashboard.mjs)
  `renderHubLanding()` at `GET /` (2-second micro-cache, inline CSS, swimlanes
  reusing the now-exported `swimlanesSvg`, repo grouping, slug deep-links, stale
  dimming, aggregate live reload).
- **Cross-repo inbox (§11.3).** The landing page's **default tab** is a single
  attention work-queue across all repos — everything blocked, in review, or
  stale — with the swimlane grid as the secondary tab. CSS-only radio tabs (no
  inline JS, CSP-safe); `inboxItems()` classifier; pure view-layer on existing
  `slugMeta` + `lastRenderedAt`. Remaining §11 follow-ons (editor links,
  tab-title status, richer git state, `sdlc hub` CLI, wide-event logging) are
  catalogued in `VIEW-FEATURE-IDEAS.md`.
- **Phase 5 — serve-time hub-root brand.** The hub repoints the topnav brand to
  the hub root in INDEX.html responses; breadcrumbs stay per-repo. No render
  flags (honours convention-over-flags) — the per-repo daemon path is untouched.
- **Phase 6 — hardening.** Single hub Tailscale binding gated on the
  machine-wide `tailscale.{enabled,acknowledgedPublic}` (a per-repo config can
  never trigger public exposure); SSE-safe request/header timeouts; Windows
  `process.on('exit')` pid cleanup; aggregate SSE cap.

### Fixed — severity-token misuse on non-severity UI (9.32.1)

- `experiment.mjs` arm-allocation palette (`--blocker` → neutral `#c07820`),
  `plan.mjs` data-flow lane "service" label (`--med` → `--ink-3`), and
  `.cand-conf.is-low` (`--blocker` → `--high`) no longer borrow a severity
  colour for elements that carry no severity meaning. Cross-service edge strokes
  and the `.plan-lanes-legend .crosses` legend (which intentionally mirror the
  figure) are left intact. Suite 113/113.

### Changed — Sunflower view design-parity (9.32.0)

Implemented `SUNFLOWER-PARITY-FIX-PLAN.md` Slices 1–8 (deterministic CSS +
renderer parity). Full suite 113/113 green. Bumped to 9.32.0 to cache-bust the
rewritten `assets/sdlc.css`.

- **Tokens** (`assets/sdlc.css`): `--rad-sm` 3px; `.metric-label`/`.metric-value`
  type; `.sdlc-h1` line-height; `.sdlc-h2`/`.sec` 12px/40px; `.sdlc-crumb`
  12.5px; `.sdlc-lede` 60ch; desaturated verdict border tints; slide-in
  content-link border; global inline-`code` chip; semantic
  `.sw.{done|current|queued|new|modified|…}` legend swatches; `.v-text` 30px
  serif; `.fact.{accept|defer|reject}`; compound `callout risk-*`;
  `table.files-touched`; glyph-based `.ac-list .chk`.
- **Shell** (`renderers/_shell.mjs`): `div.b-topbar` three-column grid,
  `.ai/workflows` brand, editorial `div.crumb`, `⌘K`/viewing-as actions slot,
  `h1.pg-title` 36px, `data-artifact-type` on `<html>`, non-sticky topbar.
- **Figure 1 dashboard** (`renderers/dashboard.mjs`): swimlane column rules,
  solid ink progress overlay, SHIPPED separator, dashed queued circles,
  blocker/rev annotations; `<article>` ledger rows with health glyph +
  human-relative time + `stage-pill cur|done`; "Recently shipped" bucket.
- **Figure 2 slug overview** (`renderers/index.mjs`, `workflow-index.mjs`):
  stage-stripe viewBox 920×230 + ink-strong overlay + per-station dates +
  semantic annotations + current r=22 ring + bottom metric-callout band;
  `so-hd` identity block; `nav.so-rail` jump rail; when/what activity feed;
  routing-stripe Figure 2 for quick/investigative slugs.
- **Figure 5 slice grid** (`renderers/slice-index.mjs`): `depends-on`
  dependency-graph SVG with arrowheads; `sc-hd`/`sc-meta`/`sc-bar`/`sc-foot`
  cards mapped to `complete|in-progress|blocked|not-started`.
- **Figure 3 plan** (`renderers/plan.mjs`): frontmatter-card, glyph
  acceptance-criteria, files-touched `<table>` with role pills + signed deltas +
  intent disclosures, `callout risk-*`, prior-revisions; topology LOC sublabels,
  line-through deleted nodes, edge relationship labels, placeholder figure when
  no sibling YAML.
- **Figure 4 review** (`renderers/review.mjs`, `_icons.mjs`): heatmap widened to
  920 with a Σ totals column + totals row and curated stepped tints;
  `verdictBlock` emits the 30px serif `.v-text` display line.
- Documented per-artifact sibling-YAML field shapes in
  `tests/frontmatter.schema.json`.

### Added — gap closure Phase 1 design schema admission

- Added strict frontmatter branches for `design-contract`, `design-critique`,
  and `design-audit`.
- Added sibling YAML schemas for `design-critique` and `design-audit`
  fragments.
- Added `scripts/migrate-design-types.mjs` with `--dry-run` support for
  legacy `craft`, `design-brief`, `critique`, and `audit` artifacts.
- Added focused unit coverage for schema admission, fragment whitelist
  behavior, sibling YAML validation, and migration idempotence.
- Added dedicated renderer coverage for gap closure Phase 2:
  `benchmark`, `experiment`, `instrument`, `rca`, and `review-dimension`.
- Added renderer coverage for the Phase 1 design artifact types:
  `design-contract`, `design-critique`, and `design-audit`.
- Added Hooks Phase 2 bootstrap rendering: `render-sunflower.mjs --bootstrap`
  scans active workflows, compares artifact/view mtimes, honors
  `.ai/_view/.render-suppress`, serializes with `.bootstrap.pid`, logs to
  `.bootstrap.log`, supports `--dry-run` and `--concurrency`, and is launched
  asynchronously by `session-start-orient.mjs`.
- Added Gap Closure Phase 3+ walker support for `PRODUCT.md`, `DESIGN.md`,
  `.ai/ship-plan.md`, workflow extras (`announce.md`, `risk-register.md`,
  `estimate.md`), workflow docs indexes (`08b-docs-index.md`), and
  project/path docs indexes under `.ai/docs/<run-id>/08b-docs-index.md`.
- Added renderers and schema admission for `project-context`, `ship-plan`,
  `announce`, `risk-register`, `estimate`, and `docs-index`.
- Added a config-gated renderer-hosted static server:
  `scripts/render-sunflower-serve.mjs`, health endpoint
  `/__sdlc/health`, SSE endpoint `/__sdlc/events`, path-traversal protection,
  live reload injection, `.serve.pid` lifecycle, and optional Tailscale
  serve/funnel setup behind explicit config.
- Added shared fragment authoring guidance at
  `skills/wf/reference/_fragment-authoring.md`.

### Changed

- `/wf-design craft`, `/wf-design critique`, and `/wf-design audit`
  references now emit the new strict artifact metadata.
- Fragment verification now resolves `$defs` for sibling schemas and
  normalizes YAML timestamp scalars before Ajv validation.
- `augmentation.mjs` now delegates to the concrete augmentation renderers,
  and `review-command.mjs` delegates to `review-dimension.mjs` as a
  compatibility alias.
- `post-write-render.mjs` now treats project context files as render inputs,
  and the pre/post write hooks understand project context markdown without
  forcing frontmatter on plain `PRODUCT.md`, `DESIGN.md`, or `.ai/ship-plan.md`.
- `/wf-docs` now emits a docs-index artifact for orchestrator runs, with
  sibling YAML for workflow-scoped and project/path docs tables.
- `announce`, `risk-register`, and `estimate` frontmatter now validates the
  concrete required fields from the gap-closure plan instead of accepting only
  generic title/status metadata.
- Renderer-hosted serve now exposes the planned `status: "ok"` health shape
  and `reload` SSE event, while keeping `ok: true` for existing lifecycle
  probes.
- Bootstrap render jobs now suppress child writes to shared dashboard,
  manifest, and `.last-render` files, then run one final shared-output pass to
  avoid concurrent last-writer-wins races.
- Fragment-writing references now point at the shared authoring contract for
  profile, simplify, benchmark, experiment, instrument, craft, critique, and
  audit flows.

## [9.31.1] - 2026-05-29

### Fixed — quick / investigative workflows unreachable on the dashboard

- **Dashboard dropped `workflow-index` slugs.** The cross-slug dashboard summary
  only collected `type: index` workflows, so quick / investigative workflows
  (`/wf-quick rca|fix|probe|investigate`, `type: workflow-index`) were rendered
  to `.ai/_view/<slug>/` but had no inbound link — rendered yet unreachable. The
  summary now also collects `workflow-index` (with a `00-index.md` fallback so a
  future index variant can never be silently dropped).
- **Non-canonical statuses vanished.** Dashboard bucketing tested
  `status === 'active'`, so a `ready`/`blocked`/`in-progress` workflow fell
  through every section. Bucketing is now exhaustive — anything not terminal
  (complete/closed) is treated as active.
- **Quick-workflow lead artifacts were never rendered.** `resolveViewPath`
  returned `null` for `01-rca.md`, `01-fix.md`, `01-probe.md`, and
  `01-investigate.md`, so the orchestrator skipped them entirely (counted in
  "skipped"). Added `PHASE_BY_BASENAME` entries mapping each to
  `rca|fix|probe|investigate/INDEX.html`.

### Added

- `renderers/workflow-index.mjs` — a dedicated overview page for quick /
  investigative workflows surfacing workflow-type, recommended next route(s),
  the progress map, open questions, tags, and links to every sibling artifact
  (instead of forcing them through the empty 10-stage `index.mjs` grid).
- Dashboard "Quick & investigative" section listing `workflow-index` workflows
  with their workflow-type and routing stage; the 10-stage swimlanes now show
  only pipeline (`type: index`) workflows so quick ones no longer render as
  misleading all-empty lanes.
- Five new unit tests covering dashboard reachability, exhaustive bucketing,
  swimlane exclusion, quick-artifact path resolution, and the new renderer.

## [9.31.0] - 2026-05-29

### Fixed — render-pipeline audit (10-dimension sweep, 41 fixes)

- **Blocker:** `render-on-artifact-write.mjs` referenced an undefined `__filename`
  in ESM, throwing on every PostToolUse write — the incremental render never
  fired. Added the `fileURLToPath` definition and `.catch()` guards on both
  entry points.
- **Blocker:** the debounced render spawned `scripts/render-sunflower.mjs` by a
  bare relative path resolved against the project root (`MODULE_NOT_FOUND`); now
  resolved against `PLUGIN_ROOT`.
- Atomic view writes (temp file + rename) for every output, so a crash or ENOSPC
  can no longer leave torn HTML that the mtime check then treats as fresh.
- Bootstrap now keys `--only` globs and view-mtime checks on the directory slug
  rather than the frontmatter slug (workflows whose slug differed never rendered
  and re-scheduled forever).
- Path-collision guard: two source artifacts resolving to the same view path now
  warn and keep the first, instead of silently overwriting.
- Created `renderers/ship.mjs` so `type: ship` artifacts render through the
  ship-legacy renderer instead of falling through to the generic fallback.
- Registered `00-sync`, `07-design-critique`, and `07-design-audit` routes in
  `resolveViewPath` (their renderers existed but were unreachable).
- Serve hardening: realpath symlink-containment check (path traversal), SSE
  client cap, `0.0.0.0` binding now gated on `acknowledgedPublic`, and a
  `script-src 'self'` CSP (live-reload script externalized to
  `_assets/livereload.js`).
- Escaping: `verdict` class attribute, project-context / ship-plan `lede`,
  `assetBase`, and single-quote (`'`) encoding across all `escapeHtml` copies.
- Robustness: per-artifact write try/catch (EBUSY on Windows no longer aborts
  the run), orphan-page cleanup in additive mode, bootstrap non-zero exit on
  failed jobs, `--asset-base` forwarded to render subprocesses, config warnings
  surfaced on every run, exact byte-compare asset freshness, `>=` mtime
  comparison for coarse filesystems, BOM-tolerant frontmatter parsing,
  whitespace-only status guard, config/schema validators cached by path, and
  log rotation for `.hook-errors.log` / `.bootstrap.log`.

### Changed

- Synced internal `PLUGIN_VERSION`, the view manifest version, `package.json`,
  and `package-lock.json` to 9.31.0 (they had drifted to 9.27.0 / 9.28.0).

## [9.26.0] - 2026-05-24

### Changed — hooks migrated from bash/Python/yq/jq to Node

The live Claude hook manifest now points at Node entrypoints under `hooks/`:

- `session-start-orient.mjs` for active workflow orientation.
- `pre-write-validate.mjs` for shallow Write validation.
- `post-write-auto-stage.mjs` for implementation-stage `git add`.
- `post-write-verify.mjs` for deep Ajv schema validation.
- `post-write-render.mjs` for debounced sunflower rendering.
- `pre-compact-preserve.mjs` for compaction preservation instructions.

The old shell scripts remain under `hooks/scripts/` for one release as
migration references, but they are no longer invoked by `hooks/hooks.json`.
`hooks/render-sunflower.json` was removed so rendering is managed by the
single unified hook manifest.

Runtime requirements changed: hooks no longer require Git Bash, `bash`, `yq`,
`jq`, or Python. Node 20+ is required, and `git` is only needed for the
auto-stage hook. Deep frontmatter verification now uses the plugin's Node/Ajv
schema validator against `tests/frontmatter.schema.json`.

## [9.25.0] - 2026-05-22

### Added — `/wf intake` opportunistically bootstraps `.ai/workflows/INDEX.md`

Closes a chicken-and-egg gap in the registry collision check. Previously, on a
fresh repo where `.ai/workflows/INDEX.md` did not yet exist, `/wf intake` would
skip the registry collision check entirely and emit a chat-return tip asking
the user to run `/wf-meta sync` once to bootstrap the registry. Until the user
acted on that tip, the *second* `/wf intake` in the repo would also skip the
collision check — meaning two intakes could race to the same slug before sync
ever ran.

Intake now does the bootstrap itself, as a new **Step 10** at the end of the
intake flow (after `00-index.md` is finalized so branch/status/workflow-type
reflect the final PO answers):

- If `.ai/workflows/INDEX.md` does not exist → create it with the canonical
  header comment + exactly one row for this workflow.
- If `.ai/workflows/INDEX.md` exists but does not contain this slug → append
  the row and re-sort alphabetically.
- If the slug is already present → leave the existing row alone (sync owns
  full refresh).

**Single-writer invariant preserved.** Sync remains authoritative for full
refresh (removing stale rows, fixing status/branch drift across all
workflows). Intake's new contract is strictly *append self if absent* —
the same additive shape as the `/wf-quick` slug-mode `updated-at` touch
already documented in the INDEX.md header comment. The header comment is
updated to credit `/wf intake` as a third additive writer.

**Net effect.** The second `/wf intake` in a new repo now gets full registry
collision detection without any explicit sync step. The "Tip: run
`/wf-meta sync` once to bootstrap" hint in intake is gone — the other hints
in `wf-quick`, `wf-meta status`, `wf-meta next`, and `wf-meta resume` still
fire on truly cold repos (those commands can run before any intake exists)
but will be naturally satisfied as soon as the first intake completes.

Files touched:
- `skills/wf/reference/intake.md` (Step 0 sub-step 2 rewritten; new Step 10).
- `skills/wf-meta/reference/sync.md` (header comment template updated).
- `.claude-plugin/plugin.json` (version → 9.25.0).

## [9.24.0] - 2026-05-22

### Added — markdown always rendered + plugin-bundled gallery

Two behaviour changes that resolve "what skills can see at install time" and
"how the markdown body relates to the rich fragment".

1. **Markdown body is now always emitted in the view page**, even when a
   `.html.fragment` sibling is present. The fragment becomes the "rich
   projection on top" (interactive verdict / metric row / SVG topology /
   finding list with filters and copy-as-PR-comment buttons); the markdown
   becomes the "narrative below" (the long-form prose the writer authored
   in the `.md` source). Both are visible on every page that has either.
   This makes the writer ladder fully additive: a writer who only ships
   `.md` sees prose; one who adds `.yaml` sees structured chrome + prose;
   one who adds `.html.fragment` sees fragment + prose. Each step adds a
   layer; none removes one.

   Affected renderers (9 files): `_simple.mjs`, `design.mjs`, `ship-run.mjs`,
   `simplify-run.mjs`, `profile.mjs`, `review.mjs`, `review-command.mjs`,
   `plan.mjs`, `augmentation.mjs` (4 subtypes).

2. **`reference/fragments-gallery.html` is now bundled inside the plugin**.
   Previously the authoritative gallery lived at the `agent-skills/sdlc-handoff/`
   path, which is invisible to plugins after install. The 173 KB gallery
   file is now duplicated into `plugins/sdlc-workflow/reference/` so
   installed agents reading `reference/fragment-author-contract.md` can
   resolve the gallery link. All six skill writer references that pointed
   at the old upstream path now point at the bundled copy.

### Changed — markdown-it configuration enhancements

`renderers/_markdown.mjs` keeps the same dependencies (markdown-it +
markdown-it-anchor) but emits classed HTML so the calm-reader CSS and any
future client-side syntax highlighter can hook in without re-parsing:

- Fenced code blocks → `<pre><code class="hljs language-X">` (highlight.js
  class convention, ready for a drop-in JS bundle later)
- Tables → `<table class="prose-table">`
- Blockquotes → `<blockquote class="prose-quote">`

The library research (markdown-it vs unified/remark/rehype vs marked, and
highlight.js vs prism vs shiki for syntax highlighting) is summarised at
the top of `_markdown.mjs` so future maintainers don't repeat the survey.

### Compatibility

- All 71 unit tests pass unchanged (`node --test tests/sunflower.test.mjs`).
- The new markdown classes (`hljs`, `language-X`, `prose-table`, `prose-quote`)
  are additive — existing CSS selectors continue to match the same elements.
- Fragments authored against v9.20.0+ continue to verify; the contract is
  unchanged. Only the rendered envelope around them differs.
- Re-rendering test fixtures shows every artifact with a `.md` body now
  carrying a visible prose section in the page, regardless of whether a
  fragment is present.

## [9.23.1] - 2026-05-22

### Fixed — handoff-fidelity audit pass (three CSS / renderer drifts)

A side-by-side read of `sdlc-handoff/sdlc/project/sdlc-fragments-gallery.html`
(the design source-of-truth shipped to coding agents by Claude Design) against
production `assets/sdlc.css` + the `renderers/` output surfaced three
divergences from the calm-reader spec. All three are now closed.

1. **Severity-chip glyph drift** — handoff styles chips with
   `.severity-X::before` injecting the deuteranope-safe glyph (`● ▲ ◆ — ·`);
   production CSS dropped the pseudo-element rule, relying entirely on the
   renderer-emitted inner `<span class="sev-glyph">`. A hand-authored
   fragment following the handoff convention (no inner span) rendered
   without a glyph. Now `assets/sdlc.css` carries a `::before` fallback
   guarded by `:not(:has(.sev-glyph))` so renderer chips don't double up
   while hand-authored chips still get the glyph.
2. **Lede color drift** — `.sdlc-lede { color: var(--ink-2) }` was darker
   than the handoff intent (`--ink-3`). Restoring `--ink-3` widens the
   contrast between title and lede and matches the gallery exactly.
3. **Verdict block shape drift** — handoff renders the verdict as a single
   inline serif phrase with a `::before` glyph; production wrapped the
   glyph in a 48 px circle and offset the label to a second column. The
   renderer (`_icons.mjs` `verdictBlock`), the `verdict.html.snippet`
   template, and the CSS now follow the handoff: no glyph circle, glyph
   inline via `.v-label::before`, per-kind tint via the `.verdict-*` class.
   `VERDICT_GLYPH` remains exported for external consumers.

### Known follow-ups (deferred — not fixable by editing the renderer)

- The rendered fixtures under `.scratch/test-ai/_view/` are pinned at
  `data-sdlc-version="9.22.0"` and `?v=9.22.0` asset URLs because they
  predate the v9.23.0 writer rollout. To see the rich sibling-YAML output
  the audit promises, re-run the orchestrator over a fresh fixture set.
- The per-dimension review fragment in `sdlc-fragments-gallery.html`
  envisions filter chips, sort dropdown, expandable evidence with diffs,
  and copy-as-PR-comment buttons. The current `review-command.mjs`
  rich-render emits only the verdict + metric tally + a finding list.
  Closing this would require a `review` writer that authors a real
  `.html.fragment` conforming to the `fragment-review` contract — out of
  scope for a CSS/renderer pass.

### Compatibility

- No schema or fragment-allow-list changes. No writer signature changes.
- All 71 unit tests pass unchanged (`node --test tests/sunflower.test.mjs`).
- Existing `.html.fragment` artifacts that follow the renderer markup
  pattern (with `.v-glyph` div and inner `.sev-glyph` span) continue to
  render correctly — the `:has()` guard on severity chips keeps the
  fallback dormant, and the verdict CSS simply ignores any leftover
  `.v-glyph` div (zero-cost extra element until artifacts re-render).

## [9.23.0] - 2026-05-22

### Added — Phase 4: writer rollout + S1.2 renderer fill-in (closes the contract)

Phase 3 (v9.22.0) shipped the rendering pipeline for the eleven fragment-bearing
artifact types but left the **authoring layer** behind — no skill writer
instructed the agent to emit the sibling YAML the renderers consume. The
[v9.22.0 audit](SUNFLOWER-VIEW-AUDIT.md) characterised the system as
"structurally complete but functionally dormant". Phase 4 closes that gap.

Two structural fixes ride along:

1. **S1.2** — `renderers/design.mjs` and `renderers/ship-run.mjs` were
   declared fragment-bearing in Phase 1 but never grew sibling-YAML
   branches in their renderers. Phase 1 was only 60% shipped at the
   renderer layer; this release brings it to 100%.
2. **S1.3** — `docs/site/sunflower-view.md` was frozen at Phase 1 and
   claimed "five fragment-bearing types" (the count is now eleven, across
   three phases). Refreshed end-to-end with new feature highlights, URL
   routing, and CLI flags.

### Added

- **`renderers/design.mjs` sibling-YAML branch.** Tokens grouped by
  category (color/radius/spacing/font/easing/shadow) — each color token
  rendered with an inline swatch. Sizes table (id × height × padx × pady
  × font × radius). Themes and states chip rows. Specs reference + the
  annotate bullet list. Schema (`siblingYamlSchemas.design`) was already
  in place from Phase 1; only the renderer's `if (sy) {…}` branch and
  the matching CSS were missing.
- **`renderers/ship-run.mjs` sibling-YAML branch.** Horizontal SVG
  stages timeline (build → test → stage → canary → prod) coloured by
  `stages[].status` enum (`ok / flake / fail / running / pending`).
  Checks table with per-environment status cells (`check-status.is-ok |
  is-warn | is-bad | is-skip`). Rollback metadata panel with window,
  target release, and approvers.
- **CSS for design + ship-run rich render** in `assets/sdlc.css` (~120
  lines): `.design-chip-row`, `.sizes-table`, `.tokens-table`,
  `.token-swatch`, `.design-tokens-{color,radius,spacing,font,easing,shadow}`,
  `.ship-timeline`, `.checks-table`, `.check-status.is-*`, `.ship-rollback`,
  `.rollback-meta`. All built from existing tokens — no new theme vars.

### Edited — skill writer rollout (S1.1)

The six writer reference files that author Phase 2 / Phase 3 fragment
types now document the sibling-YAML shape. Each gets a new
"Sibling YAML — `<schema-name>`" section with a worked example matching
the schema, when to emit, and the non-obvious authoring rules. The
features themselves shipped in earlier releases; this release teaches
the agent to actually write the YAML so the renderers stop falling
through to `_simple.mjs`.

- `skills/review/SKILL.md` — added `review-dimension` block (Phase 2,
  per-dimension review pages at `/sdlc/<slug>/review/<dimension>/`).
- `skills/wf-quick/reference/rca.md` — added `five_whys[]` block
  (Phase 2, collapsible drill panel below the causal chain).
- `skills/wf/reference/plan.md` — added `lanes[]` + `crosses-service`
  block (Phase 2, data-flow swim-lane figure for cross-service plans).
- `skills/wf-quick/reference/simplify.md` — added `simplify-run` block
  (Phase 3, off-pipeline finding-table page).
- `skills/wf/reference/profile.md` — added `profile` block (Phase 3,
  hotspots + optional comparison figure + optimization candidates).
- `skills/wf/reference/benchmark.md` — added `benchmark` block
  (Phase 3, metric comparison table with `direction:`-aware tone).
- `skills/wf/reference/experiment.md` — added `experiment` block
  (Phase 3, arm-allocation bar + guardrail thresholds).
- `skills/wf/reference/instrument.md` — added `instrument` block
  (Phase 3, signal table + dark-paths callouts + PII warnings).

### Edited

- `docs/site/sunflower-view.md` — fragment-bearing types list expanded
  from 5 to 11 (now a per-phase table with sibling-YAML names + page
  URLs). New "Phase 2 / Phase 3 highlights" section. URL routing
  table now includes per-slice plan / implement / verify,
  augmentations, and `/sdlc/profiles/<run-id>/`. Modes table now
  documents `--simplify`, `--profiles`, `--asset-base`, and
  `--plugin-root`. Auto-render hook description now lists
  `.ai/simplify/` and `.ai/profiles/` alongside `.ai/workflows/`.
  Cache-bust example bumped to `?v=9.23.0`.
- `tests/sunflower.test.mjs` — 19 new tests this release. 4 cover the
  Phase 4 design + ship-run sibling/fallback branches (S1.2). 11 close
  the S2 audit findings: 4 for off-pipeline path resolution and
  link-graph kind threading (S2.2), 1 for the hotspot candidate chip
  rename (S2.3), and 6 for slug-overview + slice navigation regressions
  (S2.4). 4 cover the `findingListItem` extraction (S3.3):
  composition, variant/data-attr threading, minimal-field rendering,
  and HTML-escaping. **71/71 tests pass** (was 52).
- `.claude-plugin/plugin.json`, `package.json`,
  `.claude-plugin/marketplace.json`, `renderers/_shell.mjs`,
  `scripts/render-sunflower.mjs` — version bumped to 9.23.0
  (marketplace 1.57.0 → 1.58.0).

### Edited — Section 2 audit closure

- **S2.2** — `renderers/_paths.mjs` `resolveViewPath()` now accepts an
  optional `{ kind: 'workflow'|'simplify'|'profile' }` second arg.
  When `kind === 'simplify' | 'profile'` the resolver emits the
  off-pipeline view path the orchestrator previously computed inline.
  `renderers/_link-graph.mjs` `buildPathMap()` threads `kind` through
  so off-pipeline artifacts no longer drop out of the cross-artifact
  link map. `scripts/render-sunflower.mjs` calls the new signature and
  drops its inline ternary. Behaviour for slug-rooted paths is
  unchanged (no `kind` opt → `'workflow'`).
- **S2.3** — `renderers/profile.mjs` hotspot candidate chip renamed
  from `.hotspot-cand.is-cand` to `.hotspot-cand.is-yes` /
  `.hotspot-cand.is-no` to match the `.{base}.is-{semantic-value}`
  convention used elsewhere (status-badge, check-status). Added
  `aria-label="candidate"` / `"not a candidate"` so the ✓/— glyphs
  are screen-reader announced semantically. CSS updated.

### Edited — Section 3 audit closure

- **S3.1** — `renderers/dashboard.mjs` top-of-file comment now states
  explicitly that the dashboard is orchestrator-synthesized — no
  `frontmatter.type: dashboard` exists, no `00-dashboard.md` is on
  disk. Prevents future-reader confusion when grepping for the missing
  schema entry.
- **S3.2** — `SUNFLOWER-VIEW-PLAN.md` gains a "Status marker
  convention" preamble before the phase tables. Codifies that
  `[shipped]` means **all five layers landed** (schema + verifier +
  renderer + CSS + writer). The earlier conflation that prompted the
  audit ("renderer ships" ≠ "feature works end-to-end") is named, and
  a `[renderer-shipped, writer-pending]` marker is introduced for
  transition windows so the failure mode can't recur silently.
- **S3.3** — `renderers/_icons.mjs` gains `findingListItem({chip,
  file, line, action, msg, fix, id, variant, dataAttr})` — a shared
  `<li class="finding">` builder. Replaces the duplicated
  `findingItem()` helpers in `review-command.mjs` and
  `simplify-run.mjs`. Both callers shrink to a single
  parameter-object call; the per-renderer differences (severity chip
  vs category chip, `data-severity` vs `data-category`, optional
  `finding-compact` variant) flow through as parameters. 4 new
  dedicated tests cover composition, variant/data-attr threading,
  minimal-field rendering, and HTML-escaping. **71/71 tests pass.**

### Decisions

- **Why writer rollout is its own release.** The audit recommended
  shipping the writer documentation as a separate phase. The
  renderer-side changes from v9.22.0 were already in production; the
  writer work doesn't change any output until the *next* agent run
  writes a new artifact. Bundling avoided a phantom "v9.22.1" where
  only docs changed.
- **Why writer instructions reference v9.21.0 / v9.22.0 rather than v9.23.0.**
  Each "Sibling YAML — `<schema-name>`" section documents *when the
  feature became consumable* (the renderer + schema landed in those
  releases) rather than when the writer doc landed. The agent reading
  the reference cares about feature availability, not changelog
  ordering.
- **Why `resolveViewPath()` takes an opts arg instead of inferring
  kind from the path shape.** The simplify and profile path
  conventions don't carry a unique prefix the resolver could match on
  (a bare `<run-id>.md` is ambiguous with workflow-root files). The
  orchestrator already tracks `kind` per artifact during discovery,
  so passing it through is cheaper than fingerprinting the path.
- **Why no orchestrator integration test for `--simplify` /
  `--profiles` end-to-end.** The 11 new unit tests cover the public
  surface of the off-pipeline pipeline (path resolution, link-graph
  threading) and the navigation regressions. The remaining gap — a
  full disk-rendering test with fixtures under both `.ai/simplify/`
  and `.ai/profiles/` — is deferred. The existing
  `orchestrator renders fixture slug end-to-end` test plus the unit
  coverage is enough to catch most regressions without bloating
  CI runtime.

### Known follow-ups (carried from audit)

All Section 1, 2, and 3 audit findings closed in this release.
See [SUNFLOWER-VIEW-AUDIT.md](SUNFLOWER-VIEW-AUDIT.md) for the
original audit findings and [Sunflower view plan](SUNFLOWER-VIEW-PLAN.md)
Phase 4 entry for the per-finding shipping notes.

## [9.22.0] - 2026-05-22

### Added — Phase 3: simplify, profile, augmentations

Phase 2 (v9.21.0) closed out the review / plan / RCA fragment family. Phase 3
extends sibling-YAML support to the remaining off-pipeline artifact types and
the three non-RCA augmentation subtypes. As in Phase 2, every new projection
is additive: artifacts without a sibling `.yaml` continue to render exactly
as they did in v9.21.x.

- **simplify-run finding-table fragment** (`renderers/simplify-run.mjs`,
  `tests/frontmatter.schema.json` — new `simplify-run` sibling YAML schema):
  - When the off-pipeline simplify-run MD ships a sibling `.yaml`, the
    renderer emits a review-shaped finding table (smaller scale — no
    verdict block, categorical chips for reuse / quality / efficiency
    instead of severity), a 6-cell counts row (reuse, quality, efficiency,
    accepted, skipped, deferred), and an optional code-deltas summary table.
- **profile benchmark-comparison fragment** (`renderers/profile.mjs`,
  `tests/frontmatter.schema.json` — new `profile` sibling YAML schema):
  - Hotspots table (function / file:line / cost % / candidate flag).
  - Optional before/after metric-bar figure when the YAML supplies a
    `comparisons:` block. Bars are normalized per-metric so the eye reads
    relative change rather than absolute magnitude across heterogeneous
    units. Improvement vs. regression is tone-coded based on each metric's
    `direction:` (`lower-is-better` | `higher-is-better`).
  - Optional optimization-candidates list with estimated-gain + confidence
    metadata.
- **Generic augmentation structured-result fragment**
  (`renderers/augmentation.mjs`, three new sibling YAML schemas
  `benchmark`, `experiment`, `instrument`):
  - **benchmark**: metric comparison table with per-row delta tone (`is-ok`
    on improvements, `is-bad` on regressions — direction-aware).
  - **experiment**: arm-allocation horizontal-bar figure (one band per
    arm, width proportional to `allocated_pct`), arm description list,
    guardrail-threshold table.
  - **instrument**: signal table (kind chip + PII flag + source path) and
    dark-paths callout list.
  - The existing RCA branch is unchanged; all four subtypes now flow
    through a single dispatch in `render()`.

### Edited

- `scripts/verify-fragment.mjs` — `ALLOWED_FRAGMENT_NAMES` extended with
  `simplify-run`, `profile`, `benchmark`, `experiment`, `instrument`.
- `assets/sdlc.css` — ~150 lines added under three new section headers:
  "Simplify finding-table (Phase 3)", "Profile hotspots + candidates
  (Phase 3)", "Augmentation structured results (Phase 3)". All rules use
  existing tokens; no new tokens introduced.
- `tests/sunflower.test.mjs` — 10 new tests covering simplify-run sibling
  + fallback, profile sibling (with and without comparisons) + fallback,
  benchmark improvement + regression tone, experiment, instrument, and
  unknown-subtype fallback. **52/52 tests pass.**
- `scripts/render-sunflower.mjs`, `renderers/_shell.mjs`,
  `.claude-plugin/plugin.json`, `package.json`,
  `.claude-plugin/marketplace.json` — version bumped to 9.22.0
  (marketplace 1.56.0 → 1.57.0).
- `SUNFLOWER-VIEW-PLAN.md` — Phase 3 entries marked shipped.
- `docs/site/sunflower-view.md` — cache-bust example bumped to `?v=9.22.0`.

### Decisions

- **Why per-subtype schemas instead of a polymorphic union.** Each of the
  three non-RCA subtypes has a distinct visual projection (table / figure
  pair / signal list) and its own required fields. Keeping the schemas
  separate lets `verify-fragment.mjs` validate each fragment against the
  schema matching its `<section class="fragment-<name>">` wrapper without
  branching inside the validator. Cost: five sibling-YAML schemas at the
  end of the file rather than one. Worth it.
- **Why `simplify-run` reuses the review CSS hooks (.finding-list,
  .finding) but adds compact variants.** The plan calls for "styled like
  the review fragment but at smaller scale". A separate `.finding-compact`
  modifier lets us tweak padding/severity-coloring without forking the
  base styles. The categorical chip (`.finding-cat.is-reuse|is-quality|
  is-efficiency`) replaces the severity chip — same shape, different
  semantic.
- **Why before/after bars are normalized per-metric.** Comparing
  `latency_ms` (12 → 8) against `qps` (8100 → 11500) in the same figure
  with shared axes would visually drown the latency change. Per-metric
  normalization makes each row read as its own ratio. Trade-off: the
  reader can't compare *across* metrics by bar length. Direction-aware
  tone partly compensates — green/red shows the direction of the change
  even when bar widths are normalised.

## [9.21.0] - 2026-05-21

### Added — Phase 2: fragment polish + per-dimension review pages

Phase 1 (v9.20.0) shipped the renderer foundation and a single combined
review fragment. Phase 2 splits that combined fragment per dimension, gives
the plan figure a swim-lane projection for cross-service work, and adds an
optional 5-whys drill panel to the RCA renderer. All three features sit
behind sibling-YAML opt-ins — slugs that don't supply the new fields render
exactly as they did in v9.20.x.

- **Per-dimension review pages** (`renderers/review-command.mjs`,
  `tests/frontmatter.schema.json` — new `review-dimension` sibling YAML
  schema):
  - When a per-dimension review MD (`07-review/<dimension>.md`) ships a
    sibling `.yaml` (and optionally a `.html.fragment`), the renderer
    emits a focused page with its own verdict block, severity tally, and
    a finding list narrowed to that dimension.
  - Findings filter to `f.dimension === dimension`; entries with no
    `dimension` field fall through (single-dimension YAML stays valid).
  - Allowed fragment names extended with `review-dimension` in
    `scripts/verify-fragment.mjs`.
- **Plan data-flow lane variant** (`renderers/plan.mjs`,
  `tests/frontmatter.schema.json` — plan schema gains `lanes` array and
  `edges[].kind` enum gains `crosses-service`):
  - Triggered when the plan YAML declares `lanes:` (≥2) or any edge has
    `kind: crosses-service`. Triggered plans render a swim-lane SVG in
    place of the per-module file topology — services run as horizontal
    tracks, cross-service edges are dashed long-haul arcs labelled with
    the edge kind.
  - When `lanes:` is omitted but cross-service edges exist, lanes are
    inferred by taking each file's first path segment as the service hint.
- **RCA 5-whys drill panel** (`renderers/augmentation.mjs`,
  `tests/frontmatter.schema.json` — rca schema gains optional `five_whys`):
  - When sibling YAML carries a `five_whys` chain (1–7 entries), the
    renderer emits a collapsible `<details class="rca-five-whys">` panel
    between the causal-chain figure and the contributing-causes section.
  - The root cause is rendered with a distinct visual treatment, marked
    either explicitly via `root: true` on an entry or implicitly when the
    last entry's answer text starts with `ROOT:`.

### Edited

- `assets/sdlc.css` — new sections for `.findings` / `.finding-list` /
  `.finding-action`, `.plan-lanes-legend`, and `.rca-five-whys`. All
  reuse the existing token palette; no new tokens introduced.
- `scripts/render-sunflower.mjs`, `renderers/_shell.mjs`,
  `.claude-plugin/plugin.json`, `package.json`,
  `.claude-plugin/marketplace.json` — version bumped to 9.21.0
  (marketplace 1.55.2 → 1.56.0).
- `SUNFLOWER-VIEW-PLAN.md` — Phase 2 entries marked shipped.

### Decisions

- **Sibling-YAML opt-ins, not breaking changes.** Each Phase 2 feature
  triggers off an optional field. Slugs that don't supply the field keep
  the v9.20.x rendering. This matches Phase 1's calm-default-then-polish
  philosophy.
- **Lane inference falls back to path-segment grouping** rather than
  asking authors to write `lanes:` for every cross-service plan.
  Explicit `lanes:` always wins; inference is the cheap-rollout path.
- **5-whys panel is collapsible by default.** The causal-chain figure
  already shows the trigger → root path; 5-whys is the *why* drill that
  most readers won't need on every visit. Defaulting to collapsed keeps
  the page calm.

## [9.20.2] - 2026-05-20

### Added — Additive-write contract: remaining revisable references

Closes the Phase 1.x rollout begun in v9.20.1. The additive-write contract
from [`SUNFLOWER-VIEW-PLAN.md`](SUNFLOWER-VIEW-PLAN.md) §"Additive write
semantics for sub-commands" now covers every revisable reference in the
plugin. Each gets a section tuned to its artifact's reality:

- **`/wf intake`** (`skills/wf/reference/intake.md`) — re-invocation happens
  when the user returns with answers to open questions or scope changes.
  Snapshot to `<slug>/history/01-intake-<rev>.md`, bump `revision-count`,
  append `## Revision <n>`. Open-question resolution is marked inline with
  a `→` rather than silently deleting questions. Status transitions
  (`awaiting-input` → `complete`) are called out in the revision section.
- **`/wf retro`** (`skills/wf/reference/retro.md`) — usually one-shot but
  revisable for 30-day check-ins / quarterly look-backs / post-incident
  follow-ups. Snapshot + append; the renderer aggregates retro revisions
  into a date-stamped timeline view rather than burying them in a
  `<details>` block (retros are short enough to display in full).
- **`/wf handoff`** (`skills/wf/reference/handoff.md`) — re-invocation
  happens when reviewers request changes pre-ship, or when a late-breaking
  issue forces a re-handoff. Snapshot + append. PR descriptions regenerated
  from the current revision in full (not just the diff from prior) — the
  PR is external comms; the on-disk handoff is the reasoning trail.
- **`/wf-quick simplify`** (`skills/wf-quick/reference/simplify.md`) —
  *inverse* contract: each invocation produces a new
  `.ai/simplify/<run-id>.md` file. Never overwrite an existing run.
  `regenerable: false` explicit. No `revision-count`. Cross-run lineage is
  via `refs.prior-run`, not by appending to prior files.
- **`/wf-meta sync`** (`skills/wf-meta/reference/sync.md`) — *inverse*
  contract: sync-report is a view over branch state, not source-of-truth.
  `regenerable: true` explicit. Overwrite freely. No `revision-count`.
  `synced-at` ISO timestamp in frontmatter. The renderer shows a
  `regenerable` badge and suppresses the prior-revisions block.

### Decisions

- **`regenerable: true` is now used in two canonical places**: `RESUME.md`
  (session resume) and `sync-report` (branch-state view). Other artifacts
  do not normally carry the flag — additive-write is the default discipline.
- **Off-pipeline artifacts (simplify-run, profile) are stateless across
  invocations.** Each run is time-keyed and immutable. There is no slug-
  rooted history folder; `.ai/simplify/` and `.ai/profiles/` are themselves
  the history.
- **PR descriptions and on-disk handoff stay in sync** but serve different
  audiences: PR description is external (the GitHub UI shows the current
  revision); on-disk handoff carries the reasoning + history (the view
  shows prior revisions). Both update on `/wf handoff` re-invocation.

## [9.20.1] - 2026-05-20

### Added — `components/` snippet helper (Phase 1.5)

The five fragment-bearing references overlap on chrome — every one carries a
5-cell `.metric-row`, several share the `.callout` shape, every fragment
dispatches `sdlc:fragment-ready`. Without dedupe, drift is inevitable. v9.20.1
ships the cheap middle-ground to MDX: a `components/` directory of HTML
snippets expanded by the renderer at render-time via a documented include
token. No build step.

- **New** `plugins/sdlc-workflow/components/_components.mjs` — render-time
  expander. `expand(html, ctx) → html`. Walks the fragment HTML, recognises
  `<!-- @include <name> <json> -->` opener/closer, loads
  `components/<name>.html.snippet`, substitutes `{{token}}` (HTML-escaped) and
  `{{{token}}}` (raw) placeholders from the JSON payload. Supports
  `{{#each list}}…{{/each}}` loops for array-driven snippets. Runs to fixed
  point bounded by `maxDepth=4`. Throws on missing snippet, invalid JSON, or
  recursion exceeded.
- **New** seven initial snippets under `plugins/sdlc-workflow/components/`:
  `metric-row.html.snippet`, `callout.html.snippet`, `verdict.html.snippet`,
  `severity-chip.html.snippet`, `fragment-ready.html.snippet`,
  `files-touched-row.html.snippet`, `diff-block.html.snippet`. Each maps 1:1
  to a shared class catalogue entry in `assets/sdlc.css`.
- **Pipeline integration**: `scripts/render-sunflower.mjs` now runs the
  expander on every fragment between fragment-validity (Check 7) and
  `_shell.mjs` wrap. The MD-to-HTML path is untouched — `markdown-it` never
  sees include tokens.
- **Verifier Check 9** (warn-only) added to `scripts/verify-fragment.mjs`:
  fingerprints inline markup matching a published snippet (e.g. an inlined
  `<div class="metric-row">…`) and warns that the author should use
  `<!-- @include metric-row … -->` instead. Suppress legitimate variants
  with an adjacent `<!-- @include-skip <reason> -->` comment.
- **Five fragment-author references** (`/wf plan`, `/wf ship`,
  `/wf-design craft`, `/wf-quick rca`, `/review` SKILL) now teach the
  `@include` syntax with concrete examples mapped to each fragment's
  domain.

### Added — Additive-write contract (Phase 1.x)

Two revisable references gain the additive-write contract from
[`SUNFLOWER-VIEW-PLAN.md`](SUNFLOWER-VIEW-PLAN.md) §"Additive write semantics
for sub-commands":

- **`/wf shape`** (`skills/wf/reference/shape.md`) — re-invocation snapshots
  the existing `02-shape.md` to `<slug>/history/02-shape-<rev>.md` first,
  bumps `revision-count`, appends `## Revision <n> — <ISO>` rather than
  rewriting body content. Sibling YAML follows the same rule.
- **`/wf slice`** (`skills/wf/reference/slice.md`) — same contract for
  `03-slice-index.md` and per-slice files. New slices in a run start fresh;
  removed slices stay on disk marked `status: dropped`.

Both honour the `regenerable: true` opt-out introduced in v9.20.0.

### Decisions

- **Snippet syntax is HTML comments**, not custom tags. Reason: comments
  render cleanly during authoring (unaware editors don't break) and
  `markdown-it`'s autolink + inline-HTML rules can't fire on them.
- **Expansion is render-time, not build-time.** No compiler, no AST, no
  hot-reload server. Roughly 80–120 LOC of string substitution.
- **`maxDepth=4`** bounds snippet recursion. Real nesting is 1–2 levels;
  4 is generous and catches cycles cheaply.
- **`{{token}}` is HTML-escaped by default; `{{{token}}}` is raw.** This
  matches Mustache/Handlebars semantics so the syntax is familiar.

## [9.20.0] - 2026-05-20

### Added — Sunflower view layer

HTML projection of `.ai/workflows/` artifacts. New `scripts/render-sunflower.mjs`
walks the storage tree and emits a navigable HTML site under `.ai/_view/` with
shared CSS/JS at the root. Pre-existing slugs render with no migration. Visual
design follows the calm paper-and-ink reader from `sdlc-handoff/sdlc/project/`.
Conceptual reference: Thariq Shihipar, "The Unreasonable Effectiveness of HTML"
(2026-05-08).

- **30 per-artifact-type renderer modules** under `renderers/`, each mapped 1:1
  to a branch of `tests/frontmatter.schema.json`. Plus 10 shared helpers
  (`_shell`, `_markdown`, `_yaml`, `_validator`, `_paths`, `_link-graph`,
  `_icons`, `_mtime`, `_history`, `_figure`).
- **Shared design system**: `assets/sdlc.css` (~600 lines), `assets/sdlc.js`
  (~100 lines), `assets/favicon.svg`. Single file each. No build step. Paper/ink
  palette, serif display headings (Iowan Old Style), severity glyphs paired
  with colour for deuteranope safety.
- **Five page-level figure-canvas SVG builders** — derived automatically from
  frontmatter + sibling YAML:
  - Dashboard: workflow swimlanes (rows = projects, columns = 10 stages).
  - Slug overview: stage stripe with "← you are here" marker.
  - Plan: file-change topology (modules as dashed rects, files tinted by role,
    import edges with arrowheads, "replaces" edges dashed in blocker red).
  - Review: severity × dimension heatmap.
  - Slice-index: slice grid with status-tinted cards.
  - RCA augmentation: incident timeline + causal chain.
- **PostToolUse hook** (`hooks/render-sunflower.json` +
  `hooks/render-on-artifact-write.mjs`) auto-renders touched artifacts in the
  background with 2s debounce. Suppressed during plugin install
  (`CLAUDE_PLUGIN_INSTALL=1`) or when `.ai/_view/.render-suppress` exists.
- **Sibling YAML data files**: any artifact `.md` may have a sibling `.yaml`
  carrying structured display data. Renderer merges it into frontmatter
  (sibling-yaml wins on conflict). **New schemas** for `review`, `rca`, `plan`,
  `design`, and `ship-run` sibling YAML under the new `siblingYamlSchemas`
  root in `tests/frontmatter.schema.json`.
- **Additive renderer mode** (default): only artifacts with newer storage
  mtimes re-render; existing view files are preserved. `--clean` flag forces
  full wipe. `--only <glob>` narrows the work-set (used by the hook).
- **Additive sub-command write contract**: primary artifacts append
  `## Revision <n>` sections; full rewrites snapshot to
  `<slug>/history/<basename>-<rev>.md` first. `regenerable: true` frontmatter
  flag opts out for view-style artifacts (RESUME, sync reports).
- **Verifier Checks 5–8** in `scripts/verify-router-migration.mjs`:
  view-tree freshness (warn), renderer coverage (warn), fragment validity
  (**error**), figure renderability (warn). Plus new
  `scripts/verify-fragment.mjs` invoked by Check 7.
- **`sdlc:fragment-ready` window event** — every fragment dispatches one when
  its script settles; `assets/sdlc.js` subscribes and records
  `data-fragment-ready` on `<body>` for manifest tooling.
- **Tailscale serve wrappers**: `scripts/serve-sunflower.{ps1,sh}`.

### Decisions

- **View-as-projection over storage-rewrite**: existing markdown stays the
  source-of-truth; HTML is regenerated. Trade-off: HTML diffs not git-tracked
  by default. Benefit: back-compat is free.
- **Schema-driven renderers** reuse `frontmatter.schema.json` as the template
  directory rather than introducing a parallel `templates/<kind>/` tree.
- **Calm-reader palette** (paper-and-ink, Iowan Old Style serif, sandstone
  neutrals) per the design handoff; supersedes the original dark-mode proposal.
- **Fragment-author reference rewrites** (review, plan, design, ship-run, rca)
  are stubbed in v9.20.0 and will roll out incrementally in v9.20.1+ patches.
  Phase 1 ships the renderer's fragment support; gallery-faithful fragment
  emission lands per-router as references are audited.
- **MDX considered and rejected** for v9.20.0 — build step cost outweighs the
  component-reuse benefit at this surface area. Components/snippet helper at
  v9.20.1 (Phase 1.5) covers the dedupe motivation without a compiler.
- **PostToolUse hook is enabled by default** on plugin install. No opt-in
  gate. Suppress via `.ai/_view/.render-suppress` touch-file (per-project).
- **No retroactive migration** of pre-v9.20.0 artifacts to the additive
  contract. Existing slugs continue forward with append-only semantics; missing
  history renders as the current body being the latest revision.

### Dependencies

- `js-yaml` (^4.1.0) — parse YAML frontmatter and sibling files.
- `ajv` + `ajv-formats` (^8.17 / ^3.0) — schema validation.
- `markdown-it` + `markdown-it-anchor` (^14.1 / ^9.2) — MD-to-HTML conversion
  with anchor-IDs. All MIT-licensed, run-time only, no build step.

## [9.19.0] - 2026-05-17

### Changed — uniform Final Summary Contract across every sub-command

Every sub-command of every router now ends with a uniform chat summary. Previously, summaries were ad-hoc: some sub-commands had "Chat return contract" sections (inconsistent shapes), some had "Step N — Hand off to user" sections (different content), and others had no explicit final step at all. Users couldn't predict what would land in chat at the end of a run.

The fix is architectural, not file-by-file: each of the six router SKILL.md files (`/wf`, `/wf-quick`, `/wf-meta`, `/wf-design`, `/wf-docs`, `/review`) gains a `# Step N — Emit Final Summary (MANDATORY)` section. The dispatcher applies it to every sub-command it loads. References that already define their own chat-return content supply the *values*; the router contract supplies the *shape*.

**The contract:** max 8 lines, four required fields:

```
<router> <sub-command> complete: <slug-or-scope>
Artifacts: <comma-separated paths, or "none">
<1–3 lines of key facts — verdict, counts, decisions, tripwires>
Next: <recommended command, or "Done">
```

Verb-first first line. Concrete `Next` invocation, never vague. `Done` is allowed for terminal sub-commands (`ship`, `retro`) and for read-only `wf-meta` actions.

**Per-router specializations** (same shape, router-specific fields):

- **`/wf`** — straightforward 4-field summary. Workflow slug or `area` (for `profile`) is the scope.
- **`/wf-quick`** — two format variants based on Step 0 mode: **standalone** writes a fresh workflow; **slug-mode** writes a compressed slice to an existing workflow. Both honor the same 4-field shape; slug-mode's first line uses the `→ compressed slice <slice-slug> on <slug>` shape.
- **`/wf-meta`** — most sub-commands are read-only or registry-only, so `Artifacts: "none"` is the common case. The exception is `sync` (writes `.ai/workflows/INDEX.md`) and `amend`/`extend` (touch stage files).
- **`/wf-design`** — adds two router-specific required fields (`Register: <brand|product>` and `Image gate: <pass|skipped:<reason>|n/a>`) because those are load-bearing for every design-mode run.
- **`/wf-docs`** — two format variants for the two invocation modes (orchestrator vs primitive). Orchestrator surfaces `Files: <created> created | <updated> updated | <deleted> deleted | <skipped> skipped`. Primitive surfaces `Quadrant:` (the Diátaxis quadrant).
- **`/review`** — adds `Verdict: <Ship | Ship with caveats | Don't ship>` and `Findings: BLOCKER <n> | HIGH <n> | MED <n> | LOW <n> | NIT <n>` because those are the load-bearing signals after a review. Existing `Step 2 — Output to the user` (the rich markdown report) is unchanged; the Final Summary is the terse cap that lands after it.

### Decisions (recorded)

1. **Centralize at the dispatcher, not at every reference.** Editing 60+ sub-command references individually would have produced 60 near-identical sections with predictable drift. The dispatcher reads the reference *and* the contract; the contract is enforced once per router.
2. **Shape spec vs content spec.** References that already have a "Chat return contract" or "Hand off to user" section keep their *content* (verdicts, counts, key facts they know how to compute). The router contract supplies the *shape* (4 fields, max 8 lines, format template). This is the Diátaxis-aligned separation: data versus rendering.
3. **Always emit, with one exception.** When a reference STOPs with an error message, the error replaces the summary. Avoids double-output on aborted runs.
4. **Internal audience.** The Final Summary is explicitly internal output (the chat return, not external-facing copy), so workflow artifact paths under `.ai/` ARE allowed here. The plugin's External Output Boundary still governs commit messages, PR text, release notes, and anything else that lands outside the conversation.

### Files

- **Modified:** `plugins/sdlc-workflow/skills/wf/SKILL.md`, `skills/wf-quick/SKILL.md`, `skills/wf-meta/SKILL.md`, `skills/wf-design/SKILL.md`, `skills/wf-docs/SKILL.md`, `skills/review/SKILL.md` (Final Summary Contract section added — replacing the existing ad-hoc "Hand off to user" in `wf-design` and the two mode-specific "Chat return contract" sections in `wf-docs`).
- **Modified:** `plugins/sdlc-workflow/.claude-plugin/plugin.json` (9.18.0 → 9.19.0), `.claude-plugin/marketplace.json` (sdlc-workflow 9.18.0 → 9.19.0; marketplace 1.53.0 → 1.54.0 — minor for the new uniform contract).
- **NOT modified:** the 60+ sub-command reference files under `skills/*/reference/`. Their existing "Chat return contract" / "Hand off to user" sections (where present) remain as the *content spec* — the new router-level contract supplies the *shape* on top. References that previously had no final-step section now inherit the contract from the router automatically; no per-file edits required.

---

## [9.18.0] - 2026-05-17

### Changed — `/wf-quick quick` renamed to `/wf-quick fix`

Sub-command rename. `/wf-quick quick` was the odd one out in a verb-noun-shaped sibling set (`rca`, `probe`, `investigate`, `discover`, `hotfix`, `refactor`, `ideate`, `simplify`, `update-deps`) — an adverb where the rest are verbs/nouns — and the duplicate `/wf-quick quick` was awkward to say and to write. `fix` is verb-first, parallel with siblings, and reads naturally: `/wf-quick fix add-rate-limiting`. Following the established cutover pattern (v9.1.0 moved `intake` to `/wf`, v9.4.0 moved `docs` to `/wf-docs`), this is a clean rename — the dispatcher emits a redirect message rather than a back-compat shim.

**User-visible changes:**

- **`/wf-quick fix <description>`** replaces `/wf-quick quick <description>`. The sub-command's behavior — compressed planning that collapses intake, shape, design, slice, and plan into one artifact — is unchanged.
- **`/wf-quick quick` now returns a redirect message** at the Step 0 dispatcher: *"`quick` was renamed to `fix` in v9.18.0 — use `/wf-quick fix <description>`."* (Parallel to how `intake` and `docs` redirects work.)
- **New artifacts use the `fix` namespace:** `01-fix.md` (planning), `workflow-type: fix`, branch `fix/<slug>`, slice-slug `fix-<descriptor>`, compressed slice `03-slice-fix-<descriptor>.md`, slice-type `fix`, origin `wf-quick/fix`. Slug derivation: `fix-<short-description>` (e.g., `fix-checkout-button-spacing`).
- **Pre-v9.18.0 artifacts on disk are still readable.** Resume mode in `fix.md` detects both `workflow-type: fix` (new) and `workflow-type: quick` (legacy), and reads `01-fix.md` (new) or `01-quick.md` (legacy). `/wf implement`'s compressed-mode prerequisite check also reads both paths. The `frontmatter.schema.json` `workflow-type` enum keeps `quick` alongside `fix` for back-compat. The `/wf-meta sync` registry tolerates both values.

**Files renamed:**

- `skills/wf-quick/reference/quick.md` → `skills/wf-quick/reference/fix.md` (via `git mv` to preserve history). Body edits inside: all sub-command-name references (`01-quick.md`, `workflow-type: quick`, `quick-plan` type, branch `quick/<slug>`, slug-derivation pattern) updated to `fix`; router-name references (`wf-quick`, "wf-quick envelope", chat-return prefix `wf-quick complete:`) untouched.

**Files updated:**

- `skills/wf-quick/SKILL.md` — description, argument-hint, dispatcher Step 0 redirect message, sub-command table, slice-type comment.
- `skills/wf-quick/router-metadata.json` — `dimensions` (replaced `quick` with `fix`); `description` synced. `models.overrides` unchanged (`quick` had no override; `fix` uses the default `haiku`).
- `skills/wf-quick/reference/rca.md`, `probe.md`, `investigate.md`, `discover.md` — every `/wf-quick quick` callsite → `/wf-quick fix`.
- `skills/wf/reference/implement.md` — compressed-mode prerequisite check supports both `01-fix.md` and `01-quick.md` (legacy).
- `skills/wf/reference/profile.md` — every `/wf-quick quick` callsite → `/wf-quick fix`.
- `skills/wf-meta/reference/sync.md` — workflow-type list includes both `fix` and legacy `quick`.
- `tests/wf-quick-fixtures.json` — fixture `wf-quick-quick-slug` replaced with two fixtures: `wf-quick-fix-slug` (new sub-command resolves to `fix.md`) and `wf-quick-quick-rejected` (legacy invocation must error with redirect).
- `tests/frontmatter.schema.json` — `workflow-type` enum gains `fix`; legacy `quick` retained for back-compat.

**Files NOT changed (intentionally):**

- The `wf-quick` router name itself is unchanged. Only the sub-command is renamed.
- The `/review sweep quick` aggregate (`skills/review/router-metadata.json` `aggregates.quick`, `skills/review/SKILL.md`) is a different `quick` — a review-aggregate, not a wf-quick sub-command. Untouched.
- Historical files: CHANGELOG.md (history), `ROUTER-MIGRATION-PLAN.md`, `RUNTIME-PROBE-PLAN.md`, `scripts/relocate-wf-quick.mjs` (one-shot historical migration). Mentions of `quick` in those files refer to past states and should stay.

### Decisions (recorded)

1. **Clean cutover, no shim.** Matches v9.1.0 (`intake` move) and v9.4.0 (`docs` move). The dispatcher's redirect message is the only back-compat for the sub-command name. Resume mode for *existing artifacts on disk* still works because legacy `workflow-type: quick` is recognized — but new invocations must use `fix`.
2. **Minor bump (9.18.0), not patch.** A renamed sub-command is a breaking change to user-facing CLI surface, even though existing artifacts keep working. Semver minor reflects "new feature + intentional behavior change with redirect path".
3. **Artifact paths renamed (not just the sub-command name).** Wrote `01-fix.md` instead of keeping `01-quick.md` despite the rename touching multiple cross-references. Reason: the artifact name is the long-lived signal of provenance — three years from now, reading `01-quick.md` in a repo with `/wf-quick fix` should be confusing. Better to have `01-fix.md` mean "made by `/wf-quick fix`" and `01-quick.md` mean "made by the pre-v9.18.0 sub-command."

### Files

See "Files renamed", "Files updated", and "Files NOT changed" sections above. Additionally: `plugins/sdlc-workflow/.claude-plugin/plugin.json` (9.17.1 → 9.18.0), `.claude-plugin/marketplace.json` (sdlc-workflow 9.17.1 → 9.18.0; marketplace 1.52.3 → 1.53.0 — minor because of the breaking sub-command rename).

---

## [9.17.1] - 2026-05-17

### Changed — skill descriptions rewritten with Diátaxis-style reference voice

Copy-only refresh. No behavior change; all four router verifiers still PASS. The skill description field (read by the routing model when deciding what to load, and by users browsing the marketplace) had drifted into feature laundry lists, version-history fragments, and internal lingo. Diátaxis's separation-by-purpose principle says: a description should be reference-voiced (factual, present-tense, no narrative), state the triggering condition, and let the `argument-hint` carry the enumeration of sub-commands instead of duplicating it inline.

**Worst-case before/after** (`/wf-quick`):

| | Length | Content |
|---|---:|---|
| Before | ~190 words | 10-item sub-command enumeration with inline definitions, version-history note (`Positional slug detection (v9.10.0):`), internal lingo (`type: slice`, `slice-type: <sub>`, `compressed: true`), per-sub-command flag enumeration |
| After | ~60 words | Verb-first behavior, slug-detection rule in one sentence, sibling-skill cross-references |

**All 11 SKILL.md descriptions updated.** Three small skills (`error-analysis`, `refactoring-patterns`, `test-patterns`) lose their "This skill should be used when…" preamble (dead words before the verb). The `/review` description drops a 17-item dimension enumeration and refers to `argument-hint` for the full list. The six router skills (`wf`, `wf-meta`, `wf-quick`, `wf-design`, `wf-docs`, `review`) get verb-first leads, drop "Skill router for /xyz." preambles, and let the argument-hint do the enumeration work.

**`router-metadata.json` descriptions synced to match.** Both source-of-truth surfaces (SKILL.md frontmatter + router-metadata.json) now carry the same copy. Note: this is two-sources-of-truth — a latent Diátaxis smell — kept aligned manually until a follow-up unifies them.

### Decisions (recorded)

1. **Patch bump (9.17.1), not minor.** No behavior change. The descriptions affect discovery and routing context, not execution. Keep-a-Changelog convention: copy-only refresh = patch.
2. **Don't enumerate when you can categorize.** The `/review` description names the kinds of dimensions reviewed (correctness, security, performance, …) and the total count (31), instead of listing all 31. The full enumeration moves to where it already lives in `argument-hint`.
3. **`imagegen` description trims the capability-waterfall implementation detail.** That's a runtime mechanism, not part of the behavioral contract a description should carry. The fallback chain is documented in the SKILL body.
4. **`wide-event-observability` left as-is.** Already concise and uses both a `description` (what it does) and a separate `when_to_use` (trigger condition) — the only skill in the plugin that explicitly separates those two purposes. Good model for future skills.

### Files

- **Modified (11 SKILL.md descriptions):** `skills/error-analysis/SKILL.md`, `skills/imagegen/SKILL.md`, `skills/refactoring-patterns/SKILL.md`, `skills/review/SKILL.md`, `skills/test-patterns/SKILL.md`, `skills/wf-design/SKILL.md`, `skills/wf-docs/SKILL.md`, `skills/wf-meta/SKILL.md`, `skills/wf-quick/SKILL.md`, `skills/wf/SKILL.md`, `skills/wide-event-observability/SKILL.md` (unchanged — already good).
- **Modified (6 router-metadata.json descriptions):** `skills/review/router-metadata.json`, `skills/wf/router-metadata.json`, `skills/wf-design/router-metadata.json`, `skills/wf-docs/router-metadata.json`, `skills/wf-meta/router-metadata.json`, `skills/wf-quick/router-metadata.json`.
- **Modified:** `plugins/sdlc-workflow/.claude-plugin/plugin.json` (9.17.0 → 9.17.1), `.claude-plugin/marketplace.json` (sdlc-workflow 9.17.0 → 9.17.1; marketplace 1.52.2 → 1.52.3).

---

## [9.17.0] - 2026-05-17

### Changed — model tiering extended across `/wf`, `/wf-meta`, and `/wf-quick`

v9.16.0 added the `models` block to `/review`. v9.17.0 propagates the same pattern to every other fan-out dispatch site in the plugin, closing the gap where ~20+ sites were silently inheriting the parent session's model (Opus on Opus sessions).

**Tier-2 → Tier-1 (explicit `model: sonnet` at each fix-loop dispatch):**

- **`skills/wf/reference/review.md` Step 3 (fan-out)** — was prose-only "spawn a sonnet sub-agent"; now requires explicit `model: sonnet` on every `Task` call with enforcement language. The fan-out reviewers run one rubric each — Sonnet is the right tier; synthesis (Step 4) inherits parent.
- **`skills/wf/reference/review.md` Step 4c (fix-loop)** — same upgrade: explicit `model: sonnet`, REQUIRED.
- **`skills/wf/reference/verify.md` Step 7.6 (fix-loop)** — same upgrade.
- **`skills/wf/reference/implement.md` reviews mode fix-loop** — same upgrade.

The "Do not omit; sub-agents must not silently inherit the parent's model" enforcement language is identical across all four sites so future prose simplifications can't drift back to inheritance.

**Tier-3 → Tier-1 (new `models` blocks in `wf-meta` and `wf-quick` router-metadata, wired at every dispatch site):**

- **`skills/wf-meta/router-metadata.json` adds `models: { default: "haiku", overrides: {} }`**. `how` is the only sub-command that fans out; synthesizers within `how` (Mode B synth, Mode C synth, Mode D, Mode E) use an explicit `model: omit` override in the SKILL prose because synthesis genuinely benefits from the parent reasoner.
- **`skills/wf-quick/router-metadata.json` adds `models` block with `default: "haiku"`** and three `overrides`: `investigate`, `rca`, `hotfix` → `sonnet`. The overrides reflect the judgment density of each sub-command: investigate trades off across design space, rca traces causal chains under uncertainty, hotfix reasons about root cause and blast radius under time pressure. All three underserve on Haiku.
- **SKILL prose updated at every dispatch site to read from the block:** `wf-meta/reference/how.md` (×7 spawn sites, four `haiku` + three `parent-inherit`), `wf-quick/reference/simplify.md`, `discover.md`, `investigate.md`, `hotfix.md`, `quick.md`, `rca.md`, `refactor.md`, `update-deps.md`, `ideate.md`.

**Tooling:**

- **`scripts/migrate-router.mjs` now preserves the `models` block across regenerations.** Was a real bug — only `aggregates` was preserved, so the v9.16 `/review` models block would have been destroyed the next time anyone regenerated manifests. Fixed by treating `models` as policy data alongside `aggregates`.
- **`scripts/migrate-router.mjs` now skips reference files without YAML frontmatter** (e.g., `skills/wf/reference/runtime-adapters.md` — a shared reference table, not a sub-command) rather than crashing. Surfaces a `skip:` warning instead of throwing.
- **`scripts/verify-router-migration.mjs` Check 4 (added in v9.16) now validates all four routers** — `models` is optional-when-absent, so this required zero changes to the verifier.

### Decisions (recorded)

1. **`wf-meta` `models.overrides` is empty.** Only `how` fans out, and the synthesizer exceptions inside `how` are handled in SKILL prose (explicit "omit `model:`"), not as router-metadata overrides. Reason: a `how: parent` override at the router level would be misleading — it would imply the *whole* `how` sub-command keeps parent, but only the synthesis steps do.
2. **`/wf-meta how` Mode C is the largest single win.** 6-8 research agents per question moving from parent (Opus on Opus sessions) to Haiku is the biggest cost delta in the plugin. The synthesizer still uses parent so output quality is unchanged.
3. **`/wf-quick investigate`, `rca`, `hotfix` are the only Sonnet overrides.** Tradeoff analysis, root-cause investigation, and incident response are causal-reasoning tasks that materially underserve on Haiku. Every other `/wf-quick` sub-command (`simplify`, `discover`, `quick`, `refactor`, `update-deps`, `ideate`) does structured exploration with bounded output — exactly the Haiku 4.5 profile.
4. **`wf` skill not modeled in this PR.** Has many dispatch sites (`verify` functional 1-5, `plan` Explore 1-3, `shape` Explore 1-2, `implement` Explore 1-2, `ship` freshness 1-3, `retro` Analysis 1-3, `experiment`, `benchmark`, `instrument`). Modeling these requires deciding per-sub-command tiers across nine dimensions plus per-agent role distinctions — larger blast radius than the scope of this PR. Left as follow-up.

### Files

- **Modified:**
  - `plugins/sdlc-workflow/skills/wf/reference/review.md` (Step 3 fan-out + Step 4c fix-loop dispatches require explicit `model: sonnet`).
  - `plugins/sdlc-workflow/skills/wf/reference/verify.md` (Step 7.6 fix-loop requires explicit `model: sonnet`).
  - `plugins/sdlc-workflow/skills/wf/reference/implement.md` (reviews-mode fix-loop requires explicit `model: sonnet`).
  - `plugins/sdlc-workflow/skills/wf-meta/router-metadata.json` (added `models` block).
  - `plugins/sdlc-workflow/skills/wf-meta/migration-manifest.json` (regenerated; picks up `init-ship-plan.md` which was previously missing from dimensions).
  - `plugins/sdlc-workflow/skills/wf-meta/reference/how.md` (7 spawn sites updated with `model:` directives).
  - `plugins/sdlc-workflow/skills/wf-quick/router-metadata.json` (added `models` block with three Sonnet overrides).
  - `plugins/sdlc-workflow/skills/wf-quick/migration-manifest.json` (regenerated).
  - `plugins/sdlc-workflow/skills/wf-quick/reference/simplify.md`, `discover.md`, `investigate.md`, `hotfix.md`, `quick.md`, `rca.md`, `refactor.md`, `update-deps.md`, `ideate.md` (dispatch sites updated with `model:` directives).
  - `plugins/sdlc-workflow/skills/wf/migration-manifest.json` (regenerated to match current bodies).
  - `plugins/sdlc-workflow/scripts/migrate-router.mjs` (preserves `models` block across regenerations; tolerates frontmatter-less reference files).
  - `plugins/sdlc-workflow/.claude-plugin/plugin.json` (9.16.0 → 9.17.0).

---

## [9.16.0] - 2026-05-17

### Changed — `/review sweep` reviewers run on Haiku by default, Sonnet for judgment-heavy dimensions

Previously every per-dimension reviewer dispatched by `/review sweep <aggregate>` inherited the parent session's model. On Opus-class sessions this meant `/review sweep all` paid Opus prices 31 times for what are fundamentally rubric-bound, single-input/structured-output tasks. The fan-out is now explicitly tiered.

- **New `models` block in `skills/review/router-metadata.json`.** `default: "haiku"` for the rubric-bound dimensions; `overrides` map `architecture`, `refactor-safety`, and `security` to `sonnet` because those three call for subjective tradeoff judgment, abstraction critique, or threat modeling that Haiku underserves. Synthesis (Step 5 — dedupe, severity mapping, interactive triage) keeps the parent model.
- **`skills/review/SKILL.md` Step 1b.2 now requires the `model` parameter on every dispatched `Task`.** The SKILL reads `models.overrides[D] ?? models.default` and passes the resolved value. The rule is explicit ("Do not omit this; reviewers must not silently inherit the parent's model") to prevent silent regression on future prompt edits.
- **New Check 4 in `scripts/verify-router-migration.mjs` enforces the invariant statically.** Validates `models.default` is in `{haiku, sonnet, opus}`, every `overrides` key is a real dimension, every override value is in the allowed set, and every dimension resolves to a valid model. The check is optional-when-absent so other routers (`wf-design`, `wf-quick`, etc.) that don't fan out aren't forced into the schema.

### Decisions (recorded)

1. **Sonnet, not Opus, on the three judgment-heavy overrides.** The per-dimension reviewer still applies a single rubric; the Opus-class cross-finding reasoning lives in synthesis, which inherits parent. Sonnet 4.6 gives the abstraction-critique quality Haiku underserves without overpaying for cross-dimension reasoning that happens later.
2. **Single-dimension `/review <dim>` is unchanged — no model override.** It's one reviewer at parent quality; the cost-savings argument that justifies the Haiku fan-out doesn't apply, and the quality argument does.
3. **Data-driven (router-metadata.json) over inline pin.** Matches the v9.x runtime-truth pattern: config is the source of truth, SKILL prompt is the interpreter. The static verifier makes the invariant testable.

### Files

- **Modified:** `plugins/sdlc-workflow/skills/review/router-metadata.json` (added `models` block), `plugins/sdlc-workflow/skills/review/SKILL.md` (Step 1b.2 — `model` parameter required, resolution rule, model-tiering rationale), `plugins/sdlc-workflow/scripts/verify-router-migration.mjs` (Check 4 — model resolution), `plugins/sdlc-workflow/.claude-plugin/plugin.json` (9.15.0 → 9.16.0).

---

## [9.15.0] - 2026-05-16

### Changed — verify and review own their triage→fix loop

Eliminates the "step backwards" pattern where verify failures and review blockers required users to re-invoke `/wf implement` (or `/wf implement <slug> [<slice>] reviews`), then come forward through verify and review again. Each stage is now responsible for producing either a passing artifact or a substantively-blocked one — without bouncing the user back to stage 5 for routine fixes.

- **`/wf verify` gains a single-round, user-gated fix loop (new Step 7.6).** After all checks run and the user-observable AC gate (Step 7.5) partitions issues, verify presents every failing check and every unmet AC via `AskUserQuestion` with three options per issue: `Fix` (spawn a sub-agent to apply the minimal patch in this run), `Skip` (record but do not fix), `Escalate` (route to manual implement). For each `Fix` decision verify dispatches one sonnet sub-agent sequentially, then re-runs **only** the affected checks once. **ONE round only.** A second round requires the user to re-invoke `/wf verify`; the cap is enforced by contract so each invocation produces a clean audit point. Verify-owned fixes commit atomically as `fix(<slug>): verify-time fixes for <slice-slug>` when `branch-strategy` is `dedicated` or `shared`.
- **`/wf review` Step 4b's `Fix` decision now executes immediately, not later.** The triage UI (BLOCKER/HIGH individually + MED batched) is unchanged in shape, but its description is updated: `Fix` now means "spawn a sub-agent to apply the minimal patch in this run" rather than "address in next implement pass". New Step 4c is the fix dispatch — one sequential sub-agent per `Fix` finding using the same prompt shape as `/wf implement reviews` (kept identical so behavior matches across both paths). After all fix sub-agents return, review writes a consolidated artifact with `## Fix Status` and commits as `fix(<slug>): review-time fixes for <slice-slug>` (per-slice) or `fix(<slug>): review-time fixes` (slug-wide). Again: ONE round only.
- **Always `AskUserQuestion` — never silent auto-fixes.** Both stages require explicit per-issue triage before any sub-agent spawns. The cost is one more prompt per run; the gain is a clean audit trail of *which* fixes the user authorized, not just "verify patched things".
- **Adaptive routing rewrites for both stages.** The old default Option B "Fix and re-implement → `/wf implement <slug> <slice>`" is removed. New routing:
  - **`convergence: not-needed | converged`** → recommend the forward stage (review after verify; handoff after review).
  - **`convergence: escalated`** → recommend re-invoking the same stage for a second fix round (the user re-invokes; the agent does not auto-loop), with manual implement as a clearly-labeled escape hatch only.
- **Frontmatter additions to both `06-verify-<slice>.md` and `07-review-<slice>.md` (and `07-review.md`):**
  - `fix-rounds-run: <0 | 1>`
  - `convergence: <not-needed | converged | escalated>`
  - `metric-issues-found-initial` / `metric-issues-found-final` (snapshots pre- and post-loop)
  - `verify-owned-fix-commit` / `review-owned-fix-commit` (commit SHA or `null`)
  - Review-only: `metric-fix-decisions`, `metric-fix-patched`.
  - For review: `metric-findings-blocker` is now the **post-fix** count, so `/wf handoff`'s existing blocker gate (`handoff.md:48`, `handoff.md:52`) reads correctly without any handoff-side changes — patched findings are no longer counted as blockers.
- **Artifact body additions:**
  - `06-verify-<slice>.md` gains a `## Verify-Owned Fixes` section when `fix-rounds-run > 0` listing every issue with its triage decision, sub-agent outcome, and re-check result.
  - `07-review-<slice>.md` (and `07-review.md`) gains a `## Fix Status` section when `fix-rounds-run > 0`, separate from `## Triage Decisions` so the historical record (what was triaged) and the execution record (what was patched) are both visible.
- **`/wf implement <slug> [<slice>] reviews` preserved as an escape hatch.** The mode is unchanged in `implement.md:198-279`. Adaptive routing labels it as the "escalate to manual implement" option for `convergence: escalated` runs where the user prefers stage 5's sequential per-finding UI to review's batched fix dispatch.
- **Chat return contract for both stages now reports `convergence` and a one-line "what the loop did" summary** when the loop ran, so the user sees the verdict at a glance without opening the artifact.

### Decisions (recorded)

1. **One round per invocation, user re-invokes for a second.** Chosen over an unlimited loop (which would have no natural pause) and over "two rounds" (which would obscure the audit trail). Each invocation produces a clean point-in-time artifact.
2. **Always `AskUserQuestion`, never silent auto-fixes.** Including for mechanically-fixable verify failures (lint, format). The cost of the extra prompt is small; the gain is that every fix that lands has a triage decision attached.

### Files

- **Modified:** `plugins/sdlc-workflow/skills/wf/reference/verify.md` (CRITICAL discipline, Step 7.6 fix-loop section, frontmatter additions, adaptive routing, chat return contract, `Next` row, body template), `plugins/sdlc-workflow/skills/wf/reference/review.md` (CRITICAL discipline, Step 4b `Fix` semantics, new Step 4c fix-loop dispatch, frontmatter additions, adaptive routing, chat return contract, `Next` row, body template, Task Tracking), `plugins/sdlc-workflow/skills/wf/SKILL.md` (dispatcher-table descriptions for `verify` and `review`).

## [9.14.1] - 2026-05-16

### Changed

- **Docs site naming consistency.** Reverted newly-added `/wf-quick quick` references in `docs/site/` and `README.md` to `/wf-quick fix` to match the rest of the documentation. The implementation dispatcher key remains `quick` (in `skills/wf-quick/SKILL.md`, reference files, scripts, plans, and CHANGELOG history) — this is a docs-only consistency pass, not a sub-command rename. Affects: `docs/site/_build_pages.py` and the regenerated HTML pages; `README.md` rows for `/wf-quick investigate` routing.

## [9.14.0] - 2026-05-16

### Added — runtime-truth verification

Three coordinated changes that close the "verified but actually broken" gap. The leak: a slug could show "N of N slices verified" while the running artifact was visibly broken, because every slice passed its code-correctness checks (lint, types, tests, build) while its runtime-truth checks were silently optional. This version makes runtime truth a first-class concept with a forward gate, a backward re-entry path, and a shared adapter registry.

- **`/wf verify` gains a user-observable AC gate (Step 7.5, MANDATORY).** Verify now partitions each slice's acceptance criteria into `code-only` vs `user-observable` using a hybrid rule: an explicit `observable: true | false` annotation on the AC entry wins; otherwise a wording heuristic checks for visible-surface / user-action / observable-post-condition signals. For every user-observable AC, the gate requires a matching entry in the interactive-verification results from sub-agent 3. If any user-observable AC has no matching runtime evidence AND no deferral annotation, verify writes the new `result: blocked-runtime-evidence-missing` (NOT `pass`). This variant distinguishes *procedural* failure (no evidence produced) from *substantive* failure (`result: fail` — evidence shows the AC is not met), and the two route differently downstream.
- **`06-verify-<slice>.md` frontmatter additions:** new `result` variant `blocked-runtime-evidence-missing`; new fields `interactive-verification: required | deferred | not-applicable`, `interactive-verification-defer-reason`, `metric-acceptance-user-observable`, `metric-acceptance-code-only`, `adapters-used`, `bootstrap-failures`. New AC `kind` column in `## Acceptance Criteria Status` (`code-only` | `user-observable`) so a reviewer can see at a glance which criteria the gate evaluated.
- **Deferral escape hatch (`interactive-verification: deferred`).** When an AC is user-observable but genuinely cannot be probed in the current environment (no emulator, no API key, no device), the slice author annotates the verify file with `interactive-verification: deferred` and a `defer-reason`. Verify writes `result: partial` (not `pass`) and appends an entry to `00-index.md.runtime-evidence-deferrals[]` with `slice`, `reason`, `deferred-at`, and `cleared-by: null`. Verify, review, and handoff surface deferrals as soft warnings and proceed. `/wf ship` HARD-BLOCKS (new Step 6.5 in ship.md) while any deferral has `cleared-by: null`; clearing requires either a `/wf-quick probe` run that captures matching evidence or a re-run of verify in a capable environment.
- **New `/wf-quick probe <slug> [target]` — slug-mode only.** Runtime-truth verification on an already-progressed slug. Drives the running artifact, captures observable output (screenshots, stdout, response bodies, log lines), reads it, compares against AC text, and writes findings as a compressed slice (`slice-type: probe`, `compressed: true`, `origin: wf-quick/probe`). Refuses to run without an existing slug (new Step 4 in `wf-quick/SKILL.md`).
  - **Argument grammar:** `probe <slug>` (slug-wide sweep over all AC), `probe <slug> <target>` (focused), `probe <slug> --from <path>` (multi-target file), `probe <slug> --strict <target>` (filter mode), `probe <slug> --adapter <key>` (narrow to one adapter).
  - **Four-layer target resolution** — all four layers run for every non-empty target; their results compose into `target-resolution` frontmatter: (1) fuzzy-match against AC text across every slice in the slug, (2) match against slice slugs/titles, (3) extract surface hints (routes, screens, commands, endpoints), (4) treat as ad-hoc criterion if layers 1–3 produced nothing. A reader sees exactly how the target was interpreted.
  - **Focus vs filter (`--strict`)** — default focus reports findings against the target AND surfaces incidental defects observed during navigation. Opt-in filter mode uses **strict-but-archive** semantics: the main `## Findings` list contains only target-tied entries; incidentals are recorded to `probe-evidence/<descriptor>/incidental.md` with `incidental-observed-count: N` in frontmatter. User opted out of being told but the data is preserved for later review.
  - **Branch posture on mismatch** — when the working tree is on a branch that differs from the slug's `branch`, probe calls AskUserQuestion with three options: switch to slug's branch, run on current branch and record `probed-on-branch: <current>` in frontmatter, or abort. Probe is the only `/wf-quick` command that intentionally breaks the one-line ergonomic here; the explicit confirmation protects against clobbering uncommitted work, which is more likely on probe than on verify because probe runs cold.
  - **Two-phase bootstrap** — Phase 1 actively attempts the adapter's bootstrap steps (start dev server, boot emulator, build + install) with documented resolution attempts. Phase 2 (graceful fail): if any step fails after resolution, probe writes a compressed slice with `status: awaiting-environment` and a full `bootstrap-failure: { step, exit-code, output-tail, remediation }` block. The attempt is recorded; re-running probe after the user fixes the environment picks up where it left off. Multi-adapter partial failures are recorded under `partial-bootstrap-failures` and the run proceeds with the adapters that did boot.
  - **Multi-adapter — run-all by default.** Probe matches every adapter whose detection signal hits and runs them all in parallel; `adapters-used: [<key>, ...]` (plural) records what was driven. `--adapter <key>` narrows to a single matched adapter and sets `adapter-narrowed-by-user: true`.
  - **Deferral clearing.** If `runtime-evidence-deferrals` in `00-index.md` contains entries whose `slice` appears in `target-resolution.matched-slices`, probe checks whether the captured evidence satisfies the deferred AC. If yes, `cleared-by: probe-<descriptor>` is written to the index; the deferral is now cleared and ship's hard block lifts for that entry.
  - **Recommended next** — `findings-count: 0` → `/wf-meta status <slug>`; small fix → `/wf-quick quick <slug> probe-<descriptor>`; non-trivial → `/wf plan <slug> probe-<descriptor>`; `status: awaiting-environment` → re-run after applying remediation.
- **New shared runtime-adapter registry: `skills/wf/reference/runtime-adapters.md`.** Single source of truth for per-platform driving recipes. Seven adapters (web, android, ios, cli, desktop, service, notebook), each declaring Detection signals, Bootstrap (with documented resolution attempts), Drive, Observe, Tear down, Evidence layout, and Remediation hints. Verify's interactive sub-agent 3 and probe both read this file; adding a new platform is a single-section change with no edits to verify or probe. Adapters are *recipes*, not code — markdown sections the agent reads and executes.
- **`/wf-meta status` dashboard surfaces deferrals and findings.** New `Runtime` column on all three dashboard tables (Active / Blocked / Completed) with `runtime-evidence-status` values: `clean` / `deferrals: <N>` / `probe-findings: <N>` (combinable with `+`). Computed at status-render time from each workflow's `00-index.md.runtime-evidence-deferrals[]` and `compressed-slices[]` filtered for `slice-type: probe` with non-zero findings. The column is orthogonal to lifecycle status — a `Completed` workflow can still carry `deferrals: N` if it shipped via the legacy path.

### Schema additions

- `06-verify-<slice>.md` frontmatter: `result` variant `blocked-runtime-evidence-missing`, `interactive-verification`, `interactive-verification-defer-reason`, `metric-acceptance-user-observable`, `metric-acceptance-code-only`, `adapters-used`, `bootstrap-failures`. AC body `kind` column.
- `00-index.md` frontmatter: `runtime-evidence-deferrals[]` — list of `{slice, reason, deferred-at, cleared-by}` entries.
- `03-slice-probe-<descriptor>.md` (new file type): `slice-type: probe`, `compressed: true`, `origin: wf-quick/probe`, plus probe-specific fields — `probe-target`, `target-resolution`, `scope-mode`, `incidental-observed-count`, `from-file`, `adapters-used`, `adapter-narrowed-by-user`, `matched-adapters`, `partial-bootstrap-failures`, `probed-on-branch`, `bootstrap-failure`, `findings-count`, `findings-severity`.

### Non-goals (deliberate)

- Does NOT introduce a new top-level command. Probe lives inside the `/wf-quick` family.
- Does NOT platform-specialize the workflow. Every platform-specific recipe lives in `runtime-adapters.md`; verify and probe stay platform-agnostic.
- Does NOT replace `rca`. `rca` is static diagnosis of a reported symptom; `probe` is runtime detection. The wf-quick family now spans both axes (static/runtime × reported/unreported).
- Does NOT modify the slice-level pipeline. Slices still go intake → shape → slice → plan → implement → verify → review → handoff → ship → retro. Probe writes a compressed slice into an existing slug; it does not insert a new stage.
- Does NOT auto-fix. Probe reports findings; fixes go through the recommended downstream command, identically to how `rca` already routes.

### Files

- **New:** `plugins/sdlc-workflow/RUNTIME-PROBE-PLAN.md` (design plan with all six recorded decisions), `plugins/sdlc-workflow/skills/wf/reference/runtime-adapters.md`, `plugins/sdlc-workflow/skills/wf-quick/reference/probe.md`.
- **Modified:** `plugins/sdlc-workflow/skills/wf/reference/verify.md` (Step 7.5 gate, sub-agent 3 delegates to registry, schema additions, new Options E + F in adaptive routing), `plugins/sdlc-workflow/skills/wf/reference/ship.md` (Step 6.5 hard block), `plugins/sdlc-workflow/skills/wf-quick/SKILL.md` (probe registration, slug-mode-only exception, table entry, slice-type enum), `plugins/sdlc-workflow/skills/wf-quick/router-metadata.json` (probe + simplify added to dimensions; total 10), `plugins/sdlc-workflow/skills/wf-meta/reference/status.md` (Runtime column).

## [9.13.0] - 2026-05-16

### Changed (semantic pivot — BREAKING for callers that relied on old output shape)

- **`/wf-quick discover` repurposed from product-strategy gate to engineering hypothesis-test.** The old flow took a problem statement, ran competitor/user/market sub-agents over web search, and produced a `build` / `do-not-build` / `needs-further-research` recommendation. The new flow takes a **code-level hypothesis** ("the rate-limiter is implemented as a token bucket in `middleware/`", "auth flow validates JWTs before checking session state", "module M's concurrency is handled via mutexes not channels") and adjudicates it against the codebase:
  1. **Sub-agent FOR** searches for code that supports the hypothesis, with `file:line` citations.
  2. **Sub-agent AGAINST** actively tries to falsify it — looks for contradicting code, drift signals from `git log`, configuration that changes behavior.
  3. **Sub-agent COUNTER-HYPOTHESES** proposes 1–3 alternative explanations that fit the same observable behavior, ranked by plausibility.
  4. **Synthesis** produces a convergent verdict: `holds` / `partial` / `fails` / `inconclusive`, with confidence and cited evidence.
  5. **Routing** depends on verdict — `holds` requires no follow-up (proceed however you intended); `fails` may route to `/wf-quick rca <symptom>` (if the hypothesis was an explanation for bad behavior) or `/wf-docs how <topic>` (if it was a guess about how a feature works); `inconclusive` lists what runtime signal would resolve it.
- **`/wf-quick investigate` repurposed from investment-ranking gate to engineering solution-options sketcher.** The old flow surveyed a codebase domain (e.g., "checkout flow") and produced a ranked list of opportunities by ROI plus a synthesized `02-shape.md` for the top candidate. The new flow takes a **code-level problem** ("checkout p99 latency is 2s", "auth flow is brittle under concurrent writes", "we need to support multi-tenant data") and produces 2–3 genuinely distinct engineering approaches:
  1. **Sub-agent ARCHITECTURE CARTOGRAPHER** maps the relevant area — entry points, call graph, data touched, integration boundaries, architectural constraints, recent churn.
  2. **Sub-agent OPTION GENERATOR** proposes 2–3 options that differ in *mechanism* (not just surface choices); also records options considered and rejected so the reader knows what wasn't included.
  3. **Sub-agent TRADEOFF CHARACTERIZER** scores each option on effort, blast radius, reversibility, top risks (specific failure modes, not generic warnings), and operational fit.
  4. **Synthesis** writes a side-by-side comparison table; no winner is picked. The user picks.
  5. **Routing** depends on the picked option — `/wf-quick quick <option>` for small (≤3 files, no new dep, no schema change), `/wf intake <option>` for medium+. No `02-shape.md` is synthesized — the downstream command does shape on the chosen option.
- **`skills/wf-quick/SKILL.md`** — top-level `description` frontmatter and dispatcher table rows for `discover` and `investigate` reworded to describe the new semantics.
- **`.codex-generated/skills/wf-quick/SKILL.md` and `.codex-generated/skills/wf-quick/agents/openai.yaml`** — mirror descriptions updated.

### Preserved (no migration needed)

- **Dispatcher keys unchanged:** `/wf-quick discover` and `/wf-quick investigate` still route to the same reference files. Positional slug detection, slug-mode contract, and the rest of the wf-quick plumbing are untouched.
- **Slice-type tags unchanged:** compressed slices still use `slice-type: discover` and `slice-type: investigate`. Existing workflows with compressed slices of these types remain valid; the semantics of what those slices contain shifts, but the tag still identifies which sub-command produced them.
- **Artifact filenames unchanged:** standalone runs still produce `01-discover.md` / `01-investigate.md`; slug-mode runs still produce `03-slice-discover-<descriptor>.md` / `03-slice-investigate-<descriptor>.md`.
- **Frontmatter `workflow-type` unchanged:** still `discover` and `investigate`. Resume-mode in Step 0 still keys off the same value.

### Rationale

The two old commands sat awkwardly in a toolkit that is otherwise engineering-focused. `discover` answered "should we build this?" using web research; `investigate` ranked investments by ROI. Both required market or strategy context to be useful, and an engineer dropping into the codebase to test a theory or sketch approaches had no command that fit — `rca` requires a symptom, `ideate` ranks open-ended candidates rather than testing or sketching, `/wf-docs how` explains code but doesn't adjudicate or compare options, and `/wf shape` requires a workflow with an `01-intake.md` already written.

The two new shapes fill genuine gaps:

- **Hypothesis-test (`discover`)** is the read-only adjudicator that's missing — answers "is my theory about how this code works correct?" with cited evidence and explicit counter-evidence. Different from `/wf-docs how` (which explains, doesn't adjudicate) and from `rca` (which starts from a symptom, not a theory).
- **Solution-options sketcher (`investigate`)** is the pre-commitment thinking aid that's missing — answers "what are 2–3 ways I could solve this?" with grounded tradeoffs, no winner. Different from `/wf shape` (which commits to one design and requires `01-intake.md`).

The convergent/divergent output split (verdict vs. option set) is preserved from the old commands — just relocated onto engineering inputs.

### Migration

Existing artifacts on disk (`01-discover.md`, `01-investigate.md` with old structure) are not auto-migrated; their frontmatter remains valid but their body sections will not match what new runs produce. If you have an in-flight workflow of either type, finish it under the old structure (the artifact is already written) and only fresh runs adopt the new shape. The `INVESTIGATIVE-COMMANDS-PLAN.md` historical doc retains the old design as context — not rewritten.

## [9.12.0] - 2026-05-16

### Changed

- **`/wf-meta init-ship-plan` rewritten from template-instantiation to discovery → hypothesis → confirm.** The old flow asked the user to pick one of six templates up front, then asked enumerated questions whose options came from the template. The new flow does three loops:
  1. **Step 1 — Discovery pass.** Reads `.github/workflows/*.yml` *contents* (not just filenames) and parallel CI definitions (`.gitlab-ci.yml`, `.circleci/config.yml`, etc.); infra-as-code (`Dockerfile*`, `docker-compose*`, `k8s/`, `helm/`, `charts/`, `kustomize/`, `terraform/`, `pulumi/`, `cdk.json`, `serverless.yml`, `sst.config.*`, `sam.yaml`, `fly.toml`, `render.yaml`, `app.yaml`, `vercel.json`, `netlify.toml`, `railway.json`); package manifests + release tooling (`package.json` scripts and publishConfig, `pyproject.toml`, `build.gradle*`, `gradle.properties`, `Cargo.toml`, `*.csproj`, `Chart.yaml`, `mix.exs`, `composer.json`, `.releaserc*`, `release-please-config.json`, `.changeset/`, `goreleaser.yml`, `cliff.toml`, `commitlint.config.*`, `CHANGELOG.md`); runbook material (`docs/runbooks/*`, `RUNBOOK*.md`, `incidents/`, `postmortems/`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/incident*.md`); and release history (`git tag`, `git log --tags`, `gh release list --limit 5`). Builds a discovery report with per-field `confidence`, `evidence`, and `alternatives`, then surfaces it to the user as a skimmable bullet summary for free-form correction. **No AskUserQuestion yet.**
  2. **Step 2 — Hypothesis pass.** Each required-core block (A–G) is presented as a hypothesis derived from discovery: inferred value + evidence + 2–3 ranked alternatives + `Other (describe)` always present. Where `--from-template` was set and the template's seed differs from the inferred value, both are surfaced side-by-side ("Discovery suggests X; the `<template-hint>` template usually uses Y").
  3. **Step 3 — Additional contracts (open schema).** Multi-select prompt seeded by discovery, with options `data-migration` / `feature-flag-rollout` / `infrastructure-as-code` / `mobile-app-store` / `compliance-gate` / `data-pipeline` / `schema-registry` / `Other (describe)`. Each picked one becomes an entry in `additional-contracts[]` with `{ id, purpose, fields, enforced-by }`.
  4. **Step 4 (new) — Exemplar pass.** Templates are now reference reading material the agent can pull whole or per-field on user request, not control-flow branches.
- **`--from-template <kind>` semantics demoted** from a control-flow branch (old: "pick template → fill its prescribed blanks") to a hypothesis seed (new: "discovery still runs; the named template biases the proposed values where they diverge from discovery"). All six template kinds remain valid hints: `kotlin-maven-central`, `npm-public`, `pypi`, `container-image`, `server-deploy`, `library-internal`. The arg-hint is unchanged so existing muscle memory keeps working.
- **`/wf-meta amend ship-plan` (`skills/wf-meta/reference/amend.md` Step S2)** updated for the new init structure: the Block→step map collapses from 1-to-many (old: Block A → init-ship-plan steps 1–2, Block B → steps 3–5, …) to 1-to-1 (new: Block A → Step 2 Block A, Block B → Step 2 Block B, … Block G → Step 2 Block G). Additional-contract amendments edit a single entry in `additional-contracts[]` by `id`, routed through a new "Other" option in the S1 block-picker. Amend explicitly **skips Step 1 (Discovery pass)** — the existing plan is ground truth; discovery is only for fresh authoring. The S5 chat return adds `additional-contract:<id>` as a valid `block-amended` value.
- **`skills/wf-meta/SKILL.md` dispatcher table line for `init-ship-plan`** reframed to describe the discovery-led flow and the template-as-hint semantics.
- **Docs site** updated:
  - `docs/site/reference/ship-plan-schema.html` — split intro mentions the required-core vs. extensions schema. New sections document `additional-contracts[]` (with a concrete example) and `template-hint`.
  - `docs/site/how-to/author-ship-plan.html` — old "Step 1 — Pick a template" structure replaced with the discovery-led structure (review discovery report → confirm Blocks A–G → pick additional-contracts → confirm + write → commit). Pre-conditions bumped to v9.12.0.

### Added

- **`additional-contracts[]` open-schema extension** in `.ai/ship-plan.md`. Typed list, each entry `{ id: <short-id>, purpose: <one short sentence>, fields: { <key>: <value> }, enforced-by: "<command, hook, or human role>" }`. `/wf ship` ignores this list by default — consumers opt in by `id`. Use cases: per-project policies that don't fit the standard Blocks A–G (DBA review on schema migrations, feature-flag cleanup cadence, terraform-state apply policy, app-store review windows, SOC2 evidence collection, dbt orchestration cadence, schema-registry compatibility rules).
- **`template-hint` field** in `.ai/ship-plan.md` frontmatter. Records which `--from-template <kind>` value (if any) biased the authoring conversation. Informational only — no downstream code reads it. Useful for retro analysis ("did the template eventually match this project's plan?") and for telling later amend conversations which seed values to compare against.
- **`changesets` and `release-please` as first-class `version-bump-rule` values** in Block B, alongside the existing `git-cliff`, `conventional-commits`, `manual`, `fixed`. The new init pre-fills `version-bump-cmd` from the tool's conventional command (`npx changeset version`, `npx release-please release-pr`, etc.).
- **`blue-green` as a first-class `rollout-strategy` value** in Block E, alongside existing values.

### Rationale

The previous `init-ship-plan` was structured around six templates that each baked in a specific tech stack (Maven Central + Gradle + GPG; npm public registry; PyPI; container registry; Kubernetes deploy; internal library). The flow assumed the user's first decision was *"which of these six am I?"*, then filled prescribed blanks from there. Two problems with that shape:

1. **Schema coupling.** Blocks A–G and their YAML fields were the only legal shape. A project with a Liquibase migration policy, a LaunchDarkly cleanup cadence, or a terraform-state apply policy had no place to capture that — it would either be crammed into an existing block awkwardly, or dropped. The new `additional-contracts[]` extension lets projects codify these without forcing every consumer to know about them.
2. **Control-flow coupling.** Step 0 forked on `--from-template <kind>` and STOPped on an unknown kind. Steps 1–11 then used `multiSelect: false` enums with options pulled from the chosen template, so the UX was "guess which preset fits you" rather than "let's figure out how this repo actually ships". The new discovery-then-hypothesis flow inverts the dynamic: the agent does the reading, surfaces a hypothesis grounded in observable evidence, and the user reviews. Templates remain useful as exemplar text and as seed values for fields where discovery is ambiguous — they just no longer drive the conversation.

The required-core fields (every field `/wf ship` Step 0 reads) are preserved in fixed positions, so `/wf ship` does not need to change. Authoring is more thorough; consumption is unchanged.

### Migration

**No action required for existing plans.** `.ai/ship-plan.md` files authored under v9.11.0 and earlier are read unchanged by `/wf ship` — every required-core field name is preserved. The new `template-hint` and `additional-contracts[]` fields are optional; absence is equivalent to `template-hint: none` and `additional-contracts: []`.

For users authoring a *new* plan: the flow now takes a discovery pass before any questions. Expect to see a bullet summary of what the agent found in the repo before being asked anything. Correct misreads in plain English ("ignore the helm dir, it's dead code"). The total time-to-plan is similar to v9.11.0 (~15–30 min the first time), but the result is more accurate because the agent is grounding each block in observable evidence rather than asking you to map your project onto a preset.

For users amending an existing plan: the block-picker now offers an "Other" option that routes to `E`, `F`, `G`, or any `additional-contracts[].id`. Amend skips discovery — the existing plan is ground truth.

### Schema & validator impact

**Zero validator change.** `tests/verify_frontmatter.py` and `tests/frontmatter.schema.json` do not validate the ship-plan (they only validate workflow stage artifacts). The two new fields (`template-hint`, `additional-contracts[]`) live in `.ai/ship-plan.md`, which is project-level and outside the validator's scope.

### Notes

- The block letters A–G are preserved deliberately so `/wf-meta amend ship-plan`'s S1 block-picker keeps its short labels. The 1-to-1 Block→step mapping in the new init is a happy simplification of the old 1-to-many mapping that emerged from template-driven step grouping.
- The `additional-contracts[]` entries are intentionally open-schema. There is no validator for `fields:` content — that is by design. The list is a *codification surface* for project-specific policies, not a normalized schema. Consumers that read these by `id` are responsible for validating the shape they need.
- The discovery pass is read-only. It does not execute any of the commands it discovers (no `gradle publish --dry-run`, no `terraform plan`, no `kubectl apply --dry-run`). Side effects only happen in `/wf ship` runs.



### Changed

- **`/wf-meta status` (no-arg, Dashboard Mode)** now enumerates workflows from `.ai/workflows/INDEX.md` when present. Per-workflow `00-index.md` reads still happen — INDEX.md only carries 5 of the 14 fields the dashboard renders, so Dashboard Mode shape is unchanged. The behavioral delta is **correctness, not performance**: when a registry row points at a deleted directory, status surfaces a one-line *"Skipped: `<slug>` (registry row present, directory missing — run `/wf-meta sync` to reconcile)"* note instead of erroring on the missing read. When INDEX.md is absent, status falls back to the prior glob behavior and appends a one-line tip suggesting `/wf-meta sync`. (`skills/wf-meta/reference/status.md` Step 0.)
- **`/wf-meta resume` and `/wf-meta next` (no-arg picker)** now source the multi-workflow disambiguation prompt from INDEX.md when present — `slug — status — updated-at` per row, filtered to non-closed. The picker no longer surfaces `current-stage` in the list (INDEX.md doesn't carry it); pass an explicit slug if you need the full per-workflow read first. Fallback to glob when INDEX.md is absent, same tip line as status. (`skills/wf-meta/reference/resume.md` Step 0 item 1; `skills/wf-meta/reference/next.md` Step 0 items 1-2.)
- **`/wf intake` gained registry collision detection** at `skills/wf/reference/intake.md` Step 0 sub-step 2 (renumbering the prior disk check to sub-step 3). After the slug is derived, intake greps INDEX.md and routes via `AskUserQuestion`: (a) row exists + status ≠ `closed` → 4-option prompt (resume / amend / pick new slug / cancel); (b) row exists + status = `closed` → 3-option prompt (pick new slug / reopen via resume / cancel) — slug reuse against a closed workflow is **disallowed** to preserve the slug-stability invariant; (c) no row → continue. INDEX.md missing → skip the check entirely (disk-level collision in sub-step 3 still gates), append the same `/wf-meta sync` tip.

### Added

- **Centralized fuzzy-suggest in `skills/wf/SKILL.md` Step 0.5** for unknown slug args. Runs after sub-command resolution, before reference dispatch. Applies to the 13 sub-commands that consume an existing slug (everything except `intake`; also excludes `profile` because its first positional arg is `<area>`, not a slug). On a slug miss against INDEX.md, runs a Levenshtein-1 + substring match against every indexed slug (closed rows included — a real-but-closed slug is still a useful suggestion). On a best match, STOP with *"Unknown slug `<typo>`. Did you mean `<best-match>`<` (closed)` if applicable>? Retry: `/wf <sub-command> <best-match> <remaining args>` (or run `/wf-meta status` to list all workflows.)"*. **Purely advisory — never auto-corrects**; the user must re-invoke with the corrected slug. INDEX.md missing → Step 0.5 is skipped; the reference's per-stage slug resolution still runs.

### Rationale

v9.10.0 introduced INDEX.md but wired only `/wf-quick` to read it. The registry's value compounds with every reader: the same one-file lookup that powers positional slug detection on `/wf-quick` also collapses the "which workflows exist?" question for status/resume/next, gives intake a cheap pre-write collision check, and provides the candidate set for typo-suggestion across the lifecycle dispatcher. None of these reads were possible before INDEX.md existed; together they retire three rough edges (silent enumeration over deleted dirs, accidental duplicate workflows, opaque "workflow not found" errors on typos) for the cost of one new dispatcher step and three reference edits. The fallback paths preserve v9.10.0's invariant that the plugin works on a repo that has never run `/wf-meta sync`.

### Migration

No action required. Existing workflows are unaffected. Running `/wf-meta sync` is still the recommended one-time bootstrap step on existing repos — without it, the four new read paths fall back to the v9.10.0 behavior (glob + no collision check + no fuzzy-suggest) and append a one-line tip.

For users who had typo'd-slug muscle memory: `/wf plan paymnt-retry` will now STOP with a suggestion instead of falling through to the reference's "no workflow found" error. Same blocking behavior, different surface — read the suggestion and re-invoke.

For users with closed workflows whose slugs they wanted to reuse for a new intake: this is now blocked. Use `/wf-meta resume <slug>` to reopen the closed workflow (its artifacts stay intact) or pick a new slug for the new intake. The slug-stability invariant — every artifact in a workflow shares a slug that never changes — was always documented as load-bearing; this change enforces it at the front door rather than relying on convention.

### Schema & validator impact

**Zero schema migration.** INDEX.md is unchanged from v9.10.0 — same tab-separated `slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at` format. New reads add no fields to the registry. The frontmatter JSON schema (`tests/frontmatter.schema.json`) and the deep verifier (`tests/verify_frontmatter.py`) are unchanged.

### Notes

- The `current-stage` loss in the resume/next picker is intentional: INDEX.md was designed in v9.10.0 to be cheap, not exhaustive. Adding `current-stage` to INDEX.md would inflate the registry writes (every stage transition touches it) and lose the "one cheap read for slug enumeration" property that makes positional slug detection fast. Users who need `current-stage` in the picker should pass an explicit slug, which triggers a full per-workflow read.
- Closed workflows are still retained in INDEX.md (v9.10.0 design). They appear as `(closed)` in fuzzy-suggest's "Did you mean…" output, are blocked in intake collision detection, but remain reachable via `/wf-meta resume <slug>` for explicit reopening.
- Step 0.5 is centralized in `wf/SKILL.md` so the 13 lifecycle references don't each duplicate the fuzzy-match logic. The exclusion list (`intake`, `profile`) lives next to the 14-key dispatch table — keep them in sync when adding new sub-commands.
- The frontmatter verifier is **both** a standalone test (`tests/verify_frontmatter.py`, runnable manually with `--self-test` / `--quiet`) and a PostToolUse hook (`hooks/scripts/verify-workflow-postwrite.sh`, fires on every Write/Edit to `.ai/{workflows,simplify,profiles}/*.md`). The two share the same engine — the hook is a thin wrapper that invokes the verifier with `--quiet` and bubbles non-zero exits back to Claude as blocking errors. The pre-write `validate-workflow-write.sh` is a separate, shallower gate. Documented here because the question came up during planning.

## [9.10.0] - 2026-05-16

### Changed

- **`/wf-quick` slug detection is now no-flag positional.** v9.9.0's `--slug <existing-slug>` flag is removed. The dispatcher (`skills/wf-quick/SKILL.md` Step 0) now resolves slug-mode purely by looking at the first positional token after the sub-command: if that token exactly matches a non-closed slug in the new global registry `.ai/workflows/INDEX.md`, the sub-command attaches as a compressed slice on that workflow; otherwise it runs standalone. No flag, no prompt, no branch sniffing.
- **9 reference files** (`skills/wf-quick/reference/*.md`) updated to drop `--slug` language. The slug-mode section in each reference now opens with *"If `/wf-quick`'s dispatcher selected **slug-mode** in Step 0 (the first argument after the sub-command matched a non-closed slug in `.ai/workflows/INDEX.md`), the *Step 1 — Slug-mode contract* … overrides the standalone instructions below."* Inline routing examples switched from `--slug <slug>` to positional (`<slug>` as first arg). The closing line was updated to *"If slug-mode was not selected (first argument was not a known slug, or `INDEX.md` did not exist), ignore this section and proceed standalone per the instructions below."*
- **`skills/wf-meta/reference/sync.md` gains a new `Step -1 — Maintain the global workflow registry`** that runs unconditionally on every invocation, before Step 0. It bootstraps `.ai/workflows/INDEX.md` if missing (writes a fresh file from a glob+frontmatter scan of `.ai/workflows/*/00-index.md`) and refreshes it on every subsequent run (rewrites the sorted set, reports added/removed/updated counts, drops stale rows whose directory has been deleted). Step 7 (workflow index touch) was extended to also rewrite the `updated-at` column on the target slug's row so the registry stays in step with the `00-index.md` it just bumped.
- **`skills/wf-quick/SKILL.md` Step 1 slug-mode contract gained a step 6** — after the sub-command writes the slice file and updates `00-index.md`, it rewrites the `updated-at` column on the target slug's row in `.ai/workflows/INDEX.md`. Status/workflow-type/branch are not touched (slug-mode is additive — the parent workflow's lifecycle position is unchanged). If the row is missing (registry drift), the sub-command appends a new row using the values just read from `00-index.md`; `/wf-meta sync` reconciles sort order on the next run.
- **`hooks/scripts/validate-workflow-write.sh`** gained a non-blocking advisory for `00-index.md` writes — if `.ai/workflows/INDEX.md` is missing, or if there's no row for this slug, the hook emits a `systemMessage` suggesting `/wf-meta sync`. Per user choice, this is **warn-only**; the write still succeeds. Stage transitions (status/branch drift) are NOT warned about — that would be noise. `/wf-meta sync` is the canonical reconciler.

### Added

- **`.ai/workflows/INDEX.md`** — global workflow registry. New file (created on first `/wf-meta sync` invocation). Single header comment, then one row per workflow, tab-separated columns: `slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at`. Sorted alphabetically by slug. Closed workflows are retained (status column shows `closed`; positional slug detection skips them, but a slug match still triggers an "append a slice to a closed workflow?" confirmation). Format is documented in `skills/wf-meta/reference/sync.md`'s new Step -1.

### Removed

- **`--slug` flag on `/wf-quick`.** No backward-compatibility shim; the flag is gone. Slug-mode is now positional-only.

### Rationale

The `--slug` flag was friction. The common case — "I'm working on a workflow, run a quick rca/ideate/refactor against it" — should not require remembering a flag name and typing it. A global single-line-per-workflow registry collapses the "which slugs exist?" question into a single grep-able file, which means the dispatcher can resolve slug-mode in one anchored regex (`^<token>\t`) without scanning every `00-index.md` in the repo. The format choice (tab-separated, one row per workflow, slug as the first column) is deliberately the cheapest possible lookup substrate: O(file-size) string scan, no parser load, no regex backtracking. The disambiguator between "the token is a slug" and "the token is the start of a description" exploits a strong invariant — workflow slugs are kebab-case identifiers, and natural-language descriptions almost never *start* with a kebab-case token that matches an existing workflow. For the rare collision (slug `metrics`, description starting with `metrics ...`), quote-escape the description (`/wf-quick rca "metrics dashboard broken"`) — the resulting single token won't match any slug and routes standalone. This is the same escape hatch shells use; it's universal and explicit.

### Schema & validator impact

**Zero schema migration.** `INDEX.md` is intentionally NOT a YAML-fronted workflow artifact — it's a registry, not a stage file. The validator (`hooks/scripts/validate-workflow-write.sh`) skips it via the existing `.ai/workflows/*.md` filename pattern only matching files directly under the slug directory; INDEX.md sits at `.ai/workflows/INDEX.md` (a sibling of slug dirs), so the validator's path filter naturally excludes it. The deep validator (`tests/verify_frontmatter.py`) only walks `.md` files with frontmatter, and INDEX.md has none. The frontmatter JSON schema is unchanged.

### Migration

For users on v9.9.0: existing `--slug <existing-slug>` invocations stop working. Replace with positional syntax — `/wf-quick rca --slug my-feature "incident"` becomes `/wf-quick rca my-feature "incident"`. Run `/wf-meta sync` once to bootstrap `.ai/workflows/INDEX.md`; subsequent runs refresh it automatically. If you forget to run sync, `/wf-quick` falls back to standalone mode (a slug that isn't in the registry is treated as the start of the description) — a hint in the chat return suggests running sync.

For users on ≤v9.8.0: the slug-mode feature is new to you (v9.9.0 introduced it, v9.10.0 reshaped the surface). Read the `Slug-mode` section in `skills/wf-quick/SKILL.md` Step 1.

### Notes

- The registry is intentionally a flat denormalized cache of fields that already live on each `00-index.md`. The single source of truth for status/branch/type/updated-at is still the workflow's own index file — the registry is just a fast lookup structure. `/wf-meta sync` reconciles drift in either direction.
- `compressed-slices` array on `00-index.md` (introduced in v9.9.0) is unchanged in v9.10.0. The mechanism for marking slug-mode writes is the same; only the user-side interface (positional vs flag) changed.
- The hook warning is non-blocking. If you'd rather have hard invariants (block writes when INDEX.md is stale), open an issue — the current `warn` policy is the user-chosen default for v9.10.0.
- `.codex-plugin/plugin.json` bumped to `9.10.0-codex.1` — the no-flag positional surface is a dispatcher-side change, not specific to Claude Code, so the Codex generation tracks the main version this time (unlike v9.9.0, which was Claude-only).

## [9.9.0] - 2026-05-13

### Added

- **`--slug <existing-slug>` flag on all 9 `/wf-quick` sub-commands.** Optional global flag, parsed by the dispatcher (`skills/wf-quick/SKILL.md` Step 0) before sub-command resolution. When set, the sub-command attaches to an existing workflow as a single **compressed slice** instead of starting a new standalone workflow. Supported uniformly on every sub-command: `quick`, `rca`, `investigate`, `discover`, `hotfix`, `update-deps`, `refactor`, `ideate`, `simplify`.

### Changed

- **Slug-mode contract (new `Step 1` in `skills/wf-quick/SKILL.md`).** Defines what slug-mode does in one place — slice-slug derivation (`<sub>-<descriptor>` with collision suffix `-2`, `-3`), the single artifact at `.ai/workflows/<slug>/03-slice-<sub>-<descriptor>.md`, the frontmatter shape (`type: slice` plus `slice-type: <sub>`, `compressed: true`, `origin: wf-quick/<sub>`, `stage-number: 3`, `status: defined`), the body contract (same sections the standalone reference would have produced, under a `# Compressed Slice: <sub>` heading with a one-line provenance preamble), and the additive index updates (a new `00-index.md.compressed-slices` array, plus a conditional append to `03-slice.md.slices` if the slice index already exists). The existing `# Step 1 — Execute` is renumbered to `# Step 2 — Execute` and now carries an explicit override clause: in slug-mode the slug-mode contract overrides any reference instruction that would create a new workflow dir, write a new top-level `00-index.md`, create a branch, or write `01-<sub>.md`.
- **9 reference files** (`skills/wf-quick/reference/*.md`) each gained an identical-shape `# Slug-mode (read before proceeding)` section immediately after the `You are running …` line, listing the redirect rules for that specific sub-command with `<sub>` substituted in. Each section ends with *"If no `--slug` flag was set, ignore this section and proceed standalone per the instructions below."* The standalone instructions below the new section are unchanged — only the output destination and index bookkeeping change in slug-mode.
- **`simplify` is special-cased** in slug-mode: it writes the compressed slice into `.ai/workflows/<slug>/` instead of `.ai/simplify/<run-id>.md`. The `simplify-run` frontmatter fields (`findings-total`, `findings-reuse`, etc.) do NOT carry over — they belong to the standalone `simplify-run` artifact type. The compressed slice is a `slice` artifact; the same numbers are reported in the body instead. Its routing assignments are emitted with `--slug <X>` pre-applied so the user can copy them straight into the next command.
- **Plugin description** in `plugins/sdlc-workflow/.claude-plugin/plugin.json` and the marketplace entry in `.claude-plugin/marketplace.json` mention slug-mode at the top level.

### Rationale

`/wf-quick` sub-commands were originally orthogonal *new-workflow* entry points — each one created its own `.ai/workflows/<slug>/` directory, branch, and root artifact. That model is right for greenfield invocations but wrong for the common follow-up case: a user is mid-workflow on slug `X`, hits a question that calls for an rca or an ideate or a refactor pass, and either has to spin up a parallel workflow (cluttering `.ai/workflows/`, splitting attention, fragmenting status) or freehand the work outside the workflow system (losing artifact discipline and review-pipeline integration). The `--slug` flag closes that gap by making every sub-command **dual-mode** — still a fresh workflow if invoked bare, now also a compressed slice on an existing workflow if `--slug X` is passed. The slice format keeps the artifact discoverable by existing slice-aware tooling (`/wf plan`, `/wf-meta status`, slice-index master) while the new `slice-type` + `compressed: true` frontmatter fields and the `00-index.md.compressed-slices` array let downstream stages distinguish compressed slices from formally-planned ones (so they don't try to push an rca-shaped or ideate-shaped slice through plan→implement→verify automatically — those produce findings/recommendations, not implementation work; whereas quick/hotfix/refactor/update-deps slices carry their own embedded plan that `/wf implement` can read directly without an additional `04-plan-<slice>.md`).

### Schema & validator impact

**Zero schema migration.** The frontmatter JSON schema (`tests/frontmatter.schema.json`) already permits additional properties on `sliceFrontmatter`, `sliceIndexFrontmatter.slices[]` items, and `indexFrontmatter`, so the new `slice-type`, `compressed`, `origin`, and top-level `compressed-slices` fields validate cleanly without any schema changes. The pre-write validator (`hooks/scripts/validate-workflow-write.sh`) only enforces `schema`/`type`/`slug` and slug-matches-directory — compressed slices satisfy all three trivially (slug matches the parent workflow dir; type is `slice`). The deep validator (`tests/verify_frontmatter.py`) discriminates on `type:`, so compressed slices validate against the same `sliceFrontmatter` branch as ordinary slices and accept the extra fields as additional properties.

### Migration

No action required for existing workflows. Slug-mode is purely additive — running `/wf-quick rca "<incident>"` still creates a fresh standalone workflow exactly as before. Pass `--slug <X>` to attach to existing workflow `X` instead. Existing `00-index.md` files without a `compressed-slices` array are unchanged; the array is created lazily on first slug-mode write.

### Notes

- The `compressed-slices` array on `00-index.md` is created lazily on first slug-mode write. Workflows that never receive a compressed slice keep their existing index shape unchanged.
- The slice-index master `03-slice.md` is updated **only if it already exists**. Compressed-slice writes do NOT synthesize a slice index for workflows that haven't reached the slice stage — the `compressed-slices` entry on `00-index.md` is the canonical record in that case. This keeps slug-mode usable from any stage of the parent workflow (intake, shape, plan, implement, verify, …) without forcing premature slice-index synthesis.
- `current-stage`, `selected-slice`, `status`, `branch`, `progress`, and `best-first-slice` are never mutated by slug-mode. Compressed slices are additive context, not lifecycle advancement; the parent workflow's main lifecycle proceeds independently.
- Branch policy in slug-mode: no `git checkout -b`, no branch switching. A current-branch ≠ `00-index.md.branch` mismatch surfaces as a one-line warning but does not block the write — the slice file lives in the workflow dir, not on a specific branch.
- Closed workflows (`status: closed`) trigger a confirmation prompt before slug-mode proceeds.
- `.codex-plugin/plugin.json` is untouched (still `9.0.0-codex.1`) — slug-mode is a Claude-Code-specific addition to the wf-quick router that the Codex side does not run.

## [9.8.0] - 2026-05-12

### Removed

- **`SessionStart` hook (`hooks/scripts/workflow-discovery.sh`).** No longer fires on session start. Previously emitted a `systemMessage` block listing every active workflow's slug, title, stage, slice, branch (with WRONG BRANCH warnings), PR URL, next command, and open questions. With multiple in-flight workflows this could inject 1–2 KB of context every session, even for workflows unrelated to the current branch.
- **`PreCompact` hook (`hooks/scripts/pre-compact.sh`).** No longer fires before context compaction. Previously emitted a `CRITICAL — Active SDLC workflow state. Preserve ALL of the following...` instruction block telling the compaction model what workflow fields to retain in the summary.

### Changed

- **`hooks.json` description.** Updated to reflect the remaining surface: `"sdlc-workflow hooks: workflow file write validation and post-write auto-stage / verification"`. The `PreToolUse(Write)` validator and `PostToolUse(Write|Edit)` auto-stage + verifier hooks are unchanged — those are authoritative on-write policy gates, not context injectors, and don't suffer from the same pollution problem.

### Rationale

The two removed hooks shared a failure mode: they injected workflow state into the model's context unconditionally (SessionStart) or whenever compaction ran (PreCompact), regardless of whether the current session was actually working on those workflows. On any branch with `.ai/workflows/` populated, every session paid the token cost of every in-flight workflow's full status block — slugs the user wasn't touching, branches they weren't on, PRs that weren't theirs to ship. The PreCompact preservation instructions compounded the same problem post-compaction: the summarizer was told to keep state the user no longer cared about, anchoring the model to stale workflows after compaction. The `/wf-meta status` and `/wf-meta resume` commands already surface this state on demand when it's actually needed, which is the right model — pull, not push.

### Migration

If you relied on the SessionStart hook to remind you which workflow a branch was tied to, run `/wf-meta status <slug>` or `/wf-meta resume <slug>` explicitly when resuming work. The workflow index files (`.ai/workflows/<slug>/00-index.md`) remain the source of truth; nothing about workflow durability changes — only the auto-injection into context.

If you relied on the PreCompact hook to keep workflow state alive across compactions, the affected stage's Step 0 Orient still re-reads the workflow artifacts from disk on the next stage invocation. The hook was a belt-and-braces optimization over that mechanism; removing it shifts the cost from "every compaction" to "one re-read per stage transition," which is the strictly cheaper choice.

### Notes

- The two script files (`hooks/scripts/workflow-discovery.sh` and `hooks/scripts/pre-compact.sh`) are intentionally left on disk for now. They can be re-wired by adding the corresponding `SessionStart`/`PreCompact` entries back to `hooks.json` without restoring deleted code. Future minor versions may delete them outright once the no-injection model has proven out.
- `.claude-plugin/marketplace.json` `version` pin bumped to `9.8.0` to match `plugin.json` and trigger a cache re-resolution on next session.
- `.codex-plugin/plugin.json` is untouched (still `9.0.0-codex.1`) — Codex doesn't run Claude Code hooks, so this change is Claude-Code-specific.

## [9.7.0] - 2026-05-11

### Added

- **Frontmatter JSON Schema (`tests/frontmatter.schema.json`).** Draft 2020-12 schema covering every artifact `type:` produced by the plugin — 30+ branches under a top-level `allOf: [base, oneOf]` keyed off `type`. Captures per-type required fields, enum constraints (`status`, `verdict`, `branch-strategy`, `go-nogo`, `handoff-mode`, `review-scope`, `complexity`, `result`, etc.), ISO-8601 date pattern, run-id format, and nested-object shapes for `slices[]`, `augmentations[]`, `post-publish-checks[]`, and `runs[]`. Accepts the documented template/hook aliases (`slice` vs `slice-index`, `plan` vs `plan-index`, `design-brief` vs `craft`).
- **Python verifier (`tests/verify_frontmatter.py`).** Walks `.ai/workflows/`, `.ai/simplify/`, `.ai/profiles/` (or accepts explicit paths), parses each `.md` file's frontmatter, and validates it against the schema. Uses a **type-discriminator** strategy: looks up the matching `oneOf` branch by `type:` and validates against that branch alone, so errors point at the actual offending field (`/commitlint-status: 'maybe' is not one of [...]`) instead of the noisy oneOf cascade. Graceful degradation when `PyYAML` or `jsonschema` aren't installed (falls back to base-field + filename-vs-type checks). `--self-test` flag runs 5 embedded fixtures. `--quiet` suppresses success output for hook integration.
- **PostToolUse deep-validation hook (`hooks/scripts/verify-workflow-postwrite.sh`).** Runs after every `Write` and `Edit`, scoped via path filter to `.ai/{workflows,simplify,profiles}/*.md`. Invokes the verifier with `--quiet`; silent on success, exits 2 with stderr-fed errors on failure so Claude can self-correct. Fail-opens with a `systemMessage` if Python or the verifier/schema are missing. Registered as a second hook entry under the existing `PostToolUse: Write|Edit` matcher beside `auto-stage.sh` (15s timeout vs auto-stage's 5s — extra headroom for Python cold start on slow filesystems).

### Changed

- **Two-tier validation pipeline.** The existing PreToolUse `validate-workflow-write.sh` remains the fast shallow gate (schema/type/slug presence + filename pattern, milliseconds, blocks bad writes before they hit disk). The new PostToolUse verifier is the deep audit (full enum, format, and required-field checks against the schema). The pre-write hook still bails on `Edit` because it only sees `old_string`/`new_string`; the post-write hook fills that gap by reading the file from disk after the write completes.

### Rationale

The pre-write hook documented its limitations explicitly in its error message: "Expected values: index, intake, shape, slice, plan, implement, verify, review, handoff, ship, ship-run, ship-runs-index, retro, design, design-brief, critique, audit, sync-report, resume, skip, amendment, simplify-run." That list is a hand-maintained allowlist with no per-type field validation — a workflow file could pass the hook with `type: handoff` and still have `commitlint-status: maybe` or `readiness-verdict: yolo` quietly accepted, only to break a downstream `/wf ship` step that reads those fields. The schema captures the *full* contract that templates emit and downstream stages consume; the verifier and hook enforce that contract at write time, giving authors (and Claude) immediate feedback instead of a confusing failure three stages later.

### Notes

- Schema is also usable standalone for CI: `python plugins/sdlc-workflow/tests/verify_frontmatter.py --root .` validates an entire workflow tree.
- The verifier is intentionally located under `tests/` rather than `hooks/scripts/` because it serves a dual role (CI/manual audit + hook helper). The post-write hook references it via `${CLAUDE_PLUGIN_ROOT}/tests/verify_frontmatter.py`.
- No existing artifact templates were modified — every required field already aligns with what the schema enforces.

## [9.6.0] - 2026-05-11

### Added

- **`/wf-quick simplify` entrypoint.** A review-and-route triage utility, the ninth `/wf-quick` sub-command. Three parallel sub-agents (Code Reuse, Code Quality, Efficiency) review one of four scopes, classify each accepted finding, and route it to the appropriate downstream command. **Simplify routes — it never writes code.** Scopes:
  - `branch` (default) — `git diff <base>...HEAD` on the current branch
  - `commit <sha-or-range>` — single commit or range
  - `plan <slug> <slice>` — the plan's prose + structure (every accepted finding gets `route-amend-plan` with an accompanying proposed-delta block)
  - `codebase [<path>]` — directory subtree (capped ~500 files)
- **Routing matrix.** Per-finding assignment to one of: `route-fix` (→ `/wf-quick fix`), `route-refactor` (→ `/wf-quick refactor`), `route-intake` (→ `/wf intake`), `route-amend-plan` (→ `/wf-meta amend <slug> <slice>`), `route-amend-shape` (→ `/wf-meta amend <slug>`), `route-verify` (→ `/wf verify`), `route-add-test` (→ `/wf-quick fix "add test for X"`), `route-docs` (→ `/wf-docs <primitive>`), `route-handoff-config` (edit `00-index.md`), or `route-noop`. Bias is toward the smallest scope that addresses the finding.
- **Run artifact at `.ai/simplify/<run-id>.md`** (project-level, not under `.ai/workflows/`). Captures findings per agent, per-finding routing assignment, and (for plan scope) proposed deltas. The chat return is a copy-pasteable queue of suggested invocations sorted by route priority.

### Changed

- **`wf-quick` router** now has 9 sub-commands (was 8). SKILL.md argument-hint and known-keys list updated.
- **Pre-write validator type hint** extended with `simplify-run`. The simplify run files bypass the validator anyway (live at `.ai/simplify/` not `.ai/workflows/`), but the hint stays consistent for any future path changes.

### Rationale

The plugin had `/wf review` for stage-7 lifecycle review (31 dimensions in parallel) and `/wf-quick refactor` for behaviour-preserving restructure, but no compact "look at recent work and decide what shape of follow-up it deserves" entrypoint scoped to a diff, a commit, or a plan. The Claude Code harness ships a bundled `simplify` skill that's three parallel agents over a diff, but it *applies fixes directly* — which would bypass the plugin's planning, verification, and review disciplines. The plugin's `simplify` keeps the agent rubrics but realigns the action to routing-only: each finding gets the right level of downstream process (a trivial typo through `/wf-quick fix`, a structural change through `/wf intake`, a spec issue through `/wf-meta amend`).

### Provenance + deliberate divergence

Adapted from the Claude Code bundled `simplify` skill (`.scratch/claude-code/src/skills/bundled/simplify.ts`). Differences:

| | Upstream | Plugin |
|---|---|---|
| Agent rubrics | Reuse, Quality, Efficiency | Same — kept verbatim |
| Dispatch | Three parallel agents | Same |
| Scope | git diff only | Four scopes (branch, commit, plan, codebase) |
| Action after findings | **Apply fixes directly** | **Route findings to downstream commands; never write code** |
| Output | Ephemeral chat summary | `.ai/simplify/<run-id>.md` artifact + suggested-invocation queue |

The action divergence is intentional and load-bearing — every command in this plugin operates as an orchestrator, not a problem-solver. Letting simplify silently rewrite code would create a back-door path that bypasses review, verify, and planning.

### Codex shadow tree

Regenerated. The new `simplify` reference at `skills/wf-quick/reference/simplify.md` propagates verbatim because the generator mirrors the directory.

## [9.5.0] - 2026-05-10

Handoff and ship overhaul — landed as four conceptual PRs in one branch per `plugins/sdlc-workflow/HANDOFF-SHIP-OVERHAUL-PLAN.md`.

### Added

- **Handoff PR-readiness block (`skills/wf/reference/handoff.md`).** Stage 8 now runs five new steps between Diátaxis doc generation and artifact write, conditional on `branch-strategy: dedicated`:
  - **T3.5 — Commitlint pass.** Reads `.commitlintrc*` (silent skip if absent). Runs `commitlint --from <merge-base> --to HEAD`. `BREAKING CHANGE` / `!:` commits flag a `warn` rather than block, with the breaking commit list surfaced in Reviewer Focus Areas.
  - **T3.6 — Public-surface drift check.** Driven by the new `public-surface:` block in `00-index.md` (`kind`, `regen-cmd`, `files`). Pattern fits Kotlin `.api` dump, OpenAPI, GraphQL SDL, exported TS `.d.ts`, SQL DDL. Auto-commits regenerated surface mirrors; blocks if a regen disagrees with already-staged surface ("drift-without-regen").
  - **T3.7 — Doc-mirror regen.** Driven by `docs-mirror:` block in `00-index.md` (`regen-cmd`, `source-paths`, `mirror-paths`). Auto-commits `docs: regenerate doc mirrors` when generated docs drift from source.
  - **T5.1 — PR comment triage loop (bounded 5 iterations).** Fetches unresolved review threads via `gh api graphql`, classifies comments 🔴/🟡/🟢 by author and content (default bots: `coderabbitai`, `greptile-dev`, `gemini-code-assist`, `chatgpt-codex-connector[bot]`; override via `review-bots:` in `00-index.md`). 🔴 blockers route to `/wf implement <slug> <slice> reviews` and get `resolveReviewThread`-mutated after the fix commits. 🟡 suggestions are batched into a single AskUserQuestion multi-select for apply/defer/decline. 🟢 informational are noted only. Loop bound prevents bot ping-pong.
  - **T5.2 — Rebase onto base + `--force-with-lease`.** Single retry on lease failure (handles the race where T5.1 pushed mid-loop). Conflicts route to `/wf implement <slug> <slice>`.
  - **T5.3 — Live PR readiness check.** `gh pr view --json reviewDecision,statusCheckRollup,mergeable,mergeStateStatus` populates `live-review-decision`, `live-checks-failing`, `live-checks-pending`. Combined with the above into a single `readiness-verdict: ready | awaiting-input | blocked` that downstream ship gates on.
- **Ship plan (`/wf-meta init-ship-plan`).** One-time project-level setup that authors `.ai/ship-plan.md` at the **repo root** (not under `.ai/workflows/`). Captures seven orthogonal blocks: ship-meaning, versioning contract, CI/CD contract, post-publish verification, rollout/rollback, recovery playbooks, announcements. Pre-seeded via `--from-template <kind>` for six common shapes:
  - `kotlin-maven-central` — Maven Central + Sonatype + GPG signing, with signing-failure + token-401 playbooks.
  - `npm-public` — npm registry with provenance, fast propagation window.
  - `pypi` — PyPI Trusted Publisher (OIDC) or API token, version-already-uploaded playbook.
  - `container-image` — GHCR/ECR/Docker Hub multi-arch with cosign.
  - `server-deploy` — Kubernetes rolling deploy with canary stages, k8s-rollout-status check, migration-failure playbook.
  - `library-internal` — internal registry, merge-on-main = released.
- **Plan amendment via `/wf-meta amend ship-plan`** edits one block (A–G) of an existing plan, re-runs only that block's questions from the init flow, and bumps `plan-version`. Runs subsequent to an amendment stamp the new `plan-version-at-run`.
- **Per-release ship runs (`09-ship-run-<run-id>.md`).** Accumulating per release, never overwritten. `run-id` is UTC compact ISO-8601 (`YYYYMMDDTHHMMZ`). Indexed by `09-ship-runs.md` (lightweight per-workflow run index, body regenerated from frontmatter on every run).

### Changed

- **`/wf ship <slug>` rewritten (`skills/wf/reference/ship.md`).** Now reads `.ai/ship-plan.md` and refuses to start unless `08-handoff.md` has `readiness-verdict: ready`. Walks a **13-step replayable sequence**: orient → pre-flight → publish dry-run → rollout questions → freshness delta → go/no-go → merge → tag+release → release-workflow watch → post-publish polling → post-release version bump → update run index → write run artifact. **Each step is independently re-runnable** — pre-flight is a no-op if the version is already applied, merge is a no-op if the PR is merged, tag is a no-op if the tag exists, polling resumes from the last `pending` check.
- **Resume semantics.** A prior `09-ship-run-*.md` with `status: awaiting-input` is detected at orient. The user can resume from the failed step, start fresh, or mark the prior run failed.
- **Freshness research as delta-only.** Step 4 diffs against the last successful run's freshness research, re-running sub-agents only for platforms/deps/CI files that changed since.
- **Recovery playbooks fire on release-workflow failure.** Step 8 matches the failure log against `plan.recovery-playbooks[].triggers[]` (regex) and presents each step via AskUserQuestion for human-confirmed execution. Captures `recovery-actions-taken:` in the run.
- **`wf-meta` router** gained an 11th known key (`init-ship-plan`). Argument hint updated.
- **`08-handoff.md` frontmatter** gained `commitlint-status`, `public-surface-drift`, `docs-mirror-status`, `triage-iterations`, `triage-fixes-applied`, `triage-fixes-skipped`, `triage-deferred-thread-ids`, `has-deferred-comments`, `rebase-status`, `rebase-onto-sha`, `live-review-decision`, `live-checks-failing`, `live-checks-pending`, `readiness-verdict`.
- **Pre-write validator type hint** expanded to include `ship-run`, `ship-runs-index`. (`ship-plan` bypasses the validator — it lives at repo root, not `.ai/workflows/`.)

### Backwards compatibility

- Workflows with an existing legacy `09-ship.md` keep working. **Reading it is fine; writing it is gone.** This version of `wf-ship` never writes `09-ship.md`. To migrate, author a plan via `/wf-meta init-ship-plan`, then run `/wf ship <slug>` for the next release; the legacy file stays as historical record.
- The handoff PR-readiness block is **fully opt-in per project**. With no `public-surface:` / `docs-mirror:` / `review-bots:` keys in `00-index.md` and no commitlint config in the repo, the new steps skip silently and handoff behaves indistinguishably from v9.2.0 — except T5.2/T5.3 which run for any `dedicated` branch.

### Rationale

The legacy ship stage collapsed three orthogonal concerns into one per-run file: what "ship" means for this project, how versions work, and how CI/CD is wired. Re-running `/wf ship <slug>` after a partial failure re-asked every rollout question, re-ran every research sub-agent, and overwrote the prior artifact. Releases are inherently retried; the artifact shape forbade it.

The handoff PR-readiness block had a similar gap on the other side: no commit-lint pass, no public-surface drift detection, no PR comment triage, no rebase-onto-base, no live PR-state check. The PR was created and then never re-read — bot reviewers (CodeRabbit, Greptile, Gemini, Codex) and human reviewers left blockers that the workflow ignored.

The split — project-level plan, accumulating run history, idempotent replayable steps, handoff readiness gate — separates **the contract** (what ship means here, captured once per project) from **the evidence** (what happened on this specific release, captured per run).

### Codex shadow tree

Regenerated. The Codex `wf-meta` skill picks up `init-ship-plan` as a known sub-command key automatically via the SKILL.md frontmatter; the new reference files under `skills/wf-meta/reference/` (`init-ship-plan.md`, `ship-plan-templates/*.md`) propagate verbatim because the generator mirrors the directory.

## [9.2.0] - 2026-05-06

### Removed

- **`skills/wf-profile/` skill deleted.** The standalone profiling skill at `skills/wf-profile/SKILL.md` was a "shared library" that no caller actually shared. The architecture claimed it was invoked by `/wf-quick investigate`, `/wf benchmark`, and `/wf implement` for in-stage analysis, but a code audit found:
  - `/wf implement` had **zero** references to profile or profiling.
  - `/wf-quick investigate` mentioned it only in user-facing recommendations ("consider running `/wf profile <area>`") and one disclaimer.
  - `/wf benchmark` mentioned it only in a "see also" disclaimer and a recommendation in a regression-results table.

  No caller programmatically delegated to the skill or consumed its structured output. The skill's only real consumer was `/wf profile` itself via `skills/wf/reference/profile.md`, which delegated to it through a "now go follow that file" indirection.

### Changed

- **`skills/wf/reference/profile.md` is now self-contained.** The analyzer body (language detection, static-analysis rubric, dynamic-profiling commands per language, structured-output contract) is inlined into the orchestrator. The merged file is 11.3 KB — smaller than `implement.md` (26 KB), `plan.md` (33 KB), or `verify.md` (28 KB), so size was not the original justification for the split.
- **`wf/reference/benchmark.md` and `wf-quick/reference/investigate.md`** updated their "see also" references from `the wf-profile skill` to `/wf profile`. No call-site logic changed because there were no call sites to change.

### Rationale

The original split was speculative engineering: extract a "library" in case future stages want to reuse it. They didn't. The justification stayed in the docs (`wf/SKILL.md` notes section) and went stale. v9.2.0 collapses the indirection. If a future stage genuinely needs to spawn a profile sub-agent (e.g., `/wf implement` profiling a slow slice mid-implementation), re-extract the skill at that point — the analyzer rubric is now versioned with the orchestrator, so re-extraction is a clean cut, not a merge.

### Codex shadow tree

Regenerated. `wf-profile` was never emitted as a Codex skill (only routers were), so the shadow-tree diff is limited to the updated `wf/SKILL.md` description copy.

---

## [9.1.0] - 2026-05-06

### Changed (BREAKING for explicit `/wf-quick intake` callsites)

- **`intake` relocated from `/wf-quick` to `/wf`.** The full-lifecycle intake stage is now invoked as `/wf intake <task>` instead of `/wf-quick intake <task>`. Rationale: `intake` is stage 1 of the canonical 10-stage lifecycle; placing it under a different router than stages 2–10 broke the symmetry the rest of `/wf` advertises. v9.0.0's placement under `/wf-quick` was a routing-decomposition decision (acknowledged in the v9.0.0 SKILL.md), not a semantic re-classification. v9.1.0 corrects the placement.
- `/wf` now has **14 sub-commands** (was 13): `intake, shape, slice, plan, implement, verify, review, handoff, ship, retro, instrument, experiment, benchmark, profile`.
- `/wf-quick` now has **9 sub-commands** (was 10): `quick, rca, investigate, discover, hotfix, update-deps, docs, refactor, ideate`. It keeps the *compressed* and *investigative* entry points where the workflow does NOT continue into the canonical 10-stage pipeline.

### Migration table

| Old (v9.0.0)              | New (v9.1.0)        |
|---------------------------|---------------------|
| `/wf-quick intake <args>` | `/wf intake <args>` |

The `/wf-quick` router now rejects `intake` as an unknown sub-command with a redirect message pointing at `/wf intake`. All other `/wf-quick` sub-commands are unchanged.

### Updated callsites

Every reference body that mentioned `/wf-quick intake` as a downstream routing target was rewritten to `/wf intake`. Affected: `wf-meta/{resume,close,status,sync}.md`, `wf/reference/{shape,instrument,experiment,retro,profile,intake}.md`, `wf-quick/reference/{quick,rca,hotfix,refactor,ideate,investigate,discover}.md`, `commands/wf-design.md`, `README.md`. The `/wf intake` reference body itself (`skills/wf/reference/intake.md`) is byte-equivalent to v9.0.0's `skills/wf-quick/reference/intake.md` minus the two self-references that were updated to point at the new path.

### Tests

- **wf-fixtures.json** gains `wf-intake-task` (positive routing test for `/wf intake support OAuth callback flow`).
- **wf-quick-fixtures.json** keeps the same invocation but flips it to a *negative* fixture (`wf-quick-intake-rejected`, `expectedBehavior: "error"`) — the router must explicitly reject `intake` as an unknown sub-command rather than silently treating it as a slug.

### Codex shadow tree

Regenerated. Both `wf` and `wf-quick` Codex adapter SKILL.md descriptions track the canonical Claude descriptions automatically.

---

## [9.0.0] - 2026-05-05

### Added

- **Codex generator emits skill-mode router adapters** (PR-5 of `ROUTER-MIGRATION-PLAN.md`). `scripts/generate-codex-plugin.mjs` now reads a new `codex.routerSkills` array in `.codex-plugin.overrides.json` and emits one Codex skill adapter per listed router, pointing at `skills/<router>/SKILL.md` as the canonical source. The four routers introduced across alpha.1–alpha.4 (`/wf`, `/wf-quick`, `/wf-meta`, `/review`) now have first-class Codex parity. Reference bodies under `skills/<router>/reference/` stay where they are — the router loads them on demand at runtime, the same way it does on Claude.
- **`buildGeneratedRouterSkillFiles()`** helper in the generator — parallel to the existing `buildGeneratedSkillFiles()` (which still walks `commands/`). The two functions share the adapter-content builder (`buildGeneratedSkillContent`), the description sanitizer (`sanitizeCodexDescription`), and the OpenAI metadata template (`buildOpenAiSkillMetadata`), so the relative-path math and translation rules apply uniformly to both shapes.

### Changed

- **Drops the `alpha` tag.** `9.0.0-alpha.4` → `9.0.0`. The migration is structurally complete: top-level slash surface is now five entries (`/wf`, `/wf-quick`, `/wf-meta`, `/wf-design`, `/review`) plus the `/setup-wide-logging` bootstrap command, where 73 commands used to live. The verifier passes across all four routers in CI.
- **`.codex-generated/` regenerated.** Six skill adapters now present: `setup-wide-logging`, `wf-design` (from `commands/`), and the four new router adapters `wf`, `wf-quick`, `wf-meta`, `review` (from `skills/`). Four stale dirs cleared as a side effect of the regeneration: `wf-design-{audit,critique,extract,setup}` — these were sub-commands subsumed into the unified `/wf-design` router back in v8.27, but the codex generator hadn't been re-run since v8.30.1.
- **Codex manifest version → `9.0.0-codex.1`.** Tracks the source plugin version at the major.minor.patch level; the `-codex.N` suffix tracks Codex-specific shim revisions independently.
- **Plugin descriptions trimmed to current-state.** `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` (root) had accumulated ~200 lines of v8.x release-note prose inline. The `marketplace.json` description had ALSO been broken JSON since v8.31.0 added unescaped double-quoted phrases (`"Optional inputs"`, `"Conditional inputs (mandatory when present)"`); the codex generator's `JSON.parse` had been silently failing the marketplace read since then, but no one noticed because the generator hadn't been run. PR-5 trims both descriptions to a single current-state paragraph and lets `CHANGELOG.md` carry release-note history.
- **`.codex-plugin.overrides.json` gains `codex.routerSkills: ["wf","wf-quick","wf-meta","review"]`.** Single source of truth for which top-level skills should ship as Codex adapters. Adding a fifth router in a future PR is a one-line config change.

### Removed

- **4 stale `.codex-generated/skills/wf-design-{audit,critique,extract,setup}/` mirrors deleted** as a regenerator side effect. These sub-commands were collapsed into the `/wf-design` router in v8.27; their codex mirrors had been carried forward as orphans because the generator hadn't been re-run since v8.30.1.

### Notes

- **Migration plan complete.** All five PRs of `ROUTER-MIGRATION-PLAN.md` have landed: PR-1 (`/review`, alpha.1), PR-2 (`/wf-quick`, alpha.2), PR-3 (`/wf-meta`, alpha.3), PR-4 (`/wf`, alpha.4), PR-5 (Codex generator + alpha drop, this release). The slash-menu pollution problem the plan opened with is resolved; the verifier is permanent CI gate against reintroduction.
- **The `<!-- sdlc-workflow-pinned-shim -->` marker the migration plan reserved for shim files was never used.** Every router PR chose break-the-surface (delete old commands, no shims) over backwards-compat. Side effect: the `9.0.0-alpha.*` series was a public statement that the slash surface was breaking on purpose, in a coordinated way. The `9.0.0` final tag means we landed it.

## [9.0.0-alpha.4] - 2026-05-05

### Removed (BREAKING)

- **All 13 standalone `/wf-X` lifecycle commands rolling under `/wf` are deleted** (PR-4 of `ROUTER-MIGRATION-PLAN.md`). The deleted commands are:
  - `/wf-shape`, `/wf-slice`, `/wf-plan`, `/wf-implement`, `/wf-verify`, `/wf-review`, `/wf-handoff`, `/wf-ship`, `/wf-retro`, `/wf-instrument`, `/wf-experiment`, `/wf-benchmark`, `/wf-profile`.
- **Each command's body is now a reference under `skills/wf/reference/<key>.md`.** The `/wf` skill at `skills/wf/SKILL.md` is the single entry point.
- **No shims.** Same break-the-surface posture as v9.0.0-alpha.1 (`/review`), v9.0.0-alpha.2 (`/wf-quick`), v9.0.0-alpha.3 (`/wf-meta`).
- **9 stale `.codex-generated/skills/wf-{shape,slice,plan,implement,verify,review,handoff,ship,retro}/` mirrors deleted.** The four augmentation commands (instrument, experiment, benchmark, profile) had no codex mirror to begin with — they post-date the generator's last full-tree run and will land cleanly when PR-5 regenerates.
- **`commands/` is now nearly empty.** After PR-4 the only top-level slash commands left are `/wf-design` (still its own router) and `/setup-wide-logging` (one-shot bootstrap). Every other lifecycle action is reached via one of the four skill routers (`/wf`, `/wf-quick`, `/wf-meta`, `/review`).

### Changed

- **Skill-mode dispatch for the 13 sub-commands.** `/wf <key> <args>` is the single entry point. The first positional token must be one of: `shape`, `slice`, `plan`, `implement`, `verify`, `review`, `handoff`, `ship`, `retro`, `instrument`, `experiment`, `benchmark`, `profile`. Bare `/wf` renders the menu. There is no implicit "first arg = slug" mode (mirrors `/wf-quick` and `/wf-meta`).
- **No `sweep` mode for `/wf`.** The 13 sub-commands are sequential lifecycle stages, not orthogonal lenses on a shared target. The `aggregates` field in `skills/wf/router-metadata.json` is intentionally empty; only `/review` has sweeps.
- **Three families of cross-references rewritten in lockstep.** The bulk-rewriter hit 22 external docs (commands/wf-design.md, README.md, .ai/gap-analysis-upgrades.md, plus 19 reference bodies inside the wf-quick, wf-meta, design, and review skills). Body hashes drifted across all four sibling routers; their `migration-manifest.json` files were refreshed to capture the new state. The path-boundary lookbehind preserved path strings like `skills/wf/reference/...` from corruption.
- **`scripts/verify-router-migration.mjs` orphan scan extended** with the wf-lifecycle pattern. Same path-boundary + idempotency lookahead scheme PR-2 introduced. `/wf-design` is implicitly excluded — `design` is not in the alternation, so its callsites slip past untouched (it remains its own router).
- **Routing-resolution verifier carries forward.** `scripts/verify-routing-resolution.mjs` already resolves skill-mode routers via `skills/<router>/SKILL.md` when no `commands/<router>.md` exists, and defaults its fixtures to `tests/<router>-fixtures.json`. PR-4 adds the new fixtures file; the script needed no changes.
- **`/wf review` vs `/review` disambiguation documented in `skills/wf/SKILL.md`.** `/wf review <slug>` is the lifecycle-aware review stage that knows about slugs, slices, prerequisites, and verdict contracts; `/review <dim>` is the bare review skill that runs one dimension on the current diff with no workflow context.

### Added

- **`scripts/relocate-wf.mjs`** — one-shot relocator + bulk rewriter for the 13 lifecycle commands. Same idempotent / path-safe regex as `relocate-wf-meta.mjs` and `relocate-wf-quick.mjs`, with one improvement: the script now `unlinkSync`s the source file after relocating, so the relocator alone produces the final on-disk shape (prior PRs relied on a separate manual `git rm` step). Kept in tree as audit trail.
- **`tests/wf-fixtures.json`** — 17 routing-resolution fixtures: one per stage, plus the `wf-implement reviews <slice>` edge case (the literal `reviews` second arg must not be confused with a sub-key), plus the `wf-review <slug> triage` re-triage form, plus the bare-`/wf` menu fallback.
- **`skills/wf/{SKILL.md,router-metadata.json,migration-manifest.json}`** + 13 reference bodies under `skills/wf/reference/`.

### Migration

| Old invocation (any version ≤ v9.0.0-alpha.3) | New invocation (v9.0.0-alpha.4+) |
|---|---|
| `/wf-shape <args>`      | `/wf shape <args>`      |
| `/wf-slice <args>`      | `/wf slice <args>`      |
| `/wf-plan <args>`       | `/wf plan <args>`       |
| `/wf-implement <args>`  | `/wf implement <args>`  |
| `/wf-verify <args>`     | `/wf verify <args>`     |
| `/wf-review <args>`     | `/wf review <args>`     |
| `/wf-handoff <args>`    | `/wf handoff <args>`    |
| `/wf-ship <args>`       | `/wf ship <args>`       |
| `/wf-retro <args>`      | `/wf retro <args>`      |
| `/wf-instrument <args>` | `/wf instrument <args>` |
| `/wf-experiment <args>` | `/wf experiment <args>` |
| `/wf-benchmark <args>`  | `/wf benchmark <args>`  |
| `/wf-profile <args>`    | `/wf profile <args>`    |

### Notes

- **PR-5 next.** Updates `scripts/generate-codex-plugin.mjs` to consume the four-router structure, regenerates `.codex-generated/`, and drops the alpha tag for v9.0.0 final.
- **Top-level surface after PR-4.** Every lifecycle action now reaches one of: `/wf`, `/wf-quick`, `/wf-meta`, `/wf-design`, `/review`. The `/`-menu pollution problem the migration plan opened with is resolved.
- **Why a 9.0.0-alpha.4 bump.** Same shim-removal break-the-surface pattern as alpha.1 through alpha.3. Pre-release tag stays `alpha` until PR-5 lands.

## [9.0.0-alpha.3] - 2026-05-05

### Removed (BREAKING)

- **All 10 standalone `/wf-X` lifecycle-navigation commands rolling under `/wf-meta` are deleted** (PR-3 of `ROUTER-MIGRATION-PLAN.md`). The deleted commands are:
  - `/wf-next`, `/wf-status`, `/wf-resume`, `/wf-sync`, `/wf-amend`, `/wf-extend`, `/wf-skip`, `/wf-close`, `/wf-how`, `/wf-announce`.
- **Each command's body is now a reference under `skills/wf-meta/reference/<key>.md`.** The `/wf-meta` skill at `skills/wf-meta/SKILL.md` is the single entry point.
- **No shims.** Same break-the-surface posture as v9.0.0-alpha.1 (`/review`) and v9.0.0-alpha.2 (`/wf-quick`).
- **8 stale `.codex-generated/skills/wf-{next,status,resume,sync,amend,extend,how,announce}/` mirrors deleted.** Codex generator update will land in PR-5.

### Changed

- **Skill-mode dispatch for the 10 sub-commands.** `/wf-meta <key> <args>` is the single entry point. The first positional token must be one of: `next`, `status`, `resume`, `sync`, `amend`, `extend`, `skip`, `close`, `how`, `announce`. Bare `/wf-meta` renders the menu.
- **No `sweep` mode for `/wf-meta`.** The 10 sub-commands are orthogonal meta-controls (status check ≠ amend ≠ close), not different lenses on a shared target. The `aggregates` field in `skills/wf-meta/router-metadata.json` is intentionally empty.
- **Distinction from `/wf-quick`.** `/wf-quick` *starts* new workflows (intake, RCA, hotfix, etc.); `/wf-meta` *navigates and manages* existing ones. The split is intentional and matches the original `ROUTER-MIGRATION-PLAN.md` decomposition.
- **Cross-references rewritten in lockstep.** Every `/wf-X` invocation in the wf-meta family was retargeted to `/wf-meta X`. The bulk-rewrite hit 8 external docs (`commands/wf-design.md`, `commands/wf-review.md`, `README.md`, plus 5 wf-quick reference bodies that had referenced `/wf-status` etc.). The 5 wf-quick reference body hashes drifted as a result; `skills/wf-quick/migration-manifest.json` was refreshed to capture the new state.
- **`scripts/verify-router-migration.mjs` orphan scan extended** to the wf-meta family, with the same path-boundary + idempotency lookahead scheme PR-2 introduced.

### Added

- **`scripts/relocate-wf-meta.mjs`** — one-shot relocator + bulk rewriter for the 10 wf-meta commands. Same idempotent / path-safe regex as `relocate-wf-quick.mjs`. Kept in tree as audit trail.
- **`tests/wf-meta-fixtures.json`** — 8 routing-resolution fixtures (7 dispatch forms + 1 menu fallback).
- **`skills/wf-meta/{SKILL.md,router-metadata.json,migration-manifest.json}`** + 10 reference bodies under `skills/wf-meta/reference/`.

### Migration

| Old invocation (any version ≤ v9.0.0-alpha.2) | New invocation (v9.0.0-alpha.3+) |
|---|---|
| `/wf-next <args>` | `/wf-meta next <args>` |
| `/wf-status <args>` | `/wf-meta status <args>` |
| `/wf-resume <args>` | `/wf-meta resume <args>` |
| `/wf-sync <args>` | `/wf-meta sync <args>` |
| `/wf-amend <args>` | `/wf-meta amend <args>` |
| `/wf-extend <args>` | `/wf-meta extend <args>` |
| `/wf-skip <args>` | `/wf-meta skip <args>` |
| `/wf-close <args>` | `/wf-meta close <args>` |
| `/wf-how <args>` | `/wf-meta how <args>` |
| `/wf-announce <args>` | `/wf-meta announce <args>` |

### Notes

- **PR-4 still pending.** Collapses the `/wf` lifecycle (13 stage commands like `/wf-shape`, `/wf-slice`, `/wf-plan`, `/wf-implement`, `/wf-verify`, `/wf-review`, `/wf-handoff`, `/wf-ship`, `/wf-retro`, plus the 4 augmentation/perf commands `/wf-instrument`, `/wf-experiment`, `/wf-benchmark`, `/wf-profile`). Once PR-4 lands, the only remaining top-level `/wf-*` slash commands will be `/wf-quick`, `/wf-meta`, `/wf`, and `/wf-design`.
- **Why a 9.0.0-alpha.3 bump.** Same shim-removal break-the-surface pattern as alpha.1 and alpha.2. Pre-release tag stays `alpha` until PR-4 lands.

## [9.0.0-alpha.2] - 2026-05-04

### Removed (BREAKING)

- **All 10 standalone `/wf-X` commands rolling under `/wf-quick` are deleted** (PR-2 of `ROUTER-MIGRATION-PLAN.md`). The deleted commands are:
  - `/wf-quick`, `/wf-rca`, `/wf-investigate`, `/wf-discover`, `/wf-hotfix`, `/wf-update-deps`, `/wf-docs`, `/wf-refactor`, `/wf-ideate`, `/wf-intake`.
- **Each command's body is now a reference under `skills/wf-quick/reference/<key>.md`.** The `/wf-quick` skill at `skills/wf-quick/SKILL.md` is the single entry point; it parses the first positional token as a sub-command key, loads the matching reference body, and follows it verbatim.
- **No shims.** Mirroring v9.0.0-alpha.1's break-the-surface posture for `/review`, the legacy `/wf-X` slash commands are gone. Typing them returns "command not found." Migration table below.
- **8 stale `.codex-generated/skills/wf-{quick,rca,hotfix,update-deps,docs,refactor,ideate,intake}/` mirrors deleted.** They reflected the legacy command surface; the Codex generator update (PR-5 of the router migration) will emit one Codex skill per router instead.

### Changed

- **Skill-mode dispatch for the 10 sub-commands.** `/wf-quick <key> <args>` is the single user-facing entry point. The first positional token must be one of: `quick`, `rca`, `investigate`, `discover`, `hotfix`, `update-deps`, `docs`, `refactor`, `ideate`, `intake`. Bare `/wf-quick` renders the menu instead of picking a default. There is no implicit "first arg = slug" mode (mirroring `/review`'s strict dimension-or-`sweep` parsing).
- **No `sweep` mode for `/wf-quick`.** The 10 sub-commands are orthogonal entry points (root-cause analysis ≠ ideation ≠ dependency upgrade), not different lenses on a shared target. The `aggregates` field in `skills/wf-quick/router-metadata.json` is intentionally empty; there is no parallel sub-agent dispatch path. Only `/review` has sweeps.
- **Cross-references rewritten.** Every internal slash invocation referencing the 10 deleted commands (in remaining `commands/wf-*.md` files, `README.md`, and the relocated reference bodies themselves) was rewritten in lockstep: `/wf-rca` → `/wf-quick rca`, `/wf-intake` → `/wf-quick intake`, etc. The `scripts/relocate-wf-quick.mjs` rewriter is idempotent (path-boundary lookbehind avoids corrupting `skills/wf-quick/...` paths; "already-rewritten key" lookahead avoids `/wf-quick quick quick`) and is kept in tree as the audit trail.
- **`scripts/migrate-review.mjs` renamed to `scripts/migrate-router.mjs` and parameterized by `--router <key>`.** The PR-1 manifest builder for `/review` now serves both routers and is reusable for PR-3/PR-4. Default `--router` is `review` for backward compat.
- **`scripts/verify-routing-resolution.mjs` resolves skill-mode routers.** When `commands/<router>.md` does not exist (the post-v9 shape), the verifier loads `skills/<router>/SKILL.md` instead. Defaults `tests/<router>-fixtures.json` for non-`review` routers.
- **`scripts/verify-router-migration.mjs` orphan scan extended.** Adds a `/wf-{quick,rca,investigate,discover,hotfix,update-deps,docs,refactor,ideate,intake}` legacy-pattern. Two negative lookaheads prevent false positives: a `/` lookahead skips path strings like `skills/wf-quick/reference/`, and a `\s+KEYS\b` lookahead skips the v9 dispatch form `/wf-quick rca`. `SKILL.md` is added to the file allowlist (skill manifests are descriptive documentation, not callsites). Both routers + the orphan scan PASS in CI on the migrated branch.
- **New script `scripts/relocate-wf-quick.mjs`.** One-shot relocator (Phase 1 moves command bodies to `skills/wf-quick/reference/`; Phase 2 walks the plugin tree and rewrites external cross-refs). Kept as audit trail like `rewrite-review-refs.mjs`.

### Added

- **`tests/wf-quick-fixtures.json`** — 6 routing-resolution fixtures (5 dispatch forms + 1 menu fallback).
- **`skills/wf-quick/{SKILL.md,router-metadata.json,migration-manifest.json}`** + 10 reference bodies under `skills/wf-quick/reference/`.

### Migration

| Old invocation (any version ≤ v9.0.0-alpha.1) | New invocation (v9.0.0-alpha.2+) |
|---|---|
| `/wf-quick <args>` | `/wf-quick quick <args>` |
| `/wf-rca <args>` | `/wf-quick rca <args>` |
| `/wf-investigate <args>` | `/wf-quick investigate <args>` |
| `/wf-discover <args>` | `/wf-quick discover <args>` |
| `/wf-hotfix <args>` | `/wf-quick hotfix <args>` |
| `/wf-update-deps <args>` | `/wf-quick update-deps <args>` |
| `/wf-docs <args>` | `/wf-quick docs <args>` |
| `/wf-refactor <args>` | `/wf-quick refactor <args>` |
| `/wf-ideate <args>` | `/wf-quick ideate <args>` |
| `/wf-intake <args>` | `/wf-quick intake <args>` |

### Notes

- **`intake` placement.** The original `/wf-intake` was Stage 1 of the canonical 10-stage SDLC lifecycle; the underlying reference body still is. Routing it under `/wf-quick intake` is a routing decision per `ROUTER-MIGRATION-PLAN.md`'s decomposition (which grouped 10 standalone entry points under one router), not a semantic re-classification. Stage 1 still kicks off the lifecycle; the slash-form is `/wf-quick intake` instead of `/wf-intake`.
- **PR-3 and PR-4 still pending.** PR-3 collapses `/wf-meta` (10 navigation commands like `/wf-status`, `/wf-resume`, `/wf-sync`, etc.); PR-4 collapses the `/wf` lifecycle (13 stage commands). Both are planned for the v9 alpha line before v9.0.0 stable is cut.
- **Why a 9.0.0-alpha.2 bump and not -beta or -rc.** The shim-removal pattern is identical to v9.0.0-alpha.1 (BREAKING for any caller with macros / muscle memory keyed off the legacy slash). Pre-release tag stays `alpha` because PR-3 and PR-4 will land further breaking changes before v9 is stable.

## [9.0.0-alpha.1] - 2026-05-04

### Removed (BREAKING)

- **All 38 legacy `/review-*` and `/review:*` slash commands are deleted.** PR-1 (v8.32.0) introduced the `/review` router and kept the old commands alive as 10-line redirect shims for backwards compatibility. v9.0.0-alpha.1 removes the shims entirely. The deleted commands are:
  - 7 aggregates: `/review-all`, `/review-architecture`, `/review-infra`, `/review-pre-merge`, `/review-quick`, `/review-security`, `/review-ux`
  - 31 dimensions: `/review:accessibility`, `/review:api-contracts`, …, `/review:ux-copy` (all 31 named under `commands/review/`)
- **`/review` slash command is also deleted.** The router file at `commands/review.md` is gone. All review work is now done by the `review` **skill** at `skills/review/SKILL.md`. Claude Code resolves `/review <args>` to the skill automatically when no command file exists at that path; the skill is also auto-triggered on review/audit requests via its description match.
- **7 curated aggregate reference bodies deleted** (`skills/review/reference/_aggregate-*.md`, ~2,062 lines combined). These were standalone compressed-rubric review prompts (one per aggregate) — `_aggregate-quick.md` had its own 5 "Lenses" condensed-correctness/style/DX/UX/overengineering review, etc. Replaced by parallel sub-agent dispatch (see *Changed* below).
- **All 38 stale `.codex-generated/skills/review-*/` mirrors deleted.** They reflected the legacy command surface; the Codex generator update (PR-5 of the router migration) will emit one `review` skill per router rather than per-dimension.
- **Dead scripts deleted:** `scripts/router-shim.mjs`, `scripts/replay-fixtures.mjs`, `scripts/sdk-smoke.mjs`. Their PR-1 jobs (shim generation, baseline-vs-migrated transcript diff, OAuth smoke check) no longer apply.

### Changed

- **Skill-mode dispatch with parallel sub-agents for sweeps.** The `review` skill (`skills/review/SKILL.md`) is now the single entry point. Two modes:
  - **Single-dimension** — `/review <dimension>` (e.g. `/review security pr 123`): the skill reads `reference/<dimension>.md` and runs the rubric inline. Behavior is the same as v8.32 single-dimension.
  - **Sweep** — `/review sweep <aggregate>` (e.g. `/review sweep architecture worktree`): the skill resolves the aggregate's **composition** (a list of dimension keys) from `router-metadata.json`, then **dispatches one Task sub-agent per dimension in parallel** in a single assistant message. After all sub-agents return, the skill synthesizes their findings — deduplicating by (file:line + root cause), normalizing severity onto the canonical BLOCKER/HIGH/MED/LOW/NIT scale, triaging BLOCKER + HIGH with the user via `AskUserQuestion`, and writing the per-slice review artifacts (`07-review-<slice>-<dimension>.md` per dispatched dimension and `07-review-<slice>.md` for the master verdict) per the v8.30 contract.
  - **Tradeoff:** sweep is more thorough than the v8.32 curated aggregate (each dimension runs its full rubric, not the compressed lens version) but more expensive (N LLM contexts vs one). Use single-dimension when the axis is known; use sweep for defensive breadth.
- **`sweep` keyword replaces `pass`.** v8.32 used `/review pass <aggregate>` to disambiguate aggregate vs dimension on overlapping names (`architecture`, `infra`, `security`). v9.0.0-alpha.1 renames to `/review sweep <aggregate>`, signalling cost (parallel sub-agent dispatch) more honestly.
- **Aggregate compositions are policy data.** `skills/review/router-metadata.json` carries an `aggregates: { <name>: [<dim>, …] }` map; editing the file is how you change which dimensions a sweep dispatches. The verifier rejects compositions that reference unknown dimensions.
- **Compositions match the actual coverage of the deleted aggregate bodies**, not the README descriptions (which had drifted). For example, `quick` is `[correctness, style-consistency, dx, ux-copy, overengineering]` (matches `_aggregate-quick.md`'s 5 Lenses) — not `[correctness, security, testing]` as the old README claimed. The README has been updated to match.
- **Reference body cross-references rewritten.** Instructions inside the dimension reference files previously said things like *"now run `/review-security`"* — body-byte-equal preservation from PR-1 carried this through. Bodies now use the new skill syntax (`/review security`, `/review sweep security`). The body-preservation invariant from PR-1 (each reference body byte-equal to the original command) is **intentionally retired**; the migration manifest tracks current-state hashes for drift detection rather than historical equivalence.
- **`scripts/migrate-review.mjs` simplified.** Now rebuilds `migration-manifest.json` and `router-metadata.json` from current reference content. The PR-1 job of relocating bodies from `commands/` is complete and removed.
- **`scripts/verify-router-migration.mjs` simplified and stricter.** Dropped Check 2 (shim coverage) since shims are gone. Added an **orphan reference scan** that walks every plugin `*.md` (outside the changelog/IDEAS allowlist) and fails CI if any legacy `/review-X` or `/review:X` string remains. The hash-based body integrity check (Check 1) and the metadata sanity check (Check 2 in the new ordering) remain.
- **`scripts/verify-routing-resolution.mjs` simplified and generic.** Dropped the shim-redirect branch (no shims to redirect). Now takes `--router <key>` and loads the router file at runtime so PR-2/3/4 can reuse the script unchanged.
- **`tests/migration-fixtures.json` simplified.** Each fixture now has a single `invocation` + `expectedReferencePath` instead of the PR-1 `old`/`new` pair.
- **`router-metadata.json` schema simplified.** Replaces the PR-1 `shims` array (referencing deleted paths) with `aggregates: [...]` and `dimensions: [...]` lists keyed off the reference filenames.
- **README's "Aggregate bundles" table rewritten** to use `/review pass <aggregate>` syntax. Review domains section reworded to use `/review <dimension>` syntax.

### Added

- **`scripts/rewrite-review-refs.mjs`** — one-off bulk rewriter that performed the body cross-reference migration described above. Idempotent; kept in tree as the audit trail.

### Why a 9.0.0 major bump

Removing the 38 shim commands is an API break for any downstream user with macros, docs, or muscle memory keyed off `/review-*` or `/review:*`. SemVer demands a major-version signal. The `-alpha.1` pre-release tag indicates the v9 line is not yet stable — PR-2 through PR-5 of `ROUTER-MIGRATION-PLAN.md` will land further breaking changes (collapsing `/wf-quick`, `/wf-meta`, and the `/wf` lifecycle) before v9.0.0 stable is cut.

### Migration

| Old invocation (any version ≤ v8.32) | New invocation (v9.0.0-alpha.1+) |
|---|---|
| `/review-all` (pre-v8.32) → `/review pass all` (v8.32) | `/review sweep all` |
| `/review-{architecture,infra,pre-merge,quick,security,ux}` → `/review pass {…}` | `/review sweep {…}` |
| `/review:<dimension>` (31 of them) → `/review <dimension>` (v8.32) | `/review <dimension>` (unchanged from v8.32) |

`architecture`, `infra`, and `security` exist as both a dimension and an aggregate. `/review architecture` resolves to the dimension; use `/review sweep architecture` to reach the aggregate.

## [8.32.0] - 2026-05-04

### Changed

- **`/review` is now a router** (PR-1 of the router-migration plan in `ROUTER-MIGRATION-PLAN.md`). The 7 aggregate review commands (`/review-all`, `/review-architecture`, `/review-infra`, `/review-pre-merge`, `/review-quick`, `/review-security`, `/review-ux`) and the 31 per-dimension review commands (`/review:accessibility` … `/review:ux-copy`) collapse into a single `/review` command backed by reference files in `skills/review/reference/`.
  - **New invocation forms.** `/review <dimension>` runs a per-dimension review (e.g. `/review security pr 123`). `/review pass <aggregate>` runs a multi-dimension aggregate (e.g. `/review pass architecture worktree`). The `pass` keyword disambiguates the three names that exist as both a dimension and an aggregate (`architecture`, `infra`, `security`).
  - **All 38 old commands continue to work as before.** Each old command file at its original path was replaced with a 10-line pinned shim that redirects to the new router invocation. `/review-architecture worktree`, `/review:security pr 123`, etc. invoke the router under the hood. Existing docs, macros, and muscle memory are unaffected.
  - **Body preservation guarantee.** Each reference file's body is byte-equal to the corresponding old command's body. The migrator records each body's SHA-256 in `skills/review/migration-manifest.json`, and `scripts/verify-router-migration.mjs` checks every body and shim frontmatter against that manifest. The check runs in CI on every PR touching `commands/` or `skills/`.
  - **New scripts.** `scripts/migrate-review.mjs` (one-shot relocator), `scripts/router-shim.mjs` (reusable shim generator, adapted from impeccable's `pin.mjs`), `scripts/verify-router-migration.mjs` (Layer 1 static-equivalence verifier), `scripts/replay-fixtures.mjs` (Layer 2 behavioral-equivalence harness using the Claude Agent SDK).
  - **GitHub Action.** `.github/workflows/verify-router-migration.yml` runs the verifier on every PR.
  - **Rationale.** Generalizes the `wf-design` consolidation already shipped in v8.27 to the rest of the plugin's command surface. PR-1 replaces 38 user-facing slash commands with 1 router + 38 thin shims. Subsequent PRs (per the migration plan) collapse `/wf-quick`, `/wf-meta`, and `/wf` lifecycle commands the same way. End-state surface drops from ~73 user-invocable commands to ~5 routers + thin shims; users with old muscle memory keep working unaffected via the shims.

### Why

Slash-menu pollution was load-bearing pain: 73 sdlc-workflow commands shared the global `/`-namespace alongside every other plugin's commands, each one auto-loaded into context every session. The impeccable plugin proved the router pattern (1 trigger surface, references loaded on demand, redirect shims for backwards compat); `wf-design` shipped the same pattern in this plugin at v8.27. PR-1 is the second router (and the larger payoff per PR — 38 → 1 vs wf-design's 22 → 1). The migration is provably non-semantic at the body level; the verifier reduces to byte-comparison against a recorded manifest.

## [8.31.0] - 2026-05-04

### Changed

- **No-optional-artifacts policy across the lifecycle.** Every stage's preamble table row historically titled `Optional inputs` was renamed to **`Conditional inputs (mandatory when present)`** across `wf-slice`, `wf-plan`, `wf-implement`, `wf-verify`, `wf-review`, `wf-handoff`, `wf-ship`, and `wf-retro`. A uniform new bullet was added to each command's `# Workflow rules` section: *"Conditional inputs are mandatory when present. If any file listed in the Conditional inputs row of this command's preamble exists on disk, you MUST read it and the stage's output MUST honor it as described. Existence is what's optional; consumption is required. Silent omission of a present artifact is a workflow contract violation, not a permitted shortcut."*
- **Per-row consumption text strengthened with explicit MUST language.** Where the prior wording was advisory (e.g., "design brief", "mock fidelity inventory becomes acceptance criteria"), each entry now binds the stage to specific behavior:
  - `wf-implement`: 02b register/color strategy/anti-goals MUST be honored; 02c inventory items MUST be honored as acceptance criteria; 04b signals MUST be added to code; 04c flag/cohort wiring MUST be added; 05c baseline MUST NOT regress; every augmentation MUST be consumed per type.
  - `wf-verify`: 02c mock fidelity inventory MUST be re-verified; 04b signals MUST fire; 04c flag/cohort/metrics MUST work; 05c compare-mode re-run REQUIRED; every augmentation MUST trigger a type-specific re-check.
  - `wf-handoff`: every conditional artifact MUST contribute reviewer-visible context to the handoff package; the handoff is incomplete if any present artifact is omitted.
  - `wf-review`: every present artifact MUST be checked by the relevant review (anti-goals, signals, baselines, augmentation re-checks).
  - `wf-ship`: every augmentation entry MUST get a changelog entry; release notes are incomplete if any augmentation is omitted.
  - `wf-retro`: every design artifact that exists on disk MUST be reflected in the retro.
  - `wf-plan`: 02b visual surface scope and recommended references MUST be reflected in plan steps; 02c plan MUST include explicit steps to honor every mock fidelity inventory item.
- **`wf-slice` now consumes `02c-craft.md`** (was missing entirely from slice's input list — an artifact of the canonical routing assumption that craft happens *after* slice/plan, even though the actual `wf-design` routing lets craft run anytime after `02b-design.md` exists). Slice now binds consumption of both `02b-design.md` AND `02c-craft.md`: distinct states (from 02b) and distinct visual surfaces (from 02c) MUST become slice boundaries, or the master `03-slice.md` `## Slice Strategy` MUST justify any grouping with one sentence per state/surface. Slice still does NOT re-decompose around token choices, motion specs, or implementation details — those remain plan/implement territory.

### Added

- **Scope-creep guardrail in `wf-slice`.** If `02c-craft.md` introduces surfaces or states not present in `02-shape.md` or `02b-design.md`, slice surfaces this as an open question on the master index rather than silently expanding the scope. Matches the existing CRITICAL discipline ("Do not silently broaden scope").

### Why

The "Optional inputs" framing across the lifecycle was overloaded: it meant *the file may not exist on disk*, but said nothing about what to do once it did. In practice the wording allowed silent omission — a stage could see `02c-craft.md` or `04b-instrument.md` on disk, ignore it, and emit a passing artifact that quietly diverged from the visual contract or instrumentation plan. Renaming the row to `Conditional inputs (mandatory when present)` and adding a uniform `# Workflow rules` clause splits the two concerns explicitly: **existence is optional; consumption is required.** This closes a class of contract drift that was hard to detect because no individual stage was technically violating its prior wording — the wording itself was the bug.

### Notes

- This is **not** a breaking change for workflows that lacked these artifacts. Stages without 02b/02c/04b/04c/05c/augmentations on disk behave identically to v8.30.x. The strengthened policy only takes effect when the artifacts are actually present.
- The escape hatch for slicing intent is in the body, not the policy: where multiple states/surfaces share a slice, the master `03-slice.md` `## Slice Strategy` records the per-state/per-surface justification. This converts what would have been silent omission into deliberate, auditable consolidation.
- Two stages were intentionally excluded from the rename: `wf-intake` and `wf-shape` have no Conditional inputs rows (intake is the entry point; shape consumes only intake as a Required input).

## [8.30.1] - 2026-05-03

### Added

- **`wf-implement` now loads design references named in `02b-design.md`.** When the design brief's YAML frontmatter has `recommended-references: [name1, name2, ...]` (e.g., `[colorize, typeset, harden]`), wf-implement resolves each entry to `skills/design/reference/<name>.md` and reads it alongside the brief. The loaded references serve as **read-only design rationale** for implementation judgment — they explain the *why* behind ambiguous contract items (token choices, motion specs, hierarchy rules). They do NOT expand scope: implement still honors the visual contract in `02c-craft.md` exactly. Missing references log a one-line warning and the step continues. Closes a wiring gap from v8.29's design-aware artifact consumption: prior to this version, the brief's "Recommended references" section was produced by `/wf-design shape` but never consumed downstream.

### Fixed

- **`reference/shape.md` typo.** The "Recommended references" template listed `typography.md`, but the actual reference file is `typeset.md`. Briefs generated from the unfixed template would have pointed at a non-existent reference; the v8.30.1 wf-implement load step now warns on this rather than silently ignoring, but new briefs produced from the corrected template won't trigger the warning.
- **`reference/shape.md` mandates frontmatter mirror.** The template now requires the recommended-references list to also appear as a `recommended-references:` YAML frontmatter array in `02b-design.md`, so wf-implement can parse it deterministically rather than scraping markdown bullets.

## [8.30.0] - 2026-05-03

### Changed

- **Per-slice review artifacts.** `wf-review` now writes `07-review-<slice-slug>.md` (master verdict) and `07-review-<slice-slug>-<command>.md` (per-command sub-reviews) instead of a single workflow-wide `07-review.md` and `07-review-<command>.md`. Running review on a second slice no longer overwrites the first slice's review — every reviewed slice keeps its own master verdict and per-command findings on disk.
- **`wf-handoff` aggregates per-slice reviews.** Handoff now requires `07-review-<slice-slug>.md` for *every* slice in scope and STOPs with the offending slice slug(s) listed if any slice's `verdict` is `dont-ship` or has unresolved blockers in frontmatter (`metric-findings-blocker > 0` without a `## Fix Status` resolution). The `refs.review` pointer in `08-handoff.md` frontmatter is replaced by `refs.reviews: [<list>]`.
- **Consumers updated.** `wf-implement` reviews mode reads the slice-scoped review file (and accepts an explicit slice argument); `wf-amend from-review` reads the per-slice file (or aggregates siblings for cross-slice spec errors); `wf-extend from-review` globs every per-slice review since missing-capability findings often span slices; `wf-retro` and `wf-how findings` glob across all per-slice review files; `wf-ship` reads every per-slice review for changelog completeness; `wf-skip review` now writes a slice-scoped stub and requires a resolvable slice slug; `wf-status` matrix and frontmatter `refs.review` updated. README and frontmatter schema reference table updated.

### Why

Each slice review previously **overwrote** `07-review.md` and every `07-review-<command>.md`, because filenames were not slice-scoped (every other stage from `03-slice` through `06-verify` already had `<slice-slug>` in the filename). Multi-slice features that ran review per slice without committing in between lost prior verdicts and triage state, and `wf-handoff` could only see "the most recent review" rather than aggregating across the slices it was about to bundle into one PR. Slice-scoping the filename makes 07 consistent with surrounding stages and lets handoff enforce a per-slice ship gate.

## [8.18.0] - 2026-05-03

### Added

- **`wf-rca` command — read-only root-cause analysis workflow.** Investigates a reported issue using three parallel diagnosis sub-agents (code path investigation, recent change correlation, blast radius), writes a structured RCA artifact at `.ai/workflows/rca-<slug>/01-rca.md` with eleven sections including symptom, scope, investigation summary, root cause (with `file:line` evidence), contributing factors, blast radius, suggested fix shape (1-3 lines of *direction*, not a plan), verification criteria, and confidence ratings for both the root cause and the fix shape. Does NOT write a fix and does NOT switch branches — investigation is strictly read-only. Synthesizes a minimal `02-shape.md` from the RCA so `/wf-plan <slug>` can consume the workflow directory without modification, treating `01-rca.md` as the deeper investigation context. Routing recommendation logic: `impact: critical` + production + medium-or-better confidence + small fix shape -> `/wf-hotfix`; small fix shape (≤3 files, ≤5 steps, no new dependency, no architecture change) -> `/wf-quick`; anything else -> `/wf-plan`; `confidence: low` + `blast-radius: high` -> `human-triage` (escalation, no auto-route). Tripwires (warn-and-continue): low confidence, high blast radius, multiple plausible root causes, concurrent open PR touching the implicated path, same buggy pattern repeating elsewhere. Tripwires record what fired in the artifact; they never block writing the RCA. Recommendation surfaces alternates with priority order; the user makes the final routing call. Distinct from `wf-hotfix` (which diagnoses *and* fixes), the `error-analysis` skill (general RCA toolkit, no workflow integration), and `wf-how` (explanation/Q&A, not investigation).

## [8.17.0] - 2026-04-28

### Added

- **`wf-quick` command — compressed planning workflow for small intentional changes.** Collapses the first five lifecycle stages (intake, shape, design, slice, plan) into a single `01-quick.md` artifact written in one pass, then routes to `/wf-implement` so the standard execute-verify-review-handoff-ship lifecycle takes over from stage 5 onward. Asks at most 2 questions in chat (no `AskUserQuestion`, no separate `po-answers.md` — answers inline into the artifact). Parallel Explore sub-agents gather codebase grounding (files in scope, nearby patterns, reuse candidates, recent churn) and optional web freshness (skipped if the change is purely internal). Design is **never auto-included**; if `--design` is passed it adds 3-5 design notes, otherwise the section records a recommendation to run `/wf-design` as a follow-up when UI surface is touched. Slicing is skipped by definition (single-slice). Tripwires (warn-and-continue, never block): >3 files touched, >5 implementation steps, new external dependency, architectural change, >2 unanswered open questions. When a tripwire fires the plan is still written but a `Tripwire breaches` section records what tripped and recommends `/wf-intake` for the next change. Default branch is `quick/<slug>`; `branch-strategy: none` is honored when the user is mid-task on an existing branch. Artifacts land in `.ai/workflows/quick-<slug>/` with `workflow-type: quick` in the index. Distinct from `wf-hotfix` (incident response, production-branch base, hard scope lock) and `wf-refactor` (behavior-preserving refactoring with test baseline).

## [8.16.0] - 2026-04-28

### Changed

- **Parallel sub-agent dispatch is now the unconditional expectation across all workflow stages.** Removed `(use sub-agents when supported)` headings from `wf-implement`, `wf-retro`, `wf-shape`, `wf-ship`, and `wf-verify`; removed `when supported` qualifiers from the parallel-research footer guidance in `wf-intake`, `wf-shape`, and `wf-slice`; and removed the `(or scan directly if sub-agents are not available)` parenthetical from `wf-design-setup`. The `wf-design-critique` "If sub-agents are not available... complete each assessment sequentially" fallback was deleted entirely; the preceding sentence now requires parallel dispatch as the only path. Both Claude Code and Codex support concurrent sub-agent dispatch — the hedging language was masking that and giving the model permission to serialize parallelizable work.

- **Codex adapter compatibility rule rewritten from defensive fallback to positive directive.** The boilerplate emitted by `scripts/generate-codex-plugin.mjs` for every generated skill no longer says "if delegation is unavailable... perform the review steps locally or sequentially and state that adaptation." The replacement reads: "When the canonical source asks for parallel sub-agents, dispatch them in parallel. Codex supports concurrent sub-agent dispatch; do not serialize work that the source intends to fan out." Regenerating propagated the change to all 67 `.codex-generated/skills/*/SKILL.md` adapters.

### Fixed

- **Generator no longer strips the word `parallel` from skill descriptions.** `sanitizeCodexDescription` previously rewrote `parallel sonnet sub-agent` -> `review worker`, collapsing both the model-name translation and the parallelism qualifier in one substitution. The rewrite now produces `parallel review worker`, preserving the parallel-dispatch intent in Codex frontmatter descriptions while still translating the Claude-only model name.

## [8.15.0] - 2026-04-16

### Fixed

- **`disable-model-invocation: true` missing from 10 command files.** `wf-resume`, `wf-status`, `setup-wide-logging`, and all 7 aggregate review bundle commands (`review-all`, `review-quick`, `review-pre-merge`, `review-security`, `review-architecture`, `review-infra`, `review-ux`) were missing the frontmatter flag. Without it, invoking these commands created isolated model invocations with no access to the current conversation context — meaning `wf-resume` could not see the session it was supposed to resume. All command files now consistently include `disable-model-invocation: true`.

## [8.14.0] - 2026-04-16

### Added

- **`wf-hotfix` command — compressed incident-response workflow.** Six-stage pipeline (brief → diagnose → plan → implement → verify → ship) with a hard scope lock: the plan is capped at 5 steps, changes beyond the identified root cause require explicit approval, and escalation to a full `/wf-intake` workflow is enforced when the fix touches more than 3 files or requires architectural changes. Replaces the 5-round PO interview with at most 3 questions. Always branches from the production/default branch (`hotfix/<slug>`). Parallel Explore sub-agents for root-cause diagnosis and blast-radius mapping. Artifacts land in `.ai/workflows/hotfix-<slug>/` with `workflow-type: hotfix` in the index.

- **`wf-update-deps` command — dependency audit and update workflow.** Scans all package manifests (npm, pip, go.mod, Cargo.toml, pom.xml, pubspec.yaml), runs the package manager's built-in audit commands, then launches parallel web research sub-agents (batched 3–5 packages each) to check latest versions, changelogs, breaking changes, migration guides, and CVEs per dependency. Updates are grouped into four tiers and implemented in order: P0 security (one at a time, commit per package), P1 major-with-migration (one at a time with migration steps), P2 safe-batch (minor/patch in a single commit), Hold (documented with revisit condition). Never mixes tiers in a single commit. Blocked packages are documented without touching application code. Supports `--security-only` and `--audit-only` flags. Artifacts land in `.ai/dep-updates/<run-id>/`.

- **`wf-docs` command — documentation audit and Diátaxis generation.** Four-pass workflow: discover (inventory all markdown, README, API docs, docstrings), audit (parallel sub-agents check each doc for accuracy vs. codebase, Diátaxis quadrant fit, and freshness), plan (gaps grouped by priority: broken P0 → missing P1 → wrong-quadrant P2 → stale P3), generate (invokes the appropriate Diátaxis skill for each planned action). For `slug` mode, reads the workflow's `02-shape.md → ## Documentation Plan` and fulfills it before adding new docs. Supports `--audit-only` flag to stop after planning. Audit artifacts land in `.ai/docs/<run-id>/`; generated docs are written in-place to project paths.

- **`wf-refactor` command — behavior-preserving refactoring with test baseline.** Five-stage pipeline (brief → baseline → plan → implement → verify) built around a non-negotiable constraint: external behavior must be identical before and after. The baseline stage captures the complete ground truth before any code changes — exported API surface, all callers in the codebase, test pass/fail counts, and coverage gaps — in `rf-baseline.md`. The plan stage researches the target refactoring pattern via web search. Implementation executes one step at a time with a per-step green check; if a test that was passing before now fails, the refactoring is fixed, not the test. Verify does a full before/after comparison against the baseline. Routes to `/wf-review <slug> refactor-safety` after passing. Artifacts land in `.ai/workflows/refactor-<slug>/` with `workflow-type: refactor`.

## [8.13.0] - 2026-04-16

### Changed

- **`wf-shape` sub-agent 2, `wf-plan` web research sub-agent — expanded to cover best practices, gotchas, and performance pitfalls.** Both sub-agents previously only checked dependency versions, official docs, and CVEs. Two new research sections added to each: (1) **Implementation best practices** — searches for established patterns, community consensus on how to implement the feature type correctly, anti-patterns on official docs and engineering blogs, relevant RFCs and platform guidelines, and whether the implied approach is idiomatic or considered an anti-pattern in the current ecosystem. (2) **Known gotchas and performance pitfalls** — searches for common performance traps specific to the feature type (re-renders, N+1, layout thrash, bundle size, memory leaks), community "lessons learned" and postmortems, and known library quirks. Merge instructions updated to require that best practices and gotcha findings directly influence acceptance criteria (at shape) and implementation steps (at plan), not just land in `## Freshness Research` as passive records.

## [8.12.0] - 2026-04-16

### Changed

- **`wf-shape` — web search sub-agent now fires by default (opt-out, not opt-in).** The previous gate ("When the shaped spec touches multiple domains") meant Explore sub-agent 2 almost never launched — most features are single-domain. Replaced with explicit opt-out criteria: skip only if ALL five conditions are true (zero new external dependencies, no changes to existing dependency API surface, not security-sensitive, no browser/platform APIs, no external API integrations). When in doubt: always launch. Step 4 instruction updated to reference the new skip criteria rather than the old "if multi-domain" condition.

- **`wf-plan` — web research sub-agent now fires by default (opt-out, not opt-in).** The previous top-level "Do not spin up sub-agents for trivial or single-file work" gate was being applied too broadly, causing the web research agent to be skipped unless the user explicitly requested it in arguments. Top-level gate changed to "skip criteria are per-agent and intentionally narrow — do not apply a blanket trivial exemption." Web research sub-agent section now opens with "Launch this sub-agent for every slice" and lists narrow opt-out conditions: pure refactoring with no dependency changes, config/env-only changes, or text/copy/i18n changes only. Explicit "Do NOT skip because the slice feels small" rule added.

## [8.11.0] - 2026-04-16

### Changed

- **`wf-plan` Explore sub-agent 1 — reuse scan added.** Before planning new implementations, Explore sub-agent 1 now searches the wider codebase for existing utilities and capabilities that partially or fully cover what the slice needs to build. For each slice goal and scope, it greps for keywords, type names, and domain terms across the full codebase; searches for similar logic (data transformations, validation, API wrappers, error handling, business rules); and looks for base classes, mixins, or higher-order functions that could be composed rather than reimplemented. Each candidate is reported with file:line, description, match quality, and a recommendation: reuse as-is / reuse with modification / extract into shared utility / implement fresh. Explicit "No reuse candidates found" required if nothing is found. Per-slice plan template updated with a `## Reuse Opportunities` section between `## Current State` and `## Likely Files / Areas to Touch`.

## [8.10.0] - 2026-04-16

### Added

- **`wf-how` command — five-mode question-answering and research system.** Standalone command that answers questions about the codebase, workflow artifacts, and external research topics without advancing workflow state. Routes automatically across five modes based on question signals: Mode A (Quick) — single Explore sub-agent for narrow single-function/file questions; Mode B (Codebase Explain) — 1 agent for simple questions, 2–4 parallel Explore agents + synthesis for complex architectural questions; Mode C (Deep Research) — 6–8 parallel web research agents targeting 200+ sources with a synthesis pass; Mode D (Workflow Explain) — reads target artifact(s) and explains commitments, rationale, and implications; Mode E (Findings Explain) — structured explanation of review and verification findings with root-cause clusters and recommended fix order. Step 0 parses args for explicit flags (`--research`, `--quick`), slug+artifact shortcuts (`<slug> plan`), and natural language signals. Every mode offers a Diátaxis output option (Explanation, Reference, or How-to). Artifacts written to `.ai/workflows/<slug>/90-how-*.md` when a workflow is active, `.ai/research/<topic>-<ts>.md` otherwise.

## [8.9.0] - 2026-04-13

### Added

- **`wf-ideate` command — proactive codebase ideation.** Pre-pipeline utility that scans the codebase with six parallel sub-agents across distinct lenses (code quality & technical debt, performance & scalability, security & privacy, developer experience, feature completeness, architecture & design patterns), then generates 30+ raw improvement candidates. Each candidate is challenged by a mandatory 5-test adversarial filter (real evidence, not already in progress, effort justified, specific enough to intake, right level vs. symptom). Surviving candidates are scored as `(impact_value × feasibility) / effort_value` and ranked. Results are presented via `AskUserQuestion` with multiSelect, and the full ranked+culled list is written to `.ai/ideation/<focus>-<timestamp>.md`. Optional arguments: `[focus-area]` to narrow to a single lens, `[count]` to cap the output list. Inverts the normal flow — surfaces what you might not have thought to ask about, then feeds directly into `/wf-intake`.

## [8.8.0] - 2026-04-14

### Changed

- **`wf-handoff` — aggregate-by-default, no slice argument required.** Redesigned from per-slice to PR-level. Without a slice argument, handoff now reads `03-slice.md` and aggregates all `status: complete` slices on the branch into a single PR description — which is how PRs actually work. Explicit `[slice-slug]` argument retained for the uncommon one-PR-per-slice pattern. `08-handoff.md` frontmatter updated: `slice-slug` (single) replaced by `slice-slugs` (array) and `handoff-mode: aggregate|single-slice`. The `refs.implements` field now lists all per-slice implement artifacts. Routing updated: handoff Option C changed from "next slice" (wrong level) to "implement remaining slices first, then re-run handoff". `next-invocation` no longer includes a slice.

- **`wf-ship` — slug-level only, slice argument removed.** Ship operates on the PR and branch — never on a slice. The `[target-or-slice]` second argument is replaced with `[environment]` (optional override for deployment target, e.g. `staging`, `eu-west`). `slice-slug` removed from `09-ship.md` frontmatter; `environment` field added. Option E ("next slice") removed from adaptive routing — if more slices remain, that decision belongs at the review/handoff level, not ship. Prerequisite check tightened: `08-handoff.md` with `status: complete` is now required (was "recommended"). Task metadata updated to remove slice reference.

- **`wf-review` — routing updated to match handoff/ship changes.** Option A now routes to `/wf-handoff <slug>` (no slice), with explicit guidance that handoff should run after all intended slices are complete. Option C routes to `/wf-ship <slug>`. Header table `Next` field updated with correct invocations for all four paths.

## [8.7.0] - 2026-04-13

### Added

- **`wf-amend` command** — Spec correction utility. Corrects the *definition* of existing slices — goal, acceptance criteria, scope boundaries, or fundamental approach — without overwriting completed work. Three source modes: `from-review` (extracts spec errors from `07-review.md` findings), `from-retro` (extracts corrections from `10-retro.md`), or manual. Creates versioned amendment artifacts (`02-shape-amend-<N>.md`, `03-slice-<slug>-amend-<N>.md`) alongside originals. Tracks what changed vs. the original and what implementation work is still valid. Routes to `wf-plan` directed-fix mode for the corrected plan. Distinct from `wf-extend` (new scope) and `wf-implement` (bug fixes).

- **`wf-extend` command** — Scope expansion utility. Adds net-new slices to any workflow — in-progress or completed — without modifying existing slice files or any `status: complete` entries. Three source modes: `from-review` (extracts missing-capability findings from `07-review.md`), `from-retro` (extracts follow-up work from `10-retro.md`), or general (user describes new scope). Runs a focused 4–8 question discovery interview, confirms proposed slices, then appends new `03-slice-<new-slug>.md` files and updates the master `03-slice.md` non-destructively (extension round tracking, dependency ordering, insertion position). Routes to `wf-plan` for new slices.

### Changed

- **`wf-review` — adaptive routing extended with amend and extend options.** Two new routing options added to the post-review decision tree: Option E (`/wf-extend <slug> from-review`) for when findings reveal missing capability rather than broken code; Option F (`/wf-amend <slug> from-review`) for when findings reveal the spec itself was wrong. Both options also added to the `## Recommended Next Stage` template in `07-review.md`. Header table updated to surface all four next-command possibilities.

## [8.6.0] - 2026-04-13

### Changed

- **`wf-announce` — Diátaxis integration, channel formatting, doc linking.** Three additions: (1) New Step 2 checks `08-handoff.md → ## Documentation Changes` for existing docs and `02-shape.md` frontmatter for planned-but-missing docs, then invokes the appropriate Diátaxis skill (`how-to-guide-writer`, `reference-writer`, `tutorial-writer`, `explanation-writer`, `readme-writer`) before drafting — so announcements always have docs to link to. (2) Audience question now paired with a channel question (Slack/chat, Email, GitHub Release, wiki/Notion) that shapes tone and length. (3) Each announcement draft now includes a Docs section linking to generated/existing docs, plus channel-specific formatting rules (Slack = 5–8 lines + emoji ok, Email = prose + headers, GitHub Release = markdown + code blocks, wiki = full structured format).

## [8.5.0] - 2026-04-13

### Changed

- **`wf-review` — broader, smarter review command selection.** Two fixes: (1) `reliability` was present as a command file but had no signal mapping and would never be selected — now always included for backend source changes alongside `testing` and `maintainability`. (2) Selection logic shifted from "detect patterns in the raw diff" to "reason from what the feature does using shape and slice artifacts" — features described as async, data-mutating, or API-surface-changing now trigger the right commands even when the diff text doesn't contain the specific keywords. Max raised from 12 to 15. Added explicit "when in doubt, include" rule to invert the default from exclusion to inclusion.

## [8.4.0] - 2026-04-13

### Changed

- **`wf-shape` — descriptive 20-question discovery framework.** Questions are not hardcoded — the agent generates them dynamically based on the specific feature from intake. The framework defines *what to ask about* in each round (what it does, how it behaves, what it looks like, what can go wrong, where the boundaries are) and *how to construct good questions* (feature-specific, impartial options, building on earlier answers). Later rounds adapt based on answers from earlier rounds.

- **`wf-slice` — descriptive discovery phase (4–8 questions).** Replaced one-liner "ask a small set of questions" with descriptive guidance covering delivery order preferences, slice granularity, rollout coupling, and scope cuts. Questions generated dynamically from the shaped spec.

- **`wf-plan` — descriptive discovery phase (8–12 questions).** Added user interview before writing new plans (skipped in review-and-fix modes). Covers implementation approach tradeoffs, sequencing decisions, test strategy, and risk/unknowns — all grounded in sub-agent codebase findings.

## [8.3.0] - 2026-04-13

### Changed

- **`wf-shape` — 20-question feature discovery phase.** Replaced the vague "mandatory-question stage" with a descriptive framework for a 20-question interview using AskUserQuestion across 5 rounds of 4. Questions are not hardcoded — the agent generates them dynamically based on the specific feature from intake. The framework defines *what to ask about* in each round (what it does, how it behaves, what it looks like, what can go wrong, where the boundaries are) and *how to construct good questions* (feature-specific, impartial options, building on earlier answers). Later rounds adapt based on answers from earlier rounds.

## [8.2.0] - 2026-04-12

### Added

- **`wf-announce` command** — Post-ship communication utility. Generates stakeholder-facing announcements tailored by audience (engineering, product, users) from workflow artifacts. Pulls from `08-handoff.md` and `09-ship.md` to draft plain-language, jargon-free copy with distinct voice and structure per audience: technical details and rollback plans for eng, business value and metrics impact for product, benefit-oriented what's-new for users. Writes `announce.md` to the workflow directory. Includes writing rules (active voice, no filler, specific over vague, scannable formatting) and audience selection via AskUserQuestion.

## [8.1.0] - 2026-04-12

### Added

- **`wf-sync` command** — Reality reconciliation for workflows. Cross-references all code files, test files, branches, PRs, and dependencies mentioned in workflow artifacts against the actual codebase state. Produces a `00-sync.md` sync report with health rating (in-sync / minor-drift / significant-drift / stale), per-category status tables, drift details, and recommended actions. Especially valuable mid-flight (stages 4–7) when long-running workflows can go stale from teammate merges, library releases, or config changes.

- **`wf-validate` hook** (PreToolUse: Write) — Structural integrity gate for workflow files. Validates every write to `.ai/workflows/` before it happens:
  - Slug stability: frontmatter `slug` must match the workflow directory name
  - Required fields: `schema` (must be `sdlc/v1`), `type`, and `slug` must be present
  - Stage file naming: must follow `NN-stagename.md` convention (with support for substages like `02b-design.md` and utility files like `risk-register.md`)
  - Blocks non-conforming writes with structured error messages fed back to Claude for self-correction

### Changed

- Hook count: 3 → 4 (added PreToolUse alongside existing SessionStart, PostToolUse, PreCompact)
- Lifecycle command count: 18 → 20 (added wf-sync; wf-validate is a hook, not a command, but the total reflects the new sync command plus the count correction for previously uncounted wf-skip and wf-amend stubs)

## [8.0.0] - 2026-04-12

### Added — Design quality system (5 commands + 14 skills + 13 reference files)

Based on [impeccable-style-universal](https://impeccable.style) v2.1.1 by Anthropic (Apache 2.0), adapted for the SDLC workflow pipeline.

#### 5 Design Commands (namespaced under `wf-design:`)
- **`wf-design`** — top-level design brief command. Discovery interview + UX strategy → `02b-design.md` artifact. Slots between shape (stage 2) and slice (stage 3) in the pipeline. Includes codebase exploration sub-agent for existing design system, component library, and tech stack discovery.
- **`wf-design:setup`** — one-time design context setup. Gathers brand personality, audience, aesthetic direction, accessibility requirements. Writes `.impeccable.md` to project root. All design commands and skills require this context.
- **`wf-design:critique`** — scored UX review using Nielsen's 10 heuristics (0-40 scale), cognitive load assessment, persona-based testing, and automated anti-pattern detection via `npx impeccable`. Produces `06b-critique.md` with prioritized `/design-*` skill recommendations.
- **`wf-design:audit`** — scored technical quality audit across 5 dimensions (accessibility, performance, theming, responsive, anti-patterns) on a 0-20 scale with P0-P3 severity ratings. Produces `06c-audit.md`.
- **`wf-design:extract`** — design system extraction: identifies reusable components, design tokens, and patterns, then extracts, enriches, and migrates to a shared design system.

#### 14 Design Skills (composable refinement tools)
- **`design-bolder`** — amplify bland designs with more visual impact
- **`design-quieter`** — tone down aggressive designs to refined sophistication
- **`design-colorize`** — add strategic color to monochromatic interfaces
- **`design-typeset`** — fix typography hierarchy, font choices, readability
- **`design-layout`** — improve spacing, visual rhythm, and composition
- **`design-animate`** — add purposeful animations and micro-interactions
- **`design-delight`** — add moments of joy, personality, and polish
- **`design-clarify`** — improve UX copy, error messages, labels, instructions
- **`design-distill`** — strip designs to their essence, remove complexity
- **`design-harden`** — production-ready: error handling, i18n, edge cases, onboarding
- **`design-optimize`** — diagnose and fix UI performance issues
- **`design-adapt`** — make designs responsive across devices and contexts
- **`design-overdrive`** — push interfaces past conventional limits (shaders, spring physics, 60fps)
- **`design-polish`** — final quality pass: alignment, spacing, consistency, micro-details

#### 13 Design Reference Files (bundled in `reference/design/`)
- `design-guidelines.md` — core design principles, anti-patterns, AI slop detection, Context Gathering Protocol
- `typography.md`, `color-and-contrast.md`, `spatial-design.md`, `motion-design.md`, `interaction-design.md`, `responsive-design.md`, `ux-writing.md` — deep reference material for each design dimension
- `craft.md`, `extract.md` — workflow reference for build and extraction flows
- `cognitive-load.md`, `heuristics-scoring.md`, `personas.md` — evaluation frameworks for critique

#### Architecture
- **Commands** produce SDLC artifacts with YAML frontmatter (workflow stages)
- **Skills** modify code directly without workflow ceremony (composable refinement)
- **critique and audit** generate ordered action plans dispatching design skills by name
- **Pipeline integration**: `wf-intake → wf-shape → wf-design → wf-slice → wf-plan → wf-implement → [design-* skills] → wf-design:audit → wf-design:critique → [design-* fixes] → design-polish → wf-verify → ...`

### Changed
- Plugin description updated to reflect 18 lifecycle commands and 25 skills
- Added design, ux, accessibility, typography, responsive keywords

## [7.12.0] - 2026-04-12

### Added — `wf-resume` context recovery command
- **`wf-resume`** — new command that reads the full workflow trail (all stage files + `po-answers.md`) and distills it into a dense ~500-word context brief for resuming after a break, onboarding a sub-agent, or recovering context in a new session.
  - Reads every existing stage file's frontmatter and body, extracting: key decisions, acceptance criteria status, deviations, test results, open findings, blockers
  - Synthesizes `po-answers.md` into only the decisions that constrain future work (discards superseded decisions)
  - Checks branch state and warns if user is on wrong branch
  - Builds slice progress matrix if sliced
  - Strict token budget: ~200 words for early workflows, up to 600 for complex multi-slice workflows with review findings
  - Writes `90-resume.md` as a persistent artifact sub-agents can reference
  - Chat output IS the brief — no preamble, no footer, maximum signal density
  - Unlike `wf-next` (reads only index, returns next command) and `wf-status` (reads indexes across workflows, renders dashboard), `wf-resume` reads ALL artifacts in one workflow and distills the full decision history
- Plugin description updated to reflect 13 lifecycle commands.

## [7.11.0] - 2026-04-11

### Added — `wf-status` dashboard command
- **`wf-status`** — new read-only command that renders a grouped dashboard across all workflows. No side effects, no artifacts written.
  - **Dashboard mode** (`/wf-status`): Globs all `.ai/workflows/*/00-index.md`, parses frontmatter, groups workflows into Active / Blocked / Completed tables with slug, title, stage, status, slice, last updated, next command. Includes staleness detection (>7 days), branch summary for dedicated-branch workflows, and quick-actions section.
  - **Detail mode** (`/wf-status <slug>`): Single-workflow deep view with stage progress table (✓/→/✗/· per stage), slice progress matrix (plan through ship per slice), key metrics (files changed, review findings, acceptance criteria, interactive checks), open questions, branch info with mismatch warnings, and next-step options.
- Plugin description updated to reflect 12 lifecycle commands (10 stages + wf-next + wf-status).

## [7.10.0] - 2026-04-11

### Added — dev-browser as preferred web verification tool
- **`wf-verify`** — web verification now uses a prioritized tool chain: (1) `dev-browser` (preferred — sandboxed Playwright, persistent pages, `page.snapshotForAI()`, screenshots to `~/.dev-browser/tmp/`), (2) Chrome MCP tools (`mcp__claude-in-chrome__*`) as fallback, (3) Playwright directly if configured. Includes installation prompt if dev-browser is not available and the project is a web app.
- **`wf-verify`** — web verification section includes complete dev-browser usage patterns: heredoc scripts, persistent named pages, `--headless` vs `--connect` modes, AI-friendly DOM snapshots.
- **`wf-shape`** — exploration sub-agent now checks for `dev-browser` availability and recommends installation for web projects.
- **`wf-plan`** — test infrastructure sub-agent now checks for `dev-browser` and Chrome MCP tools, reports gaps for web projects.
- All three commands replace vague "agent-browser/dev-browser" references with concrete tool detection and usage patterns.

## [7.9.0] - 2026-04-11

### Added — Interactive & visual verification (human-in-the-loop testing)
- **`wf-shape`** — new `## Verification Strategy` section in the shape template classifying each acceptance criterion as `automated`, `interactive`, or `manual`. Interactive criteria must specify platform, tool, and evidence capture method.
- **`wf-shape`** — exploration sub-agent 1 now discovers interactive verification tooling: E2E frameworks (Playwright, Maestro, Detox, Cypress), device tooling (adb, emulators), browser automation (chrome MCP tools, agent-browser/dev-browser), screenshot/visual regression infrastructure, dev server scripts, and QA checklists.
- **`wf-shape`** — acceptance criteria template now requires verification method classification per criterion.
- **`wf-plan`** — test infrastructure sub-agent now discovers interactive verification tooling and maps it to acceptance criteria from the shape's verification strategy.
- **`wf-plan`** — `## Test / Verification Plan` template split into automated checks and interactive verification sections with per-criterion platform, tool, steps, evidence capture, and pass criteria.
- **`wf-verify`** — replaced narrow "UI & Accessibility" sub-agent with comprehensive "Interactive & Visual Verification" sub-agent covering:
  - **Web**: Playwright / browser automation — start dev server, navigate, interact, screenshot, read screenshot, check console/network
  - **Android**: adb / Maestro — build, install, launch, run flows, screencap, read screenshot, check logcat
  - **iOS**: xcrun simctl / XCUITest / Detox — build, screenshot, run existing test suites
  - **CLI**: run commands, capture stdout/stderr, verify output format
  - **Desktop**: automation tools, screenshot capture
  - **Evidence protocol**: screenshot per criterion, stored in `.ai/workflows/<slug>/verify-evidence/`, referenced in report
- **`wf-verify`** — template gains `## Interactive Verification Results` section with per-criterion evidence chain (tool, steps, screenshot path, observation, result).
- **`wf-verify`** — frontmatter gains `metric-interactive-checks-run`, `metric-interactive-checks-passed`, `evidence-dir` fields.

## [7.8.0] - 2026-04-11

### Changed — Extensive sub-agent exploration playbooks across the pipeline
- **`wf-shape`** — replaced vague 3-line sub-agent instructions with detailed exploration playbook:
  - Explore sub-agent 1: 5 sections (directory/module structure, existing patterns/conventions, integration surfaces, data flow, test structure) each with 3–5 specific investigation items
  - Explore sub-agent 2: 4 sections (dependency versions/compatibility, library documentation/patterns, security advisories, ecosystem context) each with 3–4 specific items
- **`wf-plan`** — replaced vague single-plan instructions with 4 detailed sub-agent playbooks:
  - Explore sub-agent 1 (Affected Code Deep Dive): files/modules, call graph/dependency chain, existing patterns, integration surfaces
  - Explore sub-agent 2 (Second Domain): domain-specific structure, cross-domain contract — launched only when slice crosses domain boundaries
  - Explore sub-agent 3 (Test Infrastructure): framework/config, existing coverage, test helpers, test patterns
  - Web research sub-agent: dependency freshness, API/library patterns, security/known issues
  - Enhanced parallel plan mode with specific cohesion check items (shared files, migrations, test fixtures, API contracts, config)
- **`wf-implement`** — replaced vague 3-line pre-implementation check with 2 detailed sub-agent playbooks:
  - Explore sub-agent 1 (Pre-Implementation Codebase Verification): plan drift detection, current state verification, convention verification
  - Explore sub-agent 2 (Dependency & API Freshness): dependency state, cross-service state — launched only when external dependencies involved
- **`wf-verify`** — replaced vague 4-line sub-agent list with 4 detailed functional sub-agent playbooks:
  - Functional sub-agent 1 (Static Analysis & Build): lint/format, type checking, build verification with specific commands per ecosystem
  - Functional sub-agent 2 (Test Execution): unit tests, integration tests, coverage — with targeted then full-suite strategy
  - Functional sub-agent 3 (UI & Accessibility): visual verification, accessibility checks — launched only for frontend changes
  - Web research sub-agent 4 (Freshness Impact): dependency drift, known issues — launched only when external deps could affect tests
- **`wf-ship`** — replaced vague 3-line sub-agent list with 3 detailed sub-agent playbooks:
  - Web research sub-agent 1 (Deployment Target & Platform Status): platform health, version requirements, breaking changes
  - Web research sub-agent 2 (Dependency Security & Advisories): CVEs since implementation, known issues affecting release
  - Explore sub-agent 3 (CI/CD & Release Infrastructure): CI config, release scripts, rollback capability
- **`wf-retro`** — replaced vague 3-line sub-agent list with 3 detailed analysis sub-agent playbooks:
  - Analysis sub-agent 1 (Implementation & Verification Friction): plan drift, verification effectiveness, time/iteration analysis
  - Analysis sub-agent 2 (Review & Handoff Quality): findings analysis, handoff completeness, communication gaps
  - Explore sub-agent 3 (Repo Infrastructure Improvement): CLAUDE.md/AGENTS.md gaps, hook/automation opportunities, test/CI gaps

## [7.7.0] - 2026-04-03

### Added — PreCompact hook and stage-boundary compaction guidance
- **`hooks/scripts/pre-compact.sh`** — PreCompact hook that fires before every context compaction. Reads active workflow state from `00-index.md` (slug, stage, slice, branch, progress, open questions, next command) and outputs plain-text instructions telling the compaction model what to preserve in the summary.
- **Stage-boundary compact recommendations** in adaptive routing for tier 1 transitions:
  - `wf-plan` → implement: compact recommended (planning research is noise for coding)
  - `wf-implement` → verify: compact recommended (debugging/file exploration is noise for testing)
  - `wf-implement(reviews)` → re-verify/re-review: compact recommended (fix context is noise)
  - `wf-review` → implement(reviews): compact recommended (dispatch chatter is noise for fixing)
  - `wf-review` → next slice: compact recommended (previous slice lifecycle is noise)
  - `wf-verify` → review: compact if lengthy (test output is noise for review dispatch)
- **`hooks/hooks.json`** updated with PreCompact event registration (10s timeout, matches all triggers)

### Changed
- 5 commands gain "Compact recommended" annotations on routing options: `wf-plan`, `wf-implement`, `wf-verify`, `wf-review`

## [7.6.0] - 2026-04-03

### Added — Code Simplification review command (ported from built-in `/simplify`)
- **`review/code-simplification`** — new review command covering three simplification lenses:
  - **Lens 1: Code Reuse** — flags new code that duplicates existing utilities, helpers, or patterns in the codebase
  - **Lens 2: Code Quality** — flags redundant state, parameter sprawl, copy-paste duplication, leaky abstractions, stringly-typed code, dead code, unnecessary comments
  - **Lens 3: Efficiency** — flags unnecessary work, missed concurrency, hot-path bloat, no-op updates, TOCTOU anti-patterns, memory leaks, overly broad operations
- **Report-only** — unlike the built-in `/simplify` which auto-fixes, this command diagnoses and reports. Fixes route through `/wf-implement`.
- **Always dispatched by `wf-review`** — added to the core set alongside `correctness` and `security` (minimum 3 commands, up from 2)
- **Always dispatched by `wf-review`** — added to the core set alongside `correctness` and `security` (minimum 3 commands, up from 2)
- **AskUserQuestion triage gate on ALL review findings** — wf-review gains Step 4b after aggregation: ALL deduplicated findings (from every review command) are presented via AskUserQuestion. BLOCKER/HIGH presented individually (Fix/Defer/Dismiss), MED as multi-select batch, LOW/NIT listed in report only. Triage decisions recorded in master `07-review.md` and drive recommendations.
- **Manual re-triage** — `/wf-review <slug> triage` re-reads `07-review.md`, presents only `deferred` and `untriaged` findings via AskUserQuestion, updates decisions in-place. Use to revisit deferred decisions at any point.

### Changed
- `wf-review` gains `triage` mode as second argument (`/wf-review <slug> triage`)
- `wf-review` gains Step 4b (triage gate) between aggregation and verdict writing — applies to ALL findings
- `wf-review` master `07-review.md` template gains `## Triage Decisions` section and deferred/dismissed categories in recommendations
- `wf-review` Step 2 selection: core set now includes `code-simplification` (always dispatched)
- `wf-review` minimum commands: 2 → 3
- `wf-review` config/docs-only exception drops `code-simplification`; test-only exception keeps it
- Review command count: 30 → 31

## [7.5.0] - 2026-04-03

### Added — PostToolUse hook for auto-staging during implement (D6)
- **`hooks/scripts/auto-stage.sh`** — PostToolUse hook that auto-stages files after every Write/Edit during implement stage
- Activates only when an active workflow has `current-stage: implement` AND `branch-strategy: dedicated` or `shared`
- Fast bail-outs: opt-out flag (`.ai/.no-auto-stage`), no workflows dir, missing tools (yq/jq/git), no file path, workflow artifact files excluded
- Best-effort staging — never blocks file writes (exit 0 always)
- **`hooks/hooks.json`** updated with PostToolUse matcher for `Write|Edit` (5s timeout)

## [7.4.0] - 2026-04-03

### Changed — Standardize PO questions via AskUserQuestion (D5)
- **`wf-intake`**: Branch strategy and appetite questions now use AskUserQuestion with structured options (dedicated/shared/none, small/medium/large). Freeform chat retained for requirements, constraints, and acceptance criteria.
- **`wf-shape`**: Risk tolerance question uses AskUserQuestion (conservative/balanced/move-fast) when risk is unclear. Freeform chat retained for behavior, acceptance criteria, and non-goals.
- **`wf-ship`**: Rollout strategy (immediate/staged/canary/feature-flag), merge strategy (rebase/squash/merge-commit), and go/no-go decision all use AskUserQuestion. Freeform chat retained for environment details and rollback tolerance.
- **All 11 commands**: Workflow rule updated from "Prefer AskUserQuestion" to explicit guidance — use AskUserQuestion for multiple-choice, freeform chat for open-ended. Each command's rule text is tailored to its specific question types.

## [7.3.0] - 2026-04-03

### Added — SessionStart hook for workflow discovery (D3)
- **`hooks/hooks.json`** — plugin hook registration for SessionStart event
- **`hooks/scripts/workflow-discovery.sh`** — bash script that scans `.ai/workflows/*/00-index.md` for active workflows at session start
- Outputs compact summary injected into Claude's context via `systemMessage`:
  - Slug, title, current stage, status, selected slice
  - Branch name with correct/wrong branch detection (compares git HEAD to workflow's `branch` field)
  - PR URL if exists
  - Recommended next command
  - Open questions if any
- Handles multiple active workflows, completed/abandoned filtering, missing directories, malformed frontmatter
- Silent (no output) when no active workflows exist
- Pure bash implementation — no `yq` or external YAML parser required
- 10-second timeout to keep session start fast

## [7.2.0] - 2026-04-03

### Added — Task-based progress tracking (D1)
- **6 commands now use TaskCreate/TaskUpdate** for structured progress tracking visible in the CLI spinner:
  - `wf-implement` (normal): creates tasks from plan step-by-step items with dependency chains where steps are sequential
  - `wf-implement` (reviews): creates tasks from review findings (BLOCKER/HIGH/MED), each with findingId and severity in metadata
  - `wf-verify`: creates tasks for each check (lint, typecheck, tests) and acceptance criterion, with integration tests blocked by unit tests
  - `wf-review`: creates tasks for each dispatched review command (independent/parallel), aggregation blocked by all dispatches
  - `wf-handoff`: creates a strict sequential chain (read artifacts → summary → docs → push → PR → write artifact), inapplicable tasks deleted
  - `wf-ship`: creates the full merge sequence chain (rollout questions → freshness → readiness → go/no-go → rebase → CI → merge → cleanup → write artifact), failures halt the chain via blockedBy
- **Dependency tracking** with `addBlockedBy`: sequential steps are chained so downstream tasks stay blocked if a step fails. Independent steps (review findings, review commands) have no dependencies and can be worked in any order.
- **Metadata convention**: all tasks carry `{ slug, stage, slice }` plus stage-specific fields (`findingId`, `severity`, `command`), enabling future cross-workflow querying
- **Failed items recorded, not hidden**: when a step fails, its description is updated with the failure reason before marking completed. Inapplicable items use `TaskUpdate(status: "deleted")`

### Changed
- `wf-implement` step sequence renumbered (12 → 13 steps in normal mode, 6 → 7 steps in reviews mode)
- `wf-verify` step sequence renumbered (9 → 10 steps)
- `wf-handoff` step sequence renumbered (7 → 10 steps)
- `wf-ship` step sequence renumbered (9 → 10 steps)
- `wf-review` gains `# Task Tracking` section between chat return contract and Step 1

## [7.1.0] - 2026-04-02

### Added — Diátaxis documentation framework integration
- **7 Diátaxis skills absorbed** from the diataxis plugin:
  - `diataxis-doc-planner` — classifies docs into Diátaxis quadrants, proposes docs map and writing order
  - `tutorial-writer` — learning-oriented step-by-step lessons for beginners
  - `how-to-guide-writer` — goal-oriented guides for competent users
  - `reference-writer` — neutral, scannable technical reference (API, CLI, config)
  - `explanation-writer` — understanding-oriented content (why, trade-offs, architecture)
  - `readme-writer` — README as landing page, not a quadrant
  - `docs-reviewer` — audit docs against Diátaxis principles with prioritised fixes
- **`wf-shape` now produces a Documentation Plan** — classifies what docs the feature needs using the Diátaxis model. Each entry specifies type, audience, what to cover, and boundary constraints. Frontmatter gains `docs-needed` and `docs-types` fields.
- **`wf-handoff` now generates documentation** — reads the shape's docs plan and writes/updates docs using the appropriate Diátaxis writer skill for each type. Respects boundary discipline (won't mix types in one file). Frontmatter gains `has-docs-changes` and `docs-generated` fields. Template gains `## Documentation Changes` section.
- **`review/docs` enhanced with Diátaxis structural review** — now classifies every doc page by actual type (not title), flags boundary violations (tutorial drifting into explanation, reference giving opinions, etc.), checks system completeness across all four quadrants, and gives specific rewrite recommendations ("split into separate page" not "improve clarity").

### Changed
- `wf-shape` template gains `## Documentation Plan` section and `docs-needed`/`docs-types` frontmatter
- `wf-handoff` template gains `## Documentation Changes` section and `has-docs-changes`/`docs-generated` frontmatter
- `review/docs` gains `## 0. Diátaxis Structural Review` checklist section before the existing checklist

## [7.0.0] - 2026-04-02

### Added — Git lifecycle integration
- **Branch-aware workflow**: Intake now asks whether the work should happen on a dedicated feature branch. Three strategies: `dedicated` (full git lifecycle), `shared` (commits to current branch), `none` (no git management).
- **`00-index.md` gains branch fields**: `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number` — tracked from intake through ship.
- **`wf-implement` creates branches and commits atomically**:
  - On first slice implementation, creates the feature branch (`feat/<slug>` by default) from `base-branch` if `branch-strategy: dedicated`.
  - After each slice implementation, stages and commits all changes with `feat(<slug>): implement <slice-slug>`.
  - Review fixes commit as `fix(<slug>): review fixes for <slice-slug>`.
  - Nothing is pushed until handoff.
- **`wf-handoff` pushes and creates PRs**: If `branch-strategy: dedicated`, pushes the branch and creates a PR via `gh pr create` using the handoff summary as the PR body. Records `pr-url` and `pr-number` in frontmatter and index.
- **`wf-ship` rebases and merges**: If go-nogo is approved, rebases the feature branch onto the base branch and merges the PR. Supports three merge strategies: rebase-and-merge (default), squash-and-merge, merge commit. Checks CI status before merging. Handles rebase conflicts by recommending return to implement.
- **Branch checks on verify and review**: Both stages confirm they're on the correct branch before running tests or generating diffs.
- **`wf-next` reports branch mismatches**: Warns if you're on the wrong branch for the active workflow.
- **Per-slice implement frontmatter gains `commit-sha`** for tracking which commit contains each slice's changes.
- **Ship frontmatter gains** `merge-strategy`, `merge-sha`, `branch`, `base-branch`, `pr-url`, `pr-number`.
- **Handoff frontmatter gains** `pr-url`, `pr-number`, `branch`, `base-branch`.

### Changed
- **`wf-ship` execution discipline relaxed**: No longer says "Do NOT merge" — now says "Do NOT fix code" while allowing rebase and merge as the final shipping action.
- **`wf-handoff` execution discipline updated**: Now includes pushing and PR creation as part of its responsibilities.
- Intake PO questions now include branch strategy as a standard question.

### Design Decisions
- **Merge requires explicit confirmation**: Ship always asks before merging — these are visible, irreversible actions.
- **`--force-with-lease`** used for post-rebase push (not `--force`) to prevent overwriting others' work.
- **Branch strategy is recorded once at intake** and read by all downstream stages — no repeated questioning.
- **`shared` and `none` strategies** ensure the workflow works without git management for teams that handle branching externally.

## [6.0.0] - 2026-03-20

### Changed — BREAKING
- **All artifact templates now emit YAML frontmatter** instead of `## Metadata` bullet lists. Every workflow file generated by the commands will have a `---` delimited YAML block as the first thing in the file containing all machine-readable state.
- **`00-index.md` is now pure frontmatter** — no markdown body. Contains: `schema`, `type`, `slug`, `title`, `status`, `current-stage`, `stage-number`, timestamps, `selected-slice`, `open-questions`, `tags`, `next-command`, `next-invocation`, `workflow-files`, `progress` map, and (if slices exist) `slices` summary array.
- **Every artifact frontmatter includes:** `schema: sdlc/v1`, `type`, `slug`, `status`, `stage-number`, `created-at`, `updated-at`, `tags`, `refs` (cross-links to related files), `next-command`, `next-invocation`.
- **Per-slice files** (`03-slice-*.md`, `04-plan-*.md`, `05-implement-*.md`, `06-verify-*.md`) include `slice-slug` and slice-specific fields in frontmatter.
- **Review files** (`07-review.md`, `07-review-*.md`) include `verdict`, `commands-run`, and `metric-findings-*` counts in frontmatter.
- **Ship file** includes `go-nogo` and `rollout-strategy` in frontmatter.
- **Retro file** includes `workflow-outcome` and improvement metrics in frontmatter.
- **All Step 0 orient sections** updated to parse YAML frontmatter instead of bullet-list metadata.
- **All workflow rules** now require YAML frontmatter on every artifact file.

### Design Decisions
- **~8-12 fields per file** — lightweight enough that the agent barely notices, rich enough for any consumer.
- **`schema: sdlc/v1`** in every file for version detection and future migration.
- **`refs` object** for cross-linking — relative paths, role-based keys.
- **`metric-*` prefix** for numeric measurements (findings counts, lines changed, etc.).
- **`progress` map** on `00-index.md` — maps every stage name to its status for instant dashboard rendering.
- **`slices` array** on `00-index.md` — denormalized slice summary for consumers that need a full view from one file.
- **Status enums:** `not-started`, `in-progress`, `awaiting-input`, `complete`, `skipped`, `blocked`.
- Parseable by `yq --front-matter=extract`, Obsidian Dataview, MarkdownDB, or any YAML parser.

## [5.0.0] - 2026-03-20

### Added
- **4 analysis skills** absorbed from session-workflow:
  - `error-analysis` — systematic error/stacktrace/log analysis with root cause identification (includes 4 reference docs: error-categorization, fix-patterns, log-patterns, root-cause-analysis)
  - `refactoring-patterns` — safe, systematic refactoring patterns: extract, rename, move, simplify (includes 4 reference docs)
  - `test-patterns` — test generation and organization patterns: unit, integration, factories, coverage (includes 4 reference docs)
  - `wide-event-observability` — wide-event logging and tail sampling design for context-rich observability
- **`setup-wide-logging` command** absorbed from session-workflow — sets up wide-event logging with tail sampling for Express/Koa/Fastify/Next.js with Pino/Winston/Bunyan

### Removed
- **session-workflow plugin deleted entirely** — all content now lives in sdlc-workflow

### Integration notes
- `error-analysis` skill is available during `wf-implement` and `wf-verify` for debugging failures
- `refactoring-patterns` skill is available during `wf-implement` when the plan calls for refactoring
- `test-patterns` skill is available during `wf-implement` and `wf-verify` for test generation
- `wide-event-observability` skill and `setup-wide-logging` command support the observability review commands (`review/logging`, `review/observability`)

## [4.3.0] - 2026-03-20

### Changed
- **`wf-plan` is now idempotent and self-reviewing.** Re-invoking it on an existing plan no longer overwrites — it auto-reviews. Three sub-modes:
  - **Auto-review (single):** `/wf-plan <slug> <slice>` — re-inspects codebase, compares plan against acceptance criteria, checks sibling plan cohesion, fixes issues found. Reports "no issues" if plan is current.
  - **Review-all:** `/wf-plan <slug> all` — launches parallel sub-agents to review every existing slice plan, cross-checks cohesion, fixes all issues.
  - **Directed fix:** `/wf-plan <slug> <slice> <feedback>` — applies explicit user feedback surgically to existing plan.
- All three sub-modes append to `## Revision History` in each modified plan file, tracking what was changed, why, and the mode that triggered it.

## [4.2.0] - 2026-03-20

### Added
- **`wf-plan` review-and-fix mode** — re-invoke `/wf-plan <slug> <slice> <feedback>` with supplemental text to revise an existing plan without starting from scratch. The command reads the existing plan, applies the feedback, preserves unchanged sections, and appends a `## Revision History` entry documenting what changed and why.
- **`wf-implement reviews` mode** — invoke `/wf-implement <slug> reviews` to fix review findings one by one:
  - Reads `07-review.md` and all per-command review files
  - Extracts BLOCKER and HIGH findings sorted by severity
  - Presents the findings list before starting
  - Spawns one sonnet sub-agent per finding **sequentially** (not parallel — each fix must be verified before the next starts)
  - After each sub-agent completes, verifies the fix is correct and marks it Fixed / Partially Fixed / Could Not Fix
  - Updates `05-implement-<slice>.md` with a `## Review Fixes Applied` section
  - Updates `07-review.md` with a `## Fix Status` tracking table
  - Recommends re-verify after all fixes are applied

## [4.1.0] - 2026-03-20

### Added
- **Per-slice files for slice, plan, and implement stages** with cross-linking:
  - `wf-slice` now writes `03-slice.md` (master index) + `03-slice-<slice-slug>.md` per slice
  - `wf-plan` now writes `04-plan.md` (master index) + `04-plan-<slice-slug>.md` per slice
  - `wf-implement` now writes `05-implement.md` (master index) + `05-implement-<slice-slug>.md` per slice
  - `wf-verify` now writes `06-verify.md` (master index) + `06-verify-<slice-slug>.md` per slice
- **Cross-links in every per-slice file:**
  - Links to master index, sibling slices, upstream (slice def → plan → implement), and downstream (plan → implement → verify → review)
  - Master files contain tables linking all per-slice files with their status
- **Sibling awareness:** `wf-plan` reads existing sibling plans, `wf-implement` reads existing sibling implementations to avoid conflicts on shared files
- **Shared file tracking:** `05-implement-<slice-slug>.md` includes a "Shared Files" section noting files also touched by sibling slice implementations

### Changed
- `wf-verify`, `wf-review`, `wf-handoff` now read per-slice files (`03-slice-<slug>.md`, `04-plan-<slug>.md`, `05-implement-<slug>.md`, `06-verify-<slug>.md`) instead of monolithic stage files
- All downstream commands resolve `slice-slug` before checking prerequisites

## [4.0.0] - 2026-03-20

### Added
- **30 individual review commands** moved from session-workflow plugin:
  accessibility, api-contracts, architecture, backend-concurrency, ci, correctness, cost, data-integrity, docs, dx, frontend-accessibility, frontend-performance, infra-security, infra, logging, maintainability, migrations, observability, overengineering, performance, privacy, refactor-safety, release, reliability, scalability, security, style-consistency, supply-chain, testing, ux-copy
- **7 aggregate review commands** moved from session-workflow:
  review-all, review-architecture, review-infra, review-pre-merge, review-quick, review-security, review-ux
- **Intelligent review dispatch in `wf-review`** — reads workflow artifacts (shape, plan, implementation, verify), gathers change statistics from git diff, selects relevant review commands based on file types and content signals, spawns one parallel sonnet sub-agent per selected command
- **Per-command review files** — each sub-agent writes its findings to `.ai/workflows/<slug>/07-review-<command>.md` instead of returning to chat
- **Aggregation and deduplication** — after all sub-agents complete, wf-review reads all per-command files, merges duplicate findings (same file:line or same root cause), keeps highest severity and most specific evidence, produces unified verdict

### Changed
- **BREAKING: `wf-review` completely rewritten** — no longer does inline review. Now acts as dispatch orchestrator: select → spawn → aggregate → verdict
- `wf-review` produces multiple files: `07-review.md` (master verdict) + `07-review-<command>.md` per selected command

## [3.0.0] - 2026-03-20

### Added
- **Adaptive routing on every command** — each stage now evaluates what should come next instead of blindly pointing to the sequential successor. Every command presents multiple options (default, skip-to, revisit, blocked) with clear reasoning so the user can choose the best path forward.
- **Parallel sub-agent planning (`wf-plan <slug> all`)** — plans all slices concurrently using one sub-agent per slice. Each sub-agent writes its plan directly to `04-plan-<slice>.md`. The main agent then reads all plans, runs a cohesion check for conflicts/gaps/integration points, and writes a master `04-plan.md`.
- **Parallel sub-agent research** on research-heavy stages:
  - `wf-shape`: parallel Explore agents for codebase + web freshness
  - `wf-plan`: parallel Explore agents for code inspection + freshness per slice
  - `wf-implement`: parallel Explore agents to re-check codebase state before editing
  - `wf-verify`: parallel sub-agents for lint/typecheck, tests, accessibility, and freshness
  - `wf-review`: parallel sub-agents for correctness, quality, security, and freshness
  - `wf-ship`: parallel sub-agents for deployment target, dependency advisories, and CI/CD config
  - `wf-retro`: parallel sub-agents for implementation analysis, review analysis, and repo config scanning
- **Skip-to routes** documented in each command's pipeline table (e.g., intake can skip to plan for trivial tasks, implement can skip verify for docs-only changes, verify can skip review for solo projects)
- **Next-slice awareness** on review, handoff, ship, and retro — these stages now check `03-slice.md` for remaining slices and offer "continue to next slice" as an option
- **`wf-next` enhanced** to present ALL options from the current stage's recommendations, check for skip opportunities, and list remaining slices

### Changed
- **BREAKING: Chat return contract** now returns `options:` (multiple) instead of `next:` (single) for all commands except `wf-next`
- Stage file `## Recommended Next Stage` section now contains multiple labeled options (Option A/B/C/D) instead of a single recommendation
- `wf-plan` description updated to reflect dual-mode capability (single slice or all slices)
- `wf-ship` prerequisites relaxed: `08-handoff.md` is now recommended but not strictly required (minimum is `05-implement.md`)

## [2.0.0] - 2026-03-20

### Changed
- **BREAKING: Full rewrite of all 11 commands with intelligent pipeline awareness**
  - Every command now knows its stage number (e.g., "stage 4 of 10") and position in the pipeline
  - Full pipeline map (`1·intake → 2·shape → ... → 10·retro`) shown at the top of every command
  - Requires/Produces/Next table so the model knows exactly what files it depends on and what comes after
- **Step 0 — Orient** added as a mandatory gating step in all commands:
  - Reads `00-index.md` FIRST, before any other work
  - Checks prerequisite files exist — STOPs with actionable error if missing (e.g., "Run `/wf-plan` first")
  - Detects out-of-order execution — WARNs before overwriting a completed stage
  - Checks for `Awaiting input` status on prior stages — STOPs and tells user to resolve pending questions
  - Carries forward `selected-slice-or-focus` and `open-questions` from the index
  - Intake specifically detects resume vs. fresh start vs. overwrite scenarios
- **Compressed shared boilerplate** from ~61 duplicated lines per command to ~10 lines without losing any rules
- `wf-next` simplified to focus on routing — reads index fields and returns the exact invocation

### Removed
- Redundant slug-and-argument-contract section (logic moved into Step 0 orient)
- Verbose freshness/multi-agent/scope rule sections (compressed into compact workflow rules block)

## [1.1.0] - 2026-03-20

### Added
- **Execution discipline guardrails** on all 11 commands — explicit instructions preventing the model from jumping ahead to solve the problem instead of running the workflow stage
- **Detailed how-to README** in Diátaxis style — 13 goal-oriented sections covering every usage pattern
- **IDEAS.md** — 15-item roadmap of high-value improvements

### Fixed
- `/wf-intake` (and all other commands) no longer starts working on the user's task before completing the workflow steps — each command now has a stage-specific "CRITICAL — execution discipline" section that fires before all other instructions

## [1.0.0] - 2026-03-17

### Added
- Initial release of the SDLC workflow plugin — 11 commands covering the full software delivery lifecycle
- **`wf-intake`** — stage 1: converts a rough request into a clear intake brief, creates the workflow folder, captures first product-owner answers, establishes the canonical slug; writes `01-intake.md`
- **`wf-shape`** — stage 2: defines scope boundaries, success criteria, and constraints; writes `02-shape.md`
- **`wf-slice`** — stage 3: breaks the shaped work into user stories with acceptance criteria; writes `03-slice.md`
- **`wf-plan`** — stage 4: creates a task-level implementation plan from the slices; writes `04-plan.md`
- **`wf-implement`** — stage 5: executes the plan, tracks progress against tasks; writes `05-implement.md`
- **`wf-verify`** — stage 6: runs tests and QA checks, records results; writes `06-verify.md`
- **`wf-review`** — stage 7: code review gate, records review findings and sign-off; writes `07-review.md`
- **`wf-handoff`** — stage 8: produces handoff notes and documentation for others; writes `08-handoff.md`
- **`wf-ship`** — stage 9: manages the release (mandatory-question stage before proceeding); writes `09-ship.md`
- **`wf-retro`** — stage 10: retrospective capture; writes `10-retro.md`
- **`wf-next`** — routing helper: reads `00-index.md` to determine current stage and suggests the next command; writes `90-next.md`

### Technical Details
- All commands use `disable-model-invocation: true` — must be invoked explicitly by user or via an Agent spawn
- Workflow artifacts stored under `.ai/workflows/<slug>/` with `00-index.md` as the control file
- `00-index.md` tracks 11 required fields: slug, title, status, current-stage, created, updated, owner, description, tags, blockers, notes
- Product-owner interaction uses the `AskUserQuestion` tool for mandatory confirmation steps (intake, ship)
- Freshness rules: web search before answering questions about external libraries, APIs, or tooling
- Chat return contract: compact summary per command (slug, wrote, next, ≤3 blocker bullets)
