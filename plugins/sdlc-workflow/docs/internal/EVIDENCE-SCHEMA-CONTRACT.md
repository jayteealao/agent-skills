# Evidence Schema Contract — the frozen data contract for the merged verify+hooks release

> Status: **FROZEN 2026-07-12** (reconciliation Step 0). This is the single canonical
> definition of the frontmatter fields, enums, gate rules, and hook lints that
> [INTENT-FIDELITY-HARDENING-PLAN.md](INTENT-FIDELITY-HARDENING-PLAN.md) (W5/W9.1) and
> [YOLO-EVIDENCE-INTEGRITY-PLAN.md](YOLO-EVIDENCE-INTEGRITY-PLAN.md) (F4/F5) **both**
> write. Neither plan may redefine these — cite this file. Any change here is a contract
> revision that both plans inherit.

**Why this file exists.** The two plans independently defined an `evidence-rung` frontmatter
field with *different enum values*, plus two names (`mock-provenance` / `fixture-fidelity`) for
one provenance concept and two hook lints for one mock-pass block. A frontmatter field with two
writers emitting different enums doesn't merge-conflict in git — it corrupts the schema at
runtime (renderer, ship gate, and post-write-verify each read a value the other's writer never
emits). This contract is the one place those are pinned. Scope: `skills/wf/reference/verify.md`
(**both trees**), `00-index.md` / `06-verify.md` frontmatter, `tests/frontmatter.schema.json`,
`hooks/post-write-verify.mjs`, and the renderer chip.

---

## 1. `evidence-rung` (the load-bearing field)

Per-AC label recording the **highest** rung that produced the recorded evidence for that AC.

```
evidence-rung: live | headless | emulator-or-container | cited-mock | uncited-mock | static | n-a
```

Merged from YOLO F5.1 (operational rungs) + INTENT W9.1 (the cited/uncited honesty split):

| Value | Meaning | Source |
|---|---|---|
| `live` | Evidence from the real external service / real device / real user-path | both |
| `headless` | Real code path, headless runtime (per `runtime-adapters.md`) — a real rung, not a mock | YOLO F5.1 |
| `emulator-or-container` | Emulator / simulator / container — proxy for live, never `live` itself | YOLO F5.1 |
| `cited-mock` | Mock/fixture whose provenance is recorded (see §2) | INTENT W9.1 |
| `uncited-mock` | Mock/fixture with **no** recorded provenance — presumptively fictional | INTENT W9.1 |
| `static` | Static analysis / type-check / lint only — no execution | both |
| `n-a` | `code-only` ACs with no runtime surface to observe | YOLO F5.1 |

**Where written:** the `06-verify.md` AC status table (the `kind`-column table, ~L720–730) gains
this column; `00-index.md` gains an `evidence-quality:` slug rollup (counts by rung); the renderer
shows a chip beside the deferral chip (⇒ **render version-gate bump**).

---

## 2. `mock-provenance` (unifies INTENT W5.1 + YOLO F5.3)

Any mock/fixture that **emulates an external interface** (library stream/event shapes, HTTP
payloads, SDK return types) records where its shape came from. One field, two enforcement moves:

```
mock-provenance: <node_modules path read | captured-real-output ref | docs URL>
# "from recollection" is ILLEGAL — an unrecorded provenance ⇒ evidence-rung: uncited-mock
```

- **Grep check (INTENT W5.1, the `TEXT_DELTA` counterfactual):** when an AC's evidence rests on
  mocked external-interface events, grep the installed package for the mocked identifiers (event
  names, method names). **Zero hits ⇒ presumptively fictional ⇒ finding + cap that AC at
  `partial`.**
- **Fixture-fidelity spot-check (YOLO F5.3, folded in as the *how*):** spot-check the fixture's
  shape against the real contract — the dependency's types/`.d.ts`, official docs, or one free
  schema-level call — and record `fixture-fidelity: checked | unchecked — <why>` per fixture.
  Spot-check only (shape/enum names), **not** a contract-test mandate; `/wf study-sources` is the
  natural tool. `fixture-fidelity: checked` is what upgrades a mock from `uncited-mock` to
  `cited-mock`.

---

## 3. Gate rules on `verify.md`

1. **User-observable-mock = not met** (unifies INTENT W5.2/W9.1 + YOLO F5.2). A **user-observable**
   AC whose `evidence-rung` is `cited-mock`, `uncited-mock`, or `static` is **not met** — climb the
   ladder (`runtime-adapters.md`) or take the deferral path. Generalizes the shipped
   integration-blindspot guard from "AC asserts a live integration" to *all* user-observable ACs.
2. **Per-AC skip = missing evidence** (YOLO F4, unique — INTENT has no skip rule). A skipped gating
   spec (guard exit, `.skip`/`.todo`, missing env/secret, filtered out) is a **missing-evidence
   event for the AC it gates**; that AC cannot inherit the suite's overall green. `06-verify.md`
   records `skipped-gating-specs: [{spec, ac, precondition}]`. AC-gate table row: an AC whose
   designated gating spec was skipped, no other rung evidenced it, and no deferral annotation ⇒
   `blocked-runtime-evidence-missing`. (The existing all-skipped-*sweep* rule stays; this is the
   per-AC companion.)
3. **First-light cap** (INTENT W5.2). While `first-light: null` for an integration, ACs depending
   on it cap at `partial` (mock/emulator rungs are proxies, never `pass`).

---

## 4. Deferral-ledger fields on `00-index.md` (INTENT W5.3 + YOLO F3 compose)

These write to the **same** deferral ledger; they are complementary, not competing. Coordinate so
the frontmatter composes:

```yaml
runtime-evidence-deferrals:
  - ac: <id>
    reason: <probed incapability>
    probe: <literal command + one-line output tail>   # YOLO F1/F2 — receipt of the probe run this round
    repeat-of: <earlier slice, same wall>              # shipped v9.99–101
    absorbed-by: [<slice>, ...]                        # INTENT W5.3 — inheritance breadth
    cleared-by: <slice | null>                         # null = still open (YOLO F3 orient reads this)
```

- **`probe`** (YOLO F1/F2) — a deferral with no recorded probe receipt is invalid; enforced in
  `yolo.js` via `probeGaps()` + one corrective re-run (Step 1, not this release).
- **`absorbed-by`** (INTENT W5.3) — absorbing a deferral into a **third** slice is a **stop**, not
  an absorption (inheritance-breadth escalation).
- **Re-challenge** (YOLO F3) — `orient()` captures open entries (`cleared-by: null`) into
  `priorDeferrals`; `driveVerify` appends a RE-CHALLENGE clause. *This lives in `yolo.js` (Step 1)
  but reads the same ledger — it must anticipate `absorbed-by` landing later.*

---

## 5. `post-write-verify` mock-pass block — ONE hook (unifies INTENT W5.4/W9.1 + YOLO F5.4)

Do **not** ship two lints. One extension to `hooks/post-write-verify.mjs`, keyed on
`evidence-rung` (which makes YOLO's separate `metric-mock-evidenced-acs` field unnecessary):

- **Block** `result: pass` when a **user-observable** AC row carries
  `evidence-rung: uncited-mock | cited-mock | static` (per §3 rule 1).
- **Warn** on `first-light: null` co-occurring with `result: pass` on a dependent AC.
- Opt-out key: `hooks.mockEvidenceGate: false` (naming follows the `verifyDeferralLint` /
  `limitationClaimLint` precedent). Default ON.

**Build discipline:** this is a `hooks/`/`lib/` touch ⇒ rebuild `dist/` in the same commit ⇒
buildId moves ⇒ `npm run sync:codex` mandatory. It rides the **single** dist rebuild that also
carries INTENT's W3 limitation lexicon + W9.3 suppression-debt lint (that's the whole point of
Step 3 being one release).

---

## 6. What each plan still owns alone (no contract entry needed)

- **YOLO-EVIDENCE, `yolo.js` only (Step 1, ships first):** F1 `POLICY.verify` realignment, F2
  probe receipts + `probeGaps()` corrective re-run, F3 prior-deferral re-challenge + `deferralPressure`
  rollup, F6 stage-scope clamp. None touch `verify.md` or the schema above.
- **INTENT-FIDELITY, uncontested waves:** W1/W2/W7/W8 (shape spine), W3 limitation-claim citations +
  lint, W9.3 suppression-debt, W9.4 adoption-matrix, W4/W6/W10 (taxonomy/review/human-loop),
  W11 (yolo checkpoints — layer onto Step 1), W12 (meta-loop).
