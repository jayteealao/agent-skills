# YOLO Evidence Integrity — closing the gaps the 2026-07-12 session audit found

## Reconciliation

This plan overlaps [INTENT-FIDELITY-HARDENING-PLAN.md](INTENT-FIDELITY-HARDENING-PLAN.md)
on `verify.md` and `hooks/post-write-verify.mjs`. The two were authored
independently the same day and must not be built in isolation — reconciled
2026-07-12 (build-order in INTENT-FIDELITY's own header). Split by **surface**:

- **`yolo.js` half (F1, F2, F3, F6)** — Claude-only orchestrator; uncontested;
  ships **first and standalone** as this plan's Phase 1.
- **`verify.md` half (F4, F5)** — both trees; overlaps INTENT-FIDELITY's W5/W9.1.
  Does **NOT** ship as this plan's Phase 2/3 in isolation — it **folds into
  INTENT-FIDELITY's merged verify+hooks release**, governed by the frozen
  schema in [EVIDENCE-SCHEMA-CONTRACT.md](../EVIDENCE-SCHEMA-CONTRACT.md).

**Before writing any `verify.md` / frontmatter code, read the schema contract
(Step 0).** In particular: `evidence-rung` (F5.1) and INTENT-FIDELITY's `evidence-rung`
(W9.1) are the **same frontmatter field with different enums** — the contract is
the single canonical definition. F5.3 `fixture-fidelity` unifies with W5.1
`mock-provenance`; F5.4's mock-pass lint unifies with W5.4/W9.1 into one hook.
F4 (per-AC skip) is unique to this plan and stays here.

---

An empirical audit of **29 real `/wf yolo` sessions across 7 projects** (Isometric,
Crumb, Trails, Playster, bot-backend, Waypoint, PushKit; 2026-06-22 → 2026-07-12)
read every transcript and checked each subagent's actual work against the
session's stated goal. Verdict: the pointer-based dispatch design is sound —
most stage subagents were faithful, and unsupervised bug-catching was the
dominant signal — but **two failure classes recur, and both trace to *how*
evidence claims flow between stages, not to individual subagent carelessness**:

1. **Stale rediscovery** — a subagent reads a prior artifact's constraint (a
   deferral reason, an assumed-coverage claim) and treats it as ground truth
   instead of re-deriving it. Worst incident: Crumb `rca-link-preview-enrichment`
   carried a stale "Firebase creds unavailable" deferral forward as fact, paired
   it with a mocked-suite "0 issues" verify, deployed, and the backfill
   **transiently nulled 70 real users' link previews**.
2. **No mock-vs-real distinction** — nothing forces verify to distinguish "this
   test passed" from "this test exercised the real behavior the AC cares about."
   Waypoint `waypoint-app` (32 subagents, 12.8 h unattended) reported every
   LLM-integration slice ship/pass while **every mocked fixture encoded the same
   event-name bug as the implementation**; real model calls returned empty the
   whole run. Sibling incident: `accounts-data-layer` reached SHIP/0-blockers
   while OAuth sign-in was completely broken, because the one gating E2E test
   was *skipped* (missing `BETTER_AUTH_SECRET`) — and a skip, unlike a failure,
   blocked nothing.

Two smaller recurring defects: an implement subagent **overclaiming
workflow-wide completion** beyond its slice mandate (Isometric
`full-codebase-audit-fixes`), and **deferral pileup with no escalating
visibility** (bot-backend `pipecat-voice-provider` deferred the same 22–24
live-voice ACs run after run).

> **Scope note.** `workflows/yolo.js` is **Claude-only** (Workflow tool; never
> mirrored to `plugins/sdlc-workflow-codex/`). The `verify.md` contract changes
> in Phase 2 apply to **both trees**. This plan deliberately does NOT touch the
> parts of the design the audit validated: pointer-based stage dispatch, the
> always-inlined Autonomous Decision Policy, defer-don't-cancel, and the
> wrap-not-fork stage contract all stay exactly as they are.

---

## 1. What already exists — do NOT re-derive

The audit's headline recommendations are **partly already shipped**; several
incidents simply predate the guards. Any implementer must read this table
before writing code — the failure mode of re-deriving shipped work is real.

| Guard (already shipped) | Where | Ships in | Covers |
|---|---|---|---|
| Constraint-resolution ladder — "no device/creds" is the *start* of a climb, not a defer-reason | `verify.md` "Climb the constraint-resolution ladder" + `runtime-adapters.md` | v9.99–101 | bare-excuse deferrals |
| Attempt-before-declare — defer-reason must record a *literal probe command + output tail* | `verify.md` "Escape hatch" §Attempt before declare | v9.99–101 | fabricated incapability |
| Skipped-guard **sweep** rule — 0 specs executed ⇒ `blocked-runtime-evidence-missing`, never a deferral | `verify.md` escape hatch | v9.99–101 | whole-suite guard exits |
| Integration-blindspot guard — AC asserting a *live integration* can't pass on a mock | `verify.md` ladder rule 2 | v9.99–101 | narrow mock class |
| `repeat-of` deferral marker + plan-side harness tripwire | `verify.md` 00-index schema + `plan.md` | v9.99–101 | pileup *recording* |
| `/wf ship` HARD-BLOCK on uncleared deferrals | `verify.md` escape hatch; ship path | v9.9x | deferral leakage to prod |
| post-write-verify result gate — `result: pass` contradicting evidence is hard-blocked at write time | `hooks/post-write-verify.mjs` (R7) | v9.95 | dishonest pass |
| verifyClean residual[] tolerance — deferral parked in the wrong array no longer false-stops | `yolo.js` `verifyClean` | v9.114 | driver false hard-stop |
| Headless runtime adapters — "no display" no longer a false wall for yolo subagents | `runtime-adapters.md` | v9.121 | one whole deferral class |

The Crumb production incident (2026-06-30) **predates** the ladder /
attempt-before-declare guards. The Waypoint incidents (2026-07-11/12)
**postdate** them — which is exactly why the remaining gaps below matter:
the law exists as prose, but nothing structural enforces it on the yolo path.

---

## 2. Gap analysis — why the shipped guards didn't bite

| # | Gap | Evidence | Root cause |
|---|---|---|---|
| G1 | **`POLICY.verify` waters down the deferral law it overrides.** yolo.js tells the subagent to defer when the environment "genuinely CANNOT produce that proof (no emulator/…/credential is unreachable here)" — near-verbatim the *bare phrasing* `verify.md` rejects ("Bare phrases — 'no emulator', 'no creds' — are not acceptable defer-reasons"). The policy is framed as the override and is the last word the subagent reads. | Waypoint/bot-backend deferral piles with bare reasons, post-v9.99 | The policy paragraph was written before the ladder/probe law and never re-aligned |
| G2 | **The driver cannot see probe receipts.** `STAGE_RESULT.terminal.deferrals[]` items carry `{ac, reason}` only; `verifyClean()` accepts any ac-bearing entry. The reference demands a probe; the structured return has no slot for it, so compliance is unobservable and drifted. | Deferrals accepted with un-probed reasons across July runs | Prose law with no schema slot |
| G3 | **Nothing re-challenges prior deferrals on re-runs.** `orient()` reads `00-index.md` — where `runtime-evidence-deferrals` live — but `ORIENT_RESULT` doesn't capture them, so `driveVerify` can't tell the subagent "these walls were claimed before; re-probe them fresh." Guards prevent *writing* a new bare deferral, not *inheriting* an old one. | Crumb stale-creds carry-forward; bot-backend same-wall re-deferrals every run | Rediscovery-from-artifacts treats prior claims as facts |
| G4 | **The skip rule is per-sweep, not per-AC.** The sweep rule fires only when *every* spec guard-exits. One skipped gating spec among hundreds of green ones is invisible — the AC it gates inherits the suite's green. | Waypoint OAuth: SHIP issued; the single seeded-session E2E that gated the broken flow was skipped | Rule granularity mismatch |
| G5 | **Mock-blindspot guard triggers too narrowly, and mock-only coverage is illegible downstream.** The guard applies when "the AC asserts a live integration." Waypoint's event-emission ACs were "about app behavior," evidenced by fixtures that encoded the same bug as the code. No per-AC evidence-class label exists, so review/ship cannot even *see* that a user-observable AC's evidence chain terminates in a fixture. | Waypoint mocked-fixture run; Crumb `ogs()` mock hiding a throw-on-every-call | Trigger condition + missing evidence taxonomy |
| G6 | **No stage-scope clamp; no pileup escalation in the hand-back.** An implement subagent asserted "all 9 slices complete… Next: /wf handoff" when the gating review hadn't run. Deferral `repeat-of` is recorded in the index but yolo's hand-back never aggregates age/repeat counts. | Isometric overclaim; bot-backend pileup invisibility | Missing one prompt line; missing one hand-back rollup |

---

## 3. The fixes

### F1 — Re-align `POLICY.verify` with the deferral law _(G1 · yolo.js only)_

Rewrite the `DEFER-DON'T-CANCEL` paragraph of `POLICY.verify`
(`skills/wf/workflows/yolo.js` ~L95–106). It must **restate**, not paraphrase,
the reference's law. Required content (wording final at implement time):

- A deferral is lawful **only over a probed incapability**: climb the
  constraint-resolution ladder (`runtime-adapters.md`) first; defer only the
  residual no rung can reach.
- The defer-reason MUST enumerate the rungs tried AND include the **literal
  capability-probe command + output tail executed in THIS run** (e.g.
  `firebase projects:list`, `adb devices`, an env-var check, one spec run past
  the guard). A defer-reason with no recorded probe is invalid.
- **Never inherit a defer-reason from a prior artifact, prior slice, or prior
  run.** A prior deferral is a claim to re-test, not a fact. If a prior wall no
  longer stands, produce the evidence now.
- **A skipped or guard-exited spec is NOT evidence for the AC it gates** —
  treat that AC as un-evidenced (ladder → evidence, or defer with probe, or
  `blocked-runtime-evidence-missing`). An all-skipped sweep is
  `blocked-runtime-evidence-missing`, never a deferral.
- Each `terminal.deferrals[]` entry now carries `{ ac, reason, probe }` where
  `probe` is the literal command + one-line output tail (see F2).

Also update the tail of the `runStage` return-contract paragraph (~L470–475) to
name the `probe` field, and mirror the same probe/no-inherit/skip language into
`POLICY['update-deps']`'s deferral sentence (~L142–145), which today just says
"apply the SAME runtime-evidence deferral escape."

**Non-goal:** do not lengthen the policy beyond ~1.5× its current size — the
policy must stay a readable override, not a second copy of verify.md. Cite the
reference's section names for anything deeper.

### F2 — Probe receipts in the structured return, with a corrective re-run _(G2 · yolo.js + tests)_

**Schema.** Extend the deferral item shape in `STAGE_RESULT`
(`terminal.deferrals` items, ~L233–236) with
`probe: { type: 'string' }` — "the literal capability-probe command executed
this run + a one-line output tail". Update the inline comment.

**Gate semantics — the v9.114 lesson governs here.** Do NOT make `verifyClean`
reject probe-less deferrals outright: subagents *routinely* misplace/omit
structured fields, and a hard gate on a formatting technicality is exactly the
false-stop bug v9.114 spent ~500k tokens/recurrence to kill. Instead:

- `verifyClean(t, residual)` stays **unchanged** in its accept condition
  (ac-bearing deferral in either array ⇒ structurally clean). It remains a
  top-level `function` declaration — `yolo-gates.test.mjs` extracts it by
  brace-matching and that must keep working.
- Add a new pure top-level helper `function probeGaps(t, residual)` returning
  the list of ac-bearing deferral entries (both arrays, deduped by ac) that
  lack a non-empty `probe`. Pure and extractable, same as the other three.
- In `driveVerify`, after a round returns structurally clean via
  `verifyClean` but `probeGaps(...)` is non-empty **and a round remains**:
  do **one corrective re-run** — invoke `runStage('verify', …)` with an
  `extra` clause naming the specific ACs and instructing: *"attach the
  capability-probe receipt (literal command + output tail) for each of these
  deferrals, executing the probe now if the prior round did not; if a probe
  shows the wall no longer stands, produce the evidence instead of the
  deferral."* If the corrective round still returns probe-less deferrals →
  **hard-stop** with an instructive reason (the deferral law is not optional;
  re-run is cheap because resume skips completed stages).
- `evaluateGate('verify', …)` stays on `verifyClean` alone — it is the
  defensive same-information re-check, and the corrective loop lives in
  `driveVerify`. For the `update-deps` exec path (no round loop), surface
  probe gaps in the hand-back (`outcome.probeGaps`) and `log()` them rather
  than adding a second exec invocation — the standard path is where the volume
  is; revisit if the audit pattern recurs on update-deps.
- `collectDeferrals` passes `probe` through into the hand-back entries so
  `/wf ship`'s block list and the run summary show *receipted* deferrals.

**Tests** (`tests/unit/skills/yolo-gates.test.mjs`): extract `probeGaps`;
cases — all-receipted ⇒ `[]`; one missing ⇒ that entry only; probe on the
residual-parked copy but not the terminal copy of the same ac ⇒ `[]` (dedupe
credits either array); ac-less notes ignored; `verifyClean` behavior
unchanged on every existing case.

### F3 — Prior-deferral re-challenge + pileup rollup _(G3, G6b · yolo.js only)_

**Orient.** Add to the `orient()` prompt (step 1, reading `00-index.md`):
capture `runtime-evidence-deferrals` verbatim. Extend `ORIENT_RESULT` with:

```js
priorDeferrals: { type: 'array', items: { type: 'object', properties: {
  slice: { type: 'string' }, reason: { type: 'string' },
  deferredAt: { type: 'string' },            // iso-8601 from the index
  clearedBy: { type: 'string' },             // null/absent = still open
  repeatOf: { type: 'string' },              // earlier slice with the same wall
} } },
```

Only entries with `cleared-by: null` matter; orient may omit cleared ones.

**Drive.** In `driveVerify` (and `runUpdateDepsExec`), when
`idx.priorDeferrals` is non-empty, append a `PRIOR DEFERRALS — RE-CHALLENGE`
clause to the stage prompt listing each open entry (slice, reason, deferred-at,
repeat-of) with the mandate: *"These are claims recorded by earlier runs, not
facts. Do NOT inherit any of them. For each whose constraint could touch this
slice, re-run its capability probe fresh in THIS run: a wall that no longer
stands must be verified now (produce the evidence); a wall that still stands
gets a fresh probe receipt on this run's deferral."*

**Hand-back.** After `collectDeferrals`, compute a rollup when any prior or
new deferrals exist: `outcome.deferralPressure = { open: N, oldestDeferredAt,
repeatWalls: M }` and `log()` one line naming the oldest wall and any
`repeat-of` clusters — the plan-side harness tripwire already exists; this
makes the pressure visible in every yolo hand-back instead of only inside
artifacts. No new gate: visibility only.

### F4 — Per-AC skip mapping _(G4 · verify.md, BOTH trees)_

The sweep rule stays; add the per-AC rule beside it. Three anchor edits in
`skills/wf/reference/verify.md` (mirror equivalently in
`plugins/sdlc-workflow-codex/.../verify.md`, preserving that tree's
platform substitutions — no mechanical sed):

1. **Escape hatch, after the skipped-guard-sweep paragraph (~L449).** New
   paragraph: **"A skipped gating spec is a missing-evidence event for its AC
   (per-AC rule)."** When ANY spec that is the designated evidence for a
   specific AC was skipped (guard exit, `.skip`/`.todo`, missing env/secret,
   filtered out) while the rest of the suite ran, that AC has produced **no
   evidence** — it cannot inherit `pass` from the suite's overall green. Route
   it through the ladder: produce the evidence on another rung, or defer with
   a probe receipt, or write `blocked-runtime-evidence-missing` naming the
   unmet precondition.
2. **Step 4 test-suite check (~L149–158).** Extend the report line: alongside
   total/passed/failed/skipped, **map every skipped spec to the AC(s) it
   gates** (from the plan's Verification Strategy / AC table) and record
   `skipped-gating-specs: [{spec, ac, precondition}]` (empty list when no
   skipped spec gates an AC). A skipped spec that gates no AC is noise; a
   skipped spec that gates an AC feeds rule 1.
3. **AC-gate result table (~L430–437).** Add the row: *"At least one AC's
   designated gating spec was skipped and no other rung evidenced it AND no
   deferral annotation"* ⇒ `blocked-runtime-evidence-missing`.

### F5 — Per-AC evidence-rung labeling + fixture-fidelity spot-check _(G5 · verify.md, BOTH trees)_

1. **AC status table** (the `kind`-column table, ~L720–730): add an
   `evidence-rung` column, enum `live | headless | emulator-or-container |
   mock | static | n-a` (`n-a` for `code-only` ACs). The rung is the *highest*
   rung that produced the recorded evidence for that AC.
2. **Gate rule** (User-observable AC gate, Step 7.5 §~L361 and the ladder
   rules ~L180–184): a **user-observable** AC whose evidence-rung is `mock` or
   `static` is **not met** — climb the ladder or take the deferral path. This
   generalizes the existing integration-blindspot guard from "AC asserts a
   live integration" to *all* user-observable ACs, closing the "the AC was
   about app behavior, the fixture was the liar" hole.
3. **Fixture-fidelity spot-check** (new short subsection near the ladder
   rules): when a fixture/mock **of an external service** is the evidence
   backing any AC (including code-only ACs), spot-check the fixture's shape
   against the real contract — the dependency's types/`.d.ts`, its official
   docs, or one free schema-level call — and record
   `fixture-fidelity: checked | unchecked — <why>` per fixture. This is the
   only rule in this plan that could have caught Waypoint's same-bug-in-fixture
   case at verify time. Keep it a *spot-check* (shape/enum names), not a
   contract-test mandate — `/wf study-sources` is the natural tool.
4. **Frontmatter rollup — Phase 3, not Phase 2.** A
   `metric-mock-evidenced-acs: <N>` frontmatter field + post-write-verify lint
   (block `result: pass` when a user-observable AC row carries
   `evidence-rung: mock|static`) requires touching
   `hooks/post-write-verify.mjs`, `tests/frontmatter.schema.json`,
   `schemas/sdlc-config.schema.json` (opt-out key), `lib/config.mjs` — and any
   `hooks/`/`lib/` change **must rebuild `dist/` in the same commit** and
   bumps the buildId (⇒ `npm run sync:codex`). Defer to Phase 3 so Phase 2
   stays a reference-only release.

### F6 — Stage-scope clamp _(G6a · yolo.js only)_

One operating-rule line in the `runStage` prompt (~L460–468) and in
`runUpdateDepsExec`:

> `- Your mandate is ONLY the '${stage}' stage for ${slice ? "slice '"+slice+"'" : "slug '"+slug+"'"}. Do not run other stages, do not claim completion of other slices or of the workflow, and do not recommend routes beyond what this stage's reference itself returns.`

---

## 4. Phasing

| Phase | Fixes | Files | Release overhead |
|---|---|---|---|
| **1** | F1, F2, F3, F6 | `skills/wf/workflows/yolo.js`, `tests/unit/skills/yolo-gates.test.mjs` | Version bump only (yolo.js is not in `dist/`, never synced to codex). No doc-brand impact beyond the standard bump sweep. Optional: one paragraph on probe receipts in the yolo doc page. |
| **2** | F4, F5.1–3 | `skills/wf/reference/verify.md` **both trees**; check `tests/wf-fixtures.json` for pinned verify.md content; parity count | Full both-trees bump. Codex edits are hand-mirrored (no sed) — the touched sections are mechanical enough to mirror cleanly, but respect existing platform substitutions. |
| **3** (optional, evidence-driven) | F5.4 hook lint; update-deps corrective probe re-run if the pattern recurs there | `hooks/post-write-verify.mjs`, `lib/config.mjs`, schemas, `dist/` rebuild | Full bump + `npm run build` + `npm run sync:codex` + codex manifests. Ship only if Phase 1+2 field data shows probe-less/mock-pass artifacts still get written. |

Phase 1 is deliberately first: it is one Claude-only file, it converts the two
damage-causing failure classes into driver-enforced structure, and it can ship
without touching the codex mirror at all.

## 5. Acceptance criteria

- **P1-1** `POLICY.verify` and `POLICY['update-deps']` contain the ladder +
  probe-receipt + never-inherit + skip-is-not-evidence language; no bare
  "cannot produce (no emulator/creds)" phrasing survives as a sufficient
  defer condition.
- **P1-2** A structurally-clean verify return whose deferrals all carry
  `probe` proceeds with zero extra subagent runs (no regression on the
  happy path).
- **P1-3** A clean return with ≥1 probe-less deferral triggers exactly one
  corrective verify re-run; if receipts arrive, the chain proceeds; if not,
  hard-stop whose reason names the receipt-less ACs. Covered by extracted-fn
  unit tests (`probeGaps`) + a driveVerify-level assertion if extractable.
- **P1-4** With open `runtime-evidence-deferrals` in 00-index.md, the verify
  prompt contains the RE-CHALLENGE clause listing them; the hand-back carries
  `deferralPressure` when any deferral is open. (Prompt-content assertions can
  pin the template string in yolo.js the same way the gate tests pin the
  functions — string-extraction, not execution.)
- **P1-5** All existing `yolo-gates.test.mjs` cases pass unchanged.
- **P2-1** verify.md (both trees) carries the per-AC skip rule, the
  `skipped-gating-specs` report line, the AC-gate table row, the
  `evidence-rung` column + user-observable mock/static rule, and the
  fixture-fidelity spot-check; `npm test` green in both trees; parity/fixture
  counts reconciled.
- **P2-2** Re-run the audit's two named scenarios as thought experiments
  against the new text: (a) Waypoint OAuth — the skipped seeded-session E2E now
  lands in `skipped-gating-specs` and forces blocked/defer on that AC before
  any SHIP verdict; (b) Waypoint fixtures — the event-emission ACs are
  user-observable with `evidence-rung: mock` ⇒ not met ⇒ climb (real key probe)
  or defer ⇒ `/wf ship` blocks. Both must trace to a changed outcome on paper.

## 6. Risks / non-goals

- **False stops (the v9.114 ghost).** Mitigated by design: probe enforcement
  is a corrective re-run first, hard-stop second; `verifyClean`'s accept
  condition is untouched; `evaluateGate` unchanged. Watch the first week of
  runs for corrective-round frequency — if >30 % of deferrals need the
  corrective round, the POLICY wording (F1) isn't landing and should be
  tightened before considering harder gates.
- **Policy bloat.** F1 caps at ~1.5× the current paragraph. yolo's value is
  that the policy is readable; verify.md remains the deep law.
- **Deferral-friction pushback.** Probe receipts add real work to each
  deferral. That is the point — but keep receipts cheap: one command + tail,
  and the ladder's pre-authorization rule still governs anything
  quota-consuming.
- **Not attempting:** fixture-fidelity as a hard gate (spot-check only);
  parallel-implement changes; any auto/manual-path behavior change beyond what
  verify.md edits imply for manual runs (F4/F5 intentionally improve manual
  verify too); codex yolo (permanent divergence, by design).
- **Working-tree discipline.** The repo currently carries unpushed v9.124.0
  work. Stage explicitly by path; never `git add -A`.

## 7. Source material

- Audit memory: `sdlc_yolo_subagent_context_audit_2026_07_12.md` (session IDs,
  per-incident evidence, per-project breakdown).
- Prior art this plan extends: `AC-VERIFIABILITY-AND-DEFERRAL-RECOMMENDATIONS.md`
  (R1–R7), `FEEDBACK-LOOPS-AND-HARDENING-PLAN.md` (W2),
  `YOLO-AUTONOMOUS-DRIVER-PLAN.md` (policy tiers, wrap-not-fork),
  v9.114 CHANGELOG entry (verifyClean residual false-stop),
  v9.121 CHANGELOG entry (headless adapters).
