# Feedback Loops & Hardening — Implementation Plan

> Status: **BUILT — all three releases shipped 2026-07-06.**
> R1 = v9.99.0 (EOB single-source + drift guard, W2a–c, W2d–f constraint-forethought cures);
> R2 = v9.100.0 (W1 solutions corpus, W2g repeat-deferral tripwire, W4 ship rollback);
> R3 = v9.101.0 (W3.2 leak guards: lexicon lib + 2 guard entrypoints covering hooks #1–3,
> `semantic` config block, advisory-first, default OFF).
> Deltas from the text below, decided at build time: the plan-completion hard gate for W2d was
> adopted (AskUserQuestion at plan, verify Step 0 refusal as backstop); hooks #1 and #3 share one
> Bash entrypoint (`leak-guard-bash`); ship-plan's rollback conventions extend **Block E** rather
> than adding a separate `## Rollback` block (Block E already owned the rollout/rollback contract).
> The advisory→enforce graduation for W3.2 remains open by design.
>
> Original status: PROPOSED (drafted 2026-07-06).
> Scope constraint (user-set): **no new skills, no new top-level `/wf` keys.** The surface stays at
> 20 keys. Every capability below lands as a mode, phase, step, or shared reference inside existing
> keys. One reassignment folded in: **rollback lives under `/wf ship`** (a second-positional token,
> like `announce`) — not under `ship-plan`, not a new key.

## Summary

Three subsume rounds proved the "fewer keys, smarter routing" thesis; the remaining weaknesses are
not missing commands but **open loops**. This plan closes three of them, plus one ship-safety
addition:

1. **W1 — Knowledge compounding**: nothing learned in one workflow feeds the next. Retro writes
   `10-retro.md` and no stage ever reads it again. Fix: retro distills durable learnings into a
   `.ai/solutions/` corpus; plan's reuse scan reads it.
2. **W2 — Verify/review hardening**: two cheap prompt-level correctness deltas that survived a
   re-check of `docs/verify-gaps.md` against the current references (two gaps cited there are
   already cured — see W2c), plus **four constraint-forethought cures** (W2d–W2g) from the
   2026-07-06 transcript audit of 10 real sessions (Crumb, Playster, PushKit, bot-backend): the
   v9.95 AC-verifiability cure made verify *honest about* missing runtime evidence but did not make
   plan *engineer the evidence path* — deferrals accumulate (one slug peaked at 22 `cleared-by:
   null`) and only clear when a human deploys to prod or walks to a device.
3. **W3 — EOB single-sourcing + enforcement**: the MANDATORY External Output Boundary block is
   inlined in **74 files** in the main tree (audit F1 counted 21 at top level; the full sweep
   including `design/`, `intake/`, `docs/` sub-references is 74) and has drifted into at least 4
   wordings. Fix: extract one predicate-based reference, cite it by name everywhere, then make it
   *enforced* via semantic leak hooks Phase 1.
4. **W4 — Rollback under ship**: `/wf ship <slug> rollback` — a runbook-driven, user-gated reversal
   of a prior ship run, mirroring the `announce` re-run shortcut.

Origin of each item: W1 = CE-COMPARISON #1/#2/#28; W2a–c = CE-COMPARISON #3/#10 + verify-gaps
re-check; W2d–g = 2026-07-06 constraint-forethought transcript audit (user-confirmed complaint:
"verification needs prod before it can work"); W3 = PROGRESSIVE-DISCLOSURE-AUDIT F1/F2 +
HOOKS-SEMANTIC-PLAN Phase 1; W4 = IDEAS.md #15 (`wf-rollback`), reassigned by the user from a
standalone key to a `ship` phase.

---

## W1 — Knowledge compounding: `.ai/solutions/` corpus

**Problem.** Every workflow starts from zero. Retro already harvests friction, root causes, and
debt (`retro.md` Step 3 merge), but the output is trapped in that workflow's directory. Plan's
build-avoidance ladder (`plan.md`, "Build-avoidance ladder" + "Rung 3 — reuse opportunities")
rediscovers the same repo facts every time.

**Design.**

### W1.1 — Corpus shape

- Path: `.ai/solutions/<category>/<learning-slug>.md`. One file = one durable learning.
- Categories: a small closed set — `architecture`, `testing`, `build-tooling`, `process`,
  `domain`, `gotcha` — plus `misc`. Closed set keeps the consumer's scan cheap; revisit only when
  `misc` accumulates.
- Frontmatter (additive to `tests/frontmatter.schema.json` as a new `solution` type):

  ```yaml
  ---
  schema: sdlc/v1
  type: solution
  category: <one of the closed set>
  source-workflow: <slug>
  created-at: "<iso-8601>"
  tags: [<free keywords for the consumer grep>]
  status: active | superseded
  ---
  ```

- Body: **Problem / Learning / How to apply** — three short sections, ≤ ~30 lines. A learning that
  needs more is probably a workflow, not a note.
- Index: `.ai/solutions/INDEX.md` — one line per learning (`- [title](category/file.md) — hook`),
  same convention as the workflows registry. Producers append; the consumer reads the index first
  and loads only matching files.

### W1.2 — Producer: retro distills learnings

Edit `skills/wf/reference/retro.md`:

- **New step after the Step 3 merge** (currently "Merge all sub-agent findings and deduplicate"):
  distill **0–3 pattern-level learnings** from the merged findings. Each must pass the
  **durability filter** — all three criteria:
  1. **Recurs** — would plausibly bite a *future* workflow, not just this one.
  2. **Non-obvious** — not derivable from the repo, CLAUDE.md, or the stage references.
  3. **Actionable** — a future plan/implement run could change a decision because of it.
  Zero learnings is a legitimate outcome; do not pad.
- **Dedupe before write**: grep `.ai/solutions/INDEX.md` for overlapping tags/titles. On overlap,
  *update* the existing file (refresh evidence, bump `source-workflow` to a list) rather than
  writing a near-duplicate — mirror the review ledger's dedupe-on-merge discipline.
- Write the files + append index lines. Stamp `10-retro.md` frontmatter with
  `learnings-written: [<paths>]` (empty list allowed).
- **Adaptive routing**: extend **Option D** ("Apply retro improvements", `retro.md` routing block)
  to mention that written learnings are already applied — Option D's remaining scope is repo
  instruction/hook/CI edits only. No new option letter needed.

### W1.3 — Consumer: plan's learnings scan

Edit `skills/wf/reference/plan.md`:

- Add a **Learnings scan** to the same parallel research phase that runs the reuse scan (alongside
  "Rung 3 — reuse opportunities"): read `.ai/solutions/INDEX.md`; match the slice's `## Goal` /
  `## Scope (In)` keywords against index hooks and `tags`; load matching files (typically 0–3).
- Report in the plan artifact under a new `## Applied Learnings` section: each matched learning,
  and **what the plan does differently because of it** — or the explicit line "No applicable
  learnings found." (same no-silent-skip discipline as the reuse scan).
- Non-goal for this release: shape/intake/rca consumers. Add them once the corpus demonstrably
  changes plans (measure: `## Applied Learnings` non-empty rate across a few workflows).

### W1.4 — Integration checkpoints

- **Validation hooks**: confirm `pre-write-validate` / `post-write-verify` treat
  `.ai/solutions/**` as a validated-frontmatter path (new `solution` schema) and that
  sibling-fragment enforcement does NOT fire there (it is scoped to rich-tier workflow artifacts;
  assert with a test, don't assume).
- **EOB**: `.ai/solutions/` is internal context. Under W3's `.ai/**` predicate this is covered by
  construction — one more reason W3.1 ships **before or with** W1 (the enumerated-allowlist wording
  would otherwise need a fifth path added in 74 places).
- **Render**: solutions files are not workflow artifacts; no view rendering this release. If the
  corpus proves out, a view page is a later VIEW-FEATURE item.

---

## W2 — Verify/review hardening (prompt-level, no runtime code)

### W2a — Regression-test mandate in the verify fix loop (CE #10)

`skills/wf/reference/verify.md`, fix sub-agent prompt (currently: *"Do NOT refactor. Do NOT touch
tests unless the …"* — verify.md:514 at time of writing):

- For every `Fix`-triaged **code bug** (not a lint/format finding), the sub-agent MUST add a
  **minimal regression test** that fails before the patch and passes after — test-first when the
  check that caught it is re-runnable. Config/tooling/doc fixes are exempt.
- Record `regression-tests-added: <N>` in the `## Verify-Owned Fixes` section and as a frontmatter
  metric. A code-bug fix with no regression test and no recorded exemption reason is itself a
  finding.
- The existing "Do NOT touch tests" guard inverts to: do not *weaken or delete* tests to make a
  check pass; *adding* the regression test is now required, not forbidden.

### W2b — `pre-existing` flag on review findings (CE #3)

`skills/wf/reference/review.md` + `review/` dimension references:

- Each finding row (in `## All Findings`, `## Findings (Detailed)`, and the sibling `.yaml`) gains
  `pre-existing: true|false` — **true** iff the defect exists on the base branch untouched by this
  workflow's diff. Detection: the reviewer checks whether the flagged lines appear in
  `git diff <base>..HEAD`; untouched lines → `pre-existing: true`. (Cheaper and more robust than
  blame archaeology; blame is the tiebreaker for moved code.)
- **Verdict rule change**: `pre-existing: true` findings — including BLOCKERs — do **not** count
  toward the Ship/Don't-Ship verdict or `metric-findings-blocker`. They surface in a distinct
  `## Pre-existing Debt` bucket and route to `/wf intake fix|refactor` (same routing as retro's
  act-now debt), keeping the review verdict about *this change*.
- Sibling `.yaml`: additive optional field on the `review` / `review-dimension` schemas in
  `tests/frontmatter.schema.json` (same pattern as the `surfaced-at`/`status` ledger fields).
  Ledger dedupe keys are unchanged; a re-run may flip `pre-existing` if the diff grows to touch
  those lines.

### W2c — Mark two verify-gaps as cured (doc hygiene)

`docs/verify-gaps.md` predates the current fix-loop contract. Re-checked 2026-07-06:

- **Gap 3** (fix loop commits before re-check passes) — CURED: *"Do NOT commit if any Fix-triaged
  re-check still fails"* + `verify-owned-fix-commit: null` semantics (verify.md:555, :627).
- **Gap 8** (unconfirmed stack is a soft warning) — CURED: Step 0 HARD GATE `AskUserQuestion` on
  `stack.user-confirmed: false`, provenance stamp, downstream refusal rights (verify.md:62, :247).

Annotate both gaps as resolved in `verify-gaps.md` so a future session doesn't re-fix them (this
nearly happened with v9.94.0 once — see the redundant-re-derivation caution in the motion-craft
memory). The other gaps there remain open and are **out of scope** for this plan.

### W2d–W2g — Constraint-forethought cures (transcript audit, 2026-07-06)

**Evidence base.** Ten sessions across four repos (Crumb `twitter-bookmark-card-fixes`, Playster
`wire-android-backend-summarizer`, PushKit `claude-code-file-sharing`, bot-backend
`pipecat-voice-provider`) were audited end-to-end. The deferral machinery itself held everywhere:
no fabricated evidence, ship correctly HARD-BLOCKED, and the one live probe that eventually ran
found **4 production bugs that 517 unit tests missed** — the runtime-evidence gate is protecting
something real. Not a `yolo` defect: the failure shape is identical in interactive sessions.
The failure is upstream and lateral: plans *name* environmental walls without *engineering* them,
the constraint-resolution ladder has no rungs for three whole evidence classes, verify's
environment self-assessment produces false negatives, and identical walls are re-paid slice after
slice with no harness investment. The positive control exists in the wild: PushKit's
`windows-cgo-build-fix` plan named the constraint (can't execute Windows PE locally), named the
clearing event ("prerelease `-rc.N` tag run"), and produced strong proxy evidence (CGO on/off
build behavior) — that pattern, made mandatory, is most of the cure.

### W2d — Force-scope rule at shape/plan (root cause 1)

**Problem.** Bot-backend's shape flagged TURN as a "known limitation — document at handoff" while
most audio-path ACs were unverifiable without a TURN relay; a `fix-turn-relay-media` slice had to
be retroactively spawned after two blocked ship attempts. Playster's plan prescribed "Maestro +
lazylogcat" for Android ACs while the APK pointed at *production* Firebase (no
`connectFirestoreEmulator` wiring planned) and prod sat behind a manual operator bootstrap.
Naming a constraint is not resolving it.

**Design.** `skills/wf/reference/shape.md` + `plan.md` (`## Verification Strategy`):

- **The rule:** any named environment dependency sitting on a user-observable AC's critical path
  MUST resolve, before plan completes, to exactly one of:
  1. **A prerequisite slice or harness** scoped into the slug (TURN provisioning, emulator build
     variant, seeded-fixture harness);
  2. **A proxy AC + planned deferral** — a lower-rung AC verify *can* evidence now, plus a
     deferral authored with a **named clearing event** (the `windows-cgo-build-fix` pattern:
     "cleared by the `-rc.N` prerelease CI run");
  3. **Explicit PO risk-acceptance**, recorded in the shape/plan artifact.
- "Known limitation, document later" becomes **illegal wording** when an AC depends on the
  limitation — the phrase is the tell that a constraint is being deferred to documentation
  instead of scope.
- Outcome-metric ACs ("rich-preview rate ≥75% over live corpus") additionally require a
  **pre-deploy proxy AC** (fixture-corpus assertion: "extraction returns `has_preview: true` for
  ≥X% of the top-N recorded failure pages") so verify has *something* to hold pre-ship; the live
  metric stays as the deferral's clearing event.
- Enforcement is prose-level in this release: plan's `## Verification Strategy` gains a per-AC
  `constraint-resolution:` line (`prerequisite-slice: <slug>` | `proxy+deferral: <clearing event>`
  | `po-accepted: <reason>`), and verify's Step 0 refuses (`blocked-runtime-evidence-missing`
  routing, not silent deferral) when it inherits an AC whose named dependency has none of the
  three.

### W2e — New constraint-resolution ladder rungs (root cause 2)

**Problem.** `skills/wf/reference/runtime-adapters.md` ladders cover Web UI, Android, and
backend/no-creds well — but three constraint classes the audited repos actually hit have no rungs,
so honest climbers structurally terminate at "defer until prod":

- **Auth-gated runtime** (Crumb's `syncStatus.linked` X-OAuth feed gate, Playster's
  `ALLOWED_UID` bootstrap, bot-backend's Firebase-admin-gated panels);
- **Inbound-callback** (an external service must reach a publicly routable endpoint: bot
  webhooks, OAuth redirects, push delivery receipts);
- **Infra-prerequisite** (evidence needs a service that doesn't exist yet: TURN relay, staging
  deploy). The existing Deploy-time-only section is three rungs that all punt to a post-deploy
  probe.

**Design.** Add three ladder sections to `runtime-adapters.md`, same shape as the existing ones
(numbered rungs, residual-only deferral at the bottom, mocked-integration rule intact):

- **Auth-gated:** 1. test-credential seeding (E2E user in the auth emulator / `.env.test`, seeded
  data snapshot); 2. emulator wiring as a debug build variant (`connectFirestoreEmulator` /
  `useEmulator` in a debug source set — a *planned* deliverable per W2d, never a verify-time
  improvisation); 3. injected-session harness (WorkManager test rule with injected auth, scripted
  sync trigger against the emulator snapshot); 4. residual = genuinely live-account behavior
  (real OAuth consent, third-party rate limits) → pre-registered deferral.
- **Inbound-callback:** 1. dev tunnel (`ngrok`/`cloudflared`) exposing the local server to the
  live external service; 2. protocol-mode swap where the platform offers one (Telegram-style
  webhook→polling for the drive); 3. recorded-callback replay (capture one real callback, replay
  the signed payload against the local endpoint); 4. residual = delivery-side observation only
  the live platform can show → pre-registered deferral.
- **Infra-prerequisite:** 1. provision the dependency *as a verify step* when the plan authorized
  it (free-tier TURN via coturn/Metered, staging deploy via the ship-plan's pipeline — this is
  rung-0-style pre-authorized bootstrap, extended from tools to *services*); 2. containerized
  stand-in (local coturn in docker-compose); 3. residual → deferral naming the provisioning slice
  W2d forces into scope.
- Cross-cutting: a **staging deploy is a legitimate verify rung**, not a ship act — when
  `.ai/ship-plan.md` defines a non-prod environment, verify may deploy there to produce evidence
  (EOB applies; deploy target recorded in the verify artifact).

### W2f — Positive-evidence capability probes + skipped-guard error state (root cause 3)

**Problem.** Two distinct false negatives in the audit. Crumb: the verify sub-agent concluded
Firebase deploy credentials were absent when ADC + `firebase login` were configured — **two full
verify rounds wasted** plus a wrong project-memory write; once the user corrected it, the live
deploy ran in-session and the AC cleared in minutes (rich rate 9%→81.5%). Bot-backend: **8 of 22
deferrals were locally verifiable the whole time** — Playwright specs silently skipped at an
`E2E_ADMIN_USER_EMAIL` credential guard and verify recorded `deferred` instead of surfacing the
unset variable.

**Design.** `skills/wf/reference/verify.md` (fix-loop + deferral sections) and
`runtime-adapters.md` (ladder preamble):

- **Attempt-before-declare:** verify may write "environment cannot produce X" only after
  *executing* a capability probe and recording its literal output in the artifact — e.g.
  `firebase projects:list` / `gcloud auth application-default print-access-token` for deploy
  creds, `adb devices` for devices, an env-var presence check for keyed services, one spec run
  past the guard for cred-gated suites. A defer-reason without a recorded probe command + output
  is invalid (same discipline as the existing "name every rung tried").
- **Skipped-guard sweep is an error, not a deferral:** when an interactive suite runs and every
  spec exits via a credential/environment guard (0 executed), the criterion is
  `blocked-runtime-evidence-missing` with the guard's unmet precondition named ("set
  `E2E_ADMIN_USER_EMAIL`/`_PASSWORD` and re-run") — never `interactive-verification: deferred`.
  Deferral is reserved for evidence no reachable rung can produce, not for un-provisioned test
  configuration.
- **`yolo`/`auto` inherit this for free** (the drivers delegate to the stage reference), but
  yolo's verify-gate row should cite it: an auto-deferral is only lawful over a *probed* incapability.

### W2g — Repeat-deferral tripwire (root cause 4; pairs with W1)

**Problem.** Crumb paid the same X-OAuth feed-gate wall across **five slices in a row** — every
plan acknowledged it, none proposed the one-time WorkManager-test-rule + seeded-emulator harness
that would have retired it. The wall's cost was re-paid as a fresh deferral each slice instead of
amortized once as infrastructure.

**Design.**

- `skills/wf/reference/plan.md` (same research phase as the reuse/learnings scans): scan
  `00-index.md` `runtime-evidence-deferrals` for the slug. If a defer-reason *matching the current
  slice's named constraint* already exists (fuzzy match on the environment dependency, not exact
  text), the plan MUST either scope the harness that retires the wall (W2d option 1) or record an
  explicit PO decision not to (`harness-declined: <reason>`). Silence is non-compliant.
- Cross-slug detection rides **W1**: when retro distills a learning from a repeated deferral
  ("X-OAuth feed gate blocks all interactive Android ACs; harness = …", category `testing` or
  `gotcha`), plan's W1.3 learnings scan surfaces it in the *next* slug automatically. The
  tripwire is therefore two lines of defense: within-slug via the index scan (works without W1),
  across slugs via the solutions corpus (needs W1 — one more reason they ship together in R2).
- Verify contributes the signal: when writing a deferral whose reason matches an existing entry,
  append `repeat-of: <first-occurrence>` so the accumulation is visible in the artifact and the
  dashboard rather than discoverable only by reading every slice record.

---

## W3 — External Output Boundary: single source, then enforce

### W3.1 — Extract `_output-boundary.md` and rewrite as a predicate (audit F1+F2)

- Create `skills/wf/reference/_output-boundary.md` — the ONE canonical EOB text. Rewrite the rule
  **predicate-first** instead of enumerating paths:
  - **Internal** = anything under `.ai/**` or `.claude/**`, plus workflow vocabulary (stage
    names/numbers, slash-command names, sub-agent/task names, prompt/tooling internals,
    chain-of-thought).
  - **External** = commit messages, branch names, PR bodies/titles/comments, release notes,
    changelogs, user docs, README, code comments/docstrings, issue comments — and any file
    **outside** the internal roots.
  - Keep the translate-don't-cite guidance and the pre-publish leak-check step verbatim from the
    best current copy (SKILL.md:8–13 is the reference wording).
  Complete-by-construction: new internal dirs (e.g. W1's `.ai/solutions/`) are covered without
  editing 74 files.
- **Sweep**: replace every inlined copy (74 files main tree; the codex mirror after sync) with a
  3-line citation block:

  ```markdown
  # External Output Boundary (MANDATORY)
  Apply the boundary rule in [_output-boundary.md](_output-boundary.md) (adjust relative path)
  to every external-facing output this stage produces.
  ```

  The sweep is mechanical but **path-depth aware** (`design/`, `intake/`, `ship/`, `docs/`,
  `review/`, `ship-plan/`, `augment/` sub-references need `../_output-boundary.md`). Codex tree:
  regenerate via the normal sync, but remember the compressed-lifecycle references are
  **non-mechanical substitutions** — verify the citation survives generation rather than sed-ing
  the mirror.
- **Drift guard**: add a conventions test (alongside the existing docs/parity gates) asserting no
  file under `skills/` contains the full EOB body except `_output-boundary.md` — the same
  "single source or fail CI" pattern that ended the doc-site drift.

### W3.2 — Semantic leak hooks, Phase 1 only (HOOKS-SEMANTIC-PLAN #1–3)

Today the EOB is an *instruction*; this makes it a *wall*. Build the minimum Phase 0 slice needed
by Phase 1 — not the full 20-hook program:

- `lib/leak-lexicon.mjs` — derives the internal-vocabulary lexicon **from `_output-boundary.md`'s
  predicate** (paths: `.ai/`, `.claude/`; vocabulary: stage tokens, `/wf ` command strings,
  artifact stem patterns like `NN-stage`). Single source feeds both the prose rule and the hook —
  that coupling is why W3.1 and W3.2 are one workstream.
- `semantic` config block in `sdlc-config.json`: `{ enabled: false, mode: "advisory" }` — default
  off, advisory-first.
- **Hook #1** (prompt hook, PreToolUse on Bash): deny/warn when `git commit -m`/`gh pr create`
  args contain lexicon matches.
- **Hook #2** (prompt hook, PreToolUse on Write/Edit): ask when the target is a public path
  (README, CHANGELOG, `docs/` outside internal roots, source comments) and the content contains
  lexicon matches.
- **Hook #3** (prompt hook): deny `gh release create`/tag bodies still in stage vocabulary.
- **Graduation gate**: run advisory across ≥2 real workflows; promote to `enforce` only when the
  observed false-positive rate is ~0 (the FP threshold question from HOOKS-SEMANTIC-PLAN is
  settled empirically, not up front).
- **Isolation**: hooks must respect the `SDLC_DISPATCH_ACTIVE` sentinel (external-model dispatch)
  and never fire inside dispatch child processes.

Later hook phases (#4–20) stay in HOOKS-SEMANTIC-PLAN — this plan takes only the leak trio.

---

## W4 — `/wf ship <slug> rollback`

**Decision (user, 2026-07-06):** rollback is a phase under the existing `ship` key — mirroring
`announce` — not a new top-level key and not a `ship-plan` sub-key. `ship-plan` contributes only
the *conventions* a rollback run reads.

### W4.1 — Dispatch

- `skills/wf/reference/ship.md`: add **Step 1.6 — Rollback shortcut**, modeled on the Step 1.5
  announce shortcut (ship.md:41–44): if the second positional token is exactly `rollback`, load
  `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/ship/rollback.md`, run only that phase, STOP. Optional
  third token = `<run-id>`; default = the most recent **completed** run in `09-ship-runs.md`
  (refuse on paused/`awaiting-input` runs — nothing shipped, nothing to roll back).
- `skills/wf/SKILL.md`: ship row argument-hint becomes `<slug> [env|announce|rollback]`; one-line
  description gains the rollback phase. Update the Step 0.5 exclusion notes only if wording
  references ship's arg shape.

### W4.2 — `reference/ship/rollback.md` (new, sibling of `announce.md`)

1. **Load context**: `09-ship-run-<run-id>.md` (what was published: merge SHA, tag, release,
   deploy env, version bump) + `.ai/ship-plan.md` `## Rollback` block (W4.3).
2. **Author the runbook** — reverse the run's recorded steps in order, each step marked
   **reversible / irreversible**: revert-merge (revert commit, never history rewrite on shared
   branches), tag/release yank or supersede, redeploy prior artifact via `rollback-cmd`, un-bump is
   normally NOT reverted (forward-fix version instead — record why). **Irreversible steps
   (DB migrations, sent announcements, published packages that registries won't unpublish) are
   surfaced as mitigations, not silently skipped.**
3. **Go/No-Go gate** — present the runbook; user-gated exactly like ship Step 5. No execution
   before explicit Go.
4. **Execute + verify** — run steps, then the plan's `rollback-verify-cmd` (or the ship plan's
   health checks) to confirm the prior state is live.
5. **Write `09-rollback-<run-id>.md`** (type `ship-rollback`, additive schema), stamp the original
   run's frontmatter `rolled-back: true` + `rollback-artifact:`, update the `09-ship-runs.md`
   index row.
6. **Comms** — offer the announce phase scoped to a rollback notice (reuse `announce.md`; audience
   likely differs from the ship announcement). EOB applies: the outward notice speaks product
   language, not workflow language.

### W4.3 — `ship-plan` contribution (conventions only)

`reference/ship-plan/` (`init` + `edit`): author an optional `## Rollback` block in
`.ai/ship-plan.md` — `rollback-cmd`, `rollback-verify-cmd`, `prior-artifact-retention` (how many
releases stay deployable), `irreversible-steps` (declared up front, e.g. "migrations are
forward-only"). `init` asks these alongside the existing pipeline questions; absent block →
rollback.md degrades to a git-level runbook (revert-merge + tag) and says so.

### W4.4 — Non-goals

Automated canary/metric-gated rollback (`wf-rollout` territory) and post-ship impact measurement
stay out — this is a *manual, runbook-driven* reversal. `yolo`/`auto` never trigger rollback
autonomously.

---

## Sequencing & releases

| Release | Contents | Why this order |
|---|---|---|
| **R1** | W3.1 (EOB extract + 74-file sweep + drift test) + W2a + W2b + W2c + **W2d/W2e/W2f** (force-scope rule, ladder rungs, capability probes) | Pure reference/prose + one schema field + one test. The predicate must land before W1 adds `.ai/solutions/` (no fifth enumerated path). W2d–f are the highest-pain items (user-confirmed) and pure prose — no reason to wait. Big mechanical diff — keep it isolated for reviewability. |
| **R2** | W1 (solutions corpus: retro producer, plan consumer, schema, validation checks) + **W2g** (repeat-deferral tripwire — its cross-slug leg rides W1's corpus) + W4 (ship rollback) | All reference-level; W4 also touches SKILL.md's key table. |
| **R3** | W3.2 (leak hooks Phase 1: lexicon lib + 3 prompt hooks + config block) | The only runtime-code slice — needs dist rebuild, buildId bump, `sync:codex`, and the hook-isolation checks; keep it out of the prose releases. |

Every release: version bump (5 source spots + doc-site brands + marketplace top-level),
`npm run build` when `lib/`/`hooks/` change (R3), regenerate `docs/site` **before** `sync:codex`
(the site rides the codex payload), full gates (unit tests, codex parity, docs verify). All work
happens in both trees; the codex mirror's skill substitutions are semantic, not sed.

**Precondition:** the v9.98.0 dissolve branch ships first. This plan's edits assume the 20-key
surface and will conflict textually with the dissolve sweep if interleaved.

## Open questions

- **W1**: is the closed category set right, or should categories be free-form with the index as
  the only structure? Start closed; `misc` overflow is the signal to revisit.
- **W1**: should `yolo`/`auto` gate on writing learnings at retro, or is 0-learnings always
  acceptable autonomously? (Proposed: always acceptable — durability filter over quota.)
- **W2b**: does `pre-existing` need a confidence qualifier for moved/renamed code where the
  base-diff test is ambiguous? (Proposed: no — blame tiebreaker, reviewer judgment.)
- **W2d**: should the force-scope rule HARD-GATE plan completion (AskUserQuestion when an AC's
  dependency has no resolution), or is verify's Step 0 refusal enough? (Proposed: hard-gate at
  plan — catching it at verify is exactly the too-late the audit documents.)
- **W2e**: dev tunnels (`ngrok`/`cloudflared`) expose a local port to the public internet — does
  the inbound-callback rung need its own consent gate beyond the plan's pre-authorization, or is
  naming the tunnel in `## Verification Strategy` sufficient? (Proposed: plan naming suffices —
  same trust model as pre-authorized tool installs — but the tunnel URL/lifetime is recorded in
  the verify artifact and torn down before the stage ends.)
- **W2f**: which capability probes are safe to run unprompted (read-only: `adb devices`,
  `firebase projects:list`) vs. needing a gate (anything that consumes quota or sends traffic)?
  (Proposed: read-only introspection is always allowed; anything with side effects follows the
  ladder's pre-authorization rule.)
- **W3.2**: can prompt hooks see enough of `gh pr create --body-file` content (file path, not
  inline text) to lexicon-match? May need Hook #1 to read the body file via an agent hook instead
  — probe during R3, same spirit as HOOKS-SEMANTIC Phase 0's probe script.
- **W4**: should a rollback run itself be announceable by default (opt-out) rather than offered
  (opt-in)? Ship plans with a `comms` channel arguably want opt-out.
