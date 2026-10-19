Identify and fix performance bottlenecks in a UI — loading speed, rendering performance, animation frame rates, and bundle size.

---

## Register

Brand: performance enables the designed experience. A hero animation that drops frames is worse than no animation. Brand surfaces often have heavier visual treatments (images, fonts, effects) that require more performance investment, not less.

Product: performance IS the user experience. Every millisecond of delay costs engagement. Product surfaces often have more dynamic data — query performance, render frequency, and skeleton loading quality matter more here.

---

## Smooth motion, not less motion

When optimizing animations, the goal is to make every frame land inside its budget (8.3 ms at 120 Hz) — not to remove motion that passed the gates of `animate.md`. The reduced-motion setting handles people who need less motion: fewer and gentler, not zero.

The correct optimization question is "why is this animation dropping frames?" not "should we keep this animation?"

## Step 1: Profile what's slow

Before optimizing, identify the actual bottleneck. Don't assume:

**Rendering**:
```javascript
// Browser DevTools: Performance tab → Record → interact with slow element → stop
// Look for: Long Tasks (red bars), Layout, Style Recalc, Paint, Composite layers
```

**Bundle**:
```bash
npx source-map-explorer dist/main.js
# or
npx bundle-buddy dist/*.js
```

**Network**:
```
DevTools → Network tab → check:
- Unoptimized images (>200KB for typical UI images)
- Render-blocking resources
- Missing lazy loading
- No compression (gzip/brotli)
```

## Step 2: Animation performance

The motion-performance rules are single-sourced in [animate.md](animate.md) → Performance: the 8.3 ms frame budget, the three property tiers (cheap, paint, layout) and the swaps between them, render thread against app thread, per-frame values outside component state, the inherited-value trap, blur cost, the layer hint, and the diagnosis order. [_platforms.md](_platforms.md) gives each term's form on the web, iOS, Android (Compose) and desktop. Load both before you change motion code; do not restate them here.

**Transition only what changes.** Never animate every property at once — it watches every property, animates ones you never intended (colors, padding, shadows), and blocks optimization. Name the properties.

```css
/* Web: never `transition: all`, nor Tailwind's bare `transition` class (it maps to `transition-property: all`). */
transition-property: transform, opacity;   /* Tailwind: transition-transform, or transition-[transform,opacity] */
```

## Step 3: Loading performance

**Images**:
- Use `loading="lazy"` for below-fold images
- Use `width` and `height` attributes to prevent layout shift (CLS)
- Use modern formats: WebP (96% support), AVIF (90% support)
- Responsive images with `srcset` and `sizes`

```html
<img src="hero.webp" width="1200" height="600" loading="lazy" alt="...">
```

**Fonts**:
- `font-display: swap` to prevent invisible text during load
- Preload critical fonts: `<link rel="preload" href="font.woff2" as="font" crossorigin>`
- Subset fonts to only the characters actually used
- Variable fonts reduce font payload when multiple weights are needed

**CSS**:
- Remove unused CSS with PurgeCSS or equivalent
- Critical CSS inlined, non-critical deferred
- `content-visibility: auto` on off-screen sections for long pages

## Step 4: Render performance

**Avoid layout thrash** (reading then writing layout properties in loops):
```javascript
// Bad: forces layout on every iteration
elements.forEach(el => { el.style.height = el.scrollHeight + 'px'; });

// Good: batch reads, then batch writes
const heights = elements.map(el => el.scrollHeight);
elements.forEach((el, i) => { el.style.height = heights[i] + 'px'; });
```

**Virtualize long lists**: only render visible rows:
- React: `react-virtual`, `@tanstack/react-virtual`
- Vue: `vue-virtual-scroller`

**Debounce/throttle**: expensive handlers on scroll, resize, input.

**Memoize**: expensive computed values, component renders with `useMemo` / `React.memo`.

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

## In the workflow

This file is a move, not a stage. The design stage (`/wf design <slug> <move>`) focuses the visual contract `02c-craft.md` on it, `plan` cites it as a step pointer, and `implement` applies it and records `design-notes/<move>-<timestamp>.md` per [_output.md](_output.md). The absolute bans in [_design-context.md](_design-context.md) apply.

---

> *The animation-performance guidance pointed to above is adapted from Emil Kowalski's `animation-performance` skill ([github.com/emilkowalski/skills](https://github.com/emilkowalski/skills), commit `2d22863`, 2026-10-11) and Jakub Krehel's "Details that make interfaces feel better" ([jakub.kr](https://jakub.kr/writing/details-that-make-interfaces-feel-better)); the full craft lives in `animate.md` / `polish.md`. Used under MIT license.*
