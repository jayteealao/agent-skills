# Review stage — how to use the augmentation and verify inputs (Step 0 item 7 of `_stage.md`)

[review.md ## Requires](../review.md#requires) lists the inputs. This file says how review uses the augmentation and verify inputs.

## Augmentation inputs

Read the `augmentations:` list in `00-index.md` if present, plus the artifacts each entry references. Per-type guidance:

| Type | What review must do |
|---|---|
| `design-<sub>` | Read `design-notes/<sub>-<timestamp>.md`. The documented design changes are intentional — do not flag them as unexpected. Validate them: did they achieve their stated goal? |
| `design-audit` | Read `07-design-audit.md`. Treat as already-known findings; merge with new findings during dispatch. |
| `design-critique` | Read `07-design-critique.md`. Same as above. |
| `instrument` | Read `04b-instrument.md`. Review the instrumentation as a first-class deliverable: are signals appropriate, is PII handled, is the framework usage correct? |
| `experiment` | Read `04c-experiment.md`. Review the experiment infrastructure: is the cohort logic correct, are metrics appropriate, is the rollback path safe? |
| `benchmark` | Read `05c-benchmark.md`. Cross-reference with `06-verify` compare-mode results. If verify flagged regressions, surface them as review findings. |

Use `02b-design.md` and `02c-craft.md` for register, anti-goals and visual contract. Check that the change honors the `02c-craft.md` anti-goals. When `02c-craft.md` names `boards:`, compare each board PNG with its capture in the verify `## Design Comparison` (`design/_boards.md`). Route a finding against a confirmed board to `/wf design <slug> amend` as a question; do not redraw the board.

## Verify inputs

Use these values from each `06-verify-*.md` file in scope:
- `## Augmentation Verification` — failed augmentation re-checks become BLOCKER or HIGH findings automatically.
- `stability-check-flaky-count` (frontmatter) — any value > 0 is a HIGH finding; flaky criteria indicate race conditions or state leakage that review sub-agents should investigate in the diff.
- `adversarial-tests-failed` (frontmatter) — any value > 0 means `## Adversarial Tests` contains BLOCKER or HIGH findings; surface them in the aggregated finding list.
- `cross-browser-delta` (frontmatter) — if `findings`, read `## Cross-Browser Delta` and surface each divergence as a HIGH compatibility finding.
- `design-comparison` (frontmatter) — `no-boards` means no visual check exists; do not count the visual contract as verified.
- `web-vitals-inp-ms` (frontmatter) — if > 200, surface as a HIGH performance finding; `web-vitals-lcp-ms` > 2500 and `web-vitals-cls` > 0.1 are WARN.
- `## Friction Notes` and `## Free Exploration Notes` — these are informational (not auto-promoted to issues) but must appear in the review's `## Soft Findings` section so the human reviewer can see them. They represent observations a first-time user would notice that no AC captured.
