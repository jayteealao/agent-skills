Run systematic **technical** quality checks and generate a comprehensive report. Don't fix issues — document them for other commands to address.

This is a code-level audit, not a design critique. Check what is measurable and verifiable in the implementation.

**Reuse verify measurements.** When a `06-verify-*.md` record exists (`wf.mjs record list` names it), read it with `wf.mjs record get` and consume its measured accessibility, performance, and web-vitals results. Do not re-run axe-core or Lighthouse. Measure these yourself only when no verify ran.

**Load the floor as a checklist.** Load [_craft-floor.md](_craft-floor.md). Score accessibility against its Verify list, and dimension 5 against its Refuse list. The audit edits nothing.

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

## Diagnostic Scan

Run comprehensive checks across 5 dimensions. Score each 0–4 using the criteria below.

### 1. Accessibility (A11y)

- **Contrast**: Text contrast ratios < 4.5:1 (or 7:1 for AAA)
- **Motion sensitivity**: the reduced-motion setting gets a planned alternative that keeps each state change and the hierarchy. Flag a global reduced-motion switch that sets every duration to zero: it removes useful feedback. Also flag flashing above the threshold, and motion that blocks focus, reading, or the task
- **Missing ARIA**: Interactive elements without proper roles, labels, or states
- **Keyboard navigation**: Missing focus indicators, illogical tab order, keyboard traps
- **Semantic HTML**: Improper heading hierarchy, missing landmarks, divs instead of buttons
- **Alt text**: Missing or poor image descriptions
- **Forms**: Inputs without labels, poor error messaging, missing required indicators

Score: 0=Inaccessible (fails WCAG A), 1=Major gaps, 2=Partial (some effort, significant gaps), 3=Good (WCAG AA mostly met), 4=Excellent (WCAG AA fully met, approaches AAA)

### 2. Performance

- **Layout thrashing**: Reading/writing layout properties in loops
- **Expensive animations** (terms of `animate.md` → Performance; platform forms in `_platforms.md`): a layout property animated, every property animated at once, app-thread motion during heavy work, a per-frame value routed through component state, one inherited value driving a child's motion, visible frame drops at the 8.3 ms budget
- **Motion materials (a cost flag, not a ban)**: animated blur above 20 px and an animated shadow are allowed on a Persuade or Experience focal moment inside the frame budget. Flag them on an Operate or Read surface, or when they drop frames
- **Missing optimization**: Images without lazy loading, unoptimized assets, a layer hint missing where a measured shift exists (and a layer hint added with no measured need, or left on at rest)
- **Bundle size**: Unnecessary imports, unused dependencies
- **Render performance**: Unnecessary re-renders, missing memoization

Score: 0=Severe issues, 1=Major problems, 2=Partial optimization, 3=Good (mostly optimized), 4=Excellent (fast, lean)

### 3. Theming

- **Hard-coded colors**: Values not using design tokens
- **Broken dark mode**: Missing dark mode variants, poor contrast
- **Inconsistent tokens**: Using wrong tokens, mixing token types
- **Theme switching**: Values that don't update on theme change

Score: 0=No theming, 1=Minimal tokens, 2=Partial, 3=Good (minor hard-coded values), 4=Excellent (full token system)

### 4. Responsive Design

- **Fixed widths**: Hard-coded widths that break on mobile
- **Touch targets**: Interactive elements < 44×44 px (a pointer-only desktop control < 32×32 px)
- **Broken touch interaction**: a custom slider, drag surface, or scrolling control strip whose main gesture fails under touch, takes the page scroll, or stays stuck after an interrupted gesture. Code signs: mouse-only handlers, no touch handling on a drag surface, drag state that nothing clears on cancel or blur. Run the gesture when a tool can make touch input. Name the source of the evidence: an emulated viewport, a made touch, which engine, or a real device
- **Horizontal scroll**: Content overflow on narrow viewports
- **Text scaling**: Layouts that break when text size increases
- **Missing breakpoints**: No mobile/tablet variants
- **Worst-case content**: the surface with the worst-case content of `harden.md` → Worst-case content (long names, unbreakable strings, extreme numbers, 0 and 1,000+ items, missing fields, right-to-left text) at the narrowest supported width. Report each break with its fix. This check scores inside this dimension; the 0–4 scale does not change. For the worst-case pass alone on a confirmed design, run `/wf design <slug> harden`.

Score: 0=Desktop-only, 1=Major issues, 2=Works on mobile but rough, 3=Good (minor issues), 4=Excellent (all viewports)

### 5. Implementation integrity

Score the build against the Refuse list and the Model tells of [_craft-floor.md](_craft-floor.md), and against the design-mode file of each surface (`02c-craft.md` `surface-modes:`). Look for:
- **Drift from `DESIGN.md`**: tokens, components, or patterns that the system does not hold.
- **Shortcuts**: the same refused element repeated across surfaces; decorative or misleading content; illustrative values not labelled as illustrative.
- **Interchangeable structure**: a layout that an unrelated product could ship unchanged.
- **Mode faults**: a display face in a label, bounce easing on an Operate or Read surface, a reinvented standard control, an inconsistent component vocabulary.

Check each finding in its context, and name each false positive. Keep a measured finding apart from a visual judgment.

Score: 0=systemic drift, 1=major repeated failures, 2=several verified issues, 3=minor isolated issues, 4=coherent and intentional

### Drift check (not scored)

Judge drift from the design record:
- Compare the implementation with the system in `DESIGN.md` at the project root.
- Compare the implementation with the goals in `.ai/design/direction.md`.
- List each drift as a finding with a severity.

## Verdict and severity

Map the scores to the `verdict` field:
- `pass` — the total is 16/20 or more, and no dimension scores below 2.
- `fail` — any dimension scores 0, or any `blocker` finding exists.
- `conditional` — all other cases.

Match severity to the scores:
- A dimension that scores 0 carries at least one `blocker` finding.
- A dimension that scores 1 carries at least one `high` finding.

## Generate Report

Format as a structured report:

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
| A1 | blocker/high/medium/low | token name or audit rule | file, component, or board key | specific problem | specific fix | open/in-progress/fixed/deferred |

## Recommended fixes
[Ordered by impact. Name the move for each fix:
 - `/wf design <slug> harden` for accessibility issues
 - `/wf design <slug> optimize` for performance issues
 - `/wf design <slug> colorize` for theming issues]
```

## Output in SDLC context

When invoked as `/wf design <slug> audit`:
- Write the report as the draft `.ai/workflows/<slug>/.draft/07-design-audit.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` ([_records.md](../_records.md))
- Register `design-audit` under `augmentations:` in `00-index.md` per [_output.md](_output.md)
- When `02c-craft.md` names `boards:`, compare each board PNG with its capture in `06-verify-*.md` `## Design Comparison` (`design/_boards.md`). Name the board key in the `Where` column of `## Findings`. A board without a capture is a gap; do not score it as a pass.
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
audited-against: [02b-design.md, 02c-craft.md, design/r<N>/boards.json]   # boards.json only when 02c-craft.md names boards:
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
