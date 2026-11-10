Give a design that is timid or generic real visual strength, or make one part of it extraordinary. The move raises a part to the conviction that the direction already has. It does not replace the direction.

When a directions round is open, "bolder" asks for another round further along the axis: run [stage.md](stage.md) Step 3b again, around the direction that the person names.

---

## Design mode

| Mode | Bolder means |
|---|---|
| Persuade and Experience | Distinctive. Get it through hierarchy, pacing, proportion, copy, evidence and one committed idea. Push the aesthetic lane that the brief names. The one extraordinary moment has no taste ceiling. |
| Operate | Stronger hierarchy, weight contrast, sharper density and decisive priority. Theatrics erode trust. The one extraordinary moment is in how a task feels: a dialog that grows from its trigger, a very large table that does not stutter. |
| Read | Bolder lives in the frame: the masthead, the rail and the section openers. The reading column stays calm. |

---

## Scope

Touch only the named target. Leave its neighbors unchanged. Do not add a color, a font, a radius, a shadow or a primitive that the system does not own. When the tokens cannot express the direction, ask the person: name the addition and its job.

Keep every claim true. When the direction needs evidence that is missing, ask for it. Do not invent it.

## Diagnose the timidity

Compare the target with its neighbors. Find the strong moves that the system makes elsewhere and this part skips. Then name the source:

| Source | Sign |
|---|---|
| Type: a flat scale | Headings close in size to the body; no weight contrast |
| Color: too much restraint | Everything in one value range; no color with conviction |
| Space: uniform density | One spacing value everywhere; no emphasis through space |
| Voice: hedging | Small type, pale colors and wide padding everywhere |
| Composition: no hierarchy | Every element has equal weight |

## Strengthen

Work in this order, and stop when the target leads.

1. **Type.** Push the lead element to the top of the type scale of `DESIGN.md`. Add weight contrast with the weights that the face ships. Use the variation axes of the face when it has them. Add a step to the scale, or change the face, only after the person agrees ([typeset.md](typeset.md)).
2. **Color.** Let a color that the system owns take a larger region. Commit color at region scale, not as scattered accents. Do not add a hue without asking ([colorize.md](colorize.md)).
3. **Space.** Tighten the spacing inside dense areas. Expand the room around the featured element. The contrast of dense against spacious makes emphasis without a new element.

## One dominant choice

A bolder design has one committed large-scale choice: a color that owns a large area, a type size that demands attention, an asymmetric layout with a point of view, or a texture or image from the subject's own world. Pick one. Execute it fully. Then quiet everything around it: when every element gets louder, the section gets flatter.

**The skeleton test.** Remove the copy from the planned section. The bare structure still shows what the section is and why it matters. When it works only with the words, the boldness is in the text size, not in the design: rework it. An image placeholder names a job and its evidence; it is not a cue for a decorative photo.

## The one extraordinary moment

Use this section when the person asks for one part to feel extraordinary: a transition, a large table, a form or a page. Take fewer elements further. Change how a feature feels, not what the product does: route a new capability (offline use, real-time collaboration) to `shape`.

**Propose before you draw.** This part of the move misfires more than any other.

1. Write two or three directions. For each, give a name, the technique, what the person sees and feels, the cost on the target devices, and the fallback.
2. Ask the person to pick one per [_gate-question.md](../_gate-question.md). Put the description and the cost of each direction inside its option.
3. Draw only the direction that the person picked.

| Goal | Technique (terms of [_platforms.md](_platforms.md)) |
|---|---|
| A cinematic transition | A **shared-element transition** carries one element from one state to the next. A **spring** keeps the motion physical and interruptible. |
| Motion tied to scroll | A **scroll-linked animation** drives one authored moment. Do not give every section the same entrance. |
| Rendering beyond standard views | A **GPU drawing surface** for shaders and particles. |
| Live data | **Long-list virtualization** for a huge table. A chart moves between data states and does not swap. |
| The device | Sound, motion sensors and ambient light: rarely, and only with the person's permission. |

- Name the one moment that this surface is remembered for, and the effect that serves that moment and no other. Everything else recedes.
- The moment passes the gates of [animate.md](animate.md). An effect that fires on a high-frequency action is broken, not ambitious.
- The moment has a reduced-motion form and a fallback that looks finished.
- Fix weak layout and weak type first. An effect does not hide them.

## Never

- Several large-scale choices that compete.
- Bold for its own sake. Every increase in visual weight serves hierarchy.
- Decoration in place of composition: added elements where a structural change was needed.
- Heavy type on poor contrast. Weight does not replace the contrast of [_craft-floor.md](_craft-floor.md) rule 1.
- An effect whose only purpose is a technical demonstration.

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says when each use runs. A note follows [_output.md](_output.md).

### At the design stage

The move changes the named target in its screens: its type steps, the region that a color owns, its spacing contrast, and the one dominant choice. For the extraordinary moment, it draws the picked direction in the screen page, with its fallback. The contract records the target, the source of the timidity, the dominant choice, and each addition that the person agreed to.

### As a pass on an approved design

The pass changes nothing. Write each answer as a finding with its screen key.
1. Which part is timid, and which source in the table explains it?
2. Does the screen have one dominant choice, or none, or several?
3. Does the skeleton test pass?
4. Which strong move does the system make elsewhere that this part skips?
5. Is there one moment that the surface is remembered for? When an effect exists, does it pass the gates of [animate.md](animate.md)?

### In implement

- Build the extraordinary moment per [_motion-build.md](_motion-build.md): cheap properties on the render thread, interruptible motion, heavy resources started late and paused off screen, and a fallback for a device without support.
- Run it on a mid-range phone of the audience. When the frame rate falls, simplify the effect.
- Remove the effect once. When nobody misses it, delete it.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
