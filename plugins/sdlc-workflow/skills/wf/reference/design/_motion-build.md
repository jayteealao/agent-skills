# Building motion (`design/_motion-build.md`)

The build rules of motion: which tool, what each property costs, how to keep frames inside the budget, how a gesture behaves, and how to check the feel. `implement` loads this file when a slice builds motion. `verify` and the performance review cite it. [animate.md](animate.md) decides whether a thing animates and with which values; this file says how to build it. The terms are those of [_platforms.md](_platforms.md).

> Load with: `design/_motion-build.md`

## The tool ladder

Use the first that works. Do not add an animation library for a fade.

1. A **retargetable animation** on a state change (hover, press, a toggled state).
2. An **entry without a mount flag** for an element that appears.
3. A **render-thread animation** for predetermined motion that must stay smooth while the app is busy.
4. The **programmatic animation API** of the platform, for control from code without a library.
5. An **animation library** for springs, shared-element and layout animation, exit animations of removed elements, and gesture-driven values.

When the job needs a component and not an animation (a toast, a drawer, a command menu), use the component of the platform or of the design system. Do not hand-roll one for its motion.

## Performance

**The frame budget** is 16.7 ms at 60 Hz and 8.3 ms at 120 Hz. Design against 8.3 ms. A fast development machine hides almost every problem below, so do not conclude "smooth" from it. Say which findings come from code and which need a recording on a real mid-range device.

**What you animate.** Three tiers, an order of magnitude apart:

| Tier | Properties | Cost |
|---|---|---|
| Cheap | offset, scale, rotation, opacity (and, on some renderers, filter) | Compositing only |
| Paint | color, background color, shadow, corner radius, clip | A redraw every frame |
| Layout | size, padding, margin, position in the layout | Re-measures, and moves the elements around it |

- Animate cheap properties. Clip is the one accepted extra: it repaints on most renderers, but it does not re-lay out, and it draws reveals that no cheap property can.
- A layout property is accepted only for an accordion, where no cheap equivalent exists. Keep it short, and measure the content height first.
- On a Persuade or Experience surface, a paint property (blur, mask, clip, shadow) may carry the focal moment. Bound it to one region, and confirm the frame budget on a real mid-range device.
- Swap down a tier: a size change becomes scale; a position change becomes an offset; a show or hide becomes opacity; an animated shadow becomes the opacity of a pre-rendered shadow.

**Name the properties.** Do not animate every property at once: the renderer then watches every property and animates ones that you did not intend.

```css
/* Web: name the properties; do not write `transition: all`.
   Tailwind: the bare `transition` class sets a fixed list of properties; only `transition-all` is `all`. */
transition-property: transform, opacity;
```

**Where it runs.** Motion on the render thread stays smooth while the app works. Motion on the app thread drops frames during navigation, loading, data fetching or start-up. Move predetermined motion that plays during heavy work to the render thread.

**Per-frame values do not go through component state.** A handler that sets state on every frame rebuilds the view each frame. Write the property of the moving element, or a value that the renderer reads in the layout or draw phase.

**One inherited value must not drive the motion of one child.** When a value that every child inherits drives the moving child, every child recalculates each frame, and the drag slows as content grows. Set the property of the moving element directly.

**Animated blur stays under 20 px** on an Operate or Read surface; 2–5 px is enough to soften a crossfade. A Persuade or Experience focal moment may go above 20 px inside the frame budget.

**A layer hint comes last.** Add it only after you see a one-pixel shift or measured dropped frames, only on the element that animates, and not on a large container. Each layer costs GPU memory.

**Heavy effects.** Start a heavy resource (a GPU context, a large module) only when its surface comes near the viewport. Pause an effect when it leaves the screen. Do not run several GPU scenes at once. Do not put a background blur on each item of a list. Check platform support before you use a new technique, and give a device without support a fallback that looks finished. Measure the cost of each effect on the target device; do not take it from a table.

```css
/* Web: the scroll-linked moment applies only where the browser supports it. */
@supports (animation-timeline: scroll()) {
  .hero-figure { animation-timeline: scroll(); }
}
```

**Diagnose before you fix**, in this order: (1) which properties animate; (2) does the jank coincide with heavy work; (3) does the view rebuild per frame; (4) does it get worse as content grows; (5) is an inherited value animated; (6) is blur above 20 px; (7) only then a layer hint. Every fix names the cause that it addresses. Confirm with a recording, not by feel. The question is "why does this animation drop frames?", not "should we keep this animation?": the gates of [animate.md](animate.md) already answered the second.

## Gestures

Physics beats thresholds:

- **Springs for gestures.** A spring carries velocity through an interruption.
- **Velocity dismissal.** Dismiss on a flick (speed above about 0.11 px/ms) even when the distance is short.
- **Velocity handoff.** When the finger lifts, start the settling spring with the velocity of the gesture.
- **Momentum projection.** Settle where the gesture is going, not where the finger stopped: project the release velocity forward, and snap to the nearest valid resting point.
- **Rubber-banding.** Past a natural edge, move less the further the drag goes.
- **Pointer capture** once the drag starts, so that it continues when the pointer leaves the element.
- **Multi-touch protection.** Ignore extra touch points once a drag begins.
- **1:1 tracking.** During a drag, the element follows the finger exactly, with no easing and no lag.
- **Decorative pointer tracking.** Do not bind a transform directly to the pointer position. Interpolate it through a spring, so that it lags and settles. Keep it off a functional control and off a chart.

An interrupted gesture follows [harden.md](harden.md) → In implement.

## Dynamic collections

Anything added or removed fast (toasts, list items) uses a retargetable animation. It retargets smoothly and does not restart from zero.

## Perceived speed

- A response under 100 ms feels synchronous.
- Preload the most likely next view.
- Show an optimistic result at once, and roll it back when the request fails ([harden.md](harden.md) → In implement).
- Use a skeleton that matches the final layout in a content area, not a spinner. Do not show a spinner or a skeleton on work under 300 ms.

## Feel check

Motion bugs hide at full speed. Before you call an animation done:
- **Slow it down** to 2–5 times its duration, or use the slow-animation tool of the platform ([_platforms.md](_platforms.md) → Feel check tools). Do two states overlap? Does the easing stop abruptly? Is the origin right? Do coordinated properties stay in sync?
- **Step it frame by frame** to catch drift between coordinated properties.
- **Record a group and step through each handoff.** A wave and a queue look the same at full speed. Then picture the 50th use of the day: when you would skip it, cut it.
- **Test gestures on a real device**, not with a desktop pointer.
- **Look again the next day.**

Record in the design note each check that code alone cannot settle.

## Never ship

| Never | Instead |
|---|---|
| Animating every property at once | Name the exact properties |
| Animating a layout property | A cheap property |
| A restarting animation on a toast, a toggle or another fast-fired element | A retargetable animation |
| App-thread motion that plays during heavy work | Render-thread motion |
| A per-frame value through component state | The property of the moving element |
| An effect that blocks or delays input | Motion that leaves the element usable |
| A new platform feature with no fallback | A fallback that looks finished |

---

> *The tool ladder, the performance diagnosis, gesture physics and the feel check are adapted from Emil Kowalski's skills `animate`, `animation-performance`, `review-animations` and `apple-design` ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11). MIT license.*

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
