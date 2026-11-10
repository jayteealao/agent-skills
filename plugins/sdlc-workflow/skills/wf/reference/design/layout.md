Layout turns product priority into reading order, grouping, rhythm and usable space. Find the structural problem before you move boxes. Change the structure inside the current world: a new identity runs through [stage.md](stage.md) Step 3b.

A unit below is the layout unit of the platform: a CSS pixel on the web, a point on iOS, a density-independent pixel on Android. `wf.mjs design check` sends a failure of viewport fit, and overlapping text, to this file.

---

## Design mode

| Mode | Layout |
|---|---|
| Persuade and Experience | Asymmetric or disruptive composition is available when the world earns it. The grid is a tool, not a constraint. Empty space can be content. Overlap and broken columns are legitimate when they serve the voice. |
| Operate | Predictable structure and stable density. People move faster through an expected structure. A responsive change is structural, not a decorative rearrangement. |
| Read | A calm column at the measure of [_craft-floor.md](_craft-floor.md) rule 17. The frame carries the world. |

---

## Assess first

Look at representative states and viewports. Answer each question with rendered or source evidence.

| Question | Look for |
|---|---|
| Reading order | Shrink the screen to a thumbnail, or blur it. Can you still find the primary element, the secondary element and the major groups, in order? |
| Grouping | Are related items close and separate groups apart? Or do containers make up for weak proximity? |
| Rhythm | Do tight and wide intervals make a deliberate cadence? Or does one spacing value repeat until every part has equal weight? |
| Structure | Does the structure match the content and the task? Are repeated cards, columns or sections truly equal, or only a default? |
| Density | Does the information in each region fit the frequency of use and the decision load? |
| Focus order | At each viewport, does the keyboard order match the visual order? |
| Extremes | Do the `worst` state, the `empty` state, overlays, fixed elements and safe areas break the structure? |

## Set the spatial thesis

Before you draw, name:
- the primary reading or task path;
- what groups together and what separates;
- the element that leads and the elements that support it;
- the density and the spacing rhythm;
- how the structure changes across viewports, inputs and content extremes.

Choose the simplest structure that shows those relations. Record the thesis in the contract or the design note.

## The spatial system

- Use the spacing tokens of `DESIGN.md`. Extend them when a step is missing. Do not add a parallel set.
- With no spacing tokens, start from a 4-unit base (4, 8, 12, 16, 24, 32, 48, 64) and write the steps into `DESIGN.md`. This scale is a default, not a rule: a dense tool and an airy page want different steps.
- Spacing between related elements is smaller than spacing between unrelated elements. Proximity is meaning.
- Group by meaning. Use proximity before you add a container.
- Make rhythm from deliberate contrast between tight and wide intervals. Space without hierarchy is still flat.

## Hierarchy

- Give each view one primary element: one action or one message.
- Make three tiers (primary, secondary, tertiary) with size, weight, color and space together. Color alone is not a tier.
- Let the hierarchy follow product priority, not the defaults of a framework.
- Use depth only to show state or hierarchy ([_craft-floor.md](_craft-floor.md) rule 23).

## Grid

Take the grid from the content and the direction. The values below are starting points for a project with no layout tokens. Write the ones you use into `DESIGN.md`.

| Mode | Starting point |
|---|---|
| Operate | A column grid that collapses at narrow widths. A sidebar of one fixed width, chosen from its longest label. A content area with a maximum width, centered. A data-heavy surface may use the full width when the table needs it. |
| Persuade and Experience | A named column grid with deliberate uneven splits. A column bleed, or an element that crosses grid lines, is a design choice. A blank column can be as deliberate as a column of copy. |
| Read | One reading column at the floor measure. Navigation, notes and the table of contents sit in the frame. |

## Alignment

- Anchor the most important information at the start of the scan path, in the reading direction of the locale.
- Align most content to the start edge.
- Center a hero line, a dialog or an isolated one-sentence message.
- Align numbers in table columns, money and narrow timestamps to the end edge.
- To compare items, use a table, not stacked key-value pairs.
- Do not mix alignment axes in adjacent components without a reason.
- Concentric radius and optical alignment are in [polish.md](polish.md).

## Responsive behavior

Make each responsive change structural. Reorder, collapse, reflow or reveal by importance. Prefer components that respond to their container. Start from the narrow layout, and add structure for wider sizes. Check each viewport of `screens.json`, a zoomed state and a translated state. [adapt.md](adapt.md) covers a change of platform or input.

## Fix a check failure

| The check says | Do |
|---|---|
| `viewport-fit`: an element ends past the viewport | Find why the element cannot shrink: a fixed width, an unbreakable string, a row that does not wrap. Let it wrap, shrink or scroll inside its own box. Do not hide the overflow of the page. |
| `overlap`: two texts cross | Remove the absolute position, the negative margin or the fixed height that lets them meet. Let the container grow with its content. |

## Verify

Answer each item with rendered or source evidence. A bare "yes" is not evidence.
- The thumbnail still shows the primary element, the secondary element and the major groups, in order.
- The reading or task path is clear at every viewport.
- Related content groups; unrelated content stays apart.
- The density matches the frequency of use.
- The `worst` state, translation and zoom do not break the structure.
- The keyboard, touch and screen-reader order matches the visual order.

## Never

- A fixed width on a container that must follow the window. A sidebar may hold one fixed width.
- A layout change that moves elements and leaves the structural problem.
- A grid taken from a framework default with no reason from the content.

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says when each use runs. A note follows [_output.md](_output.md).

### At the design stage

The move changes the structure of the screens: the grid, the grouping, the order, the density, and how each viewport restructures. It writes the spacing and layout tokens into `DESIGN.md`. The contract records the spatial thesis and each structural change.

### As a pass on an approved design

The pass changes nothing. Answer the Assess table and the Verify list for each screen. Write each fault as a finding with its screen key, its viewport and the evidence.

### In implement

- Build the layout from the spacing tokens. A one-off value is a fault.
- Lay out by start and end edges ([harden.md](harden.md) → Language and locale).
- Keep the source order equal to the visual order, so that the keyboard and the screen reader follow it.
- Build each responsive change as a structural change at the width where the content breaks, not at a device width.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
