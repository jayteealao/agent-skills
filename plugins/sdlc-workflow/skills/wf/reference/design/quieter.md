> **Additional context needed**: current problem areas that feel noisy or overwhelming.

Reduce intensity without losing personality. Quiet design needs more precision than bold design. Do not make the result generic.

---

## Design mode

Persuade and Experience: more restraint and more air. The palette calms and the type breathes. Drama is reduced, not removed. The point of view stays.

Operate and Read: less noise. Fewer background accents, flatter cards, less color, less motion. The tool disappears into the task, and the data dominates.

---

## Diagnose the noise

Identify the sources before prescribing changes:

**Visual noise**: too many competing elements, too many colors, too much decoration.
**Typographic noise**: too many font sizes, too many weights, inconsistent hierarchy.
**Color noise**: too many colors in use, too many accent colors, insufficient neutral foundation.
**Contrast noise**: too many hard contrasts side by side.
**Scale noise**: every element is large, so nothing leads.
**Motion noise**: too many animations, gratuitous transitions, background movement.
**Copy noise**: too much explanatory text, redundant labels, unnecessary descriptions.

Then answer the context questions:
- What is the purpose of the surface?
- Who is the audience? Some contexts need energy.
- What works now? Keep the good ideas.
- What is the core message? Protect it.

When the purpose, the audience or the core message is not clear from the code and the design record, ask per [_question-craft.md](../_question-craft.md). Do not guess.

Generic quiet is gray text on white, one sans at one weight, and a grid of identical cards. That result fails. Restraint keeps a point of view.

## Reduce Visual Complexity

**Remove elements first, then reduce intensity**:
- Remove decorative borders and dividers that do not encode information
- Remove background fills where whitespace is a better separator
- Remove icons where labels alone are sufficient
- Remove drop shadows and elevation effects where structure alone creates hierarchy

**Then reduce what remains**:
- Reduce border widths (2px → 1px)
- Reduce shadow distances and blur radii
- Replace colored backgrounds with tinted neutrals
- Reduce extreme corner radii
- Flatten stacked layers
- Remove glows and stacked shadows

## Simplify the Color System

Most noise problems are color problems. Prescribe:
- Identify the accent color(s). If there are 3+, reduce to 1–2.
- Set a strict semantic vocabulary: accent = primary action and current selection only.
- Move secondary information to neutral shades, not secondary accent colors.
- Keep the chosen color strategy. On a Restrained surface, keep 80% or more neutral. On a Committed, Full palette or Drenched surface, lower the chroma instead.
- Reduce a loud color's chroma to 70–85% of its value.

Never remove semantic color (error states, success states) in the name of quietness — those are functional, not decorative.

## Settle the Typography

**The quieter typography rule**: same font, fewer sizes, fewer weights.
- Reduce the number of font sizes in active use to 3–4: display/heading, subheading, body, small.
- Reduce font weight variety: 2 weights maximum for most surfaces (regular + medium/semibold).
- Step heavy weights down: 900 to 600, 700 to 500.
- Increase line height and letter-spacing on the reduced scale to restore readability.

If the design currently uses multiple typefaces: consider whether the secondary face is earning its place.

## Quiet the Motion

Reduce the motion. Do not remove all of it.
- Shorten travel to 10–20 px.
- Use a strong ease-out curve token from [animate.md](animate.md).
- Never bounce.
- Remove each motion with no named purpose ([animate.md](animate.md) → Gate 2).
- Keep transitions on state changes the person starts: expand, collapse, navigate.

## Composition

- Reduce the jumps between sizes. Smaller steps read calmer.
- Align stray elements to the grid.
- Even out the spacing rhythm. Replace extreme gaps with a consistent scale.

## Quiet the Copy

- Remove explanatory text that users after the first visit will not read
- Remove redundant labels (a chart titled "User Count" with a Y-axis label "Users" needs one, not both)
- Replace verbose button labels with shorter ones ("Submit your changes" → "Save")
- Move help text behind tooltips or expand-on-demand

## Validate

After quieting:
- Is the primary content or action easier to find?
- Is the essential information still present?
- Does it feel calm rather than just empty?
- Is the hierarchy stronger (not weaker) than before?
- Is it still distinctive? Does the point of view survive the cuts?
- Is long text easier to read?

Next: the `polish` move.

## Never

- Removing functional information in the name of cleanliness
- Making everything the same weight (calm ≠ flat)
- Making everything small and light (a surface needs anchors)
- Removing all color (quiet is not grayscale)
- Using whitespace as the only structural device without typography or color to support hierarchy
- Quieting color without maintaining semantic distinctions (error, success, warning)

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> quieter` focuses the design stage and its contract `02c-craft.md` on reducing noise.
- **Design confirmed:** `/wf design <slug> quieter` runs the noise diagnosis and the Validate list against the frozen boards and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/quieter-<timestamp>.md` per [_output.md](_output.md) with: each noise source found, what was removed, what was reduced, and what kept the point of view.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
