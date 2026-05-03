> **Additional context needed**: primary content type, target devices.

Improve the spatial structure of a UI — grid, spacing, alignment, and compositional relationships.

---

## Register

Brand: asymmetric and editorial layouts are available. The grid is a tool, not a constraint. Intentional whitespace as content. Multi-column narrative layouts, overlapping elements, and unconventional composition are all legitimate when they serve the brand voice.

Product: predictable grids. Consistency IS an affordance. Users navigate faster when the structure is expected. Responsive behavior is structural (collapse sidebar, responsive table), not decorative rearrangement.

---

## Spatial system first

Before solving any specific layout problem, establish the spatial system. Most layout problems are symptoms of no system — arbitrary spacing values that don't relate to each other.

**Define a base unit**: 4px or 8px. All spacing should be multiples (4, 8, 12, 16, 24, 32, 48, 64, 96...).

**Define spacing tokens**:
```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
--space-8: 32px;
--space-12: 48px;
--space-16: 64px;
```

Spacing between related elements should be smaller than spacing between unrelated elements. Proximity is meaning.

## Grid

### Product UI
- 12-column grid, 16px gutters, responsive collapse
- Fixed sidebar widths (240px, 280px, 320px) — not percentage-based
- Content area max-width: 1200px–1400px centered, with 24–48px side padding
- Data-heavy surfaces: full width is fine at table-appropriate breakpoints (1200px+)

### Brand surfaces
- Named column grid with intentional variations (9/3, 8/4, 7/5 splits)
- Editorial: column bleeds and oversized elements crossing grid lines are design choices
- Negative space is content — a column of white can be as intentional as a column of copy

## Content width

**Body text**: 60–75 characters per line. Use `max-width: 65ch` on prose containers.
**Data tables**: can run 120ch+ when the content demands it.
**UI labels**: no max-width constraint; follow the component size.

## Alignment

- Align text to a baseline grid (using `line-height` multiples matching the spacing system)
- Left-align for most content (consistent starting edge aids scannability)
- Center-align for: hero text, modal dialogs, isolated single-sentence messages
- Right-align for: numeric columns in tables, currency values, timestamps in narrow contexts
- Never mix multiple alignment axes in adjacent components without intent

## Responsive behavior

**Product**: structural breakpoints at 640px (mobile), 1024px (tablet/narrow desktop).
- Mobile: stack all multi-column layouts, collapse sidebar to drawer or bottom nav
- Tablet: single-column content with fixed side panel, or two-column max

**Brand**: fluid approach — `clamp()` for type, CSS Grid with `auto-fit` / `minmax()` for columns.

## Common layout problems and fixes

**Too much whitespace everywhere**: identify the element relationships — related items need tighter spacing. Apply the proximity principle.

**Too little whitespace everywhere**: increase section-level spacing (between major content blocks), not element-level spacing. The problem is usually not enough vertical breathing room between sections.

**Elements not aligning**: establish a single grid / spatial system and enforce it. Eyeballed alignment creates visual noise even when it looks "close enough."

**Content too wide**: prose content needs `max-width: 65ch`. Most layouts need a container max-width.

**Broken on mobile**: fix the breakpoint collapse structure — start from the mobile layout and add complexity, not remove it.

## Absolute bans

- Fixed pixel widths on containers that need to respond to the viewport
- Mixing font-size and spacing systems (using `px` values that don't relate to each other)
- Nested card-inside-card layouts creating excessive depth
- Layout changes that only move elements without resolving the underlying grid problem
