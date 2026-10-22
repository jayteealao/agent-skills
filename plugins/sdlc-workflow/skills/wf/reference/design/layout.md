> **Additional context needed**: primary content type, target devices.

Layout turns product priority into reading order, grouping, rhythm and usable space. Find the structural problem before you move boxes. Change the structure inside the current world. A new identity runs through [stage.md](stage.md) Step 3b.

A unit below is the platform's layout unit: a CSS pixel on the web, a point on iOS, a density-independent pixel on Android.

---

## Design mode

Persuade and Experience: asymmetric or disruptive composition is available when the world earns it. The grid is a tool, not a constraint. Empty space can be content. Overlap and broken columns are legitimate when they serve the voice.

Operate: predictable structure and stable density. Consistency is an affordance: people move faster through an expected structure. A responsive change is structural, never a decorative rearrangement.

Read: a calm column at a real measure. The frame carries the world.

---

## Assess first

Look at representative states and sizes. Answer each question with rendered or source evidence:
- **Reading order.** Apply the squint test: blur the detail. Can you still find the primary element, the secondary element and the major groups, in order?
- **Grouping.** Are related items close and separate groups apart? Or do containers make up for weak proximity?
- **Rhythm.** Do tight and wide intervals make a deliberate cadence? Or does one spacing value repeat until every part has equal weight?
- **Structure.** Does the structure match the content and the task? Are repeated cards, columns or sections truly equal, or only a framework default?
- **Density.** Does the information in each region fit the frequency of use, the decision load and the design mode?
- **Focus order.** At each size, does the keyboard and focus order match the visual order?
- **Extremes.** Do long content, empty states, overlays, fixed elements and safe areas break the structure?

## Set the spatial thesis

Before you edit, name:
- the primary reading or task path;
- what groups together and what separates;
- the element that leads and the elements that support it;
- the density and the spacing rhythm;
- how the structure changes across sizes, inputs and content extremes.

Choose the simplest structure that shows those relations. Record the thesis in the design note.

## Spatial system first

Establish the spatial system before you solve a layout problem. Most layout problems come from spacing values that do not relate to each other.

**Base unit.** Use a 4-unit base. Extend the project's spacing tokens. Never add a parallel set.

Web:
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

Spacing between related elements is smaller than spacing between unrelated elements. Proximity is meaning.

## Hierarchy and reading order

- Give each view one primary element: one action or one message.
- Make three tiers (primary, secondary, tertiary) with size, weight, color and space together. Color alone is not a tier.
- Increase the contrast between adjacent tiers in size and weight, not only in color.
- Run the squint test after each change. The primary element still leads.

## Apply

- Group by meaning. Use proximity before you add a container or decoration.
- Make rhythm from deliberate contrast between tight and wide intervals.
- Let the hierarchy follow product priority, not framework defaults.
- Use depth only to show state or hierarchy.
- Let repetition support recognition. Break it only when the content or the priority changes.
- Keep a touch target usable when its visible mark is small ([harden.md](harden.md) §7).
- Make an optical correction only after you inspect the rendered result.

## Grid

### Operate
- A 12-column grid with 16-unit gutters that collapses at narrow sizes.
- Fixed sidebar widths (240, 280 or 320 units), not a percentage.
- A content area of 1,200–1,400 units at most, centered, with 24–48 units of side padding.
- A data-heavy surface may use the full width when the table needs it.

### Persuade and Experience
- A named column grid with deliberate splits (9/3, 8/4, 7/5).
- A column bleed or an element that crosses grid lines is a design choice.
- Empty space is content. A blank column can be as deliberate as a column of copy.

### Read
- One reading column at the measure of [_craft-floor.md](_craft-floor.md). Navigation, notes and the table of contents sit in the frame.

## Content width

- **Body prose:** limit a prose column to the measure of [_craft-floor.md](_craft-floor.md).
- **Data tables:** may run past 120 characters when the content needs it.
- **UI labels:** no maximum width; follow the component size.

## Alignment

People scan before they read. Design for the scan path:
- Anchor the most important information at the start of the scan path, in the locale's reading direction.
- Use consistent visual patterns, so that a person recognizes a repeated element type at once.
- To compare items, use a table, not stacked key-value pairs.
- Align text to a baseline grid: line heights in multiples of the spacing base.
- Align most content to the start edge. A consistent start edge helps scanning.
- Center a hero line, a dialog or an isolated one-sentence message.
- Align numbers in table columns, money and narrow timestamps to the end edge.
- Do not mix alignment axes in adjacent components without a reason.

## Nested radius and optical alignment

Two spatial details look wrong when they are wrong:
- **Concentric radius.** When one rounded surface sits inside another, the outer radius equals the inner radius plus the padding between them. Equal radii on a padded parent and child is the most common cause of a layout that feels off. Past about 24 units of padding, treat them as separate surfaces and choose each radius alone.
- **Optical over geometric alignment.** When a centered element looks off, trust the eye. An icon beside a label needs about 2 units less padding on the icon side. A play triangle moves about 2 units right of its geometric center. Fix a lopsided glyph (a caret, a star) in the icon itself. See [polish.md](polish.md) for both.

## Responsive behavior

Make each responsive change structural. Reorder, collapse, reflow or reveal by importance. Prefer components that respond to their container. Check the narrow, middle, wide, zoomed and translated states.

## Common layout problems and fixes

**Too much space everywhere.** Find the relations between elements. Give related items tighter spacing. Apply proximity.

**Too little space everywhere.** Increase the spacing between sections, not between elements. The cause is usually too little vertical space between major blocks.

**Elements do not align.** Establish one grid and one spatial system, and use them everywhere. Alignment by eye makes visual noise even when it looks close.

**Content too wide.** Limit prose to the floor measure. Give most layouts a container maximum width.

**Broken on a phone.** Fix the collapse structure. Start from the narrow layout and add structure for wider sizes.

## Verify

Answer each item with rendered or source evidence. A bare "yes" is not evidence.
- The squint test still shows the primary element, the secondary element and the major groups, in order.
- The reading or task path is clear at every supported size.
- Related content groups; unrelated content stays apart.
- The density matches the frequency of use and the complexity of the content.
- Long text, empty states, translation, zoom and dynamic content do not break the structure.
- The keyboard, touch and screen-reader order matches the visual order.

## Never

- Fixed widths on containers that respond to the window.
- A layout change that moves elements and leaves the grid problem.
- Space without hierarchy. Spacious and flat is still flat.

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> layout` focuses the design stage and its contract `02c-craft.md` on spatial structure.
- **Design confirmed:** `/wf design <slug> layout` runs the assessment and the Verify list against the frozen boards and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/layout-<timestamp>.md` per [_output.md](_output.md) with: the spatial thesis, the assessment answers and their evidence, and each structural change.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
