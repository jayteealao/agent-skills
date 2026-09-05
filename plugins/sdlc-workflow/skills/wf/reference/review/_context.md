# Review stage — context reads (Step 0 items 6–7 of `_stage.md`)

Load this file from `_stage.md` Step 0. It lists the artifacts to read before command selection, by `review-scope`, plus the augmentation reads and the verify cross-reads.

## Item 6 — Read the full context

**Per-slice mode** — read the slice's context:
- `03-slice-<slice-slug>.md` — acceptance criteria and scope
- `04-plan-<slice-slug>.md` — what was planned
- `05-implement-<slice-slug>.md` — what was built
- `06-verify-<slice-slug>.md` (if exists) — verification results
- `02-shape.md` — overall spec
- `03-slice.md` — master slice index (for sibling context)
- `po-answers.md`

**Slug-wide mode** — read every slice's context plus shape:
- `02-shape.md` — overall spec (primary acceptance criteria source)
- `03-slice.md` — master slice index (lists every slice)
- For every slice listed in `03-slice.md`: `03-slice-<slice>.md`, `04-plan-<slice>.md` (if present), `05-implement-<slice>.md` (if present), `06-verify-<slice>.md` (if present)
- `po-answers.md`

## Item 7 — Read augmentation context (optional — workflow may have any combination)

Read the `augmentations:` list in `00-index.md` if present, plus the artifacts each entry references. Per-type guidance:

| Type | What review must do |
|---|---|
| `design-<sub>` | Read `design-notes/<sub>-<timestamp>.md`. The documented design changes are intentional — do not flag them as unexpected. Validate them: did they achieve their stated goal? |
| `design-audit` | Read `07-design-audit.md`. Treat as already-known findings; merge with new findings during dispatch. |
| `design-critique` | Read `07-design-critique.md`. Same as above. |
| `instrument` | Read `04b-instrument.md`. Review the instrumentation as a first-class deliverable: are signals appropriate, is PII handled, is the framework usage correct? |
| `experiment` | Read `04c-experiment.md`. Review the experiment infrastructure: is the cohort logic correct, are metrics appropriate, is the rollback path safe? |
| `benchmark` | Read `05c-benchmark.md`. Cross-reference with `06-verify` compare-mode results. If verify flagged regressions, surface them as review findings. |

Also read `02b-design.md` and `02c-craft.md` for register, anti-goals, and visual contract — **`02c-craft.md` is mandatory when present** — review must check anti-goals were honored.

Cross-reference `06-verify-<slice-slug>.md` (per-slice mode) or every `06-verify-*.md` file (slug-wide mode). Mandatory reads from each verify artifact:
- `## Augmentation Verification` — failed augmentation re-checks become BLOCKER or HIGH findings automatically.
- `stability-check-flaky-count` (frontmatter) — any value > 0 is a HIGH finding; flaky criteria indicate race conditions or state leakage that review sub-agents should investigate in the diff.
- `adversarial-tests-failed` (frontmatter) — any value > 0 means `## Adversarial Tests` contains BLOCKER or HIGH findings; surface them in the aggregated finding list.
- `cross-browser-delta` (frontmatter) — if `findings`, read `## Cross-Browser Delta` and surface each divergence as a HIGH compatibility finding.
- `web-vitals-inp-ms` (frontmatter) — if > 200, surface as a HIGH performance finding; `web-vitals-lcp-ms` > 2500 and `web-vitals-cls` > 0.1 are WARN.
- `## Friction Notes` and `## Free Exploration Notes` — these are informational (not auto-promoted to issues) but must appear in the review's `## Soft Findings` or `## Reviewer Notes` section so the human reviewer can see them. They represent observations a first-time user would notice that no AC captured.
