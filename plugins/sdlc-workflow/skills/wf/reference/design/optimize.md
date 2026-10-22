Treat performance as a feature. Find the real bottleneck on this surface. Fix it, then measure again. Do not optimize what is not slow.

---

## Design mode

Persuade and Experience: heavy media and effects need more performance work, not less. The first viewport loads first. A hero animation that drops frames is worse than no animation.

Operate: input response and dynamic data lead. Query speed, render frequency and the quality of the loading state matter most.

Read: time to readable text leads. Nothing shifts the layout while the person reads.

---

## Smooth motion, not less motion

When optimizing animations, the goal is to make every frame land inside its budget (8.3 ms at 120 Hz) — not to remove motion that passed the gates of `animate.md`. The reduced-motion setting handles people who need less motion: fewer and gentler, not zero.

The correct optimization question is "why is this animation dropping frames?" not "should we keep this animation?"

## Step 1: Measure first

Find the real bottleneck before you change code. Do not assume it.

1. Measure the current state: load time, input response, layout shift, frame rate, memory and payload size.
2. For each problem, write what is slow, the cause, how bad it is, and who it affects.
3. Use the **profiling tools** of your platform ([_platforms.md](_platforms.md)).
4. Measure on a real mid-range device with a slow network. A fast developer machine hides the problem.
5. Fix the largest bottleneck first. Do not tune small costs while a large one remains.

## Step 2: Animation performance

The motion-performance rules are single-sourced in [animate.md](animate.md) → Performance: the 8.3 ms frame budget, the three property tiers (cheap, paint, layout) and the swaps between them, render thread against app thread, per-frame values outside component state, the inherited-value trap, blur cost, the layer hint, and the diagnosis order. [_platforms.md](_platforms.md) gives each term's form on the web, iOS, Android (Compose) and desktop. Load both before you change motion code; do not restate them here.

**Transition only what changes.** Never animate every property at once — it watches every property, animates ones you never intended (colors, padding, shadows), and blocks optimization. Name the properties.

```css
/* Web: never `transition: all`, nor Tailwind's bare `transition` class (it maps to `transition-property: all`). */
transition-property: transform, opacity;   /* Tailwind: transition-transform, or transition-[transform,opacity] */
```

## Step 3: Media

- Never defer content in the first viewport. The hero and the first visible images load at once.
- Load media below the first viewport on demand: **deferred media loading** ([_platforms.md](_platforms.md)).
- Reserve the size of each image, video and embed before it loads: **reserved media size**. Nothing moves when it arrives.
- Serve each image at its displayed size, in the most efficient format the platform supports.

```html
<!-- Web: the hero loads at once; a below-fold image loads on demand. -->
<img src="hero.webp" width="1200" height="600" fetchpriority="high" alt="...">
<img src="detail.webp" width="800" height="450" loading="lazy" alt="...">
```

## Step 4: Fonts

- Show text in a fallback face while a custom face loads. Never hide text: **text shown during font load**.
- Load only the weights and the characters in use.
- Prefer system faces on Operate and Read surfaces.

## Step 5: Code and render

- Remove unused styles, code and dependencies.
- Batch layout reads, then batch layout writes. Never alternate them in a loop.
- Render only the visible rows of a long list: **long-list virtualization**.
- Skip work for content off screen.
- Throttle scroll, resize and input handlers.
- Do not rebuild a view when its data did not change.

```javascript
// Web: batch reads, then batch writes.
const heights = elements.map(el => el.scrollHeight);
elements.forEach((el, i) => { el.style.height = heights[i] + 'px'; });
```

## Network

- Page the data. Do not load every record at once.
- Request only the fields the surface shows.
- Compress and cache responses.
- Show an optimistic result while a save runs, and roll it back on failure.

## Targets

Meet the platform's responsiveness targets. The web targets and their severities live in the web runtime adapter (`runtime-adapters/web.md`). Verify measures them.

## Output format

```
## Performance Optimization Report

### Profiling results
[What was actually slow — measured, not assumed]

### Changes made
[With before/after metrics where measurable]

### Remaining opportunities
[Lower-priority items for future optimization]
```

Before you report:
- Compare before and after on the same device and the same network.
- Check that every function still works.
- Check that accessibility did not get worse.
- Record the device and the network in the report.

Next: the `polish` move.

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> optimize` focuses the design stage and its contract `02c-craft.md` on performance.
- **Design confirmed:** `/wf design <slug> optimize` runs the Step 1 measurements against the frozen boards and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/optimize-<timestamp>.md` per [_output.md](_output.md) with: each bottleneck and its measurement, the change, the before and after numbers, and the device and network used.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *The animation-performance guidance pointed to above is adapted from Emil Kowalski's `animation-performance` skill ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11) and Jakub Krehel's "Details that make interfaces feel better" ([jakub.kr](https://jakub.kr/writing/details-that-make-interfaces-feel-better)); the full craft lives in `animate.md` / `polish.md`. Used under MIT license.*
>
> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
