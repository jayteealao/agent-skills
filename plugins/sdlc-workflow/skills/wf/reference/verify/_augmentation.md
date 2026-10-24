# Verify: augmentation re-verification (sub-agent 4)

This file belongs to [../verify.md](../verify.md), Step 4. Load it when `02c-craft.md` exists or the `00-index.md` `augmentations:` list is not empty (`mode:augment`). Otherwise do not dispatch sub-agent 4. Dispatch it per [../_subagents.md](../_subagents.md), with the rules of [_sub-agents.md](_sub-agents.md). The measurable design checks (a11y, performance, responsive, web vitals) and the craft floor checklist are in sub-agent 3 ([_runtime-evidence.md](_runtime-evidence.md)). The re-checks below confirm that each applied transform hit its goal.

## Functional sub-agent 4 — Augmentation Re-verification (only if `02c-craft.md` or `00-index.md` `augmentations:` list is non-empty)

Launch only if `02c-craft.md` exists or the `augmentations:` list is non-empty. Enforces contracts the standard test suites do not catch. Give it the board PNG paths from `boards:`, never a canvas link: a sub-agent cannot open a canvas link.

**Board comparison (when `02c-craft.md` names `boards:`).** When the stack can capture the running surface, capture each built surface to the path that `node "<skill-dir>/scripts/design-boards.mjs" capture-name "<projectRoot>" <slug> <slice> <key>` gives. Pair each capture with its board PNG by key in `## Design Comparison`, and list the differences (`design/_boards.md`). The differences are evidence for review, not a pass rule.

**Mock fidelity inventory check (when `02c-craft.md` is present).** For each item in `02c-craft.md` `## Mock fidelity inventory`, find its disposition in `05-implement-<slice-slug>.md` `## Visual Contract Honored`. "Honored" items: open the cited file:line and confirm the item is implemented as described; do not trust the implementation record blindly. "Deviation" items: surface them in the verify report (not failures by default, but visible). Visual spot-check: load the affected route in the browser tool that sub-agent 3 selected. Compare the capture with the board PNG of the same key (`design/r<N>/boards/<key>.png`), never with a canvas link. Report composition, hierarchy, or signature-move regressions. When no board file exists on disk, record `design-comparison: no-boards`. Then report no visual pass and no mock-fidelity pass.

**Type-specific checks (per `augmentations:` entry):**

| Type | Check |
|---|---|
| `design-harden` | a11y scan (axe-core or framework equivalent) on `files-modified`; report new WCAG AA violations. |
| `design-optimize` | Re-measure performance (Lighthouse / DevTools profile / framework perf test) on the modified surface against the documented improvements; flag regressions. |
| `design-adapt` | Re-test responsive behavior at the documented breakpoints; confirm mobile, tablet, and desktop work. |
| `design-colorize` / `design-typeset` / `design-polish` / `design-bolder` / `design-quieter` / `design-delight` | Visual diff against the augmentation's `## What changed`; confirm the changes are present and surrounding UI did not regress. |
| `design-<sub>` (other) | Read `design-notes/<sub>-<timestamp>.md` `## Verification needed` and re-run those checks (`harden` → a11y; `optimize` → perf; `adapt` → responsive). |
| `design-audit` | Read `07-design-audit.md`; confirm every "critical" and "high" finding is resolved in code. |
| `design-critique` | Read `07-design-critique.md`; note actioned vs unactioned recommendations. |
| `instrument` | Read `04b-instrument.md`; for each designed signal, exercise the affected path and confirm the log/metric/trace fires (tests, live observation, or log grep); report missing signals. |
| `experiment` | Read `04c-experiment.md`; confirm the feature flag is wired, the cohort split produces the documented distribution, primary/secondary/guardrail metrics fire on the expected events, and the rollback path works. |
| `tune` | Read `05d-tune.md`; run its `harness` on the final commit, and confirm the number is inside `target` when `result: met`. A number outside the range fails the acceptance criterion. |
| `benchmark` (mode: baseline) | Load `augment/benchmark.md` in compare mode; compare against the `05c-benchmark.md` baseline; flag regressions past the documented tripwires (default >10% CPU / >25% memory). |

**Reporting.** Pass: all mock fidelity items honored, all type checks pass, no critical finding outstanding. Fail: each failure with severity; these become BLOCKER or HIGH issues for `/wf review`.
