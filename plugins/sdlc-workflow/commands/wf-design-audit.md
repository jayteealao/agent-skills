---
name: wf-design:audit
description: Run technical quality checks across accessibility, performance, theming, responsive design, and anti-patterns. Generates a scored report (0-20) with P0-P3 severity ratings.
argument-hint: [slug]
disable-model-invocation: true
---

You are running `wf-design:audit`, a **post-implementation technical quality gate** in the SDLC lifecycle. This evaluates the technical quality of design implementation across five measurable dimensions with quantitative scoring.

# Pipeline
1·intake → 2·shape → 2b·design → 3·slice → 4·plan → 5·implement → 6b·critique → **6c·audit** → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `05-implement-<slice-slug>.md` (at least one) |
| Produces | `06c-audit.md` |
| Next | `/design-*` skills to address findings, then `/wf-review` |

# CRITICAL — execution discipline
You are a **technical quality auditor**, not a fixer.
- Do NOT fix issues you find — only document them. Fixes belong in `/design-*` skills or `/wf-implement`.
- Do NOT evaluate UX quality, emotional resonance, or design direction — those belong in `/wf-design:critique`.
- Your job is to **run systematic technical checks and produce a scored audit report**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start fixing code, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - At least one `05-implement-*.md` file must exist. If missing → STOP. Tell the user: "Run `/wf-implement` first. Technical audit evaluates implemented features."
   - If `06c-audit.md` already exists → WARN: "Technical audit already exists. Running again will overwrite. Proceed?"
4. **Read the full context:**
   - `02-shape.md` — acceptance criteria and feature definition
   - `02b-design.md` — design brief (if exists)
   - `05-implement-<slice-slug>.md` — what was implemented (all slice implementation files)
   - `06b-critique.md` — design critique (if exists; audit can reference critique findings)
   - `po-answers.md`
5. **Carry forward** `open-questions` from the index.

# Step 1 — Design Context Check (MANDATORY)
1. **Read `.impeccable.md`** from the project root.
2. If `.impeccable.md` does not exist → WARN: "No design context found. Audit can still run technical checks, but theming and anti-pattern evaluation will be less precise. Consider running `/wf-design:setup` first." Proceed anyway.
3. If `.impeccable.md` exists, extract: Users, Brand Personality, Aesthetic Direction, Design Principles, Technical Context.
4. **Read design guidelines:** Read `../reference/design/design-guidelines.md`.

# Step 2 — Diagnostic Scan

Run comprehensive checks across 5 dimensions. Read the actual source files (HTML, CSS, JS/TS, component files) that were created or modified during implementation. Score each dimension 0-4 using the criteria below.

## Dimension 1: Accessibility (A11y)

**Check for:**
- **Contrast issues**: Text contrast ratios < 4.5:1 for normal text, < 3:1 for large text (WCAG AA). Check both light and dark modes if applicable.
- **Missing ARIA**: Interactive elements without proper roles, labels, or states. Custom components without ARIA equivalents.
- **Keyboard navigation**: Missing focus indicators, illogical tab order, keyboard traps, non-focusable interactive elements. Check that all functionality is keyboard-accessible.
- **Semantic HTML**: Improper heading hierarchy (skipped levels), missing landmarks (`<main>`, `<nav>`, `<header>`), `<div>` or `<span>` used instead of `<button>`, `<a>`, or semantic elements.
- **Alt text**: Missing or poor image descriptions. Decorative images without `alt=""`. Informative images without descriptive alt text.
- **Form issues**: Inputs without associated `<label>`, poor error messaging, missing required indicators, no autocomplete attributes where appropriate.
- **Motion**: Animations without `prefers-reduced-motion` media query checks.

**Score 0-4:**
- 0 = Inaccessible (fails WCAG A — critical barriers to access)
- 1 = Major gaps (few ARIA labels, no keyboard navigation, missing landmarks)
- 2 = Partial (some a11y effort, significant gaps remain)
- 3 = Good (WCAG AA mostly met, minor gaps)
- 4 = Excellent (WCAG AA fully met, approaches AAA)

## Dimension 2: Performance

**Check for:**
- **Layout thrashing**: Reading and writing layout properties (offsetWidth, getBoundingClientRect) in loops or rapid succession.
- **Expensive animations**: Animating layout properties (width, height, top, left, padding, margin) instead of transform and opacity. Missing `will-change` on animated elements.
- **Missing optimization**: Images without lazy loading (`loading="lazy"`), unoptimized assets (large PNGs where WebP/AVIF would work), missing `srcset` for responsive images.
- **Bundle size**: Unnecessary imports, unused dependencies, large libraries imported for small features. Tree-shaking opportunities missed.
- **Render performance**: Unnecessary re-renders in React/Vue/Svelte components, missing memoization, computed values recalculated on every render.
- **Font loading**: Missing `font-display` strategy, render-blocking font requests, too many font weights/variants loaded.

**Score 0-4:**
- 0 = Severe issues (layout thrash, unoptimized everything, render-blocking resources)
- 1 = Major problems (no lazy loading, expensive animations, large unused imports)
- 2 = Partial (some optimization, significant gaps remain)
- 3 = Good (mostly optimized, minor improvements possible)
- 4 = Excellent (fast, lean, well-optimized)

## Dimension 3: Theming

**Check for:**
- **Hard-coded colors**: Color values not using design tokens or CSS custom properties. Inline styles with literal color values.
- **Broken dark mode**: Missing dark mode variants for all colors, poor contrast in dark theme, elements that don't update on theme switch.
- **Inconsistent tokens**: Using wrong semantic tokens (e.g., using `--color-primary` for a warning), mixing token levels (primitive tokens in components instead of semantic tokens).
- **Theme switching issues**: Values that don't update on theme change. Hard-coded light/dark values instead of using `light-dark()` or `prefers-color-scheme`.
- **Missing token coverage**: Spacing, shadows, border-radius, z-index, or font-size values that should be tokenized but aren't.

**Score 0-4:**
- 0 = No theming (hard-coded everything, no design tokens)
- 1 = Minimal tokens (mostly hard-coded, tokens exist but rarely used)
- 2 = Partial (tokens exist but inconsistently used, dark mode has gaps)
- 3 = Good (tokens consistently used, minor hard-coded values, dark mode works)
- 4 = Excellent (full token system, dark mode works perfectly, all values semantic)

## Dimension 4: Responsive Design

**Check for:**
- **Fixed widths**: Hard-coded pixel widths that break on mobile. Fixed layout assumptions.
- **Touch targets**: Interactive elements smaller than 44x44px on mobile (WCAG 2.5.5).
- **Horizontal scroll**: Content overflow on narrow viewports (320px minimum). Tables, code blocks, or images that break the layout.
- **Text scaling**: Layouts that break when browser text size is increased to 200%. Fixed heights on text containers.
- **Missing breakpoints**: No mobile or tablet variants. Desktop-only layouts.
- **Container queries**: Components that should adapt to their container width but use viewport breakpoints instead.
- **Fluid values**: Missing `clamp()` or fluid sizing where appropriate. Abrupt jumps between breakpoints instead of smooth scaling.

**Score 0-4:**
- 0 = Desktop-only (completely breaks on mobile)
- 1 = Major issues (some breakpoints, many failures on narrow viewports)
- 2 = Partial (works on mobile with rough edges, touch target issues)
- 3 = Good (responsive across viewports, minor touch target or overflow issues)
- 4 = Excellent (fluid, all viewports handled, proper touch targets, container queries where appropriate)

## Dimension 5: Anti-Patterns (CRITICAL)

Check against ALL the DON'T guidelines from the design guidelines. Look for AI slop tells and general design anti-patterns:

**AI slop tells:**
- AI color palette: cyan-on-dark, purple-to-blue gradients, neon accents on dark backgrounds
- Gradient text: `background-clip: text` combined with gradient background
- Glassmorphism: decorative blur effects, glass cards, glow borders
- Hero metric layouts: big number, small label, supporting stats, gradient accent
- Identical card grids: same-sized cards with icon + heading + text, repeated endlessly
- Generic fonts: Inter, Roboto, Arial, Open Sans, or system defaults used without intention
- Side-stripe borders: `border-left` or `border-right` > 1px as colored accent on cards/alerts
- Bounce/elastic easing: dated animation curves
- Dark mode with glowing accents as default

**General anti-patterns:**
- Gray text on colored backgrounds
- Nested cards (cards inside cards)
- Pure black (#000) or pure white (#fff)
- Everything centered with no asymmetry
- Same spacing everywhere with no rhythm
- Every button styled as primary
- Modals used where alternatives exist
- Redundant copy that restates headings

**Score 0-4:**
- 0 = AI slop gallery (5+ tells present)
- 1 = Heavy AI aesthetic (3-4 tells)
- 2 = Some tells (1-2 noticeable)
- 3 = Mostly clean (subtle issues only)
- 4 = No AI tells (distinctive, intentional design)

# Step 3 — Generate Report

### Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | ? | [most critical a11y issue or "--"] |
| 2 | Performance | ? | |
| 3 | Responsive Design | ? | |
| 4 | Theming | ? | |
| 5 | Anti-Patterns | ? | |
| **Total** | | **??/20** | **[Rating band]** |

**Rating bands:**
- 18-20 Excellent (minor polish needed)
- 14-17 Good (address weak dimensions)
- 10-13 Acceptable (significant work needed)
- 6-9 Poor (major overhaul required)
- 0-5 Critical (fundamental issues)

### Anti-Patterns Verdict

**Start here.** Pass/fail: Does this look AI-generated? List specific tells found in the code. Be brutally honest. Cite file paths and line numbers.

### Executive Summary
- Audit Health Score: **??/20** ([rating band])
- Total issues found (count by severity: P0/P1/P2/P3)
- Top 3-5 critical issues
- Recommended next steps

### Detailed Findings by Severity

Tag every issue with **P0-P3 severity:**
- **P0 Blocking**: Prevents task completion — fix immediately
- **P1 Major**: Significant difficulty or WCAG AA violation — fix before release
- **P2 Minor**: Annoyance, workaround exists — fix in next pass
- **P3 Polish**: Nice-to-fix, no real user impact — fix if time permits

For each issue, document:
- **[P?] Issue name**
- **Location**: Component, file, line
- **Category**: Accessibility / Performance / Theming / Responsive / Anti-Pattern
- **Impact**: How it affects users
- **WCAG/Standard**: Which standard it violates (if applicable)
- **Recommendation**: How to fix it
- **Suggested skill**: Which `/design-*` skill to use (from: `/design-polish`, `/design-typeset`, `/design-colorize`, `/design-quieter`, `/design-overdrive`, `/design-clarify`, `/design-bolder`, `/design-distill`, `/design-harden`, `/design-layout`, `/design-animate`, `/design-optimize`, `/design-adapt`, `/design-delight`)

### Patterns & Systemic Issues

Identify recurring problems that indicate systemic gaps rather than one-off mistakes:
- "Hard-coded colors appear in 15+ components — should use design tokens"
- "Touch targets consistently too small (<44px) throughout mobile experience"
- "No `prefers-reduced-motion` checks on any animations"

### Positive Findings

Note what's working well — good practices to maintain and replicate. Be specific.

### Recommended Actions

List recommended `/design-*` skills in priority order (P0 first, then P1, then P2):

1. **[P?] `/design-<skill-name>`** — Brief description (specific context from audit findings)
2. **[P?] `/design-<skill-name>`** — Brief description (specific context)
...

**Rules:**
- Only recommend `/design-*` skills: `/design-polish`, `/design-typeset`, `/design-colorize`, `/design-quieter`, `/design-overdrive`, `/design-clarify`, `/design-bolder`, `/design-distill`, `/design-harden`, `/design-layout`, `/design-animate`, `/design-optimize`, `/design-adapt`, `/design-delight`
- Map findings to the most appropriate skill
- End with `/design-polish` as the final step if any fixes were recommended

After presenting the summary, tell the user:

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/wf-design:audit` after fixes to see your score improve.
>
> When technical quality is satisfactory, continue with `/wf-review <slug>` for code review.

**IMPORTANT**: Be thorough but actionable. Too many P3 issues creates noise. Focus on what actually matters.

**NEVER:**
- Report issues without explaining impact (why does this matter?)
- Provide generic recommendations (be specific and actionable)
- Skip positive findings (celebrate what works)
- Forget to prioritize (everything can't be P0)
- Report false positives without verification

# Step 4 — Write Artifact

Write `06c-audit.md` to `.ai/workflows/<slug>/06c-audit.md`.

**Timestamps must be real:** Run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time.

```yaml
---
schema: sdlc/v1
type: design-audit
slug: <slug>
status: complete
stage-number: 6.6
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
audit-health-score: <N>/20
audit-rating-band: <excellent|good|acceptable|poor|critical>
dimension-accessibility: <0-4>
dimension-performance: <0-4>
dimension-responsive: <0-4>
dimension-theming: <0-4>
dimension-anti-patterns: <0-4>
design-context: .impeccable.md
metric-p0-count: <N>
metric-p1-count: <N>
metric-p2-count: <N>
metric-p3-count: <N>
metric-total-issues: <N>
tags: []
refs:
  index: 00-index.md
  shape: 02-shape.md
  design: 02b-design.md
  implement-index: 05-implement.md
  critique: 06b-critique.md
next-command: wf-review
next-invocation: "/wf-review <slug>"
---
```

Include the full audit report body (all sections from Step 3).

# Step 5 — Update 00-index.md

Update `00-index.md`:
- Add `06c-audit.md` to `workflow-files`.
- Update `updated-at` with the real timestamp.
- Update `recommended-next-command` and `recommended-next-invocation` based on audit results.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Use AskUserQuestion** for multiple-choice PO questions (structured decisions, confirmations). Use freeform chat for open-ended questions. Append every answer to `po-answers.md` with timestamp and stage.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `score: <N>/20` (Audit Health Score)
- `dimensions: A11y=<N> Perf=<N> Resp=<N> Theme=<N> Anti=<N>`
- `issues: <P0>/<P1>/<P2>/<P3>` (count by severity)
- `options:` recommended `/design-*` skills to run
- <=3 short blocker bullets if needed
