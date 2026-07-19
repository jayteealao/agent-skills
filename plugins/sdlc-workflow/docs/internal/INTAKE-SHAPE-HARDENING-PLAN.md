# Intake/Shape Hardening — Implementation Plan

> Status: **BUILT — shipped as v9.136.0, 2026-07-14** (all four waves in one release at the PO's
> direction, rather than the R1–R4 split below). W2.5 verified: `intake/extend.md` indeed had no
> RIM/charter delta — the Step 3b delta was added, adjudicated-in-place (extension has no shape
> run to clear `open` entries). Open decision 1 resolved: `externalDispatch` shipped default stays
> `false` (the flag gates only imagery/uiproto egress; consult is already ungated — shape's stale
> gate deleted). Open decision 3 resolved as proposed: Round 3b rides on top of the 20-floor.
> (drafted 2026-07-14)
> Provenance: a fresh structural read of `reference/intake/default.md`, `reference/intake.md`
> (dispatcher), and `reference/shape.md` as they stand after the INTENT-FIDELITY program
> (v9.126–131) landed. That program fixed the *evaporation* problem — risks and directives can
> no longer silently disappear between intake and shape. What remains clusters into three
> themes: **(a) intake is the unguarded input to all of shape's guards** (no RIM/charter
> quality floor, a formatting-dependent Charter Scenario, no consult trigger), **(b) shape
> self-grades its own adversarial checks**, and **(c) shape.md has accumulated structural
> drift** (phantom steps 1–2, an always-vs-skip contradiction, a PO question embedded in a
> sub-agent prompt) that undermines its own "execute exactly in order" contract.
> Scope constraint (inherited house rule): **no new skills, no new top-level `/wf` keys.**
> Every capability lands as a step, gate, shared-reference clause, frontmatter field, or hook
> extension inside existing keys.
> PO directives folded in (2026-07-14): **the 20-question floor stays** (shape's interview
> must be exhaustive of ambiguity — see W3.1's coverage design); **review-scope is still
> asked**, just moved to the stage that can answer it (W3.2); **consult must be always-on**
> — it already is (ungated since 2026-07); the fix is removing shape.md's stale gate and
> auto-triggering it (W4.2).

## Unifying principles

1. **Every gate needs an unconditional input.** Most v9.126–131 gates are sound; they fail
   only when their *input* is optional (RIMs may be absent, the core loop may be unnumbered,
   appetite never reaches frontmatter). The cheapest hardening is making absence
   illegal-without-reason — the `augmentations-needed: []` "required even when none" pattern,
   reused everywhere below.
2. **Independence beats intensity.** Shape's pre-mortem doesn't need to be longer — it needs
   a generator that hasn't seen the answer it's grading (W4.2).
3. **Coverage beats count.** The 20-question floor guarantees *effort*; only an ambiguity
   inventory guarantees *direction*. W3.1 keeps the floor and makes it accountable.

## Summary — the defects

| # | Defect | Where |
|---|---|---|
| D1 | RIM ledger + charter have no quality floor; a lazy intake authors zero entries and shape's 8a gate becomes a legal no-op | `intake/default.md` §Risks/§Charter; `shape.md` Step 8a no-op branch |
| D2 | Charter Scenario (the F8 composition fix) triggers only on a *numbered* core loop — a formatting accident | `shape.md` Step 5c; `intake/default.md` §Restated Request |
| D3 | No consult auto-trigger at intake (`default`/`ideate`/`investigate` are on the v9.135 weak-15 list) | `intake/default.md`, `intake/ideate.md`, `intake/investigate.md` |
| D4 | Process questions (branch/appetite/review-scope) asked before substance; review-scope asked before slicing exists; appetite captured but never machine-readable | `intake/default.md` Batch A |
| D5 | Intake questions are ungrounded — no code exploration before Batch B | `intake/default.md` (no Explore step) |
| D6 | Shape's 20-question interview has no coverage instrument — questions aren't accountable to the ambiguities they exist to close, and nothing checks the interview *exhausted* the ambiguity space | `shape.md` discovery phase |
| D7 | Shape generates AND adjudicates its own pre-mortem in one run — self-grading; consult dispatch cites a gate (`externalDispatch.enabled`) that no longer exists for consult | `shape.md` Steps 8·pre / 8a |
| D8 | shape.md's numbered flow starts at 3 (no steps 1–2); interview/research/rules interleaved as unnumbered prose; "Always launch sub-agent 2" contradicts its own skip criteria | `shape.md` structure |
| D9 | The PO tooling question lives inside sub-agent 1's prompt — sub-agents can't ask the PO; relay timing unspecified | `shape.md` interactive-tooling block item 5 |
| D10 | Design-brief questions are unbudgeted — no interview round covers visual direction, yet 5b says "fold in what was gathered" | `shape.md` Step 5b + round script |
| D11 | Intake Fidelity dispositions (`narrowed`/`dropped`) and carried RIMs never reach chat — ledgered but not surfaced (F10 half-fixed) | `shape.md` chat return contract |
| D12 | Intake freshness pass and shape's sub-agent 2 duplicate web research with no handoff | both files |
| D13 | Extension mode (`intake/extend.md`) likely adds new scope without RIM/charter deltas — **to-verify before building** | `intake/extend.md` |

Waypoint counterfactuals cited below reuse the INTENT-FIDELITY failure ids (F1/F2/F8/F10)
from [INTENT-FIDELITY-HARDENING-PLAN.md](INTENT-FIDELITY-HARDENING-PLAN.md).

---

## Wave 1 — hygiene (editorial, zero behavior change)

Ships first so every later wave diffs against a coherent file. One commit, cleanly
reviewable as "no semantic delta".

### W1.1 — renumber shape.md into one contiguous sequence (D8)
- `reference/shape.md`: rewrite the flow as:
  - **Step 0** — Orient (unchanged).
  - **Step 1** — Launch research agents. Sub-agent 1 always; sub-agent 2 unless ALL skip
    criteria hold. The skip criteria are stated **here and nowhere else**; the current
    "Always launch Explore sub-agent 1 and Explore sub-agent 2" sentence and the later
    step-4 "see skip criteria above" both dissolve into this step.
  - **Step 2** — Discovery interview (the current "Mandatory discovery phase" prose becomes
    this step's body; W3.1 later extends it).
  - **Step 3** — Collect research; relay the tooling question (W1.2).
  - **Step 4** — Synthesize the mini-spec.
  - **Step 5a/5b** — Design brief / Charter Scenario (current 5b/5c renamed).
  - **Step 6a/6b** — Documentation plan / Augmentation plan.
  - **Step 7** — Adaptive routing. **Step 8** — Index update.
  - **Step 9 / 9a / 9b** — Pre-mortem → RIM adjudication → Intake Fidelity table
    (current 8·pre/8a/8b).
  - **Step 10** — Write artifacts.
- The floating "Parallel research" and "Workflow rules" sections keep their content but are
  anchored: research prompts become Step 1 sub-sections; workflow rules stay a standing
  rules block (they are not sequenced steps and should not pretend to be).
- All internal cross-references ("see Step 5b", "Step 8a", other files citing shape step
  numbers — grep `shape.md#|shape Step|Step 8a` across `reference/` and `docs/site/`) are
  updated in the same commit.

### W1.2 — tooling question: data from the agent, question from the orchestrator (D9)
- Sub-agent 1's interactive-tooling block **loses item 5** ("surface a tooling question for
  the PO") and becomes pure reporting: adapters matched, drivers detected (installed first),
  session-catalog candidates with one-line fit rationale.
- New **Step 3** owns the question: after research returns (wait if needed — the findings
  are a hard input to `## Verification Strategy` regardless), one `AskUserQuestion` whose
  options are built from the agent's actual findings, per `_question-craft.md`. Answer →
  `po-answers.md`. The "don't default to dev-browser/Maestro" anti-pattern warning moves
  here, where the decision is actually made.

**Tests (W1).** Drift guard: shape.md contains exactly one occurrence of the sub-agent-2
skip-criteria heading; no `8·pre` token remains; sub-agent 1's prompt block contains no
`AskUserQuestion`/"ask the PO" phrase. Cross-file grep test: no stale `Step 8a` references
outside shape.md's own Step 9a.

---

## Wave 2 — input integrity (every downstream gate gets an unconditional input)

### W2.1 — RIM/charter quality floor at intake (D1)
- `reference/intake/default.md`:
  - `## Risks if Misunderstood` and `## Charter` may never be absent in default mode. Zero
    entries is legal only as an explicit declaration: frontmatter `intent-risks:
    none-declared` / `charter: none-declared` plus a one-line body reason ("pure mechanical
    rename; no interpretive surface"). Silence is illegal.
  - **Misreading pass** (new numbered sub-step before the brief is written): *"Name the 3
    most likely ways this request could be misread."* Each candidate either becomes a RIM or
    is dismissed in the body with a stated reason. In-run, no sub-agents — this is the
    floor; shape's pre-mortem stays the deep pass.
- `reference/shape.md` Step 9a: narrow the no-op branch. It remains a no-op **only for
  compressed modes**. A standard-lifecycle slug whose index has neither `intent-risks`
  entries nor `none-declared` → shape STOPS, re-derives candidate RIMs from `01-intake.md`
  (Known Constraints + Restated Request), writes them into the ledger, then adjudicates.
  Backfill, not waive-through.
- `hooks/post-write-verify.mjs`: warn (not block) when a `type: intake` artifact in default
  mode lacks both sections and the frontmatter lacks `none-declared`. **Touches a hook →
  dist rebuild in the same commit.**

**Waypoint counterfactual.** F1's "spirit vs agent runtime" risk survives even a hurried
intake: either it is authored, or `none-declared` is a visible lie the PO can catch in the
artifact, or shape backfills it before adjudication.

### W2.2 — Charter Scenario de-conditionalized (D2)
- `reference/intake/default.md` §Restated Request: *"If the request implies a sequence of
  user actions (a core loop), state it as numbered steps."* The numbered form becomes a
  deliberate artifact.
- `reference/shape.md` Step 5b (post-W1 numbering): trigger becomes *"when the work has a
  core interaction loop — numbered in intake, or derivable from its prose."* Skipping
  requires `charter-scenario: none — <reason>` in the shape frontmatter. Absent-silently is
  illegal.

**Waypoint counterfactual.** F8 ("a learner states a goal and gets adaptively taught" never
driven end-to-end) no longer depends on whether intake happened to use `1. 2. 3.`.

### W2.3 — appetite into frontmatter (D4, load-bearing for W3.1 and the pre-mortem)
- `intake/default.md`: Batch A's appetite answer lands as `appetite: small|medium|large` in
  `00-index.md` frontmatter (added to the index template + mandatory-keys list). Consumers:
  shape's pre-mortem horizon (N weeks), slice's slice-count expectations, W3.1's inventory
  depth expectation. **The interview floor does NOT scale with it — PO directive.**

### W2.4 — charter ratification at birth (D1 legibility half)
- `intake/default.md`: after distilling the 3–7 commitments, one `AskUserQuestion`: *"These
  are the promises I heard — confirm or correct."* (multiSelect confirm/edit pattern per
  `_question-craft.md`.) Ratification recorded in `po-answers.md`; charter entries gain
  `po-ratified: true`. A charter the PO ratified at stage 1 carries real authority
  downstream; today its authority is inferred.

### W2.5 — extension-mode fidelity delta (D13 — verify first)
- **Step 0 of this wave: read `reference/intake/extend.md`** and confirm the gap. If
  confirmed: extension authors incremental RIM/charter entries scoped to the net-new
  slices (same `none-declared` escape), so extended scope enters with the same tracking as
  fresh scope. If extend.md already handles it, drop this item and note it here.

**Tests (W2).** Drift guards on the new phrases (`none-declared`, `charter-scenario: none`,
misreading-pass heading). Frontmatter round-trip for `appetite` and `intent-risks:
none-declared` through the index renderer. Hook unit test: intake artifact missing both
sections → warning fires; `none-declared` present → silent.

---

## Wave 3 — interview coverage & grounding

> **PO directive (2026-07-14):** the 20-question floor is an *aim*, not an accident — shape's
> interview must be properly exhaustive of all ambiguity and un-spelled-out context; a chance
> to fully clarify. So: **floor stays at 20**. This wave's job is to make the floor
> *accountable* — every question closes something real, and the interview cannot end while
> the ambiguity space has uncovered corners.

### W3.1 — the Ambiguity Inventory (D6): coverage instrument for the 20-floor
- `reference/shape.md` Step 2 (post-W1 numbering) gains a **pre-interview inventory step**:
  before Round 1, harvest every ambiguity, unstated assumption, and unclear-context item
  from `01-intake.md`, `po-answers.md`, the preliminary code map (W3.4), and any
  already-returned research. Write them as `## Ambiguity Inventory` in the artifact — each
  item `AMB-n` with a one-line statement and a source pointer.
- **Question accountability:** every interview question names (internally, in the artifact's
  Questions-Asked section) the `AMB-n` item(s) it closes. Assumption-confirmation questions
  are first-class closers — pre-fill the understanding and ask confirm/revise (already legal
  per the existing rules; now they *count*). When genuine open ambiguities are fewer than
  the remaining budget, the budget goes to confirming assumptions and probing the
  consequences of earlier answers ("you chose X in Round 2 — that implies Y in the empty
  state; confirm?") — **never invented decoys**. The never-pad rule is reworded to match:
  padding = a question that closes or confirms no inventory item; the floor is satisfied by
  closing and confirming, not inventing.
- **Coverage gate at interview end (the exhaustiveness check):** every `AMB-n` must be
  (a) closed by an answer, (b) targeted by an extension round, or (c) parked in
  `## Unknowns / Open Questions` (with `status: awaiting-input` if blocking). An inventory
  item in none of those states is illegal — the same tell-based enforcement style as the
  force-scope rule. This is what turns "20 questions happened" into "the ambiguity space
  was exhausted or explicitly parked".
- The 5-round thematic script, the extension rule (≤2 need-driven rounds), and the Round-5
  scope-restraint content are all **unchanged**.
- The inventory also feeds Step 9 (pre-mortem): unresolved `AMB-n` items are prime
  post-mortem material.

### W3.2 — review-scope moves to slice, and is still asked (D4)
> **PO directive:** the question must be asked at some point — moved, not removed.
- `intake/default.md` Batch A: drop the review-scope question. Index template writes
  provisional `review-scope: per-slice` + new `review-scope-confirmed: false`.
- `reference/slice.md`: after the slice roster is drafted (count now known), one
  `AskUserQuestion` — recommendation informed by the roster (1 slice → recommend
  `Slug-wide`; >1 → recommend `Per slice (Recommended)` with the existing descriptions).
  Answer flips `review-scope-confirmed: true`, lands in `po-answers.md`.
- **Fallback for the skip-to-plan path** (shape Option B bypasses slice):
  `reference/plan.md` Step 0 — if `review-scope-confirmed: false`, ask the same question
  there before proceeding. `review`/`handoff` may trust the flag; if they ever see `false`,
  they ask rather than assume (defense in depth, one line each).

### W3.3 — budgeted visual-direction round (D10)
- `reference/shape.md` Step 2: when `stack.ui ≠ ∅` and the work has visual surface (same
  trigger as the design-brief step), insert a **Round 3b — visual direction**: 4 questions
  covering register, color strategy, reference points / anti-goals, and state inventory —
  precisely the inputs `02b-design.md` needs (per `design/shape.md`). Round 3b's questions
  close design-flavored `AMB-n` items like any others and count within the interview (the
  floor is 20; Round 3b rides on top when triggered, keeping the non-design floor intact).
- Step 5a's "fold visual-direction questions into the answers already gathered" then becomes
  true instead of aspirational.

### W3.4 — grounded intake: one bounded Explore pass (D5)
- `intake/default.md`: between Step 0.5 (fingerprint) and Batch B, launch **one** Explore
  sub-agent (medium breadth) when the request names or implies a specific codebase area and
  isn't trivially scoped (skip criteria mirror the sub-agent-2 skips: typo/rename/version
  bumps skip). One job: *map the affected area — what exists today, what the request would
  touch, which ambiguities the code already answers.* Findings → `01-intake.md ## Affected
  Areas (preliminary)`.
- Batch B questions must reference the findings where relevant ("the code already has X —
  does this replace or extend it?").
- `reference/shape.md` sub-agent 1 prompt gains an opening line: *"Start from intake's
  `## Affected Areas (preliminary)`; verify and deepen — do not re-derive."* This clause is
  what keeps total research cost flat.

### W3.5 — freshness handoff (D12)
- `reference/shape.md` sub-agent 2 prompt opens with intake's `## Freshness Research`
  takeaways and the instruction *verify and extend, do not repeat*. Symmetric with W3.4's
  codebase handoff.

**Tests (W3).** Drift guards: `## Ambiguity Inventory` heading + coverage-gate phrase in
shape.md; review-scope question text present in slice.md and absent from intake Batch A;
`review-scope-confirmed` in the index template; Round 3b block present; both handoff
clauses present in the sub-agent prompts. Frontmatter round-trip for
`review-scope-confirmed`.

---

## Wave 4 — independence & surfacing

### W4.1 — intake consult auto-triggers (D3)
- Extend the v9.135 objective-trigger pattern (shape.md's "Auto second opinion" block is the
  template) to:
  - `intake/default.md` — after the brief is drafted, before writing `01-intake.md`,
    auto-invoke `/consult codex <critique this restated request, charter, and RIM ledger —
    did I misread the ask?>` when ANY of: (a) new capability or externally-observable
    surface AND `appetite ≥ medium`; (b) any RIM `severity: high`; (c) the request touches
    security, payments, auth, data migration, or deletion semantics.
  - `intake/ideate.md` / `intake/investigate.md` — auto-invoke on their terminal artifact
    (critique the candidate ranking / approach sketches) when the analysis will feed a
    build decision (the mode's own terminus note is the trigger anchor).
- Model-initiated runs pin a free CLI (`codex`/`claude`) per the standing cost model.

### W4.2 — pre-mortem independence + kill the stale gate (D7)
- **Stale-gate removal:** `reference/shape.md` Step 9 (was 8·pre) currently reads "When
  `externalDispatch.enabled`, you MAY dispatch…". `consult` has been **ungated since
  2026-07** (see `reference/external-model-dispatch.md` — the flag now governs only
  `imagery`/`uiproto` egress). Delete the condition. Sweep: this is the only consult-gated
  mention in `skills/wf/reference/` (verified 2026-07-14); the `design/contract.md` and
  `design/_design-context.md` mentions gate imagery/uiproto and stay.
- **Blind generator:** the pre-mortem runs in a **fresh sub-agent whose inputs are
  `01-intake.md` + `po-answers.md` only — NOT the draft `02-shape.md`**. It derives its own
  expectation of the product and writes post-mortems against that. The orchestrator (who
  knows the shape) adjudicates: a risk the draft already handles is dismissed *with the
  citation*; one it doesn't handle becomes a live RIM. Real independence, zero external
  dependencies.
- **Consult pre-mortem on objective triggers** (not MAY): auto-dispatch the same blind
  prompt to `/consult` (free-CLI pinned) when ANY of: a `severity: high` RIM exists; >1
  slice expected; the same conditions as shape's existing auto-consult block — so the two
  consults fire together and can be batched into one panel call.
- The existing "restating is not adjudicating" tell is unchanged — it was the right rule;
  it needed a generator worth adjudicating.
- **`externalDispatch` default — decision point, PO to confirm.** The flag lives at
  `lib/hub-config.mjs` (`externalDispatch: { enabled: false }`, ~line 78; per-machine
  override `~/.sdlc/hub-config.json`). Post-2026-07 it gates **only imagery/uiproto** —
  consult is already always-on, so nothing in this plan needs the flip. Recommendation:
  **keep the shipped default `false`** (image/prototype dispatch sends repo content to
  external engines — a privacy/egress boundary that should stay per-machine opt-in), and
  opt in jayte's machines via `~/.sdlc/hub-config.json`. If the PO still wants the shipped
  default flipped: one line in `hub-config.mjs` + rewrite its OFF-by-default comment +
  update `reference/external-model-dispatch.md`, `design/contract.md`,
  `design/_design-context.md` — and note it changes the egress posture for every
  installer. **Touches lib → dist rebuild + `sync:codex` in the same commit.**

### W4.3 — fidelity reaches the PO's eyes (D11)
- `reference/shape.md` chat return contract gains one required line:
  `fidelity: <n> honored · <m> narrowed (directive → authority) · <k> dropped (directive →
  authority) · RIMs: <a> adjudicated, <b> carried` — all-clear form: `fidelity: all
  directives honored; all RIMs adjudicated`.
- A **`dropped` disposition requires a this-stage `AskUserQuestion` ratification** — a
  scope-covering quote from an earlier answer suffices for `narrowed`, but dropping a
  directive is always a fresh decision the PO confirms in the moment.
- Completes F10: the reframe now appears in the two places the PO actually reads — the
  question, and the chat return.

**Waypoint counterfactual.** F2's vendor answer ("only cloudflare backends") silently
becoming "no sync engine in v1" would now surface as `narrowed: sync engine → authority:
po-answers Round 5 Q19 (vendor-scoped — INSUFFICIENT)` in chat, and the insufficiency
forces the one extra question the PO was owed.

**Tests (W4).** Drift guards: trigger blocks present in the three intake references; no
`externalDispatch` token in shape.md; blind-generator input restriction phrase present;
`fidelity:` line in the chat return contract; dropped-row ratification clause present.

---

## Sequencing & release mechanics

| Release | Wave | Character |
|---|---|---|
| R1 | W1 | Editorial; no behavior change; later diffs stay reviewable |
| R2 | W2 | Input integrity; **touches `hooks/post-write-verify.mjs` → dist rebuild same commit** |
| R3 | W3 | Interview coverage & grounding; largest behavioral change, isolated from R2 so regressions attribute cleanly |
| R4 | W4 | Independence & surfacing; **touches `lib/hub-config.mjs` only if the default-flip decision lands** |

Standing mechanics per release (house rules): version bump (5 source/config spots + doc-site
brands + mk top-level) — the render version-gate requires it for any template-visible
change; dist rebuild in the same commit whenever `hooks/`/`lib/` are touched (tests run
source — green ≠ dist fresh); regen `docs/site` **before** `npm run sync:codex`; hand-mirror
every reference edit into `plugins/sdlc-workflow-codex/` with non-mechanical substitutions
(never sed-retransform); stage explicitly by path, never `git add -A`.

## Open decisions for the PO

1. **W4.2 `externalDispatch` shipped default** — recommendation: keep `false` (flag gates
   only imagery/uiproto egress now); opt in per machine. Confirm or overrule.
2. **W2.5** — contingent on reading `intake/extend.md`; drop if already handled.
3. **W3.3 Round 3b sizing** — proposed as +4 on top of the 20-floor for UI work; confirm the
   floor should not absorb it.

## Non-goals

- The remaining v9.135 weak-15 consult stages outside intake (`augment/*`, `docs`,
  `ship-plan/*`, `observability/*`, `slice`, `probe`, `retro`) — same trigger-table pattern,
  own follow-on release.
- Any change to compressed intake modes' charter/RIM exemptions beyond W2.1's
  `none-declared` requirement in default mode — compressed modes exist deliberately for
  small work and keep their current contracts.
- Renderer/doc-site chips for the new frontmatter keys (`appetite`,
  `review-scope-confirmed`) — render as plain frontmatter for now; a chip is a later
  nicety.
