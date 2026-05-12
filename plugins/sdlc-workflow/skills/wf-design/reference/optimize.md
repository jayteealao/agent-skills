Identify and fix performance bottlenecks in a UI — loading speed, rendering performance, animation frame rates, and bundle size.

---

## Register

Brand: performance enables the designed experience. A hero animation that drops frames is worse than no animation. Brand surfaces often have heavier visual treatments (images, fonts, effects) that require more performance investment, not less.

Product: performance IS the user experience. Every millisecond of delay costs engagement. Product surfaces often have more dynamic data — query performance, render frequency, and skeleton loading quality matter more here.

---

## Motion-first, reduce via media query

When optimizing animations, the goal is to make them run at 60fps — not to remove them. `@media (prefers-reduced-motion: reduce)` handles users who need less motion. Design for the animated experience; optimize for smooth playback.

The correct optimization question is "why is this animation dropping frames?" not "should we keep this animation?"

## Step 1: Profile what's slow

Before optimizing, identify the actual bottleneck. Don't assume:

**Rendering**:
```javascript
// Chrome DevTools: Performance tab → Record → interact with slow element → stop
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

**GPU-composited properties only** — these are fast (no layout, no paint):
- `transform: translate/scale/rotate`
- `opacity`

**Layout-triggering properties** — avoid animating these:
- `width`, `height`, `margin`, `padding`, `top`, `left`, `bottom`, `right`
- `font-size`, `line-height`

**Paint-triggering** — animate carefully, use sparingly:
- `background-color`, `color`
- `border-color`, `box-shadow`
- `filter`, `clip-path` (expensive per-frame, use with `will-change` and test carefully)

```css
/* Fast: GPU composited */
.card:hover { transform: translateY(-4px); transition: transform 200ms ease-out; }

/* Slow: triggers layout */
.card:hover { margin-top: -4px; } /* don't do this */
```

**`will-change`**: Add only to elements that will animate. Adds GPU layer. Overuse wastes GPU memory.

```css
.animated-element { will-change: transform; }
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
