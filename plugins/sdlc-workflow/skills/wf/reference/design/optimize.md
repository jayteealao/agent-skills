# UI performance (`design/optimize.md`)

A reference for `implement` and `verify`: how to keep a UI fast. It is not a design move. A screen page cannot show performance, so `/wf design` draws nothing from this file. The old move word `optimize` on `/wf design` loads this file as a reference, and the performance dimension of [audit.md](audit.md) checks an approved design.

Treat performance as a feature. Find the real bottleneck on this surface. Fix it, then measure again. Do not optimize what is not slow. The terms in bold are those of [_platforms.md](_platforms.md).

> Load with: `design/optimize.md`

## Design mode

| Mode | What leads |
|---|---|
| Persuade and Experience | Heavy media and effects need more performance work, not less. The first viewport loads first. A hero animation that drops frames is worse than no animation. |
| Operate | Input response and dynamic data. Query speed, render frequency and the quality of the loading state matter most. |
| Read | Time to readable text. Nothing shifts the layout while the person reads. |

## What a design decides for performance

These are the only parts that the design stage draws:
- the `loading` state of each screen: a skeleton that matches the final layout, in content areas;
- a reserved size for each image, video and embed, so that nothing moves when it arrives;
- the fallback of each heavy effect.

## Measure first

1. Measure the current state: load time, input response, layout shift, frame rate, memory and payload size.
2. For each problem, write what is slow, the cause, how bad it is, and who it affects.
3. Use the **profiling tools** of the platform.
4. Measure on a real mid-range device with a slow network. A fast developer machine hides the problem.
5. Fix the largest bottleneck first.

## Motion

The motion-performance rules are in [_motion-build.md](_motion-build.md) → Performance: the frame budget, the three property tiers, the render thread, per-frame values, the inherited-value trap, blur cost, the layer hint and the diagnosis order. Do not restate them. The goal is that every frame lands inside its budget, not that motion which passed the gates of [animate.md](animate.md) is removed.

## Media

- Do not defer content in the first viewport. The hero and the first visible images load at once.
- Load media below the first viewport on demand: **deferred media loading**.
- Reserve the size of each image, video and embed before it loads: **reserved media size**.
- Serve each image at its displayed size, in the most efficient format that the platform supports.

```html
<!-- Web: the hero loads at once; an image below the first viewport loads on demand. -->
<img src="hero.webp" width="1200" height="600" fetchpriority="high" alt="...">
<img src="detail.webp" width="800" height="450" loading="lazy" alt="...">
```

## Fonts

- Show text in a fallback face while a custom face loads. Do not hide text: **text shown during font load**.
- Load only the weights and the characters in use.
- Match the metrics of the fallback to the face, so that the swap does not move the layout.

## Code and render

- Remove unused styles, code and dependencies.
- Batch layout reads, then batch layout writes. Do not alternate them in a loop.
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
- Request only the fields that the surface shows.
- Compress and cache responses.
- Show an optimistic result while a save runs, and roll it back on failure.

## Targets

Meet the responsiveness targets of the platform. The web targets and their severities are in the web runtime adapter (`runtime-adapters/web.md`). `verify` measures them.

## Record

`implement` records each change in its design note per [_output.md](_output.md): each bottleneck and its measurement, the change, the numbers before and after on the same device and network, and the device and network used. Check that every function still works and that accessibility did not get worse.

---

> *The animation-performance guidance pointed to above is adapted from Emil Kowalski's `animation-performance` skill ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11) and Jakub Krehel's "Details that make interfaces feel better" ([jakub.kr](https://jakub.kr/writing/details-that-make-interfaces-feel-better)). Used under MIT license.*
>
> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
