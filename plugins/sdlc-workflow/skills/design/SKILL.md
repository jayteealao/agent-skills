---
name: design
description: Use when the user wants to design, shape, craft, critique, audit, animate, colorize, typeset, clarify, distill, harden, optimize, adapt, polish, or otherwise improve a frontend interface in an SDLC workflow context. Covers websites, landing pages, dashboards, product UI, components, forms, onboarding, and empty states. Handles UX review, visual hierarchy, accessibility, responsive behavior, typography, color, motion, and design systems. Dispatches to 22 sub-commands: shape (design brief), craft (design-to-code), audit, critique, extract, animate, bolder, clarify, colorize, delight, distill, harden, layout, onboard, optimize, overdrive, polish, quieter, typeset, adapt, setup, teach. Use imagegen skill for image generation within probes.
version: 1.0.0
user-invocable: false
argument-hint: "[shape|craft|audit|critique|extract|animate|bolder|clarify|colorize|delight|distill|harden|layout|onboard|optimize|overdrive|polish|quieter|typeset|adapt|setup|teach] [target]"
---

Designs and iterates production-grade frontend interfaces. Real working code, committed design choices, exceptional craft.

## Setup (non-optional)

Before any design work or file edits, pass these gates. Skipping them produces generic output that ignores the project.

| Gate | Required check | If fail |
|---|---|---|
| Stage gate | When invoked from a workflow context, the workflow's `current-stage` permits this sub-command. | The `wf-design` command enforces this — it will block before this skill loads. See the command's category table. |
| Context | PRODUCT.md exists and is valid (≥200 chars, no `[TODO]` markers). | Run `/wf-design setup`, then resume. |
| Register | `brand` or `product` is determined for this task. | Read PRODUCT.md `## Register` section; infer from task cue if missing. |
| Codebase | Codebase inspection sub-agents have run. | Run the 4 parallel inspection sub-agents (see below). |
| Shape | For `craft` sub-command only: design brief explicitly confirmed by user. | Run `/wf-design shape`, confirm brief, then proceed. |
| Image gate | Required visual probes are generated, or skipped with a recorded reason. | Resolve in `shape` or `craft` reference before proceeding to code. |
| Mutation | All gates above pass; mutation type matches sub-command (code / artifact / context / read-only). | Do not edit project files until mutation is open. |

**Skipped for**: `audit`, `critique`, `extract`, `setup`, `teach` — these commands are read-only or context-authoring, so the codebase gate is relaxed.

**Mutation types**:
- **Code**: transformation sub-commands + freestanding `craft`. Requires image_gate resolved.
- **Artifact**: workflow-context `craft` (writes `02c-craft.md`), `audit`, `critique`. No code touched.
- **Context**: `setup`, `teach`. PRODUCT.md / DESIGN.md only.
- **Read-only**: `extract`. Produces a report; no project files modified.

### Context gathering

Two files, case-insensitive. Search project root first, then `.agents/context/`, then `docs/`.

- **PRODUCT.md** — required. Users, brand, tone, anti-references, strategic principles, register.
- **DESIGN.md** — optional, strongly recommended. Colors, typography, elevation, components, tokens.

If PRODUCT.md is missing, empty, or has `[TODO]` markers: run `/wf-design setup` and resume after context is established.

If DESIGN.md is missing: nudge once per session ("Run `/wf-design setup` or `/wf-design teach` for better on-brand output"), then proceed.

### Register detection

Every design task is **brand** (marketing, landing, campaign, portfolio — design IS the product) or **product** (app UI, admin, dashboard, tool — design SERVES the product).

Determine before designing. Priority:
1. Task cue ("landing page" → brand, "dashboard" → product)
2. Surface in focus (the file, page, or route being worked on)
3. `## Register` field in PRODUCT.md

First match wins. If PRODUCT.md lacks the field, infer from its Users and Product Purpose sections. Suggest the user run `/wf-design teach` to add it explicitly.

Load the matching reference file: `reference/brand.md` or `reference/product.md`.

### Codebase inspection sub-agents

Run these 4 sub-agents in parallel before any design command that edits files:

**Agent 1: Token scanner**
Search for design tokens: CSS custom properties (`--color-*`, `--spacing-*`, `--font-*`, `--radius-*`), Tailwind config `theme.extend`, `tokens.json`, Style Dictionary source files. Return extracted token table.

**Agent 2: Framework + component detector**
Identify: UI framework (React/Vue/Svelte/Angular from package.json), component library (shadcn/ui, Radix, Headless UI, MUI, Mantine, Ant Design, Chakra), CSS approach (Tailwind, CSS modules, styled-components, plain CSS), Tailwind version, sample component path.

**Agent 3: Context loader**
Read PRODUCT.md and DESIGN.md (project root → `.agents/context/` → `docs/`). Extract: register, brand-personality, users, aesthetic-direction, design-principles.

**Agent 4: Surface ranger**
Find the specific files relevant to the current task: active page/component files from task description, related CSS files, primary component. If working in workflow context, read `02-shape.md` for `files-in-scope`.

If sub-agent output is already in session history, don't re-run.

## Shared design laws

Apply to every design, both registers. Never converge on the same choices across projects. Vary. Claude is capable of extraordinary work — don't hold back.

### Color
- Use OKLCH. Reduce chroma as lightness approaches 0 or 100.
- Never `#000` or `#fff`. Tint every neutral toward the brand hue (chroma 0.005–0.01).
- Choose a color strategy: Restrained / Committed / Full palette / Drenched. Brand defaults to Committed or higher. Product defaults to Restrained.

### Typography
- Establish hierarchy through size AND weight contrast — not just one.
- Minimum 16px body text. Line height ≥ 1.5 for prose.
- Max 65–75ch line length for prose content.
- Scale ratio: ≥1.25 for brand, 1.125–1.2 for product.

### Spacing
- Use a consistent spatial system with a 4px or 8px base unit.
- Proximity is meaning: related elements get tighter spacing.
- Whitespace as emphasis: contrast between dense and spacious creates hierarchy.

### Components
- Every interactive element: default, hover, focus, active, disabled states.
- Loading: skeletons not spinners for content areas.
- Empty states teach and guide; they are not error states.

### Accessibility
- `@media (prefers-reduced-motion: reduce)` for all animations — design for motion first.
- Focus rings visible, meeting 3:1 contrast ratio against adjacent background.
- Color is never the only indicator for any state.

## Absolute bans (both registers)

- `border-left` or `border-right` > 1px as a decorative colored accent stripe — use full hairline border, background tint, or leading glyph instead
- Purple-blue generic gradients
- Generic hero metric cards ("10x faster", "500+ customers") without real product proof
- Nested card-inside-card layouts
- Bounce or elastic easing in production UI
- Pure `#000` or `#fff` for text or large areas
- Fraunces or Cormorant as the primary display face on a new brand surface

## Sub-command reference table

When a sub-command is matched, load the corresponding reference file and follow it exactly.

| Sub-command | Reference file | Purpose |
|---|---|---|
| `shape` | `reference/shape.md` | Design brief with discovery interview + imagegen probes |
| `craft` | `reference/craft.md` | Design-to-code with build gate and visual direction |
| `audit` | `reference/audit.md` | Technical quality scan (a11y, performance, theming, responsive, anti-patterns) |
| `critique` | `reference/critique.md` | Prescriptive design feedback |
| `extract` | `reference/extract.md` | Reverse-engineer design tokens from existing code |
| `animate` | `reference/animate.md` | Add purposeful motion and micro-interactions |
| `bolder` | `reference/bolder.md` | Increase visual presence and hierarchy |
| `clarify` | `reference/clarify.md` | Reduce cognitive load and improve scannability |
| `colorize` | `reference/colorize.md` | Introduce strategic color |
| `delight` | `reference/delight.md` | Add moments of joy and personality |
| `distill` | `reference/distill.md` | Remove complexity to the essential core |
| `harden` | `reference/harden.md` | Accessibility and robustness improvements |
| `layout` | `reference/layout.md` | Spatial structure, grid, and alignment |
| `onboard` | `reference/onboard.md` | Empty states and first-run experience |
| `optimize` | `reference/optimize.md` | Performance improvements |
| `overdrive` | `reference/overdrive.md` | Technically extraordinary visual effects |
| `polish` | `reference/polish.md` | Finishing details and state completeness |
| `quieter` | `reference/quieter.md` | Reduce noise and visual complexity |
| `typeset` | `reference/typeset.md` | Typography quality and hierarchy |
| `adapt` | `reference/adapt.md` | Context adaptation (responsive, platform, theme) |
| `setup` | `reference/setup.md` | Create PRODUCT.md and DESIGN.md |
| `teach` | `reference/teach.md` | Update or improve existing context files |

## Commands

Invoked by `wf-design` command. Grouped by purpose:

**Planning**: shape · craft

**Analysis**: audit · critique · extract

**Aesthetics**: animate · bolder · colorize · delight · layout · overdrive · quieter · typeset

**Clarity**: adapt · clarify · distill

**Quality**: harden · onboard · optimize · polish

**Context**: setup · teach
