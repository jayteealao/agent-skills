> **Additional context needed**: performance constraints, target devices.

Analyze a feature and strategically add animations and micro-interactions that enhance understanding, provide feedback, and create delight.

---

## Register

Brand: orchestrated page-load sequences, staggered reveals, scroll-driven animation. Motion is part of the brand voice; one well-rehearsed entrance beats scattered micro-interactions. Cinematic and theatrical motion is available and expected.

Product: 150–250 ms on most transitions. Motion conveys state — feedback, reveal, loading, transitions between views. No page-load choreography; users are in a task and won't wait for it. Functional, not decorative.

---

## Motion-first stance

Design for motion first. `@media (prefers-reduced-motion: reduce)` is the accessibility handling — it is not the design default. Users who need reduced motion get it via the media query; users who don't get the full designed experience. Do not let the reduced-motion case dictate the designed case.

Purposeful motion improves comprehension, communicates state, and expresses brand personality. "Animate sparingly" is not a design principle — it is anxiety about motion. Animate exactly as much as the experience requires, then reduce via the media query.

## Should it animate at all? (product register)

Motion-first is the *brand* default. In the **product** register the prior question is whether a given interaction should animate at all — match motion to how often a user sees it:

| Frequency | Decision |
|---|---|
| 100+ times/day (keyboard shortcuts, command-palette toggle) | **No animation. Ever.** |
| Tens/day (hover effects, list navigation) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare / first-time (onboarding, celebrations) | Can add delight |

**Never animate keyboard-initiated actions** — they repeat hundreds of times daily, and animation makes them feel slow and disconnected from the keypress. (Raycast has no open/close animation; that is the correct call for something opened hundreds of times a day.) Every animation must answer *"why does this animate?"* — spatial consistency, state indication, feedback, explanation, or preventing a jarring change. "It looks cool" on a frequently-seen product element is a reason to delete it. This gate does not apply to genuine brand surfaces, where motion is the message.

## Assess Animation Opportunities

1. **Missing feedback**: actions without visual acknowledgment (button clicks, form submission)
2. **Jarring transitions**: instant state changes that feel abrupt (show/hide, route changes)
3. **Unclear relationships**: spatial or hierarchical relationships that aren't obvious
4. **Lack of delight**: functional but joyless interactions
5. **Missed guidance**: opportunities to direct attention or explain behavior

## Plan Animation Strategy

One well-orchestrated experience beats scattered animations everywhere. Identify:
- **Hero moment**: the ONE signature animation (page load? hero? key interaction?)
- **Feedback layer**: which interactions need acknowledgment
- **Transition layer**: which state changes need smoothing
- **Delight layer**: where to surprise and delight without noise

## Implement Animations

### Entrance Animations (brand: use freely; product: use at page/view level only)
- Page load choreography: stagger element reveals (100–150 ms delays), fade + slide combinations
- Hero section: dramatic entrance for primary content (scale, parallax, or creative effects)
- Content reveals: scroll-triggered via Intersection Observer
- Modal/drawer entry: slide + fade, backdrop fade, focus management

### Micro-interactions
- Button hover: subtle scale (1.02–1.05), color shift, shadow increase
- Button click: subtle scale down on press — `transform: scale(0.96–0.97)` on `:active`, release snaps back (~150ms ease-out). Stay at `0.96–0.97`; below `0.95` reads as exaggerated. Optional ripple. Give the button component a `static` prop that turns the press-scale *off* where the motion would distract — a toolbar of rapidly-clicked controls, or a destructive action that should feel deliberate rather than springy. Not every button should bounce.
- Toggle: smooth slide + color transition (200–300 ms)
- Checkbox/radio: check mark animation, ripple effect
- Like/favorite: scale + rotation, particle effect, color transition

### State Transitions
- Show/hide: fade + slide (not instant); 200–300 ms typical
- Expand/collapse: height transition with overflow handling, icon rotation
- Loading: skeleton screen fades, spinner animations, progress bars
- Success/error: color transitions, icon animations, gentle scale pulse
- Enable/disable: opacity transitions

### Navigation and Flow
- Page transitions: crossfade between routes, shared element transitions
- Tab switching: slide indicator, content fade/slide
- Carousel: smooth transforms, snap points

### Scroll Effects (brand: use freely; product: use with restraint)
- Parallax layers
- Sticky headers with state changes
- Scroll progress indicators

## Timing and Easing

| Use case | Duration |
|---|---|
| Micro-interaction (hover, click) | 100–200 ms |
| State transition (show/hide, expand) | 200–300 ms |
| Page-level (modal, drawer) | 250–400 ms |
| Brand entrance (hero, scroll reveal) | 400–800 ms |
| Cinematic brand sequence | 800–1200 ms |

Easing:
- `ease-out` for entrances (fast start, slow finish — feels natural)
- `ease-in` for exits (slow start, fast finish — gets out of the way)
- `ease-in-out` for reversible transitions
- Custom cubic-bezier for signature brand motion
- **Never** `bounce` or `elastic` easing in production UI — it reads as cheap and unpolished
- **Never `ease-in` on an entrance or interaction** — it delays the exact frame the user is watching most and feels sluggish (`ease-out` at 200ms *feels* faster than `ease-in` at the same 200ms). Reserve `ease-in` strictly for exits that get out of the way.

The built-in CSS easings are too weak for deliberate motion — reach for strong custom curves:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);        /* strong ease-out for UI interactions */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);    /* strong ease-in-out for on-screen movement */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);     /* iOS-like drawer curve (Ionic) */
```

Find curves at [easing.dev](https://easing.dev/) or [easings.co](https://easings.co/) rather than hand-rolling from scratch.

**Asymmetric timing.** Slow the phase where the user is deciding, snap the phase where the system responds — a hold-to-delete runs slow (e.g. 2s linear) while its release returns fast (~200ms ease-out). Symmetric timing on a press-and-release or hold interaction feels wrong.

## Interruptibility

CSS **transitions** can be interrupted and retargeted mid-animation; **keyframes** restart from zero. For anything triggered rapidly (toasts being added, toggles) or gesture-driven, use transitions or springs — not keyframes. `@starting-style` animates entry without JS.

```css
.toast { transition: transform 400ms ease; }   /* interruptible — good for dynamic UI */
/* avoid for rapid/dynamic UI — restarts from zero on re-trigger: */
@keyframes slideIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
```

## Physicality — origin & scale

- **Never animate from `scale(0)`** — nothing in the real world appears from nothing. Start from `scale(0.9–0.97)` + `opacity: 0`.
- **Origin-aware popovers** — dropdowns/popovers/tooltips scale from their trigger, not center:
  ```css
  .popover { transform-origin: var(--radix-popover-content-transform-origin); } /* Radix */
  .popover { transform-origin: var(--transform-origin); }                       /* Base UI */
  ```
  **Modals are exempt** — they appear centered in the viewport; keep `transform-origin: center`.

## Springs

Springs simulate physics and have no fixed duration — they settle on their parameters and preserve velocity when interrupted, so a gesture the user reverses mid-motion stays smooth. Use them for drag-with-momentum, "alive" elements, and interruptible gestures.

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }            // Apple-style — easier to reason about
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }  // traditional physics — more control
```

Keep `bounce: 0` for product UI — that is the spring equivalent of the no-`bounce`/`elastic`-easing rule. A subtle `0.1–0.3` is reserved for playful brand interactions and drag-to-dismiss, never dashboards or data UI.

**Decorative mouse-tracking.** For an element that responds to the cursor — a card that tilts toward the pointer, a glow that trails it — don't bind the transform directly to mouse position; it feels artificial because it has no momentum. Interpolate the value through a spring (Motion's `useSpring`) so it lags and settles like a physical thing. Reserve this for genuinely *decorative* motion on an "alive" element; on a functional control or a data chart, no motion beats decorative motion.

## Icon & state micro-animations

When an icon appears, disappears, or swaps on a state change (play→pause, like→liked, a contextual toolbar action), animate it with `opacity` + `scale` + `blur` rather than toggling visibility. The values are precise — deviate and it reads as either too subtle to register or cartoonish:

- `scale`: `0.25 → 1` (not `0.5`/`0.6` — too tame to feel intentional)
- `opacity`: `0 → 1`
- `filter`: `blur(4px) → blur(0)`
- spring: `{ type: "spring", duration: 0.3, bounce: 0 }` — **bounce stays `0`** in product; this is the spring form of the no-`bounce` rule.

If the project already has `motion`/`framer-motion` in `package.json`, use that spring via `AnimatePresence`. If it does **not**, don't add the dependency for this — keep both icons in the DOM (one absolutely positioned over the other) and cross-fade them with a CSS transition on `opacity, filter, scale` using `cubic-bezier(0.2, 0, 0, 1)`; because neither icon unmounts, both the enter and the exit animate. Animate only *contextual* icons (appear on hover, change with state, live in a toolbar) — leave static navigation and decorative icons alone.

## Enter & exit choreography

Don't animate one big container in and out. **Split** the content into semantic chunks (title, description, actions) and **stagger** them ~100 ms apart; for a hero title, splitting into individual words at ~80 ms reads beautifully. Combine `opacity` + `translateY(12px → 0)` + `blur(4px → 0)` per chunk.

Exits are not enters played backwards. The user's attention is already moving on, so an exit should be **softer and faster** than its enter: a small fixed `translateY(-12px)` (not the full element height), a shorter duration (≈150 ms vs ≈300 ms), `ease-in` so it gets out of the way. Don't drop the exit entirely — an element that just vanishes loses spatial context — and don't make it dramatic, which steals focus from whatever is arriving.

**Skip the enter on first paint.** Elements already in their default state on load shouldn't animate in — only on later state changes. With Motion, `initial={false}` on `AnimatePresence` does this. The exception is a deliberate first-run entrance (a staggered hero, a loading reveal) that *relies* on its initial animation; there `initial={false}` would skip the whole entrance, so verify on a full refresh.

## Advanced motion techniques

Reach for these when a transition needs to feel engineered rather than default:

- **`clip-path: inset(t r b l)`** is an animation engine, not just a mask — each value eats in from one side. Reveal-on-scroll (`inset(0 0 100% 0)` → `inset(0 0 0 0)`), hold-to-delete fills, comparison sliders, and *seamless tab color transitions* (duplicate the label, style the copy as active, clip it on tab change — timing individual color transitions can never match it) all fall out of it, GPU-cheap.
- **`translate` percentages are relative to the element's own size** — `translateY(100%)` moves an element exactly its own height regardless of dimensions (how Sonner positions toasts, how Vaul hides a drawer before sliding it in). Prefer over hardcoded px; it adapts to content.
- **`scale()` scales children too** (font, icons, padding) — which is exactly what you want for a press state.
- **3D** — `rotateX/Y` under `transform-style: preserve-3d` gives real depth, coin-flips, and orbits with no JS.
- **`@starting-style`** animates entry with no JS mounted-flag; **WAAPI** (`element.animate([...], { duration, easing, fill })`) gives JS control at CSS performance — hardware-accelerated, interruptible, no library.
- **Mask an imperfect crossfade with blur.** When two states overlap visibly during a crossfade despite tuning easing and duration, a brief `filter: blur(2px)` blends them into one perceived transformation. Keep blur < 20px (expensive, especially in Safari).
- **Tooltips: delay the first, instant the rest.** A tooltip should delay before appearing (prevents accidental triggers), but once one is open, adjacent tooltips should open instantly with no animation — the toolbar feels faster without losing the initial guard.

## Gestures & drag

For swipe-to-dismiss, drawers, and draggable surfaces, physics beats thresholds:

- **Momentum dismissal** — don't require crossing a fixed distance; compute velocity (`Math.abs(distance) / elapsedMs`) and dismiss on a flick (`> ~0.11`) even when the distance is short.
- **Damping at boundaries** — past a natural edge, move less the further they drag; real things slow before they stop.
- **Friction over a hard wall** — allow the over-drag with rising resistance instead of an invisible stop.
- **Pointer capture** once the drag starts, so it continues when the pointer leaves the element bounds.
- **Multi-touch protection** — ignore extra touch points after the drag begins (`if (isDragging) return`), or the element jumps to the new finger.

Gesture motion must be interruptible — springs that preserve velocity, not keyframes that restart from zero (see Interruptibility and Springs above).

## Accessibility

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This handles all users who opt out of motion. Design the animated experience first; the media query is the safety net, not the template.

## Performance
- Animate only `transform` and `opacity` for GPU-composited animations (no layout thrash)
- Use `will-change` only on compositor-friendly properties (`transform`, `opacity`, `filter`, `clip-path`) and only when you actually see first-frame stutter — each layer costs GPU memory, so never `will-change: all` and never add it preemptively to every animated element
- Avoid animating `width`, `height`, `top`, `left`, `margin` — these trigger layout
- **Framer Motion shorthands (`x`/`y`/`scale`) are not hardware-accelerated** — they run on the main thread via `requestAnimationFrame` and drop frames while the page is busy loading or scripting. Use the full string form `transform: "translateX(100px)"` for any motion that plays during load
- **CSS animations beat JS under load** — CSS runs off the main thread, so predetermined motion stays smooth while rAF-driven motion stutters during a page load. Use CSS / `@starting-style` / WAAPI for predetermined motion, JS / springs for dynamic interruptible motion
- **Don't drive a child transform from a CSS variable on the parent** — changing `--swipe-amount` on a container recalculates styles for every child; set `transform` directly on the moving element instead
- Check for dropped frames on target devices before shipping complex animations

## Never
- `animation-duration: 0` as the default (design for motion, reduce via media query)
- `bounce` or `elastic` easing
- Animating layout properties (`width`, `height`, `margin`)
- Loading animations that block interaction
- Infinite background animations on the main content thread
- Gratuitous motion that doesn't serve communication, state, or brand expression

## Cohesion

Motion should match the personality of the thing it animates and the rest of the product. A playful component can be bouncier; a professional dashboard stays crisp and fast. Sonner (13M weekly downloads) feels right partly because its easing, duration, visual design — even its name — are in harmony: slightly slower than typical UI, `ease` rather than `ease-out`, to read as elegant. Choose animation values for the component's mood, not by reflex. And when you genuinely can't tell whether a motion improves the experience, the strongest move is usually to **delete it**.

## Reviewing motion before you ship

Motion bugs hide at full speed. Before calling an animation done:
- **Slow it down** — bump the duration 2–5× (or use the DevTools animation inspector) and watch: do colors crossfade cleanly, or do two states overlap? Does the easing stop abruptly? Is the `transform-origin` right? Are coordinated properties (opacity + transform + color) in sync?
- **Step frame-by-frame** (Chrome DevTools → Animations) to catch timing drift between coordinated properties.
- **Test gestures on a real device**, not just a desktop pointer — connect a phone to the dev server and feel the drag.
- **Look again the next day with fresh eyes** — imperfections invisible during development surface later.

---

> *The frequency framework, custom easing curves, interruptibility, physicality, springs, gesture physics, the `clip-path`/WAAPI techniques, cohesion, and the motion-review methodology here are adapted from Emil Kowalski's design-engineering philosophy ([animations.dev](https://animations.dev/)). The icon micro-animation values, split-and-stagger enters, subtle exits, and skip-on-load guidance are adapted from Jakub Krehel's "Details that make interfaces feel better" ([jakub.kr](https://jakub.kr/writing/details-that-make-interfaces-feel-better)). Both used under MIT license.*
