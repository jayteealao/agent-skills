# Verify: augmentation re-verification (sub-agent 4)

This file belongs to [../verify.md](../verify.md), Step 4. Load it when `02c-craft.md` exists or the `00-index.md` `augmentations:` list is not empty (`mode:augment`). `wf.mjs record list "<root>" <slug>` names the records that exist; read a record with `wf.mjs record get` ([_records.md](../_records.md)). Otherwise do not dispatch sub-agent 4. Dispatch it per [../_subagents.md](../_subagents.md), with the rules of [_sub-agents.md](_sub-agents.md). The measurable design checks (a11y, performance, responsive, web vitals) and the craft floor checklist are in sub-agent 3 ([_runtime-evidence.md](_runtime-evidence.md)). The re-checks below confirm that each applied transform hit its goal.

## Functional sub-agent 4 — Augmentation Re-verification (only if `02c-craft.md` or `00-index.md` `augmentations:` list is non-empty)

Launch only if `02c-craft.md` exists or the `augmentations:` list is non-empty. Enforces contracts the standard test suites do not catch. Give it the paths of the screen pages and the approval pictures, never a canvas URL: a sub-agent reads files.

**Screen comparison (when `02c-craft.md` names `screens:`).** When the stack can capture the running surface, capture each built screen to the path that `node "<skill-dir>/scripts/wf.mjs" design capture-path "<projectRoot>" <slug> <slice> <key>` prints, and the `worst` state as `<key>--worst`. After the last capture, run `node "<skill-dir>/scripts/wf.mjs" design captures "<projectRoot>" <slug> <slice>`: it commits the captures to the records. Pair each capture with the approval picture of its screen by key in `## Design Comparison`, and list the differences (`design/_surface.md`). The differences are evidence for review, not a pass rule.

**Design audit (when `02c-craft.md` names `screens:`).** Run the Diagnostic Scan of `design/audit.md` over the built UI of this slice: the files that `05-implement-<slice-slug>.md` names, read against the screens of the slice. Weigh three rules most:
- Theming → hard-coded colors and inconsistent tokens, against `DESIGN.md` and `.ai/design/tokens.css`.
- Responsive → touch targets under the minimum of the slice's platform in `design/_platforms.md`.
- Implementation integrity → drift from `DESIGN.md`.

The rules read the code, so they hold for the web, Android, iOS and desktop. When the stack can run the surface, measure each target; do not estimate it from the code. On the web, use the browser of sub-agent 3. On Android, run `adb shell uiautomator dump`, read the `bounds` of each clickable node, and divide by the density of `adb shell wm density` to get dp. On Windows, read the UI Automation tree. Write each finding under `## Design Audit` per [_artifact.md](_artifact.md). A blocker or high finding is an issue of the slice, and the fix loop of Step 7.6 fixes it. A medium or low finding is evidence for review.

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

**Reporting.** Pass: all mock fidelity items honored, all type checks pass, no critical finding outstanding, and no blocker or high design-audit finding open. Fail: each failure with severity; these become BLOCKER or HIGH issues for `/wf review`.
