# Intent-Fidelity Hardening — Implementation Plan

> Status: **BUILT — shipped across v9.126.0–v9.131.0** (R2's evidence-quality gates
> landed in v9.128.0 as the merged verify+hooks release, jointly with
> YOLO-EVIDENCE-INTEGRITY-PLAN and governed by EVIDENCE-SCHEMA-CONTRACT.md).
> The "PROPOSED" below was stale; this document was never committed while it was true.
> Originally drafted 2026-07-12; extended same day with W8–W12 from a wide-scope
> re-examination — see "System-level observations" below the failure table).
> Provenance: the waypoint-app drift analysis (2026-07-12) — a full-lifecycle `/wf` run
> (intake → 12 slices → review, all green) that shipped a product structurally unlike its
> intake. Four drift dimensions were traced through the artifacts and grounded in the raw
> Claude Code session transcripts; the project's own read-only investigations
> (`discover-agentic-framework-loops`, `discover-tanstack-usage-audit`,
> `investigate-agentic-teach-restructure`) independently confirmed them. Evidence citations
> below use `[waypoint: <artifact-or-transcript>]`.
> Scope constraint (inherited house rule): **no new skills, no new top-level `/wf` keys.**
> The surface stays at 20 keys. Every capability lands as a step, gate, shared reference,
> review dimension, frontmatter field, or hook extension inside existing keys.

## Reconciliation

This plan overlaps [YOLO-EVIDENCE-INTEGRITY-PLAN.md](YOLO-EVIDENCE-INTEGRITY-PLAN.md)
on `verify.md` and `hooks/post-write-verify.mjs`. Both were authored independently
the same day; reconciled 2026-07-12. The overlap is concentrated in one file and one
hook — everything else is additive. **Read
[EVIDENCE-SCHEMA-CONTRACT.md](../EVIDENCE-SCHEMA-CONTRACT.md) (Step 0) before writing any
`verify.md` / frontmatter code**: `evidence-rung` (this plan's W9.1) and YOLO-EVIDENCE's
`evidence-rung` (F5.1) are the **same frontmatter field with different enums** — the
contract is the single canonical definition; W5.1 `mock-provenance` absorbs YOLO's
`fixture-fidelity` spot-check; W5.4/W9.1's mock-pass block and YOLO's F5.4 lint unify
into **one** hook.

**Merged build order** (supersedes both plans' individual "Sequencing" tables where they
touch `verify.md`/hooks):

| Step | What | Waves / fixes |
|---|---|---|
| **0** | Freeze the shared evidence schema | → `EVIDENCE-SCHEMA-CONTRACT.md` |
| **1** | YOLO-EVIDENCE Phase 1 — `yolo.js` only, ships first & standalone | YOLO F1/F2/F3/F6 |
| **2** | INTENT R1 — shape spine (prose + 1 renderer chip) | W1/W2/W7/W9.4/W10.1 |
| **3** | **Merged** verify + hooks release (one dist rebuild + `sync:codex`) | W3/W5/W9.1-3 **∪** YOLO F4/F5 |
| **4** | INTENT R3 — taxonomy, review dimension, question framing | W4/W6/W10.2-3 |
| **5** | INTENT R4 — charter + scenario + yolo checkpoints | W8/W11 |
| **6** | INTENT R5 — meta-loop | W12 |

The original R1–R5 table below still governs INTENT's internal wave ordering; Step 3 above
is R2 with YOLO's F4/F5 folded in.

---

## Summary — what actually failed

The waypoint run did not fail on correctness, tests, or process compliance. Every stage
validated **local consistency** (plan matches slice, implement matches plan) while nothing
validated **transitive fidelity** (implement still matches intake). Six concrete failure
modes, each with a transcript-grounded exemplar:

| # | Failure mode | Waypoint exemplar |
|---|---|---|
| F1 | A flagged intake risk had no owner; it evaporated at shape | Intake named "porting the *spirit* of teach/grill vs executing an agent runtime are very different architectures" as a top risk [waypoint: 01-intake.md:115]. Shape resolved the fork ("prompt suite", app-owned state machine) without ever naming that it was choosing [waypoint: 02-shape.md:58, :68]. |
| F2 | A narrow PO answer was over-read into a broad scope reduction | PO: "no Neon… only allowed backend is cloudflare options" (a *vendor* answer) silently became "no sync engine in v1 — local-first *feel*" (a *requirement* change the PO never ratified) [waypoint: po-answers.md Round 5 Q19; 02-shape.md:26, :176]. |
| F3 | Library-limitation claims treated as facts; workarounds propagated past their own disproof | Three in-code "this API does not exist" notes all false vs the shipped `node_modules` (`getRequest`, `localStorageCollectionOptions`, DB persistence). One session ran a grep that *printed* `getRequest`, then mirrored the stale comment anyway: "I'll mirror it exactly" [waypoint: transcript 700f799b @ 2026-07-11T18:58–19:00]. |
| F4 | Intent-bearing decisions resolved under the autonomous "implementation detail" umbrella | "State machine is the source of truth, not the prompt" — the control-authority inversion at the product's heart — was one of "eight implementation-detail questions answered autonomously" [waypoint: 04-plan-tutor-interview.md:148; po-answers.md plan-stage autonomous decisions]. |
| F5 | Mocked verification validated a fiction; the live proof was deferred under 12 slices | `drainStream` matched invented stream-event names (`TEXT_DELTA`/`USAGE`); the mocks emitted the same invented names, so 9/9 passed while every real generation returned `undefined`. The one live smoke (AC-PP2b) was deferred at slice 2 and absorbed by every later slice [waypoint: transcript 6767bc63 @ 2026-07-12T10:34; 00-index.md deferrals]. |
| F6 | Per-slice review never looked up; 12 slices passed review with the product vision inverted | All 12 slices reviewed SHIP; the gap was found only by ad-hoc post-hoc investigations after the user asked "so the initial app questions are not dynamic… but pre set" [waypoint: transcript 6767bc63 @ 2026-07-12T09:33; discover-agentic-framework-loops verdict `fails`]. |

Plus one adjacent mode: **F7 — a shape-mandated mitigation was built but never wired**
(the OpenAI-compat-adapter fallback existed only in dead test-only code; the gateway's
"fallback chain" swapped model IDs on the same possibly-broken adapter)
[waypoint: 02-shape.md:108; src/lib/ai-client.ts:87-92 vs src/lib/ai/gateway.ts:203,243].

**System-level observations (added same day, wide-scope pass).** Re-examining `/wf` as a
system against the same evidence yields three failures no single stage owns:

| # | System failure | Waypoint exemplar |
|---|---|---|
| F8 | The **composition** was never verified — 12 slices of ACs decomposed the product, but nothing ever drove the intake's core loop end-to-end as one scenario | "A learner states a goal and gets adaptively taught" was never exercised as a single journey; the vending-machine behavior was only observable at that altitude [waypoint: transcript 6767bc63 @ 2026-07-12T09:33]. |
| F9 | Evidence **quality** was invisible — nothing surfaced that all green evidence was mock-rung | The dashboard showed 12 verified slices; nowhere did any surface show "live evidence: 0%" for the AI paths — for two days [waypoint: 06-verify.md convergence table vs 06-verify-live-ai.md]. |
| F10 | The PO was **present and still missed the reframings** — they lived in 300-line artifacts, not in what the PO actually reads (chat returns, question options) | The FSM entered shape via AC-3's test method; the PO's questions never showed the runtime consequence ("the model will never decide what to ask next") [waypoint: 02-shape.md:68; po-answers.md Round 5 Q18]. |

The through-line diagnosis: `/wf` has excellent **downward** traceability (shape→slice→plan→AC)
and had zero **upward** traceability (code→intake). W1–W7 add upward instruments at the
artifact level; W8–W12 add them at the spec level (charter), the evidence level (provenance
scoreboard), and the human-attention level (chat-return deltas).

Design stance: none of these are cured by "more review effort." Each gets a **structural
mechanism** — a ledger, a gate, a citation requirement, a taxonomy, or a dimension — that
converts an ambient reframing into a written decision someone must own. The honest limit:
gates can force that an adjudication *happens in writing, in front of the PO*; they cannot
force it to be wise. That residue is accepted.

**Appetite-scaling principle (binding on every wave).** The plugin's last three subsume
rounds removed ceremony; this plan must not silently reintroduce it. Fidelity machinery
scales with appetite: the full apparatus (charter, ledgers, scoreboard, scenario harness)
applies to `workflow-type: default` at medium/large appetite; compressed lifecycles
(`fix`/`hotfix`/`refactor`/`update-deps`/`adopt`) get only what is free (hook lints, W3's
citation rule, W10.1's delta line) — each wave below names its compressed-mode posture, and
"skip" is a legal posture.

---

## W1 — Intent-Risk Ledger (cures F1)

**Thesis.** "Risks if Misunderstood" is currently prose that dies at the end of intake.
Make it a tracked ledger with forced adjudication, reusing the exact machinery
`runtime-evidence-deferrals` already proves out (frontmatter ledger on `00-index.md`,
stage gates that read it, dashboard rendering, ship blocking).

### W1.1 — intake authors the ledger
- `reference/intake/default.md` (§ "Risks if Misunderstood", ~line 330): each risk becomes a
  structured entry with a stable id `RIM-1..n`, one-line statement, and
  `severity: high|medium|low`. Prose stays; the ids are additive.
- Intake writes the ledger into `00-index.md` frontmatter:

  ```yaml
  intent-risks:
    - id: RIM-1
      risk: "porting the spirit vs executing an agent runtime are very different architectures"
      severity: high
      status: open            # open | adjudicated | carried
      adjudicated-by: ""      # artifact + section, when adjudicated
      decision: ""            # one line: what was chosen and why
      po-ratified: null       # true | false | not-required
  ```
- Compressed intake modes (`fix`, `hotfix`, `refactor`, `update-deps`, `adopt`): ledger is
  optional — author entries only when the intake reference's risk section produces any.
  `investigate`/`discover`/`ideate` (terminal-analysis): no ledger (no build follows).

### W1.2 — shape must adjudicate (the core gate)
- `reference/shape.md`: new numbered step immediately before the artifact write, styled on
  the existing **force-scope rule** (shape.md:317): for every `intent-risks` entry with
  `status: open`, shape MUST set exactly one of:
  - `status: adjudicated` — with `decision:` (the named choice and its tradeoff) and
    `adjudicated-by: 02-shape.md#<section>`. If the risk touches a **PO directive**
    (anything in intake's Known Constraints or a recorded PO answer), `po-ratified` must be
    `true` (a PO question was asked this stage — cite the `po-answers.md` entry) — `false`
    is legal only with an explicit PO-declined note; `not-required` is legal only when the
    decision does not alter any PO directive.
  - `status: carried` — the risk genuinely cannot be resolved at shape; it must then appear
    in the shape's Open Questions and the receiving stage is named.
  A shape leaving any RIM `open` may not write `status: complete`. Phrase to ban, mirroring
  the force-scope rule's tell: adjudication prose that merely restates the risk without a
  decision ("we will keep this in mind") is ILLEGAL.
- Add one line to shape's story-section guidance: the story must name the highest-severity
  RIM and its disposition (keeps the adjudication legible to the PO who reads only prose).

### W1.3 — downstream visibility and gates
- `reference/status.md`: `deep` mode renders the ledger (id, severity, status) beside
  deferrals; any `open` RIM after shape is flagged as an inconsistency.
- Dashboard/renderer: `00-index` template shows `intent-risks` count by status next to the
  existing deferral chip (renderer-side; template + CSS touch ⇒ **version-gate bump
  required** per the render version-gate rule).
- `reference/handoff.md` (pre-check, alongside the `_ship-plan-readiness.md` call) and
  `reference/ship.md` (Step 0 gates): block on any `status: open` RIM; `carried` RIMs are
  surfaced in the PR body / ship summary (they are legal but visible).
- `reference/recap.md`: whole-workflow recaps include a one-line ledger digest.

### W1.4 — plan/implement hook-in (consumed by W4)
- `reference/plan.md` + `reference/implement.md`: any decision that touches a `carried` RIM
  is by definition **intent-bearing** (W4 taxonomy) — never resolved autonomously.

**Waypoint counterfactual.** RIM-1 ("spirit vs agent runtime") forces shape to write:
"DECIDED: prompt-suite + app-owned FSM; the model does not own control flow — PO ratified:
<answer>". The drift becomes a day-1 PO question instead of an ambient reframing.

**Tests.** Drift-guard test (steering.test.mjs pattern) asserting the adjudication step
exists in `shape.md` and the gate phrases are present; frontmatter round-trip test for
`intent-risks` in the schema tests; renderer snapshot for the ledger chip.

---

## W2 — PO-answer scope-of-authority + Intake Fidelity table (cures F2)

### W2.1 — scope-of-authority rule
- `reference/_question-craft.md`: new contract clause — **a PO answer decides only the
  question it was asked.** When an answer forecloses an approach (kills a vendor, a
  library, a budget), the *requirement* that approach served does not silently degrade:
  the stage MUST either (a) show the requirement is still met another way, or (b) ask the
  PO a follow-up question about the requirement itself. Recording guidance: append answers
  to `po-answers.md` with an explicit `scope:` line ("answers: sync-backend vendor; does
  NOT decide: whether v1 syncs").
- Cited from `shape.md`, `slice.md`, `plan.md` at their PO-question steps (all three
  already cite `_question-craft.md` — the clause rides the existing citation; verify the
  citation exists in `slice.md`/`plan.md`, add where missing).

### W2.2 — Intake Fidelity table in shape
- `reference/shape.md`: new required artifact section `## Intake Fidelity` — one row per
  intake **Known Constraint / directive** (and each numbered item of the Restated
  Request): `directive | disposition (honored / narrowed / dropped) | how | authority`.
  `narrowed`/`dropped` rows require authority = a quoted PO answer whose **scope covers the
  requirement** (per W2.1) or a this-stage PO ratification; "consequence of another answer"
  is not authority.
- `reference/verify.md` Step 0 inputs table + `review/_stage.md`: the fidelity table is a
  named input for the W6 dimension (no independent gate here — review owns enforcement,
  keeping shape's write cheap).

**Waypoint counterfactual.** The row `"local-first with sync" | narrowed → "local-first
feel, no sync engine" | authority: ???` cannot cite the Neon answer (vendor-scoped); shape
owes the PO one more question. H3 becomes a ratified tradeoff or doesn't happen.

**Tests.** Drift guard on `shape.md` section presence; `_question-craft.md` clause presence.

---

## W3 — Limitation-claim citations + hook tripwire (cures F3)

### W3.1 — the rule (prompt level)
- `reference/plan.md` + `reference/implement.md` (and `reference/intake/update-deps.md`,
  which reasons about library capabilities): any claim that a dependency capability
  **does not exist / is not exposed / was removed / broke** must carry evidence in the same
  artifact or comment: a `study-sources` read of the installed source (path under
  `node_modules/`/vendored cache actually opened), a failing minimal repro, or an upstream
  issue link. Two corollaries, stated verbatim:
  1. **Comments are hypotheses.** An existing in-repo comment claiming a limitation is
     NEVER sufficient authority to replicate its workaround in new code — re-verify the
     premise first (one `study-sources` read; the skill exists for exactly this).
  2. **Recalled API shapes never justify `as any` / `@ts-ignore` alone.** The suppression
     must cite the type actually read from the installed package, or the mismatch repro.
- `reference/implement.md` deviation-recording guidance: a deviation of kind
  "planned API not found" must name the source file read that established absence
  (the correct pattern already occurred once in waypoint — `createAPIFileRoute` — the rule
  makes the verified variant mandatory, not the lucky default).

### W3.2 — hook tripwire (advisory-first)
- `hooks/pre-write-validate.mjs` (code-file branch) + `hooks/post-write-verify.mjs`
  (artifact branch): flag added/modified lines whose comments match the limitation lexicon
  — `/does not (exist|ship|expose)|is(n'?t| not) (available|exposed|supported)|no longer (exists|available)|API is missing/i`
  — with no citation marker within ±3 lines (`source:`, `node_modules/`, `repro:`,
  `issue:`, a URL). **Warn-only** (exit 0 with message), default ON, opt-out
  `hooks.limitationClaimLint: false` — mirroring the verifyDeferralLint precedent.
  Lexicon lives beside the leak lexicon (extend `lib/leak-lexicon.mjs` or a sibling
  `lib/limitation-lexicon.mjs`) so both hook entrypoints share it.
- **Build note:** any `hooks/`/`lib/` touch ⇒ rebuild `dist/` in the same commit
  (dist build rule) ⇒ buildId changes ⇒ `npm run sync:codex` mandatory; codex users
  re-trust hooks.

**Waypoint counterfactual.** The `get-session.ts` write (stale "does not expose
getWebRequest()" comment, minutes after a grep printed `getRequest`) draws a warning at
write time naming the missing citation; the W3.1 corollary makes the mirror-the-workaround
move illegal even without the hook.

**Tests.** Hook unit tests: lexicon hits/misses, citation-adjacency window, opt-out; a
fixtures pair (violating/clean diff).

---

## W4 — Decision taxonomy for autonomous resolution (cures F4)

### W4.1 — the shared reference
- New `reference/_decision-classes.md` (shared, both trees): defines two classes —
  - **Intent-bearing**: touches a ledgered RIM (W1); alters or narrows a PO directive or
    intake Known Constraint; assigns **control authority** (which component — deterministic
    code or the model/agent — decides a user-facing behavior at runtime); changes the
    mechanism of the product's core loop as stated in the intake's Restated Request; or
    drops/stubs a capability shape committed to (adoption-matrix `USE` rows included).
  - **Implementation-detail**: everything else (naming, file layout, internal data shapes,
    test scaffolding, library idioms within a committed choice).
  Includes a 6-example table (waypoint's FSM/control-authority case is example #1;
  "chips are client-side constants to save a model call" as a borderline-but-intent-bearing
  example — it changes core-loop mechanics; "which directory holds the state file" as
  detail).
- Rule: **intent-bearing decisions are never resolved by an autonomous policy.** In a
  human-gated run they are asked (AskUserQuestion, constructed per `_question-craft.md`);
  in an autonomous run they are a stop condition.

### W4.2 — wiring
- `reference/plan.md` + `reference/implement.md`: the autonomous-override policy paragraphs
  cite `_decision-classes.md`; recorded autonomous decisions gain a mandatory
  `class: implementation-detail` stamp (an autonomous record may never carry
  `class: intent-bearing` — writing one is the tell).
- `reference/yolo.md` policy table (rows at :54–58): new row —
  `intent-bearing decision (per _decision-classes.md) | Never autonomous. | STOP: record the pending decision in the artifact + po-answers.md as awaiting-input, surface in the run report.`
  (Claude-tree only; `yolo` is not mirrored.)
- `reference/auto.md`: one line — auto asks intent-bearing questions at the gate instead of
  batching them into the stage's autonomous block.
- `reference/_steering.md` cross-link: standing steering may pre-answer a *named*
  intent-bearing question (that is ratification in advance); it may not blanket-authorize
  the class.

**Waypoint counterfactual.** yolo halts at plan-tutor-interview with: "Intent-bearing:
control authority for interview progression — app-owned FSM vs model-owned loop. Awaiting
PO." The single most damaging decision gets a human.

**Tests.** Drift guards: yolo table row present (main tree), plan/implement citations
present (both trees); `_decision-classes.md` exists in codex mirror.

---

## W5 — Verify hardening: mock provenance, first-light, stacking, mitigation wiring (cures F5, F7)

### W5.1 — mock provenance rule
- `reference/verify.md` (new subsection beside the attempt-before-declare rule) +
  `reference/plan.md` (test-design step): any mock/fixture that **emulates an external
  interface** (library stream/event shapes, HTTP payloads, SDK return types) must record
  provenance: `mock-provenance: <node_modules path read | captured real output ref | docs URL>`
  — in the test file header comment or the plan's test table. **"From recollection" is
  illegal.** Verify's fix-loop treats a provenance-less external-interface mock as a
  finding (severity MED) — it may pass this run but is recorded.
- Cheap adversarial check added to verify's mock-related steps (near :278 and :311): when
  an AC's evidence rests on mocked external-interface events, grep the installed package
  for the mocked identifiers (event names, method names); zero hits ⇒ the mock is
  presumptively fictional ⇒ finding + cap that AC at `partial`. (This one grep is the
  entire waypoint `TEXT_DELTA` counterfactual.)

### W5.2 — first-light tracking for never-observed integrations
- `00-index.md` frontmatter gains:

  ```yaml
  unproven-integrations:
    - name: openrouter-via-tanstack-ai
      introduced-by: platform-proofs
      first-light: null    # ISO date of first live observation, set by verify
  ```
- `reference/plan.md`: when a slice introduces an external integration whose real behavior
  has not been observed live in this workflow (no prior live smoke/probe), it registers the
  entry. `reference/verify.md` AC gate (Step 7.5 vicinity): while `first-light: null`, ACs
  whose evidence chain depends on that integration cap at `partial` (mock/emulator rungs
  count as proxies, never `pass`) — the existing ladder vocabulary already supports this.
  Any live observation (tagged smoke, `/wf probe`, live e2e) stamps `first-light`.
- `reference/status.md` + dashboard: unproven integrations render beside deferrals.

### W5.3 — deferral stacking limit
- Deferral entries in `00-index.md` gain `absorbed-by: [<slice>, ...]` (the "accepted into
  existing deferral" moves waypoint used repeatedly become explicit appends).
- `reference/verify.md` escape-hatch section (:441 vicinity): absorbing a deferral into a
  **third** slice is a stop, not an absorption — verify surfaces it as a decision
  ("foundation gap: N slices now stack on unproven X — provision the clearing event now,
  or PO-accept explicitly"), recorded in `po-answers.md`. In yolo this is a policy-table
  escalation (extends the existing repeat-deferral tripwire from the feedback-loops plan,
  which fires on repetition — this fires on *inheritance breadth*).

### W5.4 — mandated-mitigation wiring ACs
- `reference/shape.md` (edge-cases/failure-modes step): any mitigation shape MANDATES
  (fallbacks, escape hatches, kill switches) must be traceable — `plan` carries an AC that
  **exercises the wired path** (not merely "the code exists"). `reference/plan.md` AC
  authoring: mitigation ACs are code-only-forbidden; the evidence is the mitigation
  firing (fault injection, forced fallback, flag flip).

**Waypoint counterfactuals.** W5.1's grep kills `TEXT_DELTA` on day 2. W5.2 caps every
AI-slice AC at `partial` until one live OpenRouter call exists — the 07-12 live-key
collapse happens at slice 2, not slice 13. W5.3 stops the BETTER_AUTH_SECRET/AC-PP2b
absorption chain at its third rider. W5.4 forces a test that swaps to the OpenAI-compat
adapter — discovering it was never wired.

**Tests.** Frontmatter round-trips for both new fields; drift guards on verify.md sections;
post-write-verify already gates result-vs-evidence — extend its warn set with
`first-light: null` + `result: pass` co-occurrence on dependent ACs (hook touch ⇒ dist
rebuild, rides W3's rebuild).

---

## W6 — intent-fidelity review dimension + milestone re-basing + retro questions (cures F6)

### W6.1 — the dimension
- New `reference/review/intent-fidelity.md` (34th dimension, both trees). Inputs:
  `01-intake.md` (Restated Request, Known Constraints, Success Criteria), the RIM ledger,
  shape's Intake Fidelity table (W2.2), and the slice diff. Questions it must answer:
  1. Does this diff advance the intake's product, or a simplified imitation of it?
  2. Name every intake directive this slice's code narrows/reframes; is each narrowing
     covered by a fidelity-table row or RIM adjudication? Uncovered narrowing = finding
     (severity by RIM severity, default HIGH).
  3. Control-authority check: for each user-facing behavior in the diff, does the component
     the intake assigned (model/agent vs deterministic code) actually own it?
  4. Vocabulary check: architectural mechanisms present in code but absent from any named
     decision (feeds W7).
  Sibling `.yaml` per the review-dimension schema; accumulating-ledger semantics as usual.
- `review/_stage.md` selection rules (~:189, :285): `intent-fidelity` is **always-on** for
  lifecycle slugs (`workflow-type: default`) at both per-slice and slug-wide scope; ad-hoc
  reviews reach it by name. It is never suppressed by the user-focus override (joins
  `correctness` in the always-kept set).

### W6.2 — milestone re-basing
- `review/_stage.md` slug-wide mode (:53 vicinity): the slug-wide review MUST answer the
  intake's **Success Criteria verbatim** — quote each criterion, state its current truth
  with evidence, no paraphrase. (Waypoint's teach-gap table, institutionalized.) Additive:
  when a slice roster marks a visible-milestone slice, the same check runs once there.

### W6.3 — retro drift questions
- `reference/retro.md`: add to the question set — "Which intake directives did the shipped
  code narrow, and was each ratified? Which RIMs turned out mis-adjudicated? Which
  limitation-claims were later disproven?" Promotions of these answers into `.ai/solutions/`
  ride the existing retro→solutions path (feedback-loops W1).

**Waypoint counterfactual.** The tutor-interview per-slice review runs intent-fidelity;
question 3 asks who owns interview progression; the intake says the agent decides; the code
says a regex does. Finding: HIGH, at slice 8 — not at a user's 09:33 hunch two days after.

**Tests.** Roster drift guard (34 dimensions, always-on set includes intent-fidelity);
review-dimension yaml schema unchanged (reuse); slug-wide verbatim-criteria phrase guard.

---

## W7 — Named-mechanism rule (cures the "state machine entered via a test method" vector)

- `reference/shape.md` (AC authoring step) + `reference/slice.md` (slice-definition step):
  **any architectural mechanism named in an AC, verification method, or test plan must
  exist as a named decision in the artifact body.** If the test names a machine, the design
  must own the machine — one sentence stating the mechanism, what it replaces, and why.
  Post-write-verify gets a warn (not block): mechanism-suggesting nouns in AC/verification
  lines (`state machine|scheduler|queue|cache|pipeline|orchestrator|regex`) absent from the
  body's decision sections. (Heuristic, warn-only, opt-out `hooks.namedMechanismLint: false`;
  rides the same hook/dist rebuild as W3/W5.)

**Waypoint counterfactual.** "automated (interview state-machine unit tests)" in AC-3 with
no body decision naming the FSM ⇒ warn at shape write; the W1 adjudication then forces the
real question.

---

## W8 — Charter: positive commitments as first-class spec (cures F8; generalizes W1/W2)

**Thesis.** W1/W2 track the negative space (risks, narrowings). The intake also contains
*positive commitments* — "the model owns probing decisions," "every lesson claim traces to a
gathered source" — that today exist only as prose and can only decay. Give them identity,
citations, and a runtime check.

### W8.1 — charter block
- `reference/intake/default.md`: intake distills **3–7 commitments** into `00-index.md`
  frontmatter — deliberately few; a charter that restates the whole intake is boilerplate:

  ```yaml
  charter:
    - id: C1
      commitment: "the model decides whether and what to probe in the interview"
      source: "01-intake.md#restated-request step 2"
      status: honored        # honored | at-risk | broken (set by W8.2 runs + W6 reviews)
  ```
- Cross-wiring: RIM adjudications (W1) name the charter ids they protect; fidelity-table
  rows (W2.2) reference charter ids; W4's "core-loop mechanism" clause resolves against the
  charter (removing its main ambiguity for non-AI products); the W6 dimension's question 1
  becomes checkable per-id instead of holistic.
- Renderer: charter status chip beside the RIM chip.
- Compressed-mode posture: **skip** (no charter for fix/hotfix/refactor/update-deps/adopt).

### W8.2 — core-loop scenario harness
- `reference/shape.md`: when the intake's Restated Request contains a numbered core loop,
  shape authors `## Charter Scenario` — the loop as ONE scripted end-to-end scenario with
  observable checkpoints per step ("goal entered → probe question shown that references the
  stated goal → …").
- `reference/slice.md`: the visible-milestone slice and the final slice carry a standing AC:
  "charter scenario executes through step N" (progressive coverage; final slice = all steps).
- `reference/verify.md`: the scenario runs as interactive verification (browser/adapter
  rungs, same ladder as any user-observable AC) at the milestone and final slices. It is
  subject to W5.2 first-light: a scenario whose critical dependency is unproven caps at
  `partial` — a slug can never finish with the scenario never having run against reality.
- Compressed-mode posture: skip.

### W8.3 — constraint precedence
- `reference/shape.md` (NFR step): any NFR that *could* conflict with a charter commitment
  must carry an explicit ranking — `yields-to: C1` or `outranks: C1 (PO-ratified)`. An
  unranked conflict is an open question routed to the PO. `reference/plan.md`: when an NFR
  is cited as the rationale for a mechanism choice (waypoint's <3s → single-call FSM), the
  plan must quote the ranking; citing an unranked NFR against a charter commitment is the
  tell (and an intent-bearing decision per W4).

**Waypoint counterfactual.** C1 ("model owns probing") + the <3s NFR forces the ranking
question at shape: "if <3s conflicts with model-owned probing, which yields?" — the FSM
tradeoff surfaces as a one-line PO question on day 1. The charter scenario, run at the
sample-journey milestone, exposes the vending machine two days early: step 2's checkpoint
("probe reflects the stated goal") fails against canned questions.

**Tests.** Frontmatter round-trip for `charter`; drift guards on shape's scenario +
precedence steps; renderer snapshot for the chip.

---

## W9 — Evidence quality made visible (cures F9; extends W5)

### W9.1 — evidence-provenance scoreboard
- `reference/verify.md`: every AC evidence entry stamps its rung —
  `evidence-rung: live | emulator | cited-mock | uncited-mock | static`. The `06-verify.md`
  index table gains a per-slice rollup ("live 2 / emulator 1 / mock 4"); `00-index.md`
  gains an `evidence-quality:` slug rollup; dashboard renders it as a chip beside deferrals.
- `reference/ship.md` gate: ACs that cite a charter id (W8) require ≥1 live-rung evidence
  somewhere in their chain, else ship blocks pending explicit PO acceptance recorded in
  `po-answers.md`. Non-charter ACs are unconstrained (no new ceremony).
- Compressed-mode posture: rung stamps only (they're free); no gate.

### W9.2 — prerequisite deadlines
- External prerequisites and deferrals gain `needed-by: <slice>` (set at plan time, when
  the dependency structure is known). `reference/status.md` escalates any prerequisite
  whose `needed-by` slice is complete while the prerequisite is unmet; `reference/yolo.md`
  policy row: passing a `needed-by` boundary on a **charter-critical** prerequisite is a
  stop (non-critical: surfaced in the run report). This converts W5.3's stacking *count*
  into stated *intent* — the plan says when the truth is due.

### W9.3 — suppression → `sdlc-debt` unification
- `reference/implement.md`: every new type/lint suppression (`as any`, `@ts-ignore`,
  `@ts-expect-error`, `eslint-disable`, language equivalents) must carry an `sdlc-debt:`
  marker with a reason. No new lifecycle: the existing debt machinery (verify validates,
  retro reconciles, simplify sweeps — YAGNI-ladder plan) inherits the whole class for free.
- Hook: warn-only lint (suppression token with no `sdlc-debt:` within ±2 lines), sharing
  W3.2's lexicon infrastructure; opt-out `hooks.suppressionDebtLint: false`.
- Compressed-mode posture: fully active (free).

### W9.4 — adoption-matrix reconciliation
- `review/_stage.md` (slug-wide mode): one mechanical pass over shape's adoption matrix —
  every `USE` row cites at least one production usage site, or becomes a finding (MED:
  "committed and abandoned" or "installed, zero usage"). `reference/retro.md`: matching
  question ("which USE rows never earned their install?").
- Compressed-mode posture: n/a (compressed lifecycles have no adoption matrix).

**Waypoint counterfactuals.** W9.1: the dashboard reads "live evidence: 0%" on every AI
slice for two days — impossible to miss. W9.2: the OpenRouter key gets
`needed-by: platform-proofs`; the build escalates at slice 2, not slice 13. W9.3: the
`as any` seams surface in the first simplify/retro sweep. W9.4: `react-query`/`ssr-query`
(USE, zero references) is a finding at the first slug-wide review.

**Tests.** Rung-stamp frontmatter round-trip; ship-gate refusal fixture; hook lexicon unit
tests; drift guard on the slug-wide reconciliation step.

---

## W10 — The human loop: make reframings legible where the PO actually looks (cures F10)

### W10.1 — chat-return deltas
- `reference/_chat-return.md`: stage-completion chat returns **lead** with a `Deltas` line —
  directives narrowed (from the W2.2 fidelity table), mechanisms introduced (from W7's
  named decisions), intent-bearing decisions pending or auto-resolved (from W4 stamps).
  Nothing new is computed — the line surfaces what W2/W4/W7 already recorded, at the one
  altitude the PO reliably reads. Empty deltas ⇒ the line says "none," one word.
- Compressed-mode posture: fully active (free — sourced fields are simply absent).

### W10.2 — consequence-framed questions
- `reference/_question-craft.md`: for intent-bearing decisions (W4), each option must state
  its **runtime consequence**, not its design label — "the model will never decide what to
  ask next; a fixed 5-stage script" rather than "state-machine-driven interview." One
  sentence of what the user/learner experiences differently.

### W10.3 — shape pre-mortem (consult-optional)
- `reference/shape.md`: before completion, one short adversarial pre-mortem — "it is N
  weeks later and the shipped product betrayed its intake; write the two most likely
  post-mortems." Outputs seed RIM entries (W1) — the pre-mortem is the RIM *generator*,
  the ledger is its *tracker*. When `externalDispatch.enabled`, optionally dispatch the
  same question to the `consult` panel (read-only oracles) — waypoint's salvation came from
  externally-framed challenges; this productizes that.
- Compressed-mode posture: skip.

**Waypoint counterfactual.** Shape's completion chat return would have led with:
"Deltas: narrowed `local-first with sync` → 'feel' (authority: pending) · new mechanism:
interview state machine (app-owned control flow)." The PO who caught the FSM at 09:33 two
days late would have seen both lines on day 1, in chat.

**Tests.** Drift guards on `_chat-return.md` + `_question-craft.md` clauses and shape's
pre-mortem step.

---

## W11 — Autonomous driver evolution (extends W4; Claude-tree only where noted)

### W11.1 — yolo fidelity checkpoints + run digest
- `reference/yolo.md` + `workflows/yolo.js` (Claude-only): every K slices (default 3), one
  cheap checkpoint subagent reads the charter (W8) + the last K implement artifacts and
  answers "is the build still advancing each commitment?" — findings append to the run
  report; a `broken` charter status is a stop. End of run: a **decision digest** grouping
  every autonomous decision by W4 class — one section, not twelve artifacts — appended to
  the run report and `po-answers.md`. The human's post-run inspection becomes structured
  instead of archaeological.

### W11.2 — mid-build discover checkpoint
- `reference/yolo.md` + `reference/auto.md`: when a `severity: high` RIM exists and the
  visible-milestone slice completes, the driver suggests (auto: asks; yolo: records in the
  run report as a recommended next step) a read-only `/wf discover <hypothesis derived from
  the RIM>` before continuing. Waypoint's discover run took ~25 minutes and was decisive —
  it just ran two days late; this schedules it.
- Compressed-mode posture: n/a.

**Tests.** yolo.js unit coverage for checkpoint cadence + digest assembly; drift guards on
the policy rows.

---

## W12 — Meta-loop: compounding beyond one repo (deliberately last; field experience first)

### W12.1 — global solutions corpus
- Plan's reuse scan reads a **user-level** corpus alongside the repo's `.ai/solutions/`
  (config `solutions.globalDir`; default under the plugin data dir). `reference/retro.md`:
  retro may propose promoting a repo lesson to global — always user-confirmed, never
  automatic (privacy: repo lessons can contain project specifics).

### W12.2 — retro → plugin-backlog channel
- `reference/retro.md`: retro classifies each lesson `about-the-project` vs
  `about-the-workflow`; workflow lessons append to a user-reviewable `plugin-feedback.md`
  in the global dir. This is the channel the waypoint analysis performed by hand — the
  workflow improving the workflow, with the user as editor.

### W12.3 — deep retro (opt-in, Claude-only initially)
- `reference/retro.md` gains a `deep` token: mine the repo's session transcripts
  (`~/.claude/projects/<repo>/*.jsonl`) for decision moments — the grounding method that
  found waypoint's "I'll mirror it exactly" moment, which no artifact recorded. Heavy and
  runtime-specific (codex has no transcript dir) — opt-in only, never default.

**Tests.** Config plumbing round-trip for `solutions.globalDir`; retro drift guards.

---

## Sequencing & releases

| Release | Waves | Rationale |
|---|---|---|
| R1 | **W1 + W2 + W7 + W9.4 + W10.1** | Pure reference/prompt changes (plus one renderer chip). Shape is where waypoint lost the plot; land the transitive-fidelity spine first, plus two of the cheap high-leverage trio (matrix reconciliation, chat-return deltas — both prose-only). |
| R2 | **W3 + W5 + W9.1 + W9.2 + W9.3** | The hypothesis-treated-as-fact killers plus the evidence scoreboard/deadlines/suppression-debt. ONE combined hooks/lib/dist rebuild + sync:codex covers all lexicons and the verify gates. |
| R3 | **W4 + W6 + W10.2 + W10.3** | Taxonomy, review dimension, consequence framing, pre-mortem: the judgment-heavy prompt design, benefiting from R1's ledger vocabulary being live. |
| R4 | **W8 + W11** | Charter + scenario harness + precedence, and the yolo checkpoints/digest that consume them. Builds on R1's ledger machinery and R2's scoreboard; the largest new concept, landed once the vocabulary is field-tested. |
| R5 | **W12** | Meta-loop (global corpus, plugin-feedback channel, deep retro). Deliberately last — shaped by R1–R4 field experience. |

Each release: both trees (`npm run sync:codex`; `yolo.md` rows + W11 + W12.3 main-only;
new references mirror), version bump per the bump-locations rule, `npm run build` when
`hooks/`/`lib/` touched (R1: renderer chip ⇒ version-gate bump; R2: all hook lexicons +
verify gates ⇒ the one dist rebuild; R4: renderer charter chip ⇒ version-gate bump),
parity count re-check, doc-site: audit the generated pages describing shape/verify/review
gates for drift (edit `.html` + `_build_pages.py` together where generated).

## Acceptance criteria (plan-level)

1. A greenfield `/wf intake` on a repo with a "spirit-vs-runtime"-class ambiguity produces
   a RIM ledger; running shape without adjudicating it cannot reach `status: complete`.
2. A shape that narrows a PO directive citing an answer that didn't cover it is expressible
   only as a fidelity-table row with empty authority — visibly illegal.
3. Writing a code comment claiming an API "does not exist" with no adjacent citation draws
   the W3 warning in a live hook test.
4. A yolo dry-run over a plan containing a control-authority question stops with the W4
   record instead of resolving it.
5. A verify run over a mocked external interface whose event names don't grep in the
   installed package caps the AC at `partial` and records the finding.
6. A third slice absorbing the same deferral triggers the W5.3 stop.
7. `review` on a lifecycle slug fans out `intent-fidelity` without being asked; slug-wide
   review output quotes intake success criteria verbatim.
8. A default-workflow intake produces a 3–7 entry charter; the milestone verify runs the
   charter scenario at a live/interactive rung (or honestly caps at `partial` under W5.2).
9. An NFR cited against a charter commitment without a recorded ranking is flagged at plan.
10. The dashboard shows the evidence-quality rollup; a slug with zero live-rung evidence on
    charter-cited ACs cannot ship without a recorded PO acceptance.
11. A prerequisite whose `needed-by` slice completes unmet escalates in status (and stops a
    yolo run when charter-critical).
12. A new `as any` without an `sdlc-debt:` marker draws the warn; the marker is swept by
    the existing simplify/retro debt lifecycle.
13. Slug-wide review reports every adoption-matrix `USE` row with a usage citation or a
    finding.
14. Stage-completion chat returns lead with the `Deltas` line (live-run inspection).
15. A yolo run report contains the decision digest grouped by W4 class and the charter
    checkpoint results.
16. All existing tests stay green; new drift guards cover every citation/gate added
    (steering.test.mjs pattern); parity re-established both trees (Claude-only items —
    yolo rows, W11, W12.3 — excluded from parity by the established yolo precedent).

## Open questions

- **RIM granularity for compressed lifecycles** — fix/hotfix intakes rarely carry
  architecture risks; current stance (ledger optional there) keeps them cheap. Revisit if
  drift shows up in compressed runs.
- **W6 false-positive rate** — intent-fidelity is judgment-heavy; if it produces noisy
  HIGH findings, tune severity mapping (RIM-linked = HIGH, otherwise MED) before weakening
  the always-on rule.
- **W4 taxonomy sharpness** — "control authority" is crisp for AI products; for classical
  apps the "core-loop mechanism" clause carries the weight. Collect real stops for two
  releases before considering auto-classification.
- **Hook lexicon i18n/noise** — limitation phrases in prose docs (not code comments) should
  not trip W3.2; the code-file-branch scoping handles this, but verify against the
  waypoint corpus before default-ON.
- **Charter boilerplate risk (W8)** — a charter that restates the whole intake is dead
  weight. The 3–7 cap plus "commitments must be *falsifiable by code*" is the intended
  guard; if field use produces vague charters ("the app is good"), tighten the authoring
  guidance before adding machinery on top.
- **Evidence-rung taxonomy edges (W9.1)** — what counts as `live` for a pure-frontend
  workflow with no external service? Proposed: the rung vocabulary is per-dependency, and
  charter-critical gating only binds where an external dependency exists. Decide at build.
- **Checkpoint cadence K (W11.1)** — default 3 is a guess; a checkpoint that fires too
  often is noise that trains the user to skip digests. Tune from the first two field runs.
- **Global corpus privacy (W12.1)** — repo→global promotion must strip project specifics;
  always user-confirmed, and the global dir stays local (never synced by the plugin).
- **Deep-retro runtime asymmetry (W12.3)** — transcript mining is Claude-only until codex
  exposes an equivalent; ship it as an explicitly runtime-gated token, not silently absent.
