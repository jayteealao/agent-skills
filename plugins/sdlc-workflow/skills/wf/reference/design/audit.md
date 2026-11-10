Run the measured quality checks of a design and write a report. The audit edits nothing. It checks what is measurable in the screens and in the built code. The judgment of the design decisions is the critique ([critique.md](critique.md)).

**Reuse the measurements.** When a `06-verify-*.md` record exists (`wf.mjs record list` names it), read it with `wf.mjs record get`, and take its measured accessibility, performance and web-vitals results. Do not run those tools again. Measure them yourself only when no verify ran. When `wf.mjs design check` ran, do not report its failures again on the screens; report the same fault where the built code has it.

**Load the floor as a checklist.** Load [_craft-floor.md](_craft-floor.md). Its Verify table is the source of every number below. Its Refuse lists and Model tells are dimension 5. The audit is the one review that scores them.

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

## Diagnostic Scan

Score each of the five dimensions from 0 to 4.

### 1. Accessibility (A11y)

- **Contrast**: text, controls and focus rings under the minimums of floor rules 1–3.
- **Color as the only signal** of a state (floor rule 15).
- **Keyboard**: a missing focus indicator, an illogical tab order, a keyboard trap.
- **Semantics**: a broken heading order, missing landmarks, a plain container with a click handler in place of a native control.
- **Names**: a control, an input or an informative image with no accessible name; a required field or an error that assistive technology does not get.
- **Motion sensitivity**: the reduced-motion setting gets no planned alternative; a global switch sets every duration to zero; content flashes above floor rule 26.

Score: 0 = inaccessible (fails WCAG A), 1 = major gaps, 2 = partial, 3 = good (WCAG AA mostly met), 4 = excellent (WCAG AA fully met).

### 2. Performance

The terms are those of [_motion-build.md](_motion-build.md) → Performance; the platform forms are in [_platforms.md](_platforms.md).

- **Expensive animations**: a layout property animated, every property animated at once, app-thread motion during heavy work, a per-frame value routed through component state, one inherited value driving the motion of a child, visible frame drops.
- **Motion materials (a cost flag, not a ban)**: animated blur above 20 px and an animated shadow are allowed on a Persuade or Experience focal moment inside the frame budget. Flag them on an Operate or Read surface, or when they drop frames.
- **Layout thrashing**: layout reads and writes that alternate in a loop.
- **Media**: an image below the first viewport that does not load on demand, an image with no reserved size, an oversized asset.
- **Layer hints**: one missing where a measured shift exists, or one added with no measured need.
- **Payload and render**: an unused dependency, a view that rebuilds when its data did not change.

Score: 0 = severe issues, 1 = major problems, 2 = partial optimization, 3 = good, 4 = excellent (fast and lean).

### 3. Theming

- **Hard-coded colors**: a value that does not use a design token (floor rule 11). Name the nearest token.
- **Hard-coded scale values**: a spacing, radius, depth or type value that fits no token.
- **Broken dark mode**: a missing dark value, or poor contrast in one theme.
- **Inconsistent tokens**: the wrong token for the role.
- **Theme switching**: a value that does not update on a theme change.

Score: 0 = no theming, 1 = minimal tokens, 2 = partial, 3 = good (minor hard-coded values), 4 = excellent (full token system).

### 4. Responsive Design

- **Viewport fit**: horizontal scroll, or a fixed width that breaks a narrow viewport (floor rule 6).
- **Touch targets**: a control under the minimum hit area, or under the touch target on a touch surface (floor rules 4 and 5).
- **Broken touch interaction**: a custom slider, drag surface or scrolling control strip whose main gesture fails under touch, takes the page scroll, or stays stuck after an interrupted gesture. Code signs: mouse-only handlers, no touch handling on a drag surface, drag state that nothing clears on cancel or blur. Run the gesture when a tool can make touch input. Name the source of the evidence: an emulated viewport, a made touch, which engine, or a real device.
- **Text scaling**: a layout that breaks at the largest text size of the platform.
- **Structure**: a viewport that only scales and does not restructure.
- **Worst-case content**: the surface with the catalog of [_worst-case.md](_worst-case.md) at the narrowest supported width (floor rule 7). Report each break with its fix.

Score: 0 = one viewport only, 1 = major issues, 2 = works on a phone but rough, 3 = good (minor issues), 4 = excellent (all viewports).

### 5. Implementation integrity

Score the build against the Refuse lists and the Model tells of [_craft-floor.md](_craft-floor.md), and against the design-mode file of each surface (`02c-craft.md` `surface-modes:`). Look for:
- **Refused elements**: each one that is present, and the same one repeated across surfaces.
- **Drift from `DESIGN.md`**: tokens, components or patterns that the system does not hold.
- **Drift from the approved screens**: when `02c-craft.md` names `screens:`, a difference between an approval picture and its capture.
- **Misleading content**: illustrative values not labelled as illustrative.
- **Mode faults**: a display face in a label, bounce easing on an Operate or Read surface, a reinvented standard control, an inconsistent component vocabulary.

Check each finding in its context, and name each false positive. Keep a measured finding apart from a visual judgment.

Score: 0 = systemic drift, 1 = major repeated failures, 2 = several verified issues, 3 = minor isolated issues, 4 = coherent and intentional.

### Drift check (not scored)

- Compare the implementation with the system in `DESIGN.md` at the project root.
- Compare the implementation with the goals in `.ai/design/direction.md`.
- List each drift as a finding with a severity.

## Verdict and severity

Map the scores to the `verdict` field:

| Verdict | When |
|---|---|
| `fail` | Any dimension scores 0, or any `blocker` finding exists. Test this first. |
| `pass` | No `fail` condition holds, the total is 16 of 20 or more, and no dimension scores below 2. |
| `conditional` | All other cases. |

A dimension that scores 0 carries at least one `blocker` finding. A dimension that scores 1 carries at least one `high` finding.

## Route each finding

Name the move that fixes each finding, from the routing table of [_lane.md](_lane.md) → Moves. Write it at the end of the Recommendation cell as "move: `<name>`". A finding with no move in the table says "no move" and names the stage that fixes it. The fix is made by the review fix loop, or by `/wf implement <slug> <slice> reviews`, which follows the file of the move. `/wf design <slug> <move>` on an approved design only checks; it changes no code.

## Generate Report

```
## Design Audit Report

**Overall score**: X/20

| Dimension | Score | Summary |
|---|---|---|
| Accessibility | X/4 | ... |
| Performance | X/4 | ... |
| Theming | X/4 | ... |
| Responsive | X/4 | ... |
| Implementation integrity | X/4 | ... |

## Critical issues (score 0–1 in any dimension)
[List with file:line references]

## Findings
| ID | Severity | Rule | Where | Observation | Recommendation | Status |
|---|---|---|---|---|---|---|
| A1 | blocker/high/medium/low | floor rule or audit rule | file, component, or screen key | specific problem | specific fix — move: `<name>` | open/in-progress/fixed/deferred |

## Recommended fixes
[Ordered by impact, grouped by move.]
```

## Output in SDLC context

When invoked as `/wf design <slug> audit`:
- Write the report as the draft `<wf-dir>/.draft/07-design-audit.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` ([_records.md](../_records.md))
- Register `design-audit` under `augmentations:` in `00-index.md` per [_output.md](_output.md)
- When `02c-craft.md` names `screens:`, compare each approval picture with its capture in `06-verify-*.md` `## Design Comparison` (`design/_surface.md`). Name the screen key in the `Where` column of `## Findings`. A screen without a capture is a gap; do not score it as a pass.
- Use this frontmatter:

```yaml
---
schema: sdlc/v1
type: design-audit
slug: <slug>
title: Design audit
status: ready
created-at: <timestamp>
updated-at: <timestamp>
verdict: <pass|fail|conditional>
audited-against: [02b-design.md, 02c-craft.md]
violations-count: <number>
severity-distribution:
  blocker: <number>
  high: <number>
  medium: <number>
  low: <number>
remediation-state: <none|in-progress|complete|deferred>
refs:
  implementation: 05-implement.md
next-command: wf-review
next-invocation: "/wf review <slug>"
recommended-routes: [{invocation: "/wf review <slug>", reason: "fold the findings into review", default: true}]
---
```

- Write one `## Findings` row for each violation. Later stages read the severity of each finding from this table.
