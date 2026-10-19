Run systematic **technical** quality checks and generate a comprehensive report. Don't fix issues — document them for other commands to address.

This is a code-level audit, not a design critique. Check what is measurable and verifiable in the implementation.

**Reuse verify measurements.** When `06-verify-*.md` exists, consume its measured accessibility, performance, and web-vitals results. Do not re-run axe-core or Lighthouse. Measure these yourself only when no verify ran.

**The audit scores accessibility** against the shared Accessibility law in `_design-context.md`.

## Diagnostic Scan

Run comprehensive checks across 5 dimensions. Score each 0–4 using the criteria below.

### 1. Accessibility (A11y)

- **Contrast**: Text contrast ratios < 4.5:1 (or 7:1 for AAA)
- **Missing ARIA**: Interactive elements without proper roles, labels, or states
- **Keyboard navigation**: Missing focus indicators, illogical tab order, keyboard traps
- **Semantic HTML**: Improper heading hierarchy, missing landmarks, divs instead of buttons
- **Alt text**: Missing or poor image descriptions
- **Forms**: Inputs without labels, poor error messaging, missing required indicators

Score: 0=Inaccessible (fails WCAG A), 1=Major gaps, 2=Partial (some effort, significant gaps), 3=Good (WCAG AA mostly met), 4=Excellent (WCAG AA fully met, approaches AAA)

### 2. Performance

- **Layout thrashing**: Reading/writing layout properties in loops
- **Expensive animations** (terms of `animate.md` → Performance; platform forms in `_platforms.md`): a layout property animated, every property animated at once, app-thread motion during heavy work, a per-frame value routed through component state, one inherited value driving a child's motion, animated blur above 20 px, an animated shadow, visible frame drops at the 8.3 ms budget
- **Missing optimization**: Images without lazy loading, unoptimized assets, a layer hint missing where a measured shift exists (and a layer hint added with no measured need)
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
- **Horizontal scroll**: Content overflow on narrow viewports
- **Text scaling**: Layouts that break when text size increases
- **Missing breakpoints**: No mobile/tablet variants
- **Worst-case content**: the surface with the worst-case content of `harden.md` → Worst-case content (long names, unbreakable strings, extreme numbers, 0 and 1,000+ items, missing fields, right-to-left text) at the narrowest supported width. Report each break with its fix. This check scores inside this dimension; the 0–4 scale does not change. For the worst-case pass alone on a confirmed design, run `/wf design <slug> harden`.

Score: 0=Desktop-only, 1=Major issues, 2=Works on mobile but rough, 3=Good (minor issues), 4=Excellent (all viewports)

### 5. Anti-patterns

Check against the absolute bans in [_design-context.md](_design-context.md) → Absolute bans, and against the register references. Look for AI slop tells and general design anti-patterns:
- AI slop tells: purple-blue gradients, glassmorphism, hero metric cards, generic card grids, gradient text, fonts from the reflex-reject list in [brand.md](brand.md) on new surfaces
- Design anti-patterns: `border-left`/`border-right` colored accent stripes, nested cards, bounce easing in product-register UI, gray text on colored backgrounds
- Product anti-patterns: display fonts in labels, inconsistent component vocabulary, reinvented standard affordances

Score: 0=AI slop gallery (5+ tells), 1=Heavy AI aesthetic (3–4 tells), 2=Some tells (1–2), 3=Mostly clean (subtle issues), 4=No AI tells (distinctive, intentional)

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
| Anti-patterns | X/4 | ... |

## Critical issues (score 0–1 in any dimension)
[List with file:line references]

## Findings
| ID | Severity | Rule | Where | Observation | Recommendation | Status |
|---|---|---|---|---|---|---|
| A1 | blocker/high/medium/low | token name or audit rule | file, component, or board key | specific problem | specific fix | open/in-progress/fixed/deferred |

## Recommended fixes
[Ordered by impact, with specific commands to address each:
 - `/wf design harden` for accessibility issues
 - `/wf design optimize` for performance issues
 - `/wf design colorize` for theming issues
 - etc.]
```

## Output in SDLC context

When invoked as `/wf design <slug> audit`:
- Write report to `.ai/workflows/<slug>/07-design-audit.md`
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
