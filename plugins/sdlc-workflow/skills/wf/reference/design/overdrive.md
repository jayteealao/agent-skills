> **Additional context needed**: the design direction, performance constraints, willingness to commit to ambitious effects.

Make one part of the interface feel extraordinary: a transition, a large table, a form or a page. The surface and its design mode decide what extraordinary means.

---

## Design mode

Persuade and Experience: no taste ceiling. Scroll-linked motion can serve the story; a shader ground can serve the mood. Everything expensive earns its cost.

Operate: one extraordinary moment in how a task feels. Examples: a dialog that grows from its trigger, a 100,000-row table that never stutters, an optimistic save. The rest stays functional.

Read: invisible but felt. Search is instant and navigation is smooth. Nothing moves in the reading column.

---

## Philosophy

Overdrive is not adding more elements. It is taking fewer elements further. The difference between a well-designed surface and a technically extraordinary one is usually the depth of commitment to 2–3 choices — not the number of choices.

Before adding anything, identify the ONE thing this surface is trying to be. Then push that thing as far as the performance budget allows.

Change how a feature feels, not what the product does. Route a new capability (offline use, real-time collaboration) to `shape`.

## Propose before you build

This move misfires more than any other. Do not write code before the person picks a direction.

1. Write two or three directions. For each, give a name, the technique, what the person sees and feels, the cost on the target devices, and the fallback.
2. Ask the person to pick one per [_gate-question.md](../_gate-question.md). Put each direction's description and cost inside its option.
3. Build only the direction the person picked.
4. After the pick, load [_craft-floor.md](_craft-floor.md). Build against it.

## Toolkit by goal

Pick the technique from the goal. [_platforms.md](_platforms.md) gives the form of each term on each platform.

- **Cinematic transitions.** A **shared-element transition** carries one element from one state to the next: a list row grows into its detail view, a button grows into its dialog. A **spring** keeps the motion physical and interruptible.
- **Motion tied to scroll.** A **scroll-linked animation** drives progress, parallax or a reveal from the scroll position. Tie one authored moment to scroll. Never give every section the same entrance.
- **Rendering beyond standard views.** A **GPU drawing surface** draws shaders, particles and post-processing. A worker thread renders heavy visuals off the app thread. Vector filter chains give organic distortion.
- **Live data.** **Long-list virtualization** renders only the visible rows of a huge table. A GPU-drawn chart holds a dataset too large for standard views. A chart moves between data states; it does not swap.
- **The device.** Sound, motion sensors and ambient light. Use them rarely, and only with the person's permission.

Use gradient text or decorative glass only when the brief names them. `audit` and `critique` flag them.

## Progressive enhancement

- Check platform support before you use a technique.
- A device without support gets the fallback.
- The fallback looks finished. It is a design, not an error state.

```css
/* Web: the scroll-linked moment applies only where the browser supports it. */
@supports (animation-timeline: scroll()) {
  .hero-figure { animation-timeline: scroll(); }
}
```

## Performance rules for overdrive

Design against the 8.3 ms frame budget of [animate.md](animate.md) → Performance.
- When the frame rate on the target device falls below 50 frames a second, simplify the effect.
- Start a heavy resource (a GPU context, a large module) only when its surface comes near the viewport.
- Pause an effect when it leaves the screen.

Cost per effect, per frame, on a mid-range phone:
- A transition on a cheap property: close to free.
- An animation on a cheap property: under 1 ms.
- A blur or saturation filter: 2–4 ms. Test it on a phone.
- A background blur behind a panel: 3–6 ms. Never put one on each item of a list.
- A simple GPU shader: 2–5 ms.
- A complex GPU scene: 5–16 ms. Measure it, and give it quality levels.

## Motion discipline still applies

Overdrive relaxes the *taste* ceiling, not the *craft* floor. The signature effect can be theatrical. On a Persuade or Experience surface, a real spring with `bounce` 0.1–0.3, or an overshoot, is allowed when the direction calls for play. The floor refuses bounce on Operate and Read surfaces. The motion stays **interruptible**: a spring or transition that retargets, not a keyframe that restarts mid-gesture. Animate cheap properties on the render thread (see animate.md → Performance). The motion coheres with the surface's personality. An expensive effect that drops frames, or fires on a high-frequency action, is not ambitious. It is broken.

## The one extraordinary thing

Identify the signature move before building effects:
- What is the ONE moment this surface is remembered for?
- What effect serves that moment and no other?
- What is the performance cost, and is it worth it?

Execute the signature move at full quality. Everything else should recede.

## Validate

After pushing to overdrive:
- Run it on a mid-range phone of the audience. Is it still smooth?
- Turn on the **reduced-motion setting**. Does every animation have a gentler form?
- Check the timing, the easing and the smoothness on the running surface, not in the code.
- Remove the effect once. When nobody misses it, delete it.
- Does the effect fit this audience, or does it only demonstrate capability?

## Never
- Several GPU scenes at once, competing for GPU time.
- A background blur on each repeated item of a list.
- An effect that blocks or delays input.
- An effect with no purpose beyond a technical demonstration.
- Sound without an opt-in from the person.
- An effect that hides weak layout or weak type. Fix those first with other moves.
- A new platform feature with no fallback.

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> overdrive` focuses the design stage and its contract `02c-craft.md` on the one extraordinary moment.
- **Design confirmed:** `/wf design <slug> overdrive` runs the Validate checks and the cost list against the approved screens and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/overdrive-<timestamp>.md` per [_output.md](_output.md) with: the directions proposed, the pick, the cost on the target device, the fallback, and the checks that code alone cannot settle.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
