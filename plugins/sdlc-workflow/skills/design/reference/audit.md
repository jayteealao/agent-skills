Run systematic **technical** quality checks and generate a comprehensive report. Don't fix issues — document them for other commands to address.

This is a code-level audit, not a design critique. Check what is measurable and verifiable in the implementation.

**Accessibility lives here.** Not in the general design laws, not in shape or craft. Models over-cautious themselves into safe, underdesigned output when reminded about accessibility at design time. The audit command is the dedicated place for that check.

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
- **Expensive animations**: Layout-property animation, unbounded blur/filter/shadow, visible frame drops
- **Missing optimization**: Images without lazy loading, unoptimized assets, missing will-change
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
- **Touch targets**: Interactive elements < 44×44 px
- **Horizontal scroll**: Content overflow on narrow viewports
- **Text scaling**: Layouts that break when text size increases
- **Missing breakpoints**: No mobile/tablet variants

Score: 0=Desktop-only, 1=Major issues, 2=Works on mobile but rough, 3=Good (minor issues), 4=Excellent (all viewports)

### 5. Anti-patterns

Check against all absolute bans from the parent skill and register references. Look for AI slop tells and general design anti-patterns:
- AI slop tells: purple-blue gradients, glassmorphism, hero metric cards, generic card grids, gradient text, Fraunces/Outfit/Plus Jakarta Sans on new surfaces
- Design anti-patterns: `border-left`/`border-right` colored accent stripes, nested cards, bounce easing, gray text on colored backgrounds
- Product anti-patterns: display fonts in labels, inconsistent component vocabulary, reinvented standard affordances

Score: 0=AI slop gallery (5+ tells), 1=Heavy AI aesthetic (3–4 tells), 2=Some tells (1–2), 3=Mostly clean (subtle issues), 4=No AI tells (distinctive, intentional)

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

## Recommended fixes
[Ordered by impact, with specific commands to address each:
 - `/wf-design harden` for accessibility issues
 - `/wf-design optimize` for performance issues
 - `/wf-design colorize` for theming issues
 - etc.]
```

## Output in SDLC context

When invoked as `/wf-design <slug> audit`:
- Write report to `.ai/workflows/<slug>/07-design-audit.md`
- Update `00-index.md` if at review stage
