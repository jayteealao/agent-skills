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

**The removal gate.** Put each animation on trial; "it is already there" and "it looks nice" are no defense. Record the deciding branch:
- A keyboard trigger (a shortcut, a command palette, a focus jump): delete.
- 100+ uses a day (core navigation, tab switches, list rows, route changes in the app): delete.
- Functional data (a chart, a table, a number): delete, unless the motion shows a real change of value on the person's action.
- No named purpose: delete, except for a rare first-time moment (onboarding, an empty state, a success).
- Tens of uses a day (hover, a frequent toggle): reduce.
- Over budget (over 300 ms, or a slide where a fade says the same): reduce.

**Reduce** means a smaller version of the same motion, never a new one: hover → a color or opacity change, 150 ms or less; a frequent entrance → opacity only, 150 ms; a stagger over 80 ms an item or 300 ms in total → 30 ms an item, or one fade of the group; an infinite loop → run it once, or keep its end state. When the reduced motion no longer carries its purpose, delete it.

**Where to look:** motion on keyboard and high-frequency surfaces; reveals on every scrolled section; hover lift on cards that are not the main action; infinite pulses, glows and spins that are not progress; charts that redraw and numbers that count up on each load; a spinner or a shimmer on work under 300 ms; a transition on every property.

**Before you delete, check what depends on the motion:**
- A start state that hides the element (opacity 0 until the animation runs). Delete it with the animation, or the element stays invisible.
- Code that waits for the end of the animation, an exit that delays the removal of a view, and focus that moves after the motion. Move each to the moment of the change.
- A layout animation that hides a jump. When the jump shows, keep the animation and record the jump as a finding.
- Tests that wait for the motion.

After the removals, delete what they left unused: keyframes, wrappers, variants and imports. Propose the removal of a motion library; never remove it in the pass. The note lists each removal with its branch, and 2–5 animations that you kept, each with the purpose that saved it.

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

This file is a move. [_lane.md](_lane.md) → Moves says how each stage uses it.
Focus: reducing noise. Checks: the noise diagnosis and the Validate list. Notes record: each noise source found, what was removed, what was reduced, and what kept the point of view.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*

> *The removal gate, the reduce rules and the removal hazards are adapted from Emil Kowalski's skill `remove-animations` ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `a81dbca`, 2026-10-28). MIT license.*
