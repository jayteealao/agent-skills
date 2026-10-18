# Surface policy — the freeze

**Status:** in force from 2026-09-07 (WIDE-VIEW-REPAIR-PLAN §11, wave W9).
**Gate:** `npm run verify:surface` (`scripts/verify-surface.mjs`). CI runs it
with the other release gates.
**Pins:** [surface-policy.json](surface-policy.json).

## 1. What is frozen

The pins are ceilings on six counts of the `/wf` surface. The gate counts each
from the tree and fails when a count exceeds its pin.

| Pin | Counted from | 2026-09-07 |
|---|---|---|
| `keys` | rows of the three key tables in `skills/wf/SKILL.md` (the sub-key table, headed "Sub-key", does not count) | 22 → 23 (2026-09-24, `brainstorm`; earn rule in BRAINSTORM-DESIGN-PLAN.md §7) → 24 (2026-10-03, `campaign`; earn rule in WF-CAMPAIGN-PLAN.md section 23) → 26 (2026-10-17, `goal` and `optimize`; WF-GOAL-PLAN.md and WF-OPTIMIZE-PLAN.md) → 27 (2026-10-18, `prototype`; earn rule in WF-PROTOTYPE-PLAN.md section 10) → 19 (2026-10-18, the moves of WF-KEY-SURFACE-PLAN.md: six sub-keys under `loop`, `status` and `project`, four intake modes; §2a) |
| `intakeModes` | the mode keyword set that `reference/intake.md` names | 12 → 13 (2026-09-22, `brainstorm`) → 14 (2026-10-17, `optimize`) → 17 (2026-10-18, `simplify`, `task` and the maintenance word `close` moved in by WF-KEY-SURFACE-PLAN.md; §2a) |
| `reviewRubrics` | `reference/review/<rubric>.md`, underscore files excluded | 11 |
| `aggregates` | rows of the aggregate table in `reference/review.md` | 7 |
| `artifactStems` | distinct artifact names in the capability inventory's `artifacts` union | 93 → 95 (2026-09-22, `01-brainstorm`, `03-slice-brainstorm-*`) → 92 (2026-09-29, hand-written typed fragment names left the references); the counter later read 70 → 75 (2026-10-17, `01-optimize`, `02-optimize-spec`, `03-slice-optimize`, `05-implement-optimize`, `06-verify-optimize`) → 76 (2026-10-18, `01-prototype`) |
| `frontmatterTypes` | distinct `type` values the frontmatter schema's `oneOf` branches accept | 66 → 67 (2026-09-22, `brainstorm`) → 69 (2026-10-03, `work-packet`, `work-set`; earn rule in BRAINSTORM-WORK-PACKETS-PLAN.md section 13) → 71 (2026-10-08, `design-current`, `design-direction`: the design record files had a documented type and no schema branch; DESIGN-BOARDS-PLAN W1) → 73 (2026-10-17, `optimize-spec`, `goal`) → 74 (2026-10-18, `prototype`) |

A count under its pin is slack. The gate reports slack and does not fail on
it. Lower a pin when a surface is deleted, so the file states the tree.

## 2. The earn rule

A pull request that adds a key, an intake mode, a rubric, an aggregate, an
artifact stem, or a frontmatter type must carry all five items:

1. One sentence that names a user job no existing key covers.
2. Three real invocations of the current workaround, cited from `cost.jsonl`
   rows or from transcripts.
3. The new file within its class budget (`npm run verify:prose`).
4. One eval case under `tests/evals/`.
5. The raised pin in `surface-policy.json`, in the same pull request.

A pull request that lacks one item does not raise a pin. The reviewer checks
the five items against the diff.

## 2a. A move is not an addition

A pull request that moves a key into an intake mode or into a sub-key of
another key lowers the `keys` pin by one for each moved key, in the same pull
request. The `intakeModes` pin rises by one for each key that becomes an intake
mode. The earn rule does not apply to the move, because no new job enters the
surface. A sub-key that names a new job is an addition, and the earn rule
applies to it.

## 3. How long the freeze holds

The freeze holds until `npm run measure:load` meets every §1.1 target of the
WIDE-VIEW-REPAIR-PLAN for two consecutive releases. When that holds, the PO
decides whether the freeze continues.

## 4. Router extraction — decided: no

The wide-view review proposed moving `ship-plan`, `docs`, and `observability`
into separate skills. The plan declines, for three reasons:

- `docs` was a separate skill (`/wf-docs`) and was dissolved into `/wf` in
  v9.4.0. Extraction reverses a settled decision.
- Extraction re-creates the redirect text that wave W2 deleted.
- A separate skill has its own version carrier. Wave W7 removed every carrier
  but `package.json`.

The freeze and the earn rule deliver the value of extraction without the
churn. The PO can override this decision; the override is a plan edit, not a
code change.

On 2026-10-18 the PO kept this decision and grouped two routers inside `/wf`
(WF-KEY-SURFACE-PLAN.md section 6.7). `ship-plan` and `observability` are the
sub-keys of the `project` key: `/wf project ship-plan …` and
`/wf project observability …`. A later project-level contract becomes a
sub-key of `project`, under the earn rule. `docs` stays a key.

## 5. Raising a pin

1. Meet the five items of the earn rule.
2. Edit the one number in `surface-policy.json`.
3. Run `npm run verify:surface`. The gate must print `OK`.
4. Name the raised pin in the pull request description.
