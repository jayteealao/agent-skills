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
| `keys` | rows of the four key tables in `skills/wf/SKILL.md` | 22 |
| `intakeModes` | the mode keyword set that `reference/intake.md` names | 12 |
| `reviewRubrics` | `reference/review/<rubric>.md`, underscore files excluded | 11 |
| `aggregates` | rows of the aggregate table in `reference/review.md` | 7 |
| `artifactStems` | distinct artifact names in the capability inventory's `artifacts` union | 93 |
| `frontmatterTypes` | distinct `type` values the frontmatter schema's `oneOf` branches accept | 66 |

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

## 5. Raising a pin

1. Meet the five items of the earn rule.
2. Edit the one number in `surface-policy.json`.
3. Run `npm run verify:surface`. The gate must print `OK`.
4. Name the raised pin in the pull request description.
