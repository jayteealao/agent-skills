# Product register

When design SERVES the product: app UIs, admin dashboards, settings panels, data tables, tools, authenticated surfaces, anything where the user is in a task.

## The product slop test

Not "would someone say AI made this" — familiarity is often a feature here. The test is: would a user fluent in the category's best tools (Linear, Figma, Notion, Raycast, Stripe) sit down and trust this interface, or pause at every subtly-off component?

Product UI's failure mode is strangeness without purpose: over-decorated buttons, mismatched form controls, gratuitous motion, display fonts where labels should be, invented affordances for standard tasks. The bar is earned familiarity — the tool should disappear into the task.

## Typography

- System fonts are legitimate. `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui` gives native feel. Inter is the common cross-platform default for a reason.
- One family is often right. Product UIs don't need display/body pairing. A well-tuned sans carries headings, buttons, labels, body, data.
- Fixed rem scale, not fluid. Clamp-sized headings don't serve product UI. Users view at consistent DPI; a fluid h1 that shrinks in a sidebar looks worse.
- Tighter scale ratio: 1.125–1.2 between steps. Product has more type elements; exaggerated contrast creates noise.
- Line length still applies for prose (65–75ch). Data and compact UI can run denser.

## Color

Product defaults to **Restrained**: tinted neutrals + one accent ≤10%. A single surface can earn Committed — a dashboard where one category color carries a report — but Restrained is the floor.

State-rich semantic vocabulary required: hover, focus, active, disabled, selected, loading, error, warning, success, info. Standardize these across every screen. Same color meanings everywhere.

Accent color reserved for primary actions, current selection, and state indicators only — not decoration.

## Layout

Predictable grids. Consistency IS an affordance — users navigate faster when the structure is expected. Familiar patterns (top bar, side nav, breadcrumbs, tabs) have established expectations. Don't reinvent for flavor.

Responsive behavior is structural: collapse sidebar, responsive table, breakpoint-driven columns. Not fluid typography.

## Components

Every interactive component has: default, hover, focus, active, disabled, loading, error. Don't ship with half these states.

- Skeleton states for loading, not spinners in the middle of content
- Empty states that teach the interface
- Consistent affordances across the surface: same button shape, same form-control vocabulary, same icon style

## Motion

150–250 ms on most transitions. Users are in flow — don't make them wait for choreography. Motion conveys state, not decoration: state change, feedback, loading, reveal — nothing else. No orchestrated page-load sequences.

## Product bans (on top of shared absolute bans)

- Decorative motion that doesn't convey state
- Inconsistent component vocabulary across screens (if the "save" button looks different in two places, one is wrong)
- Display fonts in UI labels, buttons, or data cells
- Reinventing standard affordances for flavor (custom scrollbars, weird form controls, non-standard modals)
- Heavy color or full-saturation accents on inactive states

## Product permissions (things brand surfaces can't do)

- System fonts and familiar sans defaults
- Standard navigation patterns without reinterpretation
- Tight density where data demands it
- Same visual solution across repeated surfaces (don't vary the table design across screens)

## Absolute bans (brand and product both)

- `border-left` or `border-right` > 1px as a decorative colored side stripe — use a full hairline border, a background tint, or a leading glyph instead
- Purple-blue generic gradients
- Pure black (`#000`) or pure white (`#fff`) for text or large surface areas
- Nested card-inside-card layouts
- Bounce or elastic easing in production UI
