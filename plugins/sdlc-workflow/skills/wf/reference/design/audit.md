Run systematic **technical** quality checks and generate a comprehensive report. Don't fix issues — document them for other commands to address.

This is a code-level audit, not a design critique. Check what is measurable and verifiable in the implementation.

**Accessibility lives here.** Not in the general design laws, not in the brief or the contract step. Models over-cautious themselves into safe, underdesigned output when reminded about accessibility at design time. The audit command is the dedicated place for that check.

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
- **Expensive animations**: Layout-property animation (`width`/`height`/`top`/`left`/`margin`), `transition: all`, unbounded blur/filter/shadow, Framer Motion `x`/`y`/`scale` shorthands running on the main thread, visible frame drops
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
## The Design Audit
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Write it in the voice defined in `../_narrative-voice.md` (Sebastian Raschka register: relevance first, why before how, tradeoffs stated plainly, varied rhythm — NO "This design audit implements…" openings). 1–4 short paragraphs. -->

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
 - `/wf design harden` for accessibility issues
 - `/wf design optimize` for performance issues
 - `/wf design colorize` for theming issues
 - etc.]
```

## Output in SDLC context

When invoked as `/wf design <slug> audit`:
- Write report to `.ai/workflows/<slug>/07-design-audit.md`
- Update `00-index.md` if at review stage
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
---
```

- **Required — write the sibling YAML** to
  `.ai/workflows/<slug>/07-design-audit.yaml`:

```yaml
artifact: design-audit
verdict: <pass|fail|conditional>
audited-against: [02b-design.md, 02c-craft.md]
remediation-state: <none|in-progress|complete|deferred>
run_at: <timestamp>
violations:
  - id: A1
    severity: <blocker|high|medium|low>
    token-or-rule: <token name or audit rule>
    where: <file/component/area>
    observation: <specific problem>
    remediation-status: <open|in-progress|fixed|deferred>
    recommendation: <specific fix>
```

- **Required — write the sibling `07-design-audit.html.fragment`** next to the
  `.md` and `.yaml`. First load
  `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_fragment-authoring.md` and follow its
  wrapper, snippet, and verifier rules. Body-only — `design-audit.mjs` already owns
  the heading, metric-row, and verdict block, and suppresses its static violations
  list when a fragment is present, so the fragment supplies the interactive layer
  (severity-filter pills over the violations, remediation-status grouping,
  expandable observation→recommendation rows). Deterministic from the sibling YAML
  (same YAML → byte-identical HTML); pass `scripts/verify-fragment.mjs` (Check 7)
  clean.

## Step — Write free narrative fragments

Beyond the structured page, this artifact ships one or more **free narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings of **unrestricted raw HTML** that tell a story the rendered page can't on its own — a live component preview, an annotated mock, a token swatch board, or a before/after comparison. Author **as many as the story needs**; there is **no contract, no scoping, and no sibling `.yaml`** for these. Prefix the label with `NN-` (`01-`, `02-`, …) to order them; they inject raw-inline below the page body. See [_fragment-authoring.md](../../wf/reference/_fragment-authoring.md) Step F2 and [narrative-fragments.md](../../../reference/narrative-fragments.md).
