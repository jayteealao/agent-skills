# Platform forms: the web (`design/_platforms-web.md`)

The form of each generic term of the design rules on the web. An Electron app also reads this file. [_platforms.md](_platforms.md) holds the rules of the map and says which file a project reads. Checked against the platform documentation on 2026-10-22. When a form here disagrees with the framework version of the project, the version of the project wins.

> Load with: `design/_platforms-web.md`

## Rendering

| Term | Form |
|---|---|
| **cheap property** — changes without new layout or paint | `transform`, `opacity`, `filter` |
| **paint property** — redraws, moves nothing else | `color`, `background-color`, `box-shadow`, `border-radius`, `clip-path` |
| **layout property** — moves other elements | `width`, `height`, `padding`, `margin`, `top`, `left` |
| **render thread** | The compositor thread |
| **app thread** | The main thread |
| **layer hint** | `will-change: transform` |

## Animation

| Term | Form |
|---|---|
| **retargetable animation** | CSS transition; Web Animations API (`element.animate`) |
| **restarting animation** | CSS `@keyframes` |
| **curve token** (x1, y1, x2, y2) | `cubic-bezier(x1, y1, x2, y2)` |
| **spring** (duration, bounce) | Motion `{ type: "spring", duration, bounce }` (or `visualDuration`) |
| **trigger origin** | `transform-origin`; Base UI sets `--transform-origin` on the positioner |
| **entry without a mount flag** | `@starting-style` |
| **per-frame value** | Write the element's style or a motion value, never component state |

## Settings and input

| Term | Form |
|---|---|
| **reduced-motion setting** | `@media (prefers-reduced-motion: reduce)` |
| **hover pointer** | `@media (hover: hover) and (pointer: fine)` |
| **press feedback** | `:active` scale |
| **system back** | Browser history |
| **insets and system bars** | `env(safe-area-inset-*)` with `viewport-fit=cover`; `dvh` units; `<meta name="theme-color">` |
| **largest text size** | Browser zoom 200% and the text-size setting |

## Layout and input

| Term | Form |
|---|---|
| **minimum hit area** | 24×24 CSS px, which `wf.mjs design check` enforces; 44–48 px for a coarse pointer ([_craft-floor.md](_craft-floor.md) rules 4 and 5). A small control extends its hit area with a centered pseudo-element ([harden.md](harden.md) → Touch targets) |
| **window size class** | Width breakpoints in media or container queries: `@media (width >= 600px)`, `@container` |
| **coarse pointer** | `@media (pointer: coarse)`; `@media (any-pointer: coarse)` when touch is one input of several |
| **interrupted gesture** | `pointercancel` and `lostpointercapture`; the window's `blur`; capture with `setPointerCapture` |

## Language and accessibility

| Term | Form |
|---|---|
| **start and end edges** | Logical properties: `margin-inline-start`, `padding-inline-end`, `inset-inline-start`; `dir="rtl"`; flip a direction icon under `:dir(rtl)` |
| **locale formatter** | `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.PluralRules`, `Intl.RelativeTimeFormat`; `Intl.NumberFormat('fa-IR')` gives Eastern Arabic-Indic digits, and `Intl.DateTimeFormat('ar-SA-u-ca-islamic')` the Hijri calendar |
| **high-contrast setting** | `@media (forced-colors: active)`; `@media (prefers-contrast: more)` |
| **accessibility semantics** | Native elements first; then `role`, `aria-label`, `aria-live` |

## Media and performance

| Term | Form |
|---|---|
| **profiling tools** | DevTools Performance panel and Lighthouse; field data from the `web-vitals` library; bundle size with `npx source-map-explorer dist/main.js` |
| **deferred media loading** | `loading="lazy"` on images and iframes below the first viewport; `fetchpriority="high"` on the hero |
| **reserved media size** | `width` and `height` attributes, or `aspect-ratio` |
| **text shown during font load** | `font-display: swap` (or `optional`); a metric-matched fallback with `size-adjust` |
| **long-list virtualization** | A virtual list (TanStack Virtual); `content-visibility: auto` on long off-screen sections |

## Advanced rendering

| Term | Form |
|---|---|
| **shared-element transition** | View Transitions: `document.startViewTransition()` and `view-transition-name` |
| **scroll-linked animation** | `animation-timeline: scroll()` or `view()`, behind `@supports`; Motion `useScroll` |
| **GPU drawing surface** | `<canvas>` with WebGL2 or WebGPU; `OffscreenCanvas` in a worker |

## Type and system parts

| Term | Form |
|---|---|
| **hanging punctuation** | `hanging-punctuation: first` (Safari only); elsewhere a negative `text-indent` on a block that opens with a quotation mark |
| **balanced wrap** | `text-wrap: balance` |
| **even-last-line wrap** | `text-wrap: pretty` |
| **tabular numerals** | `font-variant-numeric: tabular-nums` |
| **font smoothing** (web only) | `-webkit-font-smoothing: antialiased`, once at the root; only macOS browsers apply it |
| **system-part colors** | `::selection`, `caret-color`, `scrollbar-color`, `accent-color`, `outline-color` on `:focus-visible`, `text-decoration-color` |

## Feel check tools

DevTools Animations panel (slow playback, step); Performance panel (dropped frames, long tasks); remote debugging on a real phone

## Idioms

| Idiom | Form |
|---|---|
| **top-level navigation** | A top bar or a sidebar; a bottom bar only in a phone web app |
| **on/off control** | A switch (`role="switch"`) or a checkbox |
| **choice of a few** | A radio group or segmented buttons |
| **action list** | A menu or a dialog |
| **icons** | The project's icon set |
| **color and depth** | Design tokens |
| **screen transitions** | None by default; View Transitions when the direction asks for them |
| **font stack** | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |

**Web libraries.** In Motion 14.2 and later, the independent transforms (`x`, `y`, `scale`, `rotate`) are hardware-accelerated. In an earlier version, use a `transform` string, or upgrade. A transform that a CSS variable drives is not accelerated: that is the inherited-value trap of [_motion-build.md](_motion-build.md) → Performance.

**The keyboard on a phone.** `interactive-widget=resizes-content` in the viewport meta makes the on-screen keyboard resize the layout in Chrome and Firefox on Android. Safari on iOS does not support it: there, pad bottom-pinned UI from the visual viewport (`window.visualViewport`).
