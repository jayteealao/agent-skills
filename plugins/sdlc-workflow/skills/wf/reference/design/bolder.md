> **Additional context needed**: brand guidelines, current design direction.

Transform a design that is too timid, generic, or lacking presence into something with genuine visual strength and personality.

When a directions round is open, "bolder" asks for another round further along the axis. Run [stage.md](stage.md) Step 3b again, around the direction the person names. This move refines a part of a design that already exists.

---

## Design mode

Persuade and Experience: bolder means distinctive. Get it through hierarchy, pacing, proportion, copy, evidence and one committed idea. Push the aesthetic lane that the brief names.

Operate: bolder means stronger hierarchy, weight contrast, sharper density and decisive priority. Theatrics erode trust.

Read: bolder lives in the frame: the masthead, the rail and the section openers. The reading column stays calm.

---

## Scope

Bolder raises one named part to the conviction the rest already has. Touch only the named target. Leave its neighbors unchanged. Do not add a color, font, radius, shadow or primitive that the system does not own. When the system cannot express the direction, ask. Name the addition and its job.

## Diagnose the timidity

Compare the target with its neighbors. Find the strong moves the system makes elsewhere that this part skips. Then name the source:
- **Typographic: flat scale** — headings too close in size to body, no weight contrast
- **Color: excessive restraint** — everything in the same value range, no accent with conviction
- **Spatial: uniform density** — everything the same spacing, no emphasis through whitespace
- **Voice: hedging** — the design apologizes for itself (small type, pale colors, wide padding everywhere)
- **Compositional: no hierarchy** — all elements treated as equal importance

Keep every claim true. When the direction needs evidence that is missing, ask for it. Never invent it.

## Strengthen typography first

Typography is the single highest-leverage change for making a design bolder.

- Push the lead element to the top of the existing type scale. Add a step only after the person agrees.
- Add weight contrast with the weights the face already ships.
- Tighten display tracking to −0.02 to −0.03 em. Never go below −0.04 em.
- Use the font's variation axes (optical size, weight) when it has them.
- Do not swap the face. When it cannot carry the direction, ask.

## Color at full strength

- Let a color the system owns take a larger region.
- Commit color at region scale, not as scattered accents.
- Do not add a hue without asking.
- Reduce chroma as lightness nears black or white.

## Add spatial drama

Bold designs use whitespace as emphasis, not as default padding:
- Tighten the spacing inside dense areas (related elements, lists, form rows)
- Expand the breathing room around featured elements (hero, primary actions, key content blocks)
- This contrast — dense against spacious — creates emphasis without adding more elements
- Give the target its own rhythm: a shift in density or pace.

## Make one dominant choice

A bolder design usually has one committed large-scale choice:
- A color that owns a significant surface area
- A type size that demands attention
- An asymmetric layout or grid that has a clear point of view
- A texture or image from the subject's own world

Pick one. Execute it fully. Do not add three half-committed moves.

Quiet everything around the move. If every element got louder, the section got flatter.

## The skeleton test

1. Remove the copy from the planned section.
2. Look at the bare structure. It still shows what the section is and why it matters.
3. When it works only with the words, the boldness is in the text size, not in the design. Rework it.

An image placeholder names a job and its evidence. It is not a cue for a decorative photo.

## Validate

After changes:
- Everything outside the target is unchanged.
- No new color, font or primitive appeared without the person's agreement.
- Every action still works the same way.
- It reads as the same product, only surer.
- The design has a point of view, and the visual hierarchy is obvious at once.
- On a Persuade surface, you can name the aesthetic lane.

## Never

- Multiple large-scale dominant choices competing for attention
- Bold for bold's sake — every increase in visual weight serves hierarchy
- Decorating rather than composing (adding elements instead of making structural changes)
- Aggressive typography with poor color contrast (bold weight does not substitute for contrast ratio)

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> bolder` focuses the design stage and its contract `02c-craft.md` on the named target.
- **Design confirmed:** `/wf design <slug> bolder` runs the diagnosis, the skeleton test and the Validate list against the frozen boards and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/bolder-<timestamp>.md` per [_output.md](_output.md) with: the target, the source of the timidity, the one dominant choice, each addition the person agreed to, and the skeleton-test result.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
